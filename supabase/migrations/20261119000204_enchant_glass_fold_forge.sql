-- Enchantments, part 6: the Cuckoo leaves, and three new kinds arrive.
--
--  🥚 Cuckoo     gone. Every Cuckoo that's out becomes a Cuckoo Egg in its owner's Grimoire: they choose what hatches
--                (it keeps its level, XP, Stars, nickname and chronicle, and takes that kind's next serial). Sleeping
--                Cuckoos hatch into a random new kind. Eggs in other players' nests hatch at once (the owner gets the
--                chick's Ink, the host the eject fee); running splices with a Cuckoo end and give their charge back; the
--                Cuckoo hybrids leave every Codex; a Homunculus's Cuckoo parts turn to paper. Trickster becomes Tempered,
--                the Crucible's Trait (the same: half its bad luck slips past; no bad luck, +20% Ink).
--  🔭 Spyglass   3 looks a day at unclaimed plots within 1 km of your explorer or your plots. Each look is a fresh roll
--                from that cell's own odds, made for you alone and kept on the server: claim it within 24 h and that
--                reading is your roll. Anyone else who claims it gets their own roll (a tip is worth nothing), and if
--                they claim it first your look comes back. Crowns never show; a Crown cell stays a Crown. Trait: Farsight.
--  🦢 Origami    fold one of your plots into a paper crane and keep it in your pocket (it keeps earning rent), then
--                unfold it onto any free cell you could claim. It carries its rarity, shine, type, level, game progress
--                and name (its drawing stays in your Studio). The cell it leaves takes the rarity the new cell would have
--                had — folding never leaves a copy behind. A fresh crease: +25% minigame Ink there for a day. Trait: Folded.
--  🔥 Crucible   melt plots (no limit) into Heat and metal. Strike one of your plots on the anvil: its chance to rise a
--                tier grows with the Heat (a little per melt, diminishing; higher tiers need far more). A miss keeps half.
--                The ladder only, up to Mythic — never ultras or Crowns. Metal makes temper runes, artifacts (a
--                horseshoe, a bell, a lantern, an anchor), inlays and monuments. Trait: Tempered.

-- ---- kinds -----------------------------------------------------------------------------------------------------------
alter table public.enchantments drop constraint if exists enchantments_kind_check;
alter table public.enchantments add constraint enchantments_kind_check
  check (kind in ('goose', 'genie', 'map', 'parasite', 'cuckoo', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard', 'wormhole', 'oracle',
                  'ouroboros', 'homunculus', 'stormcoil', 'spyglass', 'origami', 'crucible'));
update public.game_config set value = jsonb_set(value, '{weights}', ('{"spyglass": 1, "origami": 1, "crucible": 1}'::jsonb || coalesce(value -> 'weights', '{}'::jsonb)) - 'cuckoo')
 where key = 'enchantments';

-- an unfold is how a plot arrives somewhere new
alter table public.plot_ownership drop constraint if exists plot_ownership_method_check;
alter table public.plot_ownership add constraint plot_ownership_method_check check (method in ('starter', 'acquire', 'admin_grant', 'purchase', 'unfold'));

-- 🦢 a folded plot stays yours (and keeps earning) — it's just in your pocket
alter table public.world_plots add column if not exists folded_at timestamptz, add column if not exists folded_by uuid;
create index if not exists world_plots_folded_idx on public.world_plots (folded_by) where folded_by is not null;

-- 🔭 every look, kept on the server (and for the fair-play scanners)
create table if not exists private.spy_sightings (
  id bigserial primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  enchant_id uuid references public.enchantments(id) on delete set null,
  gx int not null, gy int not null,
  rarity text not null references public.plot_rarities(id),
  kind text,
  hot boolean not null default false,
  second boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  refunded_at timestamptz
);
create index if not exists spy_sightings_open_idx on private.spy_sightings (gx, gy) where used_at is null and refunded_at is null;
create index if not exists spy_sightings_player_idx on private.spy_sightings (player_id, id desc);

-- 🔥 what the Crucible makes
create table if not exists public.crucible_artifacts (
  id bigserial primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  kind text not null check (kind in ('horseshoe', 'bell', 'lantern', 'anchor')),
  level int not null default 1 check (level between 1 and 5),
  gx int, gy int,
  carried boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists crucible_artifacts_cell_idx on public.crucible_artifacts (gx, gy) where gx is not null;
create index if not exists crucible_artifacts_player_idx on public.crucible_artifacts (player_id);
create table if not exists public.crucible_inlays (
  gx int not null, gy int not null,
  player_id uuid not null references public.players(id) on delete cascade,
  metal text not null check (metal in ('iron', 'copper', 'silver', 'gold', 'platinum', 'starsteel')),
  created_at timestamptz not null default now(),
  primary key (gx, gy)
);
create table if not exists public.crucible_monuments (
  gx int not null, gy int not null,
  player_id uuid not null references public.players(id) on delete cascade,
  name text,
  points int not null default 0,
  tier int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (gx, gy)
);
create index if not exists spy_sightings_enchant_idx on private.spy_sightings (enchant_id);
create index if not exists crucible_inlays_player_idx on public.crucible_inlays (player_id);
create index if not exists crucible_monuments_player_idx on public.crucible_monuments (player_id);
alter table public.crucible_artifacts enable row level security;
alter table public.crucible_inlays enable row level security;
alter table public.crucible_monuments enable row level security;

-- ---- 🔭 Spyglass -------------------------------------------------------------------------------------------------------
-- a fresh roll from this cell's own odds (hot zones count), for one player — the 2% Enchanted chance included, Crowns never
create or replace function private.spy_roll(p_gx int, p_gy int) returns jsonb language plpgsql volatile as $$
declare v_hot boolean := private.in_hot_zone(p_gx, p_gy); c jsonb := private.ench_cfg();
  v_um numeric := case when v_hot then coalesce((private.cfg('hot_zones') ->> 'ultra_mult')::numeric, 5) else 1 end;
  v_u numeric := random() * 1000000; v_acc numeric := 0; r record; v_total int; v_a text; v_b text;
begin
  if coalesce((c ->> 'enabled')::boolean, true) and random() * 100 < coalesce((c ->> 'base_pct')::numeric, 2) then
    return jsonb_build_object('rarity', 'enchanted', 'kind', private.ench_pick_kind());
  end if;
  for r in select id, ppm from public.plot_rarities where ppm > 0 and id not like 'crown%' order by ppm, sort loop
    v_acc := v_acc + r.ppm * v_um;
    if v_u < v_acc then return jsonb_build_object('rarity', r.id); end if;
  end loop;
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  if v_total = 0 then return jsonb_build_object('rarity', 'common'); end if;
  v_a := private.rarity_pick(floor(random() * v_total)::int);
  if v_hot then
    v_b := private.rarity_pick(floor(random() * v_total)::int);
    if (select sort from public.plot_rarities where id = v_b) > (select sort from public.plot_rarities where id = v_a) then v_a := v_b; end if;
  end if;
  return jsonb_build_object('rarity', v_a);
end $$;

-- how good a reading is (ultras above Mythic, an Enchanted one between Epic and Legendary)
create or replace function private.spy_rank(p_rarity text) returns numeric language sql stable as $$
  select case when p_rarity = 'enchanted' then 4.5 else coalesce((select case when ppm > 0 then 7 + 1000.0 / greatest(ppm, 1) else sort end
                                                                   from public.plot_rarities where id = p_rarity), 0) end
$$;

-- within reach of your explorer, or of any of your plots
create or replace function private.spy_in_range(p_uid uuid, p_gx int, p_gy int, p_m numeric) returns boolean language plpgsql stable as $$
declare c record; v_cells int := ceil(p_m / 3)::int + 2;
begin
  select * into c from private.explorer_now(p_uid);
  if found and c.gx is not null and private.ench_cell_m(c.gx, c.gy, p_gx, p_gy) <= p_m then return true; end if;
  return exists (select 1 from public.world_plots w where w.owner_id = p_uid
                   and w.gx between p_gx - v_cells and p_gx + v_cells and w.gy between p_gy - v_cells and p_gy + v_cells
                   and private.ench_cell_m(w.gx, w.gy, p_gx, p_gy) <= p_m);
end $$;

create or replace function private.spy_eval(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); v_max int := 3 + case when e.stars >= 1 then 1 else 0 end;
  v_per numeric := private.ench_n('spyglass', 'recharge_h', 8) * 3600 * case when e.stars >= 1 then 0.75 else 1 end;
  v_n int := coalesce((s ->> 'looks')::int, v_max); v_at numeric := coalesce((s ->> 'look_at')::numeric, v_now); v_gain int;
begin
  if v_n < v_max then
    v_gain := floor(greatest(0, v_now - v_at) / v_per)::int;
    if v_gain > 0 then v_n := least(v_max, v_n + v_gain); v_at := v_at + v_gain * v_per; end if;
  end if;
  if v_n >= v_max then v_n := least(v_n, v_max); v_at := v_now; end if;
  return jsonb_build_object('looks', v_n, 'max', v_max, 'look_at', v_at, 'recharge_s', round(v_per),
    'next_in', case when v_n < v_max then greatest(0, round(v_at + v_per - v_now)) end,
    'range_m', private.ench_n('spyglass', 'range_m', 1000) * case when e.stars >= 2 then 3 else 1 end,
    'keep_h', private.ench_n('spyglass', 'keep_h', 24));
end $$;

create or replace function private.spy_json(p_id bigint) returns jsonb language sql stable as $$
  select jsonb_build_object('id', s.id, 'gx', s.gx, 'gy', s.gy, 'rarity', s.rarity, 'kind', s.kind, 'hot', s.hot, 'second', s.second,
           'at', s.created_at, 'expires_at', s.expires_at, 'expires_in', greatest(0, round(extract(epoch from s.expires_at - now()))),
           'used', s.used_at is not null, 'refunded', s.refunded_at is not null, 'expired', s.used_at is null and s.refunded_at is null and s.expires_at <= now())
    from private.spy_sightings s where s.id = p_id
$$;

-- a claim of a cell you looked at: the reading is the roll
create or replace function private.spy_take(p_uid uuid, p_gx int, p_gy int) returns jsonb language plpgsql as $$
declare v private.spy_sightings;
begin
  select * into v from private.spy_sightings where player_id = p_uid and gx = p_gx and gy = p_gy and used_at is null and refunded_at is null and expires_at > now()
   order by id desc limit 1 for update;
  if v.id is null then return null; end if;
  update private.spy_sightings set used_at = now() where id = v.id;
  return jsonb_build_object('id', v.id, 'rarity', v.rarity, 'kind', v.kind, 'enchant_id', v.enchant_id);
end $$;

-- someone claimed a cell other players had looked at: their looks come back
create or replace function private.spy_claimed(p_uid uuid, p_gx int, p_gy int) returns void language plpgsql as $$
declare v record; x public.enchantments; g jsonb;
begin
  for v in update private.spy_sightings set refunded_at = now()
            where gx = p_gx and gy = p_gy and player_id <> p_uid and used_at is null and refunded_at is null and expires_at > now()
        returning player_id, enchant_id loop
    select * into x from public.enchantments where id = v.enchant_id and kind = 'spyglass' and status = 'active' for update;
    if x.id is not null then
      g := private.spy_eval(x, private.ench_now(x));
      update public.enchantments set state = state || jsonb_build_object('looks', least((g ->> 'max')::int, (g ->> 'looks')::int + 1), 'look_at', (g ->> 'look_at')::numeric)
       where id = x.id;
    end if;
    perform private.notify(v.player_id, 'enchant', p_uid, jsonb_build_object('sub', 'spy_refund', 'kind', 'spyglass', 'gx', p_gx, 'gy', p_gy));
  end loop;
end $$;

-- the glass's prospector's fee: a sighted plot you claimed pays the Spyglass
create or replace function private.spy_paid(p_sight jsonb, p_uid uuid) returns jsonb language plpgsql as $$
declare e public.enchantments; v_pay jsonb;
begin
  select * into e from public.enchantments where id = (p_sight ->> 'enchant_id')::uuid and owner_id = p_uid and status = 'active';
  if e.id is null then return null; end if;
  perform private.ench_stat(e.id, 'claimed');
  v_pay := private.ench_pay(e.id, 12 * private.ench_rarity_factor(case when p_sight ->> 'rarity' = 'enchanted' then 'epic' else p_sight ->> 'rarity' end),
                            'claimed a plot it sighted (' || (p_sight ->> 'rarity') || ')');
  perform private.ench_event(e.id, 'prospected', jsonb_build_object('rarity', p_sight ->> 'rarity', 'kind', p_sight ->> 'kind', 'ink', v_pay -> 'paid'));
  return v_pay;
end $$;

create or replace function private.ench_act_spyglass(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; g jsonb := private.spy_eval(e, t); r jsonb; v_gx int; v_gy int; v_roll jsonb; v_id bigint; w public.world_plots;
  v_sg private.spy_sightings; v_day text := private.today()::text; v_better boolean;
begin
  case p_action
    when 'look' then
      v_gx := (a ->> 'gx')::int; v_gy := (a ->> 'gy')::int;
      if v_gx is null or v_gy is null or v_gx not between 0 and 4194303 or v_gy not between 0 and 4194303 then raise exception 'invalid_plot' using errcode = 'P0001'; end if;
      if (g ->> 'looks')::int < 1 then raise exception 'no_looks' using errcode = 'P0001'; end if;
      select * into w from public.world_plots where gx = v_gx and gy = v_gy;
      if w.owner_id is not null or coalesce(w.locked, false) then raise exception 'plot_taken' using errcode = 'P0001'; end if;
      if exists (select 1 from private.spy_sightings where player_id = e.owner_id and gx = v_gx and gy = v_gy and used_at is null and refunded_at is null and expires_at > now()) then
        raise exception 'already_sighted' using errcode = 'P0001';
      end if;
      if not private.spy_in_range(e.owner_id, v_gx, v_gy, (g ->> 'range_m')::numeric) then raise exception 'out_of_range' using errcode = 'P0001'; end if;
      v_roll := private.spy_roll(v_gx, v_gy);
      insert into private.spy_sightings (player_id, enchant_id, gx, gy, rarity, kind, hot, expires_at)
      values (e.owner_id, e.id, v_gx, v_gy, v_roll ->> 'rarity', v_roll ->> 'kind', private.in_hot_zone(v_gx, v_gy),
              now() + make_interval(hours => (g ->> 'keep_h')::int))
      returning id into v_id;
      s := s || jsonb_build_object('looks', (g ->> 'looks')::int - 1, 'look_at', (g ->> 'look_at')::numeric);
      perform private.ench_stat(e.id, 'looks');
      if private.spy_rank(v_roll ->> 'rarity') >= 5 then perform private.ench_stat(e.id, 'grand'); end if;
      perform private.ench_xp(e.id, 1);
      perform private.ench_event(e.id, 'sighted', jsonb_build_object('rarity', v_roll ->> 'rarity', 'kind', v_roll ->> 'kind', 'gx', v_gx, 'gy', v_gy));
      r := jsonb_build_object('sighting', private.spy_json(v_id));
    when 'second' then
      -- ★3 Second Sight: a second reading of a sighted plot, and keep the better one
      if e.stars < 3 then raise exception 'stars_locked' using errcode = 'P0001', detail = '3'; end if;
      if s ->> 'second_day' = v_day then raise exception 'already_today' using errcode = 'P0001'; end if;
      select * into v_sg from private.spy_sightings where id = (a ->> 'id')::bigint and player_id = e.owner_id
         and used_at is null and refunded_at is null and expires_at > now() for update;
      if v_sg.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
      if v_sg.second then raise exception 'already_second' using errcode = 'P0001'; end if;
      v_roll := private.spy_roll(v_sg.gx, v_sg.gy);
      v_better := private.spy_rank(v_roll ->> 'rarity') > private.spy_rank(v_sg.rarity);
      update private.spy_sightings set second = true,
        rarity = case when v_better then v_roll ->> 'rarity' else rarity end, kind = case when v_better then v_roll ->> 'kind' else kind end
       where id = v_sg.id;
      s := s || jsonb_build_object('second_day', v_day);
      perform private.ench_event(e.id, 'second_sight', jsonb_build_object('was', v_sg.rarity, 'drew', v_roll ->> 'rarity', 'better', v_better));
      r := jsonb_build_object('sighting', private.spy_json(v_sg.id), 'drew', v_roll, 'was', v_sg.rarity, 'better', v_better);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_spyglass(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare g jsonb := private.spy_eval(e, t); v_open jsonb; v_hist jsonb; c record;
begin
  select coalesce(jsonb_agg(private.spy_json(s.id) order by s.id desc), '[]'::jsonb) into v_open from private.spy_sightings s
   where s.enchant_id = e.id and s.used_at is null and s.refunded_at is null and s.expires_at > now();
  select coalesce(jsonb_agg(private.spy_json(x.id) order by x.id desc), '[]'::jsonb) into v_hist from (
    select s.id from private.spy_sightings s where s.enchant_id = e.id and not (s.used_at is null and s.refunded_at is null and s.expires_at > now())
     order by s.id desc limit 12) x;
  select * into c from private.explorer_now(e.owner_id);
  return g || jsonb_build_object('sightings', v_open, 'history', v_hist,
    'explorer', case when c.gx is not null then jsonb_build_array(c.gx, c.gy) end,
    'second_ready', e.stars >= 3 and coalesce(e.state ->> 'second_day', '') <> private.today()::text,
    'looks_total', coalesce((e.stats ->> 'looks')::int, 0), 'claimed', coalesce((e.stats ->> 'claimed')::int, 0),
    'attention', case when (g ->> 'looks')::int > 0 then case when (g ->> 'looks')::int = 1 then 'A look is ready' else (g ->> 'looks') || ' looks are ready' end end);
end $$;

-- ---- 🦢 Origami Pocket --------------------------------------------------------------------------------------------------
-- the rarity a cell would give its next claim, with no Crown (what the cell a plot leaves takes on)
create or replace function private.cell_ladder_rarity(p_gx int, p_gy int) returns text language plpgsql stable as $$
declare v_total int; r record; v_hot boolean := private.in_hot_zone(p_gx, p_gy);
  v_um numeric := case when v_hot then coalesce((private.cfg('hot_zones') ->> 'ultra_mult')::numeric, 5) else 1 end;
  v_u bigint := abs(private.cell_roll('ultra', p_gx, p_gy)) % 1000000; v_uacc numeric := 0; v_a text; v_b text;
begin
  for r in select id, ppm from public.plot_rarities where ppm > 0 and id not like 'crown%' order by ppm, sort loop
    v_uacc := v_uacc + r.ppm * v_um;
    if v_u < v_uacc then return r.id; end if;
  end loop;
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  if v_total = 0 then return 'common'; end if;
  v_a := private.rarity_pick(private.cell_roll('rarity', p_gx, p_gy) % v_total);
  if not v_hot then return v_a; end if;
  v_b := private.rarity_pick(abs(private.cell_roll('hot' || private.today()::text, p_gx, p_gy)) % v_total);
  return case when (select sort from public.plot_rarities where id = v_b) > (select sort from public.plot_rarities where id = v_a) then v_b else v_a end;
end $$;

create or replace function private.ori_eval(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t);
  v_max int := 1 + case when e.level >= 5 then 1 else 0 end + case when e.level >= 10 then 1 else 0 end;
  v_per numeric := private.ench_n('origami', 'recharge_h', 24) * 3600 / v_max;
  v_n int := coalesce((s ->> 'folds')::int, v_max); v_at numeric := coalesce((s ->> 'fold_at')::numeric, v_now); v_gain int;
begin
  if v_n < v_max then
    v_gain := floor(greatest(0, v_now - v_at) / v_per)::int;
    if v_gain > 0 then v_n := least(v_max, v_n + v_gain); v_at := v_at + v_gain * v_per; end if;
  end if;
  if v_n >= v_max then v_n := least(v_n, v_max); v_at := v_now; end if;
  return jsonb_build_object('folds', v_n, 'max', v_max, 'fold_at', v_at, 'next_in', case when v_n < v_max then greatest(0, round(v_at + v_per - v_now)) end,
    'pocket_max', case when e.stars >= 1 then 3 else 1 end,
    'pocket', (select count(*) from public.world_plots where folded_by = e.id and owner_id = e.owner_id),
    'reach_cells', coalesce((private.cfg('explorer') ->> 'claim_reach')::int, 1),
    'far_m', case when e.stars >= 2 then private.ench_n('origami', 'far_m', 50000) else 0 end);
end $$;

-- can this plot be folded? (null = yes, otherwise why not)
create or replace function private.ori_why_not(e public.enchantments, p public.world_plots) returns text language plpgsql stable as $$
declare g public.canvas_groups;
begin
  if p.owner_id is distinct from e.owner_id then return 'not_your_plot'; end if;
  if p.folded_at is not null then return 'already_folded'; end if;
  if p.locked then return 'plot_locked'; end if;
  if p.rarity like 'crown%' then return 'crown'; end if;
  if p.gx = e.gx and p.gy = e.gy then return 'own_plot'; end if;
  if p.rarity = 'enchanted' and e.stars < 3 then return 'enchanted'; end if;
  if p.rarity = 'enchanted' and exists (select 1 from public.enchantments x where x.gx = p.gx and x.gy = p.gy and x.status = 'active'
                                          and (private.ench_spliced(x.id) or (x.kind = 'stormcoil' and jsonb_typeof(x.state -> 'storm') = 'object'
                                               and not coalesce((x.state -> 'storm' ->> 'settled')::boolean, false))
                                               or (x.kind = 'homunculus' and jsonb_typeof(x.state -> 'awake') = 'object'))) then return 'enchant_busy'; end if;
  select gr.* into g from public.canvas_group_members m join public.canvas_groups gr on gr.id = m.group_id where m.gx = p.gx and m.gy = p.gy;
  if g.id is not null and (g.plot_count <> 1 or g.status <> 'active') then return 'merged'; end if;
  return null;
end $$;

-- can a plot be unfolded here?
create or replace function private.ori_can_land(p_uid uuid, e public.enchantments, p_gx int, p_gy int) returns text language plpgsql stable as $$
declare w public.world_plots; c record; v_reach int := coalesce((private.cfg('explorer') ->> 'claim_reach')::int, 1);
begin
  if p_gx is null or p_gy is null or p_gx not between 0 and 4194303 or p_gy not between 0 and 4194303 then return 'invalid_plot'; end if;
  select * into w from public.world_plots where gx = p_gx and gy = p_gy;
  if w.owner_id is not null or coalesce(w.locked, false) then return 'plot_taken'; end if;
  if exists (select 1 from public.enchantments where gx = p_gx and gy = p_gy and status <> 'gone') then return 'plot_taken'; end if;
  if not private.flag('location_gated_claims') then return null; end if;
  select * into c from private.explorer_now(p_uid);
  if not found or c.gx is null then return 'explorer_required'; end if;
  if private.cell_distance(c.gx, c.gy, p_gx, p_gy) <= v_reach then return null; end if;
  if e.stars >= 2 and private.ench_cell_m(c.gx, c.gy, p_gx, p_gy) <= private.ench_n('origami', 'far_m', 50000) then return null; end if;
  return 'out_of_reach';
end $$;

-- the paper crane lands: the plot (and everything that belongs to it) moves from A to B, and A takes the roll B would have given
create or replace function private.ori_move(e public.enchantments, p public.world_plots, p_gx int, p_gy int) returns jsonb language plpgsql as $$
declare w public.world_plots; v_y text; v_yt text; g public.canvas_groups; v_km numeric; v_ench uuid;
begin
  if p.rarity = 'enchanted' and exists (select 1 from public.enchantments where gx = p_gx and gy = p_gy) then raise exception 'plot_taken' using errcode = 'P0001'; end if;
  perform private.rent_settle(e.owner_id);
  select * into w from public.world_plots where gx = p_gx and gy = p_gy for update;
  -- what the old cell takes on: the new cell's own roll (a released row keeps its own)
  if w.gx is not null then v_y := w.rarity; v_yt := w.plot_type;
  else v_y := private.cell_ladder_rarity(p_gx, p_gy); v_yt := private.plot_type_for(p_gx, p_gy); end if;
  if v_y like 'crown%' or v_y = 'enchanted' then v_y := private.cell_ladder_rarity(p_gx, p_gy); end if;
  -- a living fold carries its enchantment along
  if p.rarity = 'enchanted' then
    select id into v_ench from public.enchantments where gx = p.gx and gy = p.gy and status <> 'gone';
    update public.enchant_buffs set gx = p_gx, gy = p_gy where gx = p.gx and gy = p.gy and enchant_id = v_ench;
    update public.enchantments set gx = p_gx, gy = p_gy, updated_at = now() where id = v_ench;
  end if;
  -- the new cell
  if w.gx is not null then
    update public.world_plots set owner_id = e.owner_id, claimed_at = p.claimed_at, level = p.level, plot_type = p.plot_type, rarity = p.rarity,
           art_publication_id = null, art_rev = null, folded_at = null, folded_by = null, updated_at = now()
     where gx = p_gx and gy = p_gy;
  else
    insert into public.world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at, level)
    values (p_gx, p_gy, p.plot_type, p.rarity, e.owner_id, p.claimed_at, p.level);
  end if;
  update public.world_plots set shiny = p.shiny, name = p.name where gx = p_gx and gy = p_gy;
  -- what belongs to it comes too
  delete from public.plot_game_progress where gx = p_gx and gy = p_gy;
  update public.plot_game_progress set gx = p_gx, gy = p_gy where gx = p.gx and gy = p.gy;
  delete from public.crucible_inlays where gx = p_gx and gy = p_gy;
  delete from public.crucible_monuments where gx = p_gx and gy = p_gy;
  update public.crucible_inlays set gx = p_gx, gy = p_gy where gx = p.gx and gy = p.gy;
  update public.crucible_monuments set gx = p_gx, gy = p_gy, updated_at = now() where gx = p.gx and gy = p.gy;
  update public.crucible_artifacts set gx = p_gx, gy = p_gy where gx = p.gx and gy = p.gy;
  -- the old cell goes back to the world
  select gr.* into g from public.canvas_group_members m join public.canvas_groups gr on gr.id = m.group_id where m.gx = p.gx and m.gy = p.gy for update of gr;
  if g.id is not null then
    delete from public.canvas_group_members where group_id = g.id;
    update public.canvas_groups set status = 'dissolved', plot_count = 0, updated_at = now() where id = g.id;
    if g.project_id is not null then update public.artwork_projects set status = 'archived', updated_at = now() where id = g.project_id; end if;
  end if;
  update public.world_plots set owner_id = null, claimed_at = null, level = 1, art_publication_id = null, art_rev = null, rarity = v_y, plot_type = coalesce(v_yt, plot_type),
         folded_at = null, folded_by = null, updated_at = now()
   where gx = p.gx and gy = p.gy;
  update public.plot_ownership set released_at = now(), release_reason = 'folded away (Origami Pocket)' where gx = p.gx and gy = p.gy and released_at is null;
  insert into public.plot_ownership (gx, gy, player_id, method, cost) values (p_gx, p_gy, e.owner_id, 'unfold', jsonb_build_object('from', jsonb_build_array(p.gx, p.gy)));
  perform private.create_group_with_cells(e.owner_id, jsonb_build_array(jsonb_build_array(p_gx, p_gy)), private.empty_manifest(), null, 'initial');
  insert into public.plot_art_history (gx, gy, publication_id, rev) values (p.gx, p.gy, null, null);
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p.gx, p.gy, p.gx, p.gy), ('ownership', p_gx, p_gy, p_gx, p_gy);
  perform private.enqueue_job('clear_cells', jsonb_build_object('cells', jsonb_build_array(jsonb_build_array(p.gx, p.gy))));
  perform private.spy_claimed(e.owner_id, p_gx, p_gy);
  -- a fresh crease: its minigames pay more for a day
  insert into public.enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, data, expires_at)
  values (e.owner_id, 'crease', p_gx, p_gy, e.id, 1.25, jsonb_build_object('from', jsonb_build_array(p.gx, p.gy)), now() + interval '24 hours');
  v_km := round((private.ench_cell_m(p.gx, p.gy, p_gx, p_gy) / 1000)::numeric, 1);
  return jsonb_build_object('from', jsonb_build_array(p.gx, p.gy), 'to', jsonb_build_array(p_gx, p_gy), 'km', v_km, 'rarity', p.rarity, 'left', v_y, 'enchant', v_ench);
end $$;

create or replace function private.ori_plot_json(p public.world_plots) returns jsonb language sql stable as $$
  select jsonb_build_object('gx', p.gx, 'gy', p.gy, 'rarity', p.rarity, 'plot_type', p.plot_type, 'name', p.name, 'shiny', p.shiny, 'level', p.level,
           'folded_at', p.folded_at, 'art', p.art_publication_id is not null,
           'kind', (select x.kind from public.enchantments x where x.gx = p.gx and x.gy = p.gy and x.status = 'active' and p.rarity = 'enchanted'))
$$;

create or replace function private.ench_act_origami(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; g jsonb := private.ori_eval(e, t); r jsonb; p public.world_plots; v_why text; v_mv jsonb; v_pay jsonb; sp record;
begin
  case p_action
    when 'fold' then
      if (g ->> 'folds')::int < 1 then raise exception 'no_folds' using errcode = 'P0001'; end if;
      if (g ->> 'pocket')::int >= (g ->> 'pocket_max')::int then raise exception 'pocket_full' using errcode = 'P0001'; end if;
      select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int for update;
      if p.gx is null then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
      v_why := private.ori_why_not(e, p);
      if v_why is not null then raise exception '%', v_why using errcode = 'P0001'; end if;
      -- what was stuck to it falls off: a Parasite, a size, a scorch; a splice into it ends
      for sp in select id from public.enchantments x where x.kind = 'parasite' and x.status = 'active' and (x.state -> 'host' ->> 'gx')::int = p.gx and (x.state -> 'host' ->> 'gy')::int = p.gy loop
        update public.enchantments set state = state || jsonb_build_object('host', null, 'rest_until', private.ench_ep(now()) + 3600) where id = sp.id;
      end loop;
      delete from public.enchant_buffs where gx = p.gx and gy = p.gy and kind in ('plot_giant', 'plot_tiny', 'scorch', 'crease');
      update public.enchant_splices set ends_at = now() where mode = 'plot' and plot_gx = p.gx and plot_gy = p.gy and ends_at > now();
      update public.world_plots set folded_at = now(), folded_by = e.id, updated_at = now() where gx = p.gx and gy = p.gy;
      insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p.gx, p.gy, p.gx, p.gy);
      s := s || jsonb_build_object('folds', (g ->> 'folds')::int - 1, 'fold_at', (g ->> 'fold_at')::numeric);
      perform private.ench_stat(e.id, 'folds');
      perform private.ench_xp(e.id, 1);
      perform private.ench_event(e.id, 'folded', jsonb_build_object('gx', p.gx, 'gy', p.gy, 'rarity', p.rarity, 'name', p.name));
      select * into p from public.world_plots where gx = p.gx and gy = p.gy;
      r := jsonb_build_object('folded', private.ori_plot_json(p));
    when 'unfold' then
      select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int and folded_by = e.id and owner_id = e.owner_id for update;
      if p.gx is null then raise exception 'not_folded' using errcode = 'P0001'; end if;
      v_why := private.ori_can_land(e.owner_id, e, (a ->> 'to_gx')::int, (a ->> 'to_gy')::int);
      if v_why is not null then raise exception '%', v_why using errcode = 'P0001'; end if;
      perform pg_advisory_xact_lock(hashtext('cell:' || (a ->> 'to_gx') || ':' || (a ->> 'to_gy')));
      v_mv := private.ori_move(e, p, (a ->> 'to_gx')::int, (a ->> 'to_gy')::int);
      v_pay := private.ench_pay(e.id, 20 + least(40, floor((v_mv ->> 'km')::numeric)), 'unfolded a plot ' || (v_mv ->> 'km') || ' km away');
      perform private.ench_stat(e.id, 'unfolds');
      update public.enchantments set stats = stats || jsonb_build_object('far_km', greatest(coalesce((stats ->> 'far_km')::numeric, 0), (v_mv ->> 'km')::numeric)) where id = e.id;
      perform private.ench_event(e.id, 'unfolded', v_mv || jsonb_build_object('ink', v_pay -> 'paid'));
      insert into public.feed_events (kind, player_id, data)
      values ('enchant', e.owner_id, jsonb_build_object('sub', 'unfolded', 'kind', 'origami', 'rarity', p.rarity, 'km', v_mv -> 'km'));
      select * into p from public.world_plots where gx = (a ->> 'to_gx')::int and gy = (a ->> 'to_gy')::int;
      r := v_mv || jsonb_build_object('pay', v_pay, 'plot', private.ori_plot_json(p));
    when 'smooth' then
      -- unfold it right where it was (no charge back)
      select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int and folded_by = e.id and owner_id = e.owner_id for update;
      if p.gx is null then raise exception 'not_folded' using errcode = 'P0001'; end if;
      update public.world_plots set folded_at = null, folded_by = null, updated_at = now() where gx = p.gx and gy = p.gy;
      insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p.gx, p.gy, p.gx, p.gy);
      perform private.ench_event(e.id, 'smoothed', jsonb_build_object('gx', p.gx, 'gy', p.gy));
      r := jsonb_build_object('smoothed', jsonb_build_array(p.gx, p.gy));
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_origami(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare g jsonb := private.ori_eval(e, t); v_pocket jsonb; v_plots jsonb; c record;
begin
  select coalesce(jsonb_agg(private.ori_plot_json(p) order by p.folded_at), '[]'::jsonb) into v_pocket from public.world_plots p where p.folded_by = e.id and p.owner_id = e.owner_id;
  select coalesce(jsonb_agg(private.ori_plot_json(p) order by p.rarity = 'enchanted' desc, (select sort from public.plot_rarities r where r.id = p.rarity) desc, p.claimed_at desc), '[]'::jsonb)
    into v_plots from (select * from public.world_plots p where p.owner_id = e.owner_id and private.ori_why_not(e, p) is null limit 120) p;
  select * into c from private.explorer_now(e.owner_id);
  return g || jsonb_build_object('pocket_plots', v_pocket, 'plots', v_plots,
    'explorer', case when c.gx is not null then jsonb_build_array(c.gx, c.gy) end, 'gated', private.flag('location_gated_claims'),
    'unfolds', coalesce((e.stats ->> 'unfolds')::int, 0), 'far_km', coalesce((e.stats ->> 'far_km')::numeric, 0),
    'shape', case when e.level >= 10 then 'lotus' when e.level >= 6 then 'frog' when e.level >= 3 then 'boat' else 'crane' end,
    'attention', case when jsonb_array_length(v_pocket) > 0 then 'A folded plot is in your pocket — unfold it somewhere new'
                      when (g ->> 'folds')::int > 0 then 'Ready to fold a plot' end);
end $$;

-- ---- 🔥 Crucible ---------------------------------------------------------------------------------------------------------
create or replace function private.cru_metal(p_rarity text) returns text language sql stable as $$
  select case p_rarity when 'common' then 'iron' when 'uncommon' then 'copper' when 'rare' then 'silver' when 'epic' then 'gold'
                       when 'legendary' then 'platinum' else 'starsteel' end
$$;
create or replace function private.cru_heat_of(p_rarity text, p_shiny boolean) returns numeric language sql stable as $$
  select (case p_rarity when 'common' then 1 when 'uncommon' then 2 when 'rare' then 4 when 'epic' then 8 when 'legendary' then 16 when 'mythic' then 32 else 64 end)
         * case when p_shiny then 2 else 1 end
$$;
-- the ladder a strike climbs, and how much Heat each step wants
create or replace function private.cru_ladder() returns text[] language sql immutable as $$ select array['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] $$;
create or replace function private.cru_need(p_to text) returns numeric language sql stable as $$
  select case p_to when 'uncommon' then private.ench_n('crucible', 'need_uncommon', 10) when 'rare' then private.ench_n('crucible', 'need_rare', 25)
                   when 'epic' then private.ench_n('crucible', 'need_epic', 60) when 'legendary' then private.ench_n('crucible', 'need_legendary', 160)
                   when 'mythic' then private.ench_n('crucible', 'need_mythic', 500) else 1e9 end
$$;
-- the chance a strike lifts a plot to p_to: a little per point of Heat, with diminishing returns
create or replace function private.cru_chance(p_heat numeric, p_to text, p_pump numeric, p_fury boolean) returns numeric language sql stable as $$
  select round(least(case when p_fury then 0.95 else private.ench_n('crucible', 'cap', 0.85) end,
                     private.ench_n('crucible', 'cap', 0.85) * (1 - exp(-greatest(0, p_heat) * (1 + 0.1 * least(1, greatest(0, coalesce(p_pump, 0)))) / private.cru_need(p_to)))
                     * case when p_fury then 1.35 else 1 end)::numeric, 4)
$$;
create or replace function private.cru_next(p_rarity text, p_steps int) returns text language sql stable as $$
  select (private.cru_ladder())[least(6, array_position(private.cru_ladder(), p_rarity) + p_steps)]
$$;
create or replace function private.cru_recipes() returns jsonb language sql immutable as $$
  select '{"runes": {"steady": {"silver": 3}, "fury": {"gold": 2}, "kind": {"copper": 4}},
           "artifacts": {"horseshoe": {"iron": 6}, "bell": {"silver": 4, "iron": 2}, "lantern": {"gold": 3, "silver": 2}, "anchor": {"platinum": 2, "gold": 2}},
           "inlay": 2,
           "points": {"iron": 1, "copper": 2, "silver": 4, "gold": 8, "platinum": 16, "starsteel": 32},
           "tiers": [10, 60, 250, 1000],
           "inlay_bonus": {"iron": 0.03, "copper": 0.04, "silver": 0.06, "gold": 0.08, "platinum": 0.11, "starsteel": 0.15}}'::jsonb
$$;
-- take metal (or raise not_enough_metal)
create or replace function private.cru_spend(s jsonb, p_cost jsonb) returns jsonb language plpgsql stable as $$
declare k text; v numeric; m jsonb := coalesce(s -> 'metal', '{}'::jsonb);
begin
  for k, v in select key, value::numeric from jsonb_each_text(p_cost) loop
    if coalesce((m ->> k)::numeric, 0) < v then raise exception 'not_enough_metal' using errcode = 'P0001', detail = k; end if;
    m := m || jsonb_build_object(k, (m ->> k)::numeric - v);
  end loop;
  return s || jsonb_build_object('metal', m);
end $$;
-- can this plot go into the Crucible? (null = yes)
create or replace function private.cru_why_not_melt(p_uid uuid, p public.world_plots) returns text language plpgsql stable as $$
declare g public.canvas_groups; v_m text;
begin
  if p.owner_id is distinct from p_uid then return 'not_your_plot'; end if;
  if p.locked then return 'plot_locked'; end if;
  if p.folded_at is not null then return 'plot_folded'; end if;
  if p.rarity like 'crown%' then return 'crown'; end if;
  if p.rarity = 'enchanted' then return 'enchanted'; end if;
  if p.claimed_at > now() - make_interval(hours => private.ench_n('crucible', 'melt_min_h', 24)::int) then return 'too_new'; end if;
  select method into v_m from public.plot_ownership where gx = p.gx and gy = p.gy and released_at is null order by id desc limit 1;
  if v_m = 'starter' then return 'starter_plot'; end if;
  select gr.* into g from public.canvas_group_members m join public.canvas_groups gr on gr.id = m.group_id where m.gx = p.gx and m.gy = p.gy;
  if g.id is not null and (g.plot_count <> 1 or g.status <> 'active') then return 'merged'; end if;
  return null;
end $$;
create or replace function private.cru_why_not_strike(p_uid uuid, p public.world_plots) returns text language plpgsql stable as $$
begin
  if p.owner_id is distinct from p_uid then return 'not_your_plot'; end if;
  if p.locked then return 'plot_locked'; end if;
  if p.folded_at is not null then return 'plot_folded'; end if;
  if not (p.rarity = any (private.cru_ladder())) or p.rarity = 'mythic' then return 'cannot_forge'; end if;
  return null;
end $$;
-- the bell you carry rings against the Leviathan
create or replace function private.crucible_bell(p_uid uuid) returns numeric language sql stable as $$
  select least(1.6, 1 + coalesce((select sum(0.15 + 0.05 * (level - 1)) from public.crucible_artifacts where player_id = p_uid and kind = 'bell' and carried), 0))
$$;
-- everything that makes your own Leviathan hits harder (the next update adds more)
create or replace function private.lev_player_mult(p_uid uuid) returns numeric language sql stable as $$ select private.crucible_bell(p_uid) $$;
-- what a plot's minigames get from the Crucible (an inlay, a lantern) and the Origami (a fresh crease)
create or replace function private.forge_plot_mult(p_uid uuid, p_gx int, p_gy int) returns numeric language sql stable as $$
  select (1 + coalesce((select (private.cru_recipes() -> 'inlay_bonus' ->> i.metal)::numeric from public.crucible_inlays i where i.gx = p_gx and i.gy = p_gy and i.player_id = p_uid), 0))
       * (1 + coalesce((select 0.10 + 0.05 * (a.level - 1) from public.crucible_artifacts a where a.gx = p_gx and a.gy = p_gy and a.player_id = p_uid and a.kind = 'lantern'), 0))
       * coalesce((select max(b.mult) from public.enchant_buffs b where b.kind = 'crease' and b.gx = p_gx and b.gy = p_gy and b.player_id = p_uid and b.expires_at > now()), 1)
$$;
create or replace function private.cru_anchored(p_gx int, p_gy int) returns boolean language sql stable as $$
  select exists (select 1 from public.crucible_artifacts a where a.gx = p_gx and a.gy = p_gy and a.kind = 'anchor')
$$;
create or replace function private.cru_set(p_uid uuid) returns boolean language sql stable as $$
  select (select count(distinct kind) from public.crucible_artifacts where player_id = p_uid) >= 4
$$;
create or replace function private.cru_artifact_json(a public.crucible_artifacts) returns jsonb language sql stable as $$
  select jsonb_build_object('id', a.id, 'kind', a.kind, 'level', a.level, 'gx', a.gx, 'gy', a.gy, 'carried', a.carried,
    'power', case a.kind when 'horseshoe' then (1 + a.level) || ' Luck a day'
                         when 'bell' then '+' || round((0.15 + 0.05 * (a.level - 1)) * 100) || '% damage on the Leviathan'
                         when 'lantern' then '+' || round((0.10 + 0.05 * (a.level - 1)) * 100) || '% minigame Ink on its plot'
                         else 'No Parasites or pranks on its plot' end)
$$;
create or replace function private.cru_tier(p_points int) returns int language sql stable as $$
  select coalesce((select max(i) from generate_series(1, 4) i where p_points >= ((private.cru_recipes() -> 'tiers') ->> (i - 1))::int), 0)
$$;

create or replace function private.ench_act_crucible(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; r jsonb; p public.world_plots; g public.canvas_groups; c jsonb; v_why text; v_heat numeric := coalesce((e.state ->> 'heat')::numeric, 0);
  v_n int := 0; v_h numeric; v_gain numeric := 0; v_metal jsonb := '{}'::jsonb; v_m text; v_cnt int; v_to text; v_from text; v_p numeric; v_ok boolean;
  v_rune text; v_free boolean := false; v_keep numeric; v_type text; v_week text := to_char(now(), 'IYYY-IW'); v_master boolean := false; v_pay jsonb;
  art public.crucible_artifacts; art2 public.crucible_artifacts; v_pts int; v_mon public.crucible_monuments; v_name text; v_lk jsonb; v_day text := private.today()::text;
  v_mult numeric := case when e.stars >= 1 then 1.25 else 1 end; k text; v numeric;
begin
  case p_action
    when 'melt' then
      -- one plot or many ({cells: [[gx, gy], …]}), no daily limit
      if jsonb_typeof(a -> 'cells') <> 'array' or jsonb_array_length(a -> 'cells') = 0 then raise exception 'invalid_plot' using errcode = 'P0001'; end if;
      if jsonb_array_length(a -> 'cells') > 25 then raise exception 'too_many' using errcode = 'P0001'; end if;
      perform private.rent_settle(e.owner_id);
      for c in select x from jsonb_array_elements(a -> 'cells') x loop
        select * into p from public.world_plots where gx = (c ->> 0)::int and gy = (c ->> 1)::int for update;
        if p.gx is null then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
        v_why := private.cru_why_not_melt(e.owner_id, p);
        if v_why is not null then raise exception '%', v_why using errcode = 'P0001'; end if;
        select count(*) into v_cnt from public.world_plots where owner_id = e.owner_id;
        if v_cnt <= 1 then raise exception 'last_plot' using errcode = 'P0001'; end if;
        select gr.* into g from public.canvas_group_members m join public.canvas_groups gr on gr.id = m.group_id where m.gx = p.gx and m.gy = p.gy for update of gr;
        if g.id is not null then
          delete from public.canvas_group_members where group_id = g.id;
          update public.canvas_groups set status = 'dissolved', plot_count = 0, updated_at = now() where id = g.id;
          if g.project_id is not null then update public.artwork_projects set status = 'archived', updated_at = now() where id = g.project_id; end if;
        end if;
        -- back to the world at the cell's own roll (a plot Luck lifted can't be handed on)
        update public.world_plots set owner_id = null, claimed_at = null, level = 1, art_publication_id = null, art_rev = null,
               rarity = private.plot_rarity_for(p.gx, p.gy), plot_type = private.plot_type_for(p.gx, p.gy), updated_at = now()
         where gx = p.gx and gy = p.gy;
        update public.plot_ownership set released_at = now(), release_reason = 'melted in the Crucible' where gx = p.gx and gy = p.gy and released_at is null;
        insert into public.plot_art_history (gx, gy, publication_id, rev) values (p.gx, p.gy, null, null);
        insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p.gx, p.gy, p.gx, p.gy);
        perform private.enqueue_job('clear_cells', jsonb_build_object('cells', jsonb_build_array(jsonb_build_array(p.gx, p.gy))));
        v_h := round(private.cru_heat_of(p.rarity, p.shiny) * v_mult, 2);
        v_gain := v_gain + v_h;
        v_m := private.cru_metal(p.rarity);
        v_metal := v_metal || jsonb_build_object(v_m, coalesce((v_metal ->> v_m)::int, 0) + case when coalesce((select ppm from public.plot_rarities where id = p.rarity), 0) > 0 then 3 else 1 end);
        v_n := v_n + 1;
      end loop;
      s := s || jsonb_build_object('heat', round(v_heat + v_gain, 2));
      for k, v in select key, value::numeric from jsonb_each_text(v_metal) loop
        s := jsonb_set(s, '{metal}', coalesce(s -> 'metal', '{}'::jsonb) || jsonb_build_object(k, coalesce((s -> 'metal' ->> k)::numeric, 0) + v));
      end loop;
      perform private.ench_stat(e.id, 'melts', v_n);
      perform private.ench_xp(e.id, v_n);
      perform private.ench_event(e.id, 'melted', jsonb_build_object('n', v_n, 'heat', v_gain, 'metal', v_metal));
      r := jsonb_build_object('melted', v_n, 'heat_gained', v_gain, 'metal_gained', v_metal, 'heat', round(v_heat + v_gain, 2));
    when 'strike' then
      if v_heat <= 0 then raise exception 'no_heat' using errcode = 'P0001'; end if;
      select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int for update;
      if p.gx is null then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
      v_why := private.cru_why_not_strike(e.owner_id, p);
      if v_why is not null then raise exception '%', v_why using errcode = 'P0001'; end if;
      v_rune := nullif(a ->> 'rune', '');
      if v_rune is not null then
        if v_rune not in ('steady', 'fury', 'kind') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
        if e.stars >= 2 then v_free := true;
        elsif coalesce((s -> 'runes' ->> v_rune)::int, 0) < 1 then raise exception 'no_rune' using errcode = 'P0001';
        else s := jsonb_set(s, '{runes}', coalesce(s -> 'runes', '{}'::jsonb) || jsonb_build_object(v_rune, (s -> 'runes' ->> v_rune)::int - 1)); end if;
        if v_rune = 'kind' then
          v_type := a ->> 'type';
          if v_type is null or not exists (select 1 from public.plot_types where id = v_type and weight > 0) then raise exception 'bad_type' using errcode = 'P0001'; end if;
        end if;
      end if;
      v_from := p.rarity; v_to := private.cru_next(p.rarity, 1);
      v_p := private.cru_chance(v_heat, v_to, (a ->> 'pump')::numeric, v_rune = 'fury');
      v_ok := random() < v_p;
      if v_ok then
        v_master := e.stars >= 3 and coalesce(s ->> 'master_week', '') <> v_week and v_to <> 'mythic';
        if v_master then v_to := private.cru_next(p.rarity, 2); s := s || jsonb_build_object('master_week', v_week); end if;
        perform private.rent_settle(e.owner_id);
        update public.world_plots set rarity = v_to, plot_type = coalesce(v_type, plot_type), updated_at = now() where gx = p.gx and gy = p.gy;
        insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p.gx, p.gy, p.gx, p.gy);
        s := s || jsonb_build_object('heat', 0);
        perform private.ench_stat(e.id, 'wins');
        v_pay := private.ench_pay(e.id, 30 * private.ench_rarity_factor(v_to), 'forged a plot to ' || v_to);
        insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'forged', 'kind', 'crucible', 'from', v_from, 'to', v_to));
      else
        v_keep := case when v_rune = 'fury' then 0 when v_rune = 'steady' then 0.75 else 0.5 end;
        s := s || jsonb_build_object('heat', round(v_heat * v_keep, 2));
      end if;
      perform private.ench_stat(e.id, 'strikes');
      perform private.ench_xp(e.id, 2);
      perform private.ench_event(e.id, 'struck', jsonb_build_object('from', v_from, 'to', case when v_ok then v_to end, 'chance', v_p, 'ok', v_ok, 'rune', v_rune, 'heat', v_heat, 'master', v_master));
      r := jsonb_build_object('ok', v_ok, 'from', v_from, 'to', case when v_ok then v_to else private.cru_next(v_from, 1) end, 'chance', v_p, 'roll_heat', v_heat,
                              'heat', (s ->> 'heat')::numeric, 'kept', case when v_ok then null else v_keep end, 'rune', v_rune, 'free_rune', v_free, 'masterwork', v_master,
                              'pay', v_pay, 'gx', p.gx, 'gy', p.gy);
    when 'rune' then
      v_rune := a ->> 'rune';
      if v_rune not in ('steady', 'fury', 'kind') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
      s := private.cru_spend(s, private.cru_recipes() -> 'runes' -> v_rune);
      s := jsonb_set(s, '{runes}', coalesce(s -> 'runes', '{}'::jsonb) || jsonb_build_object(v_rune, coalesce((s -> 'runes' ->> v_rune)::int, 0) + 1));
      perform private.ench_event(e.id, 'rune', jsonb_build_object('rune', v_rune));
      r := jsonb_build_object('rune', v_rune);
    when 'forge' then
      -- an artifact from metal
      v_m := a ->> 'artifact';
      if v_m not in ('horseshoe', 'bell', 'lantern', 'anchor') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
      if (select count(*) from public.crucible_artifacts where player_id = e.owner_id) >= 30 then raise exception 'too_many' using errcode = 'P0001'; end if;
      s := private.cru_spend(s, private.cru_recipes() -> 'artifacts' -> v_m);
      insert into public.crucible_artifacts (player_id, kind) values (e.owner_id, v_m) returning * into art;
      perform private.ench_stat(e.id, 'artifacts');
      perform private.ench_event(e.id, 'artifact', jsonb_build_object('artifact', v_m));
      r := jsonb_build_object('artifact', private.cru_artifact_json(art));
    when 'fuse' then
      -- two of the same, the same level: one a level higher
      select * into art from public.crucible_artifacts where id = (a ->> 'a')::bigint and player_id = e.owner_id for update;
      select * into art2 from public.crucible_artifacts where id = (a ->> 'b')::bigint and player_id = e.owner_id for update;
      if art.id is null or art2.id is null or art.id = art2.id or art.kind <> art2.kind or art.level <> art2.level then raise exception 'bad_target' using errcode = 'P0001'; end if;
      if art.level >= 5 then raise exception 'max_level' using errcode = 'P0001'; end if;
      delete from public.crucible_artifacts where id = art2.id;
      update public.crucible_artifacts set level = level + 1 where id = art.id returning * into art;
      perform private.ench_event(e.id, 'fused', jsonb_build_object('artifact', art.kind, 'level', art.level));
      r := jsonb_build_object('artifact', private.cru_artifact_json(art));
    when 'mount' then
      select * into art from public.crucible_artifacts where id = (a ->> 'id')::bigint and player_id = e.owner_id for update;
      if art.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
      if art.kind in ('horseshoe', 'bell') then
        -- carried, three at most
        if not art.carried and (select count(*) from public.crucible_artifacts where player_id = e.owner_id and carried) >= 3 then raise exception 'hands_full' using errcode = 'P0001'; end if;
        update public.crucible_artifacts set carried = not carried, gx = null, gy = null where id = art.id returning * into art;
      else
        if a ? 'gx' then
          select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int;
          if p.owner_id is distinct from e.owner_id then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
          if exists (select 1 from public.crucible_artifacts where gx = p.gx and gy = p.gy and id <> art.id) then raise exception 'plot_has_artifact' using errcode = 'P0001'; end if;
          update public.crucible_artifacts set gx = p.gx, gy = p.gy, carried = false where id = art.id returning * into art;
        else
          update public.crucible_artifacts set gx = null, gy = null where id = art.id returning * into art;
        end if;
      end if;
      r := jsonb_build_object('artifact', private.cru_artifact_json(art));
    when 'tend' then
      -- the horseshoes you carry bring Luck once a day
      if s ->> 'tend_day' = v_day then raise exception 'already_today' using errcode = 'P0001'; end if;
      select coalesce(sum(1 + level), 0) into v_cnt from public.crucible_artifacts where player_id = e.owner_id and kind = 'horseshoe' and carried;
      if v_cnt = 0 then raise exception 'no_horseshoe' using errcode = 'P0001'; end if;
      v_lk := private.ench_give_luck(e.owner_id, v_cnt, 0);
      s := s || jsonb_build_object('tend_day', v_day);
      perform private.ench_event(e.id, 'tended', jsonb_build_object('luck', v_cnt));
      r := jsonb_build_object('luck', v_cnt, 'given', v_lk);
    when 'inlay' then
      v_m := a ->> 'metal';
      if v_m not in ('iron', 'copper', 'silver', 'gold', 'platinum', 'starsteel') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
      select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int;
      if p.owner_id is distinct from e.owner_id then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
      s := private.cru_spend(s, jsonb_build_object(v_m, (private.cru_recipes() ->> 'inlay')::int));
      insert into public.crucible_inlays (gx, gy, player_id, metal) values (p.gx, p.gy, e.owner_id, v_m)
      on conflict (gx, gy) do update set metal = excluded.metal, player_id = excluded.player_id, created_at = now();
      perform private.ench_event(e.id, 'inlaid', jsonb_build_object('metal', v_m, 'gx', p.gx, 'gy', p.gy));
      r := jsonb_build_object('inlay', jsonb_build_object('gx', p.gx, 'gy', p.gy, 'metal', v_m));
    when 'monument' then
      select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int;
      if p.owner_id is distinct from e.owner_id then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
      if not exists (select 1 from public.crucible_monuments where gx = p.gx and gy = p.gy)
         and (select count(*) from public.crucible_monuments where player_id = e.owner_id) >= 10 then raise exception 'too_many' using errcode = 'P0001'; end if;
      if jsonb_typeof(a -> 'metal') <> 'object' then raise exception 'invalid_action' using errcode = 'P0001'; end if;
      v_pts := 0;
      for k, v in select key, value::numeric from jsonb_each_text(a -> 'metal') loop
        if v < 0 or v <> floor(v) or not (private.cru_recipes() -> 'points' ? k) then raise exception 'invalid_action' using errcode = 'P0001'; end if;
        v_pts := v_pts + (v * (private.cru_recipes() -> 'points' ->> k)::int)::int;
      end loop;
      if v_pts <= 0 then raise exception 'invalid_action' using errcode = 'P0001'; end if;
      s := private.cru_spend(s, a -> 'metal');
      v_name := private.clean_plot_name(a ->> 'name');
      insert into public.crucible_monuments (gx, gy, player_id, name, points, tier) values (p.gx, p.gy, e.owner_id, v_name, v_pts, private.cru_tier(v_pts))
      on conflict (gx, gy) do update set points = public.crucible_monuments.points + excluded.points, name = coalesce(excluded.name, public.crucible_monuments.name),
                                         tier = private.cru_tier(public.crucible_monuments.points + excluded.points), updated_at = now()
      returning * into v_mon;
      update public.enchantments set stats = stats || jsonb_build_object('monument_tier', greatest(coalesce((stats ->> 'monument_tier')::int, 0), v_mon.tier)) where id = e.id;
      perform private.ench_event(e.id, 'monument', jsonb_build_object('gx', p.gx, 'gy', p.gy, 'points', v_mon.points, 'tier', v_mon.tier, 'name', v_mon.name));
      r := jsonb_build_object('monument', jsonb_build_object('gx', v_mon.gx, 'gy', v_mon.gy, 'points', v_mon.points, 'tier', v_mon.tier, 'name', v_mon.name));
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_crucible(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_heat numeric := coalesce((s ->> 'heat')::numeric, 0); v_melt jsonb; v_strike jsonb; v_arts jsonb; v_in jsonb; v_mon jsonb; v_ch jsonb := '{}'::jsonb; k text;
begin
  foreach k in array array['uncommon', 'rare', 'epic', 'legendary', 'mythic'] loop
    v_ch := v_ch || jsonb_build_object(k, private.cru_chance(v_heat, k, 0, false));
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('gx', p.gx, 'gy', p.gy, 'rarity', p.rarity, 'plot_type', p.plot_type, 'name', p.name, 'shiny', p.shiny,
                                               'heat', private.cru_heat_of(p.rarity, p.shiny) * case when e.stars >= 1 then 1.25 else 1 end, 'metal', private.cru_metal(p.rarity))
                            order by (select sort from public.plot_rarities r where r.id = p.rarity), p.claimed_at), '[]'::jsonb)
    into v_melt from (select * from public.world_plots p where p.owner_id = e.owner_id and private.cru_why_not_melt(e.owner_id, p) is null limit 200) p;
  select coalesce(jsonb_agg(jsonb_build_object('gx', p.gx, 'gy', p.gy, 'rarity', p.rarity, 'plot_type', p.plot_type, 'name', p.name, 'shiny', p.shiny,
                                               'to', private.cru_next(p.rarity, 1), 'chance', private.cru_chance(v_heat, private.cru_next(p.rarity, 1), 0, false))
                            order by (select sort from public.plot_rarities r where r.id = p.rarity) desc, p.claimed_at), '[]'::jsonb)
    into v_strike from (select * from public.world_plots p where p.owner_id = e.owner_id and private.cru_why_not_strike(e.owner_id, p) is null limit 200) p;
  select coalesce(jsonb_agg(private.cru_artifact_json(x) order by x.kind, x.level desc, x.id), '[]'::jsonb) into v_arts from public.crucible_artifacts x where x.player_id = e.owner_id;
  select coalesce(jsonb_agg(jsonb_build_object('gx', i.gx, 'gy', i.gy, 'metal', i.metal)), '[]'::jsonb) into v_in from public.crucible_inlays i where i.player_id = e.owner_id;
  select coalesce(jsonb_agg(jsonb_build_object('gx', m.gx, 'gy', m.gy, 'name', m.name, 'points', m.points, 'tier', m.tier) order by m.points desc), '[]'::jsonb) into v_mon
    from public.crucible_monuments m where m.player_id = e.owner_id;
  return jsonb_build_object('heat', v_heat, 'metal', coalesce(s -> 'metal', '{}'::jsonb), 'runes', coalesce(s -> 'runes', '{}'::jsonb), 'chances', v_ch,
    'need', jsonb_build_object('uncommon', private.cru_need('uncommon'), 'rare', private.cru_need('rare'), 'epic', private.cru_need('epic'),
                               'legendary', private.cru_need('legendary'), 'mythic', private.cru_need('mythic')),
    'cap', private.ench_n('crucible', 'cap', 0.85), 'meltable', v_melt, 'strikeable', v_strike, 'artifacts', v_arts, 'inlays', v_in, 'monuments', v_mon,
    'recipes', private.cru_recipes(), 'heat_mult', case when e.stars >= 1 then 1.25 else 1 end, 'free_rune', e.stars >= 2,
    'master_ready', e.stars >= 3 and coalesce(s ->> 'master_week', '') <> to_char(now(), 'IYYY-IW'),
    'tend_ready', coalesce(s ->> 'tend_day', '') <> private.today()::text and exists (select 1 from public.crucible_artifacts where player_id = e.owner_id and kind = 'horseshoe' and carried),
    'set', private.cru_set(e.owner_id), 'melts', coalesce((e.stats ->> 'melts')::int, 0), 'wins', coalesce((e.stats ->> 'wins')::int, 0),
    'strikes', coalesce((e.stats ->> 'strikes')::int, 0), 'melt_min_h', private.ench_n('crucible', 'melt_min_h', 24),
    'types', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'minigame', minigame_name) order by sort), '[]'::jsonb) from public.plot_types where weight > 0),
    'attention', case when coalesce(s ->> 'tend_day', '') <> private.today()::text and exists (select 1 from public.crucible_artifacts where player_id = e.owner_id and kind = 'horseshoe' and carried)
                      then 'Your horseshoes have Luck for you' when v_heat > 0 then 'The Heart is hot — strike a plot' end);
