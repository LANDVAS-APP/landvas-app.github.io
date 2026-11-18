-- ✨ Skywright, part 2: the star-only plot types, and each kind of star's own rules (design/skywright.md).
--
-- Star-only plot types (any plot, the Art type stays; Keystone-only marked ⬟):
--   🔥 Fusion Forge   — gathers hydrogen and fuses it up the real ladder (H → He → C → O → Si → Fe); the star's size sets how
--                        far it can go (a red dwarf stops at helium, a supergiant reaches iron). Iron tempers into Crucible
--                        Starsteel. Elements light stars and sail between them.
--   🌱 Lumen Grove    — a plant that grows by the star's light (ember moss under red dwarfs … frost-lilies under blue
--                        giants); flares make it bloom at once; harvest for Ink and a page in your codex (every kind of light).
--   ☄️ Comet Ranch    — a comet passes now and then: catch it; it comes back every few hours on its own orbit, its tail
--                        longer each time, with ice (hydrogen) and Ink.
--   🎵 Starsong       — a loop of the star's own notes (big stars ring low, small ones high); anyone looking at the star
--                        hears it.
--   ⛵ Sail Yard      — solar sails carry elements to another player's star, taking as long as the distance (brighter
--                        stars launch faster).
--   🔭 Observatory    — surveys the sky round your star: exoplanets (yours to land on and claim), hidden black holes,
--                        stray comets; and it takes your telescope from Earth deeper (ultra deep, then the far galaxy).
--   🐣 Plasma Hatchery — lays an egg of light and plasma, the colours of its star.
--   🌀 Stargate ⬟     — others warp to your star for less fuel and you take a toll; link two of your gates and the warp
--                        between them is a space highway.
--   🔦 Starbeam Lens ⬟ — once a day, focus your star's light on a spot on Earth for an hour: claims under it roll a tier
--                        higher, and anyone there in first person sees the beam come down out of the sky.
-- Each kind of star's own rules: red dwarfs flare (groves bloom, forges run double), binary stars eclipse (witness one for
-- Luck), pulsars keep a beat (tap along, once a few times a day, for Ink), black holes bend time (once a day, push one of
-- your enchantments' clocks ahead), a star can go supernova (staff set it off: gold for everyone on it — Betelgeuse is
-- the one everyone's waiting for), and you can light a star with your elements (it shines brighter in everyone's sky).

update public.game_config set value = value || jsonb_build_object('kinds', jsonb_build_object(
  'forge', jsonb_build_object('h_per_hour', 6, 'cap_hours', 24, 'fuse_ratio', 4, 'temper_iron', 3),
  'grove', jsonb_build_object('grow_hours', 6, 'ink', 12),
  'ranch', jsonb_build_object('pass_every_h', 3, 'window_min', 25, 'max_comets', 6, 'ink', 3, 'h', 4),
  'sails', jsonb_build_object('ly_per_hour', 3000, 'min_minutes', 5, 'max_hours', 12, 'max_flying', 5, 'max_cargo', 1000),
  'observatory', jsonb_build_object('survey_hours', 20),
  'hatchery', jsonb_build_object('egg_hours', 24, 'hatch_hours', 6, 'max_waiting', 4),
  'gate', jsonb_build_object('toll_pct', 25, 'highway_pct', 25),
  'lens', jsonb_build_object('hours', 1, 'radius_plots', 60, 'cooldown_hours', 24)),
  'nature', jsonb_build_object(
  'flare', jsonb_build_object('every_h_min', 5, 'every_h_max', 9, 'minutes', 20),
  'eclipse', jsonb_build_object('every_h_min', 8, 'every_h_max', 16, 'minutes', 30, 'luck', 2),
  'pulse', jsonb_build_object('ink', 20, 'per_day', 3),
  'dilation', jsonb_build_object('hours_per_plot', 1, 'max_hours', 6),
  'supernova', jsonb_build_object('ink_per_plot', 50, 'gold_per_plot', 1),
  'light', jsonb_build_object('he', 20, 'c', 10, 'max', 5)))
 where key = 'stars' and not value ? 'kinds';

-- ---- tables -------------------------------------------------------------------------------------------------------------
/** your elements (fused in a Forge, gathered off comets, a supernova's gold) */
create table if not exists public.star_elements (
  player_id uuid not null references public.players (id) on delete cascade,
  element text not null check (element in ('h', 'he', 'c', 'o', 'si', 'fe', 'au')),
  amount bigint not null default 0 check (amount >= 0),
  primary key (player_id, element));
alter table public.star_elements enable row level security;
revoke all on public.star_elements from anon, authenticated;

/** the Lumen Grove codex: every kind of light's plant you've grown */
create table if not exists public.star_codex (
  player_id uuid not null references public.players (id) on delete cascade,
  species text not null,
  n int not null default 0,
  first_at timestamptz not null default now(),
  primary key (player_id, species));
alter table public.star_codex enable row level security;
revoke all on public.star_codex from anon, authenticated;

/** solar sails under way (cargo: {element: amount}) */
create table if not exists public.star_sails (
  id bigserial primary key,
  from_id uuid not null references public.players (id) on delete cascade,
  to_id uuid not null references public.players (id) on delete cascade,
  from_star bigint not null, to_star bigint not null,
  cargo jsonb not null,
  launched_at timestamptz not null default now(),
  arrive_at timestamptz not null,
  collected_at timestamptz);
create index if not exists star_sails_to on public.star_sails (to_id, collected_at);
create index if not exists star_sails_from on public.star_sails (from_id, launched_at desc);
alter table public.star_sails enable row level security;
revoke all on public.star_sails from anon, authenticated;

/** what Observatories have found: exoplanets, black holes, comets, star clusters */
create table if not exists public.star_finds (
  id bigserial primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  star_id bigint not null, cell int not null,
  kind text not null check (kind in ('exoplanet', 'black_hole', 'comet', 'cluster')),
  data jsonb not null default '{}'::jsonb,
  at timestamptz not null default now());
create index if not exists star_finds_player on public.star_finds (player_id, at desc);
alter table public.star_finds enable row level security;
revoke all on public.star_finds from anon, authenticated;

/** exoplanets an Observatory found: worlds you can land on and claim, like your own home world */
create table if not exists public.star_exoplanets (
  player_id uuid not null references public.players (id) on delete cascade,
  seed int not null,
  star_id bigint not null,
  name text not null,
  found_at timestamptz not null default now(),
  primary key (player_id, seed));
alter table public.star_exoplanets enable row level security;
revoke all on public.star_exoplanets from anon, authenticated;

/** Starbeam Lens beams on Earth (grid cell and radius in plots) */
create table if not exists public.star_beams (
  id bigserial primary key,
  star_id bigint not null, cell int not null,
  owner_id uuid not null references public.players (id) on delete cascade,
  gx int not null, gy int not null, radius int not null,
  color text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null);
create index if not exists star_beams_live on public.star_beams (ends_at);
create index if not exists star_beams_owner on public.star_beams (owner_id);
alter table public.star_beams enable row level security;
revoke all on public.star_beams from anon, authenticated;

alter table public.star_systems add column if not exists lit int not null default 0;
alter table public.star_systems add column if not exists supernova_at timestamptz;

-- ---- small helpers ------------------------------------------------------------------------------------------------------
create or replace function private.sw_kn(p_kind text, p_key text, p_default numeric) returns numeric language sql stable as $$
  select coalesce((private.stars_cfg() -> 'kinds' -> p_kind ->> p_key)::numeric, p_default)
$$;
create or replace function private.sw_nn(p_what text, p_key text, p_default numeric) returns numeric language sql stable as $$
  select coalesce((private.stars_cfg() -> 'nature' -> p_what ->> p_key)::numeric, p_default)
$$;
/** a star's own hash (salted) */
create or replace function private.sw_sh(p_star bigint, p_salt int) returns float8 language sql immutable as $$
  select private.sw_h01(array[p_star / 4294967296, p_star % 4294967296, p_salt]::bigint[])
$$;
/** a repeating window (every p_every hours, p_minutes long, phase from the hash): {now, next_at, until} */
create or replace function private.sw_window(p_seed float8, p_every_h float8, p_minutes float8) returns jsonb language plpgsql stable as $$
declare e numeric := extract(epoch from now()) / 3600; every numeric := greatest(0.01, p_every_h)::numeric; ph numeric; len numeric := p_minutes::numeric / 60;
begin
  ph := mod(mod(e - p_seed::numeric * every, every) + every, every);
  return jsonb_build_object('now', ph < len,
    'until', case when ph < len then now() + make_interval(secs => ((len - ph) * 3600)::float8) else null end,
    'next_at', now() + make_interval(secs => ((every - ph) * 3600)::float8));
end $$;

create or replace function private.sw_el_add(p_uid uuid, p_el text, p_n bigint) returns bigint language plpgsql as $$
declare v bigint;
begin
  if p_n = 0 then return coalesce((select amount from public.star_elements where player_id = p_uid and element = p_el), 0); end if;
  if p_n < 0 and coalesce((select amount from public.star_elements where player_id = p_uid and element = p_el for update), 0) < -p_n then
    raise exception 'not_enough' using errcode = 'P0001', detail = p_el;
  end if;
  insert into public.star_elements (player_id, element, amount) values (p_uid, p_el, greatest(p_n, 0))
  on conflict (player_id, element) do update set amount = public.star_elements.amount + p_n
  returning amount into v;
  return v;
