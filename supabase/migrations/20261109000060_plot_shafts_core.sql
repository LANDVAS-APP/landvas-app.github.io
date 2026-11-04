-- v0.42 Dig into your own land, all the way to the core. Every planet plot you own has its own shaft
-- (a 4 m square in the middle of the plot) that only you can dig. Below the crust come the mantle and
-- then the core itself; reaching the core is a one-off for each plot: a Core heart, a pile of Ink, and
-- the plot becomes Core rarity — rarer than Singularity, and the only way to get it.
-- Everyone sees your shaft as a real hole in the ground, deeper as you dig.

-- deeper layers (added once; admins' edits to the other layers are kept)
update public.game_config
   set value = jsonb_set(value, '{layers}', (value -> 'layers') || '[
     {"id": "mantle", "name": "The mantle", "to": 12000, "hardness": 60,  "color": "#C2410C", "finds": {"plasma": 34, "core": 30, "gem": 22, "titanium": 14}, "first_ink": 600},
     {"id": "core",   "name": "The core",   "to": 20000, "hardness": 100, "color": "#FFB020", "finds": {"core": 55, "plasma": 30, "gem": 15},                 "first_ink": 1000}
   ]'::jsonb)
       || jsonb_build_object('core_reward', jsonb_build_object('ink', 2500, 'item', 'core_heart'), 'shaft_m', 4)
 where key = 'mining' and not (value -> 'layers') @> '[{"id": "core"}]'::jsonb;
update public.game_config set value = jsonb_set(value, '{items,core_heart}', '{"name": "Core heart", "emoji": "💖"}'::jsonb)
 where key = 'mining' and not (value -> 'items') ? 'core_heart';

-- the Core rarity: never rolled, only earned
update public.game_config
   set value = jsonb_set(value, '{rarities}', (value -> 'rarities') || '[{"id": "core", "name": "Core", "weight": 0, "mult": 3.0, "color": "#FF7A1A"}]'::jsonb)
 where key = 'planets' and not (value -> 'rarities') @> '[{"id": "core"}]'::jsonb;

create table if not exists public.planet_plot_shafts (
  world text not null, gx int not null, gy int not null,
  owner_id uuid not null references public.players (id) on delete cascade,
  depth numeric not null default 0,
  layers_reached int not null default 0,
  cored_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (world, gx, gy)
);
create index if not exists planet_plot_shafts_owner_idx on public.planet_plot_shafts (owner_id);
alter table public.planet_plot_shafts enable row level security;
revoke all on public.planet_plot_shafts from anon, authenticated;

alter table public.feed_events drop constraint if exists feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check
  check (kind in ('join', 'claim', 'publish', 'achievement', 'referral', 'level', 'minigame', 'pvp', 'challenge', 'featured', 'sketch', 'duet', 'stamp',
                  'planet_plot', 'settle', 'exploring', 'playdate', 'dig', 'base', 'core'));
alter table public.player_notifications drop constraint if exists player_notifications_kind_check;
alter table public.player_notifications add constraint player_notifications_kind_check check (kind in (
  'stamp', 'visit', 'checkin', 'inspire', 'sketch_vote', 'note', 'potd', 'duet', 'doodle',
  'friend_request', 'friend_accept', 'sanctuary_visit', 'playdate', 'warp', 'base_visit', 'neighbor', 'core'));

-- plots carry their shaft, so everyone sees the hole
create or replace function private.planet_plot_json(p public.planet_plots, p_viewer uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('gx', p.gx, 'gy', p.gy, 'name', p.name, 'mine', p.owner_id = p_viewer, 'rarity', p.rarity,
    'owner', (select jsonb_build_object('username', pr.username, 'accent', pr.accent_color) from public.profiles pr where pr.id = p.owner_id),
    'base', (select jsonb_build_object('layout', b.layout, 'rev', b.rev) from public.planet_bases b where b.world = p.world and b.gx = p.gx and b.gy = p.gy),
    'shaft', (select jsonb_build_object('depth', round(s.depth, 1), 'cored', s.cored_at is not null) from public.planet_plot_shafts s
               where s.world = p.world and s.gx = p.gx and s.gy = p.gy and s.depth > 0))
$$;

create or replace function private.plot_dig_json(p_uid uuid, p_world text, p_gx int, p_gy int) returns jsonb language sql stable as $$
  select private.dig_json(p_uid, p_world) || jsonb_build_object(
    'gx', p_gx, 'gy', p_gy,
    'depth', coalesce((select s.depth from public.planet_plot_shafts s where s.world = p_world and s.gx = p_gx and s.gy = p_gy), 0),
    'layers_reached', coalesce((select s.layers_reached from public.planet_plot_shafts s where s.world = p_world and s.gx = p_gx and s.gy = p_gy), 0),
    'cored', exists (select 1 from public.planet_plot_shafts s where s.world = p_world and s.gx = p_gx and s.gy = p_gy and s.cored_at is not null),
    'my_shafts', coalesce((select jsonb_agg(jsonb_build_object('gx', s.gx, 'gy', s.gy, 'depth', round(s.depth, 1), 'cored', s.cored_at is not null) order by s.depth desc)
                           from public.planet_plot_shafts s where s.owner_id = p_uid and s.world = p_world), '[]'::jsonb))
$$;

/** Your plot's shaft (or, without a plot, just your tools and energy). */
drop function if exists public.planet_dig_state(text);
create or replace function public.planet_dig_state(p_world text, p_gx int default null, p_gy int default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.miner(v_uid);
  if p_gx is null then return private.dig_json(v_uid, p_world) || jsonb_build_object('depth', 0, 'layers_reached', 0); end if;
  return private.plot_dig_json(v_uid, p_world, p_gx, p_gy);
end $$;

/** Dig into one of your own plots: a batch of taps (sent about once a second). */
drop function if exists public.planet_dig(text, int, jsonb);
create or replace function public.planet_dig(p_world text, p_taps int, p_d jsonb default null, p_gx int default null, p_gy int default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.mine_cfg(); m public.planet_miners%rowtype; s public.space_pilots%rowtype;
  sh public.planet_plot_shafts%rowtype; v_taps int; v_allowed numeric; v_power int; v_depth numeric; v_layers jsonb := c -> 'layers'; v_n int;
  v_layer jsonb; v_li int; v_finds jsonb := '{}'::jsonb; v_new int := 0; v_ink int := 0; i int; f record; v_roll numeric; v_tot numeric; v_acc numeric; v_item text;
  v_first jsonb := '[]'::jsonb; v_bottom numeric; v_cored boolean := false; v_core_ink int := 0; v_old public.planet_shafts%rowtype;
begin
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  if p_gx is null or p_gy is null then raise exception 'dig_own_plot' using errcode = 'P0001'; end if;
  s := private.space_pilot(v_uid);
  if s.location <> p_world or s.dest is not null then raise exception 'land_first' using errcode = 'P0001'; end if;
  -- only the owner digs into a plot
  if not exists (select 1 from public.planet_plots where world = p_world and gx = p_gx and gy = p_gy and owner_id = v_uid) then
    raise exception 'dig_own_plot' using errcode = 'P0001';
  end if;
  m := private.miner(v_uid);
  v_allowed := case when m.last_dig_at is null then 12 else extract(epoch from now() - m.last_dig_at) * coalesce((c ->> 'taps_per_second')::numeric, 6) + 3 end;
  v_taps := least(greatest(coalesce(p_taps, 0), 0), 30, floor(v_allowed)::int, floor(m.energy / coalesce((c -> 'energy' ->> 'per_tap')::numeric, 1))::int);
  if v_taps <= 0 then
    if m.energy < 1 then raise exception 'no_energy' using errcode = 'P0001'; end if;
    return private.plot_dig_json(v_uid, p_world, p_gx, p_gy) || jsonb_build_object('dug', 0, 'finds', '{}'::jsonb);
  end if;
  if not exists (select 1 from public.planet_plot_shafts where world = p_world and gx = p_gx and gy = p_gy) then
    -- your first plot shaft on this world picks up the old world shaft's progress
    select * into v_old from public.planet_shafts where player_id = v_uid and world = p_world;
    insert into public.planet_plot_shafts (world, gx, gy, owner_id, depth, layers_reached)
    values (p_world, p_gx, p_gy, v_uid,
            case when not exists (select 1 from public.planet_plot_shafts where owner_id = v_uid and world = p_world) then coalesce(v_old.depth, 0) else 0 end,
            case when not exists (select 1 from public.planet_plot_shafts where owner_id = v_uid and world = p_world) then coalesce(v_old.layers_reached, 0) else 0 end)
    on conflict do nothing;
    if v_old.player_id is not null then update public.planet_shafts set depth = 0 where player_id = v_uid and world = p_world; end if;
  end if;
  select * into sh from public.planet_plot_shafts where world = p_world and gx = p_gx and gy = p_gy for update;
  -- a plot that changed hands: the shaft goes with it
  if sh.owner_id <> v_uid then update public.planet_plot_shafts set owner_id = v_uid where world = p_world and gx = p_gx and gy = p_gy; end if;
  v_power := private.best_power(m);
  v_n := jsonb_array_length(v_layers);
  v_bottom := (v_layers -> (v_n - 1) ->> 'to')::numeric;
  v_depth := sh.depth;
  for i in 1 .. v_taps loop
    exit when v_depth >= v_bottom;
    v_li := 0;
    while v_li < v_n - 1 and v_depth >= (v_layers -> v_li ->> 'to')::numeric loop v_li := v_li + 1; end loop;
    v_layer := v_layers -> v_li;
    v_depth := least(v_bottom, v_depth + v_power::numeric / (v_layer ->> 'hardness')::numeric);
    if random() < coalesce((c ->> 'find_chance')::numeric, 0.32) then
      select sum(value::numeric) into v_tot from jsonb_each_text(v_layer -> 'finds');
      v_roll := random() * v_tot; v_acc := 0; v_item := null;
      for f in select key, value::numeric w from jsonb_each_text(v_layer -> 'finds') loop
        v_acc := v_acc + f.w; if v_roll < v_acc then v_item := f.key; exit; end if;
      end loop;
      if v_item is not null then v_finds := v_finds || jsonb_build_object(v_item, coalesce((v_finds ->> v_item)::int, 0) + 1); end if;
    end if;
  end loop;
  for v_li in 0 .. v_n - 1 loop
    if v_depth > (case when v_li = 0 then 0 else (v_layers -> (v_li - 1) ->> 'to')::numeric end) and v_li + 1 > sh.layers_reached then
      v_new := v_li + 1; v_ink := v_ink + coalesce((v_layers -> v_li ->> 'first_ink')::int, 0);
      v_first := v_first || jsonb_build_array(v_layers -> v_li ->> 'id');
    end if;
  end loop;
  v_cored := v_depth >= v_bottom and sh.cored_at is null;
  update public.planet_plot_shafts set depth = v_depth, layers_reached = greatest(layers_reached, v_new), updated_at = now(),
         cored_at = case when v_cored then now() else cored_at end
   where world = p_world and gx = p_gx and gy = p_gy;
  update public.planet_miners set energy = m.energy - v_taps * coalesce((c -> 'energy' ->> 'per_tap')::numeric, 1), last_dig_at = now(), taps = taps + v_taps
   where player_id = v_uid;
  for f in select key, value::int n from jsonb_each_text(v_finds) loop
    insert into public.planet_items (player_id, item, qty) values (v_uid, f.key, f.n)
    on conflict (player_id, item) do update set qty = planet_items.qty + excluded.qty;
  end loop;
  -- layer Ink counts toward the world's daily cap
  if v_ink > 0 then v_ink := private.planet_pay_world(v_uid, p_world, v_ink, p_world || ':' || p_gx || ':' || p_gy || ':' || v_new, 'dig-layer:' || v_uid || ':' || p_world || ':' || p_gx || ':' || p_gy || ':' || v_new); end if;
  if v_new > 0 and jsonb_array_length(v_first) > 0 and not v_cored then
    insert into public.feed_events (kind, player_id, data) values ('dig', v_uid, jsonb_build_object('world', p_world, 'layer', v_layers -> (v_new - 1) ->> 'name', 'depth', round(v_depth)));
  end if;
  -- the core: once per plot, a reward outside the daily cap
  if v_cored then
    v_core_ink := coalesce((c -> 'core_reward' ->> 'ink')::int, 2500);
    perform private.grant(v_uid, jsonb_build_object('ink', v_core_ink), 'space', 'planet_core', p_world || ':' || p_gx || ':' || p_gy, 'core:' || p_world || ':' || p_gx || ':' || p_gy);
    insert into public.planet_items (player_id, item, qty) values (v_uid, coalesce(c -> 'core_reward' ->> 'item', 'core_heart'), 1)
    on conflict (player_id, item) do update set qty = planet_items.qty + 1;
    update public.planet_plots set rarity = 'core' where world = p_world and gx = p_gx and gy = p_gy;
    insert into public.feed_events (kind, player_id, data) values ('core', v_uid, jsonb_build_object('world', p_world, 'gx', p_gx, 'gy', p_gy));
    perform private.notify(v_uid, 'core', null, jsonb_build_object('world', p_world, 'gx', p_gx, 'gy', p_gy, 'ink', v_core_ink));
  end if;
  return private.plot_dig_json(v_uid, p_world, p_gx, p_gy) || jsonb_build_object('dug', v_taps, 'finds', v_finds, 'new_layers', v_first, 'layer_ink', v_ink,
    'reached_core', v_cored, 'core_ink', v_core_ink, 'balances', private.balances(v_uid));
end $$;

do $$
declare f text;
begin
  execute 'revoke all on function private.plot_dig_json(uuid, text, int, int) from public';
  foreach f in array array['public.planet_dig_state(text, int, int)', 'public.planet_dig(text, int, jsonb, int, int)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