end $$;

-- an inlay, a monument or a plot's artifact goes when the plot leaves its owner (melted, released, sacrificed)
create or replace function private.crucible_plot_trg() returns trigger language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id then
    delete from public.crucible_inlays where gx = new.gx and gy = new.gy and player_id is distinct from new.owner_id;
    delete from public.crucible_monuments where gx = new.gx and gy = new.gy and player_id is distinct from new.owner_id;
    update public.crucible_artifacts set gx = null, gy = null where gx = new.gx and gy = new.gy and player_id is distinct from new.owner_id;
  end if;
  return null;
end $$;
drop trigger if exists world_plots_crucible on public.world_plots;
create trigger world_plots_crucible after update of owner_id on public.world_plots for each row execute function private.crucible_plot_trg();

-- ---- 🥚 a Cuckoo Egg: choose what hatches --------------------------------------------------------------------------------
create or replace function private.ench_hatchable() returns text[] language sql immutable as $$
  select array['spyglass', 'origami', 'crucible']
$$;
create or replace function private.ench_act_egg(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare k text := a ->> 'kind'; v_serial int;
begin
  if p_action <> 'hatch' then raise exception 'hatch_first' using errcode = 'P0001'; end if;
  if k is null or not (k = any (private.ench_hatchable())) then raise exception 'bad_kind' using errcode = 'P0001'; end if;
  insert into private.enchant_serials (kind, n) values (k, 1) on conflict (kind) do update set n = private.enchant_serials.n + 1 returning n into v_serial;
  update public.enchantments set kind = k, serial = v_serial, titles = array(select x from unnest(titles) x where x not in ('Brood Mother', 'Nest Thief')),
         stats = (stats - 'chicks') || jsonb_build_object('hatched_from', 'cuckoo'), updated_at = now()
   where id = e.id;
  perform private.ench_event(e.id, 'hatched_into', jsonb_build_object('kind', k, 'serial', v_serial));
  insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'hatched_into', 'kind', k, 'serial', v_serial));
  return jsonb_build_object('state', private.ench_init(k, t), 'result', jsonb_build_object('hatched', k, 'serial', v_serial));
