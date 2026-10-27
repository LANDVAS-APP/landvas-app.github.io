-- LANDVAS money-touching modules — cash-out of USD rent, optional purchases
-- ---------------------------------------------------------------------------
-- USD rent accrues for every player (see rent_* in the core migrations). This
-- migration adds the parts that move real money, all behind legally gated
-- feature flags that the admin console refuses to enable until a legal sign-off
-- is recorded (see docs/COMPLIANCE.md):
--   * cashout   — players request payout of their rent balance; an operator
--                 with the 'payouts' role reviews, pays externally (e.g. PayPal)
--                 and marks the request paid, or rejects it (funds return).
--   * payments  — optional real-money cosmetics. Plots are NEVER sold for money:
--                 plots cost Ink, and Ink is only earned by winning minigames.
-- Treasury tables let the operator reconcile rent liabilities against reserves.
-- ---------------------------------------------------------------------------

create or replace function private.require_gated(p_flag text) returns void
language plpgsql stable as $$
declare v_enabled boolean; v_signoff text;
begin
  select enabled, config ->> 'legal_signoff' into v_enabled, v_signoff from public.feature_flags where key = p_flag;
  if not coalesce(v_enabled, false) or coalesce(v_signoff, '') = '' then
    raise exception 'feature_disabled' using errcode = 'P0001', detail = p_flag;
  end if;
end $$;

-- ---- Cash-out of USD rent ------------------------------------------------------
create table public.cashout_requests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  amount_usd numeric(24, 15) not null check (amount_usd > 0),
  payout_cents bigint not null check (payout_cents > 0),
  method text not null check (method in ('paypal', 'gift_card')),
  destination text not null check (char_length(destination) between 3 and 200),
  status text not null default 'requested' check (status in ('requested', 'paid', 'rejected', 'cancelled')),
  risk_flags text[] not null default '{}',
  reviewer_id uuid,
  provider_ref text,
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index cashout_requests_status_idx on public.cashout_requests (status, created_at);
create unique index cashout_requests_one_open_idx on public.cashout_requests (player_id) where status = 'requested';
alter table public.cashout_requests enable row level security;
grant select on public.cashout_requests to authenticated;
create policy cashout_own on public.cashout_requests for select to authenticated using (player_id = auth.uid());

create or replace function public.cashout_status() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_enabled boolean; v_cfg jsonb := private.cfg('rent') -> 'cashout';
begin
  select enabled and coalesce(config ->> 'legal_signoff', '') <> '' into v_enabled from public.feature_flags where key = 'cashout';
  return jsonb_build_object(
    'enabled', coalesce(v_enabled, false),
    'minimum_usd', coalesce((v_cfg ->> 'minimum_usd')::numeric, 5),
    'methods', coalesce(v_cfg -> 'methods', '["paypal"]'::jsonb),
    'message', case when coalesce(v_enabled, false)
                    then 'Cash-out requests are reviewed by the LANDVAS team before payment.'
                    else 'Cash-out isn''t available yet. Your USD rent keeps accruing on your account.' end,
    'open_request', (select jsonb_build_object('id', id, 'amount_usd', amount_usd, 'created_at', created_at)
                     from public.cashout_requests where player_id = v_uid and status = 'requested'),
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'amount_usd', amount_usd, 'status', status,
                                                             'method', method, 'created_at', created_at, 'decided_at', decided_at)
                                          order by created_at desc)
                         from (select * from public.cashout_requests where player_id = v_uid order by created_at desc limit 20) h), '[]'::jsonb));
end $$;

-- Compatibility name used by older clients.
create or replace function public.compensation_status() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$ select public.cashout_status() $$;

