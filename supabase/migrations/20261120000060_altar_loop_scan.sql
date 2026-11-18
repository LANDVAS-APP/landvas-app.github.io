-- Fair play: the Altar loop scanner, and taking back what it gave.
--
-- The loop (closed in 20261120000050_altar_once_plaque_titles, live 2026-11-18 06:01 UTC): a plot laid on the Altar of
-- Luck went back to the world with its rarity, so buying the same cell back (100 Ink) brought the same ultra back to lay
-- on the altar again for full Luck, and that Luck went into the next claim (extra rolls, ultras far likelier).
--
-- Every plot sacrifice is in plot_ownership (release_reason 'sacrificed for luck') and what it gave is in the feed
-- (kind 'luck', sub 'sacrifice', what 'plot'), written in the same moment. A sacrifice is a REPEAT when that cell had
-- been laid on the altar before: by the same player (bought back) or by someone else (a plot passed round a clan).
-- The Luck repeats gave was spent on claims (luck_choices: every roll, the one kept, the plot's own roll).
--
-- Staff (admin.landvas.app → Fair play → Altar loop) can, for each player:
--   * take back Luck they still hold, any amount up to what their repeats gave (undoable);
--   * put the plots that Luck rolled back to a lower tier, or take them away (the egg loop's tools, same fix log);
--   * take back a share (1–100%) of what those plots earned: Ink from games on them and USD rent, then plots bought
--     with Ink since the first repeat, and the rest owed from the Ink they earn next (undoable).
-- Players with 2+ repeats get an "Altar loop" signal in the risk scanner.

/** when the fix went live: from then on a sacrificed cell came back Common */
create or replace function private.altar_fix_at() returns timestamptz language sql immutable as $$ select timestamptz '2026-11-18 06:01:07+00' $$;

-- finding the cell's earlier sacrifices without reading every release
create index if not exists plot_ownership_altar_idx on public.plot_ownership (gx, gy, released_at) where release_reason = 'sacrificed for luck';

-- ---- the loop -------------------------------------------------------------------------------------------------------
/** every plot the player laid on the altar: the cell, when, what it was, the Luck it gave, and whether the cell had been
    laid on the altar before (and by whom) */
create or replace function private.altar_sacrifices(p_uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare c jsonb := private.cfg('luck');
begin
  return (select coalesce(jsonb_agg(z.j order by z.at), '[]'::jsonb) from (
    select o.released_at at, jsonb_build_object('gx', o.gx, 'gy', o.gy, 'at', o.released_at,
        'rarity', k.rarity, 'shiny', coalesce((f.data ->> 'shiny')::boolean, false),
        'gained', coalesce((f.data ->> 'gained')::int,
                           (c -> 'plot' ->> case when coalesce((select r.ppm from public.plot_rarities r where r.id = k.rarity), 0) > 0 then 'ultra' else k.rarity end)::int, 0),
        'repeat', pr.at is not null, 'after_self', coalesce(pr.player_id = p_uid, false), 'after_at', pr.at,
        'after', case when pr.player_id is not null and pr.player_id <> p_uid then private.profile_json(pr.player_id) end) j
      from public.plot_ownership o
      left join lateral (select fe.data from public.feed_events fe
                          where fe.player_id = o.player_id and fe.kind = 'luck' and fe.created_at = o.released_at
                            and fe.data ->> 'sub' = 'sacrifice' and fe.data ->> 'what' = 'plot' limit 1) f on true
      left join lateral (select o2.player_id, o2.released_at at from public.plot_ownership o2
                          where o2.gx = o.gx and o2.gy = o.gy and o2.release_reason = 'sacrificed for luck' and o2.released_at < o.released_at
                          order by o2.released_at desc limit 1) pr on true
      cross join lateral (select coalesce(f.data ->> 'rarity', (select a.rarity from private.altar_cells a where a.gx = o.gx and a.gy = o.gy), 'common') rarity) k
     where o.player_id = p_uid and o.release_reason = 'sacrificed for luck'
  ) z);
end $$;

-- Luck staff took back (undoable)
create table if not exists private.altar_loop_luck (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  amount int not null check (amount > 0),
  reason text not null,
  admin_id uuid,
  created_at timestamptz not null default now(),
  undone_at timestamptz, undone_by uuid
);
create index if not exists altar_loop_luck_player_idx on private.altar_loop_luck (player_id, id desc);
revoke all on private.altar_loop_luck from public, anon, authenticated;

/** the numbers: sacrifices, repeats (of their own plot or someone else's), the Luck repeats gave, and when */
create or replace function private.altar_loop_stats(p_uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s jsonb := private.altar_sacrifices(p_uid);
begin
  return (select jsonb_build_object(
      'sacrificed', count(*)::int,
      'repeats', count(*) filter (where (x ->> 'repeat')::boolean)::int,
      'repeats_self', count(*) filter (where (x ->> 'after_self')::boolean)::int,
      'repeats_other', count(*) filter (where (x ->> 'repeat')::boolean and not (x ->> 'after_self')::boolean)::int,
      'cells', count(distinct (x ->> 'gx') || ',' || (x ->> 'gy')) filter (where (x ->> 'repeat')::boolean)::int,
      'luck_from_repeats', coalesce(sum((x ->> 'gained')::int) filter (where (x ->> 'repeat')::boolean), 0)::int,
      'luck_from_plots', coalesce(sum((x ->> 'gained')::int), 0)::int,
      'first_at', min((x ->> 'at')::timestamptz) filter (where (x ->> 'repeat')::boolean),
      'last_at', max((x ->> 'at')::timestamptz) filter (where (x ->> 'repeat')::boolean),
      'peak_day', coalesce((select max(n) from (select count(*) n from jsonb_array_elements(s) y where (y ->> 'repeat')::boolean
                                                group by ((y ->> 'at')::timestamptz at time zone 'UTC')::date) d), 0)::int,
      'luck_now', coalesce((select l.luck from public.player_luck l where l.player_id = p_uid), 0),
      'luck_taken', coalesce((select sum(t.amount) from private.altar_loop_luck t where t.player_id = p_uid and t.undone_at is null), 0)::int)
    from jsonb_array_elements(s) x);
end $$;

/** the plots they claimed with Luck (the egg loop's view of them), each marked when a repeat came since their claim before:
    the Luck it spent came (at least partly) from the loop */
create or replace function private.altar_loop_plots(p_uid uuid, p_since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_rep timestamptz[];
begin
  select coalesce(array_agg((x ->> 'at')::timestamptz), '{}') into v_rep
    from jsonb_array_elements(private.altar_sacrifices(p_uid)) x where (x ->> 'repeat')::boolean;
  return (select coalesce(jsonb_agg(p.v || jsonb_build_object('from_repeat', exists (
             select 1 from unnest(v_rep) r(at)
              where r.at <= (p.v ->> 'rolled_at')::timestamptz
                and r.at > coalesce((select max(l.created_at) from public.luck_choices l where l.player_id = p_uid and l.created_at < (p.v ->> 'rolled_at')::timestamptz), '-infinity'::timestamptz)))
           order by p.n), '[]'::jsonb)
    from jsonb_array_elements(private.egg_loop_plots(p_uid, p_since)) with ordinality p(v, n));
end $$;

/** everyone who laid a cell on the altar that had been laid there before */
create or replace function public.admin_altar_loop_scan(p_min int default 1) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy']);
begin
  return jsonb_build_object('fixed_at', private.altar_fix_at(), 'rows', coalesce((
    select jsonb_agg(r.j order by r.repeats desc, r.luck desc) from (
      select (c.st ->> 'repeats')::int repeats, (c.st ->> 'luck_from_repeats')::int luck,
        jsonb_build_object('player', private.profile_json(c.player_id), 'email', u.email, 'status', pl.status, 'stats', c.st,
          'rolls', (select jsonb_build_object('n', count(*),
                     'improved', count(*) filter (where (p ->> 'in_window')::boolean and (p ->> 'improved')::boolean),
                     'ultras', count(*) filter (where (p ->> 'in_window')::boolean and (p ->> 'improved')::boolean and (p ->> 'ultra')::boolean),
                     'open', count(*) filter (where (p ->> 'in_window')::boolean and (p ->> 'improved')::boolean and (p ->> 'theirs')::boolean and jsonb_typeof(p -> 'fix') = 'null'),
                     'fixed', count(*) filter (where jsonb_typeof(p -> 'fix') = 'object'))
                    from jsonb_array_elements(private.altar_loop_plots(c.player_id, (c.st ->> 'first_at')::timestamptz)) p)) j
      from (select x.player_id, private.altar_loop_stats(x.player_id) st from (
              select distinct o.player_id from public.plot_ownership o
               where o.release_reason = 'sacrificed for luck'
                 and exists (select 1 from public.plot_ownership o2 where o2.gx = o.gx and o2.gy = o.gy
                               and o2.release_reason = 'sacrificed for luck' and o2.released_at < o.released_at)) x) c
      join public.players pl on pl.id = c.player_id left join auth.users u on u.id = c.player_id
      where (c.st ->> 'repeats')::int >= greatest(coalesce(p_min, 1), 1)
    ) r), '[]'::jsonb));
end $$;

create table if not exists private.altar_loop_reversals (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  mode text not null check (mode in ('all', 'extra')),
  share int not null default 100 check (share between 1 and 100),
  plots jsonb not null,
  ink_games bigint not null default 0,
  usd numeric(24, 15) not null default 0,
  usd_taken numeric(24, 15) not null default 0, usd_as_ink bigint not null default 0,
  ink_taken bigint not null default 0, plots_removed jsonb not null default '[]'::jsonb, plots_ink bigint not null default 0, debt bigint not null default 0,
  reason text not null, admin_id uuid, created_at timestamptz not null default now(), undone_at timestamptz, undone_by uuid
);
create index if not exists altar_loop_reversals_player_idx on private.altar_loop_reversals (player_id, id desc);
revoke all on private.altar_loop_reversals from public, anon, authenticated;

/** one player: the numbers, every sacrifice, the repeats day by day, the plots their Luck rolled, and what was done */
create or replace function public.admin_altar_loop_player(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy']); st jsonb; s jsonb;
begin
  if not exists (select 1 from public.players where id = p_player) then raise exception 'not_found' using errcode = 'P0001'; end if;
  st := private.altar_loop_stats(p_player);
  s := private.altar_sacrifices(p_player);
  return jsonb_build_object('player', private.profile_json(p_player), 'email', (select email from auth.users where id = p_player),
    'stats', st, 'fixed_at', private.altar_fix_at(), 'sacrifices', s,
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'repeats', n, 'luck', g) order by d), '[]'::jsonb) from (
               select ((x ->> 'at')::timestamptz at time zone 'UTC')::date d, count(*)::int n, coalesce(sum((x ->> 'gained')::int), 0)::int g
                 from jsonb_array_elements(s) x where (x ->> 'repeat')::boolean group by 1) z),
    'plots', private.altar_loop_plots(p_player, (st ->> 'first_at')::timestamptz),
    'luck', jsonb_build_object('now', (st ->> 'luck_now')::int, 'from_repeats', (st ->> 'luck_from_repeats')::int, 'taken', (st ->> 'luck_taken')::int,
              'can_take', greatest(0, least((st ->> 'luck_now')::int, (st ->> 'luck_from_repeats')::int - (st ->> 'luck_taken')::int))),
    'luck_takes', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'amount', t.amount, 'reason', t.reason, 'at', t.created_at,
                     'by', (select username from public.profiles where id = t.admin_id), 'undone_at', t.undone_at) order by t.id desc), '[]'::jsonb)
                     from private.altar_loop_luck t where t.player_id = p_player),
    'fixes', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'gx', f.gx, 'gy', f.gy, 'action', f.action, 'from', f.from_rarity, 'from_shiny', f.from_shiny,
                'to', f.to_rarity, 'to_shiny', f.to_shiny, 'reason', f.reason, 'at', f.created_at, 'by', (select username from public.profiles where id = f.admin_id),
                'undone_at', f.undone_at) order by f.id desc), '[]'::jsonb) from private.egg_loop_fixes f where f.player_id = p_player),
    'reversals', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'mode', v.mode, 'share', v.share, 'plots', jsonb_array_length(v.plots), 'ink_games', v.ink_games, 'usd', v.usd,
                'usd_taken', v.usd_taken, 'usd_as_ink', v.usd_as_ink, 'ink_taken', v.ink_taken, 'plots_removed', v.plots_removed, 'plots_ink', v.plots_ink, 'debt', v.debt,
                'reason', v.reason, 'at', v.created_at, 'by', (select username from public.profiles where id = v.admin_id), 'undone_at', v.undone_at) order by v.id desc), '[]'::jsonb)
                from private.altar_loop_reversals v where v.player_id = p_player),
    'owed', coalesce((select owed from private.ink_debts where player_id = p_player), 0),
    'tiers', (select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'ultra', coalesce(r.ppm, 0) > 0) order by private.plot_rarity_rank(r.id))
                from public.plot_rarities r where r.id not like 'crown%' and r.id <> 'enchanted'),
    'can_fix', private.has_role(v_uid, array['economy']), 'can_take', private.has_role(v_uid, array['economy']) and private.has_role(v_uid, array['moderator']));