end $$;

-- ---- the map: sightings (only yours), folded plots, monuments and inlays ------------------------------------------------
create or replace function public.enchant_map3(p_min_gx int, p_min_gy int, p_max_gx int, p_max_gy int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if p_max_gx - p_min_gx > 20000 or p_max_gy - p_min_gy > 20000 then
    return jsonb_build_object('sightings', '[]'::jsonb, 'folds', '[]'::jsonb, 'monuments', '[]'::jsonb, 'inlays', '[]'::jsonb, 'creases', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'sightings', coalesce((select jsonb_agg(private.spy_json(s.id)) from private.spy_sightings s
                           where v_uid is not null and s.player_id = v_uid and s.used_at is null and s.refunded_at is null and s.expires_at > now()
                             and s.gx between p_min_gx - 8 and p_max_gx + 8 and s.gy between p_min_gy - 8 and p_max_gy + 8), '[]'::jsonb),
    'folds', coalesce((select jsonb_agg(jsonb_build_object('gx', w.gx, 'gy', w.gy, 'rarity', w.rarity, 'mine', w.owner_id = v_uid, 'owner_name', pr.username, 'at', w.folded_at))
                       from public.world_plots w left join public.profiles pr on pr.id = w.owner_id
                      where w.folded_at is not null and w.gx between p_min_gx and p_max_gx and w.gy between p_min_gy and p_max_gy limit 200), '[]'::jsonb),
    'monuments', coalesce((select jsonb_agg(jsonb_build_object('gx', m.gx, 'gy', m.gy, 'tier', m.tier, 'points', m.points, 'name', m.name,
                           'owner_name', pr.username, 'mine', m.player_id = v_uid))
                           from public.crucible_monuments m left join public.profiles pr on pr.id = m.player_id
                          where m.tier > 0 and m.gx between p_min_gx - 4 and p_max_gx + 4 and m.gy between p_min_gy - 4 and p_max_gy + 4 limit 200), '[]'::jsonb),
    'inlays', coalesce((select jsonb_agg(jsonb_build_object('gx', i.gx, 'gy', i.gy, 'metal', i.metal))
                        from public.crucible_inlays i where i.gx between p_min_gx and p_max_gx and i.gy between p_min_gy and p_max_gy limit 400), '[]'::jsonb),
    'creases', coalesce((select jsonb_agg(jsonb_build_object('gx', b.gx, 'gy', b.gy, 'until', b.expires_at, 'mine', b.player_id = v_uid))
                         from public.enchant_buffs b where b.kind = 'crease' and b.expires_at > now()
                          and b.gx between p_min_gx and p_max_gx and b.gy between p_min_gy and p_max_gy limit 200), '[]'::jsonb),
    'server_now', extract(epoch from clock_timestamp()));
end $$;
-- ---- hybrids (one table; the next update adds to it) ----------------------------------------------------------------------
create or replace function private.ench_hybrids() returns jsonb language sql immutable as $$
  select '{"genie+goose": ["Wishing Goose", false], "goose+map": ["Treasure Goose", false], "goose+parasite": ["Leech Goose", false], "goose+pandora": ["Cursed Goose", false], "clockwork+goose": ["Clockwork Goose", false], "goose+sizeray": ["Giant Goose", true], "goose+shard": ["Mirror Goose", false], "genie+map": ["Cartographer Djinn", false], "genie+parasite": ["Possessing Djinn", false], "genie+pandora": ["Forbidden Djinn", true], "clockwork+genie": ["Hourglass Djinn", false], "genie+sizeray": ["Colossal Djinn", false], "genie+shard": ["Mirror Djinn", false], "map+parasite": ["Blight Map", false], "map+pandora": ["Map of Woe", false], "clockwork+map": ["Chronomap", false], "map+sizeray": ["Atlas Map", false], "map+shard": ["Looking-Glass Map", true], "pandora+parasite": ["Plague Bearer", false], "clockwork+parasite": ["Tick", false], "parasite+sizeray": ["Behemoth Worm", false], "parasite+shard": ["Doppel-Leech", false], "clockwork+pandora": ["Doomsday Clock", true], "pandora+sizeray": ["Titan’s Box", false], "pandora+shard": ["Box of Mirrors", false], "clockwork+sizeray": ["Grandfather Clock", false], "clockwork+shard": ["Reverse Clock", false], "shard+sizeray": ["Funhouse Mirror", true], "goose+wormhole": ["Warp Goose", false], "genie+wormhole": ["Djinn of Doors", false], "map+wormhole": ["Shortcut Map", true], "parasite+wormhole": ["Burrow Worm", false], "pandora+wormhole": ["Box of Elsewhere", false], "clockwork+wormhole": ["Time Tunnel", true], "sizeray+wormhole": ["Spacefold Ray", false], "shard+wormhole": ["Glass Gate", false], "oracle+wormhole": ["Eye of the Rift", false], "goose+oracle": ["Augur Goose", false], "genie+oracle": ["Djinn of Fate", true], "map+oracle": ["Seer’s Map", false], "oracle+parasite": ["Mind Leech", false], "oracle+pandora": ["Pandora’s Prophecy", true], "clockwork+oracle": ["Clock of Ages", false], "oracle+sizeray": ["Far-Sight Ray", false], "oracle+shard": ["Scrying Glass", false], "goose+ouroboros": ["Eternal Egg", false], "genie+ouroboros": ["Undying Djinn", false], "map+ouroboros": ["Map of Return", false], "ouroboros+parasite": ["Tail-Eater Worm", false], "ouroboros+pandora": ["Box Without End", false], "clockwork+ouroboros": ["Infinity Clock", true], "ouroboros+sizeray": ["Coil Titan", false], "ouroboros+shard": ["Endless Mirror", true], "ouroboros+wormhole": ["Möbius Gate", false], "oracle+ouroboros": ["Eye of Eternity", false], "goose+homunculus": ["Golem Hen", false], "genie+homunculus": ["Flask Djinn", true], "homunculus+map": ["Patchwork Atlas", false], "homunculus+parasite": ["Flesh-Weaver", true], "homunculus+pandora": ["Box of Limbs", false], "clockwork+homunculus": ["Clockwork Golem", false], "homunculus+sizeray": ["Titan-Born", false], "homunculus+shard": ["Glass Golem", false], "homunculus+wormhole": ["Walker Between", false], "homunculus+oracle": ["Many-Eyed Child", false], "goose+stormcoil": ["Thunder Goose", false], "genie+stormcoil": ["Storm Djinn", false], "map+stormcoil": ["Map of Storms", false], "parasite+stormcoil": ["Galvanic Leech", false], "pandora+stormcoil": ["Box of Thunder", false], "clockwork+stormcoil": ["Dynamo Clock", false], "sizeray+stormcoil": ["Plasma Ray", false], "shard+stormcoil": ["Fulgurite", false], "stormcoil+wormhole": ["Storm Gate", false], "oracle+stormcoil": ["Eye of the Storm", true], "homunculus+ouroboros": ["Undying Child", false], "homunculus+stormcoil": ["Galvanized Golem", true], "ouroboros+stormcoil": ["Storm Serpent", false], "clockwork+spyglass": ["Chronoscope", false], "genie+spyglass": ["Djinn’s Eye", false], "goose+spyglass": ["Lookout Goose", false], "homunculus+spyglass": ["Watcher-Child", false], "map+spyglass": ["Pirate’s Glass", true], "oracle+spyglass": ["Seer’s Scope", false], "ouroboros+spyglass": ["Endless Horizon", false], "pandora+spyglass": ["Peeking Box", false], "parasite+spyglass": ["Stalker Worm", false], "shard+spyglass": ["Periscope", false], "sizeray+spyglass": ["Telescopic Ray", true], "spyglass+stormcoil": ["Storm Watcher", false], "spyglass+wormhole": ["Far Glass", false], "clockwork+origami": ["Paper Clock", false], "genie+origami": ["Paper Lamp", false], "goose+origami": ["Thousand-Crane Goose", false], "homunculus+origami": ["Paper Golem", false], "map+origami": ["Folded Atlas", true], "oracle+origami": ["Fortune Teller", true], "origami+ouroboros": ["Möbius Crane", false], "origami+pandora": ["Paper Box", false], "origami+parasite": ["Paper Wasp", false], "origami+shard": ["Mirror Fold", false], "origami+sizeray": ["Pop-Up Titan", false], "origami+spyglass": ["Paper Telescope", false], "origami+stormcoil": ["Kite of Storms", true], "origami+wormhole": ["Paper Portal", true], "clockwork+crucible": ["Forged Gears", false], "crucible+genie": ["Brass Lamp", false], "crucible+goose": ["Gilded Forge", true], "crucible+homunculus": ["Iron Golem", true], "crucible+map": ["Smelter’s Map", false], "crucible+oracle": ["Molten Eye", false], "crucible+origami": ["Tempered Fold", false], "crucible+ouroboros": ["Ring of Fire", false], "crucible+pandora": ["Furnace of Woes", false], "crucible+parasite": ["Slag Worm", false], "crucible+shard": ["Glassblower", true], "crucible+sizeray": ["Titan’s Anvil", false], "crucible+spyglass": ["Brass Spyglass", false], "crucible+stormcoil": ["Thunder Forge", true], "crucible+wormhole": ["Lava Gate", false]}'::jsonb
$$;
create or replace function private.ench_hybrid(p_a text, p_b text) returns jsonb language sql immutable as $$
  select coalesce(private.ench_hybrids() -> (least(p_a, p_b) || '+' || greatest(p_a, p_b)), '["Chimera", false]'::jsonb)
$$;
create or replace function private.ench_hybrid_count() returns int language sql immutable as $$
  select count(*)::int from jsonb_object_keys(private.ench_hybrids())
$$;

-- 🦢 Folded: once a day, the first time it's used, the enchantment's clock folds forward
create or replace function private.ori_folded_clock(p_id uuid) returns void language plpgsql as $$
declare k int := private.ench_has_gene(p_id, 'folded'); v_day text := private.today()::text;
begin
  if k <= 0 then return; end if;
  update public.enchantments set clock_skip = clock_skip + (2 + 2 * k) * 3600, stats = stats || jsonb_build_object('folded_day', v_day)
   where id = p_id and coalesce(stats ->> 'folded_day', '') <> v_day;
  if found then perform private.ench_event(p_id, 'creased', jsonb_build_object('hours', 2 + 2 * k)); end if;
end $$;

CREATE OR REPLACE FUNCTION private.ench_kinds()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select array['goose', 'genie', 'map', 'parasite', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard', 'wormhole', 'oracle',
               'ouroboros', 'homunculus', 'stormcoil', 'spyglass', 'origami', 'crucible']
$function$;

CREATE OR REPLACE FUNCTION private.ench_info(p_kind text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_kind
    when 'goose' then '{"name": "Golden Goose", "emoji": "🪿", "gene": "golden", "gene_name": "Golden"}'
    when 'genie' then '{"name": "Genie", "emoji": "🧞", "gene": "wish", "gene_name": "Wishing"}'
    when 'map' then '{"name": "Treasure Map", "emoji": "🗺️", "gene": "seek", "gene_name": "Seeking"}'
    when 'parasite' then '{"name": "Parasite", "emoji": "🦠", "gene": "spread", "gene_name": "Spreading"}'
    when 'cuckoo' then '{"name": "Cuckoo Egg", "emoji": "🥚", "gene": null, "gene_name": null}'
    when 'pandora' then '{"name": "Pandora’s Box", "emoji": "🏺", "gene": "chaos", "gene_name": "Chaos"}'
    when 'splice' then '{"name": "Splice", "emoji": "🧪", "gene": null, "gene_name": null}'
    when 'clockwork' then '{"name": "Clockwork", "emoji": "⚙️", "gene": "tempo", "gene_name": "Tempo"}'
    when 'sizeray' then '{"name": "Size Ray", "emoji": "📡", "gene": "grow", "gene_name": "Giant"}'
    when 'shard' then '{"name": "Mirror Shard", "emoji": "🪞", "gene": "echo", "gene_name": "Echo"}'
    when 'wormhole' then '{"name": "Wormhole", "emoji": "🌀", "gene": "linked", "gene_name": "Linked"}'
    when 'oracle' then '{"name": "Oracle Eye", "emoji": "👁️", "gene": "foresight", "gene_name": "Foresight"}'
    when 'ouroboros' then '{"name": "Ouroboros", "emoji": "🐍", "gene": "endless", "gene_name": "Endless"}'
    when 'homunculus' then '{"name": "Homunculus", "emoji": "🧫", "gene": "patchwork", "gene_name": "Patchwork"}'
    when 'stormcoil' then '{"name": "Storm Coil", "emoji": "⚡", "gene": "charged", "gene_name": "Charged"}'
    when 'spyglass' then '{"name": "Spyglass", "emoji": "🔭", "gene": "farsight", "gene_name": "Farsight"}'
    when 'origami' then '{"name": "Origami Pocket", "emoji": "🦢", "gene": "folded", "gene_name": "Folded"}'
    when 'crucible' then '{"name": "Crucible", "emoji": "🔥", "gene": "trick", "gene_name": "Tempered"}'
  end::jsonb
$function$;

CREATE OR REPLACE FUNCTION private.ench_init(p_kind text, t timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select case p_kind
    when 'goose' then jsonb_build_object('egg_at', private.ench_ep(t), 'polish', 0, 'chased', '[]'::jsonb, 'eggs', 0, 'streak', 0)
    when 'genie' then jsonb_build_object('wishes', 1, 'charge_at', private.ench_ep(t))
    when 'map' then jsonb_build_object('pieces', '[]'::jsonb, 'next_at', 0)
    when 'parasite' then jsonb_build_object('stage', 0, 'feeds', 0)
    when 'pandora' then jsonb_build_object('evils', '[]'::jsonb, 'cycle', 0)
    when 'splice' then jsonb_build_object('charges', 1, 'charge_at', private.ench_ep(t), 'codex', '[]'::jsonb, 'bonus', 0)
    when 'clockwork' then jsonb_build_object('charge', 30, 'tick_at', private.ench_ep(t))
    when 'sizeray' then jsonb_build_object('shots', 1, 'shot_at', private.ench_ep(t))
    when 'shard' then jsonb_build_object('cracks', 0, 'options', '[]'::jsonb)
    when 'wormhole' then jsonb_build_object('next_open_at', 0)
    when 'oracle' then jsonb_build_object('charges', 1, 'charge_at', private.ench_ep(t))
    when 'ouroboros' then jsonb_build_object('coil', null)
    when 'homunculus' then jsonb_build_object('parts', '[]'::jsonb, 'gen', 1)
    when 'stormcoil' then jsonb_build_object('charge', 30)
    when 'spyglass' then jsonb_build_object('looks', 3, 'look_at', private.ench_ep(t))
    when 'origami' then jsonb_build_object('folds', 1, 'fold_at', private.ench_ep(t))
    when 'crucible' then jsonb_build_object('heat', 0, 'metal', '{}'::jsonb, 'runes', '{}'::jsonb)
    else '{}'::jsonb end
$function$;

CREATE OR REPLACE FUNCTION private.ench_kind_view(e enchantments, t timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  return case e.kind
    when 'goose' then private.ench_view_goose(e, t) when 'genie' then private.ench_view_genie(e, t) when 'map' then private.ench_view_map(e, t)
    when 'parasite' then private.ench_view_parasite(e, t) when 'cuckoo' then jsonb_build_object('egg', true, 'choices', to_jsonb(private.ench_hatchable()), 'attention', 'Your Cuckoo left an egg — choose what hatches') when 'pandora' then private.ench_view_pandora(e, t)
    when 'splice' then private.ench_view_splice(e, t) when 'clockwork' then private.ench_view_clockwork(e, t) when 'sizeray' then private.ench_view_sizeray(e, t)
    when 'wormhole' then private.ench_view_wormhole(e, t) when 'oracle' then private.ench_view_oracle(e, t)
    when 'ouroboros' then private.ench_view_ouroboros(e, t) when 'homunculus' then private.ench_view_homunculus(e, t) when 'stormcoil' then private.ench_view_stormcoil(e, t)
    when 'spyglass' then private.ench_view_spyglass(e, t) when 'origami' then private.ench_view_origami(e, t) when 'crucible' then private.ench_view_crucible(e, t)
    when 'shard' then jsonb_build_object('cracks', coalesce((e.state ->> 'cracks')::int, 0), 'options', coalesce(e.state -> 'options', '[]'::jsonb),
      'reflect', case when coalesce((e.state -> 'reflect' ->> 'until')::numeric, 0) > private.ench_ep(t) then e.state -> 'reflect' end,
      'gaze_in', greatest(0, round(coalesce((e.state ->> 'gazed_at')::numeric, 0) + private.ench_n('shard', 'cooldown_h', 20) * 3600 * case when e.stars >= 2 then 0.6 else 1 end - private.ench_ep(t))),
      'attention', case when coalesce((e.state -> 'reflect' ->> 'until')::numeric, 0) <= private.ench_ep(t)
                         and (jsonb_array_length(coalesce(e.state -> 'options', '[]'::jsonb)) > 0 or coalesce((e.state ->> 'gazed_at')::numeric, 0) + private.ench_n('shard', 'cooldown_h', 20) * 3600 * case when e.stars >= 2 then 0.6 else 1 end <= private.ench_ep(t))
                        then 'The shard shows new reflections' end)
  end;
end $function$;

CREATE OR REPLACE FUNCTION public.enchant_act(p_id uuid, p_action text, p_args jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := private.require_active_player(); e public.enchantments; t timestamptz; x public.enchantments; v jsonb; a jsonb := coalesce(p_args, '{}'::jsonb); sp record;
  v_kind text; v_spark uuid;
begin
  perform private.rate_limit('enchant_act', 1500, 3600);
  select * into e from public.enchantments where id = p_id for update;
  if e.id is null or e.owner_id is distinct from v_uid or e.status <> 'active' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform private.ench_settle(e.id);
  select * into e from public.enchantments where id = p_id;
  t := private.ench_now(e);
  if p_action = 'rename' then
    update public.enchantments set nickname = nullif(left(trim(coalesce(a ->> 'name', '')), 24), ''), updated_at = now() where id = e.id;
    perform private.ench_event(e.id, 'named', jsonb_build_object('name', nullif(left(trim(coalesce(a ->> 'name', '')), 24), '')));
    return private.ench_view(e.id);
  end if;
  -- any enchantment can step out of a splice early (yours, or one a friend spliced you into)
  if p_action = 'separate' then
    for sp in select * from public.enchant_splices zs where (zs.a = e.id or zs.b = e.id) and zs.ends_at > now() loop
      update public.enchant_splices zs set ends_at = now() where zs.grp is not distinct from sp.grp and (sp.grp is not null or zs.id = sp.id) and zs.ends_at > now();
      if sp.mode = 'graft' then update public.enchantments set frozen_until = least(frozen_until, now()) where id = sp.b and frozen_until > now(); end if;
    end loop;
    if not found then raise exception 'no_splice' using errcode = 'P0001'; end if;
    perform private.ench_settle(e.id);
    return private.ench_view(e.id) || jsonb_build_object('result', jsonb_build_object('separated', true), 'balances', private.balances(v_uid));
  end if;
  x := private.ench_reflected(e, t);
  if x.id is not null and p_action not in ('gaze', 'step', 'release') then
    v_kind := x.kind;
    v := case x.kind
      when 'goose' then private.ench_act_goose(x, p_action, a, t) when 'genie' then private.ench_act_genie(x, p_action, a, t) when 'map' then private.ench_act_map(x, p_action, a, t)
      when 'parasite' then private.ench_act_parasite(x, p_action, a, t) when 'spyglass' then private.ench_act_spyglass(x, p_action, a, t) when 'pandora' then private.ench_act_pandora(x, p_action, a, t)
      when 'clockwork' then private.ench_act_clockwork(x, p_action, a, t) when 'sizeray' then private.ench_act_sizeray(x, p_action, a, t) end;
    if v is null then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    update public.enchantments set state = state || jsonb_build_object('r', v -> 'state'), updated_at = now() where id = e.id;
  else
    v_kind := e.kind;
    v := case e.kind
      when 'goose' then private.ench_act_goose(e, p_action, a, t) when 'genie' then private.ench_act_genie(e, p_action, a, t) when 'map' then private.ench_act_map(e, p_action, a, t)
      when 'parasite' then private.ench_act_parasite(e, p_action, a, t) when 'cuckoo' then private.ench_act_egg(e, p_action, a, t) when 'pandora' then private.ench_act_pandora(e, p_action, a, t)
      when 'splice' then private.ench_act_splice(e, p_action, a, t) when 'clockwork' then private.ench_act_clockwork(e, p_action, a, t)
      when 'sizeray' then private.ench_act_sizeray(e, p_action, a, t) when 'shard' then private.ench_act_shard(e, p_action, a, t)
      when 'wormhole' then private.ench_act_wormhole(e, p_action, a, t) when 'oracle' then private.ench_act_oracle(e, p_action, a, t)
      when 'ouroboros' then private.ench_act_ouroboros(e, p_action, a, t) when 'homunculus' then private.ench_act_homunculus(e, p_action, a, t)
      when 'stormcoil' then private.ench_act_stormcoil(e, p_action, a, t)
      when 'spyglass' then private.ench_act_spyglass(e, p_action, a, t) when 'origami' then private.ench_act_origami(e, p_action, a, t)
      when 'crucible' then private.ench_act_crucible(e, p_action, a, t) end;
    -- (an act can rewrite other rows of this enchantment's state — the Oracle fixes a goose's eggs — so only keys the act returns are replaced)
    update public.enchantments set state = v -> 'state', updated_at = now() where id = e.id;
  end if;
  -- 🪿 a golden egg sometimes carries a spark for your Splice (a Platinum egg always does)
  if v_kind = 'goose' and p_action = 'collect' and v -> 'result' ? 'egg' then
    if coalesce((v -> 'result' -> 'egg' ->> 'platinum')::boolean, false) or random() < private.ench_n('splice', 'goose_spark', 0.2) then
      v_spark := private.splice_spark(v_uid, 'goose');
      if v_spark is not null then v := jsonb_set(v, '{result,spark}', 'true'::jsonb); end if;
    end if;
  end if;
  select * into e from public.enchantments where id = p_id;
  if private.ench_titles(e) <> e.titles then
    perform private.ench_event(e.id, 'title', jsonb_build_object('titles', to_jsonb(array(select unnest(private.ench_titles(e)) except select unnest(e.titles)))));
    update public.enchantments set titles = private.ench_titles(e) where id = e.id;
  end if;
  return private.ench_view(e.id) || jsonb_build_object('result', v -> 'result', 'balances', private.balances(v_uid));
end $function$;

CREATE OR REPLACE FUNCTION private.ench_word(p_kind text, p_part text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select ('{"goose": ["Golden", "Hen"], "genie": ["Wishing", "Djinn"], "map": ["Treasure", "Atlas"], "parasite": ["Hungering", "Worm"],
           "pandora": ["Cursed", "Box"], "clockwork": ["Ticking", "Engine"], "sizeray": ["Giant", "Titan"],
           "shard": ["Mirrored", "Glass"], "wormhole": ["Warped", "Gate"], "oracle": ["All-Seeing", "Eye"], "splice": ["Spliced", "Chimera"],
           "ouroboros": ["Endless", "Serpent"], "homunculus": ["Patchwork", "Golem"], "stormcoil": ["Charged", "Storm"],
           "spyglass": ["Far-Seeing", "Spyglass"], "origami": ["Folded", "Crane"], "crucible": ["Molten", "Anvil"]}'::jsonb
          -> p_kind ->> case when p_part = 'adj' then 0 else 1 end)
$function$;

CREATE OR REPLACE FUNCTION private.ench_titles(e enchantments)
 RETURNS text[]
 LANGUAGE sql
 STABLE
AS $function$
  select array_remove(array[
    case when e.level >= 5 then 'Awakened' end, case when e.level >= 10 then 'Ascended' end,
    case when e.stars >= 1 then 'Starlit' end, case when e.stars >= 2 then 'Starforged' end, case when e.stars >= 3 then 'Supernova' end,
    case when e.kind = 'goose' and coalesce((e.stats ->> 'foxes')::int, 0) >= 10 then 'Fox-Bane' end,
    case when e.kind = 'goose' and coalesce((e.stats ->> 'eggs')::int, 0) >= 25 then 'Golden Hen' end,
    case when e.kind = 'goose' and coalesce((e.stats ->> 'best_streak')::int, 0) >= 7 then 'Unbroken' end,
    case when e.kind = 'goose' and coalesce((e.stats ->> 'platinum')::int, 0) >= 1 then 'Platinum' end,
    case when e.kind = 'genie' and coalesce((e.stats ->> 'forbidden')::int, 0) >= 1 then 'Forbidden' end,
    case when e.kind = 'genie' and coalesce((e.stats ->> 'wishes')::int, 0) >= 30 then 'Wishmaster' end,
    case when e.kind = 'genie' and coalesce((e.stats ->> 'freed')::int, 0) >= 1 then 'Liberator' end,
    case when e.kind = 'map' and coalesce((e.stats ->> 'maps')::int, 0) >= 5 then 'Cartographer' end,
    case when e.kind = 'map' and coalesce((e.stats ->> 'pieces')::int, 0) >= 40 then 'Pathfinder' end,
    case when e.kind = 'parasite' and coalesce((e.state ->> 'stage')::int, 0) >= 2 then 'Symbiote' end,
    case when e.kind = 'parasite' and coalesce((e.stats ->> 'feeds')::int, 0) >= 25 then 'Devourer' end,
    case when e.kind = 'pandora' and coalesce((e.stats ->> 'hope')::int, 0) >= 1 then 'Hope-Bringer' end,
    case when e.kind = 'splice' and coalesce((e.stats ->> 'splices')::int, 0) >= 10 then 'Mad Scientist' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'codex', '[]'::jsonb)) >= 36 then 'Chimera Codex' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'codex', '[]'::jsonb)) >= 55 then 'Grand Codex' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'codex', '[]'::jsonb)) >= private.ench_hybrid_count() then 'Codex Complete' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'aberrations', '[]'::jsonb)) >= 1 then 'Aberrant' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'trinities', '[]'::jsonb)) >= 3 then 'Trinitarian' end,
    case when e.kind = 'clockwork' and coalesce((e.stats ->> 'winds')::int, 0) >= 100 then 'Timekeeper' end,
    case when e.kind = 'clockwork' and coalesce((e.stats ->> 'freezes')::int, 0) >= 10 then 'Stopwatch' end,
    case when e.kind = 'sizeray' and coalesce((e.stats ->> 'perfects')::int, 0) >= 10 then 'Sharpshooter' end,
    case when e.kind = 'sizeray' and coalesce((e.stats ->> 'fired')::int, 0) >= 50 then 'Big Bang' end,
    case when e.kind = 'sizeray' and coalesce((e.stats ->> 'grown')::int, 0) >= 10 then 'Colossus' end,
    case when e.kind = 'sizeray' and coalesce((e.stats ->> 'shrunk')::int, 0) >= 10 then 'Ant-Maker' end,
    case when e.kind = 'sizeray' and coalesce((e.stats ->> 'pranks')::int, 0) >= 10 then 'Prankster' end,
    case when e.kind = 'shard' and coalesce((e.stats ->> 'shatters')::int, 0) >= 1 then 'Seven Years' end,
    case when e.kind = 'shard' and coalesce((e.stats ->> 'reflections')::int, 0) >= 20 then 'Many Faces' end,
    case when e.kind = 'wormhole' and coalesce((e.stats ->> 'opens')::int, 0) >= 5 then 'Gatekeeper' end,
    case when e.kind = 'wormhole' and coalesce((e.stats ->> 'far_km')::numeric, 0) >= 1000 then 'Worldwalker' end,
    case when e.kind = 'wormhole' and e.level >= 10 then 'Constellation' end,
    case when e.kind = 'oracle' and coalesce((e.stats ->> 'fulfilled')::int, 0) >= 10 then 'Seer' end,
    case when e.kind = 'oracle' and coalesce((e.stats ->> 'rewrites')::int, 0) >= 10 then 'Fate-Weaver' end,
    case when e.kind = 'ouroboros' and coalesce((e.stats ->> 'circles')::int, 0) >= 1 then 'Eternal' end,
    case when e.kind = 'ouroboros' and coalesce((e.stats ->> 'clean')::int, 0) >= 10 then 'Tail-Catcher' end,
    case when e.kind = 'ouroboros' and coalesce((e.stats ->> 'bites')::int, 0) >= 3 then 'Snakeskin' end,
    case when e.kind = 'homunculus' and coalesce((e.stats ->> 'wakes')::int, 0) >= 1 then 'Alchemist' end,
    case when e.kind = 'homunculus' and coalesce((e.stats ->> 'hearts')::int, 0) >= 3 then 'Generations' end,
    case when e.kind = 'homunculus' and coalesce((e.stats ->> 'max_parts')::int, 0) >= 7 then 'Many Limbs' end,
    case when e.kind = 'stormcoil' and coalesce((e.stats ->> 'storms')::int, 0) >= 10 then 'Stormcaller' end,
    case when e.kind = 'stormcoil' and coalesce((e.stats ->> 'bolts')::int, 0) >= 50 then 'Lightning Hands' end,
    case when e.kind = 'stormcoil' and coalesce((e.stats ->> 'aberrations')::int, 0) >= 1 then 'Galvanist' end,
    case when e.kind = 'spyglass' and coalesce((e.stats ->> 'looks')::int, 0) >= 50 then 'Eagle-Eye' end,
    case when e.kind = 'spyglass' and coalesce((e.stats ->> 'claimed')::int, 0) >= 10 then 'Prospector' end,
    case when e.kind = 'spyglass' and coalesce((e.stats ->> 'grand')::int, 0) >= 1 then 'Far-Seer' end,
    case when e.kind = 'origami' and coalesce((e.stats ->> 'unfolds')::int, 0) >= 10 then 'Paper Crane' end,
    case when e.kind = 'origami' and coalesce((e.stats ->> 'unfolds')::int, 0) >= 100 then 'Thousand Cranes' end,
    case when e.kind = 'origami' and coalesce((e.stats ->> 'far_km')::numeric, 0) >= 100 then 'Far-Folder' end,
    case when e.kind = 'crucible' and coalesce((e.stats ->> 'melts')::int, 0) >= 25 then 'Smelter' end,
    case when e.kind = 'crucible' and coalesce((e.stats ->> 'wins')::int, 0) >= 5 then 'Forgemaster' end,
    case when e.kind = 'crucible' and coalesce((e.stats ->> 'monument_tier')::int, 0) >= 3 then 'Monument Maker' end], null)