end $$;
create or replace function private.sw_els(p_uid uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('h', 0, 'he', 0, 'c', 0, 'o', 0, 'si', 0, 'fe', 0, 'au', 0)
         || coalesce((select jsonb_object_agg(element, amount) from public.star_elements where player_id = p_uid), '{}'::jsonb)
$$;
create or replace function private.sw_ladder() returns text[] language sql immutable as $$ select array['h', 'he', 'c', 'o', 'si', 'fe'] $$;
/** how far a star's Forge can fuse (its size) */
create or replace function private.sw_forge_top(p_cls text) returns text language sql immutable as $$
  select case p_cls when 'red_dwarf' then 'he' when 'white_dwarf' then 'c' when 'orange' then 'c' when 'yellow' then 'c' when 'white' then 'o'
    when 'red_giant' then 'o' when 'blue' then 'si' when 'supergiant' then 'fe' when 'hypergiant' then 'fe' when 'neutron' then 'fe' when 'black_hole' then 'fe' else 'he' end
$$;
/** the plant a star's light grows */
create or replace function private.sw_species(p_cls text) returns text language sql immutable as $$
  select case p_cls when 'red_dwarf' then 'ember_moss' when 'red_giant' then 'ember_moss' when 'orange' then 'amber_fern' when 'yellow' then 'sunglass_vine'
    when 'white' then 'pearl_bloom' when 'white_dwarf' then 'pearl_bloom' when 'blue' then 'frost_lily' when 'supergiant' then 'frost_lily' when 'hypergiant' then 'frost_lily'
    when 'neutron' then 'pulse_orchid' when 'black_hole' then 'void_lotus' else 'sunglass_vine' end
$$;
-- a star knows if it's a binary (the same rule as the game's code: src/stars/galaxy.ts genStar)
create or replace function private.sw_binary(p_id bigint, p_cls text) returns boolean language plpgsql stable as $$
declare d record;
begin
  if p_cls in ('black_hole', 'neutron') then return false; end if;
  select * into d from private.sw_decode(p_id);
  if d.tier = 0 then return false; end if;
  return private.sw_h01(array[d.tier * 8 + d.face, d.i, d.j, d.k, 6]::bigint[]) < 0.08;
end $$;

/** what a star's own kind is doing now: its flares, its eclipses, its beat, its pull on time, a supernova */
create or replace function private.sw_nature(p_id bigint, p_cls text) returns jsonb language plpgsql stable as $$
declare n jsonb := '{}'::jsonb; lo numeric; hi numeric; sn timestamptz;
begin
  if p_cls = 'red_dwarf' then
    lo := private.sw_nn('flare', 'every_h_min', 5); hi := private.sw_nn('flare', 'every_h_max', 9);
    n := n || jsonb_build_object('flare', private.sw_window(private.sw_sh(p_id, 22), lo + (hi - lo) * private.sw_sh(p_id, 21), private.sw_nn('flare', 'minutes', 20)));
  end if;
  if private.sw_binary(p_id, p_cls) then
    lo := private.sw_nn('eclipse', 'every_h_min', 8); hi := private.sw_nn('eclipse', 'every_h_max', 16);
    n := n || jsonb_build_object('eclipse', private.sw_window(private.sw_sh(p_id, 24), lo + (hi - lo) * private.sw_sh(p_id, 23), private.sw_nn('eclipse', 'minutes', 30)));
  end if;
  if p_cls = 'neutron' then n := n || jsonb_build_object('pulse', jsonb_build_object('period_ms', 250 + floor(private.sw_sh(p_id, 25) * 650)::int)); end if;
  if p_cls = 'black_hole' then n := n || jsonb_build_object('dilation', jsonb_build_object('hours_per_plot', private.sw_nn('dilation', 'hours_per_plot', 1), 'max_hours', private.sw_nn('dilation', 'max_hours', 6))); end if;
  select supernova_at into sn from public.star_systems where star_id = p_id;
  if sn is not null then n := n || jsonb_build_object('supernova', jsonb_build_object('at', sn, 'glowing', sn > now() - interval '14 days')); end if;
  return n;
end $$;

-- ---- the plot types ---------------------------------------------------------------------------------------------------
create or replace function private.sw_kinds() returns text[] language sql immutable as $$
  select array['base', 'art', 'forge', 'grove', 'ranch', 'song', 'sails', 'observatory', 'hatchery', 'gate', 'lens']
$$;
create or replace function private.sw_kind_info() returns jsonb language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('id', 'base', 'name', 'Base', 'emoji', '⬡', 'blurb', 'A plain panel of the shell: it pays its rent and that''s all.', 'keystone', false),
    jsonb_build_object('id', 'art', 'name', 'Art', 'emoji', '🎨', 'blurb', 'A panel you paint — paint the whole star and it shows in everyone''s telescope.', 'keystone', false),
    jsonb_build_object('id', 'forge', 'name', 'Fusion Forge', 'emoji', '🔥', 'blurb', 'Gathers hydrogen and fuses it up the ladder — helium, carbon, oxygen, silicon, iron — as far as this star''s size allows. Iron tempers into Crucible Starsteel.', 'keystone', false),
    jsonb_build_object('id', 'grove', 'name', 'Lumen Grove', 'emoji', '🌱', 'blurb', 'Grows a plant of this star''s light (ember moss, sunglass vines, frost-lilies…). Harvest for Ink and a page in your codex; flares make it bloom at once.', 'keystone', false),
    jsonb_build_object('id', 'ranch', 'name', 'Comet Ranch', 'emoji', '☄️', 'blurb', 'Catch the comets that pass. Each comes back on its own orbit, tail longer every time, with ice and Ink.', 'keystone', false),
    jsonb_build_object('id', 'song', 'name', 'Starsong', 'emoji', '🎵', 'blurb', 'Write a loop from this star''s own notes — big stars ring low, small ones high. Anyone looking at the star hears it.', 'keystone', false),
    jsonb_build_object('id', 'sails', 'name', 'Sail Yard', 'emoji', '⛵', 'blurb', 'Solar sails carry your elements to another player''s star — as long as the distance takes. Brighter stars launch faster.', 'keystone', false),
    jsonb_build_object('id', 'observatory', 'name', 'Observatory', 'emoji', '🔭', 'blurb', 'Surveys the sky round this star: exoplanets to land on and claim, hidden black holes, stray comets. Takes your telescope deeper from Earth.', 'keystone', false),
    jsonb_build_object('id', 'hatchery', 'name', 'Plasma Hatchery', 'emoji', '🐣', 'blurb', 'Lays an egg of light and plasma in this star''s colours: an Inkborn born of a star.', 'keystone', false),
    jsonb_build_object('id', 'gate', 'name', 'Stargate', 'emoji', '🌀', 'blurb', 'Others warp to this star for less fuel and you take a toll. Link two of your gates for a space highway.', 'keystone', true),
    jsonb_build_object('id', 'lens', 'name', 'Starbeam Lens', 'emoji', '🔦', 'blurb', 'Once a day, focus this star''s light on a spot on Earth for an hour: claims under it roll a tier higher.', 'keystone', true))
$$;

/** a plot's own page: its type's state, what it can do now */
create or replace function private.sw_view(sp public.star_plots, p_uid uuid) returns jsonb language plpgsql stable as $$
declare s jsonb := sp.state; star jsonb := private.sw_star(sp.star_id); cls text := star ->> 'cls'; v jsonb := '{}'::jsonb; mine boolean := sp.owner_id = p_uid;
  nat jsonb := private.sw_nature(sp.star_id, star ->> 'cls'); h numeric; rate numeric; cap numeric; w jsonb; comets jsonb; at timestamptz; grow numeric;