end $$;

-- ---- taking it back -------------------------------------------------------------------------------------------------
/** take back Luck they still hold: any amount, up to what their repeats gave (less what was taken already) */
create or replace function public.admin_altar_loop_take_luck(p_player uuid, p_amount int, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); st jsonb; v_now int; v_take int;
begin
  if p_reason is null or char_length(trim(p_reason)) < 4 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if p_player = v_uid then raise exception 'cannot_moderate_self' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount < 1 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  select luck into v_now from public.player_luck where player_id = p_player for update;
  st := private.altar_loop_stats(p_player);
  v_take := least(p_amount, coalesce(v_now, 0), greatest(0, (st ->> 'luck_from_repeats')::int - (st ->> 'luck_taken')::int));
  if v_take < 1 then raise exception 'nothing_to_take' using errcode = 'P0001'; end if;
  update public.player_luck set luck = luck - v_take, updated_at = now() where player_id = p_player;
  insert into private.altar_loop_luck (player_id, amount, reason, admin_id) values (p_player, v_take, trim(p_reason), v_uid);
  perform private.audit('altar_loop.luck', 'player', p_player::text, jsonb_build_object('luck', v_take, 'asked', p_amount, 'reason', trim(p_reason)));
  return public.admin_altar_loop_player(p_player) || jsonb_build_object('taken', v_take);