$function$;

CREATE OR REPLACE FUNCTION private.ench_star_powers(p_kind text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_kind
    when 'goose' then '[{"name": "Gilded Nest", "emoji": "✨", "text": "Platinum eggs come twice as often (6%)."},
                        {"name": "Fox Hunter", "emoji": "🦊", "text": "Chasing off a fox pays 15 Ink and 3 Luck."},
                        {"name": "Gosling", "emoji": "🐣", "text": "Every 5th egg hatches a gosling: a Rare-or-better roll ticket."}]'
    when 'genie' then '[{"name": "Fourth Wish", "emoji": "🪔", "text": "Holds 4 wishes."},
                        {"name": "Gift of Wishes", "emoji": "🎁", "text": "Once a day, spend a wish on a friend: they get 30 Ink and you get 10."},
                        {"name": "Master’s Boon", "emoji": "👑", "text": "Once a week, a free Epic-or-better roll ticket."}]'
    when 'map' then '[{"name": "Long Arm", "emoji": "🧭", "text": "Pick up pieces from 400 m away and dig from 250 m."},
                      {"name": "Quick Ink", "emoji": "✒️", "text": "A new map is ready in 5 hours, not 10."},
                      {"name": "Mother Lode", "emoji": "💎", "text": "Every chest holds an Epic+ ticket, and Legendary odds triple."}]'
    when 'parasite' then '[{"name": "Quick Jaws", "emoji": "🦷", "text": "Feeds in 14 hours, not 20."},
                           {"name": "Fast Evolver", "emoji": "🧬", "text": "Evolves after 2 and 6 meals, not 3 and 10."},
                           {"name": "Queen", "emoji": "👑", "text": "Every meal is 50% bigger."}]'
    when 'pandora' then '[{"name": "Lighter Lid", "emoji": "🗝️", "text": "Hope comes after 6 evils, not 7."},
                          {"name": "Gilded Gifts", "emoji": "🎁", "text": "Ink gifts from the box are doubled."},
                          {"name": "Greater Hope", "emoji": "🌈", "text": "Hope pays double and brings a Mythic ticket."}]'
    when 'clockwork' then '[{"name": "Mainspring", "emoji": "🌀", "text": "20 turns a day, and it holds 6 hours of charge."},
                            {"name": "Fine Gears", "emoji": "⚙️", "text": "Fast-forward gives 1.5× the time, and freezing costs half."},
                            {"name": "Toll of Hours", "emoji": "🔔", "text": "Once a day, ring it: every other enchantment you own jumps 30 minutes ahead."}]'
    when 'sizeray' then '[{"name": "Fourth Cell", "emoji": "🔋", "text": "Holds 4 shots."},
                          {"name": "Long Burn", "emoji": "⏳", "text": "Sizes on your own plots last twice as long."},
                          {"name": "Titan Beam", "emoji": "🗿", "text": "A PERFECT or GREAT grow on your plot makes it ×3."}]'
    when 'shard' then '[{"name": "Long Gaze", "emoji": "👀", "text": "Reflections last 36 hours, not 24."},
                        {"name": "Quicksilver", "emoji": "🪩", "text": "Gaze again after 12 hours, not 20."},
                        {"name": "Perfect Mirror", "emoji": "🪞", "text": "Its reflections shine with ★1 of the kind they show."}]'
    when 'wormhole' then '[{"name": "Quick Spiral", "emoji": "🌀", "text": "Opens again after 16 hours, not 24."},
                           {"name": "Steady Throat", "emoji": "🕳️", "text": "Every wormhole stays open 6 hours longer."},
                           {"name": "Third Mouth", "emoji": "🔺", "text": "Three-mouthed wormholes at any level, and chests come out double."}]'
    when 'oracle' then '[{"name": "Longer Sight", "emoji": "🃏", "text": "One more card in every prophecy."},
                         {"name": "Fate-Bender", "emoji": "✍️", "text": "One more rewrite per prophecy."},
                         {"name": "Third Eye", "emoji": "👁️", "text": "Holds one more gaze."}]'
    when 'splice' then '[{"name": "Spare Coil", "emoji": "⚗️", "text": "Holds one more charge."},
                         {"name": "Long Graft", "emoji": "🧷", "text": "Every splice lasts 50% longer."},
                         {"name": "Quaternion", "emoji": "✳️", "text": "Splice four at once: a Quad (3 charges)."}]'
    when 'ouroboros' then '[{"name": "Thick Scales", "emoji": "🛡️", "text": "Every loop is 25% less likely to bite."},
                            {"name": "Shed Skin", "emoji": "🐍", "text": "A bite takes only half the bank: the rest is paid."},
                            {"name": "World Serpent", "emoji": "🌍", "text": "Every loop banks double Ink."}]'
    when 'homunculus' then '[{"name": "Quickening", "emoji": "⚡", "text": "Wakes with one part fewer."},
                             {"name": "Long Life", "emoji": "🕯️", "text": "Walks 10 days, not 7, and can be led 3 times a day."},
                             {"name": "Philosopher’s Heart", "emoji": "❤️‍🔥", "text": "Its heart pays double and brings one more Enchanted Luck."}]'
    when 'stormcoil' then '[{"name": "Twin Storms", "emoji": "⛈️", "text": "One more storm a day."},
                            {"name": "Ball Lightning", "emoji": "🔮", "text": "Every bolt you catch pays double."},
                            {"name": "Eye of the Storm", "emoji": "🌪️", "text": "Missed bolts never scorch, and Aberrations strike twice as often."}]'
    when 'spyglass' then '[{"name": "Wide Lens", "emoji": "🔭", "text": "Holds 4 looks, and they come back faster."},
                           {"name": "Long Glass", "emoji": "🌄", "text": "Looks reach 3 km instead of 1 km."},
                           {"name": "Second Sight", "emoji": "👁️", "text": "Once a day, take a second reading of a sighted plot and keep the better one."}]'
    when 'origami' then '[{"name": "Deep Pocket", "emoji": "👝", "text": "Holds 3 folded plots."},
                          {"name": "Paper Crane", "emoji": "🕊️", "text": "Unfold up to 50 km from your explorer."},
                          {"name": "Living Fold", "emoji": "✨", "text": "Fold an enchanted plot, creature and all."}]'
    when 'crucible' then '[{"name": "Great Bellows", "emoji": "🌬️", "text": "+25% Heat from every melt."},
                           {"name": "Master Smith", "emoji": "🔨", "text": "A free rune on every strike."},
                           {"name": "Masterwork", "emoji": "⚒️", "text": "Once a week, a forged plot jumps two tiers."}]'
    else '[]' end::jsonb
