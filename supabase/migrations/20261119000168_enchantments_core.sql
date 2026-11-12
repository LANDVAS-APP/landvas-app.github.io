-- Enchantments, part 1: the core.
--
-- 2% of every plot roll (claims, quick rolls, tickets — never an event grant or a Crown) comes out Enchanted instead of
-- a rarity: the plot's rarity becomes 'enchanted' (Common rent; its power is its enchantment, which pays Ink, never
-- USD) and one of ten enchantments lives on it, visible on the map and managed from the Grimoire:
--   🪿 Golden Goose · 🧞 Genie · 🗺️ Treasure Map · 🦠 Parasite · 🪺 Cuckoo · 🏺 Pandora's Box · 🧪 Splice · ⚙️ Clockwork
--   📡 Size Ray · 🪞 Mirror Shard
-- Every enchantment is one of a kind: a mint number per kind ("Golden Goose #12"), its own sigil, a birthplace, a level,
-- titles it earns, a name its owner can give it and a chronicle of everything it has done. It belongs to the land: if the
-- plot is ever released it goes dormant there and wakes for whoever claims the plot next.
--
-- Enchanted Luck: at the Altar of Luck, Ink buys charges (each +2 percentage points on the next roll, up to 9). The Altar
-- also takes any amount of Ink for Luck now (no daily limit; only the Luck meter's maximum).
--
-- Part 2 (the next migration) builds each enchantment's own mechanics.

-- ---- config ---------------------------------------------------------------------------------------------------------
insert into public.game_config (key, value) values ('enchantments', jsonb_build_object(
  'enabled', true, 'base_pct', 2, 'luck_pct', 2, 'luck_ink', 150, 'luck_max', 9,
  'weights', jsonb_build_object('goose', 1, 'genie', 1, 'map', 1, 'parasite', 1, 'cuckoo', 1, 'pandora', 1, 'splice', 1, 'clockwork', 1, 'sizeray', 1, 'shard', 1),
  'level_bonus', 0.06, 'max_level', 10))
on conflict (key) do nothing;

-- the Enchanted "rarity": takes the place of a rarity; Common rent (enchantments earn Ink, not USD)
insert into public.plot_rarities (id, name, weight, usd_per_second, ink_reward_multiplier, price_multiplier, color, glow, sort, ppm, emoji, ability) values
  ('enchanted', 'Enchanted', 0, 0.0000000011, 1.2, 1, '#B26BFF', '#F0DBFF', 30, 0, '✨',
   'An enchantment lives here instead of a rarity — open the Grimoire to wield it.')
on conflict (id) do update set name = excluded.name, color = excluded.color, glow = excluded.glow, emoji = excluded.emoji, ability = excluded.ability;

-- enchantment Ink is a paced Ink source (Ink Flow)
update public.game_config set value = jsonb_set(value, '{paced}', coalesce(value -> 'paced', '[]'::jsonb) || '["enchantment"]'::jsonb)
 where key = 'ink_pacing' and not coalesce(value -> 'paced', '[]'::jsonb) ? 'enchantment';

-- ---- tables ---------------------------------------------------------------------------------------------------------
create table if not exists public.enchantments (
  id uuid primary key default gen_random_uuid(),
  gx int not null, gy int not null,
  owner_id uuid references public.players (id) on delete set null,
  kind text not null check (kind in ('goose', 'genie', 'map', 'parasite', 'cuckoo', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard')),
  serial int not null,
  sigil int not null,
  nickname text check (nickname is null or char_length(nickname) between 1 and 24),
  level int not null default 1, xp int not null default 0,
  state jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  titles text[] not null default '{}',
  born_at timestamptz not null default now(), born_place text, first_owner uuid,
  status text not null default 'active' check (status in ('active', 'dormant', 'gone')),
  clock_skip numeric not null default 0,           -- seconds this enchantment's clock runs ahead (Clockwork, Toil)
  frozen_at timestamptz, frozen_until timestamptz, -- Clockwork's freeze (real time)
  updated_at timestamptz not null default now(),
  unique (gx, gy));
create index if not exists enchantments_owner on public.enchantments (owner_id);
create index if not exists enchantments_kind on public.enchantments (kind, status);
alter table public.enchantments enable row level security;
revoke all on public.enchantments from anon, authenticated;

create table if not exists private.enchant_serials (kind text primary key, n int not null default 0);

create table if not exists public.enchant_events (
  id bigint generated always as identity primary key,
  enchant_id uuid not null references public.enchantments (id) on delete cascade,
  kind text not null, data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index if not exists enchant_events_by on public.enchant_events (enchant_id, id desc);
alter table public.enchant_events enable row level security;
revoke all on public.enchant_events from anon, authenticated;

-- Splice links two enchantments for a while: each wears the other's gene
create table if not exists public.enchant_splices (
  id bigint generated always as identity primary key,
  splice_id uuid not null references public.enchantments (id) on delete cascade,
  player_id uuid references public.players (id) on delete cascade,
  a uuid not null references public.enchantments (id) on delete cascade,
  b uuid not null references public.enchantments (id) on delete cascade,
  started_at timestamptz not null default now(), ends_at timestamptz not null, folded boolean not null default false);
create index if not exists enchant_splices_a on public.enchant_splices (a, ends_at);
create index if not exists enchant_splices_b on public.enchant_splices (b, ends_at);
create index if not exists enchant_splices_splice on public.enchant_splices (splice_id, ends_at);
create index if not exists enchant_splices_player on public.enchant_splices (player_id);
alter table public.enchant_splices enable row level security;
revoke all on public.enchant_splices from anon, authenticated;

-- buffs and curses: a plot made giant, a golden hour, a grown next reward, Pandora's curses…
create table if not exists public.enchant_buffs (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null,
  gx int, gy int, enchant_id uuid references public.enchantments (id) on delete cascade,
  mult numeric not null default 1, uses int, data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), expires_at timestamptz not null);
create index if not exists enchant_buffs_player on public.enchant_buffs (player_id, kind, expires_at);
create index if not exists enchant_buffs_plot on public.enchant_buffs (gx, gy) where gx is not null;
create index if not exists enchant_buffs_enchant on public.enchant_buffs (enchant_id);
alter table public.enchant_buffs enable row level security;
revoke all on public.enchant_buffs from anon, authenticated;

alter table public.player_luck add column if not exists enchant int not null default 0 check (enchant between 0 and 100);

-- feed and alerts know about enchantments
alter table public.feed_events drop constraint if exists feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check
  check (kind in ('join', 'claim', 'publish', 'achievement', 'referral', 'level', 'minigame', 'pvp', 'challenge', 'featured', 'sketch', 'duet', 'stamp',
                  'planet_plot', 'settle', 'exploring', 'playdate', 'dig', 'base', 'core', 'harvest', 'ipo', 'arcade',
                  'luck', 'crown', 'flight', 'estate', 'moderation', 'enchant'));
alter table public.player_notifications drop constraint if exists player_notifications_kind_check;
alter table public.player_notifications add constraint player_notifications_kind_check check (kind in (
  'stamp', 'visit', 'checkin', 'inspire', 'sketch_vote', 'note', 'potd', 'duet', 'doodle',
  'friend_request', 'friend_accept', 'sanctuary_visit', 'playdate', 'warp', 'base_visit', 'neighbor', 'core', 'ultra_set', 'enchant'));

-- the feed's privacy switches know enchantments (discoveries, and buying Enchanted Luck)
create or replace function private.feed_activities() returns table(grp text, id text) language sql immutable as $$
  values
    ('feed_account', 'join'), ('feed_account', 'referral'),
    ('feed_claims', 'claim'), ('feed_claims', 'shiny'), ('feed_claims', 'crown'), ('feed_claims', 'planet_plot'), ('feed_claims', 'core'), ('feed_claims', 'enchant'),
    ('feed_badges', 'achievement'),
    ('feed_games', 'minigame'), ('feed_games', 'pvp'), ('feed_games', 'challenge'), ('feed_games', 'sketch'), ('feed_games', 'level'),
    ('feed_games', 'arcade_playing'), ('feed_games', 'arcade_record'), ('feed_games', 'arcade_prize'), ('feed_games', 'arcade_cosmetic'),
    ('feed_games', 'arcade_level'), ('feed_games', 'arcade_install'),
    ('feed_art', 'publish'), ('feed_art', 'featured'), ('feed_art', 'duet'), ('feed_art', 'stamp'),
    ('feed_luck', 'luck_ink'), ('feed_luck', 'luck_inkborn'), ('feed_luck', 'luck_egg'), ('feed_luck', 'luck_plot'), ('feed_luck', 'luck_pick'), ('feed_luck', 'luck_enchant'),
    ('feed_travel', 'flight'), ('feed_travel', 'exploring'), ('feed_travel', 'settle'),
    ('feed_places', 'harvest'), ('feed_places', 'estate'), ('feed_places', 'ipo'), ('feed_places', 'base'), ('feed_places', 'dig'), ('feed_places', 'playdate')
$$;
create or replace function private.feed_group(p_kind text) returns text language sql immutable as $$
  select case
    when p_kind in ('join', 'referral') then 'feed_account'
    when p_kind in ('claim', 'crown', 'planet_plot', 'core', 'enchant') then 'feed_claims'
    when p_kind = 'achievement' then 'feed_badges'
    when p_kind in ('minigame', 'pvp', 'arcade', 'sketch', 'challenge', 'level') then 'feed_games'
    when p_kind in ('publish', 'featured', 'duet', 'stamp') then 'feed_art'
    when p_kind = 'luck' then 'feed_luck'
    when p_kind in ('flight', 'exploring', 'settle') then 'feed_travel'
    when p_kind in ('harvest', 'ipo', 'estate', 'dig', 'base', 'playdate') then 'feed_places'
    else null end
$$;

-- enchantment Ink is a reason Ink can come from
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.grant(uuid,jsonb,text,text,text,text)'::regprocedure);
  n := replace(d, $a$'clan', 'travel', 'finds', 'group_game') then$a$, $a$'clan', 'travel', 'finds', 'group_game', 'enchantment') then$a$);
  if n = d then raise exception 'enchantments: grant anchor not found'; end if;
  execute n;
end $$;

-- ---- names and genes ------------------------------------------------------------------------------------------------
create or replace function private.ench_info(p_kind text) returns jsonb language sql immutable as $$
  select case p_kind
    when 'goose' then '{"name": "Golden Goose", "emoji": "🪿", "gene": "golden", "gene_name": "Golden"}'
    when 'genie' then '{"name": "Genie", "emoji": "🧞", "gene": "wish", "gene_name": "Wishing"}'
    when 'map' then '{"name": "Treasure Map", "emoji": "🗺️", "gene": "seek", "gene_name": "Seeking"}'
    when 'parasite' then '{"name": "Parasite", "emoji": "🦠", "gene": "spread", "gene_name": "Spreading"}'
    when 'cuckoo' then '{"name": "Cuckoo", "emoji": "🪺", "gene": "trick", "gene_name": "Trickster"}'
    when 'pandora' then '{"name": "Pandora’s Box", "emoji": "🏺", "gene": "chaos", "gene_name": "Chaos"}'
    when 'splice' then '{"name": "Splice", "emoji": "🧪", "gene": null, "gene_name": null}'
    when 'clockwork' then '{"name": "Clockwork", "emoji": "⚙️", "gene": "tempo", "gene_name": "Tempo"}'
    when 'sizeray' then '{"name": "Size Ray", "emoji": "📡", "gene": "grow", "gene_name": "Giant"}'
    when 'shard' then '{"name": "Mirror Shard", "emoji": "🪞", "gene": "echo", "gene_name": "Echo"}'
  end::jsonb
$$;

/** the 36 Splice hybrids: a name, and whether the pair resonates (resonant pairs wear each other's genes twice as strong) */
create or replace function private.ench_hybrid(p_a text, p_b text) returns jsonb language sql immutable as $$
  select coalesce((
    '{"genie+goose": ["Wishing Goose", false], "goose+map": ["Treasure Goose", false], "goose+parasite": ["Leech Goose", false],
      "cuckoo+goose": ["Changeling Goose", true], "goose+pandora": ["Cursed Goose", false], "clockwork+goose": ["Clockwork Goose", false],
      "goose+sizeray": ["Giant Goose", true], "goose+shard": ["Mirror Goose", false],
      "genie+map": ["Cartographer Djinn", false], "genie+parasite": ["Possessing Djinn", false], "cuckoo+genie": ["Trickster Djinn", false],
      "genie+pandora": ["Forbidden Djinn", true], "clockwork+genie": ["Hourglass Djinn", false], "genie+sizeray": ["Colossal Djinn", false],
      "genie+shard": ["Mirror Djinn", false],
      "map+parasite": ["Blight Map", false], "cuckoo+map": ["Nest Map", false], "map+pandora": ["Map of Woe", false],
      "clockwork+map": ["Chronomap", false], "map+sizeray": ["Atlas Map", false], "map+shard": ["Looking-Glass Map", true],
      "cuckoo+parasite": ["Brood Parasite", true], "pandora+parasite": ["Plague Bearer", false], "clockwork+parasite": ["Tick", false],
      "parasite+sizeray": ["Behemoth Worm", false], "parasite+shard": ["Doppel-Leech", false],
      "cuckoo+pandora": ["Omen Cuckoo", false], "clockwork+cuckoo": ["Cuckoo Clock", true], "cuckoo+sizeray": ["Roc", false],
      "cuckoo+shard": ["Mirror Cuckoo", false],
      "clockwork+pandora": ["Doomsday Clock", true], "pandora+sizeray": ["Titan’s Box", false], "pandora+shard": ["Box of Mirrors", false],
      "clockwork+sizeray": ["Grandfather Clock", false], "clockwork+shard": ["Reverse Clock", false], "shard+sizeray": ["Funhouse Mirror", true]}'::jsonb
    -> (least(p_a, p_b) || '+' || greatest(p_a, p_b))), '["Chimera", false]'::jsonb)
