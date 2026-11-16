-- Rolls, part 1: staff gifts and ⚡ Godrolls.
--
-- 1. Roll tickets of every kind (admin.landvas.app → a player → Manage → Gifts). A ticket is a free roll the player
--    uses when they like (Daily → Your guaranteed rolls, or 🎟️ Tickets). Staff choose all of it:
--      • the rarity: "X or better" (Common … Mythic: a spot whose own roll is at least that), or exactly that rarity —
--        any rarity at all, ultras, Primordials and Enchanted included
--      • the minigame (plot type), Shiny, free Luck rerolls on top (0–6), an enchantment, a Godroll, a label
-- 2. Enchantments on a player's next roll or rerolls: any kind, with its stars, level, XP, nickname and (advanced)
--    starting state, on their next claim / their Nth claim / a chosen roll of their next Luck rerolls (or all of them).
--    Built on event rolls (granted_rolls, rarity 'enchanted' + the enchantment's recipe).
-- 3. ⚡ Godrolls (game_config 'godrolls', Admin → Rolls): extremely rare. When one hits, a claim gets 2–7 rolls
--    (6 rerolls at most) and every roll is an ultra:
--      • Echo Godroll     — the same ultra on every roll, each with a different minigame: pick the game you want
--      • Pantheon Godroll — a different ultra on every roll: pick the one you want
--    The odds rise with the Luck armed and in the Hot Zone; staff can tune everything, or line one up for a player.
-- Everything staff do is in the audit log.

-- ---- tables -------------------------------------------------------------------------------------------------------
alter table public.roll_tickets add column if not exists exact boolean not null default false;
alter table public.roll_tickets add column if not exists plot_type text references public.plot_types (id) on delete set null;
alter table public.roll_tickets add column if not exists shiny boolean not null default false;
alter table public.roll_tickets add column if not exists rerolls int not null default 0;
alter table public.roll_tickets add column if not exists enchant jsonb;
alter table public.roll_tickets add column if not exists godroll text;
alter table public.roll_tickets add column if not exists label text;
alter table public.roll_tickets add column if not exists note text;
alter table public.roll_tickets add column if not exists created_by uuid references public.players (id) on delete set null;
alter table public.roll_tickets add column if not exists cancelled_at timestamptz;
do $$ begin
  alter table public.roll_tickets add constraint roll_tickets_rerolls_check check (rerolls between 0 and 6);
  alter table public.roll_tickets add constraint roll_tickets_godroll_check check (godroll is null or godroll in ('echo', 'pantheon'));
  alter table public.roll_tickets add constraint roll_tickets_label_check check (label is null or char_length(label) <= 60);
exception when duplicate_object then null; end $$;
create index if not exists roll_tickets_creator on public.roll_tickets (created_by) where created_by is not null;
create index if not exists roll_tickets_type on public.roll_tickets (plot_type) where plot_type is not null;

alter table private.granted_rolls add column if not exists enchant jsonb;
alter table private.granted_rolls add column if not exists ticket_id uuid references public.roll_tickets (id) on delete cascade;
create index if not exists granted_rolls_ticket on private.granted_rolls (ticket_id) where ticket_id is not null;

alter table public.luck_choices add column if not exists godroll text;
alter table public.luck_choices add column if not exists enchants jsonb;

create table if not exists private.godroll_queue (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null check (kind in ('echo', 'pantheon')),
  rolls int check (rolls between 2 and 7),
  rarity text references public.plot_rarities (id),
  shiny boolean not null default false,
  note text, created_by uuid references public.players (id) on delete set null, created_at timestamptz not null default now(),
  used_at timestamptz, used_gx int, used_gy int, cancelled_at timestamptz);
create index if not exists godroll_queue_open on private.godroll_queue (player_id) where used_at is null and cancelled_at is null;
create index if not exists godroll_queue_creator on private.godroll_queue (created_by) where created_by is not null;
create index if not exists godroll_queue_rarity on private.godroll_queue (rarity) where rarity is not null;

create table if not exists private.godroll_log (
  id bigint generated always as identity primary key,
  player_id uuid references public.players (id) on delete cascade,
  kind text not null, rolls int not null, rarities jsonb not null, types jsonb, gx int, gy int,
  how text not null, kept text, at timestamptz not null default now());
create index if not exists godroll_log_player on private.godroll_log (player_id);
create index if not exists godroll_log_at on private.godroll_log (at desc);

-- ---- settings -----------------------------------------------------------------------------------------------------
insert into public.game_config (key, value, description) values ('godrolls', $cfg${
  "enabled": true,
  "echo_one_in": 400000,
  "pantheon_one_in": 1000000,
  "luck_boost": 0.5,
  "hot_zone_mult": 2,
  "rolls_min": 2,
  "rolls_max": 6,
  "needs_luck": false,
  "pool": "ultras",
  "weighted": true,
  "include": [],
  "exclude": [],
  "shiny_pct": 15,
  "announce": true
}$cfg$::jsonb, 'Godrolls: an extremely rare claim where every roll is an ultra (Echo: one ultra in every minigame; Pantheon: a different ultra each roll)')
on conflict (key) do nothing;

create or replace function private.godroll_cfg() returns jsonb language sql stable as $$
  select coalesce(private.cfg('godrolls'), '{}'::jsonb)
$$;

-- ---- an enchantment's recipe -------------------------------------------------------------------------------------
/** staff's recipe for an enchantment: {kind, stars 0–5, level 1–10, xp, nickname, state{}} (unknown keys ignored) */
create or replace function private.ench_spec_clean(p jsonb) returns jsonb language plpgsql stable as $$
declare o jsonb := '{}'::jsonb; k text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return null; end if;
  k := nullif(btrim(coalesce(p ->> 'kind', '')), '');
  if k is not null then
    if private.ench_info(k) is null or k = 'cuckoo' or not (k = any (private.ench_kinds())) then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
    o := o || jsonb_build_object('kind', k);
  end if;
  if p ? 'stars' and jsonb_typeof(p -> 'stars') = 'number' then o := o || jsonb_build_object('stars', least(greatest((p ->> 'stars')::int, 0), 5)); end if;
  if p ? 'level' and jsonb_typeof(p -> 'level') = 'number' then o := o || jsonb_build_object('level', least(greatest((p ->> 'level')::int, 1), coalesce((private.ench_cfg() ->> 'max_level')::int, 10))); end if;
  if p ? 'xp' and jsonb_typeof(p -> 'xp') = 'number' then o := o || jsonb_build_object('xp', least(greatest((p ->> 'xp')::int, 0), 100000)); end if;
  if nullif(btrim(coalesce(p ->> 'nickname', '')), '') is not null then o := o || jsonb_build_object('nickname', left(btrim(p ->> 'nickname'), 24)); end if;
  if jsonb_typeof(p -> 'state') = 'object' and p -> 'state' <> '{}'::jsonb then
    if length((p -> 'state')::text) > 4000 then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    o := o || jsonb_build_object('state', p -> 'state');
  end if;
  return o;
end $$;

/** give a freshly born enchantment staff's recipe */
create or replace function private.ench_customize(p_id uuid, p_spec jsonb) returns void language plpgsql as $$
declare v_lv int;
begin
  if p_id is null or p_spec is null or jsonb_typeof(p_spec) <> 'object' then return; end if;
  v_lv := (p_spec ->> 'level')::int;
  update public.enchantments set
    stars = case when p_spec ? 'stars' then least(greatest((p_spec ->> 'stars')::int, 0), 5) else stars end,
    level = coalesce(v_lv, level),
    -- the XP of that level at least (so the next XP never drops it back)
    xp = greatest(case when p_spec ? 'xp' then (p_spec ->> 'xp')::int else xp end, case when v_lv is not null then 4 * (v_lv - 1) * (v_lv - 1) else 0 end),
    nickname = coalesce(nullif(p_spec ->> 'nickname', ''), nickname),
    state = case when jsonb_typeof(p_spec -> 'state') = 'object' then state || (p_spec -> 'state') else state end,
    updated_at = now()
  where id = p_id;
end $$;

-- ---- ⚡ Godrolls --------------------------------------------------------------------------------------------------
/** the rarities a Godroll can be, with their weight (how rare each is) */
create or replace function private.godroll_pool() returns table (id text, w numeric) language sql stable as $$
  with c as (select private.godroll_cfg() c),
       inc as (select coalesce(c -> 'include', '[]'::jsonb) i, coalesce(c -> 'exclude', '[]'::jsonb) x, coalesce(c ->> 'pool', 'ultras') pool from c)
  select r.id, case when r.tier = 'primordial' then greatest(coalesce(r.ppb, 0), 1)::numeric else greatest(coalesce(r.ppm, 0), 1)::numeric * 1000 end
    from public.plot_rarities r, inc
   where r.id not like 'crown%' and r.id <> 'enchanted' and not (inc.x ? r.id)
     and case when jsonb_array_length(inc.i) > 0 then inc.i ? r.id
              else (r.tier = 'ultra' and coalesce(r.ppm, 0) > 0) or (inc.pool = 'ultras_primordials' and r.tier = 'primordial' and coalesce(r.ppb, 0) > 0) end
$$;

/** draw n rarities from the pool (distinct ones while there are enough) */
create or replace function private.godroll_draw(p_n int, p_distinct boolean) returns text[] language plpgsql volatile as $$
declare v_out text[] := '{}'; r record; v_tot numeric; v_x numeric; v_acc numeric; v_pick text; i int;
  v_w boolean := coalesce((private.godroll_cfg() ->> 'weighted')::boolean, true); v_dist boolean;
begin
  for i in 1 .. greatest(coalesce(p_n, 1), 1) loop
    v_dist := p_distinct and exists (select 1 from private.godroll_pool() p where not (p.id = any (v_out)));
    select coalesce(sum(case when v_w then p.w else 1 end), 0) into v_tot from private.godroll_pool() p where not (v_dist and p.id = any (v_out));
    if v_tot <= 0 then v_out := v_out || 'solar'::text; continue; end if;
    v_x := random() * v_tot; v_acc := 0; v_pick := null;
    for r in select p.id, case when v_w then p.w else 1 end w from private.godroll_pool() p where not (v_dist and p.id = any (v_out)) order by p.id loop
      v_acc := v_acc + r.w; v_pick := r.id;
      exit when v_x < v_acc;
    end loop;
    v_out := v_out || v_pick;
  end loop;
  return v_out;
end $$;

/** is this claim a Godroll? A ticket's, one staff lined up, or the luck of the draw. */
create or replace function private.godroll_decide(p_uid uuid, p_gx int, p_gy int, p_n int) returns jsonb language plpgsql as $$
declare c jsonb := private.godroll_cfg(); v_f text := nullif(current_setting('landvas.force_godroll', true), ''); q private.godroll_queue; v_m numeric;
begin
  if v_f in ('echo', 'pantheon') then return jsonb_build_object('kind', v_f, 'how', 'ticket'); end if;
  select * into q from private.godroll_queue where player_id = p_uid and used_at is null and cancelled_at is null order by id limit 1 for update skip locked;
  if q.id is not null then
    update private.godroll_queue set used_at = now(), used_gx = p_gx, used_gy = p_gy where id = q.id;
    perform private.audit('rolls.godroll_used', 'player', p_uid::text, jsonb_build_object('queue', q.id, 'kind', q.kind, 'gx', p_gx, 'gy', p_gy));
    return jsonb_build_object('kind', q.kind, 'rolls', q.rolls, 'rarity', q.rarity, 'shiny', q.shiny, 'how', 'staff');
  end if;
  if not coalesce((c ->> 'enabled')::boolean, true) then return null; end if;
  -- (an event roll is the claim's own roll: no surprise Godroll on top of it)
  if coalesce(current_setting('landvas.granted_claim', true), '') = '1' then return null; end if;
  if coalesce((c ->> 'needs_luck')::boolean, false) and coalesce(p_n, 0) < 1 then return null; end if;
  v_m := (1 + greatest(coalesce((c ->> 'luck_boost')::numeric, 0.5), 0) * greatest(coalesce(p_n, 0), 0))
         * case when private.in_hot_zone(p_gx, p_gy) then greatest(coalesce((c ->> 'hot_zone_mult')::numeric, 2), 0) else 1 end;
  if random() < v_m / greatest(coalesce((c ->> 'pantheon_one_in')::numeric, 1000000), 1) then return jsonb_build_object('kind', 'pantheon', 'how', 'luck'); end if;
  if random() < v_m / greatest(coalesce((c ->> 'echo_one_in')::numeric, 400000), 1) then return jsonb_build_object('kind', 'echo', 'how', 'luck'); end if;
  return null;
end $$;

-- ---- Luck's rerolls (and Godrolls, and free rerolls from a ticket) ---------------------------------------------------
create or replace function private.luck_roll(p_uid uuid, p_gx int, p_gy int, p_rarity text) returns text language plpgsql as $$
declare c jsonb := private.cfg('luck'); gc jsonb := private.godroll_cfg(); v_luck int; v_arm int; v_n int; v_rr int; v_used int := 0; v_total int;
  v_opts jsonb := jsonb_build_array(p_rarity); v_types jsonb; v_shiny jsonb; v_ench jsonb; v_best int; v_try text; r record; i int; v_x numeric; v_per int;
  g private.granted_rolls; v_bt text; v_free int; v_god jsonb; v_kind text; v_rolls int; v_rar text[]; v_ts text[]; v_one text; v_spec jsonb;
begin
  if not coalesce((c ->> 'enabled')::boolean, true) or p_rarity like 'crown%' then return p_rarity; end if;
  select luck, armed into v_luck, v_arm from public.player_luck where player_id = p_uid for update;
  v_per := greatest(coalesce((c ->> 'points_per_roll')::int, 20), 1);
  v_n := greatest(least(floor(coalesce(v_luck, 0)::numeric / v_per)::int, coalesce((c ->> 'max_rolls')::int, 6) - 1, coalesce(v_arm, 0)), 0);
  -- a ticket can bring free rerolls of its own
  v_free := greatest(least(coalesce(nullif(current_setting('landvas.free_rerolls', true), '')::int, 0), 6), 0);
  v_rr := greatest(v_n, v_free);
  -- ⚡ a Godroll: 2–7 rolls, every one an ultra (the rolls past the Luck armed are free)
  v_god := private.godroll_decide(p_uid, p_gx, p_gy, v_n);
  if v_god is not null then
    v_kind := v_god ->> 'kind';
    if v_god ->> 'how' = 'staff' and v_god ->> 'rolls' is not null then v_rolls := least(greatest((v_god ->> 'rolls')::int, 2), 7);
    else v_rolls := least(greatest(1 + v_rr, coalesce((gc ->> 'rolls_min')::int, 2), 2), least(greatest(coalesce((gc ->> 'rolls_max')::int, 6), 2), 7)); end if;
    v_rr := v_rolls - 1;
  end if;
  if v_rr < 1 then return p_rarity; end if;
  if v_n >= 1 then
    v_used := v_n * v_per;
    update public.player_luck set luck = luck - v_used, armed = 0, lucky_rolls = lucky_rolls + 1, updated_at = now() where player_id = p_uid;
  end if;
  -- the plot's own roll: its own type (or an event roll's), and a shiny chance like any claim
  v_bt := coalesce(nullif(current_setting('landvas.base_type', true), ''), (select plot_type from public.world_plots where gx = p_gx and gy = p_gy), private.plot_type_for(p_gx, p_gy));
  v_types := jsonb_build_array(v_bt);
  -- (an event roll's or a ticket's Shiny stays on the plot's own roll)
  v_shiny := jsonb_build_array(coalesce(current_setting('landvas.base_shiny', true), '') = 't' or private.roll_shiny_at(p_gx, p_gy));
  v_ench := jsonb_build_array(null);
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  v_x := 1 + v_used::numeric / greatest(coalesce((c ->> 'points_per_ultra_x')::numeric, 10), 1);
  for i in 1 .. v_rr loop
    v_try := private.rarity_pick(floor(random() * v_total)::int);
    for r in select id, ppm::numeric * 1000 as ppb from public.plot_rarities where ppm > 0 union all select id, ppb::numeric from public.plot_rarities where ppb > 0 order by 2 loop
      if random() * 1000000000 < r.ppb * v_x then v_try := r.id; exit; end if;
    end loop;
    v_opts := v_opts || jsonb_build_array(v_try);
    v_types := v_types || jsonb_build_array(private.roll_plot_type());
    v_shiny := v_shiny || jsonb_build_array(private.roll_shiny_at(p_gx, p_gy));
    v_ench := v_ench || jsonb_build_array(null);
  end loop;
  -- ⚡ the Godroll takes every roll
  if v_god is not null then
    if v_kind = 'echo' then
      v_one := coalesce(v_god ->> 'rarity', (private.godroll_draw(1, false))[1]);
      select array_agg(id order by random()) into v_ts from public.plot_types where weight > 0;
      if v_ts is null then select array_agg(id order by random()) into v_ts from public.plot_types; end if;
      for i in 0 .. v_rr loop
        v_opts := jsonb_set(v_opts, array[i::text], to_jsonb(v_one));
        v_types := jsonb_set(v_types, array[i::text], to_jsonb(v_ts[1 + (i % array_length(v_ts, 1))]));
      end loop;
    else
      v_rar := private.godroll_draw(v_rr + 1, true);
      if v_god ->> 'rarity' is not null then v_rar[1] := v_god ->> 'rarity'; end if;
      for i in 0 .. v_rr loop v_opts := jsonb_set(v_opts, array[i::text], to_jsonb(v_rar[1 + i])); end loop;
    end if;
    for i in 0 .. v_rr loop
      if coalesce((v_god ->> 'shiny')::boolean, false) or random() * 100 < greatest(coalesce((gc ->> 'shiny_pct')::numeric, 15), 0) then
        v_shiny := jsonb_set(v_shiny, array[i::text], 'true'::jsonb);
      end if;
    end loop;
  end if;
  -- an event roll waiting for this player's Luck claim (staff's choice wins over everything)
  select * into g from private.granted_rolls where player_id = p_uid and mode = 'luck' and used_at is null and cancelled_at is null and ticket_id is null
   and (rarity not like 'crown%' or private.crown_kingdom_free(rarity, p_gx, p_gy))
   order by id limit 1 for update skip locked;
  if g.id is not null then
    v_spec := case when g.rarity = 'enchanted' then coalesce(g.enchant, '{}'::jsonb) end;
    for i in 0 .. jsonb_array_length(v_opts) - 1 loop
      if g.slot is null or i = least(g.slot, jsonb_array_length(v_opts)) - 1 then
        v_opts := jsonb_set(v_opts, array[i::text], to_jsonb(g.rarity));
        if g.plot_type is not null then v_types := jsonb_set(v_types, array[i::text], to_jsonb(g.plot_type)); end if;
        if g.shiny then v_shiny := jsonb_set(v_shiny, array[i::text], 'true'::jsonb); end if;
        if v_spec is not null then v_ench := jsonb_set(v_ench, array[i::text], v_spec || jsonb_build_object('kind', coalesce(v_spec ->> 'kind', private.ench_pick_kind()))); end if;
      end if;
    end loop;
    update private.granted_rolls set used_at = now(), used_gx = p_gx, used_gy = p_gy where id = g.id;
    perform private.audit('rolls.grant_used', 'player', p_uid::text, jsonb_build_object('grant', g.id, 'rarity', g.rarity, 'gx', p_gx, 'gy', p_gy, 'mode', 'luck', 'slot', g.slot));
    perform set_config('landvas.luck_grant', g.rarity || ':' || case when g.shiny then 't' else 'f' end || ':' || coalesce(g.plot_type, ''), true);
  end if;
  -- the best: rarest, then shiny, then the earliest
  select (o.ord - 1)::int into v_best from jsonb_array_elements_text(v_opts) with ordinality o(r, ord)
   order by private.plot_rarity_rank(o.r) desc, (v_shiny ->> (o.ord - 1)::int)::boolean desc, o.ord limit 1;
  insert into public.luck_choices (player_id, gx, gy, options, types, shinies, best, godroll, enchants) values (p_uid, p_gx, p_gy, v_opts, v_types, v_shiny, v_best, v_kind, v_ench)
  on conflict (player_id, gx, gy) do update set options = excluded.options, types = excluded.types, shinies = excluded.shinies, best = excluded.best,
    godroll = excluded.godroll, enchants = excluded.enchants, picked = null, created_at = now();
  if v_god is not null then
    insert into private.godroll_log (player_id, kind, rolls, rarities, types, gx, gy, how) values (p_uid, v_kind, v_rr + 1, v_opts, v_types, p_gx, p_gy, v_god ->> 'how');
    if coalesce((gc ->> 'announce')::boolean, true) then
      insert into public.feed_events (kind, player_id, data) values ('luck', p_uid, jsonb_build_object('sub', 'godroll', 'godroll', v_kind, 'of', v_rr + 1, 'rarities', v_opts));
    end if;
  end if;
  return v_opts ->> v_best;
end $$;

-- ---- event rolls: a ticket's own first, then the claim-numbered ones ------------------------------------------------
create or replace function private.take_granted_roll(p_uid uuid, p_gx int, p_gy int) returns private.granted_rolls
language plpgsql security definer set search_path = public, pg_temp as $$
declare g private.granted_rolls; v_n int := private.roll_count(p_uid) + 1; v_t text := nullif(current_setting('landvas.ticket', true), '');
begin
  if v_t is not null and private.is_uuid(v_t) then
    select * into g from private.granted_rolls where player_id = p_uid and ticket_id = v_t::uuid and used_at is null and cancelled_at is null limit 1 for update skip locked;
    if g.id is not null then
      update private.granted_rolls set used_at = now(), used_gx = p_gx, used_gy = p_gy where id = g.id;
      perform private.audit('rolls.grant_used', 'player', p_uid::text, jsonb_build_object('grant', g.id, 'rarity', g.rarity, 'gx', p_gx, 'gy', p_gy, 'roll', v_n, 'mode', 'ticket', 'ticket', v_t));
      return g;
    end if;
  end if;
  for g in select * from private.granted_rolls where player_id = p_uid and mode = 'claim' and used_at is null and cancelled_at is null and at_roll <= v_n and ticket_id is null
            order by at_roll, id for update skip locked loop
    continue when g.rarity like 'crown%' and not private.crown_kingdom_free(g.rarity, p_gx, p_gy);
    update private.granted_rolls set used_at = now(), used_gx = p_gx, used_gy = p_gy where id = g.id;
    perform private.audit('rolls.grant_used', 'player', p_uid::text, jsonb_build_object('grant', g.id, 'rarity', g.rarity, 'gx', p_gx, 'gy', p_gy, 'roll', v_n, 'mode', 'claim'));
    return g;
  end loop;
  return null;
end $$;

-- a crown waiting on an ordinary claim isn't a ticket's
select private.fn_patch('private.granted_crown_cell(uuid)',
  $a$where player_id = p_uid and mode = 'claim' and used_at is null and cancelled_at is null$a$,
  $a$where player_id = p_uid and mode = 'claim' and used_at is null and cancelled_at is null and ticket_id is null$a$);

-- ---- take_plot: enchantments from event rolls and Luck's rolls, with their recipe; the Godroll on the result -------
select private.fn_patch('private.take_plot(uuid,integer,integer,text,jsonb)',
  'v_bump int; v_chain jsonb;', 'v_bump int; v_chain jsonb; v_espec jsonb;');
select private.fn_patch('private.take_plot(uuid,integer,integer,text,jsonb)',
  $a$    if v_grant.id is not null then v_rarity := v_grant.rarity; v_base := v_grant.rarity; end if;$a$,
  $a$    if v_grant.id is not null then v_rarity := v_grant.rarity; v_base := v_grant.rarity; end if;
    -- an event roll can be an enchantment, born with staff's recipe
    if v_grant.id is not null and v_grant.rarity = 'enchanted' then
      v_espec := coalesce(v_grant.enchant, '{}'::jsonb);
      v_ench := coalesce(v_espec ->> 'kind', private.ench_pick_kind());
    end if;
    perform set_config('landvas.granted_claim', case when v_grant.id is not null then '1' else '' end, true);
    perform set_config('landvas.base_shiny', case when v_grant.id is not null and v_grant.shiny then 't' else '' end, true);$a$);
select private.fn_patch('private.take_plot(uuid,integer,integer,text,jsonb)',
  $a$    if v_lucky is distinct from v_base then v_rarity := v_lucky; else v_lucky := null; end if;$a$,
  $a$    if v_lucky is distinct from v_base then v_rarity := v_lucky; else v_lucky := null; end if;
    -- the kept roll of the rerolls is an enchantment
    if v_rarity = 'enchanted' and v_ench is null then
      select l.enchants -> l.best into v_espec from public.luck_choices l where l.player_id = p_uid and l.gx = p_gx and l.gy = p_gy and l.picked is null;
      if jsonb_typeof(v_espec) <> 'object' then v_espec := null; end if;
      v_ench := coalesce(v_espec ->> 'kind', private.ench_pick_kind());
    end if;
    -- a Godroll is final: a tuned Dowsing Rod doesn't dowse over it
    if exists (select 1 from public.luck_choices l where l.player_id = p_uid and l.gx = p_gx and l.gy = p_gy and l.picked is null and l.godroll is not null) then
      v_rod_ok := false;
    end if;$a$);
select private.fn_patch('private.take_plot(uuid,integer,integer,text,jsonb)',
  $a$  if v_ench is not null then v_ench_row := private.ench_create(v_ench, p_uid, p_gx, p_gy); end if;$a$,
  $a$  if v_ench is not null then v_ench_row := private.ench_create(v_ench, p_uid, p_gx, p_gy); end if;
  if v_ench_row.id is not null and v_espec is not null then perform private.ench_customize(v_ench_row.id, v_espec); end if;$a$);
select private.fn_patch('private.take_plot(uuid,integer,integer,text,jsonb)',
  $a$'shiny', (select shiny from public.world_plots where gx = p_gx and gy = p_gy), $a$,
  $a$'shiny', (select shiny from public.world_plots where gx = p_gx and gy = p_gy), 'godroll', (select godroll from public.luck_choices where player_id = p_uid and gx = p_gx and gy = p_gy and picked is null and created_at > now() - interval '1 minute'),
                            'choice_enchants', (select enchants from public.luck_choices where player_id = p_uid and gx = p_gx and gy = p_gy and picked is null and created_at > now() - interval '1 minute' and enchants is not null and jsonb_path_exists(enchants, '$[*] ? (@ != null)')), $a$);

-- ---- keeping one of the rolls: an enchanted roll is born (or the one that came with the claim goes) ------------------
create or replace function public.luck_pick(p_gx integer, p_gy integer, p_idx integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); l public.luck_choices; v_r text; v_n int; v_was text; v_spec jsonb; e public.enchantments;
begin
  select * into l from public.luck_choices where player_id = v_uid and gx = p_gx and gy = p_gy for update;
  if not found or l.picked is not null then raise exception 'nothing_to_pick' using errcode = 'P0001'; end if;
  v_n := jsonb_array_length(l.options);
  if p_idx is null or p_idx < 0 or p_idx >= v_n then raise exception 'invalid_choice' using errcode = 'P0001'; end if;
  v_r := l.options ->> p_idx;
  select rarity into v_was from public.world_plots where gx = p_gx and gy = p_gy and owner_id = v_uid;
  if not found then raise exception 'not_owned' using errcode = 'P0001'; end if;
  if v_r like 'crown%' and v_r is distinct from v_was and not private.crown_kingdom_free(v_r, p_gx, p_gy) then
    raise exception 'crown_taken' using errcode = 'P0001';
  end if;
  perform private.rent_settle(v_uid);
  update public.world_plots set rarity = v_r, plot_type = coalesce(l.types ->> p_idx, plot_type), shiny = coalesce((l.shinies ->> p_idx)::boolean, shiny), updated_at = now()
   where gx = p_gx and gy = p_gy;
  -- an enchanted roll: born now with its recipe; leaving an enchanted roll behind: it goes
  if v_r = 'enchanted' and v_was is distinct from 'enchanted' then
    v_spec := l.enchants -> p_idx;
    if jsonb_typeof(v_spec) <> 'object' then v_spec := null; end if;
    e := private.ench_create(coalesce(v_spec ->> 'kind', private.ench_pick_kind()), v_uid, p_gx, p_gy);
    if v_spec is not null then perform private.ench_customize(e.id, v_spec); end if;
  elsif v_r <> 'enchanted' and v_was = 'enchanted' then
    update public.enchantments set status = 'gone', updated_at = now() where gx = p_gx and gy = p_gy and owner_id = v_uid and status = 'active';
  end if;
  update public.luck_choices set picked = p_idx where player_id = v_uid and gx = p_gx and gy = p_gy;
  if l.godroll is not null then update private.godroll_log set kept = v_r where id = (select max(id) from private.godroll_log where player_id = v_uid and gx = p_gx and gy = p_gy); end if;
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx, p_gy, p_gx, p_gy);
  insert into public.feed_events (kind, player_id, data) values ('luck', v_uid, jsonb_build_object('sub', 'pick', 'rarity', v_r, 'of', v_n, 'godroll', l.godroll));
  if v_r like 'crown%' then
    insert into public.feed_events (kind, player_id, data)
    select 'crown', v_uid, jsonb_build_object('tier', v_r, 'place', case v_r when 'crown' then k.name when 'crown_state' then k.state else k.country_name end, 'country', k.country)
      from public.world_plots p join public.world_cities k on k.id = p.city_id where p.gx = p_gx and p.gy = p_gy;
  end if;
  return jsonb_build_object('rarity', v_r, 'plot_type', l.types ->> p_idx, 'shiny', coalesce((l.shinies ->> p_idx)::boolean, false),
                            'usd_per_second', (select private.plot_rate(p, r.usd_per_second) from public.world_plots p join public.plot_rarities r on r.id = p.rarity where p.gx = p_gx and p.gy = p_gy), 'rent', private.rent_json(v_uid),
                            'enchant', case when v_r = 'enchanted' then private.ench_brief((select id from public.enchantments where gx = p_gx and gy = p_gy and status = 'active')) end,
                            'achievements', private.evaluate_achievements(v_uid));