$function$;

CREATE OR REPLACE FUNCTION private.lev_move(p_kind text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (('{"goose": ["Egg Bomb", 1.0, 1.0, null], "genie": ["Wish of Ruin", 0.4, 2.4, null], "map": ["Buried Cannon", 1.1, 1.1, null],
            "parasite": ["Leech", 1.0, 1.0, null], "pandora": ["Unleash an Evil", 0.5, 2.0, null],
            "splice": ["Chimera Strike", 1.3, 1.3, null], "clockwork": ["Freeze Time", 0.4, 0.4, "freeze"], "sizeray": ["Shrink Ray", 0.4, 0.4, "shrink"],
            "shard": ["Reflect the Roar", 1.2, 1.2, null], "wormhole": ["Pull Through", 0.6, 0.6, "pull"], "oracle": ["Foretell the Weak Spot", 0.4, 0.4, "foretell"],
            "ouroboros": ["Constrict", 0.8, 1.6, null], "homunculus": ["Patchwork Punch", 0.5, 2.0, null], "stormcoil": ["Lightning Strike", 1.0, 1.8, null],
            "spyglass": ["Spot the Weak Spot", 0.4, 0.4, "foretell"], "origami": ["Paper Shield", 0.6, 0.6, "decoy"], "crucible": ["Molten Pour", 1.1, 2.1, null]}'::jsonb) -> p_kind)
$function$;

CREATE OR REPLACE FUNCTION private.ench_pay(p_id uuid, p_base numeric, p_what text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare e public.enchantments; p jsonb; v numeric := greatest(coalesce(p_base, 0), 0); v_mods jsonb := '[]'::jsonb; v_paid int := 0; v_extra int := 0;
  k int; b record; v_echo boolean := false; v_gift int; v_to uuid; v_x numeric; v_spread numeric := 0; v_xp int := 1; v_ab text; v_lk jsonb;
  v_cell int[]; v_chests int := 0; v_open int; v_cap int := coalesce((private.ench_cfg() ->> 'seek_chest_cap')::int, 25);
  v_chest_ink int := coalesce((private.ench_cfg() ->> 'seek_chest_ink')::int, 50); v_gene text;
begin
  select * into e from public.enchantments where id = p_id;
  if e.owner_id is null or v <= 0 then return jsonb_build_object('paid', 0, 'base', 0, 'mods', '[]'::jsonb, 'chests', 0); end if;
  if e.level > 1 then
    v := v * (1 + coalesce((private.ench_cfg() ->> 'level_bonus')::numeric, 0.06) * (e.level - 1));
    v_mods := v_mods || jsonb_build_object('label', 'Level ' || e.level, 'emoji', '⭐');
  end if;
  if coalesce(e.stars, 0) > 0 then
    v := v * (1 + 0.1 * e.stars);
    v_mods := v_mods || jsonb_build_object('label', repeat('★', e.stars) || ' +' || (10 * e.stars) || '%', 'emoji', '🌟');
  end if;
  for p in select * from jsonb_array_elements(private.ench_partners(p_id)) loop
    k := least(greatest(coalesce((p ->> 'strength')::int, 1), 1), 3);
    v_gene := p ->> 'gene';
    -- 🧫 Patchwork: this reward borrows a Trait from one of the Homunculus's parts
    if v_gene = 'patchwork' then
      v_gene := private.homu_borrow((p ->> 'id')::uuid);
      v_mods := v_mods || jsonb_build_object('label', 'Patchwork borrowed ' || coalesce(
        (select private.ench_info(kk) ->> 'gene_name' from unnest(private.ench_kinds()) kk where private.ench_info(kk) ->> 'gene' = v_gene limit 1), 'a stitch'), 'emoji', '🧫');
    end if;
    case v_gene
      when 'golden' then v := v * (1 + 0.5 * k); v_mods := v_mods || jsonb_build_object('label', 'Golden ×' || (1 + 0.5 * k)::text, 'emoji', '🪿');
      when 'grow' then v := v * (1 + k); v_mods := v_mods || jsonb_build_object('label', 'Giant ×' || (1 + k)::text, 'emoji', '📡');
      when 'chaos' then
        v_x := (array[0.5, 0.75, 1.0])[k] + random() * (array[2.0, 2.75, 3.0])[k];
        v := v * v_x; v_mods := v_mods || jsonb_build_object('label', 'Chaos ×' || round(v_x, 2), 'emoji', '🏺');
      when 'seek' then
        if random() < 0.25 * k then
          select count(*) into v_open from public.seek_chests where player_id = e.owner_id and dug_at is null and expires_at > now();
          if v_open < v_cap then
            -- a real chest, buried right by its plot: dig it up from the Grimoire or the map
            v_cell := private.ench_free_cell(e.gx, e.gy, 2, 7);
            insert into public.seek_chests (player_id, enchant_id, source_id, finder_kind, gx, gy, ink)
            values (e.owner_id, e.id, case when p ->> 'id' is not null then (p ->> 'id')::uuid end, e.kind, v_cell[1], v_cell[2], v_chest_ink);
            v_chests := v_chests + 1;
            v_mods := v_mods || jsonb_build_object('label', 'Seeking: a chest buried by its plot — dig it up!', 'emoji', '🧰');
          else
            v_extra := v_extra + v_chest_ink;
            v_mods := v_mods || jsonb_build_object('label', 'Seeking: a chest +' || v_chest_ink || ' (paid now — ' || v_cap || ' are waiting)', 'emoji', '🧰');
          end if;
        end if;
      when 'spread' then
        v := v * (1 + 0.15 * k); v_spread := greatest(v_spread, 0.1 * k);
        v_mods := v_mods || jsonb_build_object('label', 'Spreading +' || (15 * k) || '%', 'emoji', '🦠');
      when 'echo' then
        if random() < (array[0.35, 0.6, 0.8])[k] then v_echo := true; v_mods := v_mods || jsonb_build_object('label', 'Echo! Paid twice', 'emoji', '🪞'); end if;
      when 'linked' then v := v * (1 + 0.4 * k); v_mods := v_mods || jsonb_build_object('label', 'Linked: a second plot +' || (40 * k) || '%', 'emoji', '🌀');
      when 'foresight' then v := v * (1 + 0.2 * k); v_mods := v_mods || jsonb_build_object('label', 'Foresight +' || (20 * k) || '%', 'emoji', '👁️');
      when 'endless' then v := v * (1 + 0.1 * k); v_mods := v_mods || jsonb_build_object('label', 'Endless +' || (10 * k) || '%', 'emoji', '🐍');
      when 'charged' then v := v * (1 + 0.25 * k); v_mods := v_mods || jsonb_build_object('label', 'Charged +' || (25 * k) || '%', 'emoji', '⚡');
      when 'farsight' then v := v * (1 + 0.15 * k); v_mods := v_mods || jsonb_build_object('label', 'Farsight +' || (15 * k) || '%', 'emoji', '🔭');
      when 'folded' then v := v * (1 + 0.1 * k); v_mods := v_mods || jsonb_build_object('label', 'Folded +' || (10 * k) || '%', 'emoji', '🦢');
      -- (Tempo shows its worth on clocks; borrowed by Patchwork it pays a little)
      when 'tempo' then
        if (p ->> 'gene') = 'patchwork' then v := v * 1.15; v_mods := v_mods || jsonb_build_object('label', 'Tempo +15%', 'emoji', '⚙️'); end if;
      -- Wishing keeps a charge where there are charges; anywhere else it pays
      when 'wish' then
        if e.kind not in ('genie', 'sizeray', 'oracle') then
          v := v * (1 + 0.25 * k); v_mods := v_mods || jsonb_build_object('label', 'Wishing +' || (25 * k) || '%', 'emoji', '🧞');
        end if;
      -- Trickster dodges bad luck where there is bad luck; anywhere else it pays
      when 'trick' then
        if e.kind not in ('goose', 'genie', 'pandora', 'ouroboros', 'stormcoil') then
          v := v * (1 + 0.2 * k); v_mods := v_mods || jsonb_build_object('label', 'Tempered +' || (20 * k) || '%', 'emoji', '🔥');
        end if;
      -- what a plot lends
      when 'inspired' then v := v * 1.2; v_mods := v_mods || jsonb_build_object('label', 'Inspired by your canvas +20%', 'emoji', '🎨');
      when 'wild' then v := v * 1.1; v_xp := v_xp + 1; v_mods := v_mods || jsonb_build_object('label', 'Wild +10% · double XP', 'emoji', '🐾');
      when 'fertile' then v := v * 1.25; v_mods := v_mods || jsonb_build_object('label', 'Fertile farm +25%', 'emoji', '🌾');
      when 'invested' then v_extra := v_extra + 10; v_mods := v_mods || jsonb_build_object('label', 'Invested +10', 'emoji', '💼');
      when 'streak' then
        if random() < 0.2 then v := v * 2; v_mods := v_mods || jsonb_build_object('label', 'Arcade streak ×2', 'emoji', '🕹️'); end if;
      when 'homely' then v := v * 1.15; v_mods := v_mods || jsonb_build_object('label', 'At home +15%', 'emoji', '🏡');
      else null;
    end case;
    -- an Aberration's secret
    v_ab := p ->> 'aberration';
    if v_ab is not null then
      case v_ab
        when 'The Hollow King' then v_xp := v_xp + 2; v_mods := v_mods || jsonb_build_object('label', 'The Hollow King: triple XP', 'emoji', '👑');
        when 'Glitchwing' then if random() < 0.1 then v_lk := private.ench_give_luck(e.owner_id, 0, 1); v_mods := v_mods || jsonb_build_object('label', 'Glitchwing: +1 Enchanted Luck', 'emoji', '🦋'); end if;
        when 'Many-Mouth' then v_lk := private.ench_give_luck(e.owner_id, 3, 0); v_mods := v_mods || jsonb_build_object('label', 'Many-Mouth: +3 Luck', 'emoji', '👄');
        when 'The Unwritten' then v_extra := v_extra + 25; v_mods := v_mods || jsonb_build_object('label', 'The Unwritten +25', 'emoji', '📜');
        when 'Starspawn' then if random() < 0.2 then v_echo := true; v_mods := v_mods || jsonb_build_object('label', 'Starspawn: paid twice', 'emoji', '🌟'); end if;
        when 'Ninefold' then v := v * 1.5; v_mods := v_mods || jsonb_build_object('label', 'Ninefold ×1.5', 'emoji', '🐍');
        else null;
      end case;
    end if;
  end loop;
  -- a grown reward (Size Ray) or an overcharge (a Storm Coil's bolt) is used up here
  for b in delete from public.enchant_buffs where id = (select id from public.enchant_buffs where enchant_id = p_id and kind = 'next_reward' and expires_at > now() order by id limit 1) returning mult, data loop
    v := v * b.mult;
    v_mods := v_mods || case when b.data ->> 'by' = 'storm' then jsonb_build_object('label', 'Overcharged ×' || round(b.mult, 2), 'emoji', '⚡')
                             else jsonb_build_object('label', 'Size-rayed ×' || round(b.mult, 2), 'emoji', '📡') end;
  end loop;
  -- ⚒️ a full set of the Crucible's artifacts
  if private.cru_set(e.owner_id) then v := v * 1.05; v_mods := v_mods || jsonb_build_object('label', 'Smith’s Set +5%', 'emoji', '⚒️'); end if;
  -- Pandora's Plague
  if exists (select 1 from public.enchant_buffs where player_id = e.owner_id and kind = 'curse_plague' and expires_at > now()) then
    v := v * 0.7; v_mods := v_mods || jsonb_build_object('label', 'Plague ×0.7', 'emoji', '🦠');
  end if;
  v := round(v) + v_extra;
  if v_echo then v := v * 2; end if;
  v_paid := private.grant_ink_paced(e.owner_id, v::int, 'enchantment', 'enchantment', p_id::text, null);
  -- Spreading: a spore of it lands on a random player
  if v_spread > 0 and v_paid > 0 then
    v_gift := greatest(1, round(v_paid * v_spread))::int;
    select id into v_to from public.players where id <> e.owner_id and status = 'active' and last_active_at > now() - interval '7 days' order by random() limit 1;
    if v_to is not null then
      perform private.grant_ink_paced(v_to, v_gift, 'enchantment', 'enchantment', p_id::text, null);
      perform private.notify(v_to, 'enchant', e.owner_id, jsonb_build_object('sub', 'spore', 'ink', v_gift, 'kind', e.kind));
    end if;
  end if;
  perform private.ench_stat(p_id, 'ink', v_paid);
  perform private.ench_xp(p_id, v_xp);
  perform private.ench_event(p_id, 'paid', jsonb_build_object('what', p_what, 'ink', v_paid, 'base', round(p_base), 'mods', v_mods, 'chests', v_chests));
  return jsonb_build_object('paid', v_paid, 'base', round(p_base), 'mods', v_mods, 'chests', v_chests);
end $function$;

CREATE OR REPLACE FUNCTION private.ench_minigame_mult(p_uid uuid, p_gx integer, p_gy integer)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
declare m numeric := 1; b record; v_sz jsonb; w record; sp record; v_g text; v_f jsonb;
begin
  v_sz := private.plot_size(p_gx, p_gy);
  if v_sz is not null and (v_sz ->> 'owner')::uuid = p_uid then
    m := m * case when v_sz ->> 'mode' = 'grow' then (v_sz ->> 'mult')::numeric else coalesce((v_sz ->> 'mult')::numeric, 0.7) end;
  end if;
  for b in update public.enchant_buffs set uses = uses - 1 where id = (select id from public.enchant_buffs where player_id = p_uid and kind = 'golden_hour' and expires_at > now() and uses > 0 order by id limit 1) returning mult loop
    m := m * b.mult;
  end loop;
  for b in update public.enchant_buffs set uses = uses - 1 where id = (select id from public.enchant_buffs where player_id = p_uid and kind = 'curse_strife' and expires_at > now() and uses > 0 order by id limit 1) returning mult loop
    m := m * b.mult;
  end loop;
  delete from public.enchant_buffs where player_id = p_uid and uses is not null and uses <= 0;
  -- a Wormhole: either end pays 30% more
  for w in select e.id from public.enchantments e where e.kind = 'wormhole' and e.status = 'active' and e.owner_id = p_uid
             and coalesce((e.state -> 'open' ->> 'until')::numeric, 0) > extract(epoch from now())
             and ((e.gx = p_gx and e.gy = p_gy) or ((e.state -> 'open' ->> 'gx2')::int = p_gx and (e.state -> 'open' ->> 'gy2')::int = p_gy)
                  or ((e.state -> 'open' ->> 'gx3')::int = p_gx and (e.state -> 'open' ->> 'gy3')::int = p_gy)) limit 1 loop
    m := m * 1.3;
    perform private.ench_stat(w.id, 'echoes');
  end loop;
  -- a plot spliced with an enchantment wears its trait
  for sp in select s.*, e.kind ek, e.id eid from public.enchant_splices s join public.enchantments e on e.id = s.a
             where s.mode = 'plot' and s.ends_at > now() and s.player_id = p_uid
               and ((s.plot_gx = p_gx and s.plot_gy = p_gy)
                    or exists (select 1 from public.canvas_group_members m1 join public.canvas_group_members m2 on m2.group_id = m1.group_id
                                where m1.gx = s.plot_gx and m1.gy = s.plot_gy and m2.gx = p_gx and m2.gy = p_gy)) limit 2 loop
    v_g := private.ench_info(sp.ek) ->> 'gene';
    if v_g = 'patchwork' then v_g := private.homu_borrow(sp.eid); end if;
    m := m * case v_g when 'golden' then 1.5 when 'grow' then 2 when 'chaos' then 0.5 + random() * 2 when 'seek' then case when random() < 0.25 then 1.5 else 1 end
                      when 'spread' then 1.15 when 'echo' then case when random() < 0.35 then 2 else 1 end when 'wish' then 1.25 when 'trick' then 1.2
                      when 'tempo' then 1.3 when 'linked' then 1.4 when 'foresight' then 1.2 when 'endless' then 1.1 when 'charged' then 1.25 when 'farsight' then 1.15 when 'folded' then 1.1 when 'homely' then 1.15 else 1 end;
  end loop;
  -- the Crucible's inlay and lantern, and the Origami's fresh crease
  m := m * private.forge_plot_mult(p_uid, p_gx, p_gy);
  -- the Oracle's fortune for this win
  v_f := private.oracle_take(p_uid, 'reward');
  if v_f is not null then m := m * coalesce((v_f ->> 'mult')::numeric, 1); end if;
  return m * private.ench_plot_mult_extra(p_uid, p_gx, p_gy);
end $function$;

CREATE OR REPLACE FUNCTION public.enchant_visitors()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := private.require_active_player();
begin
  return coalesce((select jsonb_agg(v order by v ->> 'at' desc) from (
    select jsonb_build_object('id', e.id, 'kind', case when e.kind = 'shard' then e.state -> 'reflect' ->> 'kind' else e.kind end, 'mirror', e.kind = 'shard',
             'owner', private.profile_json(e.owner_id), 'serial', e.serial,
             'stage', coalesce((st ->> 'stage')::int, 0), 'feeds', coalesce((st ->> 'feeds')::int, 0), 'welcomed', coalesce((st -> 'host' ->> 'welcomed')::boolean, false),
             'gx', coalesce(st -> 'host' -> 'gx', st -> 'egg' -> 'gx'), 'gy', coalesce(st -> 'host' -> 'gy', st -> 'egg' -> 'gy'),
             'at', coalesce(st -> 'host' -> 'at', st -> 'egg' -> 'laid_at'), 'hatch_at', st -> 'egg' -> 'hatch_at',
             'what', case when jsonb_typeof(st -> 'host') = 'object' then 'parasite' else 'egg' end) v
      from public.enchantments e cross join lateral (select case when e.kind = 'shard' then coalesce(e.state -> 'r', '{}'::jsonb) else e.state end st) s
     where e.status = 'active' and e.kind in ('parasite', 'shard')
       and ((st -> 'host' ->> 'owner') = v_uid::text or (st -> 'egg' ->> 'owner') = v_uid::text)) x), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.enchant_visitor_act(p_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := private.require_active_player(); e public.enchantments; st jsonb; v_shard boolean; r jsonb; v_now numeric; v_n jsonb; v_alt jsonb;
begin
  perform private.rate_limit('enchant_visitor', 300, 3600);
  select * into e from public.enchantments where id = p_id for update;
  if e.id is null or e.status <> 'active' then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_shard := e.kind = 'shard';
  st := case when v_shard then coalesce(e.state -> 'r', '{}'::jsonb) else e.state end;
  v_now := private.ench_ep(private.ench_now(e));
  case p_action
    when 'shake' then
      if (st -> 'host' ->> 'owner') is distinct from v_uid::text then raise exception 'not_found' using errcode = 'P0001'; end if;
      if coalesce((st ->> 'stage')::int, 0) >= 2 then raise exception 'symbiote' using errcode = 'P0001'; end if;
      st := st || jsonb_build_object('host', null, 'shaken', coalesce((st ->> 'shaken')::int, 0) + 1, 'rest_until', v_now + 3600);
      perform private.grant_ink_paced(v_uid, 6, 'enchantment', 'shake', e.id::text, null);
      perform private.notify(e.owner_id, 'enchant', v_uid, jsonb_build_object('sub', 'parasite_shaken', 'kind', 'parasite'));
      perform private.ench_event(e.id, 'shaken', jsonb_build_object('by', v_uid));
      r := jsonb_build_object('shaken', true, 'ink', 6);
    when 'welcome' then
      if (st -> 'host' ->> 'owner') is distinct from v_uid::text or coalesce((st ->> 'stage')::int, 0) < 2 then raise exception 'not_found' using errcode = 'P0001'; end if;
      st := jsonb_set(st, '{host,welcomed}', 'true'::jsonb);
      r := jsonb_build_object('welcomed', true);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  if v_shard then update public.enchantments set state = state || jsonb_build_object('r', st) where id = e.id;
  else update public.enchantments set state = st where id = e.id; end if;
  return jsonb_build_object('result', r, 'visitors', public.enchant_visitors(), 'balances', private.balances(v_uid));
end $function$;

CREATE OR REPLACE FUNCTION public.enchant_map(p_min_gx integer, p_min_gy integer, p_max_gx integer, p_max_gy integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if p_max_gx - p_min_gx > 20000 or p_max_gy - p_min_gy > 20000 then
    return jsonb_build_object('plots', '[]'::jsonb, 'attached', '[]'::jsonb, 'giants', '[]'::jsonb, 'sizes', '[]'::jsonb, 'wormholes', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'plots', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'gx', e.gx, 'gy', e.gy, 'kind', e.kind, 'serial', e.serial, 'level', e.level, 'stars', e.stars, 'nickname', e.nickname,
                         'status', e.status, 'mine', e.owner_id = v_uid, 'owner_name', pr.username, 'sigil', e.sigil, 'updated_at', e.updated_at,
                         'partner', (private.ench_partner(e.id) ->> 'kind'), 'frozen', e.frozen_at is not null and now() < e.frozen_until,
                         'reflect', case when e.kind = 'shard' and coalesce((e.state -> 'reflect' ->> 'until')::numeric, 0) > private.ench_ep(private.ench_now(e)) then e.state -> 'reflect' ->> 'kind' end))
                       from public.enchantments e left join public.profiles pr on pr.id = e.owner_id
                      where e.status <> 'gone' and e.gx between p_min_gx and p_max_gx and e.gy between p_min_gy and p_max_gy limit 300), '[]'::jsonb),
    'attached', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'what', case when jsonb_typeof(st -> 'host') = 'object' then 'parasite' else 'egg' end,
                         'stage', coalesce((st ->> 'stage')::int, 0), 'feeds', coalesce((st ->> 'feeds')::int, 0),
                         'gx', coalesce(st -> 'host' -> 'gx', st -> 'egg' -> 'gx'), 'gy', coalesce(st -> 'host' -> 'gy', st -> 'egg' -> 'gy'),
                         'at', coalesce(st -> 'host' -> 'at', st -> 'egg' -> 'laid_at'), 'hatch_at', st -> 'egg' -> 'hatch_at', 'welcomed', coalesce((st -> 'host' ->> 'welcomed')::boolean, false),
                         'home', case when e.owner_id = v_uid then jsonb_build_array(e.gx, e.gy) end, 'owner_name', (select username from public.profiles where id = e.owner_id),
                         -- the whole plot it's wrapped around (a merged plot is many cells)
                         'cells', (select jsonb_agg(jsonb_build_array(m2.gx, m2.gy)) from (select m2.gx, m2.gy from public.canvas_group_members m1
                                     join public.canvas_groups g on g.id = m1.group_id and g.status = 'active'
                                     join public.canvas_group_members m2 on m2.group_id = m1.group_id
                                    where m1.gx = coalesce((st -> 'host' ->> 'gx')::int, (st -> 'egg' ->> 'gx')::int) and m1.gy = coalesce((st -> 'host' ->> 'gy')::int, (st -> 'egg' ->> 'gy')::int) limit 144) m2),
                         'mine', e.owner_id = v_uid, 'on_mine', coalesce(st -> 'host' ->> 'owner', st -> 'egg' ->> 'owner') = v_uid::text))
                       from public.enchantments e cross join lateral (select case when e.kind = 'shard' then coalesce(e.state -> 'r', '{}'::jsonb) else e.state end st) s
                      where e.status = 'active' and e.kind in ('parasite', 'shard')
                        and coalesce((st -> 'host' ->> 'gx')::int, (st -> 'egg' ->> 'gx')::int) between p_min_gx - 16 and p_max_gx + 16
                        and coalesce((st -> 'host' ->> 'gy')::int, (st -> 'egg' ->> 'gy')::int) between p_min_gy - 16 and p_max_gy + 16
                        and (jsonb_typeof(st -> 'host') = 'object' or e.owner_id = v_uid or coalesce((st -> 'egg' ->> 'spotted')::boolean, false))), '[]'::jsonb),
    'giants', coalesce((select jsonb_agg(jsonb_build_object('gx', gx, 'gy', gy, 'mult', mult)) from public.enchant_buffs
                        where kind = 'plot_giant' and expires_at > now() and gx between p_min_gx and p_max_gx and gy between p_min_gy and p_max_gy), '[]'::jsonb),
    'sizes', coalesce((select jsonb_agg(jsonb_build_object('gx', b.gx, 'gy', b.gy, 'mode', case when b.kind = 'plot_giant' then 'grow' else 'shrink' end, 'mult', b.mult,
                        'until', b.expires_at, 'from', b.created_at, 'mine', b.player_id = v_uid, 'owner_name', pr.username, 'rarity', w.rarity, 'name', w.name, 'plot_type', w.plot_type,
                        'visited', coalesce(b.data -> 'visitors', '[]'::jsonb) ? coalesce(v_uid::text, ''), 'tips', coalesce((b.data ->> 'tips')::int, 0),
                        'scale', coalesce((b.data ->> 'scale')::numeric, case when b.kind = 'plot_giant' then 100 else 0.01 end),
                        'prank', coalesce((b.data ->> 'prank')::boolean, false), 'by_name', b.data ->> 'by_name', 'by_me', (b.data ->> 'by') = coalesce(v_uid::text, '')))
                       from public.enchant_buffs b left join public.world_plots w on w.gx = b.gx and w.gy = b.gy left join public.profiles pr on pr.id = b.player_id
                      where b.kind in ('plot_giant', 'plot_tiny') and b.expires_at > now()
                        and b.gx between p_min_gx - 56 and p_max_gx + 56 and b.gy between p_min_gy - 56 and p_max_gy + 56), '[]'::jsonb),
    'chests', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'gx', c.gx, 'gy', c.gy, 'ink', c.ink, 'kind', c.finder_kind))
                       from public.seek_chests c where v_uid is not null and c.player_id = v_uid and c.dug_at is null and c.expires_at > now()
                        and c.gx between p_min_gx - 8 and p_max_gx + 8 and c.gy between p_min_gy - 8 and p_max_gy + 8 limit 60), '[]'::jsonb),
    'wormholes', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'mine', e.owner_id = v_uid, 'owner_name', pr.username, 'until', (e.state -> 'open' ->> 'until')::numeric,
                        'ends', private.wormhole_ends(e)))
                       from public.enchantments e left join public.profiles pr on pr.id = e.owner_id
                      where e.kind = 'wormhole' and e.status = 'active' and coalesce((e.state -> 'open' ->> 'until')::numeric, 0) > extract(epoch from now())
                        and ((e.gx between p_min_gx and p_max_gx and e.gy between p_min_gy and p_max_gy)
                             or ((e.state -> 'open' ->> 'gx2')::int between p_min_gx and p_max_gx and (e.state -> 'open' ->> 'gy2')::int between p_min_gy and p_max_gy)
                             or ((e.state -> 'open' ->> 'gx3')::int between p_min_gx and p_max_gx and (e.state -> 'open' ->> 'gy3')::int between p_min_gy and p_max_gy))), '[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION private.ench_act_shard(e enchantments, p_action text, a jsonb, t timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); r jsonb; v_o jsonb; v_pick jsonb; v_cracks int; v_lk jsonb; v_shat boolean := false;