$$;

create or replace function private.ench_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('enchantments'), '{}'::jsonb) $$;
create or replace function private.ench_n(p_kind text, p_key text, p_def numeric) returns numeric language sql stable as $$
  select coalesce((private.ench_cfg() -> p_kind ->> p_key)::numeric, p_def)
$$;
/** a deterministic 0..1 from three numbers (fox visits, platinum eggs: the same every time they're looked at) */
create or replace function private.ench_hash(p_a bigint, p_b bigint, p_c bigint) returns numeric language sql immutable as $$
  select (abs(hashtext(p_a::text || ':' || p_b::text || ':' || p_c::text))::bigint % 1000003) / 1000003.0
$$;

-- ---- each enchantment's own clock (Clockwork fast-forwards and freezes it; a Tempo splice runs it 3× fast) --------------
/** extra seconds from Tempo splices that haven't been folded into clock_skip yet */
create or replace function private.ench_tempo(p_id uuid) returns numeric language sql stable as $$
  select coalesce(sum(case when private.ench_hybrid(ea.kind, eb.kind) ->> 1 = 'true' then 3 else 2 end
                      * greatest(0, extract(epoch from least(now(), s.ends_at) - s.started_at))), 0)
    from public.enchant_splices s join public.enchantments ea on ea.id = s.a join public.enchantments eb on eb.id = s.b
   where not s.folded and (s.a = p_id or s.b = p_id) and (case when s.a = p_id then eb.kind else ea.kind end) = 'clockwork'