end $$;

-- ---- using a ticket -----------------------------------------------------------------------------------------------
/** a ticket whose rarity is exact (staff said so, or nothing can be "that or better" by its spot: ultras, Primordials,
    Enchanted) */
create or replace function private.ticket_exact(t public.roll_tickets) returns boolean language sql stable as $$
  select t.exact or t.min_rarity = 'enchanted'
      or coalesce((select tier is not null or sort > (select sort from public.plot_rarities where id = 'mythic') from public.plot_rarities where id = t.min_rarity), false)
$$;
/** a ticket that names more than "this or better": the claim takes what's on it */
create or replace function private.ticket_special(t public.roll_tickets) returns boolean language sql stable as $$
  select private.ticket_exact(t) or t.plot_type is not null or t.shiny or t.enchant is not null
$$;

create or replace function public.quick_buy_plot(p_idempotency_key text, p_ticket uuid default null, p_hot boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_prev jsonb; v_cell int[]; v_starter boolean; v_cost jsonb; v_res jsonb; v_tk public.roll_tickets%rowtype; v_min int := 1;
  v_bonus jsonb := coalesce(private.cfg('economy') -> 'starter_bonus', '{}'::jsonb); v_special boolean := false;
begin
  if not coalesce((private.cfg('quick_buy') ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'quick_buy_plot');
  if v_prev is not null then return v_prev; end if;
  perform private.rate_limit('acquire', 120, 3600);
  if p_ticket is not null then
    select * into v_tk from public.roll_tickets where id = p_ticket and player_id = v_uid and used_at is null and cancelled_at is null for update;
    if not found then raise exception 'ticket_not_found' using errcode = 'P0001'; end if;
    v_special := private.ticket_special(v_tk);
    if not private.ticket_exact(v_tk) then select sort into v_min from public.plot_rarities where id = v_tk.min_rarity; end if;
  end if;
  select not starter_plot_claimed into v_starter from public.players where id = v_uid for update;
  if (select count(*) from public.world_plots where owner_id = v_uid) >= coalesce((private.cfg('limits') ->> 'max_plots_per_player')::int, 2500) then
    raise exception 'plot_limit_reached' using errcode = 'P0001';
  end if;
  v_cell := case when v_special and private.ticket_exact(v_tk) then private.quick_buy_cell(v_uid, coalesce(p_hot, false), 1)
                 when v_special then private.quick_buy_cell(v_uid, coalesce(p_hot, false), v_min)
                 else coalesce(private.granted_crown_cell(v_uid), private.quick_buy_cell(v_uid, coalesce(p_hot, false), v_min)) end;
  perform private.rent_settle(v_uid);
  if p_ticket is not null then
    -- the ticket's roll: exactly what's on it (a granted roll that only this ticket's claim takes), its free rerolls, its Godroll
    if v_special then
      insert into private.granted_rolls (player_id, rarity, shiny, at_roll, note, created_by, mode, plot_type, enchant, ticket_id)
      values (v_uid,
              -- exact: what's on it; "or better": the spot's own roll (which is at least that)
              case when v_tk.enchant is not null then 'enchanted' when private.ticket_exact(v_tk) then v_tk.min_rarity
                   else (select r.id from public.plot_rarities r where r.id in (v_tk.min_rarity, coalesce((select rarity from public.world_plots where gx = v_cell[1] and gy = v_cell[2] and owner_id is null), private.plot_rarity_for(v_cell[1], v_cell[2])))
                         order by private.plot_rarity_rank(r.id) desc limit 1) end,
              v_tk.shiny, private.roll_count(v_uid) + 1, coalesce(v_tk.label, 'ticket'), v_tk.created_by, 'claim', v_tk.plot_type,
              case when v_tk.min_rarity = 'enchanted' or v_tk.enchant is not null then coalesce(v_tk.enchant, '{}'::jsonb) end, v_tk.id);
      perform set_config('landvas.ticket', v_tk.id::text, true);
    end if;
    perform set_config('landvas.free_rerolls', coalesce(v_tk.rerolls, 0)::text, true);
    perform set_config('landvas.force_godroll', coalesce(v_tk.godroll, ''), true);
    v_res := private.take_plot(v_uid, v_cell[1], v_cell[2], 'acquire', jsonb_build_object('ticket', p_ticket));
    perform set_config('landvas.ticket', '', true);
    perform set_config('landvas.free_rerolls', '', true);
    perform set_config('landvas.force_godroll', '', true);
    v_cost := jsonb_build_object('ink', 0);
    update public.roll_tickets set used_at = now(), plot = jsonb_build_object('gx', v_cell[1], 'gy', v_cell[2], 'rarity', v_res ->> 'rarity') where id = p_ticket;
    v_starter := false;
  elsif v_starter then
    v_res := private.take_plot(v_uid, v_cell[1], v_cell[2], 'starter', '{}'::jsonb);
    update public.players set starter_plot_claimed = true where id = v_uid;
    perform private.grant(v_uid, v_bonus, 'starter_bonus', 'plot', private.cell_key(v_cell[1], v_cell[2]), 'starter_bonus');
    perform private.referral_qualify(v_uid, 'starter_plot');
    v_cost := jsonb_build_object('ink', 0);
  else
    v_cost := case when coalesce(p_hot, false) then jsonb_build_object('ink', coalesce((private.cfg('hot_zones') ->> 'roll_ink')::int, 150))
                   else private.acquire_cost(v_uid, v_cell[1], v_cell[2]) end;
    perform private.ledger_apply(v_uid, 'ink', -(v_cost ->> 'ink')::bigint, 'acquire_plot', 'plot', private.cell_key(v_cell[1], v_cell[2]), p_idempotency_key);
    v_res := private.take_plot(v_uid, v_cell[1], v_cell[2], 'acquire', jsonb_build_object('ink', v_cost -> 'ink'));
    perform private.grant(v_uid, jsonb_build_object('brush_points', 5), 'acquire_plot', 'plot', private.cell_key(v_cell[1], v_cell[2]), p_idempotency_key);
  end if;
  v_res := v_res || jsonb_build_object('starter', v_starter, 'cost', v_cost, 'name', null, 'balances', private.balances(v_uid), 'rent', private.rent_json(v_uid),
                                       'achievements', private.evaluate_achievements(v_uid), 'next_cost', private.acquire_cost(v_uid, v_cell[1], v_cell[2]));
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

/** a ticket as the player sees it */
create or replace function private.ticket_json(t public.roll_tickets) returns jsonb language sql stable as $$
  select jsonb_build_object('id', t.id, 'min_rarity', t.min_rarity, 'source', t.source, 'exact', private.ticket_exact(t),
    'special', private.ticket_special(t), 'plot_type', t.plot_type, 'shiny', t.shiny, 'rerolls', t.rerolls, 'godroll', t.godroll, 'label', t.label,
    'enchant', case when t.enchant is not null then jsonb_build_object('kind', t.enchant ->> 'kind', 'stars', t.enchant -> 'stars', 'level', t.enchant -> 'level') end,
    'created_at', t.created_at)
$$;

-- the daily screen lists every open ticket with what's on it
select private.fn_patch('private.daily_json(uuid)',
  $a$'tickets', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'min_rarity', min_rarity, 'source', source) order by created_at), '[]') from public.roll_tickets where player_id = p_uid and used_at is null),$a$,
  $a$'tickets', (select coalesce(jsonb_agg(private.ticket_json(t) order by t.created_at), '[]') from public.roll_tickets t where t.player_id = p_uid and t.used_at is null and t.cancelled_at is null),$a$);

