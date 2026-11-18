-- ✨ Skywright, part 1: the stars as land (design/skywright.md).
--
-- The galaxy: ~86 billion stars made from one seed, plus the ~5,000 real ones (public.real_stars, the migration before
-- this). Nothing is stored for a star until someone claims a plot on it. The same hash as the game's own code
-- (src/stars/galaxy.ts) says what's where, so a star's id is checked here without any list of stars:
--   tier 0:     a real star's Hipparcos number
--   tiers 1–5:  ((tier·8 + face)·2^17 + i)·2^17 + j)·16 + k   (sky tile (face, i, j) of that zoom tier, its k-th star)
--
-- Every star is a ball of plots (a Goldberg polyhedron: 10·m² + 2 plots by its kind, 12 of them Keystones, ids 0–11).
-- Owner's calls (Nov 17, 2026):
--   * buy as many as you like; each plot on a star costs a little more than the last: Earth price × (1 + k·√n), n the
--     plots already claimed on that star (k = stars.price_k, 0.05);
--   * star plots pay USD rent, a tiny bit more than the same rarity on Earth (× stars.rent_mult, 1.1);
--   * no ultras on stars (for now): Common … Mythic and Shiny only. Keystones roll Epic or better and cost 10× (stars.keystone_mult);
--   * the first to claim a plot on a star is its Discoverer, and gets a cut (stars.discoverer_pct, 10%) of what anyone
--     else pays above the Earth price there — paid as Ink;
--   * the Art plot type stays: a star's plots carry their owners' paintings, and the painting shows on the star when
--     it's looked at from Earth (approved by staff first when stars.art.review is on).
-- You're at a star (to place plots there) after warping to it: star_warp → star_pilots.

insert into public.game_config (key, value, description) values ('stars', jsonb_build_object(
  'enabled', true,
  'rent_mult', 1.1,
  'price_k', 0.05,
  'keystone_mult', 10,
  'keystone_floor', 'epic',
  'discoverer_pct', 10,
  'max_star_plots', 5000,
  'warp', jsonb_build_object('base_ink', 30, 'per_doubling', 12, 'max_ink', 400, 'secs_base', 14, 'secs_per_doubling', 4, 'max_secs', 90, 'rush_ink', 10, 'gate_pct', 40),
  'art', jsonb_build_object('review', true, 'max_kb', 900, 'max_w', 2048)),
  'Skywright: the stars as land — prices (price_k, keystone_mult), rent (rent_mult), the Discoverer''s cut, warps, star art review')
on conflict (key) do nothing;

-- ---- the hash (the same as src/stars/galaxy.ts: mix / hash / h01) ---------------------------------------------------------
create or replace function private.sw_mix(p bigint) returns bigint language plpgsql immutable parallel safe as $$
declare x bigint := p & 4294967295;
begin
  x := x # (x >> 16);
  x := (x * 2146121005) & 4294967295;
  x := x # (x >> 15);
  x := (x * 1759714725) & 4294967295;
  x := x # (x >> 16);
  return x;
end $$;
create or replace function private.sw_hash(p bigint[]) returns bigint language plpgsql immutable parallel safe as $$
declare x bigint := 1554098974; v bigint;
begin
  foreach v in array p loop x := private.sw_mix(x # (v & 4294967295)); end loop;
  return x;
end $$;
create or replace function private.sw_h01(p bigint[]) returns float8 language sql immutable parallel safe as $$
  select private.sw_hash(p)::float8 / 4294967296.0
$$;
/** a tier's tiling (tiles across a face) and stars per tile on average */
create or replace function private.sw_tier_n(t int) returns int language sql immutable as $$
  select case t when 1 then 64 when 2 then 256 when 3 then 2048 when 4 then 16384 when 5 then 131072 else 0 end
$$;
create or replace function private.sw_tier_mean(t int) returns float8 language sql immutable as $$
  select case t when 1 then 3.4 when 2 then 5 when 3 then 3.6 when 4 then 2 when 5 then 0.8 else 0 end::float8
$$;
create or replace function private.sw_tile_count(t int, f int, i int, j int) returns int language sql immutable as $$
  select least(least(15, floor(2 * private.sw_tier_mean(t))::int),
               floor(private.sw_h01(array[t * 8 + f, i, j, 7]::bigint[]) * (2 * private.sw_tier_mean(t) + 1))::int)
$$;
/** a star id's parts: tier, face, i, j, k */
create or replace function private.sw_decode(p_id bigint, out tier int, out face int, out i int, out j int, out k int) language plpgsql immutable as $$
declare tf bigint := p_id / 274877906944; rest bigint;
begin
  tier := (tf / 8)::int;
  if tier = 0 then face := 0; i := 0; j := 0; k := 0; return; end if;
  face := (tf % 8)::int;
  rest := p_id - tf * 274877906944;
  i := (rest / 2097152)::int;
  j := ((rest % 2097152) / 16)::int;
  k := (rest % 16)::int;
end $$;
/** a generated star's kind (the same as genClass) */
create or replace function private.sw_class(t int, f int, i int, j int, k int) returns text language plpgsql stable as $$
declare roll int := floor(private.sw_h01(array[t * 8 + f, i, j, k, 11]::bigint[]) * 100000)::int; acc int := 0; r record;
begin
  for r in select id, weight from private.sw_classes order by sort loop
    acc := acc + r.weight;
    if roll < acc then return r.id; end if;
  end loop;
  return 'red_dwarf';
end $$;

/** a star by its id: {id, tier, cls, m, cells, ly, name, code} — null if there's no such star */
create or replace function private.sw_star(p_id bigint) returns jsonb language plpgsql stable as $$
declare d record; c record; rs public.real_stars%rowtype; v_cls text; v_ly numeric; v_name text; v_lo int; v_hi int;
begin
  if p_id is null or p_id < 0 or p_id >= 6 * 274877906944 * 8 then return null; end if;
  select * into d from private.sw_decode(p_id);
  if d.tier = 0 then
    select * into rs from public.real_stars where hip = p_id;
    if not found then return null; end if;
    v_cls := rs.cls; v_ly := rs.ly; v_name := rs.name;
  else
    if d.tier > 5 or d.face > 5 or d.i >= private.sw_tier_n(d.tier) or d.j >= private.sw_tier_n(d.tier) then return null; end if;
    if d.k >= private.sw_tile_count(d.tier, d.face, d.i, d.j) then return null; end if;
    v_cls := private.sw_class(d.tier, d.face, d.i, d.j, d.k);
    v_lo := case d.tier when 1 then 60 when 2 then 400 when 3 then 2500 when 4 then 12000 else 30000 end;
    v_hi := case d.tier when 1 then 900 when 2 then 4000 when 3 then 18000 when 4 then 52000 else 95000 end;
    v_ly := round(v_lo + (v_hi - v_lo) * private.sw_h01(array[d.tier * 8 + d.face, d.i, d.j, d.k, 4]::bigint[]))::int;
    v_name := 'LV-' || upper(private.sw_base36(p_id));
  end if;
  select * into c from private.sw_classes where id = v_cls;
  return jsonb_build_object('id', p_id, 'tier', d.tier, 'cls', v_cls, 'm', c.m, 'cells', 10 * c.m * c.m + 2, 'ly', v_ly,
    'code', case when d.tier = 0 then 'HIP ' || p_id else 'LV-' || upper(private.sw_base36(p_id)) end, 'catalog_name', v_name,
    'class_name', c.name, 'emoji', c.emoji, 'color', c.color, 'glow', c.glow, 'light', c.light, 'fuse', c.fuse);
end $$;
create or replace function private.sw_base36(p bigint) returns text language plpgsql immutable as $$
declare s text := ''; d text := '0123456789abcdefghijklmnopqrstuvwxyz'; x bigint := p;
begin
  if x = 0 then return '0'; end if;
  while x > 0 loop s := substr(d, (x % 36)::int + 1, 1) || s; x := x / 36; end loop;
  return s;
end $$;
create or replace function private.stars_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('stars'), '{}'::jsonb) $$;
create or replace function private.stars_n(p_key text, p_default numeric) returns numeric language sql stable as $$
  select coalesce((private.stars_cfg() ->> p_key)::numeric, p_default)