$$;

create or replace function private.ench_now(e public.enchantments) returns timestamptz language sql stable as $$
  select case when e.frozen_at is not null and now() < e.frozen_until then e.frozen_at
              when e.frozen_at is not null then now() - (e.frozen_until - e.frozen_at)
              else now() end
         + make_interval(secs => (e.clock_skip + private.ench_tempo(e.id))::double precision)
$$;

/** settle a clock: fold finished freezes and finished splices into clock_skip */
create or replace function private.ench_settle(p_id uuid) returns void language plpgsql as $$
declare e public.enchantments; s record;
begin
  select * into e from public.enchantments where id = p_id;
  if e.frozen_at is not null and now() >= e.frozen_until then
    update public.enchantments set clock_skip = clock_skip - extract(epoch from frozen_until - frozen_at), frozen_at = null, frozen_until = null where id = p_id;
  end if;
  for s in select sp.*, ea.kind ka, eb.kind kb from public.enchant_splices sp join public.enchantments ea on ea.id = sp.a join public.enchantments eb on eb.id = sp.b
            where not sp.folded and sp.ends_at <= now() and (sp.a = p_id or sp.b = p_id) for update of sp loop
    -- the Tempo the splice gave, kept for good
    if s.kb = 'clockwork' then update public.enchantments set clock_skip = clock_skip + (case when private.ench_hybrid(s.ka, s.kb) ->> 1 = 'true' then 3 else 2 end) * extract(epoch from s.ends_at - s.started_at) where id = s.a; end if;
    if s.ka = 'clockwork' then update public.enchantments set clock_skip = clock_skip + (case when private.ench_hybrid(s.ka, s.kb) ->> 1 = 'true' then 3 else 2 end) * extract(epoch from s.ends_at - s.started_at) where id = s.b; end if;
    update public.enchant_splices set folded = true where id = s.id;
  end loop;