begin
  case sp.kind
  when 'forge' then
    rate := private.sw_kn('forge', 'h_per_hour', 6) * (1 + 0.5 * (sp.level - 1));
    cap := rate * private.sw_kn('forge', 'cap_hours', 24);
    at := coalesce((s ->> 'at')::timestamptz, sp.claimed_at);
    h := least(cap, floor(extract(epoch from now() - at) / 3600 * rate));
    v := jsonb_build_object('ready', h, 'rate', rate, 'cap', cap, 'top', private.sw_forge_top(cls), 'ladder', to_jsonb(private.sw_ladder()),
      'ratio', private.sw_kn('forge', 'fuse_ratio', 4), 'temper_iron', private.sw_kn('forge', 'temper_iron', 3), 'flare', coalesce((nat -> 'flare' ->> 'now')::boolean, false));
    if mine then v := v || jsonb_build_object('els', private.sw_els(p_uid),
      'crucible', exists (select 1 from public.enchantments where owner_id = p_uid and kind = 'crucible' and status = 'active')); end if;
  when 'grove' then
    grow := private.sw_kn('grove', 'grow_hours', 6) / (1 + 0.15 * (sp.level - 1));
    at := (s ->> 'planted_at')::timestamptz;
    v := jsonb_build_object('species', private.sw_species(cls), 'planted_at', at, 'grow_hours', grow,
      'ripe_at', case when at is null then null else at + make_interval(secs => (grow * 3600)::float8) end,
      'ready', at is not null and (now() >= at + make_interval(secs => (grow * 3600)::float8) or coalesce((nat -> 'flare' ->> 'now')::boolean, false)),
      'flare', nat -> 'flare');
    if mine then v := v || jsonb_build_object('codex', coalesce((select jsonb_object_agg(species, n) from public.star_codex where player_id = p_uid), '{}'::jsonb)); end if;
  when 'ranch' then
    w := private.sw_window(private.sw_sh(sp.star_id, 1000 + sp.cell), private.sw_kn('ranch', 'pass_every_h', 3), private.sw_kn('ranch', 'window_min', 25));
    select coalesce(jsonb_agg(c || jsonb_build_object('back_at', (c ->> 'last')::timestamptz + make_interval(hours => (c ->> 'period_h')::int))), '[]'::jsonb) into comets
      from jsonb_array_elements(coalesce(s -> 'comets', '[]'::jsonb)) c;
    v := jsonb_build_object('pass', w, 'comets', comets, 'max', private.sw_kn('ranch', 'max_comets', 6),
      'caught_this_pass', coalesce((s ->> 'pass_at')::timestamptz, 'epoch') > now() - make_interval(mins => private.sw_kn('ranch', 'window_min', 25)::int));
  when 'song' then
    v := jsonb_build_object('loop', coalesce(s ->> 'loop', ''), 'tempo', coalesce((s ->> 'tempo')::int, 110), 'm', (star ->> 'm')::int);
  when 'sails' then
    v := jsonb_build_object('flying', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'to', p.username, 'to_star', x.to_star, 'cargo', x.cargo, 'arrive_at', x.arrive_at) order by x.arrive_at), '[]'::jsonb)
                                         from public.star_sails x left join public.profiles p on p.id = x.to_id where x.from_id = sp.owner_id and x.arrive_at > now()),
      'speed', private.sw_kn('sails', 'ly_per_hour', 3000) * case cls when 'hypergiant' then 3 when 'supergiant' then 2.5 when 'blue' then 2 when 'white' then 1.4 when 'red_dwarf' then 0.7 when 'black_hole' then 0.5 else 1 end,
      'max_cargo', private.sw_kn('sails', 'max_cargo', 1000));
    if mine then v := v || jsonb_build_object('els', private.sw_els(p_uid)); end if;
  when 'observatory' then
    at := (s ->> 'last')::timestamptz;
    v := jsonb_build_object('next_at', case when at is null then now() else at + make_interval(hours => private.sw_kn('observatory', 'survey_hours', 20)::int) end,
      'reach', private.sw_reach(sp.owner_id), 'surveys', coalesce((s ->> 'surveys')::int, 0),
      'finds', (select coalesce(jsonb_agg(jsonb_build_object('kind', f.kind, 'data', f.data, 'at', f.at) order by f.at desc), '[]'::jsonb)
                  from (select * from public.star_finds where player_id = sp.owner_id and star_id = sp.star_id and cell = sp.cell order by at desc limit 8) f));
  when 'hatchery' then
    at := (s ->> 'last')::timestamptz;
    v := jsonb_build_object('next_at', case when at is null then now() else at + make_interval(hours => private.sw_kn('hatchery', 'egg_hours', 24)::int) end,
      'laid', coalesce((s ->> 'laid')::int, 0), 'color', star ->> 'color', 'glow', star ->> 'glow');
  when 'gate' then
    v := jsonb_build_object('link', s -> 'link', 'tolls', coalesce((s ->> 'tolls')::int, 0), 'toll_pct', private.sw_kn('gate', 'toll_pct', 25),
      'mine_elsewhere', case when mine then (select coalesce(jsonb_agg(jsonb_build_object('star', g.star_id, 'cell', g.cell, 'name', coalesce(ss.name, (private.sw_star(g.star_id)) ->> 'catalog_name'))), '[]'::jsonb)
                                              from public.star_plots g left join public.star_systems ss on ss.star_id = g.star_id
                                             where g.owner_id = p_uid and g.kind = 'gate' and g.star_id <> sp.star_id) else null end);
  when 'lens' then
    at := (s ->> 'last')::timestamptz;
    v := jsonb_build_object('next_at', case when at is null then now() else at + make_interval(hours => private.sw_kn('lens', 'cooldown_hours', 24)::int) end,
      'hours', private.sw_kn('lens', 'hours', 1), 'radius_plots', private.sw_kn('lens', 'radius_plots', 60),
      'beam', (select jsonb_build_object('gx', b.gx, 'gy', b.gy, 'radius', b.radius, 'ends_at', b.ends_at) from public.star_beams b
                where b.star_id = sp.star_id and b.cell = sp.cell and b.ends_at > now() order by b.ends_at desc limit 1));
  else v := '{}'::jsonb;
  end case;
  return v;
end $$;

create or replace function public.star_plot(p_id bigint, p_cell int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); sp public.star_plots%rowtype; star jsonb := private.sw_star(p_id);
begin
  select * into sp from public.star_plots where star_id = p_id and cell = p_cell;
  if not found then raise exception 'plot_unavailable' using errcode = 'P0001'; end if;
  return jsonb_build_object('star', sp.star_id, 'cell', sp.cell, 'kind', sp.kind, 'rarity', sp.rarity, 'shiny', sp.shiny, 'keystone', sp.keystone, 'name', sp.name,
    'level', sp.level, 'mine', sp.owner_id = v_uid, 'claimed_at', sp.claimed_at, 'usd_per_second', private.sw_plot_rate(sp.rarity, sp.shiny),
    'owner', (select jsonb_build_object('id', id, 'username', username, 'name', display_name, 'accent', accent_color) from public.profiles where id = sp.owner_id),
    'view', private.sw_view(sp, v_uid), 'nature', private.sw_nature(p_id, star ->> 'cls'), 'cls', star ->> 'cls', 'server_now', (extract(epoch from now()) * 1000)::bigint);
end $$;

/** a Starsong star's loops (anyone looking at it hears them) */
create or replace function public.star_songs(p_id bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('cell', sp.cell, 'loop', sp.state ->> 'loop', 'tempo', coalesce((sp.state ->> 'tempo')::int, 110), 'by', p.username) order by sp.claimed_at), '[]'::jsonb)
    from (select * from public.star_plots where star_id = p_id and kind = 'song' and coalesce(state ->> 'loop', '') <> '' order by claimed_at limit 12) sp
    left join public.profiles p on p.id = sp.owner_id
$$;

/** a plasma Inkborn's genome: a creature of light in its star's colours */
create or replace function private.sw_plasma_genome(p_cls text, p_seed float8) returns jsonb language plpgsql stable as $$
declare c record; bodies text[] := array['round', 'bean', 'tall', 'long', 'pear', 'blob']; moods text[] := array['playful', 'sleepy', 'curious', 'shy', 'foodie', 'brave'];
  r float8 := p_seed;
  nxt float8;
begin
  select * into c from private.sw_classes where id = p_cls;
  nxt := (r * 9301 + 0.4927) - floor(r * 9301 + 0.4927);
  return jsonb_build_object('body', bodies[1 + floor(r * 6)::int], 'color', coalesce(c.color, '#FFE7A0'), 'belly', '#FFFFFF', 'accent', coalesce(c.glow, '#FFD23F'),
    'pattern', 'stars', 'eyes', case when nxt < 0.5 then 'star' else 'big' end, 'ears', 'none', 'horns', case when nxt < 0.3 then 'unicorn' else 'none' end,
    'tail', 'flame', 'wings', 'tiny', 'legs', 0, 'eyecount', case when p_cls = 'neutron' then 1 else 2 end, 'gait', 'hover', 'cheeks', false,
    'size', round((0.85 + 0.35 * nxt)::numeric, 2), 'mood', moods[1 + floor(nxt * 6)::int], 'waura', 'plasma');
end $$;

/** do something with a star plot of yours (each type its own actions); and the star's own rules (any plot on it) */
create or replace function public.star_act(p_id bigint, p_cell int, p_action text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); sp public.star_plots%rowtype; star jsonb := private.sw_star(p_id); cls text; s jsonb;
  vw jsonb; r jsonb := '{}'::jsonb; n numeric; k int; el text; nxt text; idx int; top int; e public.enchantments%rowtype; nat jsonb; v_ink int;
  v_seed float8; v_name text; f text; c jsonb; comets jsonb; tot numeric; v_to uuid; v_star bigint; d numeric; secs numeric; ly1 numeric; ly2 numeric;
  egg public.inkborn_eggs%rowtype; v_gx int; v_gy int; sys public.star_systems%rowtype; v_day text := private.today()::text; hours numeric;