$$;

-- ---- tables -----------------------------------------------------------------------------------------------------------
/** a star someone has claimed a plot on (its Discoverer, its name, how full and painted it is) */
create table if not exists public.star_systems (
  star_id bigint primary key,
  tier smallint not null,
  cls text not null,
  m int not null,
  cells int not null,
  discoverer_id uuid references public.players (id) on delete set null,
  discovered_at timestamptz not null default now(),
  name text,
  claimed int not null default 0,
  painted boolean not null default false,
  painted_at timestamptz,
  color text,
  art_rev int not null default 0,
  updated_at timestamptz not null default now());
create index if not exists star_systems_disc on public.star_systems (discoverer_id);
create index if not exists star_systems_painted on public.star_systems (painted_at desc) where painted;
create index if not exists star_systems_claimed on public.star_systems (claimed desc);
alter table public.star_systems enable row level security;
revoke all on public.star_systems from anon, authenticated;

/** a plot on a star */
create table if not exists public.star_plots (
  star_id bigint not null references public.star_systems (star_id) on delete cascade,
  cell int not null,
  owner_id uuid not null references public.players (id) on delete cascade,
  rarity text not null references public.plot_rarities (id),
  shiny boolean not null default false,
  keystone boolean not null default false,
  kind text not null default 'base',
  name text,
  level int not null default 1,
  paid_ink bigint not null default 0,
  state jsonb not null default '{}'::jsonb,
  claimed_at timestamptz not null default now(),
  primary key (star_id, cell));
create index if not exists star_plots_owner on public.star_plots (owner_id, claimed_at desc);
create index if not exists star_plots_kind on public.star_plots (kind) where kind <> 'base';
alter table public.star_plots enable row level security;
revoke all on public.star_plots from anon, authenticated;

/** each owner's painting of a star: a flat map of the whole star (only their own plots show of it) */
create table if not exists public.star_art (
  star_id bigint not null references public.star_systems (star_id) on delete cascade,
  owner_id uuid not null references public.players (id) on delete cascade,
  rev int not null default 1,
  w int not null, h int not null,
  img text not null,
  color text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid, reviewed_at timestamptz, reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (star_id, owner_id));
create index if not exists star_art_review on public.star_art (status, updated_at) where status = 'pending';
create index if not exists star_art_owner on public.star_art (owner_id);
alter table public.star_art enable row level security;
revoke all on public.star_art from anon, authenticated;

/** where you are among the stars: at Earth (no star), on the way to one, or at one */
create table if not exists public.star_pilots (
  player_id uuid primary key references public.players (id) on delete cascade,
  at_star bigint,
  dest_star bigint,
  depart_at timestamptz,
  arrive_at timestamptz,
  via_gate boolean not null default false,
  warps int not null default 0,
  updated_at timestamptz not null default now());
alter table public.star_pilots enable row level security;
revoke all on public.star_pilots from anon, authenticated;

/** a star's chronicle (discovered, claimed, painted, named…) */
create table if not exists public.star_events (
  id bigserial primary key,
  star_id bigint not null,
  player_id uuid references public.players (id) on delete set null,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  at timestamptz not null default now());
create index if not exists star_events_star on public.star_events (star_id, at desc);
create index if not exists star_events_player on public.star_events (player_id);
alter table public.star_events enable row level security;
revoke all on public.star_events from anon, authenticated;

-- (the stars' alerts: a Discoverer's cut, a painting approved or not, a Painted Star, a supernova…: kind 'star', data.sub)
alter table public.player_notifications drop constraint if exists player_notifications_kind_check;
alter table public.player_notifications add constraint player_notifications_kind_check check (kind in (
  'stamp', 'visit', 'checkin', 'inspire', 'sketch_vote', 'note', 'potd', 'duet', 'doodle',
  'friend_request', 'friend_accept', 'sanctuary_visit', 'playdate', 'warp', 'base_visit', 'neighbor', 'core', 'ultra_set', 'enchant', 'leviathan', 'power',
  'party_invite', 'party_join', 'chat_reply', 'meet_wave', 'star'));