end $$;

-- ---- genes: what a spliced partner lends ------------------------------------------------------------------------------
/** the active splice partner: {kind, id, gene, resonant, hybrid, ends_at} */
create or replace function private.ench_partner(p_id uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('kind', o.kind, 'id', o.id, 'gene', private.ench_info(o.kind) ->> 'gene',
                            'resonant', (private.ench_hybrid(me.kind, o.kind) ->> 1)::boolean, 'hybrid', private.ench_hybrid(me.kind, o.kind) ->> 0,
                            'ends_at', s.ends_at, 'splice_id', s.splice_id)
    from public.enchant_splices s
    join public.enchantments me on me.id = p_id
    join public.enchantments o on o.id = case when s.a = p_id then s.b else s.a end
   where (s.a = p_id or s.b = p_id) and s.started_at <= now() and s.ends_at > now()
   order by s.id desc limit 1
$$;

create or replace function private.ench_event(p_id uuid, p_kind text, p_data jsonb default '{}'::jsonb) returns void language sql as $$
  insert into public.enchant_events (enchant_id, kind, data) values (p_id, p_kind, coalesce(p_data, '{}'::jsonb))
$$;

/** count something on an enchantment (stats) */
create or replace function private.ench_stat(p_id uuid, p_key text, p_add numeric default 1) returns void language sql as $$
  update public.enchantments set stats = stats || jsonb_build_object(p_key, coalesce((stats ->> p_key)::numeric, 0) + p_add) where id = p_id
$$;

/** experience: levels 1–10 (each level +6% on its Ink) */
create or replace function private.ench_xp(p_id uuid, p_n int default 1) returns void language plpgsql as $$
declare v_xp int; v_lv int; v_new int; v_max int := coalesce((private.ench_cfg() ->> 'max_level')::int, 10);
begin
  update public.enchantments set xp = xp + p_n where id = p_id returning xp, level into v_xp, v_lv;
  v_new := least(v_max, 1 + floor(sqrt(greatest(v_xp, 0) / 4.0))::int);
  if v_new > v_lv then
    update public.enchantments set level = v_new where id = p_id;
    perform private.ench_event(p_id, 'level', jsonb_build_object('level', v_new));
  end if;
end $$;

/** a negative outcome dodged? (a Trickster gene, a shrunk fox…) */
create or replace function private.ench_dodge(p_id uuid) returns boolean language plpgsql as $$
declare p jsonb := private.ench_partner(p_id);
begin
  if p is not null and p ->> 'gene' = 'trick' then return random() < case when (p ->> 'resonant')::boolean then 0.75 else 0.5 end; end if;
  return false;
end $$;

/** using a charge: a Wishing gene sometimes gives it back */
create or replace function private.ench_keep_charge(p_id uuid) returns boolean language plpgsql as $$
declare p jsonb := private.ench_partner(p_id);
begin
  if p is not null and p ->> 'gene' = 'wish' then return random() < case when (p ->> 'resonant')::boolean then 0.55 else 0.3 end; end if;
  return false;
end $$;

/** pay an enchantment's Ink: its level, its partner's gene, a grown reward (Size Ray), curses — then Ink Flow.
    Returns {paid, base, mods: [{label, emoji}]} so the scene can show why. */
create or replace function private.ench_pay(p_id uuid, p_base numeric, p_what text) returns jsonb language plpgsql as $$
declare e public.enchantments; p jsonb; v numeric := greatest(coalesce(p_base, 0), 0); v_mods jsonb := '[]'::jsonb; v_paid int := 0; v_extra int := 0;
  v_res boolean; b record; v_echo boolean := false; v_gift int; v_to uuid; v_x numeric;
begin
  select * into e from public.enchantments where id = p_id;
  if e.owner_id is null or v <= 0 then return jsonb_build_object('paid', 0, 'base', 0, 'mods', '[]'::jsonb); end if;
  if e.level > 1 then
    v := v * (1 + coalesce((private.ench_cfg() ->> 'level_bonus')::numeric, 0.06) * (e.level - 1));
    v_mods := v_mods || jsonb_build_object('label', 'Level ' || e.level, 'emoji', '⭐');
  end if;
  p := private.ench_partner(p_id);
  if p is not null then
    v_res := (p ->> 'resonant')::boolean;
    case p ->> 'gene'
      when 'golden' then v := v * case when v_res then 2 else 1.5 end; v_mods := v_mods || jsonb_build_object('label', 'Golden gene ×' || case when v_res then '2' else '1.5' end, 'emoji', '🪿');
      when 'grow' then v := v * case when v_res then 3 else 2 end; v_mods := v_mods || jsonb_build_object('label', 'Giant gene ×' || case when v_res then '3' else '2' end, 'emoji', '📡');
      when 'chaos' then
        v_x := case when v_res then 0.75 + random() * 2.75 else 0.5 + random() * 2 end;
        v := v * v_x; v_mods := v_mods || jsonb_build_object('label', 'Chaos gene ×' || round(v_x, 2), 'emoji', '🏺');
      when 'seek' then
        if random() < (case when v_res then 0.5 else 0.25 end) then v_extra := v_extra + 50; v_mods := v_mods || jsonb_build_object('label', 'Seeking gene: a buried chest +50', 'emoji', '🗺️'); end if;
      when 'spread' then
        v := v * case when v_res then 1.3 else 1.15 end; v_mods := v_mods || jsonb_build_object('label', 'Spreading gene +' || case when v_res then '30' else '15' end || '%', 'emoji', '🦠');
      when 'echo' then
        if random() < (case when v_res then 0.6 else 0.35 end) then v_echo := true; v_mods := v_mods || jsonb_build_object('label', 'Echo! Paid twice', 'emoji', '🪞'); end if;
      else null;
    end case;
  end if;
  -- a grown reward (Size Ray) is used up here
  for b in delete from public.enchant_buffs where id = (select id from public.enchant_buffs where enchant_id = p_id and kind = 'next_reward' and expires_at > now() order by id limit 1) returning mult loop
    v := v * b.mult; v_mods := v_mods || jsonb_build_object('label', 'Size-rayed ×' || round(b.mult, 2), 'emoji', '📡');
  end loop;
  -- Pandora's Plague
  if exists (select 1 from public.enchant_buffs where player_id = e.owner_id and kind = 'curse_plague' and expires_at > now()) then
    v := v * 0.7; v_mods := v_mods || jsonb_build_object('label', 'Plague ×0.7', 'emoji', '🦠');
  end if;
  v := round(v) + v_extra;
  if v_echo then v := v * 2; end if;
  v_paid := private.grant_ink_paced(e.owner_id, v::int, 'enchantment', 'enchantment', p_id::text, null);
  -- the Spreading gene: a spore of it lands on a random player
  if p is not null and p ->> 'gene' = 'spread' and v_paid > 0 then
    v_gift := greatest(1, round(v_paid * case when (p ->> 'resonant')::boolean then 0.2 else 0.1 end))::int;
    select id into v_to from public.players where id <> e.owner_id and status = 'active' and last_active_at > now() - interval '7 days' order by random() limit 1;
    if v_to is not null then
      perform private.grant_ink_paced(v_to, v_gift, 'enchantment', 'enchantment', p_id::text, null);
      perform private.notify(v_to, 'enchant', e.owner_id, jsonb_build_object('sub', 'spore', 'ink', v_gift, 'kind', e.kind));
    end if;
  end if;
  perform private.ench_stat(p_id, 'ink', v_paid);
  perform private.ench_xp(p_id, 1);
  perform private.ench_event(p_id, 'paid', jsonb_build_object('what', p_what, 'ink', v_paid, 'mods', v_mods));
  return jsonb_build_object('paid', v_paid, 'base', round(p_base), 'mods', v_mods);
end $$;

-- ---- buffs that reach other parts of the game -------------------------------------------------------------------------
/** a minigame win's Ink: a giant plot (Size Ray), a Golden Hour (Genie), Strife (Pandora) — uses are used up */
create or replace function private.ench_minigame_mult(p_uid uuid, p_gx int, p_gy int) returns numeric language plpgsql as $$
declare m numeric := 1; b record; v_g numeric;
begin
  select max(mult) into v_g from public.enchant_buffs where kind = 'plot_giant' and gx = p_gx and gy = p_gy and expires_at > now() and player_id = p_uid;
  m := m * coalesce(v_g, 1);
  for b in update public.enchant_buffs set uses = uses - 1 where id = (select id from public.enchant_buffs where player_id = p_uid and kind = 'golden_hour' and expires_at > now() and uses > 0 order by id limit 1) returning mult loop
    m := m * b.mult;
  end loop;
  for b in update public.enchant_buffs set uses = uses - 1 where id = (select id from public.enchant_buffs where player_id = p_uid and kind = 'curse_strife' and expires_at > now() and uses > 0 order by id limit 1) returning mult loop
    m := m * b.mult;
  end loop;
  delete from public.enchant_buffs where player_id = p_uid and uses is not null and uses <= 0;
  return m;
end $$;

/** Pandora's Greed: Ink Flow slows while it lasts */
create or replace function private.ench_pace_curse(p_uid uuid) returns numeric language sql stable as $$
  select case when exists (select 1 from public.enchant_buffs where player_id = p_uid and kind = 'curse_greed' and expires_at > now()) then 0.75 else 1 end
$$;

do $$
declare d text; n text;
begin
  -- minigame wins
  d := pg_get_functiondef('public.svc_finish_minigame(uuid,jsonb)'::regprocedure);
  -- (a test database built without the minigame-pay migrations has an older finish: nothing to hook there)
  if position('private.ink_pace(v_s.player_id' in d) = 0 then d := null; end if;
  n := replace(d, $a$      v_ink := private.ink_pace(v_s.player_id, v_ink, 'minigame');$a$,
                  $a$      v_ink := floor(v_ink * private.ench_minigame_mult(v_s.player_id, v_s.gx, v_s.gy))::int;
      v_ink := private.ink_pace(v_s.player_id, v_ink, 'minigame');$a$);
  if d is not null then
    if n = d then raise exception 'enchantments: svc_finish_minigame anchor not found'; end if;
    execute n;
  end if;
  -- Ink Flow
  d := pg_get_functiondef('private.ink_pace(uuid,integer,text)'::regprocedure);
  n := replace(d, $a$  -- a little jitter and random rounding: no visible steps$a$, $a$  v_m := v_m * private.ench_pace_curse(p_uid);
  -- a little jitter and random rounding: no visible steps$a$);
  if n = d then raise exception 'enchantments: ink_pace anchor not found'; end if;
  execute n;
end $$;

-- ---- birth ------------------------------------------------------------------------------------------------------------
/** which enchantment a roll gets (by the configured weights) */
create or replace function private.ench_pick_kind() returns text language plpgsql volatile as $$
declare w jsonb := coalesce(private.ench_cfg() -> 'weights', '{}'::jsonb); k text; v_tot numeric := 0; v_r numeric; v_acc numeric := 0;
  ks text[] := array['goose', 'genie', 'map', 'parasite', 'cuckoo', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard'];
begin
  foreach k in array ks loop v_tot := v_tot + greatest(coalesce((w ->> k)::numeric, 1), 0); end loop;
  if v_tot <= 0 then return ks[1 + floor(random() * 10)::int]; end if;
  v_r := random() * v_tot;
  foreach k in array ks loop
    v_acc := v_acc + greatest(coalesce((w ->> k)::numeric, 1), 0);
    if v_r < v_acc then return k; end if;
  end loop;
  return 'goose';
end $$;

/** this claim's enchantment roll: 2% (+ Enchanted Luck); the charges are used up either way */
create or replace function private.ench_roll(p_uid uuid) returns text language plpgsql as $$
declare c jsonb := private.ench_cfg(); v_ch int; v_pct numeric;
begin
  if not coalesce((c ->> 'enabled')::boolean, true) then return null; end if;
  select enchant into v_ch from public.player_luck where player_id = p_uid for update;
  v_ch := coalesce(v_ch, 0);
  if v_ch > 0 then update public.player_luck set enchant = 0, updated_at = now() where player_id = p_uid; end if;
  v_pct := coalesce((c ->> 'base_pct')::numeric, 2) + v_ch * coalesce((c ->> 'luck_pct')::numeric, 2);
  -- (tests and the owner can force the next roll)
  if coalesce(current_setting('landvas.force_enchant', true), '') <> '' then return current_setting('landvas.force_enchant', true); end if;
  if random() * 100 < v_pct then return private.ench_pick_kind(); end if;
  return null;
end $$;

/** a new enchantment on a plot */
create or replace function private.ench_create(p_kind text, p_uid uuid, p_gx int, p_gy int) returns public.enchantments language plpgsql as $$
declare e public.enchantments; v_serial int; v_city jsonb := private.city_at(p_gx, p_gy); v_place text;
begin
  insert into private.enchant_serials (kind, n) values (p_kind, 1) on conflict (kind) do update set n = private.enchant_serials.n + 1 returning n into v_serial;
  -- a cell whose old enchantment is gone starts a fresh one (its own history)
  delete from public.enchantments where gx = p_gx and gy = p_gy and status = 'gone';
  v_place := coalesce(v_city ->> 'name', (select concat_ws(', ', k.state, coalesce(k.country_name, k.country)) from public.world_cities k where k.id = private.region_city_at(p_gx, p_gy)));
  insert into public.enchantments (gx, gy, owner_id, kind, serial, sigil, born_place, first_owner, state)
  values (p_gx, p_gy, p_uid, p_kind, v_serial, 1 + floor(random() * 2147483000)::int, v_place, p_uid, private.ench_init(p_kind, now()))
  on conflict (gx, gy) do update set owner_id = excluded.owner_id, kind = excluded.kind, serial = excluded.serial, sigil = excluded.sigil,
    born_place = excluded.born_place, first_owner = excluded.first_owner, state = excluded.state, status = 'active', level = 1, xp = 0,
    stats = '{}'::jsonb, titles = '{}', nickname = null, clock_skip = 0, frozen_at = null, frozen_until = null, born_at = now(), updated_at = now()
  returning * into e;
  perform private.ench_event(e.id, 'born', jsonb_build_object('place', v_place, 'serial', v_serial));
  insert into public.feed_events (kind, player_id, data) values ('enchant', p_uid, jsonb_build_object('sub', 'born', 'kind', p_kind, 'serial', v_serial, 'place', v_place));
  return e;
end $$;

-- the plot carries its enchantment: released → dormant there; claimed again → it wakes for the new owner;
-- no longer Enchanted → gone
create or replace function private.ench_plot_trg() returns trigger language plpgsql as $$
begin
  if new.rarity is distinct from 'enchanted' and old.rarity = 'enchanted' then
    update public.enchantments set status = 'gone', owner_id = null, updated_at = now() where gx = new.gx and gy = new.gy and status <> 'gone';
    return null;
  end if;
  if new.rarity = 'enchanted' and new.owner_id is distinct from old.owner_id then
    if new.owner_id is null then
      update public.enchantments set status = 'dormant', owner_id = null, updated_at = now() where gx = new.gx and gy = new.gy and status = 'active';
      update public.enchant_splices set ends_at = least(ends_at, now()) where ends_at > now() and (a = (select id from public.enchantments where gx = new.gx and gy = new.gy) or b = (select id from public.enchantments where gx = new.gx and gy = new.gy));
    else
      update public.enchantments set status = 'active', owner_id = new.owner_id, updated_at = now() where gx = new.gx and gy = new.gy and status = 'dormant';
      if found then perform private.ench_event((select id from public.enchantments where gx = new.gx and gy = new.gy), 'woke', jsonb_build_object('owner', new.owner_id)); end if;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists world_plots_enchant on public.world_plots;
create trigger world_plots_enchant after update of owner_id, rarity on public.world_plots for each row execute function private.ench_plot_trg();

-- ---- the roll: take_plot ----------------------------------------------------------------------------------------------
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.take_plot(uuid,integer,integer,text,jsonb)'::regprocedure);
  n := replace(d, 'v_granted boolean := false; v_gt text;', 'v_granted boolean := false; v_gt text; v_ench text; v_ench_row public.enchantments;');
  -- the enchantment roll comes before Luck (an enchanted plot keeps your Luck armed for the next one)
  n := replace(n, $a$  if p_method in ('acquire', 'starter') then
    perform set_config('landvas.base_type',$a$, $a$  -- 2% of rolls are Enchanted (never an event roll, never a Crown, never a plot that already holds a sleeping one)
  if p_method in ('acquire', 'starter', 'purchase') and v_grant.id is null and v_base not like 'crown%'
     and not exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and rarity = 'enchanted') then
    v_ench := private.ench_roll(p_uid);
    if v_ench is not null then v_rarity := 'enchanted'; v_base := 'enchanted'; end if;
  end if;
  if p_method in ('acquire', 'starter') and v_base <> 'enchanted' then
    perform set_config('landvas.base_type',$a$);
  n := replace(n, $a$rarity = case when v_granted or v_lucky is not null or v_grant.id is not null then v_rarity else rarity end,$a$,
                  $a$rarity = case when v_granted or v_lucky is not null or v_grant.id is not null or v_ench is not null then v_rarity else rarity end,$a$);
  n := replace(n, $a$  insert into public.plot_ownership (gx, gy, player_id, method, cost)
  values (p_gx, p_gy, p_uid, p_method, coalesce(p_cost, '{}'::jsonb));$a$, $a$  insert into public.plot_ownership (gx, gy, player_id, method, cost)
  values (p_gx, p_gy, p_uid, p_method, coalesce(p_cost, '{}'::jsonb));
  if v_ench is not null then v_ench_row := private.ench_create(v_ench, p_uid, p_gx, p_gy); end if;$a$);
  n := replace(n, $a$'rarity', v_rarity, 'group_id', v_group,$a$,
                  $a$'rarity', v_rarity, 'group_id', v_group, 'enchant', private.ench_brief((select id from public.enchantments where gx = p_gx and gy = p_gy and status = 'active' and v_rarity = 'enchanted')),$a$);
  if position('v_ench := private.ench_roll(p_uid)' in n) = 0 or position('or v_ench is not null then v_rarity' in n) = 0
     or position('v_ench_row := private.ench_create' in n) = 0 or position($a$'enchant', private.ench_brief($a$ in n) = 0 then
    raise exception 'enchantments: take_plot anchors not found';
  end if;
  execute n;
end $$;

-- Luck's picks can't swap an Enchanted plot away (the roll skips Luck), and an enchanted plot can't be sacrificed
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.luck_sacrifice_plot(integer,integer)'::regprocedure);
  n := replace(d, $a$if p.locked or p.rarity like 'crown%' then$a$, $a$if p.locked or p.rarity like 'crown%' or p.rarity = 'enchanted' then$a$);
  if n = d then raise exception 'enchantments: luck_sacrifice_plot anchor not found'; end if;
  execute n;
  d := pg_get_functiondef('public.luck_status()'::regprocedure);
  n := replace(d, $a$and not p.locked and p.rarity not like 'crown%'), '[]'::jsonb),$a$, $a$and not p.locked and p.rarity not like 'crown%' and p.rarity <> 'enchanted'), '[]'::jsonb),$a$);
  if n = d then raise exception 'enchantments: luck_status anchor not found'; end if;
  execute n;
  -- the owner can't hand out a bare "Enchanted" rarity (it needs an enchantment: admin_give_enchantment)
  foreach d in array array['public.admin_set_plot_rarity(integer,integer,text,boolean,text,boolean)', 'public.admin_give_plot(uuid,text,boolean,text,text,boolean,integer,integer)',
                           'public.admin_grant_roll(uuid,text,integer,integer,boolean,text,text,integer,text)'] loop
    n := pg_get_functiondef(d::regprocedure);
    n := replace(n, $a$if not exists (select 1 from public.plot_rarities where id = p_rarity) then$a$, $a$if not exists (select 1 from public.plot_rarities where id = p_rarity) or p_rarity = 'enchanted' then$a$);
    if position($a$or p_rarity = 'enchanted' then$a$ in n) = 0 then raise exception 'enchantments: % not patched', d; end if;
    execute n;
  end loop;
