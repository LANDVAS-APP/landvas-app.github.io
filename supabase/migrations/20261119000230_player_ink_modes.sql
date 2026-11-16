-- Per-player Ink earnings (admin.landvas.app → a player → Manage → Ink earnings).
-- The owner can set any one player's Ink earning, live, to one of:
--   (no row)  as they are: the game-wide settings decide (Ink Flow on or off, the earning switches)
--   off       they earn no Ink at all from playing (purchases, refunds, staff grants and their own USD → Ink still work)
--   dynamic   Ink Flow (the hidden, dynamic rate) runs for them, even while it's off for everyone else
--   classic   classic Ink for them (paid in full, the old daily caps), even while Ink Flow is on for everyone else
-- What an "off" player would have earned is counted (how much, how often), so the owner sees what's held back.
-- Every change is in the audit log.

create table if not exists private.player_ink_modes (
  player_id uuid primary key references public.players (id) on delete cascade,
  mode text not null check (mode in ('off', 'dynamic', 'classic')),
  note text check (note is null or char_length(note) <= 300),
  set_by uuid references public.players (id) on delete set null,
  set_at timestamptz not null default now(),
  held bigint not null default 0,
  held_n int not null default 0,
  held_at timestamptz);
create index if not exists player_ink_modes_by on private.player_ink_modes (set_by) where set_by is not null;

/** this player's own Ink mode ('off' | 'dynamic' | 'classic'), or null to follow the game-wide settings */
create or replace function private.ink_mode(p_uid uuid) returns text language sql stable as $$
  select mode from private.player_ink_modes where player_id = p_uid
$$;

/** count what an "off" player would have earned */
create or replace function private.ink_mode_hold(p_uid uuid, p_amount bigint) returns void language sql security definer set search_path = public, pg_temp as $$
  update private.player_ink_modes set held = held + greatest(coalesce(p_amount, 0), 0), held_n = held_n + 1, held_at = now()
   where player_id = p_uid and mode = 'off'
$$;

/** the ways of earning Ink by playing (Ink a player buys, is refunded or converts from their own USD isn't "earned") */
create or replace function private.ink_earn_reasons() returns text[] language sql immutable as $$
  select array['minigame', 'referral', 'referral_welcome', 'referral_share', 'duel_win', 'pvp', 'wheel', 'daily_streak', 'room_visit', 'room_host',
               'inspire', 'inspire_given', 'challenge', 'craft', 'featured', 'sketch', 'doodle', 'duet', 'stamp_sale', 'inkborn', 'ad_reward',
               'space', 'farm', 'business', 'arcade', 'realm', 'clan', 'travel', 'finds', 'group_game', 'enchantment', 'leviathan', 'crown',
               'keeper', 'planet', 'quest', 'home', 'estate', 'landlord', 'rarity_power', 'party']
$$;

-- ---- the hidden rate follows the player's own mode --------------------------------------------------------------
select private.fn_patch('private.ink_pace(uuid,integer,text)',
  'declare c jsonb := coalesce(private.cfg(''ink_pacing''), ''{}''::jsonb);',
  'declare v_mode text; c jsonb := coalesce(private.cfg(''ink_pacing''), ''{}''::jsonb);');
select private.fn_patch('private.ink_pace(uuid,integer,text)',
  $a$  if p_amount is null or p_amount <= 0 or p_uid is null then return coalesce(p_amount, 0); end if;$a$,
  $a$  if p_amount is null or p_amount <= 0 or p_uid is null then return coalesce(p_amount, 0); end if;
  -- this player's own Ink mode (set by the owner): off pays nothing; dynamic / classic override Ink Flow for them
  v_mode := private.ink_mode(p_uid);
  if v_mode = 'off' then perform private.ink_mode_hold(p_uid, p_amount); return 0; end if;
  if v_mode = 'dynamic' then c := c || '{"enabled": true}'::jsonb; elsif v_mode = 'classic' then c := c || '{"enabled": false}'::jsonb; end if;$a$);

/** the signed-in caller, or null (never an error: background jobs and the service role have no caller) */
create or replace function private.caller_or_null() returns uuid language plpgsql stable as $$
begin
  return nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid;
exception when others then return null;
end $$;