create or replace function public.request_cashout(p_method text, p_destination text, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_prev jsonb; v_cfg jsonb := private.cfg('rent') -> 'cashout';
  v_bal numeric; v_cents bigint; v_amount numeric; v_id uuid; v_flags text[] := '{}'; v_res jsonb;
begin
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'request_cashout');
  if v_prev is not null then return v_prev; end if;
  perform private.require_gated('cashout');
  perform private.rate_limit('cashout', 3, 86400);
  if p_method is null or not (coalesce(v_cfg -> 'methods', '["paypal"]'::jsonb) ? p_method) then
    raise exception 'invalid_method' using errcode = 'P0001';
  end if;
  if p_destination is null or char_length(trim(p_destination)) not between 3 and 200
     or (p_method = 'paypal' and trim(p_destination) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_destination' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.cashout_requests where player_id = v_uid and status = 'requested') then
    raise exception 'cashout_pending' using errcode = 'P0001';
  end if;
  perform private.rent_settle(v_uid);
  select balance_usd into v_bal from public.rent_accounts where player_id = v_uid for update;
  if coalesce(v_bal, 0) < coalesce((v_cfg ->> 'minimum_usd')::numeric, 5) then
    raise exception 'cashout_minimum' using errcode = 'P0001', detail = coalesce(v_cfg ->> 'minimum_usd', '5');
  end if;
  v_cents := floor(v_bal * 100)::bigint;       -- whole cents are paid; the remainder keeps accruing
  v_amount := v_cents / 100.0;
  if (select created_at from public.players where id = v_uid) > now() - interval '7 days' then
    v_flags := array_append(v_flags, 'new_account');
  end if;
  if (select count(*) from private.security_events where player_id = v_uid and kind in ('gps_jump_rejected', 'gps_reanchor')) > 3 then
    v_flags := array_append(v_flags, 'location_anomalies');
  end if;
  update public.rent_accounts set balance_usd = balance_usd - v_amount, held_usd = held_usd + v_amount, updated_at = now()
  where player_id = v_uid returning balance_usd into v_bal;
  insert into public.cashout_requests (player_id, amount_usd, payout_cents, method, destination, risk_flags)
  values (v_uid, v_amount, v_cents, p_method, trim(p_destination), v_flags) returning id into v_id;
  insert into public.rent_ledger (player_id, kind, amount_usd, balance_after, ref)
  values (v_uid, 'cashout_hold', -v_amount, v_bal, v_id::text);
  v_res := jsonb_build_object('ok', true, 'request_id', v_id, 'amount_usd', v_amount, 'rent', private.rent_json(v_uid));
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

create or replace function public.cancel_cashout(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.cashout_requests%rowtype; v_bal numeric;
begin
  select * into r from public.cashout_requests where id = p_request_id and player_id = v_uid for update;
  if not found or r.status <> 'requested' then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.cashout_requests set status = 'cancelled', decided_at = now() where id = r.id;
  update public.rent_accounts set balance_usd = balance_usd + r.amount_usd, held_usd = held_usd - r.amount_usd, updated_at = now()
  where player_id = v_uid returning balance_usd into v_bal;
  insert into public.rent_ledger (player_id, kind, amount_usd, balance_after, ref) values (v_uid, 'cashout_release', r.amount_usd, v_bal, r.id::text);
  return public.cashout_status();
end $$;

-- ---- Operator side -------------------------------------------------------------
create or replace function public.admin_cashout_queue(p_status text default 'requested') returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['payouts']);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'player', private.profile_json(c.player_id), 'amount_usd', c.amount_usd, 'payout_cents', c.payout_cents,
      'method', c.method, 'destination', c.destination, 'status', c.status, 'risk_flags', to_jsonb(c.risk_flags),
      'created_at', c.created_at, 'decided_at', c.decided_at, 'provider_ref', c.provider_ref, 'note', c.note,
      'player_plots', (select count(*) from public.world_plots where owner_id = c.player_id),
      'player_since', (select created_at from public.players where id = c.player_id)) order by c.created_at)
    from public.cashout_requests c where p_status is null or c.status = p_status), '[]'::jsonb);
end $$;