/** your open roll tickets (wherever the daily streak is or isn't on) */
create or replace function public.my_roll_tickets() returns jsonb language sql volatile security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(private.ticket_json(t) order by t.created_at), '[]'::jsonb)
    from public.roll_tickets t where t.player_id = private.require_active_player() and t.used_at is null and t.cancelled_at is null
$$;

-- ---- admin: tickets -----------------------------------------------------------------------------------------------
create or replace function public.admin_roll_tickets(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']);
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return (select coalesce(jsonb_agg(private.ticket_json(t) || jsonb_build_object('used_at', t.used_at, 'cancelled_at', t.cancelled_at, 'plot', t.plot, 'note', t.note,
            'by', (select username from public.profiles where id = t.created_by)) order by (t.used_at is null and t.cancelled_at is null) desc, t.created_at desc), '[]'::jsonb)
    from (select * from public.roll_tickets where player_id = p_player order by created_at desc limit 200) t);
end $$;

/** give a player tickets. p_spec: {rarity, exact, plot_type, shiny, rerolls 0–6, godroll 'echo'|'pantheon', enchant{kind, stars, level, xp, nickname, state}, label, note} */
create or replace function public.admin_grant_ticket(p_player uuid, p_spec jsonb, p_count int default 1) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); s jsonb := coalesce(p_spec, '{}'::jsonb); v_r text := coalesce(nullif(s ->> 'rarity', ''), 'rare');
  v_e jsonb; v_g text := nullif(s ->> 'godroll', ''); v_t text := nullif(s ->> 'plot_type', ''); v_rr int := coalesce((s ->> 'rerolls')::int, 0); i int;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.players where id = p_player) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.plot_rarities where id = v_r) or v_r like 'crown%' then raise exception 'invalid_rarity' using errcode = 'P0001'; end if;
  if v_t is not null and not exists (select 1 from public.plot_types where id = v_t) then raise exception 'invalid_type' using errcode = 'P0001'; end if;
  if v_g is not null and v_g not in ('echo', 'pantheon') then raise exception 'invalid_godroll' using errcode = 'P0001'; end if;
  if v_rr not between 0 and 6 or coalesce(p_count, 0) not between 1 and 100 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  v_e := private.ench_spec_clean(s -> 'enchant');
  if v_r = 'enchanted' and v_e is null then v_e := '{}'::jsonb; end if;
  for i in 1 .. p_count loop
    insert into public.roll_tickets (player_id, min_rarity, source, exact, plot_type, shiny, rerolls, enchant, godroll, label, note, created_by)
    values (p_player, v_r, 'staff', coalesce((s ->> 'exact')::boolean, false), v_t, coalesce((s ->> 'shiny')::boolean, false), v_rr, v_e, v_g,
            nullif(left(btrim(coalesce(s ->> 'label', '')), 60), ''), nullif(left(btrim(coalesce(s ->> 'note', '')), 300), ''), v_uid);
  end loop;
  perform private.audit('rolls.ticket_grant', 'player', p_player::text, jsonb_build_object('spec', s, 'count', p_count));
  perform private.notify(p_player, 'power', v_uid, jsonb_build_object('sub', 'ticket', 'rarity', v_r, 'n', p_count, 'label', nullif(s ->> 'label', ''),
    'exact', coalesce((s ->> 'exact')::boolean, false), 'godroll', v_g, 'kind', v_e ->> 'kind'));
  return public.admin_roll_tickets(p_player);