begin
  perform private.rate_limit('star_act', 900, 3600);
  if not coalesce((private.stars_cfg() ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  select * into sp from public.star_plots where star_id = p_id and cell = p_cell for update;
  if not found or sp.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  cls := star ->> 'cls';
  s := sp.state;
  vw := private.sw_view(sp, v_uid);
  nat := private.sw_nature(p_id, cls);
  p_args := coalesce(p_args, '{}'::jsonb);

  -- ---- the star's own rules: any plot of yours on it ----
  if p_action = 'witness' then
    if not coalesce((nat -> 'eclipse' ->> 'now')::boolean, false) then raise exception 'no_eclipse' using errcode = 'P0001'; end if;
    if exists (select 1 from public.star_events where star_id = p_id and player_id = v_uid and kind = 'eclipse' and at > now() - interval '2 hours') then raise exception 'seen_it' using errcode = 'P0001'; end if;
    perform private.ench_give_luck(v_uid, private.sw_nn('eclipse', 'luck', 2)::int, 0);
    perform private.sw_event(p_id, v_uid, 'eclipse', '{}'::jsonb);
    r := jsonb_build_object('luck', private.sw_nn('eclipse', 'luck', 2)::int);
  elsif p_action = 'pulse' then
    if cls <> 'neutron' then raise exception 'not_a_pulsar' using errcode = 'P0001'; end if;
    if (select count(*) from public.star_events where player_id = v_uid and kind = 'pulse' and at > private.day_start(now())) >= private.sw_nn('pulse', 'per_day', 3) then
      raise exception 'daily_limit' using errcode = 'P0001';
    end if;
    -- (the taps' spacing against the pulsar's beat: each gap scored by how close it is to a whole number of beats)
    declare per numeric := (nat -> 'pulse' ->> 'period_ms')::numeric; taps numeric[]; score numeric := 0; m int := 0; gap numeric; beats numeric; err numeric;
    begin
      select array_agg(x::numeric order by o) into taps from jsonb_array_elements_text(coalesce(p_args -> 'taps', '[]'::jsonb)) with ordinality t(x, o);
      if taps is null or cardinality(taps) < 8 or cardinality(taps) > 80 then raise exception 'invalid_taps' using errcode = 'P0001'; end if;
      for k in 2 .. cardinality(taps) loop
        gap := taps[k] - taps[k - 1];
        if gap <= 0 then continue; end if;
        beats := greatest(1, round(gap / per));
        err := abs(gap - beats * per) / per;
        score := score + greatest(0, 1 - err * 4); m := m + 1;
      end loop;
      score := case when m = 0 then 0 else score / m end;
      v_ink := round(score * private.sw_nn('pulse', 'ink', 20))::int;
      if v_ink > 0 then v_ink := private.grant_ink_paced(v_uid, v_ink, 'stars', 'star_pulse', p_id::text, 'pulse:' || v_uid || ':' || p_id || ':' || extract(epoch from now())::bigint); end if;
      perform private.sw_event(p_id, v_uid, 'pulse', jsonb_build_object('score', round(score, 3), 'ink', v_ink));
      r := jsonb_build_object('score', round(score, 3), 'ink', v_ink, 'period_ms', per);
    end;
  elsif p_action = 'dilate' then
    if cls <> 'black_hole' then raise exception 'not_a_black_hole' using errcode = 'P0001'; end if;
    if exists (select 1 from public.star_events where player_id = v_uid and kind = 'dilate' and at > private.day_start(now())) then raise exception 'daily_limit' using errcode = 'P0001'; end if;
    select * into e from public.enchantments where id = (p_args ->> 'enchantment')::uuid and owner_id = v_uid and status = 'active' for update;
    if not found then raise exception 'not_owner' using errcode = 'P0001', detail = 'enchantment'; end if;
    hours := least(private.sw_nn('dilation', 'max_hours', 6), private.sw_nn('dilation', 'hours_per_plot', 1) * (select count(*) from public.star_plots where star_id = p_id and owner_id = v_uid));
    update public.enchantments set clock_skip = clock_skip + hours * 3600, updated_at = now() where id = e.id;
    perform private.sw_event(p_id, v_uid, 'dilate', jsonb_build_object('enchantment', e.id, 'hours', hours));
    r := jsonb_build_object('hours', hours, 'enchantment', e.id);
  elsif p_action = 'light' then
    select * into sys from public.star_systems where star_id = p_id for update;
    if sys.lit >= private.sw_nn('light', 'max', 5) then raise exception 'fully_lit' using errcode = 'P0001'; end if;
    perform private.sw_el_add(v_uid, 'he', -(private.sw_nn('light', 'he', 20) * (sys.lit + 1))::bigint);
    perform private.sw_el_add(v_uid, 'c', -(private.sw_nn('light', 'c', 10) * (sys.lit + 1))::bigint);
    update public.star_systems set lit = lit + 1, art_rev = art_rev + 1, updated_at = now() where star_id = p_id returning * into sys;
    perform private.sw_event(p_id, v_uid, 'lit', jsonb_build_object('lit', sys.lit));
    insert into public.feed_events (kind, player_id, data) values ('star', v_uid, jsonb_build_object('sub', 'lit', 'star', p_id, 'name', coalesce(sys.name, star ->> 'catalog_name'), 'lit', sys.lit));
    r := jsonb_build_object('lit', sys.lit);

  -- ---- each plot type's own actions ----
  elsif sp.kind = 'forge' then
    if p_action = 'collect' then
      n := (vw ->> 'ready')::numeric * case when coalesce((nat -> 'flare' ->> 'now')::boolean, false) then 2 else 1 end;
      if n <= 0 then raise exception 'nothing_ready' using errcode = 'P0001'; end if;
      perform private.sw_el_add(v_uid, 'h', n::bigint);
      s := s || jsonb_build_object('at', now());
      r := jsonb_build_object('h', n);
    elsif p_action = 'fuse' then
      el := p_args ->> 'from';
      idx := array_position(private.sw_ladder(), el);
      top := array_position(private.sw_ladder(), private.sw_forge_top(cls));
      if idx is null then raise exception 'invalid_element' using errcode = 'P0001'; end if;
      if idx >= top then raise exception 'too_heavy' using errcode = 'P0001'; end if;
      k := greatest(1, least(500, coalesce((p_args ->> 'times')::int, 1)));
      nxt := (private.sw_ladder())[idx + 1];
      perform private.sw_el_add(v_uid, el, -(k * private.sw_kn('forge', 'fuse_ratio', 4))::bigint);
      perform private.sw_el_add(v_uid, nxt, k);
      perform private.sw_event(p_id, v_uid, 'fused', jsonb_build_object('from', el, 'to', nxt, 'n', k));
      r := jsonb_build_object('made', nxt, 'n', k);
    elsif p_action = 'temper' then
      select * into e from public.enchantments where owner_id = v_uid and kind = 'crucible' and status = 'active' order by level desc, born_at limit 1 for update;
      if not found then raise exception 'no_crucible' using errcode = 'P0001'; end if;
      perform private.sw_el_add(v_uid, 'fe', -private.sw_kn('forge', 'temper_iron', 3)::bigint);
      update public.enchantments set state = state || jsonb_build_object('metal', coalesce(state -> 'metal', '{}'::jsonb)
             || jsonb_build_object('starsteel', coalesce((state -> 'metal' ->> 'starsteel')::numeric, 0) + 1)), updated_at = now()
       where id = e.id;
      perform private.sw_event(p_id, v_uid, 'tempered', jsonb_build_object('crucible', e.id));
      r := jsonb_build_object('starsteel', 1, 'crucible', e.id);
    else raise exception 'invalid_action' using errcode = 'P0001'; end if;

  elsif sp.kind = 'grove' then
    if p_action = 'plant' then
      if s ? 'planted_at' and s ->> 'planted_at' is not null then raise exception 'already_planted' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('planted_at', now(), 'species', private.sw_species(cls));
      r := jsonb_build_object('species', private.sw_species(cls));
    elsif p_action = 'harvest' then
      if not coalesce((vw ->> 'ready')::boolean, false) then raise exception 'not_ready' using errcode = 'P0001'; end if;
      f := private.sw_species(cls);
      insert into public.star_codex (player_id, species, n) values (v_uid, f, 1) on conflict (player_id, species) do update set n = public.star_codex.n + 1;
      v_ink := (private.sw_kn('grove', 'ink', 12) * (1 + 0.25 * (sp.level - 1)))::int;
      v_ink := private.grant_ink_paced(v_uid, v_ink, 'stars', 'star_grove', p_id || ':' || p_cell, 'grove:' || p_id || ':' || p_cell || ':' || coalesce(s ->> 'planted_at', ''));
      s := (s - 'planted_at') || jsonb_build_object('harvests', coalesce((s ->> 'harvests')::int, 0) + 1);
      r := jsonb_build_object('species', f, 'ink', v_ink, 'codex', (select count(*) from public.star_codex where player_id = v_uid));
    else raise exception 'invalid_action' using errcode = 'P0001'; end if;

  elsif sp.kind = 'ranch' then
    if p_action = 'catch' then
      if not coalesce((vw -> 'pass' ->> 'now')::boolean, false) then raise exception 'no_comet' using errcode = 'P0001'; end if;
      if coalesce((vw ->> 'caught_this_pass')::boolean, false) then raise exception 'caught_already' using errcode = 'P0001'; end if;
      if jsonb_array_length(coalesce(s -> 'comets', '[]'::jsonb)) >= private.sw_kn('ranch', 'max_comets', 6) then raise exception 'ranch_full' using errcode = 'P0001'; end if;
      v_seed := private.sw_sh(p_id, 2000 + p_cell * 31 + jsonb_array_length(coalesce(s -> 'comets', '[]'::jsonb)));
      c := jsonb_build_object('id', jsonb_array_length(coalesce(s -> 'comets', '[]'::jsonb)) + 1,
        'name', 'C/' || to_char(now(), 'YYYY') || ' ' || chr(65 + floor(v_seed * 26)::int) || (1 + floor((v_seed * 977 - floor(v_seed * 977)) * 9))::int,
        'period_h', 2 + floor((v_seed * 131 - floor(v_seed * 131)) * 7)::int, 'caught_at', now(), 'last', now(), 'returns', 0);
      s := s || jsonb_build_object('comets', coalesce(s -> 'comets', '[]'::jsonb) || jsonb_build_array(c), 'pass_at', now());
      r := jsonb_build_object('comet', c);
    elsif p_action = 'harvest' then
      tot := 0; comets := '[]'::jsonb;
      for c in select * from jsonb_array_elements(coalesce(s -> 'comets', '[]'::jsonb)) loop
        k := least(3, floor(extract(epoch from now() - (c ->> 'last')::timestamptz) / 3600 / (c ->> 'period_h')::numeric)::int);
        if k > 0 then
          tot := tot + k * (1 + (c ->> 'returns')::numeric / 5);
          c := c || jsonb_build_object('last', now(), 'returns', (c ->> 'returns')::int + k);
        end if;
        comets := comets || jsonb_build_array(c);
      end loop;
      if tot <= 0 then raise exception 'nothing_ready' using errcode = 'P0001'; end if;
      perform private.sw_el_add(v_uid, 'h', ceil(tot * private.sw_kn('ranch', 'h', 4))::bigint);
      v_ink := private.grant_ink_paced(v_uid, ceil(tot * private.sw_kn('ranch', 'ink', 3))::int, 'stars', 'star_ranch', p_id || ':' || p_cell, 'ranch:' || p_id || ':' || p_cell || ':' || extract(epoch from now())::bigint);
      s := s || jsonb_build_object('comets', comets);
      r := jsonb_build_object('ice', round(tot, 2), 'h', ceil(tot * private.sw_kn('ranch', 'h', 4)), 'ink', v_ink);
    else raise exception 'invalid_action' using errcode = 'P0001'; end if;

  elsif sp.kind = 'song' then
    if p_action <> 'compose' then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    f := coalesce(p_args ->> 'loop', '');
    if f !~ '^[0-7.]{4,32}$' then raise exception 'invalid_loop' using errcode = 'P0001'; end if;
    k := greatest(60, least(180, coalesce((p_args ->> 'tempo')::int, 110)));
    s := s || jsonb_build_object('loop', f, 'tempo', k);
    r := jsonb_build_object('loop', f, 'tempo', k);

  elsif sp.kind = 'sails' then
    if p_action <> 'launch' then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    select id into v_to from public.profiles where lower(username) = lower(p_args ->> 'to');
    if v_to is null then raise exception 'no_such_player' using errcode = 'P0001'; end if;
    if v_to = v_uid then raise exception 'not_yourself' using errcode = 'P0001'; end if;
    if not private.visible_to(v_to, v_uid) or not private.visible_to(v_uid, v_to) then raise exception 'no_such_player' using errcode = 'P0001'; end if;
    -- (their Sail Yard, or else their first star)
    select star_id into v_star from public.star_plots where owner_id = v_to order by (kind = 'sails') desc, claimed_at limit 1;
    if v_star is null then raise exception 'no_star' using errcode = 'P0001'; end if;
    if (select count(*) from public.star_sails where from_id = v_uid and arrive_at > now()) >= private.sw_kn('sails', 'max_flying', 5) then raise exception 'too_many_sails' using errcode = 'P0001'; end if;
    el := p_args ->> 'element';
    n := greatest(1, least(private.sw_kn('sails', 'max_cargo', 1000), coalesce((p_args ->> 'amount')::numeric, 0)));
    if el is null or not el = any (private.sw_ladder() || array['au']) then raise exception 'invalid_element' using errcode = 'P0001'; end if;
    perform private.sw_el_add(v_uid, el, -n::bigint);
    ly1 := (star ->> 'ly')::numeric; ly2 := ((private.sw_star(v_star)) ->> 'ly')::numeric;
    d := case when v_star = p_id then 1 else sqrt(ly1 * ly1 + ly2 * ly2) * 0.7 end;
    secs := greatest(private.sw_kn('sails', 'min_minutes', 5) * 60, least(private.sw_kn('sails', 'max_hours', 12) * 3600, d / (vw ->> 'speed')::numeric * 3600));
    insert into public.star_sails (from_id, to_id, from_star, to_star, cargo, arrive_at) values (v_uid, v_to, p_id, v_star, jsonb_build_object(el, n), now() + make_interval(secs => secs::float8))
      returning jsonb_build_object('id', id, 'arrive_at', arrive_at, 'to_star', to_star) into r;
    perform private.notify(v_to, 'star', v_uid, jsonb_build_object('sub', 'sail', 'star', v_star, 'name', coalesce((select name from public.star_systems where star_id = v_star), (private.sw_star(v_star)) ->> 'catalog_name'),
      'arrive_at', r ->> 'arrive_at', 'cargo', jsonb_build_object(el, n)));

  elsif sp.kind = 'observatory' then
    if p_action <> 'survey' then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    if now() < (vw ->> 'next_at')::timestamptz then raise exception 'too_soon' using errcode = 'P0001'; end if;
    k := coalesce((s ->> 'surveys')::int, 0) + 1;
    v_seed := private.sw_h01(array[p_id / 4294967296, p_id % 4294967296, p_cell, k, 41]::bigint[]);
    if v_seed < 0.45 then
      -- an exoplanet: a world of your own to land on and claim (it's in your rocket's warps)
      declare v_world int := 1 + floor(private.sw_h01(array[p_id / 4294967296, p_id % 4294967296, p_cell, k, 42]::bigint[]) * 2147483000)::int; nth int;
      begin
        nth := 1 + (select count(*) from public.star_exoplanets where star_id = p_id);
        v_name := coalesce((select name from public.star_systems where star_id = p_id), star ->> 'catalog_name') || ' ' || chr(97 + least(24, nth));
        insert into public.star_exoplanets (player_id, seed, star_id, name) values (v_uid, v_world, p_id, v_name) on conflict do nothing;
        perform private.space_pilot(v_uid);
        update public.space_pilots set visited = case when ('exo:' || v_world) = any (visited) then visited else visited || ('exo:' || v_world) end, updated_at = now() where player_id = v_uid;
        insert into public.star_finds (player_id, star_id, cell, kind, data) values (v_uid, p_id, p_cell, 'exoplanet', jsonb_build_object('world', 'exo:' || v_world, 'seed', v_world, 'name', v_name))
          returning jsonb_build_object('kind', kind, 'data', data) into r;
      end;
    elsif v_seed < 0.70 then
      -- a stray comet: to your Comet Ranch if you have one with room, else its ice
      select * into sp from public.star_plots where owner_id = v_uid and kind = 'ranch' and jsonb_array_length(coalesce(state -> 'comets', '[]'::jsonb)) < private.sw_kn('ranch', 'max_comets', 6)
        order by claimed_at limit 1 for update;
      if found then
        c := jsonb_build_object('id', jsonb_array_length(coalesce(sp.state -> 'comets', '[]'::jsonb)) + 1, 'name', 'C/' || to_char(now(), 'YYYY') || ' S' || k,
          'period_h', 3 + (k % 5), 'caught_at', now(), 'last', now(), 'returns', 0);
        update public.star_plots set state = state || jsonb_build_object('comets', coalesce(state -> 'comets', '[]'::jsonb) || jsonb_build_array(c)) where star_id = sp.star_id and cell = sp.cell;
        insert into public.star_finds (player_id, star_id, cell, kind, data) values (v_uid, p_id, p_cell, 'comet', jsonb_build_object('name', c ->> 'name', 'ranch', jsonb_build_object('star', sp.star_id, 'cell', sp.cell)))
          returning jsonb_build_object('kind', kind, 'data', data) into r;
      else
        perform private.sw_el_add(v_uid, 'h', 20);
        insert into public.star_finds (player_id, star_id, cell, kind, data) values (v_uid, p_id, p_cell, 'comet', jsonb_build_object('h', 20))
          returning jsonb_build_object('kind', kind, 'data', data) into r;
      end if;
      select * into sp from public.star_plots where star_id = p_id and cell = p_cell for update;
    else
      -- a hidden black hole somewhere in the sky (searched for: the telescope's tiers this player can see), or a cluster's light
      declare t int; fc int; ii int; jj int; kk int; cand bigint; tries int := 0; found_id bigint;
      begin
        while tries < 2500 and found_id is null loop
          tries := tries + 1;
          t := 2 + floor(random() * greatest(1, least(4, private.sw_reach(v_uid)) - 1))::int;
          fc := floor(random() * 6)::int; ii := floor(random() * private.sw_tier_n(t))::int; jj := floor(random() * private.sw_tier_n(t))::int;
          for kk in 0 .. private.sw_tile_count(t, fc, ii, jj) - 1 loop
            if private.sw_class(t, fc, ii, jj, kk) = 'black_hole' then found_id := ((t * 8 + fc)::bigint * 131072 + ii) * 131072 * 16 + jj * 16 + kk; exit; end if;
          end loop;
        end loop;
        if found_id is not null and v_seed < 0.88 then
          insert into public.star_finds (player_id, star_id, cell, kind, data) values (v_uid, p_id, p_cell, 'black_hole', jsonb_build_object('star', found_id, 'code', (private.sw_star(found_id)) ->> 'code'))
            returning jsonb_build_object('kind', kind, 'data', data) into r;
        else
          perform private.sw_el_add(v_uid, 'h', 30);
          insert into public.star_finds (player_id, star_id, cell, kind, data) values (v_uid, p_id, p_cell, 'cluster', jsonb_build_object('h', 30))
            returning jsonb_build_object('kind', kind, 'data', data) into r;
        end if;
      end;
    end if;
    s := s || jsonb_build_object('last', now(), 'surveys', k);

  elsif sp.kind = 'hatchery' then
    if p_action <> 'collect' then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    if now() < (vw ->> 'next_at')::timestamptz then raise exception 'too_soon' using errcode = 'P0001'; end if;
    if (select count(*) from public.inkborn_eggs where owner_id = v_uid and hatched_inkborn is null) >= private.sw_kn('hatchery', 'max_waiting', 4) then raise exception 'too_many_eggs' using errcode = 'P0001'; end if;
    v_seed := private.sw_h01(array[p_id / 4294967296, p_id % 4294967296, p_cell, coalesce((s ->> 'laid')::int, 0), 51]::bigint[]);
    insert into public.inkborn_eggs (owner_id, kind, shell, genome, parents, mutated, hatch_at)
    values (v_uid, 'cosmic', jsonb_build_object('a', star ->> 'color', 'b', star ->> 'glow', 'c', '#FFFFFF'), private.sw_plasma_genome(cls, v_seed),
            jsonb_build_array(jsonb_build_object('name', coalesce((select name from public.star_systems where star_id = p_id), star ->> 'catalog_name'), 'owner', null, 'genome', jsonb_build_object('color', star ->> 'color', 'accent', star ->> 'glow'))),
            v_seed < 0.1, now() + make_interval(hours => private.sw_kn('hatchery', 'hatch_hours', 6)::int))
    returning * into egg;
    s := s || jsonb_build_object('last', now(), 'laid', coalesce((s ->> 'laid')::int, 0) + 1);
    r := jsonb_build_object('egg', private.egg_json(egg));

  elsif sp.kind = 'gate' then
    if p_action = 'link' then
      v_star := (p_args ->> 'star')::bigint; k := (p_args ->> 'cell')::int;
      if v_star = p_id then raise exception 'invalid_link' using errcode = 'P0001'; end if;
      if not exists (select 1 from public.star_plots where star_id = v_star and cell = k and owner_id = v_uid and kind = 'gate') then raise exception 'not_owner' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('link', jsonb_build_object('star', v_star, 'cell', k));
      update public.star_plots set state = state || jsonb_build_object('link', jsonb_build_object('star', p_id, 'cell', p_cell)) where star_id = v_star and cell = k;
      r := jsonb_build_object('link', jsonb_build_object('star', v_star, 'cell', k));
    elsif p_action = 'unlink' then
      if s ? 'link' then
        update public.star_plots set state = state - 'link' where star_id = (s -> 'link' ->> 'star')::bigint and cell = (s -> 'link' ->> 'cell')::int and owner_id = v_uid;
      end if;
      s := s - 'link';
    else raise exception 'invalid_action' using errcode = 'P0001'; end if;

  elsif sp.kind = 'lens' then
    if p_action <> 'focus' then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    if now() < (vw ->> 'next_at')::timestamptz then raise exception 'too_soon' using errcode = 'P0001'; end if;
    v_gx := (p_args ->> 'gx')::int; v_gy := (p_args ->> 'gy')::int;
    if v_gx is null or v_gy is null or v_gx < 0 or v_gx >= 4194304 or v_gy < 0 or v_gy >= 4194304 then raise exception 'invalid_plot' using errcode = 'P0001'; end if;
    insert into public.star_beams (star_id, cell, owner_id, gx, gy, radius, color, ends_at)
    values (p_id, p_cell, v_uid, v_gx, v_gy, private.sw_kn('lens', 'radius_plots', 60)::int, coalesce((select color from public.star_systems where star_id = p_id), star ->> 'glow'),
            now() + make_interval(secs => (private.sw_kn('lens', 'hours', 1) * 3600)::float8))
    returning jsonb_build_object('gx', gx, 'gy', gy, 'radius', radius, 'ends_at', ends_at) into r;
    s := s || jsonb_build_object('last', now(), 'beams', coalesce((s ->> 'beams')::int, 0) + 1);
    perform private.sw_event(p_id, v_uid, 'beam', r);
  else
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;

  update public.star_plots set state = s where star_id = p_id and cell = p_cell;
  select * into sp from public.star_plots where star_id = p_id and cell = p_cell;
  return jsonb_build_object('result', r, 'view', private.sw_view(sp, v_uid), 'nature', private.sw_nature(p_id, cls), 'els', private.sw_els(v_uid),
    'balances', private.balances(v_uid), 'achievements', private.sw_badges(v_uid));
end $$;

/** your elements, sails coming to you, your codex, your exoplanets and finds (the Star chart's "Yours" tab) */
create or replace function public.my_star_things() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return jsonb_build_object('els', private.sw_els(v_uid),
    'sails_in', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'from', p.username, 'cargo', x.cargo, 'arrive_at', x.arrive_at, 'arrived', x.arrive_at <= now(), 'to_star', x.to_star) order by x.arrive_at), '[]'::jsonb)
                   from public.star_sails x left join public.profiles p on p.id = x.from_id where x.to_id = v_uid and x.collected_at is null),
    'codex', coalesce((select jsonb_object_agg(species, n) from public.star_codex where player_id = v_uid), '{}'::jsonb),
    'exoplanets', (select coalesce(jsonb_agg(jsonb_build_object('world', 'exo:' || seed, 'name', name, 'star', star_id, 'at', found_at) order by found_at desc), '[]'::jsonb) from public.star_exoplanets where player_id = v_uid),
    'finds', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'data', data, 'star', star_id, 'at', at) order by at desc), '[]'::jsonb)
                from (select * from public.star_finds where player_id = v_uid and kind = 'black_hole' order by at desc limit 12) f));