-- (the feed learns the stars' lines: a star discovered, a star full, a Painted Star…: kind 'star', data.sub)
alter table public.feed_events drop constraint if exists feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check
  check (kind in ('join', 'claim', 'publish', 'achievement', 'referral', 'level', 'minigame', 'pvp', 'challenge', 'featured', 'sketch', 'duet', 'stamp',
                  'planet_plot', 'settle', 'exploring', 'playdate', 'dig', 'base', 'core', 'harvest', 'ipo', 'arcade',
                  'luck', 'crown', 'flight', 'estate', 'moderation', 'enchant', 'leviathan', 'primordial', 'star'));
-- (and its own privacy switch, under claims: fa_star)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.feed_activities()'::regprocedure);
  if d not like '%''star''%' then
    n := replace(d, $a$('feed_claims', 'enchant'), ('feed_claims', 'primordial'),$a$, $a$('feed_claims', 'enchant'), ('feed_claims', 'primordial'), ('feed_claims', 'star'),$a$);
    if n = d then raise exception 'skywright: feed_activities anchor not found'; end if;
    execute n;
  end if;
  d := pg_get_functiondef('private.feed_group(text)'::regprocedure);
  if d not like '%''star''%' then
    n := replace(d, $a$when p_kind in ('claim', 'crown', 'planet_plot', 'core', 'enchant', 'primordial') then 'feed_claims'$a$, $a$when p_kind in ('claim', 'crown', 'planet_plot', 'core', 'enchant', 'primordial', 'star') then 'feed_claims'$a$);
    if n = d then raise exception 'skywright: feed_group anchor not found'; end if;
    execute n;
  end if;
end $$;

-- ---- what a plot costs, what it rolls, what it pays ------------------------------------------------------------------
/** the Earth price for this player now (what their next plot on Earth would cost, never less than the base) */
create or replace function private.sw_earth_price(p_uid uuid) returns bigint language sql stable as $$
  select greatest(coalesce((private.cfg('economy') -> 'acquire' ->> 'base_ink')::bigint, 100),
                  coalesce((private.acquire_cost(p_uid, 0, 0) ->> 'ink')::bigint, 0))
$$;
/** the next plot's price on a star (n plots already claimed there), and the Earth price under it */
create or replace function private.sw_price(p_uid uuid, p_n int, p_keystone boolean) returns jsonb language sql stable as $$
  with e as (select private.sw_earth_price(p_uid) earth),
  p as (select e.earth, round(e.earth * (1 + private.stars_n('price_k', 0.05) * sqrt(greatest(p_n, 0))))::bigint price from e)
  select jsonb_build_object('earth', p.earth,
    'ink', case when p_keystone then round(p.price * private.stars_n('keystone_mult', 10))::bigint else p.price end,
    'premium', greatest(0, p.price - p.earth)) from p
$$;
/** a plot's own roll: the everyday ladder (no ultras on stars), Keystones Epic or better */
create or replace function private.sw_roll(p_star bigint, p_cell int, p_keystone boolean) returns text language plpgsql stable as $$
declare v_total int; v_roll bigint; v_acc int := 0; r record;
  v_floor int := coalesce((select sort from public.plot_rarities where id = coalesce(private.stars_cfg() ->> 'keystone_floor', 'epic')), 0);
begin
  v_roll := private.sw_hash(array[p_star / 4294967296, p_star % 4294967296, p_cell, 13]);
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities
   where weight > 0 and coalesce(ppm, 0) = 0 and coalesce(ppb, 0) = 0 and (not p_keystone or sort >= v_floor);
  if v_total = 0 then return case when p_keystone then 'epic' else 'common' end; end if;
  v_roll := v_roll % v_total;
  for r in select id, weight from public.plot_rarities
            where weight > 0 and coalesce(ppm, 0) = 0 and coalesce(ppb, 0) = 0 and (not p_keystone or sort >= v_floor) order by sort, id loop
    v_acc := v_acc + r.weight;
    if v_roll < v_acc then return r.id; end if;
  end loop;
  return 'common';
end $$;
/** one star plot's rent (USD a second): the same rarity's Earth rent × rent_mult (× shiny) */
create or replace function private.sw_plot_rate(p_rarity text, p_shiny boolean) returns numeric language sql stable as $$
  select coalesce((select usd_per_second from public.plot_rarities where id = p_rarity), 0) * private.stars_n('rent_mult', 1.1)
       * case when p_shiny then coalesce((private.cfg('shiny') ->> 'rent_mult')::numeric, 5) else 1 end
$$;
create or replace function private.sw_rent_rate(p_uid uuid) returns numeric language sql stable as $$
  select coalesce(sum(private.sw_plot_rate(rarity, shiny)), 0) from public.star_plots where owner_id = p_uid
$$;
-- a player's rent: their Earth plots and their star plots (× everything that raises all their rent)
create or replace function private.rent_rate(p_uid uuid) returns numeric language sql stable as $$
  select (coalesce((select sum(private.plot_rate(p, r.usd_per_second)) from public.world_plots p join public.plot_rarities r on r.id = p.rarity where p.owner_id = p_uid), 0)
          + private.sw_rent_rate(p_uid)) * private.rent_mult(p_uid)
$$;

-- ---- where you are ----------------------------------------------------------------------------------------------------
/** your pilot row, with an arrival that's come due settled */
create or replace function private.sw_pilot(p_uid uuid) returns public.star_pilots language plpgsql as $$
declare s public.star_pilots%rowtype;
begin
  insert into public.star_pilots (player_id) values (p_uid) on conflict do nothing;
  select * into s from public.star_pilots where player_id = p_uid for update;
  if s.dest_star is not null and s.arrive_at <= now() then
    update public.star_pilots set at_star = dest_star, dest_star = null, depart_at = null, arrive_at = null, updated_at = now()
     where player_id = p_uid returning * into s;
  end if;
  return s;
end $$;
/** how far it is and what it takes to warp somewhere: {ly, ink, secs} (a Stargate there takes a share off the Ink) */
create or replace function private.sw_warp_cost(p_uid uuid, p_star bigint) returns jsonb language plpgsql stable as $$
declare w jsonb := coalesce(private.stars_cfg() -> 'warp', '{}'::jsonb); s jsonb := private.sw_star(p_star); v_ly numeric; v_d numeric; v_ink numeric; v_secs numeric;
  v_gate boolean;
begin
  if s is null then return null; end if;
  v_ly := (s ->> 'ly')::numeric;
  v_d := ln(1 + v_ly / 4) / ln(2);
  v_ink := least(coalesce((w ->> 'max_ink')::numeric, 400), coalesce((w ->> 'base_ink')::numeric, 30) + coalesce((w ->> 'per_doubling')::numeric, 12) * v_d);
  v_secs := least(coalesce((w ->> 'max_secs')::numeric, 90), coalesce((w ->> 'secs_base')::numeric, 14) + coalesce((w ->> 'secs_per_doubling')::numeric, 4) * v_d);
  v_gate := exists (select 1 from public.star_plots where star_id = p_star and kind = 'gate');
  if v_gate then v_ink := v_ink * (1 - coalesce((w ->> 'gate_pct')::numeric, 40) / 100); end if;
  return jsonb_build_object('ly', v_ly, 'ink', round(v_ink)::int, 'secs', round(v_secs)::int, 'gate', v_gate);
end $$;
create or replace function private.sw_pilot_json(s public.star_pilots) returns jsonb language sql stable as $$
  select jsonb_build_object('at_star', s.at_star, 'dest_star', s.dest_star, 'depart_at', s.depart_at, 'arrive_at', s.arrive_at, 'warps', s.warps,
    'at', case when s.at_star is null then null else (select jsonb_build_object('id', ss.star_id, 'name', coalesce(ss.name, x ->> 'catalog_name')) from (select private.sw_star(s.at_star) x) q
                                                         left join public.star_systems ss on ss.star_id = s.at_star) end)
$$;

-- ---- the card for a star (what the preview shows) ------------------------------------------------------------------------
create or replace function public.star_card(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); s jsonb := private.sw_star(p_id); sys public.star_systems%rowtype; v_mine int := 0; v_keys int := 0;
  v_owners jsonb; v_art jsonb; p public.star_pilots%rowtype; v_kinds jsonb;
begin
  if s is null then raise exception 'no_such_star' using errcode = 'P0001'; end if;
  select * into sys from public.star_systems where star_id = p_id;
  if found then
    if v_uid is not null then select count(*) into v_mine from public.star_plots where star_id = p_id and owner_id = v_uid; end if;
    select count(*) into v_keys from public.star_plots where star_id = p_id and keystone;
    select coalesce(jsonb_agg(jsonb_build_object('id', o.owner_id, 'username', pr.username, 'name', pr.display_name, 'accent', pr.accent_color, 'plots', o.n) order by o.n desc), '[]'::jsonb)
      into v_owners from (select owner_id, count(*) n from public.star_plots where star_id = p_id group by owner_id order by count(*) desc limit 12) o
      left join public.profiles pr on pr.id = o.owner_id;
    select coalesce(jsonb_agg(jsonb_build_object('owner', a.owner_id, 'rev', a.rev, 'w', a.w, 'h', a.h, 'color', a.color, 'status', a.status, 'mine', a.owner_id = v_uid) order by a.updated_at), '[]'::jsonb)
      into v_art from public.star_art a where a.star_id = p_id and (a.status = 'approved' or a.owner_id = v_uid or not coalesce((private.stars_cfg() -> 'art' ->> 'review')::boolean, true));
    select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) into v_kinds from (select kind, count(*) n from public.star_plots where star_id = p_id group by kind) k;
  end if;
  if v_uid is not null then select * into p from public.star_pilots where player_id = v_uid; end if;
  return s || jsonb_build_object(
    'name', coalesce(sys.name, s ->> 'catalog_name'),
    'claimed', coalesce(sys.claimed, 0), 'painted', coalesce(sys.painted, false), 'painted_at', sys.painted_at, 'color', sys.color, 'art_rev', coalesce(sys.art_rev, 0),
    'discoverer', case when sys.discoverer_id is null then null else (select jsonb_build_object('id', id, 'username', username, 'name', display_name, 'accent', accent_color) from public.profiles where id = sys.discoverer_id) end,
    'discovered_at', sys.discovered_at, 'mine', v_mine, 'keystones_claimed', v_keys, 'owners', coalesce(v_owners, '[]'::jsonb), 'art', coalesce(v_art, '[]'::jsonb), 'kinds', coalesce(v_kinds, '{}'::jsonb),
    'price', case when v_uid is null then null else private.sw_price(v_uid, coalesce(sys.claimed, 0), false) end,
    'keystone_price', case when v_uid is null then null else private.sw_price(v_uid, coalesce(sys.claimed, 0), true) end,
    'warp', case when v_uid is null then null else private.sw_warp_cost(v_uid, p_id) end,
    'here', coalesce(p.at_star = p_id and p.dest_star is null, false),
    'heading', coalesce(p.dest_star = p_id, false),
    'rent_mult', private.stars_n('rent_mult', 1.1), 'discoverer_pct', private.stars_n('discoverer_pct', 10));
end $$;

