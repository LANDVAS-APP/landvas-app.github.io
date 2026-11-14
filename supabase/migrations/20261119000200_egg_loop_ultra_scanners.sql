-- Fair play: the egg loop scanner, and what every player's ultras earn (and would earn boosted 24/7).
--
-- The egg loop (closed in 20261119000199): hatch an egg, sacrifice the new Inkborn at the Altar of Luck, the egg came
-- back unhatched, hatch it again... Every Inkborn sacrifice is in the live feed (kind 'luck', sub 'sacrifice', what
-- 'inkborn'). A player can only ever have had the Inkborn they made (inkborn_keepers.made) plus one per egg, so any they
-- sacrificed beyond that came out of the loop. The Luck it paid for went into rerolls: luck_choices holds every plot
-- claimed with Luck, every roll it was offered and the plot's own roll (the first). Staff can put such a plot back to
-- its own roll (or any lower tier) or take it away; downgrades can be undone. What those plots earned (Ink from games
-- played on them, USD rent) can be taken back too, along with whatever it was spent on: plots bought since, and Ink owed
-- for the rest (taken out of what they earn next). Players caught get an integrity signal.

-- ---- the loop ---------------------------------------------------------------------------------------------------------
/** when the fix went live: from then on, an Inkborn sacrificed took its egg with it */
create or replace function private.egg_fix_at() returns timestamptz language sql immutable as $$ select timestamptz '2026-11-14 20:42:52+00' $$;

/** Inkborn sacrificed against every Inkborn the player could ever have had; 'excess' is how many came out of the loop
    (a lower bound: an egg still in the nest, hatched or not, counts as one they could have had) */
create or replace function private.egg_loop_stats(p_uid uuid) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with f as (
    select created_at, coalesce((data ->> 'gained')::int, 0) gained, data ->> 'what' what
      from public.feed_events where player_id = p_uid and kind = 'luck' and data ->> 'sub' = 'sacrifice'
  ), s as (
    select count(*) filter (where what = 'inkborn')::int n,
           coalesce(sum(gained) filter (where what = 'inkborn'), 0)::int luck,
           coalesce(sum(gained), 0)::int luck_all,
           count(*) filter (where what = 'inkborn' and created_at >= private.egg_fix_at())::int after_fix,
           min(created_at) filter (where what = 'inkborn') first_at, max(created_at) filter (where what = 'inkborn') last_at
      from f
  ), d as (
    select coalesce(max(c), 0)::int peak from (select count(*) c from f where what = 'inkborn' group by (created_at at time zone 'UTC')::date) z
  ), k as (
    select coalesce((select made from public.inkborn_keepers where owner_id = p_uid), 0)::int made,
           (select count(*) from public.inkborn where owner_id = p_uid)::int alive,
           (select count(*) from public.inkborn_eggs where owner_id = p_uid)::int eggs
  )
  select jsonb_build_object('sacrificed', s.n, 'luck_from_inkborn', s.luck, 'luck_total', s.luck_all, 'first_at', s.first_at, 'last_at', s.last_at,
    'peak_day', d.peak, 'made', k.made, 'alive', k.alive, 'eggs', k.eggs, 'after_fix', s.after_fix,
    'could_have', greatest(0, k.made + k.eggs + s.after_fix - k.alive),
    'excess', greatest(0, s.n + k.alive - k.made - k.eggs - s.after_fix))
  from s, d, k
$$;

-- what staff did about it (downgrades can be undone; taking a plot away can't)
create table if not exists private.egg_loop_fixes (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  gx int not null, gy int not null,
  action text not null check (action in ('downgrade', 'take')),
  from_rarity text not null, from_shiny boolean not null default false,
  to_rarity text, to_shiny boolean,
  reason text not null,
  admin_id uuid,
  created_at timestamptz not null default now(),
  undone_at timestamptz, undone_by uuid
);
create index if not exists egg_loop_fixes_player_idx on private.egg_loop_fixes (player_id, id desc);
revoke all on private.egg_loop_fixes from public, anon, authenticated;

/** every plot the player claimed with Luck: each roll, the one kept, the plot's own roll, and where the plot is now */
create or replace function private.egg_loop_plots(p_uid uuid, p_since timestamptz) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(z.j order by z.rolled_at desc), '[]'::jsonb) from (
    select l.created_at rolled_at, jsonb_build_object('gx', l.gx, 'gy', l.gy, 'rolled_at', l.created_at, 'options', l.options, 'shinies', l.shinies,
      'kept', k.idx, 'kept_rarity', l.options ->> k.idx, 'own', l.options ->> 0, 'own_shiny', coalesce((l.shinies ->> 0)::boolean, false),
      'improved', coalesce(private.plot_rarity_rank(l.options ->> k.idx) > private.plot_rarity_rank(l.options ->> 0), false),
      'ultra', coalesce((select r.ppm > 0 from public.plot_rarities r where r.id = l.options ->> k.idx), false),
      'in_window', p_since is not null and l.created_at >= p_since,
      'theirs', w.owner_id is not distinct from p_uid,
      'rarity', w.rarity, 'shiny', coalesce(w.shiny, false), 'name', w.name, 'level', w.level,
      'fix', (select jsonb_build_object('id', fx.id, 'action', fx.action, 'from', fx.from_rarity, 'to', fx.to_rarity, 'at', fx.created_at)
              from private.egg_loop_fixes fx where fx.player_id = p_uid and fx.gx = l.gx and fx.gy = l.gy and fx.undone_at is null order by fx.id desc limit 1)) j
    from public.luck_choices l
    left join public.world_plots w on w.gx = l.gx and w.gy = l.gy
    cross join lateral (select coalesce(l.picked, l.best, (select (o.ord - 1)::int from jsonb_array_elements_text(l.options) with ordinality o(r, ord)
                          order by private.plot_rarity_rank(o.r) desc nulls last, o.ord limit 1), 0) idx) k
    where l.player_id = p_uid
  ) z