end $$;
/** take in a sail that's arrived */
create or replace function public.star_sail_collect(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); x public.star_sails%rowtype; k text; v jsonb;
begin
  select * into x from public.star_sails where id = p_id and to_id = v_uid for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if x.collected_at is not null then return jsonb_build_object('els', private.sw_els(v_uid)); end if;
  if x.arrive_at > now() then raise exception 'not_arrived' using errcode = 'P0001'; end if;
  for k, v in select * from jsonb_each(x.cargo) loop perform private.sw_el_add(v_uid, k, (v #>> '{}')::bigint); end loop;
  update public.star_sails set collected_at = now() where id = p_id;
  return jsonb_build_object('cargo', x.cargo, 'els', private.sw_els(v_uid));
end $$;

/** Starbeam Lens beams near a spot on Earth (for first person: the beam out of the sky) */
create or replace function public.star_beams_near(p_gx int, p_gy int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'gx', b.gx, 'gy', b.gy, 'radius', b.radius, 'color', b.color, 'ends_at', b.ends_at, 'star', b.star_id,
    'name', coalesce(s.name, (private.sw_star(b.star_id)) ->> 'catalog_name'), 'by', p.username)), '[]'::jsonb)
    from public.star_beams b left join public.star_systems s on s.star_id = b.star_id left join public.profiles p on p.id = b.owner_id
   where b.ends_at > now() and b.starts_at <= now() and abs(b.gx - p_gx) < 6000 and abs(b.gy - p_gy) < 6000