/** for the sky: which of these stars have been claimed (their colour, how full, painted, their art's revision) */
create or replace function public.stars_seen(p_ids bigint[]) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.star_id, 'claimed', s.claimed, 'cells', s.cells, 'painted', s.painted, 'color', s.color,
    'art_rev', s.art_rev, 'name', s.name)), '[]'::jsonb)
  from public.star_systems s where s.star_id = any (p_ids[1:800])
$$;
/** every claimed real star (the naked-eye sky's 5,000 are few enough to ask for at once) */
create or replace function public.stars_seen_real() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.star_id, 'claimed', s.claimed, 'cells', s.cells, 'painted', s.painted, 'color', s.color,
    'art_rev', s.art_rev, 'name', s.name)), '[]'::jsonb)
  from public.star_systems s where s.tier = 0
$$;

/** a star's claimed plots (all of them for a star up to 3,242 plots; else just the cells asked about, up to 4,000) */
create or replace function public.star_plots_of(p_id bigint, p_cells int[] default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); sys public.star_systems%rowtype; v jsonb;
begin
  select * into sys from public.star_systems where star_id = p_id;
  if not found then return jsonb_build_object('plots', '[]'::jsonb, 'claimed', 0); end if;
  if p_cells is null and sys.cells > 3242 then raise exception 'too_many' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(jsonb_build_array(sp.cell, sp.rarity, sp.shiny, sp.kind, sp.owner_id = v_uid, pr.username, pr.accent_color, sp.name, sp.keystone)), '[]'::jsonb) into v
    from public.star_plots sp left join public.profiles pr on pr.id = sp.owner_id
   where sp.star_id = p_id and (p_cells is null or sp.cell = any (p_cells[1:4000]));
  return jsonb_build_object('plots', v, 'claimed', sys.claimed, 'cells', sys.cells);
end $$;

-- ---- getting there --------------------------------------------------------------------------------------------------
/** how deep your telescope reaches (tiers: 3 deep field for everyone; an Observatory among the stars takes it to
 *  ultra deep (4), and a level-3 one, or two of them, to the far galaxy (5)) */
create or replace function private.sw_reach(p_uid uuid) returns int language sql stable as $$
  select least(5, 3 + case
    when p_uid is null then 0
    when (select count(*) from public.star_plots where owner_id = p_uid and kind = 'observatory') >= 2
      or exists (select 1 from public.star_plots where owner_id = p_uid and kind = 'observatory' and level >= 3) then 2
    when exists (select 1 from public.star_plots where owner_id = p_uid and kind = 'observatory') then 1
    else 0 end)
$$;
create or replace function public.star_reach() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('reach', private.sw_reach(auth.uid()))
$$;
/** where you are among the stars */
create or replace function public.star_where() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.star_pilots%rowtype;
begin
  s := private.sw_pilot(v_uid);
  return private.sw_pilot_json(s);