$$;

/** everyone caught: players who've sacrificed anything, with Inkborn beyond what they could have had */
create or replace function public.admin_egg_loop_scan(p_min int default 1) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy']);
begin
  return jsonb_build_object('fixed_at', private.egg_fix_at(), 'rows', coalesce((
    select jsonb_agg(r.j order by r.excess desc, r.sacrificed desc) from (
      select (c.st ->> 'excess')::int excess, (c.st ->> 'sacrificed')::int sacrificed,
        jsonb_build_object('player', private.profile_json(c.player_id), 'email', u.email, 'status', pl.status, 'stats', c.st,
          'rolls', (select jsonb_build_object('n', count(*),
                     'improved', count(*) filter (where (p ->> 'in_window')::boolean and (p ->> 'improved')::boolean),
                     'ultras', count(*) filter (where (p ->> 'in_window')::boolean and (p ->> 'improved')::boolean and (p ->> 'ultra')::boolean),
                     'open', count(*) filter (where (p ->> 'in_window')::boolean and (p ->> 'improved')::boolean and (p ->> 'theirs')::boolean and jsonb_typeof(p -> 'fix') = 'null'),
                     'fixed', count(*) filter (where jsonb_typeof(p -> 'fix') = 'object'))
                    from jsonb_array_elements(private.egg_loop_plots(c.player_id, (c.st ->> 'first_at')::timestamptz)) p)) j
      from (select l.player_id, private.egg_loop_stats(l.player_id) st from public.player_luck l where l.sacrificed > 0) c
      join public.players pl on pl.id = c.player_id left join auth.users u on u.id = c.player_id
      where (c.st ->> 'excess')::int >= greatest(coalesce(p_min, 1), 1)
    ) r), '[]'::jsonb));
end $$;

/** one player: the numbers, the sacrifices day by day, every plot they rolled with Luck, and what was done */
create or replace function public.admin_egg_loop_player(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy']); st jsonb;
begin
  if not exists (select 1 from public.players where id = p_player) then raise exception 'not_found' using errcode = 'P0001'; end if;
  st := private.egg_loop_stats(p_player);
  return jsonb_build_object('player', private.profile_json(p_player), 'email', (select email from auth.users where id = p_player),
    'stats', st, 'fixed_at', private.egg_fix_at(),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'inkborn', n, 'luck', g) order by d), '[]'::jsonb) from (
               select (created_at at time zone 'UTC')::date d, count(*) filter (where data ->> 'what' = 'inkborn')::int n,
                      coalesce(sum((data ->> 'gained')::int) filter (where data ->> 'what' = 'inkborn'), 0)::int g
                 from public.feed_events where player_id = p_player and kind = 'luck' and data ->> 'sub' = 'sacrifice' group by 1) z),
    'plots', private.egg_loop_plots(p_player, (st ->> 'first_at')::timestamptz),
    'fixes', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'gx', f.gx, 'gy', f.gy, 'action', f.action, 'from', f.from_rarity, 'from_shiny', f.from_shiny,
                'to', f.to_rarity, 'to_shiny', f.to_shiny, 'reason', f.reason, 'at', f.created_at, 'by', (select username from public.profiles where id = f.admin_id),
                'undone_at', f.undone_at) order by f.id desc), '[]'::jsonb) from private.egg_loop_fixes f where f.player_id = p_player),
    'reversals', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'mode', v.mode, 'plots', jsonb_array_length(v.plots), 'ink_games', v.ink_games, 'usd', v.usd,
                'usd_taken', v.usd_taken, 'usd_as_ink', v.usd_as_ink, 'ink_taken', v.ink_taken, 'plots_removed', v.plots_removed, 'plots_ink', v.plots_ink, 'debt', v.debt,
                'reason', v.reason, 'at', v.created_at, 'by', (select username from public.profiles where id = v.admin_id), 'undone_at', v.undone_at) order by v.id desc), '[]'::jsonb)
                from private.egg_loop_reversals v where v.player_id = p_player),
    'owed', coalesce((select owed from private.ink_debts where player_id = p_player), 0),
    'tiers', (select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'ultra', coalesce(r.ppm, 0) > 0) order by private.plot_rarity_rank(r.id))
                from public.plot_rarities r where r.id not like 'crown%' and r.id <> 'enchanted'),
    'can_fix', private.has_role(v_uid, array['economy']), 'can_take', private.has_role(v_uid, array['economy']) and private.has_role(v_uid, array['moderator']));