end $$;

create or replace function public.admin_cancel_ticket(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); t public.roll_tickets;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  update public.roll_tickets set cancelled_at = now() where id = p_id and used_at is null and cancelled_at is null returning * into t;
  if t.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.audit('rolls.ticket_cancelled', 'player', t.player_id::text, jsonb_build_object('ticket', t.id, 'rarity', t.min_rarity));
  return public.admin_roll_tickets(t.player_id);
end $$;

-- ---- admin: an enchantment on their next roll(s) --------------------------------------------------------------------
/** p_mode 'claim' (p_after: on their claim that many from now) or 'luck' (p_slot 1–6 of their next Luck rerolls, null = every roll) */
create or replace function public.admin_grant_enchant_roll(p_player uuid, p_spec jsonb, p_mode text default 'claim', p_after int default 1, p_slot int default null,
  p_count int default 1, p_plot_type text default null, p_shiny boolean default false, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); v_e jsonb := coalesce(private.ench_spec_clean(p_spec), '{}'::jsonb); v_base int; i int;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.players where id = p_player) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if coalesce(p_mode, 'claim') not in ('claim', 'luck') then raise exception 'invalid_mode' using errcode = 'P0001'; end if;
  if p_after is null or p_after not between 1 and 100000 or p_count is null or p_count not between 1 and 100 or (p_slot is not null and p_slot not between 1 and 7) then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if p_plot_type is not null and not exists (select 1 from public.plot_types where id = p_plot_type) then raise exception 'invalid_type' using errcode = 'P0001'; end if;
  v_base := private.roll_count(p_player);
  for i in 0 .. p_count - 1 loop
    insert into private.granted_rolls (player_id, rarity, shiny, at_roll, note, created_by, mode, slot, plot_type, enchant)
    values (p_player, 'enchanted', coalesce(p_shiny, false), case when p_mode = 'luck' then 0 else v_base + p_after + i end, left(p_note, 300), v_uid, p_mode,
            case when p_mode = 'luck' then p_slot end, p_plot_type, v_e);
  end loop;
  perform private.audit('rolls.enchant_grant', 'player', p_player::text, jsonb_build_object('spec', v_e, 'mode', p_mode, 'after', p_after, 'slot', p_slot, 'count', p_count, 'note', p_note));
  return public.admin_roll_grants(p_player);