-- the caps that only run with Ink Flow (arcade, group games) follow the playing player's own mode too
create or replace function private.ink_flow_on() returns boolean language sql stable as $$
  select coalesce(case private.ink_mode(private.caller_or_null()) when 'dynamic' then true when 'classic' then false end,
                  (private.cfg('ink_pacing') ->> 'enabled')::boolean, true)
$$;

-- the backstop: whatever path a payout takes, an "off" player's earned Ink is never credited
select private.fn_patch('private.ledger_apply(uuid,text,bigint,text,text,text,text,uuid)',
  $a$  insert into public.resource_balances (player_id, resource, amount) values (p_player, p_resource, 0)$a$,
  $a$  if p_resource = 'ink' and p_delta > 0 and p_reason = any (private.ink_earn_reasons())
     and exists (select 1 from private.player_ink_modes m where m.player_id = p_player and m.mode = 'off') then
    perform private.ink_mode_hold(p_player, p_delta);
    select amount into v_bal from public.resource_balances where player_id = p_player and resource = p_resource;
    return coalesce(v_bal, 0);
  end if;
  insert into public.resource_balances (player_id, resource, amount) values (p_player, p_resource, 0)$a$);

-- ---- admin ----------------------------------------------------------------------------------------------------------
create or replace function private.ink_mode_json(p_player uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'player_id', p_player,
    'mode', coalesce(m.mode, 'default'),
    'note', m.note, 'set_at', m.set_at, 'by', (select username from public.profiles where id = m.set_by),
    'held', coalesce(m.held, 0), 'held_n', coalesce(m.held_n, 0), 'held_at', m.held_at,
    'game_flow_on', coalesce((private.cfg('ink_pacing') ->> 'enabled')::boolean, true),
    'today', (select coalesce(sum(delta), 0) from public.resource_ledger l where l.player_id = p_player and l.resource = 'ink' and l.delta > 0
               and l.reason = any (private.ink_earn_reasons()) and l.created_at >= private.day_start(now())))
  from (select 1) one left join private.player_ink_modes m on m.player_id = p_player
$$;

create or replace function public.admin_player_ink_mode(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_admin(array['economy']);
  return private.ink_mode_json(p_player);
end $$;

/** p_mode: 'default' (follow the game), 'off', 'dynamic' or 'classic' */
create or replace function public.admin_set_player_ink_mode(p_player uuid, p_mode text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); v_was text;
begin
  if not exists (select 1 from public.players where id = p_player) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if coalesce(p_mode, '') not in ('default', 'off', 'dynamic', 'classic') then raise exception 'invalid_mode' using errcode = 'P0001'; end if;
  v_was := coalesce(private.ink_mode(p_player), 'default');
  if p_mode = 'default' then
    delete from private.player_ink_modes where player_id = p_player;
  else
    insert into private.player_ink_modes (player_id, mode, note, set_by) values (p_player, p_mode, nullif(btrim(left(coalesce(p_note, ''), 300)), ''), v_uid)
    on conflict (player_id) do update set mode = excluded.mode, note = excluded.note, set_by = excluded.set_by, set_at = now(),
      held = case when private.player_ink_modes.mode = excluded.mode then private.player_ink_modes.held else 0 end,
      held_n = case when private.player_ink_modes.mode = excluded.mode then private.player_ink_modes.held_n else 0 end;
  end if;
  perform private.audit('ink.player_mode', 'player', p_player::text, jsonb_build_object('from', v_was, 'to', p_mode, 'note', p_note));
  return private.ink_mode_json(p_player);
end $$;

/** every player with their own Ink mode */
create or replace function public.admin_ink_modes() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_admin(array['economy']);
  return (select coalesce(jsonb_agg(private.ink_mode_json(m.player_id) || jsonb_build_object('player', private.profile_json(m.player_id)) order by m.set_at desc), '[]'::jsonb)
            from private.player_ink_modes m);
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_player_ink_mode(uuid)', 'public.admin_set_player_ink_mode(uuid, text, text)', 'public.admin_ink_modes()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.caller_or_null()', 'private.ink_mode(uuid)', 'private.ink_mode_hold(uuid, bigint)', 'private.ink_earn_reasons()', 'private.ink_mode_json(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
