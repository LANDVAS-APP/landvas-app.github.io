-- v0.7.4 Fresh Start Event credit: Ink earned on the temporary event server (Nov 2026 outage) comes home.
--
-- The temporary server had its own accounts, so credits are matched by sign-in email. The owner chose: everything a
-- player earned there (not counting the sign-up bonus) plus 10%. The list is loaded by scripts/temp-credit.mjs
-- (run from the "Fresh Start credit" workflow, so no emails are ever written into the repo) into a private table no
-- player can read. Accounts that already exist are credited when it's loaded; anyone who only played on the
-- temporary server gets theirs the moment they sign up here with the same email. Each email is paid once.

create table if not exists private.temp_credits (
  email text primary key check (email = lower(btrim(email))),
  earned bigint not null check (earned > 0),
  ink bigint not null check (ink > 0),
  loaded_at timestamptz not null default now(),
  player_id uuid,
  credited_at timestamptz
);
alter table private.temp_credits enable row level security; -- private schema already; belt and braces

-- pay one player, if their email has a waiting credit; returns the Ink paid (0 if none)
create or replace function private.temp_credit_claim(p_uid uuid) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare r private.temp_credits%rowtype;
begin
  if p_uid is null or not exists (select 1 from public.players where id = p_uid) then return 0; end if;
  select c.* into r from private.temp_credits c join auth.users u on lower(btrim(u.email)) = c.email
   where u.id = p_uid and c.credited_at is null for update of c skip locked;
  if not found then return 0; end if;
  perform private.ledger_apply(p_uid, 'ink', r.ink, 'fresh_start_event', 'event', 'fresh-start-2026-11', 'fresh-start-2026-11:' || p_uid, null);
  update private.temp_credits set credited_at = now(), player_id = p_uid where email = r.email;
  return r.ink;
end $$;

-- pay everyone with an account; returns how many and how much
create or replace function private.temp_credit_apply_all() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int := 0; v_ink bigint := 0; v_paid bigint; u record;
begin
  for u in select au.id from private.temp_credits c join auth.users au on lower(btrim(au.email)) = c.email
            join public.players p on p.id = au.id where c.credited_at is null loop
    v_paid := private.temp_credit_claim(u.id);
    if v_paid > 0 then v_n := v_n + 1; v_ink := v_ink + v_paid; end if;
  end loop;
  return jsonb_build_object('credited_now', v_n, 'ink_now', v_ink,
    'credited_total', (select count(*) from private.temp_credits where credited_at is not null),
    'waiting_for_signup', (select count(*) from private.temp_credits where credited_at is null),
    'ink_waiting', (select coalesce(sum(ink), 0) from private.temp_credits where credited_at is null));
end $$;

-- new accounts pick up a waiting credit as soon as they're created: at the end of the sign-up, once onboarding has
-- set up the new player's balances (paying straight away would create the Ink balance first and trip onboarding)
create or replace function private.temp_credit_new_player_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    perform private.temp_credit_claim(new.id);
  exception when others then
    null; -- a credit problem must never block signing up; the next "apply all" run pays it
  end;
  return null;
end $$;
drop trigger if exists players_temp_credit on public.players;
create constraint trigger players_temp_credit after insert on public.players deferrable initially deferred
  for each row execute function private.temp_credit_new_player_trg();

revoke all on function private.temp_credit_claim(uuid), private.temp_credit_apply_all() from public, anon, authenticated;