end $$;

/** give Luck taken back again */
create or replace function public.admin_altar_loop_luck_undo(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); t private.altar_loop_luck;
begin
  select * into t from private.altar_loop_luck where id = p_id for update;
  if not found or t.undone_at is not null then raise exception 'not_found' using errcode = 'P0001'; end if;
  insert into public.player_luck (player_id) values (t.player_id) on conflict (player_id) do nothing;
  update public.player_luck set luck = least(luck + t.amount, 1000), updated_at = now() where player_id = t.player_id;
  update private.altar_loop_luck set undone_at = now(), undone_by = v_uid where id = t.id;
  perform private.audit('altar_loop.luck_undo', 'player', t.player_id::text, jsonb_build_object('luck', t.amount, 'take', t.id));
  return public.admin_altar_loop_player(t.player_id);
end $$;

/** put the plots their Luck rolled back to a lower tier (by default the plot's own roll) or take them away. Same rules and
    the same fix log as the egg loop's (a plot's Luck fix shows on both scanners). */
create or replace function public.admin_altar_loop_fix(p_player uuid, p_plots jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); it jsonb; w public.world_plots; l public.luck_choices; v_act text; v_to text; v_shiny boolean;
  v_nat text; v_out jsonb := '[]'::jsonb; v_done int := 0;
