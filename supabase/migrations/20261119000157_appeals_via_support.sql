-- Appeals go through support. A banned or suspended player can't do anything else in the game, but they can open an
-- appeal ticket (and read and answer it). Their ticket lands in Admin → Support like any other, marked "Appeal".

alter table public.support_tickets drop constraint if exists support_tickets_category_check;
alter table public.support_tickets add constraint support_tickets_category_check
  check (category in ('account', 'bug', 'payments', 'minigames', 'art', 'report', 'copyright', 'privacy', 'other', 'appeal'));

/** any signed-up player, restricted or not (for appeals only) */
create or replace function private.require_player_any() returns uuid language plpgsql as $$
declare v_uid uuid := private.uid();
begin
  if v_uid is null or not exists (select 1 from public.players where id = v_uid) then raise exception 'onboarding_required' using errcode = 'P0001'; end if;
  return v_uid;
end $$;
/** true when the player is suspended or banned right now */
create or replace function private.is_restricted(p_uid uuid) returns boolean language sql stable as $$
  select exists (select 1 from public.players where id = p_uid
                 and (status = 'banned' or (status = 'suspended' and coalesce(suspended_until, 'infinity') > now())))
$$;

do $$
declare d text; n text;
begin
  -- creating a ticket: restricted players may only appeal
  d := pg_get_functiondef('public.support_create(text,text,text)'::regprocedure);
  n := replace(d, 'v_uid uuid := private.require_active_player();', 'v_uid uuid := private.require_player_any();');
  n := replace(n, $a$  perform private.rate_limit('support_create', 8, 86400);$a$, $a$  perform private.rate_limit('support_create', 8, 86400);
  if private.is_restricted(v_uid) then
    if exists (select 1 from public.support_tickets where player_id = v_uid and category = 'appeal' and status <> 'closed') then
      raise exception 'appeal_open' using errcode = 'P0001';
    end if;
    p_category := 'appeal';
  end if;$a$);
  if position('require_player_any' in n) = 0 or position('appeal_open' in n) = 0 then raise exception 'appeals: support_create anchors not found'; end if;
  execute n;
  d := pg_get_functiondef('public.support_my_tickets()'::regprocedure);
  n := replace(d, 'v_uid uuid := private.require_active_player();', 'v_uid uuid := private.require_player_any();');
  if n = d then raise exception 'appeals: support_my_tickets anchor not found'; end if;
  execute n;
  -- replying: restricted players only on their appeal
  d := pg_get_functiondef('public.support_reply(uuid,text)'::regprocedure);
  n := replace(d, 'v_uid uuid := private.require_active_player();', 'v_uid uuid := private.require_player_any();');
  n := replace(n, $a$  v_mine := found and v_t.player_id = v_uid;$a$, $a$  v_mine := found and v_t.player_id = v_uid;
  if v_mine and v_t.category <> 'appeal' and private.is_restricted(v_uid) then raise exception 'account_restricted' using errcode = 'P0001'; end if;$a$);
  if position('require_player_any' in n) = 0 or position('v_t.category <> ''appeal''' in n) = 0 then raise exception 'appeals: support_reply anchors not found'; end if;
  execute n;
end $$;

-- the restriction notice tells the app about their appeal (instead of an email address)
create or replace function public.my_restriction() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid(); pl public.players; a public.integrity_actions; c jsonb := private.cfg('integrity'); t public.support_tickets;
begin
  if v_uid is null then return null; end if;
  select * into pl from public.players where id = v_uid;
  if not found then return null; end if;
  select * into a from public.integrity_actions where player_id = v_uid and undone_at is null order by created_at desc limit 1;
  if pl.status = 'active' and (a.id is null or a.kind <> 'warn' or a.created_at < now() - interval '7 days') then return null; end if;
  select * into t from public.support_tickets where player_id = v_uid and category = 'appeal' order by created_at desc limit 1;
  return jsonb_build_object('status', case when pl.status = 'active' then 'warned' else pl.status end, 'until', pl.suspended_until,
    'reason', coalesce(a.reason, pl.suspension_reason),
    'title', (select p ->> 'label' from jsonb_array_elements(coalesce(c -> 'presets', '[]'::jsonb)) p where p ->> 'id' = a.preset),
    'proof', coalesce(a.proof, '[]'::jsonb), 'at', a.created_at, 'ink_removed', coalesce(a.ink_removed, 0), 'plots_removed', coalesce(jsonb_array_length(a.plots_removed), 0),
    'appeal', case when t.id is not null then jsonb_build_object('id', t.id, 'status', t.status, 'created_at', t.created_at) end);
end $$;

revoke all on function private.require_player_any() from public, anon, authenticated;
revoke all on function private.is_restricted(uuid) from public, anon, authenticated;