end $$;

-- event roll lists show the enchantment's recipe and a ticket's grant
select private.fn_patch('public.admin_roll_grants(uuid)',
  $a$'mode', g.mode, 'slot', g.slot,$a$,
  $a$'mode', g.mode, 'slot', g.slot, 'enchant', g.enchant, 'ticket_id', g.ticket_id,$a$);

-- ---- admin: a Godroll lined up ------------------------------------------------------------------------------------
create or replace function public.admin_godroll_queue(p_player uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']);
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'player', private.profile_json(q.player_id), 'kind', q.kind, 'rolls', q.rolls, 'rarity', q.rarity, 'shiny', q.shiny,
            'note', q.note, 'created_at', q.created_at, 'by', (select username from public.profiles where id = q.created_by), 'used_at', q.used_at, 'cancelled_at', q.cancelled_at)
            order by (q.used_at is null and q.cancelled_at is null) desc, q.created_at desc), '[]'::jsonb)
    from (select * from private.godroll_queue where p_player is null or player_id = p_player order by created_at desc limit 100) q);
end $$;

create or replace function public.admin_grant_godroll(p_player uuid, p_kind text, p_rolls int default null, p_rarity text default null, p_shiny boolean default false, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']);
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.players where id = p_player) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if coalesce(p_kind, '') not in ('echo', 'pantheon') then raise exception 'invalid_godroll' using errcode = 'P0001'; end if;
  if p_rolls is not null and p_rolls not between 2 and 7 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if p_rarity is not null and (not exists (select 1 from public.plot_rarities where id = p_rarity) or p_rarity like 'crown%' or p_rarity = 'enchanted') then
    raise exception 'invalid_rarity' using errcode = 'P0001';
  end if;
  insert into private.godroll_queue (player_id, kind, rolls, rarity, shiny, note, created_by) values (p_player, p_kind, p_rolls, p_rarity, coalesce(p_shiny, false), left(p_note, 300), v_uid);
  perform private.audit('rolls.godroll_grant', 'player', p_player::text, jsonb_build_object('kind', p_kind, 'rolls', p_rolls, 'rarity', p_rarity, 'shiny', p_shiny, 'note', p_note));
  return public.admin_godroll_queue(p_player);