end $$;
/** warp to a star: pay the fuel (Ink), and you're there when the warp ends */
create or replace function public.star_warp(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.star_pilots%rowtype; c jsonb;
begin
  perform private.rate_limit('star_warp', 60, 3600);
  if not coalesce((private.stars_cfg() ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  c := private.sw_warp_cost(v_uid, p_id);
  if c is null then raise exception 'no_such_star' using errcode = 'P0001'; end if;
  -- (finding a star deeper than your telescope reaches takes an Observatory; one someone's already found is on the chart)
  if (private.sw_star(p_id) ->> 'tier')::int > private.sw_reach(v_uid) and not exists (select 1 from public.star_systems where star_id = p_id) then
    raise exception 'out_of_reach' using errcode = 'P0001';
  end if;
  s := private.sw_pilot(v_uid);
  if s.at_star = p_id and s.dest_star is null then return private.sw_pilot_json(s) || jsonb_build_object('cost', 0, 'secs', 0); end if;
  perform private.charge(v_uid, jsonb_build_object('ink', (c ->> 'ink')::int), 'star_warp', 'star', p_id::text, null);
  update public.star_pilots set dest_star = p_id, depart_at = now(), arrive_at = now() + make_interval(secs => (c ->> 'secs')::int),
         via_gate = (c ->> 'gate')::boolean, warps = warps + 1, updated_at = now()
   where player_id = v_uid returning * into s;
  return private.sw_pilot_json(s) || jsonb_build_object('cost', (c ->> 'ink')::int, 'secs', (c ->> 'secs')::int, 'ly', c -> 'ly', 'gate', c -> 'gate', 'balances', private.balances(v_uid));
end $$;
/** arrive now (a little more fuel) */
create or replace function public.star_rush() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.star_pilots%rowtype; v_ink int := coalesce((private.stars_cfg() -> 'warp' ->> 'rush_ink')::int, 10);
begin
  s := private.sw_pilot(v_uid);
  if s.dest_star is null then return private.sw_pilot_json(s); end if;
  if v_ink > 0 then perform private.charge(v_uid, jsonb_build_object('ink', v_ink), 'star_warp', 'star_rush', s.dest_star::text, null); end if;
  update public.star_pilots set at_star = dest_star, dest_star = null, depart_at = null, arrive_at = null, updated_at = now() where player_id = v_uid returning * into s;
  return private.sw_pilot_json(s) || jsonb_build_object('balances', private.balances(v_uid));
end $$;
/** back to Earth (free) */
create or replace function public.star_home() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.star_pilots%rowtype;
begin
  s := private.sw_pilot(v_uid);
  update public.star_pilots set at_star = null, dest_star = null, depart_at = null, arrive_at = null, updated_at = now() where player_id = v_uid returning * into s;
  return private.sw_pilot_json(s);
end $$;

-- ---- claiming a plot on a star ------------------------------------------------------------------------------------------
/** the plot types a star plot can be (the star-only ones join as they're built: skywright_kinds) */
create or replace function private.sw_kinds() returns text[] language sql immutable as $$
  select array['base', 'art']
$$;
create or replace function private.sw_keystone_kind(p_kind text) returns boolean language sql immutable as $$ select p_kind in ('gate', 'lens') $$;
/** what each plot type a star plot can be is (name, emoji, what it does, Keystone-only) */
create or replace function private.sw_kind_info() returns jsonb language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('id', 'base', 'name', 'Base', 'emoji', '⬡', 'blurb', 'A plain panel of the shell: it pays its rent and that''s all.', 'keystone', false),
    jsonb_build_object('id', 'art', 'name', 'Art', 'emoji', '🎨', 'blurb', 'A panel you paint — paint the whole star and it shows in everyone''s telescope.', 'keystone', false))
$$;
create or replace function public.star_kinds() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_array_elements(private.sw_kind_info()) k where k ->> 'id' = any (private.sw_kinds())
$$;
create or replace function private.sw_event(p_star bigint, p_uid uuid, p_kind text, p_data jsonb) returns void language sql as $$
  insert into public.star_events (star_id, player_id, kind, data) values (p_star, p_uid, p_kind, coalesce(p_data, '{}'::jsonb))
$$;

create or replace function public.star_claim(p_id bigint, p_cell int, p_kind text default 'base', p_idempotency_key text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_prev jsonb; s jsonb := private.sw_star(p_id); p public.star_pilots%rowtype;
  sys public.star_systems%rowtype; v_key boolean; v_price jsonb; v_rarity text; v_shiny boolean; v_cut int := 0; v_new boolean := false;
  v_kind text := coalesce(nullif(p_kind, ''), 'base'); v_one numeric; v_res jsonb; v_badges jsonb;
begin
  if p_idempotency_key is not null then
    v_prev := private.idem_begin(v_uid, p_idempotency_key, 'star_claim');
    if v_prev is not null then return v_prev; end if;
  end if;
  perform private.rate_limit('star_claim', 240, 3600);
  if not coalesce((private.stars_cfg() ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  if s is null then raise exception 'no_such_star' using errcode = 'P0001'; end if;
  if p_cell is null or p_cell < 0 or p_cell >= (s ->> 'cells')::int then raise exception 'invalid_plot' using errcode = 'P0001'; end if;
  if not (v_kind = any (private.sw_kinds())) then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  v_key := p_cell < 12;
  if private.sw_keystone_kind(v_kind) and not v_key then raise exception 'keystone_only' using errcode = 'P0001'; end if;
  -- (you place plots on a star when you're there)
  p := private.sw_pilot(v_uid);
  if p.at_star is distinct from p_id or p.dest_star is not null then raise exception 'not_at_star' using errcode = 'P0001'; end if;
  if (select count(*) from public.star_plots where owner_id = v_uid) >= private.stars_n('max_star_plots', 5000) then raise exception 'plot_limit_reached' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('star:' || p_id));
  if exists (select 1 from public.star_plots where star_id = p_id and cell = p_cell) then raise exception 'plot_unavailable' using errcode = 'P0001'; end if;
  -- the first plot on a star: its system begins, and whoever claimed it is its Discoverer
  select * into sys from public.star_systems where star_id = p_id for update;
  if not found then
    insert into public.star_systems (star_id, tier, cls, m, cells, discoverer_id) values (p_id, (s ->> 'tier')::int, s ->> 'cls', (s ->> 'm')::int, (s ->> 'cells')::int, v_uid)
    returning * into sys;
    v_new := true;
  end if;
  v_price := private.sw_price(v_uid, sys.claimed, v_key);
  perform private.rent_settle(v_uid);
  perform private.charge(v_uid, jsonb_build_object('ink', (v_price ->> 'ink')::bigint), 'star_plot', 'star', p_id || ':' || p_cell, null);
  v_rarity := private.sw_roll(p_id, p_cell, v_key);
  v_one := greatest(coalesce((private.cfg('shiny') ->> 'one_in')::numeric, 1000), 1);
  v_shiny := coalesce((private.cfg('shiny') ->> 'enabled')::boolean, true) and random() < 1 / v_one;
  insert into public.star_plots (star_id, cell, owner_id, rarity, shiny, keystone, kind, paid_ink)
  values (p_id, p_cell, v_uid, v_rarity, v_shiny, v_key, v_kind, (v_price ->> 'ink')::bigint);
  update public.star_systems set claimed = claimed + 1, updated_at = now(), painted = false where star_id = p_id returning * into sys;
  -- the Discoverer's cut of what's paid above the Earth price (never their own purchase)
  if sys.discoverer_id is not null and sys.discoverer_id <> v_uid then
    -- (never less than 1 Ink while there's a premium at all: the star's first few plots cost only a little over Earth's)
    v_cut := case when (v_price ->> 'premium')::numeric > 0 and private.stars_n('discoverer_pct', 10) > 0
                  then greatest(1, floor((v_price ->> 'premium')::numeric * (case when v_key then private.stars_n('keystone_mult', 10) else 1 end) * private.stars_n('discoverer_pct', 10) / 100))::int
                  else 0 end;
    if v_cut > 0 then
      v_cut := private.grant_ink_paced(sys.discoverer_id, v_cut, 'stars', 'star_discoverer', p_id || ':' || p_cell, 'star-cut:' || p_id || ':' || p_cell);
      if v_cut > 0 then
        perform private.notify(sys.discoverer_id, 'star', v_uid,
          jsonb_build_object('sub', 'cut', 'star', p_id, 'name', coalesce(sys.name, s ->> 'catalog_name'), 'ink', v_cut, 'by', (select username from public.profiles where id = v_uid)));
      end if;
    end if;
  end if;
  if v_new then
    perform private.sw_event(p_id, v_uid, 'discovered', jsonb_build_object('cls', s ->> 'cls'));
    insert into public.feed_events (kind, player_id, data) values ('star', v_uid, jsonb_build_object('sub', 'discovered', 'star', p_id, 'name', s ->> 'catalog_name', 'cls', s ->> 'cls', 'class_name', s ->> 'class_name'));
  end if;
  perform private.sw_event(p_id, v_uid, 'claimed', jsonb_build_object('cell', p_cell, 'rarity', v_rarity, 'shiny', v_shiny, 'keystone', v_key, 'kind', v_kind));
  if sys.claimed >= sys.cells then
    perform private.sw_event(p_id, v_uid, 'full', '{}'::jsonb);
    insert into public.feed_events (kind, player_id, data) values ('star', v_uid, jsonb_build_object('sub', 'full', 'star', p_id, 'name', coalesce(sys.name, s ->> 'catalog_name'), 'cells', sys.cells));
  end if;
  v_badges := private.sw_badges(v_uid);
  v_res := jsonb_build_object('star', p_id, 'cell', p_cell, 'rarity', v_rarity, 'shiny', v_shiny, 'keystone', v_key, 'kind', v_kind,
    'cost', jsonb_build_object('ink', (v_price ->> 'ink')::bigint), 'earth_price', v_price -> 'earth', 'discovered', v_new, 'discoverer_cut', v_cut,
    'next_price', private.sw_price(v_uid, sys.claimed, false), 'claimed', sys.claimed, 'cells', sys.cells,
    'usd_per_second', private.sw_plot_rate(v_rarity, v_shiny), 'balances', private.balances(v_uid), 'rent', private.rent_json(v_uid), 'achievements', v_badges);
  if p_idempotency_key is not null then return private.idem_finish(v_uid, p_idempotency_key, v_res); end if;
  return v_res;
end $$;

/** change what one of your star plots is (Keystone types only on a Keystone) */
create or replace function public.star_set_kind(p_id bigint, p_cell int, p_kind text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); sp public.star_plots%rowtype;
begin
  if not (p_kind = any (private.sw_kinds())) then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  select * into sp from public.star_plots where star_id = p_id and cell = p_cell and owner_id = v_uid for update;
  if not found then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if private.sw_keystone_kind(p_kind) and not sp.keystone then raise exception 'keystone_only' using errcode = 'P0001'; end if;
  if sp.kind = p_kind then return jsonb_build_object('kind', p_kind); end if;
  update public.star_plots set kind = p_kind, state = '{}'::jsonb where star_id = p_id and cell = p_cell;
  perform private.sw_event(p_id, v_uid, 'kind', jsonb_build_object('cell', p_cell, 'kind', p_kind));
  return jsonb_build_object('kind', p_kind, 'cell', p_cell);
end $$;

/** name one of your plots on a star */
create or replace function public.star_name_plot(p_id bigint, p_cell int, p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v text := private.clean_plot_name(p_name);
begin
  update public.star_plots set name = v where star_id = p_id and cell = p_cell and owner_id = v_uid;
  if not found then raise exception 'not_owner' using errcode = 'P0001'; end if;
  return jsonb_build_object('name', v);
end $$;
/** the Discoverer names their star (once a week at most) */
create or replace function public.star_name(p_id bigint, p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v text := private.clean_plot_name(p_name); sys public.star_systems%rowtype;
begin
  select * into sys from public.star_systems where star_id = p_id for update;
  if not found or sys.discoverer_id is distinct from v_uid then raise exception 'not_discoverer' using errcode = 'P0001'; end if;
  if exists (select 1 from public.star_events where star_id = p_id and kind = 'named' and at > now() - interval '7 days') then raise exception 'too_soon' using errcode = 'P0001'; end if;
  update public.star_systems set name = v, updated_at = now() where star_id = p_id;
  perform private.sw_event(p_id, v_uid, 'named', jsonb_build_object('name', v));
  return jsonb_build_object('name', v);
end $$;

/** your stars: where you have plots, and the ones you discovered */
create or replace function public.my_stars() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v jsonb;
begin
  select coalesce(jsonb_agg(x order by x ->> 'last' desc), '[]'::jsonb) into v from (
    select jsonb_build_object('id', s.star_id, 'name', coalesce(s.name, (private.sw_star(s.star_id)) ->> 'catalog_name'), 'cls', s.cls, 'cells', s.cells, 'claimed', s.claimed,
      'painted', s.painted, 'color', s.color, 'discoverer', s.discoverer_id = v_uid, 'mine', coalesce(m.n, 0), 'keystones', coalesce(m.k, 0),
      'kinds', coalesce(m.kinds, '{}'::jsonb), 'usd_per_second', coalesce(m.rate, 0), 'last', coalesce(m.last, s.discovered_at)) x
      from public.star_systems s
      left join lateral (select count(*) n, count(*) filter (where keystone) k, max(claimed_at) last, sum(private.sw_plot_rate(rarity, shiny)) rate,
                                (select jsonb_object_agg(kind, c) from (select kind, count(*) c from public.star_plots where star_id = s.star_id and owner_id = v_uid group by kind) z) kinds
                           from public.star_plots where star_id = s.star_id and owner_id = v_uid) m on true
     where s.discoverer_id = v_uid or m.n > 0) q;
  return jsonb_build_object('stars', v, 'plots', (select count(*) from public.star_plots where owner_id = v_uid),
    'usd_per_second', private.sw_rent_rate(v_uid) * private.rent_mult(v_uid), 'where', private.sw_pilot_json(private.sw_pilot(v_uid)));
end $$;

/** the star chart: painted stars, the fullest, the newest discoveries */
create or replace function public.stars_chart() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'painted', (select coalesce(jsonb_agg(jsonb_build_object('id', star_id, 'name', coalesce(name, (private.sw_star(star_id)) ->> 'catalog_name'), 'cls', cls, 'cells', cells, 'color', color, 'painted_at', painted_at, 'art_rev', art_rev) order by painted_at desc), '[]'::jsonb)
                  from (select * from public.star_systems where painted order by painted_at desc limit 40) a),
    'fullest', (select coalesce(jsonb_agg(jsonb_build_object('id', star_id, 'name', coalesce(name, (private.sw_star(star_id)) ->> 'catalog_name'), 'cls', cls, 'cells', cells, 'claimed', claimed, 'color', color) order by claimed desc), '[]'::jsonb)
                  from (select * from public.star_systems order by claimed desc limit 30) b),
    'newest', (select coalesce(jsonb_agg(jsonb_build_object('id', s.star_id, 'name', coalesce(s.name, (private.sw_star(s.star_id)) ->> 'catalog_name'), 'cls', s.cls, 'cells', s.cells, 'claimed', s.claimed,
                  'discoverer', p.username, 'at', s.discovered_at) order by s.discovered_at desc), '[]'::jsonb)
                  from (select * from public.star_systems order by discovered_at desc limit 30) s left join public.profiles p on p.id = s.discoverer_id),
    'totals', (select jsonb_build_object('systems', count(*), 'plots', coalesce(sum(claimed), 0), 'painted', count(*) filter (where painted)) from public.star_systems))
$$;

-- ---- a star's paintings ---------------------------------------------------------------------------------------------------
/** save your painting of a star (a flat map of the whole star; only your own plots of it show). PNG/WebP as a data URL. */
create or replace function public.star_art_save(p_id bigint, p_img text, p_w int, p_h int, p_color text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); a jsonb := coalesce(private.stars_cfg() -> 'art', '{}'::jsonb);
  v_review boolean := coalesce((a ->> 'review')::boolean, true); v_rev int; v_status text;
begin
  perform private.rate_limit('star_art', 60, 3600);
  if not exists (select 1 from public.star_plots where star_id = p_id and owner_id = v_uid) then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if p_img is null or p_img !~ '^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$' then raise exception 'invalid_image' using errcode = 'P0001'; end if;
  if octet_length(p_img) > coalesce((a ->> 'max_kb')::int, 900) * 1024 * 4 / 3 + 64 then raise exception 'image_too_big' using errcode = 'P0001'; end if;
  if p_w is null or p_h is null or p_w < 64 or p_w > coalesce((a ->> 'max_w')::int, 2048) or p_h * 2 <> p_w then raise exception 'invalid_image' using errcode = 'P0001'; end if;
  if p_color is not null and p_color !~ '^#[0-9A-Fa-f]{6}$' then p_color := null; end if;
  v_status := case when v_review then 'pending' else 'approved' end;
  insert into public.star_art (star_id, owner_id, w, h, img, color, status) values (p_id, v_uid, p_w, p_h, p_img, p_color, v_status)
  on conflict (star_id, owner_id) do update set rev = public.star_art.rev + 1, w = excluded.w, h = excluded.h, img = excluded.img, color = excluded.color,
    status = excluded.status, reviewed_by = null, reviewed_at = null, reason = null, updated_at = now()
  returning rev into v_rev;
  if not v_review then perform private.sw_art_changed(p_id); end if;
  perform private.sw_event(p_id, v_uid, 'painted', jsonb_build_object('rev', v_rev, 'status', v_status));
  return jsonb_build_object('rev', v_rev, 'status', v_status, 'achievements', private.sw_badges(v_uid));
end $$;
/** one painting (approved ones for anyone; your own whatever its state) */
create or replace function public.star_art_layer(p_id bigint, p_owner uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('owner', owner_id, 'rev', rev, 'w', w, 'h', h, 'img', img, 'color', color, 'status', status)
    from public.star_art where star_id = p_id and owner_id = p_owner
     and (status = 'approved' or owner_id = auth.uid() or not coalesce((private.stars_cfg() -> 'art' ->> 'review')::boolean, true))
$$;
/** a star's paintings changed: its colour (the paintings' colours, weighted by plots), its revision, and whether it's now a Painted Star */
create or replace function private.sw_art_changed(p_id bigint) returns void language plpgsql as $$
declare sys public.star_systems%rowtype; v_r numeric := 0; v_g numeric := 0; v_b numeric := 0; v_n numeric := 0; r record; v_painted boolean;
begin
  select * into sys from public.star_systems where star_id = p_id for update;
  if not found then return; end if;
  for r in select a.color, (select count(*) from public.star_plots sp where sp.star_id = p_id and sp.owner_id = a.owner_id) n
             from public.star_art a where a.star_id = p_id and a.status = 'approved' and a.color is not null loop
    v_r := v_r + ('x' || substr(r.color, 2, 2))::bit(8)::int * r.n; v_g := v_g + ('x' || substr(r.color, 4, 2))::bit(8)::int * r.n;
    v_b := v_b + ('x' || substr(r.color, 6, 2))::bit(8)::int * r.n; v_n := v_n + r.n;
  end loop;
  v_painted := sys.claimed >= sys.cells and not exists (
    select 1 from (select distinct owner_id from public.star_plots where star_id = p_id) o
     where not exists (select 1 from public.star_art a where a.star_id = p_id and a.owner_id = o.owner_id and a.status = 'approved'));
  update public.star_systems set art_rev = art_rev + 1, updated_at = now(),
    color = case when v_n > 0 then '#' || lpad(to_hex(round(v_r / v_n)::int), 2, '0') || lpad(to_hex(round(v_g / v_n)::int), 2, '0') || lpad(to_hex(round(v_b / v_n)::int), 2, '0') else null end,
    painted = v_painted, painted_at = case when v_painted and not sys.painted then now() else painted_at end
   where star_id = p_id;
  if v_painted and not sys.painted then
    perform private.sw_event(p_id, null, 'painted_star', '{}'::jsonb);
    insert into public.feed_events (kind, player_id, data)
    select 'star', o.owner_id, jsonb_build_object('sub', 'painted', 'star', p_id, 'name', coalesce(sys.name, (private.sw_star(p_id)) ->> 'catalog_name'), 'cells', sys.cells)
      from (select owner_id from public.star_plots where star_id = p_id group by owner_id order by count(*) desc limit 1) o;
    perform private.notify(o.owner_id, 'star', null, jsonb_build_object('sub', 'painted', 'star', p_id, 'name', coalesce(sys.name, (private.sw_star(p_id)) ->> 'catalog_name')))
       from (select distinct owner_id from public.star_plots where star_id = p_id) o;
  end if;
end $$;

-- the review queue (admin portal → Star art)
create or replace function public.admin_star_art_queue() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_admin(array['moderator']);
  return (select coalesce(jsonb_agg(jsonb_build_object('star', a.star_id, 'owner', a.owner_id, 'username', p.username, 'rev', a.rev, 'w', a.w, 'h', a.h, 'img', a.img,
    'color', a.color, 'status', a.status, 'updated_at', a.updated_at, 'star_name', coalesce(s.name, (private.sw_star(a.star_id)) ->> 'catalog_name'),
    'plots', (select count(*) from public.star_plots sp where sp.star_id = a.star_id and sp.owner_id = a.owner_id)) order by a.updated_at), '[]'::jsonb)
    from (select * from public.star_art where status = 'pending' order by updated_at limit 40) a
    left join public.profiles p on p.id = a.owner_id left join public.star_systems s on s.star_id = a.star_id);
end $$;
create or replace function public.admin_star_art_review(p_star bigint, p_owner uuid, p_approve boolean, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_staff uuid := private.require_admin(array['moderator']);
begin
  update public.star_art set status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = v_staff, reviewed_at = now(), reason = p_reason
   where star_id = p_star and owner_id = p_owner;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.sw_art_changed(p_star);
  perform private.notify(p_owner, 'star', null, jsonb_build_object('sub', case when p_approve then 'art_ok' else 'art_no' end, 'star', p_star, 'reason', p_reason,
    'name', (select coalesce(s.name, (private.sw_star(p_star)) ->> 'catalog_name') from public.star_systems s where s.star_id = p_star)));
  perform private.audit('star_art_review', 'star_art', p_star || ':' || p_owner, jsonb_build_object('approve', p_approve, 'reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;

/** admin → Stars: the settings, how it's going, the latest discoveries */
create or replace function public.admin_stars() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_admin(array['moderator', 'economy']);
  return jsonb_build_object(
    'settings', private.stars_cfg(),
    'stats', jsonb_build_object(
      'systems', (select count(*) from public.star_systems), 'plots', (select count(*) from public.star_plots),
      'painted', (select count(*) from public.star_systems where painted), 'owners', (select count(distinct owner_id) from public.star_plots),
      'plots_7d', (select count(*) from public.star_plots where claimed_at > now() - interval '7 days'),
      'ink_7d', (select coalesce(sum(paid_ink), 0) from public.star_plots where claimed_at > now() - interval '7 days'),
      'pending_art', (select count(*) from public.star_art where status = 'pending'),
      'by_kind', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) n from public.star_plots group by kind) k),
      'by_tier', (select coalesce(jsonb_object_agg(tier, n), '{}'::jsonb) from (select tier, count(*) n from public.star_systems group by tier) k)),
    'recent', (select coalesce(jsonb_agg(x order by x ->> 'at' desc), '[]'::jsonb) from (
      select jsonb_build_object('star', s.star_id, 'name', coalesce(s.name, (private.sw_star(s.star_id)) ->> 'catalog_name'), 'cls', s.cls, 'tier', s.tier, 'cells', s.cells,
        'claimed', s.claimed, 'painted', s.painted, 'discoverer', jsonb_build_object('id', s.discoverer_id, 'username', p.username), 'at', s.discovered_at) x
        from public.star_systems s left join public.profiles p on p.id = s.discoverer_id order by s.discovered_at desc limit 30) q));
end $$;
/** admin → Stars: change the settings (economy staff; in the audit log) */
create or replace function public.admin_set_star_settings(p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); v jsonb; k text; x jsonb; k2 text; x2 jsonb;
  nums text[] := array['rent_mult', 'price_k', 'keystone_mult', 'discoverer_pct', 'max_star_plots'];
  sub jsonb := jsonb_build_object(
    'warp', jsonb_build_array('base_ink', 'per_doubling', 'max_ink', 'secs_base', 'secs_per_doubling', 'max_secs', 'rush_ink', 'gate_pct'),
    'art', jsonb_build_array('review', 'max_kb', 'max_w'));
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then raise exception 'invalid_value' using errcode = 'P0001'; end if;
  for k, x in select * from jsonb_each(p_value) loop
    if k = any (nums) then
      if jsonb_typeof(x) <> 'number' or (x::text)::numeric < 0 then raise exception 'invalid_value' using errcode = 'P0001', detail = k; end if;
    elsif k = 'enabled' then
      if jsonb_typeof(x) <> 'boolean' then raise exception 'invalid_value' using errcode = 'P0001', detail = k; end if;
    elsif k = 'keystone_floor' then
      if not exists (select 1 from public.plot_rarities where id = x #>> '{}' and weight > 0 and coalesce(ppm, 0) = 0 and coalesce(ppb, 0) = 0) then raise exception 'invalid_value' using errcode = 'P0001', detail = k; end if;
    elsif sub ? k then
      if jsonb_typeof(x) <> 'object' then raise exception 'invalid_value' using errcode = 'P0001', detail = k; end if;
      for k2, x2 in select * from jsonb_each(x) loop
        if not (sub -> k) ? k2 then raise exception 'invalid_value' using errcode = 'P0001', detail = k || '.' || k2; end if;
        if k2 = 'review' then
          if jsonb_typeof(x2) <> 'boolean' then raise exception 'invalid_value' using errcode = 'P0001', detail = k2; end if;
        elsif jsonb_typeof(x2) <> 'number' or (x2::text)::numeric < 0 then raise exception 'invalid_value' using errcode = 'P0001', detail = k2;
        end if;
      end loop;
    elsif k in ('kinds', 'nature') then
      if jsonb_typeof(x) <> 'object' then raise exception 'invalid_value' using errcode = 'P0001', detail = k; end if;
    else
      raise exception 'invalid_value' using errcode = 'P0001', detail = k;
    end if;
  end loop;
  if coalesce((p_value ->> 'rent_mult')::numeric, 1) < 0.5 or coalesce((p_value ->> 'rent_mult')::numeric, 1) > 3
     or coalesce((p_value ->> 'discoverer_pct')::numeric, 0) > 50 or coalesce((p_value ->> 'keystone_mult')::numeric, 1) < 1 then
    raise exception 'invalid_value' using errcode = 'P0001', detail = 'range';
  end if;
  select value into v from public.game_config where key = 'stars';
  update public.game_config set value = coalesce(v, '{}'::jsonb) || (
      select coalesce(jsonb_object_agg(e.key, case when jsonb_typeof(e.value) = 'object' and jsonb_typeof(coalesce(v -> e.key, 'null')) = 'object' then (v -> e.key) || e.value else e.value end), '{}'::jsonb)
        from jsonb_each(p_value) e),
    updated_at = now(), updated_by = v_uid where key = 'stars';
  perform private.audit('stars.settings', 'config', 'stars', jsonb_build_object('before', v, 'set', p_value));
  return public.admin_stars();
end $$;

-- ---- Ink from the stars (paced like every other source; its own switch: reason:stars) -----------------------------------
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.grant(uuid,jsonb,text,text,text,text)'::regprocedure);
  if d like '%''stars''%' then return; end if;
  n := replace(d, $a$'group_game', 'enchantment'$a$, $a$'group_game', 'enchantment', 'stars'$a$);
  if n = d then raise exception 'skywright: grant anchor not found'; end if;
  execute n;
end $$;
update public.game_config set value = jsonb_set(value, '{paced}', coalesce(value -> 'paced', '[]'::jsonb) || '["stars"]'::jsonb)
 where key = 'ink_pacing' and not coalesce(value -> 'paced', '[]'::jsonb) ? 'stars';

-- ---- badges -----------------------------------------------------------------------------------------------------------------
alter table public.achievements drop constraint if exists achievements_category_check;
alter table public.achievements add constraint achievements_category_check
  check (category in ('creation', 'collection', 'exploration', 'mastery', 'community', 'rarity', 'daily', 'travel', 'estate', 'kinds', 'enchant', 'stars'));
insert into public.achievements (key, name, description, icon, category, metric, threshold, reward, sort, is_secret) values
  ('sw_first', 'Stargazer', 'Claim your first plot on a star.', '✨', 'stars', 'stars.plots', 1, '{"luck": 5}', 900, false),
  ('sw_ten', 'Star Settler', 'Own 10 plots among the stars.', '🌌', 'stars', 'stars.plots', 10, '{"luck": 10}', 901, false),
  ('sw_hundred', 'Constellation Builder', 'Own 100 plots among the stars.', '🌠', 'stars', 'stars.plots', 100, '{"luck": 25, "enchanted_luck": 1}', 902, false),
  ('sw_disc', 'Discoverer', 'Be the first to claim a plot on a star.', '🔭', 'stars', 'stars.discovered', 1, '{"luck": 10}', 903, false),
  ('sw_disc10', 'Astronomer', 'Discover 10 stars.', '🪐', 'stars', 'stars.discovered', 10, '{"luck": 25}', 904, false),
  ('sw_key', 'Keystone', 'Claim one of a star''s 12 Keystones.', '⬟', 'stars', 'stars.keystones', 1, '{"luck": 15}', 905, false),
  ('sw_whole', 'A Star of My Own', 'Own every plot on a star.', '⭐', 'stars', 'stars.whole', 1, '{"luck": 30, "enchanted_luck": 1}', 906, false),
  ('sw_painter', 'Sky Painter', 'Paint a star.', '🎨', 'stars', 'stars.painted_layers', 1, '{"luck": 8}', 907, false),
  ('sw_painted', 'Painted Star', 'Be part of a Painted Star: every plot claimed and painted.', '🖼️', 'stars', 'stars.painted_stars', 1, '{"luck": 30, "enchanted_luck": 1}', 908, false),
  ('sw_far', 'Far Galaxy', 'Claim a plot on a star in the far galaxy.', '🌀', 'stars', 'stars.tier5', 1, '{"luck": 20}', 909, true),
  ('sw_hyper', 'Ten Million', 'Claim a plot on a hypergiant.', '☀️', 'stars', 'stars.hyper', 1, '{"luck": 20}', 910, true)
on conflict (key) do update set name = excluded.name, description = excluded.description, icon = excluded.icon, category = excluded.category,
  metric = excluded.metric, threshold = excluded.threshold, reward = excluded.reward, sort = excluded.sort, is_secret = excluded.is_secret;

create or replace function private.sw_metrics(p_uid uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'stars.plots', (select count(*) from public.star_plots where owner_id = p_uid),
    'stars.discovered', (select count(*) from public.star_systems where discoverer_id = p_uid),
    'stars.keystones', (select count(*) from public.star_plots where owner_id = p_uid and keystone),
    'stars.whole', (select count(*) from public.star_systems s where s.claimed >= s.cells
                      and not exists (select 1 from public.star_plots sp where sp.star_id = s.star_id and sp.owner_id <> p_uid)
                      and exists (select 1 from public.star_plots sp where sp.star_id = s.star_id and sp.owner_id = p_uid)),
    'stars.painted_layers', (select count(*) from public.star_art where owner_id = p_uid),
    'stars.painted_stars', (select count(distinct s.star_id) from public.star_systems s join public.star_plots sp on sp.star_id = s.star_id and sp.owner_id = p_uid where s.painted),
    'stars.tier5', (select count(*) from public.star_plots sp join public.star_systems s on s.star_id = sp.star_id where sp.owner_id = p_uid and s.tier = 5),
    'stars.hyper', (select count(*) from public.star_plots sp join public.star_systems s on s.star_id = sp.star_id where sp.owner_id = p_uid and s.cls = 'hypergiant'))
$$;
create or replace function private.sw_badges(p_uid uuid) returns jsonb language plpgsql as $$
declare v_m jsonb; v_new jsonb := '[]'::jsonb; a record;
begin
  if p_uid is null then return v_new; end if;
  v_m := private.sw_metrics(p_uid);
  for a in select * from public.achievements x where x.is_active and x.category = 'stars'
             and not exists (select 1 from public.player_achievements pa where pa.player_id = p_uid and pa.achievement_key = x.key) order by x.sort loop
    if coalesce((v_m ->> a.metric)::numeric, 0) >= a.threshold then
      insert into public.player_achievements (player_id, achievement_key) values (p_uid, a.key) on conflict do nothing;
      if found then
        perform private.ench_give_luck(p_uid, coalesce((a.reward ->> 'luck')::int, 0), coalesce((a.reward ->> 'enchanted_luck')::int, 0));
        v_new := v_new || jsonb_build_array(jsonb_build_object('key', a.key, 'name', a.name, 'description', a.description, 'icon', a.icon, 'reward', a.reward,
                                                               'category', a.category, 'threshold', a.threshold, 'secret', a.is_secret));
      end if;
    end if;
  end loop;
  return v_new;
end $$;

-- ---- who may call what ------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.star_card(bigint)', 'public.stars_seen(bigint[])', 'public.stars_seen_real()', 'public.star_plots_of(bigint, int[])',
    'public.star_where()', 'public.star_warp(bigint)', 'public.star_rush()', 'public.star_home()', 'public.star_claim(bigint, int, text, text)',
    'public.star_set_kind(bigint, int, text)', 'public.star_name_plot(bigint, int, text)', 'public.star_name(bigint, text)', 'public.my_stars()', 'public.stars_chart()',
    'public.star_art_save(bigint, text, int, int, text)', 'public.star_art_layer(bigint, uuid)', 'public.star_kinds()', 'public.star_reach()', 'public.admin_star_art_queue()', 'public.admin_star_art_review(bigint, uuid, boolean, text)', 'public.admin_stars()', 'public.admin_set_star_settings(jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  -- (a star's card and the sky's claimed stars can be looked at signed out, from a shared link)
  execute 'grant execute on function public.star_card(bigint) to anon';
  execute 'grant execute on function public.stars_seen(bigint[]) to anon';
  execute 'grant execute on function public.stars_seen_real() to anon';
  execute 'grant execute on function public.stars_chart() to anon';
  foreach f in array array['private.sw_mix(bigint)', 'private.sw_hash(bigint[])', 'private.sw_h01(bigint[])', 'private.sw_tier_n(int)', 'private.sw_tier_mean(int)',
    'private.sw_tile_count(int, int, int, int)', 'private.sw_decode(bigint)', 'private.sw_class(int, int, int, int, int)', 'private.sw_star(bigint)', 'private.sw_base36(bigint)',
    'private.stars_cfg()', 'private.stars_n(text, numeric)', 'private.sw_earth_price(uuid)', 'private.sw_price(uuid, int, boolean)', 'private.sw_roll(bigint, int, boolean)',
    'private.sw_plot_rate(text, boolean)', 'private.sw_rent_rate(uuid)', 'private.sw_pilot(uuid)', 'private.sw_warp_cost(uuid, bigint)', 'private.sw_pilot_json(public.star_pilots)',
    'private.sw_kinds()', 'private.sw_keystone_kind(text)', 'private.sw_kind_info()', 'private.sw_event(bigint, uuid, text, jsonb)', 'private.sw_art_changed(bigint)', 'private.sw_metrics(uuid)', 'private.sw_badges(uuid)', 'private.sw_reach(uuid)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
end $$;