begin
  case p_action
    when 'gaze' then
      if coalesce((s -> 'reflect' ->> 'until')::numeric, 0) > v_now then raise exception 'reflecting' using errcode = 'P0001'; end if;
      if coalesce((s ->> 'gazed_at')::numeric, 0) + private.ench_n('shard', 'cooldown_h', 20) * 3600 * (case when e.stars >= 2 then 0.6 else 1 end) > v_now and jsonb_array_length(coalesce(s -> 'options', '[]'::jsonb)) = 0 then
        raise exception 'too_soon' using errcode = 'P0001'; end if;
      if jsonb_array_length(coalesce(s -> 'options', '[]'::jsonb)) = 0 then
        -- three other players' enchantments (one per kind), else dreams of kinds
        select coalesce(jsonb_agg(o.j), '[]'::jsonb) into v_o from (
          select jsonb_build_object('kind', x.kind, 'id', x.id, 'serial', x.serial, 'owner', x.owner_id, 'owner_name', pr.username, 'level', x.level) j
            from (select distinct on (kind) * from public.enchantments where status = 'active' and owner_id is not null and owner_id <> e.owner_id
                   and kind not in ('splice', 'shard', 'wormhole', 'oracle', 'ouroboros', 'homunculus', 'stormcoil', 'origami', 'crucible', 'cuckoo') order by kind, random()) x join public.profiles pr on pr.id = x.owner_id
           order by random() limit 3) o;
        while jsonb_array_length(v_o) < 3 loop
          v_o := v_o || jsonb_build_array(jsonb_build_object('kind', (array['goose', 'genie', 'map', 'parasite', 'spyglass', 'pandora', 'clockwork', 'sizeray'])[1 + floor(random() * 8)::int], 'dream', true));
        end loop;
        s := s || jsonb_build_object('options', v_o, 'gazed_at', v_now);
      end if;
      r := jsonb_build_object('options', s -> 'options');
    when 'step' then
      v_pick := s -> 'options' -> ((a ->> 'i')::int);
      if v_pick is null then raise exception 'not_found' using errcode = 'P0001'; end if;
      v_cracks := coalesce((s ->> 'cracks')::int, 0) + 1;
      s := s || jsonb_build_object('reflect', v_pick || jsonb_build_object('until', v_now + private.ench_n('shard', 'hours', 24) * 3600 * case when e.stars >= 1 then 1.5 else 1 end, 'from', v_now),
                                   'r', private.ench_init(v_pick ->> 'kind', t), 'options', '[]'::jsonb, 'cracks', v_cracks);
      if v_pick ->> 'owner' is not null then
        perform private.grant_ink_paced((v_pick ->> 'owner')::uuid, 3, 'enchantment', 'mirror_tip', e.id::text, null);
        perform private.notify((v_pick ->> 'owner')::uuid, 'enchant', e.owner_id, jsonb_build_object('sub', 'mirror_seen', 'kind', v_pick ->> 'kind', 'ink', 3));
      end if;
      perform private.ench_stat(e.id, 'reflections');
      perform private.ench_xp(e.id, 1);
      perform private.ench_event(e.id, 'reflect', jsonb_build_object('kind', v_pick ->> 'kind', 'owner', v_pick ->> 'owner_name'));
      if v_cracks >= 7 then
        v_shat := true; v_lk := private.ench_give_luck(e.owner_id, 20, 1);
        s := s || jsonb_build_object('cracks', 0);
        perform private.ench_stat(e.id, 'shatters');
        perform private.ench_event(e.id, 'shatter', '{}'::jsonb);
        insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'shatter', 'kind', 'shard', 'serial', e.serial));
      end if;
      r := jsonb_build_object('reflect', s -> 'reflect', 'shattered', v_shat);
    when 'release' then
      if coalesce((s -> 'reflect' ->> 'until')::numeric, 0) <= v_now then raise exception 'not_reflecting' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('reflect', null, 'r', null);
      r := jsonb_build_object('released', true);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $function$;