end $$;

/** put plots back to a lower tier (by default the plot's own roll, without Luck) or take them away */
create or replace function public.admin_egg_loop_fix(p_player uuid, p_plots jsonb, p_reason text) returns jsonb
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
      -- the shine goes too if Luck gave it (the plot's own roll wasn't shiny)
      v_shiny := w.shiny and coalesce((l.shinies ->> 0)::boolean, w.shiny);
      perform private.rent_settle(p_player);
      update public.world_plots set rarity = v_to, shiny = v_shiny, updated_at = now() where gx = w.gx and gy = w.gy;
      insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', w.gx, w.gy, w.gx, w.gy);
      insert into private.egg_loop_fixes (player_id, gx, gy, action, from_rarity, from_shiny, to_rarity, to_shiny, reason, admin_id)
      values (p_player, w.gx, w.gy, 'downgrade', w.rarity, w.shiny, v_to, v_shiny, trim(p_reason), v_uid);
      perform private.audit('egg_loop.downgrade', 'player', p_player::text, jsonb_build_object('gx', w.gx, 'gy', w.gy, 'from', w.rarity, 'to', v_to, 'shiny', v_shiny, 'reason', trim(p_reason)));
    else
      perform public.admin_release_plot(w.gx, w.gy, trim(p_reason));
      v_nat := private.plot_rarity_for(w.gx, w.gy);
      if v_nat like 'crown%' then v_nat := 'common'; end if;
      update public.world_plots set rarity = v_nat, shiny = false, updated_at = now() where gx = w.gx and gy = w.gy and owner_id is null;
      insert into private.egg_loop_fixes (player_id, gx, gy, action, from_rarity, from_shiny, reason, admin_id)
      values (p_player, w.gx, w.gy, 'take', w.rarity, w.shiny, trim(p_reason), v_uid);
      perform private.audit('egg_loop.take', 'player', p_player::text, jsonb_build_object('gx', w.gx, 'gy', w.gy, 'rarity', w.rarity, 'shiny', w.shiny, 'reason', trim(p_reason)));
    end if;
    -- a roll still open to choose from can't bring it back
    update public.luck_choices set picked = coalesce(picked, best, 0) where player_id = p_player and gx = w.gx and gy = w.gy and picked is null;
    v_done := v_done + 1;
    v_out := v_out || jsonb_build_object('gx', w.gx, 'gy', w.gy, 'ok', true, 'action', v_act, 'from', w.rarity, 'to', case when v_act = 'downgrade' then v_to end);
  end loop;
  return public.admin_egg_loop_player(p_player) || jsonb_build_object('done', v_done, 'results', v_out);
end $$;

/** put a downgraded plot back as it was (only while it's still theirs and still the tier it was put to) */
create or replace function public.admin_egg_loop_undo(p_fix bigint) returns jsonb
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
  perform private.audit('egg_loop.undo', 'player', f.player_id::text, jsonb_build_object('gx', f.gx, 'gy', f.gy, 'back_to', f.from_rarity, 'fix', f.id));
  return public.admin_egg_loop_player(f.player_id);
end $$;