$$;
/** is this Earth cell under a Starbeam right now */
create or replace function private.sw_in_beam(p_gx int, p_gy int) returns boolean language sql stable as $$
  select exists (select 1 from public.star_beams b where b.ends_at > now() and b.starts_at <= now()
                   and ((b.gx - p_gx)::numeric ^ 2 + (b.gy - p_gy)::numeric ^ 2) <= (b.radius::numeric ^ 2))
$$;
-- claims under a Starbeam roll a tier higher (the everyday ladder, as a beam of the ultras' does; Mythic stays Mythic)
select private.fn_patch('private.rx_claim_bump(uuid,integer,integer)',
  $a$  if b = 0 and private.rx_on_beam(p_uid, p_gx, p_gy) then b := 1; end if;$a$,
  $b$  if b = 0 and private.rx_on_beam(p_uid, p_gx, p_gy) then b := 1; end if;
  -- ✨ under a Starbeam Lens's beam
  if b = 0 and private.sw_in_beam(p_gx, p_gy) then b := 1; end if;$b$);

-- exoplanets an Observatory found are worlds you can land on and claim, like your own home world
create or replace function private.planet_open(p_uid uuid, p_world text) returns boolean
language sql stable as $$
  select case when p_world like 'exo:%' then exists (select 1 from public.space_pilots where player_id = p_uid and 'exo:' || home_seed = p_world)
                                          or exists (select 1 from public.star_exoplanets where player_id = p_uid and 'exo:' || seed = p_world)
    else (private.planet_cfg() -> 'worlds') ? p_world end
$$;

-- ---- the warp, with gates: a share off the fuel to a star with a Stargate (and a toll to its keepers); a highway
--      between two linked gates ---------------------------------------------------------------------------------------
create or replace function private.sw_warp_cost(p_uid uuid, p_star bigint) returns jsonb language plpgsql stable as $$
declare w jsonb := coalesce(private.stars_cfg() -> 'warp', '{}'::jsonb); s jsonb := private.sw_star(p_star); v_ly numeric; v_d numeric; v_ink numeric; v_secs numeric;
  v_gate boolean; v_from bigint; v_highway boolean := false;
begin
  if s is null then return null; end if;
  v_ly := (s ->> 'ly')::numeric;
  v_d := ln(1 + v_ly / 4) / ln(2);
  v_ink := least(coalesce((w ->> 'max_ink')::numeric, 400), coalesce((w ->> 'base_ink')::numeric, 30) + coalesce((w ->> 'per_doubling')::numeric, 12) * v_d);
  v_secs := least(coalesce((w ->> 'max_secs')::numeric, 90), coalesce((w ->> 'secs_base')::numeric, 14) + coalesce((w ->> 'secs_per_doubling')::numeric, 4) * v_d);
  v_gate := exists (select 1 from public.star_plots where star_id = p_star and kind = 'gate');
  if v_gate then v_ink := v_ink * (1 - coalesce((w ->> 'gate_pct')::numeric, 40) / 100); end if;
  select at_star into v_from from public.star_pilots where player_id = p_uid and dest_star is null;
  if v_from is not null and exists (select 1 from public.star_plots g where g.star_id = v_from and g.kind = 'gate' and (g.state -> 'link' ->> 'star')::bigint = p_star) then
    v_highway := true;
    v_ink := v_ink * private.sw_kn('gate', 'highway_pct', 25) / 100;
    v_secs := 3;
  end if;
  return jsonb_build_object('ly', v_ly, 'ink', round(v_ink)::int, 'secs', round(v_secs)::int, 'gate', v_gate, 'highway', v_highway);
end $$;
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.star_warp(bigint)'::regprocedure);
  if d like '%star_toll%' then return; end if;
  -- (deeper stars than your reach: also fine if an Observatory of yours found it)
  n := replace(d, $a$and not exists (select 1 from public.star_systems where star_id = p_id) then$a$,
                  $a$and not exists (select 1 from public.star_systems where star_id = p_id)
     and not exists (select 1 from public.star_finds where player_id = v_uid and (data ->> 'star')::bigint = p_id) then$a$);
  if n = d then raise exception 'skywright: star_warp reach anchor not found'; end if;
  d := n;
  n := replace(d, $a$  update public.star_pilots set dest_star = p_id,$a$, $a$  -- (a Stargate there: its keepers share a toll of the fuel)
  if (c ->> 'gate')::boolean and (c ->> 'ink')::int > 0 then
    declare g record; v_n int; v_toll int;
    begin
      select count(distinct owner_id) into v_n from public.star_plots where star_id = p_id and kind = 'gate' and owner_id <> v_uid;
      if v_n > 0 then
        v_toll := floor((c ->> 'ink')::int * private.sw_kn('gate', 'toll_pct', 25) / 100 / v_n)::int;
        if v_toll > 0 then
          for g in select distinct owner_id from public.star_plots where star_id = p_id and kind = 'gate' and owner_id <> v_uid loop
            perform private.grant_ink_paced(g.owner_id, v_toll, 'stars', 'star_toll', p_id::text, 'toll:' || p_id || ':' || v_uid || ':' || s.warps || ':' || g.owner_id);
            update public.star_plots set state = state || jsonb_build_object('tolls', coalesce((state ->> 'tolls')::int, 0) + v_toll)
             where star_id = p_id and kind = 'gate' and owner_id = g.owner_id;
            perform private.sw_event(p_id, g.owner_id, 'toll', jsonb_build_object('ink', v_toll, 'by', v_uid));
          end loop;
        end if;
      end if;
    end;
  end if;
  update public.star_pilots set dest_star = p_id,$a$);
  if n = d then raise exception 'skywright: star_warp toll anchor not found'; end if;
  execute n;
end $$;

-- ---- the card and the sky learn the stars' nature, how lit they are, a supernova ----------------------------------------
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.star_card(bigint)'::regprocedure);
  if d like '%sw_nature%' then return; end if;
  n := replace(d, $a$'rent_mult', private.stars_n('rent_mult', 1.1),$a$,
                  $a$'nature', private.sw_nature(p_id, s ->> 'cls'), 'lit', coalesce(sys.lit, 0), 'binary', private.sw_binary(p_id, s ->> 'cls'),
    'rent_mult', private.stars_n('rent_mult', 1.1),$a$);
  if n = d then raise exception 'skywright: star_card anchor not found'; end if;
  execute n;
end $$;
create or replace function public.stars_seen(p_ids bigint[]) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.star_id, 'claimed', s.claimed, 'cells', s.cells, 'painted', s.painted, 'color', s.color,
    'art_rev', s.art_rev, 'name', s.name, 'lit', s.lit, 'nova', s.supernova_at is not null and s.supernova_at > now() - interval '14 days')), '[]'::jsonb)
  from public.star_systems s where s.star_id = any (p_ids[1:800])