CREATE OR REPLACE FUNCTION private.take_plot(p_uid uuid, p_gx integer, p_gy integer, p_method text, p_cost jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v_type text; v_rarity text; v_group uuid; v_lucky text; v_grant private.granted_rolls; v_base text; v_lg text; v_granted boolean := false; v_gt text; v_ench text; v_ench_row public.enchantments; v_fate jsonb; v_sight jsonb;
begin
  if p_gx is null or p_gy is null or p_gx not between 0 and 4194303 or p_gy not between 0 and 4194303 then
    raise exception 'invalid_plot' using errcode = 'P0001';
  end if;
  v_type := private.plot_type_for(p_gx, p_gy);
  v_rarity := private.plot_rarity_for(p_gx, p_gy);
  v_base := coalesce((select rarity from public.world_plots where gx = p_gx and gy = p_gy and owner_id is null), v_rarity);
  perform set_config('landvas.luck_grant', '', true);
  -- an event roll for this claim, if one is due: it is the claim's own roll
  if p_method in ('acquire', 'starter', 'purchase') then
    v_grant := private.take_granted_roll(p_uid, p_gx, p_gy);
    if v_grant.id is not null then v_rarity := v_grant.rarity; v_base := v_grant.rarity; end if;
  end if;
  -- 🔭 a Spyglass sighting: the reading you saw is this claim's roll (never over a Crown or a sleeping enchantment)
  if p_method in ('acquire', 'starter', 'purchase') and v_grant.id is null and v_base not like 'crown%'
     and not exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and rarity = 'enchanted') then
    v_sight := private.spy_take(p_uid, p_gx, p_gy);
    if v_sight is not null then
      if v_sight ->> 'rarity' = 'enchanted' then v_ench := v_sight ->> 'kind'; v_rarity := 'enchanted'; v_base := 'enchanted';
      else v_rarity := v_sight ->> 'rarity'; v_base := v_rarity; end if;
    end if;
  end if;
  -- the Oracle's prophecy, if one is waiting
  if p_method in ('acquire', 'starter', 'purchase') and v_grant.id is null and v_base not like 'crown%' and v_sight is null
     and not exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and rarity = 'enchanted') then
    v_fate := private.oracle_take(p_uid, 'roll');
    if v_fate is not null and v_fate ->> 'rarity' <> 'enchanted' then v_rarity := v_fate ->> 'rarity'; v_base := v_rarity; end if;
  end if;
  -- 2% of rolls are Enchanted (never an event roll, never a Crown, never a plot that already holds a sleeping one)
  if p_method in ('acquire', 'starter', 'purchase') and v_grant.id is null and v_base not like 'crown%'
     and not exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and rarity = 'enchanted')
     and (v_fate is null or v_fate ->> 'rarity' = 'enchanted') and v_sight is null then
    v_ench := case when v_fate is not null then v_fate ->> 'kind' else private.ench_roll(p_uid) end;
    if v_ench is not null then v_rarity := 'enchanted'; v_base := 'enchanted'; end if;
  end if;
  if p_method in ('acquire', 'starter') and v_base <> 'enchanted' then
    perform set_config('landvas.base_type', coalesce(v_grant.plot_type, (select plot_type from public.world_plots where gx = p_gx and gy = p_gy and owner_id is null), v_type), true);
    v_lucky := private.luck_roll(p_uid, p_gx, p_gy, v_base);
    if v_lucky is distinct from v_base then v_rarity := v_lucky; else v_lucky := null; end if;
  end if;
  v_lg := nullif(current_setting('landvas.luck_grant', true), '');
  v_granted := (v_grant.id is not null and v_rarity = v_grant.rarity) or (v_lg is not null and split_part(v_lg, ':', 1) = v_rarity);
  if v_granted then
    v_gt := case when v_grant.id is not null and v_rarity = v_grant.rarity then v_grant.plot_type else nullif(split_part(v_lg, ':', 3), '') end;
    if v_gt is not null then v_type := v_gt; end if;
  end if;
  -- event rolls are posted on the live feed like any other claim
  perform set_config('landvas.quiet_claim', '', true);
  if v_rarity = 'crown_country' then
    perform pg_advisory_xact_lock(hashtext('crown_country:' || coalesce(private.city_at(p_gx, p_gy) ->> 'country', '')));
    if private.city_at(p_gx, p_gy) is null or private.crown_country_held(private.city_at(p_gx, p_gy) ->> 'country') then v_rarity := 'mythic'; end if;
  elsif v_rarity = 'crown_state' then
    perform pg_advisory_xact_lock(hashtext('crown_state:' || coalesce(private.city_at(p_gx, p_gy) ->> 'country', '') || '/' || coalesce(private.city_at(p_gx, p_gy) ->> 'state', '')));
    if private.city_at(p_gx, p_gy) ->> 'state' is null or private.crown_state_held(private.city_at(p_gx, p_gy) ->> 'country', private.city_at(p_gx, p_gy) ->> 'state') then v_rarity := 'mythic'; end if;
  end if;
  if v_rarity = 'crown' then
    perform pg_advisory_xact_lock(hashtext('crown:' || coalesce(private.city_at(p_gx, p_gy) ->> 'id', '')));
    if private.city_at(p_gx, p_gy) is null or private.crown_held(private.city_at(p_gx, p_gy) ->> 'id') then v_rarity := 'mythic'; end if;
  end if;
  insert into public.world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at)
  values (p_gx, p_gy, v_type, v_rarity, p_uid, now())
  on conflict (gx, gy) do nothing;
  if not found then
    update public.world_plots
       set owner_id = p_uid, claimed_at = now(), level = 1, plot_type = coalesce(v_gt, plot_type), rarity = case when v_granted or v_lucky is not null or v_grant.id is not null or v_ench is not null or v_fate is not null or v_sight is not null then v_rarity else rarity end,
           art_publication_id = null, art_rev = null, updated_at = now()
     where gx = p_gx and gy = p_gy and owner_id is null and not locked
    returning plot_type, rarity into v_type, v_rarity;
    if not found then
      raise exception 'plot_unavailable' using errcode = 'P0001';
    end if;
  end if;
  if v_granted and ((v_grant.id is not null and v_grant.shiny and v_rarity = v_grant.rarity) or (v_lg like '%:t' and split_part(v_lg, ':', 1) = v_rarity)) then update public.world_plots set shiny = true where gx = p_gx and gy = p_gy; end if;
  if p_method in ('acquire', 'starter') then
    update public.world_plots p set plot_type = coalesce(l.types ->> l.best, p.plot_type), shiny = coalesce((l.shinies ->> l.best)::boolean, p.shiny)
      from public.luck_choices l
     where p.gx = p_gx and p.gy = p_gy and l.player_id = p_uid and l.gx = p_gx and l.gy = p_gy and l.picked is null and l.created_at = now() and l.types is not null
    returning p.plot_type into v_type;
    v_type := coalesce(v_type, (select plot_type from public.world_plots where gx = p_gx and gy = p_gy));
  end if;
  insert into public.plot_ownership (gx, gy, player_id, method, cost)
  values (p_gx, p_gy, p_uid, p_method, coalesce(p_cost, '{}'::jsonb));
  perform private.spy_claimed(p_uid, p_gx, p_gy);
  if v_ench is not null then v_ench_row := private.ench_create(v_ench, p_uid, p_gx, p_gy); end if;
  if v_sight is not null then perform private.spy_paid(v_sight, p_uid); end if;
  v_group := private.create_group_with_cells(p_uid, jsonb_build_array(jsonb_build_array(p_gx, p_gy)),
                                             private.empty_manifest(), null, 'initial');
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx, p_gy, p_gx, p_gy);
  return jsonb_build_object('lucky', v_lucky is not null, 'choices', (select options from public.luck_choices where player_id = p_uid and gx = p_gx and gy = p_gy and picked is null and created_at > now() - interval '1 minute'),
    'choice_types', (select types from public.luck_choices where player_id = p_uid and gx = p_gx and gy = p_gy and picked is null and created_at > now() - interval '1 minute'),
    'choice_shiny', (select shinies from public.luck_choices where player_id = p_uid and gx = p_gx and gy = p_gy and picked is null and created_at > now() - interval '1 minute'), 'gx', p_gx, 'gy', p_gy, 'plot_type', v_type, 'rarity', v_rarity, 'group_id', v_group, 'foretold', v_fate is not null, 'sighted', v_sight is not null, 'enchant', private.ench_brief((select id from public.enchantments where gx = p_gx and gy = p_gy and status = 'active' and v_rarity = 'enchanted')),
                            'usd_per_second', (select private.plot_rate(p, r.usd_per_second) from public.world_plots p join public.plot_rarities r on r.id = p.rarity where p.gx = p_gx and p.gy = p_gy),
                            'shiny', (select shiny from public.world_plots where gx = p_gx and gy = p_gy), 'hot_zone', private.in_hot_zone(p_gx, p_gy),
                            'rarity_info', (select to_jsonb(r) from public.plot_rarities r where r.id = v_rarity),
                            'type_info', (select to_jsonb(t) from public.plot_types t where t.id = v_type));
end $function$;

CREATE OR REPLACE FUNCTION public.start_minigame(p_game text, p_level integer, p_gx integer, p_gy integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := private.require_active_player();
  v_cfg jsonb := private.cfg('minigames');
  v_game jsonb := coalesce(private.cfg('minigames') -> 'games' -> p_game, '{}'::jsonb);
  v_type text; v_highest int; v_id uuid; v_seed bigint; v_expires timestamptz; v_level int; v_max int; v_rounds int;
begin
  perform private.rate_limit('minigame_start', 180, 3600);
  -- 🦢 a folded plot is in its owner's pocket
  if exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and folded_at is not null) then raise exception 'plot_folded' using errcode = 'P0001'; end if;
  if not coalesce((v_game ->> 'enabled')::boolean, false) then
    raise exception 'minigame_unavailable' using errcode = 'P0001';
  end if;
  select wp.plot_type, wp.level into v_type, v_level from public.world_plots wp
  where wp.gx = p_gx and wp.gy = p_gy and wp.owner_id = v_uid;
  if not found then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if (select minigame from public.plot_types where id = v_type) <> p_game then
    raise exception 'wrong_plot_type' using errcode = 'P0001';
  end if;
  -- levels unlock per plot: every plot climbs on its own
  select coalesce(max(highest_level), 0) into v_highest from public.plot_game_progress
   where gx = p_gx and gy = p_gy and player_id = v_uid;
  v_max := greatest(1, least(coalesce((v_game ->> 'max_level')::int, (v_cfg ->> 'max_level')::int, 60), 500));
  -- a beaten level can't be replayed: each plot plays only its next level
  if v_highest >= v_max then raise exception 'plot_maxed' using errcode = 'P0001'; end if;
  if p_level <= v_highest then raise exception 'level_already_beaten' using errcode = 'P0001'; end if;
  if p_level < 1 or p_level > least(v_highest + 1, v_max) then
    raise exception 'level_locked' using errcode = 'P0001';
  end if;
  v_rounds := greatest(1, least(coalesce((v_game ->> 'rounds')::int, 5), 10));
  update public.minigame_sessions set status = 'abandoned', finished_at = now()
  where player_id = v_uid and game = p_game and status = 'active';
  v_seed := floor(random() * 2147483646)::bigint + 1;
  v_expires := now() + make_interval(mins => coalesce((v_cfg ->> 'session_minutes')::int, 20) + v_rounds * 2);
  insert into public.minigame_sessions (player_id, game, level, seed, gx, gy, expires_at, rounds)
  values (v_uid, p_game, p_level, v_seed, p_gx, p_gy, v_expires, v_rounds)
  returning id into v_id;
  return jsonb_build_object('session_id', v_id, 'game', p_game, 'level', p_level, 'seed', v_seed, 'rounds', v_rounds,
                            'plot_level', v_level, 'plot_highest_level', v_highest, 'max_level', v_max,
                            'started_at', now(), 'expires_at', v_expires, 'server_time', now());
end $function$;

CREATE OR REPLACE FUNCTION public.luck_sacrifice_plot(p_gx integer, p_gy integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := private.require_active_player(); c jsonb := private.cfg('luck'); p public.world_plots; g public.canvas_groups;
  v_pts int; v_proj uuid; v_count int;
begin
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  perform private.rate_limit('luck_sacrifice', 600, 3600);
  perform private.luck_room(v_uid);
  select * into p from public.world_plots where gx = p_gx and gy = p_gy for update;
  if not found or p.owner_id is distinct from v_uid then raise exception 'not_owned' using errcode = 'P0001'; end if;
  if p.locked or p.rarity like 'crown%' or p.rarity = 'enchanted' or p.folded_at is not null then raise exception 'cannot_sacrifice' using errcode = 'P0001'; end if;
  select gr.* into g from public.canvas_group_members m join public.canvas_groups gr on gr.id = m.group_id where m.gx = p_gx and m.gy = p_gy for update of gr;
  if not found or g.kind <> 'base' or g.plot_count <> 1 or g.status <> 'active' then raise exception 'only_single_base_plots' using errcode = 'P0001'; end if;
  select count(*) into v_count from public.world_plots where owner_id = v_uid;
  if v_count <= 1 then raise exception 'last_plot' using errcode = 'P0001'; end if;
  v_pts := coalesce((c -> 'plot' ->> case when coalesce((select ppm from public.plot_rarities where id = p.rarity), 0) > 0 then 'ultra' else p.rarity end)::int, 1);
  perform private.rent_settle(v_uid);  -- rent up to now
  delete from public.canvas_group_members where group_id = g.id;
  update public.canvas_groups set status = 'dissolved', plot_count = 0, updated_at = now() where id = g.id;
  if g.project_id is not null then update public.artwork_projects set status = 'archived', updated_at = now() where id = g.project_id; end if;
  update public.world_plots set owner_id = null, claimed_at = null, level = 1, art_publication_id = null, art_rev = null, updated_at = now()
   where gx = p_gx and gy = p_gy;
  update public.plot_ownership set released_at = now(), release_reason = 'sacrificed for luck' where gx = p_gx and gy = p_gy and released_at is null;
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx, p_gy, p_gx, p_gy);
  perform private.luck_gain(v_uid, v_pts, 'plot', jsonb_build_object('rarity', p.rarity, 'shiny', p.shiny));
  return private.luck_json(v_uid) || jsonb_build_object('gained', v_pts, 'rarity', p.rarity);
end $function$;