end $$;

-- ---- Enchanted Luck, and Ink for Luck in any amount --------------------------------------------------------------
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.luck_json(uuid)'::regprocedure);
  n := replace(d, $a$'sacrificed', coalesce(l.sacrificed, 0),$a$,
    $a$'enchant', coalesce(l.enchant, 0), 'enchant_max', coalesce((private.ench_cfg() ->> 'luck_max')::int, 9),
    'enchant_ink', coalesce((private.ench_cfg() ->> 'luck_ink')::int, 150), 'enchant_step', coalesce((private.ench_cfg() ->> 'luck_pct')::numeric, 2),
    'enchant_base', coalesce((private.ench_cfg() ->> 'base_pct')::numeric, 2),
    'enchant_pct', coalesce((private.ench_cfg() ->> 'base_pct')::numeric, 2) + coalesce(l.enchant, 0) * coalesce((private.ench_cfg() ->> 'luck_pct')::numeric, 2),
    'sacrificed', coalesce(l.sacrificed, 0),$a$);
  if n = d then raise exception 'enchantments: luck_json anchor not found'; end if;
  execute n;
  -- no daily limit on offering Ink
  d := pg_get_functiondef('public.luck_offer_ink(integer)'::regprocedure);
  n := replace(d, $a$  if p_points > v_left then raise exception 'luck_ink_daily_limit' using errcode = 'P0001'; end if;$a$, '');
  if n = d then raise exception 'enchantments: luck_offer_ink anchor not found'; end if;
  execute n;