end $$;

create or replace function public.admin_cancel_godroll(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); q private.godroll_queue;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  update private.godroll_queue set cancelled_at = now() where id = p_id and used_at is null and cancelled_at is null returning * into q;
  if q.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.audit('rolls.godroll_cancelled', 'player', q.player_id::text, jsonb_build_object('queue', q.id));
  return public.admin_godroll_queue(q.player_id);
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_roll_tickets(uuid)', 'public.admin_grant_ticket(uuid, jsonb, integer)', 'public.admin_cancel_ticket(uuid)',
    'public.admin_grant_enchant_roll(uuid, jsonb, text, integer, integer, integer, text, boolean, text)', 'public.admin_godroll_queue(uuid)',
    'public.admin_grant_godroll(uuid, text, integer, text, boolean, text)', 'public.admin_cancel_godroll(bigint)', 'public.my_roll_tickets()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.godroll_cfg()', 'private.godroll_pool()', 'private.godroll_draw(integer, boolean)', 'private.godroll_decide(uuid, integer, integer, integer)',
    'private.ench_spec_clean(jsonb)', 'private.ench_customize(uuid, jsonb)', 'private.ticket_special(public.roll_tickets)', 'private.ticket_exact(public.roll_tickets)', 'private.ticket_json(public.roll_tickets)',
    'private.luck_roll(uuid, integer, integer, text)', 'private.take_granted_roll(uuid, integer, integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