$$;
create or replace function public.stars_seen_real() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.star_id, 'claimed', s.claimed, 'cells', s.cells, 'painted', s.painted, 'color', s.color,
    'art_rev', s.art_rev, 'name', s.name, 'lit', s.lit, 'nova', s.supernova_at is not null and s.supernova_at > now() - interval '14 days')), '[]'::jsonb)
  from public.star_systems s where s.tier = 0
$$;

-- ---- a supernova (staff set it off; Betelgeuse is the one everyone's waiting for) --------------------------------------
create or replace function public.admin_star_supernova(p_star bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_staff uuid := private.require_admin(array['economy']); sys public.star_systems%rowtype; s jsonb := private.sw_star(p_star); o record; v_n int := 0; v_ink int;
begin
  if s is null then raise exception 'no_such_star' using errcode = 'P0001'; end if;
  select * into sys from public.star_systems where star_id = p_star for update;
  if not found then
    insert into public.star_systems (star_id, tier, cls, m, cells) values (p_star, (s ->> 'tier')::int, s ->> 'cls', (s ->> 'm')::int, (s ->> 'cells')::int) returning * into sys;
  end if;
  if sys.supernova_at is not null then raise exception 'already_happened' using errcode = 'P0001'; end if;
  update public.star_systems set supernova_at = now(), art_rev = art_rev + 1, updated_at = now() where star_id = p_star;
  for o in select owner_id, count(*) n from public.star_plots where star_id = p_star group by owner_id loop
    perform private.sw_el_add(o.owner_id, 'au', (o.n * private.sw_nn('supernova', 'gold_per_plot', 1))::bigint);
    v_ink := private.grant_ink_paced(o.owner_id, (o.n * private.sw_nn('supernova', 'ink_per_plot', 50))::int, 'stars', 'star_supernova', p_star::text, 'nova:' || p_star || ':' || o.owner_id);
    perform private.notify(o.owner_id, 'star', null, jsonb_build_object('sub', 'supernova', 'star', p_star, 'name', coalesce(sys.name, s ->> 'catalog_name'), 'ink', v_ink, 'gold', o.n));
    v_n := v_n + 1;
  end loop;
  perform private.sw_event(p_star, v_staff, 'supernova', jsonb_build_object('owners', v_n));
  insert into public.feed_events (kind, player_id, data) values ('star', v_staff, jsonb_build_object('sub', 'supernova', 'star', p_star, 'name', coalesce(sys.name, s ->> 'catalog_name'), 'owners', v_n));
  perform private.audit('stars.supernova', 'star', p_star::text, jsonb_build_object('owners', v_n));
  return jsonb_build_object('star', p_star, 'owners', v_n);
end $$;

-- ---- badges for the new types ---------------------------------------------------------------------------------------
create or replace function private.sw_metrics(p_uid uuid) returns jsonb language sql stable as $$
  with mine as (select star_id, count(*) n from public.star_plots where owner_id = p_uid group by star_id)
  select jsonb_build_object(
    'stars.plots', (select coalesce(sum(n), 0) from mine),
    'stars.discovered', (select count(*) from public.star_systems where discoverer_id = p_uid),
    'stars.keystones', (select count(*) from public.star_plots where owner_id = p_uid and keystone),
    'stars.whole', (select count(*) from mine join public.star_systems s on s.star_id = mine.star_id where mine.n >= s.cells),
    'stars.painted_layers', (select count(*) from public.star_art where owner_id = p_uid),
    'stars.painted_stars', (select count(*) from mine join public.star_systems s on s.star_id = mine.star_id where s.painted),
    'stars.tier5', (select coalesce(sum(mine.n), 0) from mine join public.star_systems s on s.star_id = mine.star_id where s.tier = 5),
    'stars.hyper', (select coalesce(sum(mine.n), 0) from mine join public.star_systems s on s.star_id = mine.star_id where s.cls = 'hypergiant'),
    'stars.codex', (select count(*) from public.star_codex where player_id = p_uid),
    'stars.exoplanets', (select count(*) from public.star_exoplanets where player_id = p_uid),
    'stars.iron', (select coalesce(sum(amount), 0) from public.star_elements where player_id = p_uid and element in ('fe')) + (select count(*) from public.star_events where player_id = p_uid and kind = 'tempered'),
    'stars.lit', (select count(*) from public.star_events where player_id = p_uid and kind = 'lit'),
    'stars.tolls', (select count(*) from public.star_events where player_id = p_uid and kind = 'toll'),
    'stars.comets', (select coalesce(sum(jsonb_array_length(coalesce(state -> 'comets', '[]'::jsonb))), 0) from public.star_plots where owner_id = p_uid and kind = 'ranch'),
    'stars.pulse', (select count(*) from public.star_events where player_id = p_uid and kind = 'pulse' and (data ->> 'score')::numeric >= 0.9))
$$;
insert into public.achievements (key, name, description, icon, category, metric, threshold, reward, sort, is_secret) values
  ('sw_codex', 'Every Kind of Light', 'Grow all seven plants of the Lumen Grove codex.', '🌈', 'stars', 'stars.codex', 7, '{"luck": 30, "enchanted_luck": 1}', 911, false),
  ('sw_exo', 'New Worlds', 'Find an exoplanet with an Observatory.', '🪐', 'stars', 'stars.exoplanets', 1, '{"luck": 10}', 912, false),
  ('sw_iron', 'Heart of Iron', 'Fuse all the way to iron.', '⚙️', 'stars', 'stars.iron', 1, '{"luck": 15}', 913, false),
  ('sw_light', 'Lamplighter', 'Light a star.', '🕯️', 'stars', 'stars.lit', 1, '{"luck": 10}', 914, false),
  ('sw_toll', 'Gatekeeper', 'Take a toll at your Stargate.', '🌀', 'stars', 'stars.tolls', 1, '{"luck": 10}', 915, false),
  ('sw_comets', 'Comet Wrangler', 'Keep six comets on your ranches.', '☄️', 'stars', 'stars.comets', 6, '{"luck": 15}', 916, false),
  ('sw_pulse', 'On the Beat', 'Keep time with a pulsar (90% or better).', '💫', 'stars', 'stars.pulse', 1, '{"luck": 10}', 917, true)
on conflict (key) do update set name = excluded.name, description = excluded.description, icon = excluded.icon, category = excluded.category,
  metric = excluded.metric, threshold = excluded.threshold, reward = excluded.reward, sort = excluded.sort, is_secret = excluded.is_secret;

-- admin: the new settings (kinds, nature) are objects under stars; allow their numbers
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_set_star_settings(jsonb)'::regprocedure);
  if d like '%sw_nested_ok%' then return; end if;
  n := replace(d, $a$    elsif k in ('kinds', 'nature') then
      if jsonb_typeof(x) <> 'object' then raise exception 'invalid_value' using errcode = 'P0001', detail = k; end if;$a$,
  $a$    elsif k in ('kinds', 'nature') then
      -- (sw_nested_ok: each type's numbers, non-negative)
      if jsonb_typeof(x) <> 'object' or exists (select 1 from jsonb_each(x) a, jsonb_each(a.value) b
                                                  where jsonb_typeof(a.value) <> 'object' or jsonb_typeof(b.value) <> 'number' or (b.value::text)::numeric < 0) then
        raise exception 'invalid_value' using errcode = 'P0001', detail = k;
      end if;$a$);
  if n = d then raise exception 'skywright: admin_set_star_settings anchor not found'; end if;
  -- (nested settings merge one level deeper: kinds.forge.* without dropping the other kinds)
  d := n;
  n := replace(d, $a$then (v -> e.key) || e.value else e.value end$a$,
    $a$then (case when e.key in ('kinds', 'nature') then (select coalesce(jsonb_object_agg(kk, coalesce(v -> e.key -> kk, '{}'::jsonb) || vv), '{}'::jsonb) from jsonb_each(e.value) q(kk, vv)) else '{}'::jsonb end
                 || case when e.key in ('kinds', 'nature') then (v -> e.key) - (select coalesce(array_agg(kk), '{}') from jsonb_object_keys(e.value) kk) else (v -> e.key) || e.value end) else e.value end$a$);
  if n = d then raise exception 'skywright: admin_set_star_settings merge anchor not found'; end if;
  execute n;
end $$;

-- ---- who may call what ------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.star_plot(bigint, int)', 'public.star_act(bigint, int, text, jsonb)', 'public.my_star_things()', 'public.star_sail_collect(bigint)',
    'public.star_beams_near(int, int)', 'public.admin_star_supernova(bigint)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  execute 'revoke all on function public.star_songs(bigint) from public';
  execute 'grant execute on function public.star_songs(bigint) to anon, authenticated, service_role';
  foreach f in array array['private.sw_kn(text, text, numeric)', 'private.sw_nn(text, text, numeric)', 'private.sw_sh(bigint, int)', 'private.sw_window(float8, float8, float8)',
    'private.sw_el_add(uuid, text, bigint)', 'private.sw_els(uuid)', 'private.sw_ladder()', 'private.sw_forge_top(text)', 'private.sw_species(text)',
    'private.sw_binary(bigint, text)', 'private.sw_nature(bigint, text)', 'private.sw_view(public.star_plots, uuid)', 'private.sw_plasma_genome(text, float8)', 'private.sw_in_beam(int, int)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
end $$;

-- the Handbook's live numbers include the stars' settings
select private.fn_patch('private.guide_config()', $a$'group_games', 'clan_keep')$a$, $b$'group_games', 'clan_keep', 'stars')$b$);

-- ---- world snapshots (CLAUDE.md: world-shared data is a CDN snapshot): the claimed real stars in everyone's sky and the
--      star chart are the same for everyone, so cdn.landvas.app serves them (keys also in cdn/worker.js SNAPSHOTS).
--      Starbeams stay a call about the beams near you: a beam comes down where its owner's explorer stood, so a list of
--      every beam on Earth would say where players are. ----
select private.fn_patch('public.world_snapshot(text)',
  $a$when 'travel' then jsonb_build_object('items', public.travel_traffic())$a$,
  $b$when 'travel' then jsonb_build_object('items', public.travel_traffic())
    when 'stars_real' then jsonb_build_object('items', public.stars_seen_real())
    when 'stars_chart' then public.stars_chart()$b$);

-- ---- helpers that remember their plans (CLAUDE.md "Keeping the database light"): every Skywright helper that reads a
--      table, and private.rent_rate (rewritten as SQL by the core migration), becomes PL/pgSQL the way
--      20261119000520_efficiency.sql did it for the rest: `return (its query, first row)`, same arguments and result ----
do $$
declare
  f record; d text; hdr text; body text; n int := 0; v_sql oid := (select oid from pg_language where lanname = 'sql');
begin
  for f in
    select p.oid, p.prosrc from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname in ('public', 'private') and p.prolang = v_sql and not p.proretset and p.prokind = 'f'
       and (p.proname ~ '^(sw_|star_|stars_)' or (s.nspname = 'private' and p.proname = 'rent_rate'))
       and p.provolatile in ('s', 'i')
       and p.prorettype not in ('void'::regtype, 'record'::regtype, 'trigger'::regtype)
       and (select t.typtype from pg_type t where t.oid = p.prorettype) in ('b', 'd', 'e', 'r', 'm')
       and p.prosrc ~* '\mfrom\M'
       and p.proowner = (select r.oid from pg_roles r where r.rolname = current_user)
       and not exists (select 1 from pg_depend dp where dp.objid = p.oid and dp.deptype = 'e')
       and not exists (select 1 from pg_depend dp where dp.refobjid = p.oid and dp.classid in ('pg_class'::regclass, 'pg_constraint'::regclass, 'pg_attrdef'::regclass, 'pg_rewrite'::regclass))
  loop
    body := regexp_replace(f.prosrc, '[\s;]+$', '');
    body := regexp_replace(body, '^\s+', '');
    continue when body ~ ';' or body !~* '^(\(?\s*select|with)\M' or body ~* '\m(insert|update|delete)\M';
    d := pg_get_functiondef(f.oid);
    hdr := substring(d from '^(.*?)\nAS \$');
    continue when hdr is null or hdr !~ '\n LANGUAGE sql\n';
    hdr := replace(hdr, E'\n LANGUAGE sql\n', E'\n LANGUAGE plpgsql\n');
    begin
      execute hdr || E'\nAS $lv_fn$\n#variable_conflict use_column\nbegin\n  return (select lv_q.lv_x from (\n' || body || E'\n  ) lv_q(lv_x) limit 1);\nend $lv_fn$';
      n := n + 1;
    exception when others then
      raise notice 'kept % as SQL (%)', f.oid::regprocedure, sqlerrm;
    end;
  end loop;
  raise notice 'skywright plan-cached helpers: %', n;
end $$;