end $$;

/** offer any amount of Ink: every `ink_per_point` Ink is a point of Luck (up to the meter's maximum; only what fits is charged) */
create or replace function public.luck_offer_ink_amount(p_ink bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.cfg('luck'); l public.player_luck; v_rate int := greatest(coalesce((c ->> 'ink_per_point')::int, 50), 1);
  v_max int := coalesce((c ->> 'max')::int, 100); v_pts int; v_cost bigint;
begin
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  perform private.rate_limit('luck_offer', 120, 3600);
  if p_ink is null or p_ink < v_rate then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  insert into public.player_luck (player_id) values (v_uid) on conflict (player_id) do nothing;
  select * into l from public.player_luck where player_id = v_uid for update;
  if l.luck >= v_max then raise exception 'luck_full' using errcode = 'P0001'; end if;
  v_pts := least(floor(p_ink / v_rate)::int, v_max - l.luck);
  v_cost := v_pts::bigint * v_rate;
  perform private.charge(v_uid, jsonb_build_object('ink', v_cost), 'luck', 'luck', 'ink', 'luck:' || v_uid || ':' || gen_random_uuid());
  update public.player_luck set luck = luck + v_pts, updated_at = now() where player_id = v_uid;
  insert into public.feed_events (kind, player_id, data) values ('luck', v_uid, jsonb_build_object('sub', 'sacrifice', 'what', 'ink', 'ink', v_cost, 'gained', v_pts, 'luck', l.luck + v_pts));
  return private.luck_json(v_uid) || jsonb_build_object('gained', v_pts, 'cost', v_cost, 'balances', private.balances(v_uid));
end $$;

/** buy Enchanted Luck: each charge +2 points on your next roll's 2% enchantment chance */
create or replace function public.luck_enchant(p_charges int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.ench_cfg(); l public.player_luck; v_max int := coalesce((c ->> 'luck_max')::int, 9);
  v_n int; v_cost bigint;
begin
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  perform private.rate_limit('luck_enchant', 120, 3600);
  if p_charges is null or p_charges < 1 or p_charges > v_max then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  insert into public.player_luck (player_id) values (v_uid) on conflict (player_id) do nothing;
  select * into l from public.player_luck where player_id = v_uid for update;
  v_n := least(p_charges, v_max - l.enchant);
  if v_n <= 0 then raise exception 'enchant_luck_full' using errcode = 'P0001'; end if;
  v_cost := v_n::bigint * coalesce((c ->> 'luck_ink')::int, 150);
  perform private.charge(v_uid, jsonb_build_object('ink', v_cost), 'luck', 'luck', 'enchant', 'enchant-luck:' || v_uid || ':' || gen_random_uuid());
  update public.player_luck set enchant = enchant + v_n, updated_at = now() where player_id = v_uid;
  insert into public.feed_events (kind, player_id, data) values ('luck', v_uid, jsonb_build_object('sub', 'enchant', 'what', 'enchant', 'ink', v_cost, 'gained', v_n,
    'pct', coalesce((c ->> 'base_pct')::numeric, 2) + (l.enchant + v_n) * coalesce((c ->> 'luck_pct')::numeric, 2)));
  return private.luck_json(v_uid) || jsonb_build_object('bought', v_n, 'cost', v_cost, 'balances', private.balances(v_uid));
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.luck_offer_ink_amount(bigint)', 'public.luck_enchant(integer)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