begin
  if p_reason is null or char_length(trim(p_reason)) < 4 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if p_player = v_uid then raise exception 'cannot_moderate_self' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_plots) is distinct from 'array' or jsonb_array_length(p_plots) = 0 then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_plots) > 500 then raise exception 'too_many_plots' using errcode = 'P0001'; end if;
  for it in select value from jsonb_array_elements(p_plots) loop
    v_act := it ->> 'action';
    if v_act is null or v_act not in ('downgrade', 'take') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    if v_act = 'take' and not private.has_role(v_uid, array['moderator']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
    select * into w from public.world_plots where gx = (it ->> 'gx')::int and gy = (it ->> 'gy')::int for update;
    if not found or w.owner_id is distinct from p_player then
      v_out := v_out || jsonb_build_object('gx', it -> 'gx', 'gy', it -> 'gy', 'ok', false, 'why', 'not_theirs'); continue;
    end if;
    select * into l from public.luck_choices where player_id = p_player and gx = w.gx and gy = w.gy;
    if v_act = 'downgrade' then
      v_to := coalesce(nullif(it ->> 'rarity', ''), l.options ->> 0);
      if v_to is null or v_to like 'crown%' or not exists (select 1 from public.plot_rarities where id = v_to) then raise exception 'invalid_rarity' using errcode = 'P0001'; end if;
      if private.plot_rarity_rank(v_to) >= private.plot_rarity_rank(w.rarity) then
        v_out := v_out || jsonb_build_object('gx', w.gx, 'gy', w.gy, 'ok', false, 'why', 'not_lower'); continue;
      end if;
      v_shiny := w.shiny and coalesce((l.shinies ->> 0)::boolean, w.shiny);
      perform private.rent_settle(p_player);
      update public.world_plots set rarity = v_to, shiny = v_shiny, updated_at = now() where gx = w.gx and gy = w.gy;
      insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', w.gx, w.gy, w.gx, w.gy);
      insert into private.egg_loop_fixes (player_id, gx, gy, action, from_rarity, from_shiny, to_rarity, to_shiny, reason, admin_id)
      values (p_player, w.gx, w.gy, 'downgrade', w.rarity, w.shiny, v_to, v_shiny, trim(p_reason), v_uid);
      perform private.audit('altar_loop.downgrade', 'player', p_player::text, jsonb_build_object('gx', w.gx, 'gy', w.gy, 'from', w.rarity, 'to', v_to, 'shiny', v_shiny, 'reason', trim(p_reason)));
    else
      perform public.admin_release_plot(w.gx, w.gy, trim(p_reason));
      v_nat := private.plot_rarity_for(w.gx, w.gy);
      if v_nat like 'crown%' then v_nat := 'common'; end if;
      update public.world_plots set rarity = v_nat, shiny = false, updated_at = now() where gx = w.gx and gy = w.gy and owner_id is null;
      insert into private.egg_loop_fixes (player_id, gx, gy, action, from_rarity, from_shiny, reason, admin_id)
      values (p_player, w.gx, w.gy, 'take', w.rarity, w.shiny, trim(p_reason), v_uid);
      perform private.audit('altar_loop.take', 'player', p_player::text, jsonb_build_object('gx', w.gx, 'gy', w.gy, 'rarity', w.rarity, 'shiny', w.shiny, 'reason', trim(p_reason)));
    end if;
    update public.luck_choices set picked = coalesce(picked, best, 0) where player_id = p_player and gx = w.gx and gy = w.gy and picked is null;
    v_done := v_done + 1;
    v_out := v_out || jsonb_build_object('gx', w.gx, 'gy', w.gy, 'ok', true, 'action', v_act, 'from', w.rarity, 'to', case when v_act = 'downgrade' then v_to end);
  end loop;
  return public.admin_altar_loop_player(p_player) || jsonb_build_object('done', v_done, 'results', v_out);
end $$;

/** put a downgraded plot back as it was (only while it's still theirs and still the tier it was put to) */
create or replace function public.admin_altar_loop_undo(p_fix bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); f private.egg_loop_fixes; w public.world_plots;
begin
  select * into f from private.egg_loop_fixes where id = p_fix for update;
  if not found or f.undone_at is not null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if f.action <> 'downgrade' then raise exception 'cannot_undo' using errcode = 'P0001'; end if;
  select * into w from public.world_plots where gx = f.gx and gy = f.gy for update;
  if w.owner_id is distinct from f.player_id or w.rarity is distinct from f.to_rarity then raise exception 'plot_changed' using errcode = 'P0001'; end if;
  perform private.rent_settle(f.player_id);
  update public.world_plots set rarity = f.from_rarity, shiny = f.from_shiny, updated_at = now() where gx = f.gx and gy = f.gy;
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', f.gx, f.gy, f.gx, f.gy);
  update private.egg_loop_fixes set undone_at = now(), undone_by = v_uid where id = f.id;
  perform private.audit('altar_loop.undo', 'player', f.player_id::text, jsonb_build_object('gx', f.gx, 'gy', f.gy, 'back_to', f.from_rarity, 'fix', f.id));
  return public.admin_altar_loop_player(f.player_id);
end $$;

/** take back a share (1–100%) of what those plots earned (the egg loop's rules: USD from the USD balance, USD already
    converted or cashed out as Ink; Ink from the balance, then plots bought with Ink since the first repeat, newest first;
    the rest owed from the Ink they earn next) */
create or replace function public.admin_altar_loop_reverse(p_player uuid, p_plots jsonb, p_mode text, p_share int, p_reason text, p_preview boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); e jsonb; st jsonb; v_bal numeric; v_usd numeric; v_usd_take numeric; v_usd_ink bigint; v_target bigint;
  v_ibal bigint; v_take bigint; v_short bigint; v_plots jsonb := '[]'::jsonb; v_pink bigint := 0; v_since timestamptz; r record; v_games bigint;
  v_debt bigint; v_id bigint; pl jsonb; v_rate numeric := greatest(coalesce((private.cfg('rent') -> 'convert' ->> 'ink_per_usd')::numeric, 100), 1); v_nat text;
  v_out jsonb; v_share int := coalesce(p_share, 100);
begin
  if p_mode is null or p_mode not in ('all', 'extra') or v_share < 1 or v_share > 100 then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  if not coalesce(p_preview, false) then
    if p_reason is null or char_length(trim(p_reason)) < 4 then raise exception 'reason_required' using errcode = 'P0001'; end if;
    if not private.has_role(v_uid, array['moderator']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  end if;
  if p_player = v_uid then raise exception 'cannot_moderate_self' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_plots) is distinct from 'array' or jsonb_array_length(p_plots) = 0 then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  st := private.altar_loop_stats(p_player);
  e := private.egg_loop_earnings(p_player, p_plots, p_mode);
  if not coalesce(p_preview, false) then perform private.rent_settle(p_player); end if;
  select coalesce(balance_usd, 0) into v_bal from public.rent_accounts where player_id = p_player;
  v_games := floor((e ->> 'ink_games')::bigint * v_share / 100.0)::bigint;
  v_usd := round((e ->> 'usd')::numeric * v_share / 100.0, 15);
  v_usd_take := least(coalesce(v_bal, 0), v_usd);
  v_usd_ink := ceil((v_usd - v_usd_take) * v_rate)::bigint;
  v_target := v_games + v_usd_ink;
  select coalesce((select amount from public.resource_balances where player_id = p_player and resource = 'ink'), 0) into v_ibal;
  v_take := least(v_ibal, v_target); v_short := v_target - v_take;
  v_since := (st ->> 'first_at')::timestamptz;
  if v_short > 0 then
    for r in select o.gx, o.gy, o.acquired_at, coalesce((o.cost ->> 'ink')::bigint, 0) ink, w.rarity
               from public.plot_ownership o join public.world_plots w on w.gx = o.gx and w.gy = o.gy and w.owner_id = p_player
              where o.player_id = p_player and o.released_at is null and o.method in ('acquire', 'purchase') and coalesce((o.cost ->> 'ink')::bigint, 0) > 0
                and (v_since is null or o.acquired_at >= v_since)
              order by o.acquired_at desc loop
      exit when v_pink >= v_short;
      continue when r.ink > v_short - v_pink;
      v_plots := v_plots || jsonb_build_object('gx', r.gx, 'gy', r.gy, 'rarity', r.rarity, 'ink', r.ink, 'at', r.acquired_at);
      v_pink := v_pink + r.ink;
    end loop;
  end if;
  v_debt := greatest(0, v_short - v_pink);
  v_out := jsonb_build_object('mode', p_mode, 'share', v_share, 'earnings', e, 'ink_games', v_games, 'usd', v_usd, 'usd_balance', coalesce(v_bal, 0), 'usd_taken', v_usd_take,
    'usd_as_ink', v_usd_ink, 'ink_rate', v_rate, 'ink_target', v_target, 'ink_balance', v_ibal, 'ink_taken', v_take, 'plots', v_plots, 'plots_ink', v_pink, 'debt', v_debt,
    'owed_now', coalesce((select owed from private.ink_debts where player_id = p_player), 0));
  if coalesce(p_preview, false) then return v_out; end if;

  if v_usd_take > 0 then
    update public.rent_accounts set balance_usd = balance_usd - v_usd_take, updated_at = now() where player_id = p_player returning balance_usd into v_bal;
    insert into public.rent_ledger (player_id, kind, amount_usd, balance_after, ref, actor_id) values (p_player, 'adjustment', -v_usd_take, v_bal, 'altar_loop', v_uid);
  end if;
  if v_take > 0 then perform private.ledger_apply(p_player, 'ink', -v_take, 'altar_loop_reversal', 'altar_loop', null, null, v_uid); end if;
  for pl in select value from jsonb_array_elements(v_plots) loop
    perform public.admin_release_plot((pl ->> 'gx')::int, (pl ->> 'gy')::int, 'Altar loop: ' || left(trim(p_reason), 200));
    if exists (select 1 from public.luck_choices where player_id = p_player and gx = (pl ->> 'gx')::int and gy = (pl ->> 'gy')::int) then
      v_nat := private.plot_rarity_for((pl ->> 'gx')::int, (pl ->> 'gy')::int);
      if v_nat like 'crown%' then v_nat := 'common'; end if;
      update public.world_plots set rarity = v_nat, shiny = false, updated_at = now() where gx = (pl ->> 'gx')::int and gy = (pl ->> 'gy')::int and owner_id is null;
      update public.luck_choices set picked = coalesce(picked, best, 0) where player_id = p_player and gx = (pl ->> 'gx')::int and gy = (pl ->> 'gy')::int and picked is null;
    end if;
  end loop;
  if v_debt > 0 then
    insert into private.ink_debts (player_id, owed, reason) values (p_player, v_debt, 'altar_loop')
    on conflict (player_id) do update set owed = private.ink_debts.owed + excluded.owed, reason = excluded.reason, updated_at = now();
  end if;
  insert into private.altar_loop_reversals (player_id, mode, share, plots, ink_games, usd, usd_taken, usd_as_ink, ink_taken, plots_removed, plots_ink, debt, reason, admin_id)
  values (p_player, p_mode, v_share, e -> 'plots', v_games, v_usd, v_usd_take, v_usd_ink, v_take, v_plots, v_pink, v_debt, trim(p_reason), v_uid)
  returning id into v_id;
  perform private.audit('altar_loop.reverse', 'player', p_player::text, jsonb_build_object('reversal', v_id, 'mode', p_mode, 'share', v_share, 'ink_games', v_games, 'usd', v_usd,
    'usd_taken', v_usd_take, 'ink_taken', v_take, 'plots_removed', jsonb_array_length(v_plots), 'debt', v_debt, 'reason', trim(p_reason)));
  return public.admin_altar_loop_player(p_player) || jsonb_build_object('reversal', v_out || jsonb_build_object('id', v_id));
end $$;

/** undo a take-back: the Ink and USD taken come back (plus what the removed plots cost, as Ink), and the debt it added goes */
create or replace function public.admin_altar_loop_reverse_undo(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); r private.altar_loop_reversals; v_back bigint; v_left bigint; v_bal numeric;
begin
  select * into r from private.altar_loop_reversals where id = p_id for update;
  if not found or r.undone_at is not null then raise exception 'not_found' using errcode = 'P0001'; end if;
  select least(owed, r.debt) into v_left from private.ink_debts where player_id = r.player_id for update;
  if coalesce(v_left, 0) > 0 then update private.ink_debts set owed = owed - v_left, updated_at = now() where player_id = r.player_id; end if;
  v_back := r.ink_taken + r.plots_ink + (r.debt - coalesce(v_left, 0));
  if v_back > 0 then perform private.ledger_apply(r.player_id, 'ink', v_back, 'altar_loop_refund', 'altar_loop', r.id::text, null, v_uid); end if;
  if r.usd_taken > 0 then
    perform private.rent_settle(r.player_id);
    update public.rent_accounts set balance_usd = balance_usd + r.usd_taken, updated_at = now() where player_id = r.player_id returning balance_usd into v_bal;
    insert into public.rent_ledger (player_id, kind, amount_usd, balance_after, ref, actor_id) values (r.player_id, 'adjustment', r.usd_taken, v_bal, 'altar_loop_undo', v_uid);
  end if;
  update private.altar_loop_reversals set undone_at = now(), undone_by = v_uid where id = r.id;
  perform private.audit('altar_loop.reverse_undo', 'player', r.player_id::text, jsonb_build_object('reversal', r.id, 'ink_returned', v_back, 'usd_returned', r.usd_taken));
  return public.admin_altar_loop_player(r.player_id) || jsonb_build_object('ink_returned', v_back, 'usd_returned', r.usd_taken);
end $$;

-- a refund isn't taken straight back to pay what they owe
select private.fn_patch('private.ink_debt_trg()', $a$'egg_loop_refund', $a$, $a$'egg_loop_refund', 'altar_loop_refund', $a$);

-- the risk scanner flags it too
select private.fn_patch('private.integrity_scan(uuid)',
  $a$  -- ===== location / network (context, never enough on its own)$a$,
  $a$  -- the altar loop: the same plot laid on the altar again (bought back with the rarity it had, or passed round)
  v_list := private.altar_loop_stats(p_uid);
  v_n := coalesce((v_list ->> 'repeats')::int, 0);
  if v_n >= 2 then sig := sig || private.isig2('altar_loop', 'exploit', least(0.7 + 0.02 * v_n, 0.95),
      format('Altar loop: laid the same plots on the altar again %s times for %s Luck', v_n, v_list ->> 'luck_from_repeats'),
      jsonb_build_array(format('%s repeats of their own plots', v_list ->> 'repeats_self'), format('%s of plots someone else had sacrificed', v_list ->> 'repeats_other'),
                        format('%s cells', v_list ->> 'cells'), format('up to %s in a day', v_list ->> 'peak_day')), v_n >= 3); end if;

  -- ===== location / network (context, never enough on its own)$a$);

do $$
declare f text;
begin
  foreach f in array array['private.altar_fix_at()', 'private.altar_sacrifices(uuid)', 'private.altar_loop_stats(uuid)', 'private.altar_loop_plots(uuid, timestamptz)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.admin_altar_loop_scan(int)', 'public.admin_altar_loop_player(uuid)', 'public.admin_altar_loop_take_luck(uuid, int, text)',
    'public.admin_altar_loop_luck_undo(bigint)', 'public.admin_altar_loop_fix(uuid, jsonb, text)', 'public.admin_altar_loop_undo(bigint)',
    'public.admin_altar_loop_reverse(uuid, jsonb, text, int, text, boolean)', 'public.admin_altar_loop_reverse_undo(bigint)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- everyone already caught shows up in the risk scanner straight away (only players who repeated a cell: a handful)
do $$
declare r record;
begin
  for r in select distinct o.player_id from public.plot_ownership o
            where o.release_reason = 'sacrificed for luck'
              and exists (select 1 from public.plot_ownership o2 where o2.gx = o.gx and o2.gy = o.gy and o2.release_reason = 'sacrificed for luck' and o2.released_at < o.released_at) loop
    if coalesce((private.altar_loop_stats(r.player_id) ->> 'repeats')::int, 0) >= 2 then perform private.integrity_scan_save(r.player_id); end if;
  end loop;
end $$;