CREATE OR REPLACE FUNCTION private.ench_hosts(p_uid uuid, p_gx integer, p_gy integer, p_n integer, p_radius integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v jsonb := '[]'::jsonb; r int := p_radius; x record; i int := 0;
begin
  -- a giant plot is the first thing a Parasite or a Cuckoo sees (60%)
  if random() < 0.6 then
    v := coalesce((select jsonb_agg(t.j) from (
      select jsonb_build_object('gx', w.gx, 'gy', w.gy, 'owner', w.owner_id, 'owner_name', pr.username, 'rarity', w.rarity, 'giant', true) j
        from public.enchant_buffs b join public.world_plots w on w.gx = b.gx and w.gy = b.gy and w.owner_id = b.player_id
        join public.players pl on pl.id = w.owner_id join public.profiles pr on pr.id = w.owner_id
       where b.kind = 'plot_giant' and b.expires_at > now() and w.owner_id <> p_uid and pl.status = 'active' and not coalesce((b.data ->> 'prank')::boolean, false) and w.folded_at is null and not private.cru_anchored(w.gx, w.gy)
         and b.gx between p_gx - p_radius and p_gx + p_radius and b.gy between p_gy - p_radius and p_gy + p_radius
       order by random() limit 1) t), '[]'::jsonb);
  end if;
  while jsonb_array_length(v) < p_n and i < 3 loop
    v := v || coalesce((select jsonb_agg(t.j) from (
      select jsonb_build_object('gx', p.gx, 'gy', p.gy, 'owner', p.owner_id, 'owner_name', pr.username, 'rarity', p.rarity) j
        from (select distinct on (w.owner_id) w.gx, w.gy, w.owner_id, w.rarity from public.world_plots w join public.players pl on pl.id = w.owner_id
               where w.owner_id is not null and w.owner_id <> p_uid and pl.status = 'active' and w.folded_at is null and not private.cru_anchored(w.gx, w.gy)
                 and w.gx between p_gx - r and p_gx + r and w.gy between p_gy - r and p_gy + r
                 and not exists (select 1 from jsonb_array_elements(v) e where (e ->> 'owner')::uuid = w.owner_id)
                 and not exists (select 1 from public.enchant_buffs tb where tb.kind = 'plot_tiny' and tb.gx = w.gx and tb.gy = w.gy and tb.expires_at > now() and not coalesce((tb.data ->> 'prank')::boolean, false))
               order by w.owner_id, random()) p join public.profiles pr on pr.id = p.owner_id
       order by random() limit p_n - jsonb_array_length(v)) t), '[]'::jsonb);
    r := r * 6; i := i + 1;
  end loop;
  if jsonb_array_length(v) < p_n then
    for x in select w.gx, w.gy, w.owner_id, w.rarity, pr.username from public.players pl join public.profiles pr on pr.id = pl.id
               cross join lateral (select gx, gy, owner_id, rarity from public.world_plots wp where wp.owner_id = pl.id
                                     and not exists (select 1 from public.enchant_buffs tb where tb.kind = 'plot_tiny' and tb.gx = wp.gx and tb.gy = wp.gy and tb.expires_at > now() and not coalesce((tb.data ->> 'prank')::boolean, false))
                                   order by random() limit 1) w
              where pl.id <> p_uid and pl.status = 'active' and not exists (select 1 from jsonb_array_elements(v) e where (e ->> 'owner')::uuid = pl.id)
              order by random() limit p_n - jsonb_array_length(v) loop
      v := v || jsonb_build_array(jsonb_build_object('gx', x.gx, 'gy', x.gy, 'owner', x.owner_id, 'owner_name', x.username, 'rarity', x.rarity));
    end loop;
  end if;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION private.ray_prank_check(p_by uuid, p_owner uuid, p_gx integer, p_gy integer)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
AS $function$
declare v_last timestamptz;
begin
  if private.cru_anchored(p_gx, p_gy) then raise exception 'anchored' using errcode = 'P0001'; end if;
  if exists (select 1 from public.player_blocks where (blocker_id = p_owner and blocked_id = p_by) or (blocker_id = p_by and blocked_id = p_owner)) then
    raise exception 'blocked' using errcode = 'P0001'; end if;
  select max(created_at) into v_last from public.enchant_buffs
   where kind in ('plot_giant', 'plot_tiny') and player_id = p_owner and (data ->> 'by') = p_by::text;
  if v_last > now() - make_interval(hours => private.ench_n('sizeray', 'prank_cooldown_h', 12)::int) then
    raise exception 'prank_cooldown' using errcode = 'P0001', detail = ceil(extract(epoch from v_last + make_interval(hours => private.ench_n('sizeray', 'prank_cooldown_h', 12)::int) - now()) / 3600)::text; end if;
  if exists (select 1 from public.enchant_buffs where kind in ('plot_giant', 'plot_tiny') and gx = p_gx and gy = p_gy and expires_at > now()
               and not coalesce((data ->> 'prank')::boolean, false)) then raise exception 'already_sized' using errcode = 'P0001'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.leviathan_hit(p_move text, p_n integer DEFAULT 1, p_enchant uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := private.require_active_player(); l public.leviathans; lp public.leviathan_players; v_bank numeric; v_n int; v_dmg bigint := 0; i int; e public.enchantments;
  m jsonb; v_lab text; v_emoji text := '💣'; v_cd numeric := private.lev_n('move_cd_h', 3) * 3600; v_eff text; v_before bigint; v_name text; v_p jsonb; v_missed int := 0;
  v_miss numeric := private.lev_n('tiny_miss', 0.5);
begin
  perform private.rate_limit('leviathan_hit', 1500, 3600);
  select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1 for update;
  if l.id is null then raise exception 'no_leviathan' using errcode = 'P0001'; end if;
  if l.status = 'warning' then raise exception 'not_risen' using errcode = 'P0001'; end if;
  insert into public.leviathan_players (lev_id, player_id, bombs, bombs_at) values (l.id, v_uid, private.lev_n('bombs_max', 60), now()) on conflict do nothing;
  select * into lp from public.leviathan_players where lev_id = l.id and player_id = v_uid for update;
  -- hidden: only those who've found it can hit it (the Oracle Eye can reveal it to everyone)
  if private.lev_hidden(l) and not private.lev_spotted(l, v_uid)
     and not (p_move = 'enchant' and exists (select 1 from public.enchantments x where x.id = p_enchant and x.owner_id = v_uid and x.kind = 'oracle')) then
    raise exception 'lev_hidden' using errcode = 'P0001';
  end if;
  if p_move = 'bomb' then
    v_bank := least(private.lev_n('bombs_max', 60), lp.bombs + extract(epoch from now() - lp.bombs_at) / greatest(private.lev_n('bomb_regen_s', 60), 1));
    v_n := least(greatest(coalesce(p_n, 1), 1), 10, floor(v_bank)::int);
    if v_n < 1 then raise exception 'no_bombs' using errcode = 'P0001'; end if;
    for i in 1 .. v_n loop
      -- a tiny Leviathan is hard to hit
      if private.lev_tiny(l) and random() < v_miss then v_missed := v_missed + 1;
      else v_dmg := v_dmg + 80 + floor(random() * 41)::int; end if;
    end loop;
    v_dmg := round(v_dmg * private.lev_mult(l) * private.lev_player_mult(v_uid));
    update public.leviathan_players set bombs = v_bank - v_n, bombs_at = now() where lev_id = l.id and player_id = v_uid;
    v_lab := case when v_n = 1 then 'an ink bomb' else v_n || ' ink bombs' end || case when v_missed > 0 then ' (' || v_missed || ' missed — it’s tiny)' else '' end;
  elsif p_move = 'enchant' then
    select * into e from public.enchantments where id = p_enchant and owner_id = v_uid and status = 'active';
    if e.id is null then raise exception 'bad_target' using errcode = 'P0001'; end if;
    if coalesce((lp.moves ->> e.id::text)::numeric, 0) + v_cd > extract(epoch from now()) then raise exception 'too_soon' using errcode = 'P0001'; end if;
    m := private.lev_move(e.kind);
    if m is null then raise exception 'hatch_first' using errcode = 'P0001'; end if;
    v_dmg := round((2500 + 400 * e.level) * ((m ->> 1)::numeric + random() * ((m ->> 2)::numeric - (m ->> 1)::numeric)) * private.lev_mult(l) * private.lev_player_mult(v_uid));
    v_eff := m ->> 3;
    case v_eff
      when 'freeze' then perform private.lev_pause(l.id, 600);
      when 'decoy' then perform private.lev_pause(l.id, 300);
      when 'pull' then perform private.lev_pause(l.id, 300);
      when 'shrink' then
        if private.lev_tiny(l) then
          -- a tiny Leviathan: the Size Ray blows it back up to its size (and it can be hit again)
          update public.leviathans set tiny_until = null where id = l.id; v_eff := 'grow';
        else update public.leviathans set shrunk_until = greatest(coalesce(shrunk_until, now()), now()) + interval '10 minutes' where id = l.id; end if;
      when 'foretell' then
        update public.leviathans set foretold_until = greatest(coalesce(foretold_until, now()), now()) + interval '10 minutes' where id = l.id;
        if private.lev_hidden(l) then update public.leviathans set hidden_until = null where id = l.id; v_eff := 'reveal'; end if;
      else null;
    end case;
    update public.leviathan_players set moves = moves || jsonb_build_object(e.id::text, extract(epoch from now())) where lev_id = l.id and player_id = v_uid;
    v_p := private.ench_partner(e.id);
    v_name := coalesce(v_p ->> 'hybrid', e.nickname, (private.ench_info(e.kind) ->> 'name'));
    v_lab := v_name || ' · ' || (m ->> 0) || case v_eff when 'reveal' then ' — and showed everyone where it hides' when 'grow' then ' — and blew it back up to size' else '' end;
    v_emoji := private.ench_info(e.kind) ->> 'emoji';
    perform private.ench_xp(e.id, 1);
    perform private.ench_event(e.id, 'leviathan', jsonb_build_object('move', m ->> 0, 'dmg', v_dmg));
  else raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  select * into l from public.leviathans where id = l.id for update;
  v_before := l.hp;
  v_dmg := least(v_dmg, l.hp);
  update public.leviathans set hp = hp - v_dmg where id = l.id returning * into l;
  update public.leviathan_players set dmg = dmg + v_dmg, hits = hits + case when v_dmg > 0 then 1 else 0 end where lev_id = l.id and player_id = v_uid;
  if v_dmg > 0 or p_move = 'enchant' then
    insert into public.leviathan_hits (lev_id, player_id, move, label, emoji, dmg) values (l.id, v_uid, p_move, v_lab, v_emoji, v_dmg);
  end if;
  -- (the feed keeps its last 400 hits)
  if random() < 0.02 then delete from public.leviathan_hits where lev_id = l.id and id < (select id from public.leviathan_hits where lev_id = l.id order by id desc offset 400 limit 1); end if;
  if l.hp <= 0 then perform private.lev_fall(l.id);
  elsif (v_before > l.hp_max * 0.5 and l.hp <= l.hp_max * 0.5) or (v_before > l.hp_max * 0.1 and l.hp <= l.hp_max * 0.1) then perform private.lev_phase(l.id);
  end if;
  return jsonb_build_object('dmg', v_dmg, 'effect', v_eff, 'label', v_lab, 'fell', l.hp <= 0, 'missed', v_missed) || public.leviathan_state(false);
end $function$;

CREATE OR REPLACE FUNCTION private.splice_can(x enchantments, p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select x.id is not null and x.owner_id = p_uid and x.status = 'active' and x.kind <> 'splice' and x.kind <> 'cuckoo' and not private.ench_spliced(x.id)
$function$;

CREATE OR REPLACE FUNCTION public.enchant_merge(p_target uuid, p_copy uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := private.require_active_player(); e public.enchantments; c public.enchantments; v_same boolean := false; v_fill int; v_stars int;
  v_ess int := 0; v_from_ess boolean := false; v_up boolean := false; v_rar text; v_power jsonb; v_copy jsonb;
begin
  perform private.rate_limit('enchant_merge', 120, 3600);
  if p_copy is not null and p_copy = p_target then raise exception 'bad_target' using errcode = 'P0001'; end if;
  if exists (select 1 from public.enchantments where id in (p_target, p_copy) and kind = 'cuckoo') then raise exception 'hatch_first' using errcode = 'P0001'; end if;
  -- (both rows, in one order, so two merges can't deadlock)
  perform 1 from public.enchantments where id in (p_target, p_copy) order by id for update;
  select * into e from public.enchantments where id = p_target;
  if e.id is null or e.owner_id is distinct from v_uid or e.status <> 'active' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform private.ench_settle(e.id);
  select * into e from public.enchantments where id = p_target;
  v_fill := e.star_fill; v_stars := e.stars;
  select coalesce((select essence from public.enchant_essence where player_id = v_uid), 0) into v_ess;

  if p_copy is null then
    -- pour banked Essence
    if v_stars >= 3 then raise exception 'max_stars' using errcode = 'P0001'; end if;
    if v_ess < 3 then raise exception 'not_enough_essence' using errcode = 'P0001'; end if;
    update public.enchant_essence set essence = essence - 3, updated_at = now() where player_id = v_uid returning essence into v_ess;
    v_fill := v_fill + 1; v_from_ess := true;
  else
    select * into c from public.enchantments where id = p_copy;
    if c.id is null or c.owner_id is distinct from v_uid or c.status <> 'active' then raise exception 'not_owner' using errcode = 'P0001'; end if;
    perform private.ench_settle(c.id);
    select * into c from public.enchantments where id = p_copy;
    if c.status <> 'active' then raise exception 'not_owner' using errcode = 'P0001'; end if;
    v_same := c.kind = e.kind;
    if v_same and v_stars >= 3 then raise exception 'max_stars' using errcode = 'P0001'; end if;
    -- a copy that's part of something running can't be poured
    if private.ench_spliced(c.id)
       or exists (select 1 from public.enchant_splices where splice_id = c.id and (ends_at > now() or (data ? 'coil_by' and not folded)))
       or exists (select 1 from public.enchant_splice_invites where (splice_id = c.id or a = c.id or b = c.id) and status = 'pending' and expires_at > now())
       or (c.kind = 'ouroboros' and jsonb_typeof(c.state -> 'coil') = 'object')
       or (c.kind = 'stormcoil' and jsonb_typeof(c.state -> 'storm') = 'object' and not coalesce((c.state -> 'storm' ->> 'settled')::boolean, false))
       or (c.kind = 'homunculus' and jsonb_typeof(c.state -> 'awake') = 'object') then
      raise exception 'copy_busy' using errcode = 'P0001';
    end if;
    -- the copy pours in: its XP, its stars (a starred copy brings what it held), and its plot takes its own roll
    perform private.ench_xp(e.id, greatest(c.xp, 0));
    v_rar := private.plot_rarity_for(c.gx, c.gy);
    if v_rar is null or v_rar = 'enchanted' or v_rar like 'crown%' then v_rar := 'common'; end if;
    perform private.rent_settle(v_uid);
    update public.enchantments set status = 'gone', owner_id = null, updated_at = now(),
           stats = stats || jsonb_build_object('merged_into', e.id, 'merged_at', now()) where id = c.id;
    update public.world_plots set rarity = v_rar, updated_at = now() where gx = c.gx and gy = c.gy and rarity = 'enchanted';
    insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', c.gx, c.gy, c.gx, c.gy);
    perform private.ench_event(c.id, 'merged_away', jsonb_build_object('into', e.kind, 'serial', e.serial, 'same', v_same));
    v_copy := jsonb_build_object('kind', c.kind, 'serial', c.serial, 'gx', c.gx, 'gy', c.gy, 'rarity', v_rar, 'xp', c.xp);
    if v_same then
      -- a starred copy brings its copies along (★1 = 1, ★2 = 2, ★3 = 4)
      v_fill := v_fill + 1 + (select coalesce(sum(private.ench_star_need(i)), 0)::int from generate_series(1, c.stars) i) + c.star_fill;
    else
      insert into public.enchant_essence (player_id, essence) values (v_uid, 1)
        on conflict (player_id) do update set essence = enchant_essence.essence + 1, updated_at = now() returning essence into v_ess;
      -- three Essence pour in as one copy (while it can still take a star)
      if v_ess >= 3 and v_stars < 3 then
        update public.enchant_essence set essence = essence - 3, updated_at = now() where player_id = v_uid returning essence into v_ess;
        v_fill := v_fill + 1; v_from_ess := true;
      end if;
    end if;
  end if;

  -- the stars it has earned (a big pour can earn more than one)
  while v_stars < 3 and v_fill >= private.ench_star_need(v_stars + 1) loop
    v_fill := v_fill - private.ench_star_need(v_stars + 1);
    v_stars := v_stars + 1; v_up := true;
    v_power := private.ench_star_powers(e.kind) -> (v_stars - 1);
    perform private.ench_event(e.id, 'star', jsonb_build_object('stars', v_stars, 'power', v_power ->> 'name'));
  end loop;
  -- (past ★3 the leftover copies become Essence)
  if v_stars >= 3 and v_fill > 0 then
    insert into public.enchant_essence (player_id, essence) values (v_uid, 3 * v_fill)
      on conflict (player_id) do update set essence = enchant_essence.essence + 3 * v_fill, updated_at = now() returning essence into v_ess;
    v_fill := 0;
  end if;
  update public.enchantments set stars = v_stars, star_fill = v_fill, updated_at = now(),
         stats = stats || jsonb_build_object('merges', coalesce((stats ->> 'merges')::int, 0) + 1) where id = e.id;
  perform private.ench_event(e.id, 'merged', jsonb_build_object('kind', coalesce(c.kind, 'essence'), 'serial', c.serial, 'same', v_same, 'essence', v_from_ess));
  if v_up then
    insert into public.feed_events (kind, player_id, data) values ('enchant', v_uid, jsonb_build_object('sub', 'starred', 'kind', e.kind, 'serial', e.serial, 'stars', v_stars));
  end if;
  select * into e from public.enchantments where id = p_target;
  if private.ench_titles(e) <> e.titles then
    perform private.ench_event(e.id, 'title', jsonb_build_object('titles', to_jsonb(array(select unnest(private.ench_titles(e)) except select unnest(e.titles)))));
    update public.enchantments set titles = private.ench_titles(e) where id = e.id;
  end if;
  return private.ench_view(e.id) || jsonb_build_object(
    'result', jsonb_build_object('merged', true, 'same', v_same, 'essence_used', v_from_ess, 'starred', v_up, 'stars', v_stars, 'fill', v_fill,
                                 'need', case when v_stars < 3 then private.ench_star_need(v_stars + 1) end, 'power', case when v_up then v_power end,
                                 'essence', v_ess, 'copy', v_copy),
    'balances', private.balances(v_uid));
end $function$;

CREATE OR REPLACE FUNCTION private.ench_settle(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare e public.enchantments; s record; v_c uuid;
begin
  for v_c in select distinct (sp.data ->> 'coil_by')::uuid from public.enchant_splices sp where (sp.a = p_id or sp.b = p_id) and sp.data ? 'coil_by' and not sp.folded loop
    perform private.ouro_settle(v_c);
  end loop;
  select * into e from public.enchantments where id = p_id;
  if e.kind = 'ouroboros' then perform private.ouro_settle(p_id); end if;
  if e.kind = 'stormcoil' then perform private.storm_settle(p_id); end if;
  perform private.endless_renew(p_id);
  select * into e from public.enchantments where id = p_id;
  if e.frozen_at is not null and now() >= e.frozen_until then
    update public.enchantments set clock_skip = clock_skip - extract(epoch from frozen_until - frozen_at), frozen_at = null, frozen_until = null where id = p_id;
  end if;
  for s in select sp.*, ea.kind ka, eb.kind kb from public.enchant_splices sp join public.enchantments ea on ea.id = sp.a left join public.enchantments eb on eb.id = sp.b
            where not sp.folded and sp.ends_at <= now() and (sp.a = p_id or sp.b = p_id) for update of sp loop
    -- the Tempo a finished splice gave, kept for good
    if s.kb = 'clockwork' then
      update public.enchantments set clock_skip = clock_skip + (private.splice_strength(s.mode, s.data, s.ka, s.kb) + 1) * extract(epoch from s.ends_at - s.started_at) where id = s.a;
    end if;
    if s.ka = 'clockwork' and s.b is not null and s.mode <> 'graft' then
      update public.enchantments set clock_skip = clock_skip + (private.splice_strength(s.mode, s.data, s.kb, s.ka) + 1) * extract(epoch from s.ends_at - s.started_at) where id = s.b;
    end if;
    update public.enchant_splices set folded = true where id = s.id;
  end loop;
  -- 🦢 Folded
  perform private.ori_folded_clock(p_id);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_give_enchantment(p_player uuid, p_kind text, p_reason text, p_near_gx integer DEFAULT NULL::integer, p_near_gy integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := private.require_admin(array['owner']); v jsonb; e public.enchantments;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if private.ench_info(p_kind) is null or p_kind = 'cuckoo' then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  v := public.admin_give_plot(p_player, 'common', false, null, p_reason, false, p_near_gx, p_near_gy);
  update public.world_plots set rarity = 'enchanted' where gx = (v ->> 'gx')::int and gy = (v ->> 'gy')::int;
  e := private.ench_create(p_kind, p_player, (v ->> 'gx')::int, (v ->> 'gy')::int);
  perform private.audit('enchant.given', 'player', p_player::text, jsonb_build_object('kind', p_kind, 'id', e.id, 'reason', p_reason));
  return private.ench_brief(e.id);
end $function$;

-- ---- the Cuckoo leaves ------------------------------------------------------------------------------------------------
do $$
declare r record; k text; v_serial int; v_ks text[] := private.ench_hatchable();
begin
  -- eggs in other players' nests hatch now: the Cuckoo's owner gets the chick's Ink, the host the eject fee
  for r in select * from public.enchantments where kind = 'cuckoo' and status = 'active' and jsonb_typeof(state -> 'egg') = 'object' loop
    perform private.ench_pay(r.id, coalesce((r.state -> 'egg' ->> 'reward')::numeric, 40), 'its last chick, from @' || coalesce(r.state -> 'egg' ->> 'owner_name', 'a neighbour'));
    if (r.state -> 'egg' ->> 'owner') is not null and exists (select 1 from public.players where id = (r.state -> 'egg' ->> 'owner')::uuid) then
      perform private.grant_ink_paced((r.state -> 'egg' ->> 'owner')::uuid, 8, 'enchantment', 'eject', r.id::text, null);
    end if;
  end loop;
  -- running splices with a Cuckoo in them end, and give their charge back
  for r in select distinct on (sp.splice_id, coalesce(sp.grp::text, sp.id::text)) sp.splice_id, sp.grp, sp.id
             from public.enchant_splices sp join public.enchantments e on e.id = sp.a or e.id = sp.b
            where e.kind = 'cuckoo' and sp.ends_at > now() loop
    update public.enchant_splices set ends_at = now() where ends_at > now() and ((r.grp is not null and grp = r.grp) or id = r.id);
    perform private.splice_refund(r.splice_id);
  end loop;
  -- the ones that are out become eggs
  update public.enchantments set state = jsonb_build_object('egg_from', 'cuckoo'), updated_at = now() where kind = 'cuckoo' and status = 'active';
  -- sleeping ones hatch into a new kind
  for r in select * from public.enchantments where kind = 'cuckoo' and status = 'dormant' loop
    k := v_ks[1 + floor(random() * array_length(v_ks, 1))::int];
    insert into private.enchant_serials (kind, n) values (k, 1) on conflict (kind) do update set n = private.enchant_serials.n + 1 returning n into v_serial;
    update public.enchantments set kind = k, serial = v_serial, state = private.ench_init(k, now()),
           titles = array(select x from unnest(titles) x where x not in ('Brood Mother', 'Nest Thief')), stats = (stats - 'chicks') || '{"hatched_from": "cuckoo"}'::jsonb, updated_at = now()
     where id = r.id;
    perform private.ench_event(r.id, 'hatched_into', jsonb_build_object('kind', k, 'serial', v_serial));
  end loop;
end $$;

-- the Cuckoo hybrids leave every Codex
update public.enchantments set state = state
    || jsonb_build_object('codex', coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(state -> 'codex', '[]'::jsonb)) x where x::text not like '%cuckoo%'), '[]'::jsonb))
    || case when state ? 'trinities' then jsonb_build_object('trinities', coalesce((select jsonb_agg(x) from jsonb_array_elements(state -> 'trinities') x where x::text not like '%cuckoo%'), '[]'::jsonb)) else '{}'::jsonb end
    || case when state ? 'quads' then jsonb_build_object('quads', coalesce((select jsonb_agg(x) from jsonb_array_elements(state -> 'quads') x where x::text not like '%cuckoo%'), '[]'::jsonb)) else '{}'::jsonb end
 where kind = 'splice' and state::text like '%cuckoo%';

-- a Homunculus's Cuckoo parts turn to paper (an Origami's), merged into one it already has
update public.enchantments h set state = jsonb_set(h.state, '{parts}', coalesce((
    select jsonb_agg(p) from (
      select case when q.p ->> 'k' = 'cuckoo' then q.p || '{"k": "origami"}'::jsonb else q.p end p, q.o from jsonb_array_elements(h.state -> 'parts') with ordinality q(p, o)
       where not (q.p ->> 'k' = 'cuckoo' and h.state -> 'parts' @> '[{"k": "origami"}]'::jsonb)) z), '[]'::jsonb))
 where h.kind = 'homunculus' and h.state -> 'parts' @> '[{"k": "cuckoo"}]'::jsonb;

-- the old Cuckoo functions go
drop function if exists private.ench_act_cuckoo(public.enchantments, text, jsonb, timestamptz);
drop function if exists private.ench_view_cuckoo(public.enchantments, timestamptz);

do $$
begin
  execute 'revoke all on function public.enchant_map3(integer, integer, integer, integer) from public';
  execute 'grant execute on function public.enchant_map3(integer, integer, integer, integer) to anon, authenticated';
end $$;