-- p_decision: 'paid' (operator already sent the money; record the provider
-- reference) or 'rejected' (funds return to the player's rent balance).
create or replace function public.admin_decide_cashout(p_request_id uuid, p_decision text, p_provider_ref text default null, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['payouts']); r public.cashout_requests%rowtype; v_bal numeric;
begin
  select * into r from public.cashout_requests where id = p_request_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if r.status <> 'requested' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if r.player_id = v_uid then raise exception 'cannot_review_own' using errcode = 'P0001'; end if;
  if p_decision = 'paid' then
    if coalesce(trim(p_provider_ref), '') = '' then raise exception 'provider_ref_required' using errcode = 'P0001'; end if;
    update public.cashout_requests set status = 'paid', reviewer_id = v_uid, provider_ref = p_provider_ref, note = p_note, decided_at = now()
    where id = r.id;
    update public.rent_accounts set held_usd = held_usd - r.amount_usd, paid_usd = paid_usd + r.amount_usd, updated_at = now()
    where player_id = r.player_id returning balance_usd into v_bal;
    insert into public.rent_ledger (player_id, kind, amount_usd, balance_after, ref, actor_id)
    values (r.player_id, 'cashout_paid', 0, v_bal, r.id::text, v_uid);
  elsif p_decision = 'rejected' then
    update public.cashout_requests set status = 'rejected', reviewer_id = v_uid, note = p_note, decided_at = now() where id = r.id;
    update public.rent_accounts set balance_usd = balance_usd + r.amount_usd, held_usd = held_usd - r.amount_usd, updated_at = now()
    where player_id = r.player_id returning balance_usd into v_bal;
    insert into public.rent_ledger (player_id, kind, amount_usd, balance_after, ref, actor_id)
    values (r.player_id, 'cashout_release', r.amount_usd, v_bal, r.id::text, v_uid);
  else
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  perform private.audit('cashout.' || p_decision, 'cashout', r.id::text,
                        jsonb_build_object('player', r.player_id, 'amount_usd', r.amount_usd, 'provider_ref', p_provider_ref, 'note', p_note));
  return public.admin_cashout_queue('requested');
end $$;

-- Correct a player's rent balance (fraud reversal, support credit). Audited.
create or replace function public.admin_adjust_rent(p_player_id uuid, p_delta_usd numeric, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy', 'payouts']); v_bal numeric;
begin
  if p_reason is null or char_length(trim(p_reason)) < 4 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if abs(p_delta_usd) > 100 then raise exception 'adjustment_too_large' using errcode = 'P0001'; end if;
  perform private.rent_settle(p_player_id);
  update public.rent_accounts set balance_usd = balance_usd + p_delta_usd,
         lifetime_usd = greatest(lifetime_usd + p_delta_usd, 0), updated_at = now()
  where player_id = p_player_id and balance_usd + p_delta_usd >= 0
  returning balance_usd into v_bal;
  if not found then raise exception 'insufficient_funds' using errcode = 'P0001', detail = 'usd'; end if;
  insert into public.rent_ledger (player_id, kind, amount_usd, balance_after, ref, actor_id)
  values (p_player_id, 'adjustment', p_delta_usd, v_bal, left(p_reason, 200), v_uid);
  perform private.audit('rent.adjust', 'player', p_player_id::text, jsonb_build_object('delta_usd', p_delta_usd, 'reason', p_reason));
  return private.rent_json(p_player_id);
end $$;

-- ---- Treasury: reconcile what is owed against what is held -----------------------
create table private.funding_sources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ad_revenue', 'sponsorship', 'platform_reserve', 'other')),
  description text not null,
  amount_cents bigint not null check (amount_cents > 0),
  received_at timestamptz not null,
  evidence_ref text not null,
  created_at timestamptz not null default now()
);

create table private.reserve_snapshots (
  id bigint generated always as identity primary key,
  total_liabilities_usd numeric(24, 15) not null,
  total_reserves_cents bigint not null,
  taken_at timestamptz not null default now()
);

-- ---- Optional real-money cosmetics (web payments / platform IAP) -----------------
create table public.store_products (
  sku text primary key check (sku ~ '^[a-z0-9_.-]{3,64}$'),
  kind text not null check (kind in ('cosmetic', 'pigment_pack')),
  name text not null,
  description text not null default '',
  price_usd_cents int not null check (price_usd_cents > 0),
  platform_product_ids jsonb not null default '{}'::jsonb,
  grants jsonb not null default '{}'::jsonb check (not (grants ? 'ink')),
  active boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.store_products enable row level security;

create table private.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  sku text not null references public.store_products(sku),
  platform text not null check (platform in ('web', 'ios', 'android')),
  status text not null default 'created' check (status in ('created', 'paid', 'fulfilled', 'refunded', 'chargeback', 'failed')),
  provider text,
  provider_ref text,
  amount_cents int not null,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref)
);

create table private.purchase_receipts (
  id bigint generated always as identity primary key,
  order_id uuid not null references private.purchase_orders(id) on delete cascade,
  payload jsonb not null,
  verified boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---- Privileges for everything defined in this migration ------------------------
revoke all on all tables in schema private from public;
do $$
declare f text;
begin
  foreach f in array array[
    'public.cashout_status()', 'public.compensation_status()', 'public.request_cashout(text, text, text)',
    'public.cancel_cashout(uuid)', 'public.admin_cashout_queue(text)', 'public.admin_decide_cashout(uuid, text, text, text)',
    'public.admin_adjust_rent(uuid, numeric, text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
revoke all on function private.require_gated(text) from public;