-- ---- reversing what those plots earned ----------------------------------------------------------------------------------
-- Ink a player still owes (Ink they'd already spent when it was taken back): every Ink they earn from now on goes to it first.
create table if not exists private.ink_debts (
  player_id uuid primary key references public.players (id) on delete cascade,
  owed bigint not null default 0 check (owed >= 0),
  reason text,
  updated_at timestamptz not null default now()
);
revoke all on private.ink_debts from public, anon, authenticated;

create or replace function private.ink_debt_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owed bigint; v_take bigint;
begin
  if new.reason in ('egg_loop_refund', 'integrity_refund', 'debt_repay') then return null; end if;
  select owed into v_owed from private.ink_debts where player_id = new.player_id for update;
  if coalesce(v_owed, 0) <= 0 then return null; end if;
  v_take := least(v_owed, new.delta, new.balance_after);
  if v_take <= 0 then return null; end if;
  update private.ink_debts set owed = owed - v_take, updated_at = now() where player_id = new.player_id;
  perform private.ledger_apply(new.player_id, 'ink', -v_take, 'debt_repay', 'egg_loop', null, null, null);
  return null;
end $$;
drop trigger if exists resource_ledger_ink_debt on public.resource_ledger;
create trigger resource_ledger_ink_debt after insert on public.resource_ledger
  for each row when (new.resource = 'ink' and new.delta > 0) execute function private.ink_debt_trg();

create table if not exists private.egg_loop_reversals (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  mode text not null check (mode in ('all', 'extra')),
  plots jsonb not null,                   -- the Luck-rolled plots whose earnings were reversed
  ink_games bigint not null default 0,    -- Ink from games played on them
  usd numeric(24, 15) not null default 0, -- USD rent they earned (estimate)
  usd_taken numeric(24, 15) not null default 0, usd_as_ink bigint not null default 0,
  ink_taken bigint not null default 0, plots_removed jsonb not null default '[]'::jsonb, plots_ink bigint not null default 0, debt bigint not null default 0,
  reason text not null, admin_id uuid, created_at timestamptz not null default now(), undone_at timestamptz, undone_by uuid
);
create index if not exists egg_loop_reversals_player_idx on private.egg_loop_reversals (player_id, id desc);
revoke all on private.egg_loop_reversals from public, anon, authenticated;

/** what the given Luck-rolled plots earned while they were the rarity Luck gave them: Ink from games played on them and
    USD rent (an estimate: the plot's rate x the time, with the player's share of boosted time). 'extra' counts only what
    the Luck rarity added over the plot's own roll. A plot stops counting when staff fixed it or it left the player. */
create or replace function private.egg_loop_earnings(p_player uuid, p_plots jsonb, p_mode text) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare it jsonb; l public.luck_choices; w public.world_plots; v_idx int; v_kept text; v_own text; v_ks boolean; v_os boolean; v_from timestamptz; v_to timestamptz;
  v_ink bigint; v_secs numeric; v_share numeric; v_rate numeric; v_orate numeric; v_usd numeric; v_f_ink numeric; v_f_usd numeric; v_mult numeric := private.rent_mult(p_player);
  v_bm numeric := coalesce((private.cfg('rent') -> 'boost' ->> 'multiplier')::numeric, 20); v_sm numeric := coalesce((private.cfg('shiny') ->> 'rent_mult')::numeric, 5);
  v_list jsonb := '[]'::jsonb; t_ink bigint := 0; t_usd numeric := 0;
begin
  for it in select value from jsonb_array_elements(coalesce(p_plots, '[]'::jsonb)) loop
    select * into l from public.luck_choices where player_id = p_player and gx = (it ->> 'gx')::int and gy = (it ->> 'gy')::int;
    if not found then continue; end if;
    select * into w from public.world_plots where gx = l.gx and gy = l.gy;
    v_idx := coalesce(l.picked, l.best, (select (o.ord - 1)::int from jsonb_array_elements_text(l.options) with ordinality o(r, ord) order by private.plot_rarity_rank(o.r) desc nulls last, o.ord limit 1), 0);
    v_kept := l.options ->> v_idx; v_own := l.options ->> 0;
    v_ks := coalesce((l.shinies ->> v_idx)::boolean, false); v_os := coalesce((l.shinies ->> 0)::boolean, false);
    v_from := l.created_at;
    -- until staff fixed it, it left them, or now
    v_to := least(coalesce((select min(created_at) from private.egg_loop_fixes f where f.player_id = p_player and f.gx = l.gx and f.gy = l.gy and f.undone_at is null and f.created_at >= v_from), now()),
                  case when w.owner_id is distinct from p_player
                       then coalesce((select max(o.released_at) from public.plot_ownership o where o.player_id = p_player and o.gx = l.gx and o.gy = l.gy and o.released_at >= v_from), v_from)
                       else now() end);
    v_to := greatest(v_to, v_from);
    select coalesce(sum(mr.ink), 0) into v_ink from public.minigame_rewards mr join public.minigame_sessions ms on ms.id = mr.session_id
     where mr.player_id = p_player and ms.gx = l.gx and ms.gy = l.gy and mr.created_at >= v_from and mr.created_at < v_to and mr.ink > 0;
    v_secs := extract(epoch from (v_to - v_from));
    select coalesce(sum(boosted_seconds) / nullif(sum(seconds), 0), 0) into v_share from public.rent_ledger
     where player_id = p_player and kind = 'rent' and created_at >= v_from and created_at <= v_to + interval '1 day';
    v_rate := coalesce(private.plot_rent_rate(v_kept, w.level), 0) * case when v_ks then v_sm else 1 end * v_mult;
    v_orate := coalesce(private.plot_rent_rate(v_own, w.level), 0) * case when v_os then v_sm else 1 end * v_mult;
    v_usd := v_rate * v_secs * (1 + (v_bm - 1) * least(greatest(v_share, 0), 1));
    if p_mode = 'extra' then
      v_f_ink := greatest(0, 1 - coalesce((select ink_reward_multiplier from public.plot_rarities where id = v_own), 1) / nullif((select ink_reward_multiplier from public.plot_rarities where id = v_kept), 0));
      v_f_usd := case when v_rate > 0 then greatest(0, 1 - v_orate / v_rate) else 0 end;
    else v_f_ink := 1; v_f_usd := 1; end if;
    v_ink := floor(v_ink * coalesce(v_f_ink, 0)); v_usd := round(v_usd * v_f_usd, 15);
    t_ink := t_ink + v_ink; t_usd := t_usd + v_usd;
    v_list := v_list || jsonb_build_object('gx', l.gx, 'gy', l.gy, 'kept', v_kept, 'own', v_own, 'from', v_from, 'to', v_to, 'ink', v_ink, 'usd', v_usd);
  end loop;
  return jsonb_build_object('ink_games', t_ink, 'usd', t_usd, 'plots', v_list);
end $$;

/** take back what those plots earned. USD first from the USD balance; USD already converted, cashed out or held comes
    back as Ink (at the conversion rate). Ink from the balance, then the plots they bought since the loop began (newest
    first) until it's covered; anything still left is owed and comes out of the Ink they earn from now on. */
create or replace function public.admin_egg_loop_reverse(p_player uuid, p_plots jsonb, p_mode text, p_reason text, p_preview boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); e jsonb; st jsonb; v_bal numeric; v_usd numeric; v_usd_take numeric; v_usd_ink bigint; v_target bigint;
  v_ibal bigint; v_take bigint; v_short bigint; v_plots jsonb := '[]'::jsonb; v_pink bigint := 0; v_since timestamptz; r record;
  v_debt bigint; v_id bigint; pl jsonb; v_rate numeric := greatest(coalesce((private.cfg('rent') -> 'convert' ->> 'ink_per_usd')::numeric, 100), 1); v_nat text;
  v_out jsonb;
begin
  if p_mode is null or p_mode not in ('all', 'extra') then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  if not coalesce(p_preview, false) then
    if p_reason is null or char_length(trim(p_reason)) < 4 then raise exception 'reason_required' using errcode = 'P0001'; end if;
    if not private.has_role(v_uid, array['moderator']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  end if;
  if p_player = v_uid then raise exception 'cannot_moderate_self' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_plots) is distinct from 'array' or jsonb_array_length(p_plots) = 0 then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  st := private.egg_loop_stats(p_player);
  e := private.egg_loop_earnings(p_player, p_plots, p_mode);
  if not coalesce(p_preview, false) then perform private.rent_settle(p_player); end if;
  select coalesce(balance_usd, 0) into v_bal from public.rent_accounts where player_id = p_player;
  v_usd := round((e ->> 'usd')::numeric, 15);
  v_usd_take := least(coalesce(v_bal, 0), v_usd);
  v_usd_ink := ceil((v_usd - v_usd_take) * v_rate)::bigint;
  v_target := (e ->> 'ink_games')::bigint + v_usd_ink;
  -- Ink: from the balance, then plots bought with Ink since the loop began (newest first, each only if its cost fits in
  -- what's still owed), and the rest is owed
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
  v_out := jsonb_build_object('mode', p_mode, 'earnings', e, 'usd', v_usd, 'usd_balance', coalesce(v_bal, 0), 'usd_taken', v_usd_take, 'usd_as_ink', v_usd_ink, 'ink_rate', v_rate,
    'ink_target', v_target, 'ink_balance', v_ibal, 'ink_taken', v_take, 'plots', v_plots, 'plots_ink', v_pink, 'debt', v_debt,
    'owed_now', coalesce((select owed from private.ink_debts where player_id = p_player), 0));
  if coalesce(p_preview, false) then return v_out; end if;

  if v_usd_take > 0 then
    update public.rent_accounts set balance_usd = balance_usd - v_usd_take, updated_at = now() where player_id = p_player returning balance_usd into v_bal;
    insert into public.rent_ledger (player_id, kind, amount_usd, balance_after, ref, actor_id) values (p_player, 'adjustment', -v_usd_take, v_bal, 'egg_loop', v_uid);
  end if;
  if v_take > 0 then perform private.ledger_apply(p_player, 'ink', -v_take, 'egg_loop_reversal', 'egg_loop', null, null, v_uid); end if;
  for pl in select value from jsonb_array_elements(v_plots) loop
    perform public.admin_release_plot((pl ->> 'gx')::int, (pl ->> 'gy')::int, 'Egg loop: ' || left(trim(p_reason), 200));
    -- a plot whose rarity came from Luck goes back to the cell's own rarity
    if exists (select 1 from public.luck_choices where player_id = p_player and gx = (pl ->> 'gx')::int and gy = (pl ->> 'gy')::int) then
      v_nat := private.plot_rarity_for((pl ->> 'gx')::int, (pl ->> 'gy')::int);
      if v_nat like 'crown%' then v_nat := 'common'; end if;
      update public.world_plots set rarity = v_nat, shiny = false, updated_at = now() where gx = (pl ->> 'gx')::int and gy = (pl ->> 'gy')::int and owner_id is null;
      update public.luck_choices set picked = coalesce(picked, best, 0) where player_id = p_player and gx = (pl ->> 'gx')::int and gy = (pl ->> 'gy')::int and picked is null;
    end if;
  end loop;
  if v_debt > 0 then
    insert into private.ink_debts (player_id, owed, reason) values (p_player, v_debt, 'egg_loop')
    on conflict (player_id) do update set owed = private.ink_debts.owed + excluded.owed, reason = excluded.reason, updated_at = now();
  end if;
  insert into private.egg_loop_reversals (player_id, mode, plots, ink_games, usd, usd_taken, usd_as_ink, ink_taken, plots_removed, plots_ink, debt, reason, admin_id)
  values (p_player, p_mode, e -> 'plots', (e ->> 'ink_games')::bigint, v_usd, v_usd_take, v_usd_ink, v_take, v_plots, v_pink, v_debt, trim(p_reason), v_uid)
  returning id into v_id;
  perform private.audit('egg_loop.reverse', 'player', p_player::text, jsonb_build_object('reversal', v_id, 'mode', p_mode, 'ink_games', e ->> 'ink_games', 'usd', v_usd,
    'usd_taken', v_usd_take, 'ink_taken', v_take, 'plots_removed', jsonb_array_length(v_plots), 'debt', v_debt, 'reason', trim(p_reason)));
  return public.admin_egg_loop_player(p_player) || jsonb_build_object('reversal', v_out || jsonb_build_object('id', v_id));
end $$;

/** undo a reversal: the Ink and USD taken come back (plus what the removed plots cost, as Ink), and the debt it added goes */
create or replace function public.admin_egg_loop_reverse_undo(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); r private.egg_loop_reversals; v_back bigint; v_left bigint; v_bal numeric;
begin
  select * into r from private.egg_loop_reversals where id = p_id for update;
  if not found or r.undone_at is not null then raise exception 'not_found' using errcode = 'P0001'; end if;
  -- the debt it added first (what's still owed of it), so the refund isn't taken straight back
  select least(owed, r.debt) into v_left from private.ink_debts where player_id = r.player_id for update;
  if coalesce(v_left, 0) > 0 then update private.ink_debts set owed = owed - v_left, updated_at = now() where player_id = r.player_id; end if;
  v_back := r.ink_taken + r.plots_ink + (r.debt - coalesce(v_left, 0));
  if v_back > 0 then perform private.ledger_apply(r.player_id, 'ink', v_back, 'egg_loop_refund', 'egg_loop', r.id::text, null, v_uid); end if;
  if r.usd_taken > 0 then
    perform private.rent_settle(r.player_id);
    update public.rent_accounts set balance_usd = balance_usd + r.usd_taken, updated_at = now() where player_id = r.player_id returning balance_usd into v_bal;
    insert into public.rent_ledger (player_id, kind, amount_usd, balance_after, ref, actor_id) values (r.player_id, 'adjustment', r.usd_taken, v_bal, 'egg_loop_undo', v_uid);
  end if;
  update private.egg_loop_reversals set undone_at = now(), undone_by = v_uid where id = r.id;
  perform private.audit('egg_loop.reverse_undo', 'player', r.player_id::text, jsonb_build_object('reversal', r.id, 'ink_returned', v_back, 'usd_returned', r.usd_taken));
  return public.admin_egg_loop_player(r.player_id) || jsonb_build_object('ink_returned', v_back, 'usd_returned', r.usd_taken);
end $$;

-- the risk scanner flags it too
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.integrity_scan(uuid)'::regprocedure);
  n := replace(d, $a$  -- 8. emulators and automation$a$, $a$  -- 9. the egg loop: Inkborn sacrificed at the altar beyond any they could ever have had
  v_list := private.egg_loop_stats(p_uid);
  v_n := coalesce((v_list ->> 'excess')::int, 0);
  if v_n >= 2 then sig := sig || private.isig('egg_loop', least(40 + 3 * v_n, 80), 'severe',
      format('Egg loop: sacrificed %s Inkborn they never had (hatch, sacrifice, the egg came back) for %s Luck', v_n, v_list ->> 'luck_from_inkborn'),
      jsonb_build_array(format('%s Inkborn sacrificed', v_list ->> 'sacrificed'), format('could have had %s', v_list ->> 'could_have'), format('up to %s in a day', v_list ->> 'peak_day'))); end if;

  -- 8. emulators and automation$a$);
  if position('egg_loop_stats' in n) = 0 then raise exception 'egg loop: integrity_scan anchor not found'; end if;
  execute n;
end $$;

-- ---- ultras and rent ----------------------------------------------------------------------------------------------------
/** a player's ultras and Crowns, and their rent: now (no boost), with the day's free boosts, and boosted 24/7.
    Boosts multiply the plots' rent; the extras (landlord, abilities, daily) aren't boosted and are taken from the last 24 h. */
create or replace function private.ultra_rent(p_uid uuid) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with c as (
    select coalesce((private.cfg('rent') -> 'boost' ->> 'multiplier')::numeric, 20) bm,
           coalesce((private.cfg('rent') -> 'boost' ->> 'free_per_day')::numeric, 6) * coalesce((private.cfg('rent') -> 'boost' ->> 'minutes_per_boost')::numeric, 30) * 60 free_secs
  ), p as (
    select w.gx, w.gy, w.rarity, w.shiny, w.level, w.name, w.claimed_at, coalesce(r.ppm, 0) ppm, r.sort, private.plot_rate(w, r.usd_per_second) base
      from public.world_plots w join public.plot_rarities r on r.id = w.rarity where w.owner_id = p_uid
  ), m as (select private.rent_mult(p_uid) rm),
  t as (select coalesce((select sum(base) from p), 0) * m.rm rate, coalesce((select sum(base) from p where ppm > 0 or rarity like 'crown%'), 0) * m.rm ultra_rate from m),
  x as (select coalesce(private.landlord_extra(p_uid, now() - interval '1 day'), 0) + coalesce(private.ability_extra(p_uid, now() - interval '1 day'), 0)
               + coalesce(private.daily_extra(p_uid, now() - interval '1 day', now()), 0) extras)
  select jsonb_build_object(
    'plots', (select count(*) from p), 'ultras', (select count(*) from p where ppm > 0), 'crowns', (select count(*) from p where rarity like 'crown%'),
    'shiny_ultras', (select count(*) from p where ppm > 0 and shiny),
    'by_rarity', (select coalesce(jsonb_agg(jsonb_build_object('rarity', z.rarity, 'n', z.n, 'shiny', z.s) order by z.sort), '[]'::jsonb)
                  from (select rarity, min(sort) sort, count(*)::int n, count(*) filter (where shiny)::int s from p where ppm > 0 or rarity like 'crown%' group by rarity) z),
    'list', (select coalesce(jsonb_agg(jsonb_build_object('gx', gx, 'gy', gy, 'rarity', rarity, 'shiny', shiny, 'level', level, 'name', name, 'claimed_at', claimed_at,
               'rate', base * m.rm, 'luck', exists (select 1 from public.luck_choices lc where lc.player_id = p_uid and lc.gx = p.gx and lc.gy = p.gy))
               order by sort desc, base desc), '[]'::jsonb) from p, m where ppm > 0 or rarity like 'crown%'),
    'rent_mult', m.rm, 'boost_mult', c.bm, 'free_boost_seconds', c.free_secs,
    'rate', t.rate, 'ultra_rate', t.ultra_rate, 'extras_day', x.extras,
    'day', t.rate * 86400 + x.extras,
    'day_free_boosts', t.rate * (86400 + (c.bm - 1) * least(c.free_secs, 86400)) + x.extras,
    'day_boosted', t.rate * c.bm * 86400 + x.extras)
  from c, m, t, x
$$;

/** the player's ultras and rent, for their profile in the admin portal */
create or replace function public.admin_player_ultras(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support', 'economy']);
begin
  if not exists (select 1 from public.players where id = p_player) then raise exception 'not_found' using errcode = 'P0001'; end if;
  return private.ultra_rent(p_player) || jsonb_build_object('egg_loop', case when exists (select 1 from public.player_luck where player_id = p_player and sacrificed > 0)
    then private.egg_loop_stats(p_player) end);
end $$;

/** everyone with ultras (or Crowns): how many, and their rent now and boosted 24/7 */
create or replace function public.admin_ultra_scan(p_q text default null, p_min int default 1, p_sort text default 'boosted', p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support', 'economy']); v_q text := lower(trim(coalesce(p_q, '')));
  v_bm numeric := coalesce((private.cfg('rent') -> 'boost' ->> 'multiplier')::numeric, 20);
  v_free numeric := least(coalesce((private.cfg('rent') -> 'boost' ->> 'free_per_day')::numeric, 6) * coalesce((private.cfg('rent') -> 'boost' ->> 'minutes_per_boost')::numeric, 30) * 60, 86400);
begin
  if p_sort not in ('boosted', 'ultras', 'crowns', 'plots') then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  return (
    with u as (
      select w.owner_id, count(*) filter (where coalesce(r.ppm, 0) > 0)::int ultras, count(*) filter (where w.rarity like 'crown%')::int crowns,
             count(*) filter (where coalesce(r.ppm, 0) > 0 and w.shiny)::int shiny_ultras
        from public.world_plots w join public.plot_rarities r on r.id = w.rarity
       where w.owner_id is not null and (coalesce(r.ppm, 0) > 0 or w.rarity like 'crown%')
       group by w.owner_id having count(*) >= greatest(coalesce(p_min, 1), 1)
    ), q as (
      select u.*, pr.username, au.email, private.rent_rate(u.owner_id) rate, (select count(*) from public.world_plots where owner_id = u.owner_id)::int plots
        from u join public.profiles pr on pr.id = u.owner_id left join auth.users au on au.id = u.owner_id
       where v_q = '' or lower(pr.username) like '%' || v_q || '%' or lower(coalesce(au.email, '')) like '%' || v_q || '%'
    )
    select jsonb_build_object('boost_mult', v_bm, 'free_boost_seconds', v_free,
      'totals', (select jsonb_build_object('players', count(*), 'ultras', coalesce(sum(ultras), 0), 'crowns', coalesce(sum(crowns), 0),
                   'day', coalesce(sum(rate), 0) * 86400, 'day_boosted', coalesce(sum(rate), 0) * v_bm * 86400) from q),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('player', private.profile_json(z.owner_id), 'email', z.email, 'ultras', z.ultras, 'crowns', z.crowns,
                  'shiny_ultras', z.shiny_ultras, 'plots', z.plots, 'rate', z.rate, 'day', z.rate * 86400, 'day_free_boosts', z.rate * (86400 + (v_bm - 1) * v_free),
                  'day_boosted', z.rate * v_bm * 86400,
                  'by_rarity', (select coalesce(jsonb_agg(jsonb_build_object('rarity', y.rarity, 'n', y.n) order by y.sort), '[]'::jsonb) from (
                                  select w.rarity, min(r.sort) sort, count(*)::int n from public.world_plots w join public.plot_rarities r on r.id = w.rarity
                                   where w.owner_id = z.owner_id and (coalesce(r.ppm, 0) > 0 or w.rarity like 'crown%') group by w.rarity) y),
                  'egg_loop', case when exists (select 1 from public.player_luck pl where pl.player_id = z.owner_id and pl.sacrificed > 0)
                                   then (private.egg_loop_stats(z.owner_id) ->> 'excess')::int else 0 end)
                  order by z.ord desc, z.rate desc)
                from (select q.*, case p_sort when 'ultras' then q.ultras when 'crowns' then q.crowns when 'plots' then q.plots else q.rate * 1e12 end ord
                        from q order by ord desc, q.rate desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) z), '[]'::jsonb))
  );
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.egg_fix_at()', 'private.egg_loop_stats(uuid)', 'private.egg_loop_plots(uuid, timestamptz)', 'private.ultra_rent(uuid)',
    'private.egg_loop_earnings(uuid, jsonb, text)', 'private.ink_debt_trg()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.admin_egg_loop_scan(int)', 'public.admin_egg_loop_player(uuid)', 'public.admin_egg_loop_fix(uuid, jsonb, text)',
    'public.admin_egg_loop_undo(bigint)', 'public.admin_player_ultras(uuid)', 'public.admin_ultra_scan(text, int, text, int)',
    'public.admin_egg_loop_reverse(uuid, jsonb, text, text, boolean)', 'public.admin_egg_loop_reverse_undo(bigint)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- everyone already caught shows up in the risk scanner straight away
do $$
declare r record;
begin
  for r in select l.player_id from public.player_luck l where l.sacrificed > 0 loop
    if coalesce((private.egg_loop_stats(r.player_id) ->> 'excess')::int, 0) >= 2 then perform private.integrity_scan_save(r.player_id); end if;
  end loop;
end $$;
