-- Enchantments, part 3: wonders.
--
--  🌀 Wormhole    trace the spiral to open it, then link the wormhole's plot to another plot of yours (100 miles at first,
--                 anywhere on Earth from level 5, a third plot at level 10). While it's open, minigame wins at either end pay
--                 30% more, Giant and Tiny effects reach both ends, the map flies you through it, and every few hours
--                 something shoots out of the far end — catch it before it's gone.
--  👁️ Oracle Eye  once a day it shows the next 3 outcomes of something — your next plot rolls, your next minigame rewards,
--                 Pandora's next lid, your Goose's next eggs. The server locks them in: what it shows is what happens.
--                 Reorder the cards or burn one for a new draw. Seal a prophecy about a friend's next roll: when it comes
--                 true, you both get Ink.
--  📡 Size Ray    now aimed at a plot you pick on the map: GROW makes it giant (10× on everyone's map, its minigames pay more,
--                 other players can visit and tip it — but Parasites, Cuckoos and the Leviathan go for giants first) or
--                 SHRINK makes it tiny (a speck: invisible to Parasites, Cuckoos and foxes, its enchantment's timers run
--                 twice as fast and three micro-gems hide in it — but its minigames pay less). The timing shot decides how
--                 long (2–12 h); a total miss backfires for 30 minutes.
--  🧪 Splice      new ways to splice: Graft (one-way, double strength, the donor sleeps), Chimera (both doubled + a roar
--                 every 3 h — sometimes unstable), Trinity (three at once), with a friend's enchantment, or with one of
--                 your plots. ~5% of splices mutate into a secret Aberration. Traits stack from every partner.
--
-- Plain words: what the game used to call a splice "gene" is a Trait; a "resonant" pair is a Perfect Match.

-- ---- kinds -----------------------------------------------------------------------------------------------------------
alter table public.enchantments drop constraint if exists enchantments_kind_check;
alter table public.enchantments add constraint enchantments_kind_check
  check (kind in ('goose', 'genie', 'map', 'parasite', 'cuckoo', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard', 'wormhole', 'oracle'));

-- the two new kinds roll as often as the others (keeping any weights the owner already set)
update public.game_config set value = jsonb_set(value, '{weights}', '{"wormhole": 1, "oracle": 1}'::jsonb || coalesce(value -> 'weights', '{}'::jsonb))
 where key = 'enchantments';

create or replace function private.ench_kinds() returns text[] language sql immutable as $$
  select array['goose', 'genie', 'map', 'parasite', 'cuckoo', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard', 'wormhole', 'oracle']
$$;

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
    when 'wormhole' then '{"name": "Wormhole", "emoji": "🌀", "gene": "linked", "gene_name": "Linked"}'
    when 'oracle' then '{"name": "Oracle Eye", "emoji": "👁️", "gene": "foresight", "gene_name": "Foresight"}'
  end::jsonb
$$;

/** the 55 two-way hybrids: a name, and whether the pair is a Perfect Match (traits doubled) */
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
      "clockwork+sizeray": ["Grandfather Clock", false], "clockwork+shard": ["Reverse Clock", false], "shard+sizeray": ["Funhouse Mirror", true],
      "goose+wormhole": ["Warp Goose", false], "genie+wormhole": ["Djinn of Doors", false], "map+wormhole": ["Shortcut Map", true],
      "parasite+wormhole": ["Burrow Worm", false], "cuckoo+wormhole": ["Far-Flung Cuckoo", false], "pandora+wormhole": ["Box of Elsewhere", false],
      "clockwork+wormhole": ["Time Tunnel", true], "sizeray+wormhole": ["Spacefold Ray", false], "shard+wormhole": ["Glass Gate", false],
      "oracle+wormhole": ["Eye of the Rift", false],
      "goose+oracle": ["Augur Goose", false], "genie+oracle": ["Djinn of Fate", true], "map+oracle": ["Seer’s Map", false],
      "oracle+parasite": ["Mind Leech", false], "cuckoo+oracle": ["Prophet Cuckoo", false], "oracle+pandora": ["Pandora’s Prophecy", true],
      "clockwork+oracle": ["Clock of Ages", false], "oracle+sizeray": ["Far-Sight Ray", false], "oracle+shard": ["Scrying Glass", false]}'::jsonb
    -> (least(p_a, p_b) || '+' || greatest(p_a, p_b))), '["Chimera", false]'::jsonb)
$$;

/** words for names made on the fly (trinities, plot hybrids) */
create or replace function private.ench_word(p_kind text, p_part text) returns text language sql immutable as $$
  select ('{"goose": ["Golden", "Hen"], "genie": ["Wishing", "Djinn"], "map": ["Treasure", "Atlas"], "parasite": ["Hungering", "Worm"],
           "cuckoo": ["Trickster", "Roc"], "pandora": ["Cursed", "Box"], "clockwork": ["Ticking", "Engine"], "sizeray": ["Giant", "Titan"],
           "shard": ["Mirrored", "Glass"], "wormhole": ["Warped", "Gate"], "oracle": ["All-Seeing", "Eye"], "splice": ["Spliced", "Chimera"]}'::jsonb
          -> p_kind ->> case when p_part = 'adj' then 0 else 1 end)
$$;
create or replace function private.ench_trinity_name(p_a text, p_b text, p_c text) returns text language sql immutable as $$
  select 'The ' || private.ench_word(k[1], 'adj') || ' ' || private.ench_word(k[2], 'adj') || ' ' || private.ench_word(k[3], 'noun')
  from (select array_agg(x order by x) k from unnest(array[p_a, p_b, p_c]) x) s
$$;
create or replace function private.plot_noun(p_kind text) returns text language sql immutable as $$
  select coalesce(('{"canvas": "Canvas", "habitat": "Habitat", "farm": "Farm", "business": "Shop", "arcade": "Arcade", "home": "House", "landlord": "Manor",
                     "train": "Station", "plane": "Airfield", "base": "Plot", "mine": "Mine", "sky": "Sky Isle", "workshop": "Workshop", "diner": "Diner",
                     "dungeon": "Dungeon", "brawl": "Arena"}'::jsonb ->> coalesce(p_kind, 'canvas')), 'Realm')
$$;
/** what a plot lends the enchantment spliced with it */
create or replace function private.plot_trait(p_kind text) returns text language sql immutable as $$
  select case coalesce(p_kind, 'canvas') when 'canvas' then 'inspired' when 'habitat' then 'wild' when 'farm' then 'fertile'
              when 'business' then 'invested' when 'arcade' then 'streak' else 'homely' end
$$;
create or replace function private.ench_aberrations() returns text[] language sql immutable as $$
  select array['The Hollow King', 'Glitchwing', 'Many-Mouth', 'The Unwritten', 'Starspawn', 'Ninefold']
$$;

-- ---- splices: modes, plots, trinities, friends, aberrations -------------------------------------------------------------
alter table public.enchant_splices alter column b drop not null;
alter table public.enchant_splices add column if not exists mode text not null default 'swap';
alter table public.enchant_splices add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.enchant_splices add column if not exists grp uuid;
alter table public.enchant_splices add column if not exists plot_gx int;
alter table public.enchant_splices add column if not exists plot_gy int;
alter table public.enchant_splices drop constraint if exists enchant_splices_mode_check;
alter table public.enchant_splices add constraint enchant_splices_mode_check check (mode in ('swap', 'graft', 'chimera', 'trinity', 'plot', 'friend'));
create index if not exists enchant_splices_plot on public.enchant_splices (plot_gx, plot_gy) where plot_gx is not null;

/** how strong a splice row is for one side: 1 normal, 2 a Perfect Match / Graft / Chimera, 3 an Aberration */
create or replace function private.splice_strength(p_mode text, p_data jsonb, p_me text, p_other text) returns int language sql immutable as $$
  select case when p_data ? 'aberration' then 3
              when p_mode in ('graft', 'chimera') then 2
              when p_mode = 'plot' then 1
              when p_other is not null and (private.ench_hybrid(p_me, p_other) ->> 1)::boolean then 2
              else 1 end
$$;

/** every active partner of an enchantment (a Trinity has two; a Graft's donor has none) */
create or replace function private.ench_partners(p_id uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x.j order by x.sid desc), '[]'::jsonb) from (
    select s.id sid, jsonb_build_object(
      'kind', coalesce(o.kind, 'plot'), 'id', o.id,
      'gene', case when o.id is not null then private.ench_info(o.kind) ->> 'gene' else private.plot_trait(s.data ->> 'plot_kind') end,
      'strength', private.splice_strength(s.mode, s.data, me.kind, o.kind),
      'resonant', private.splice_strength(s.mode, s.data, me.kind, o.kind) >= 2,
      'perfect', o.id is not null and (private.ench_hybrid(me.kind, o.kind) ->> 1)::boolean,
      'hybrid', case when s.mode = 'trinity' or o.id is null then s.data ->> 'name' else private.ench_hybrid(me.kind, o.kind) ->> 0 end,
      'mode', s.mode, 'aberration', s.data ->> 'aberration', 'unstable', coalesce((s.data ->> 'unstable')::boolean, false),
      'plot_kind', s.data ->> 'plot_kind', 'plot', case when o.id is null then jsonb_build_array(s.plot_gx, s.plot_gy) end,
      'friend', case when o.id is not null and o.owner_id is distinct from me.owner_id then private.profile_json(o.owner_id) end,
      'started_at', s.started_at, 'ends_at', s.ends_at, 'splice_id', s.splice_id, 'row', s.id) j
      from public.enchant_splices s
      join public.enchantments me on me.id = p_id
      left join public.enchantments o on o.id = case when s.a = p_id then s.b else s.a end
     where (s.a = p_id or (s.b = p_id and s.mode <> 'graft')) and s.started_at <= now() and s.ends_at > now()
       and (o.id is not null or s.b is null)) x
$$;
/** the main partner (screens and older code show one) */
create or replace function private.ench_partner(p_id uuid) returns jsonb language sql stable as $$
  select case when jsonb_array_length(p) > 0 then p -> 0 end from (select private.ench_partners(p_id) p) x
$$;
/** strongest strength of a trait this enchantment wears (0: none) */
create or replace function private.ench_has_gene(p_id uuid, p_gene text) returns int language sql stable as $$
  select coalesce(max((p ->> 'strength')::int), 0) from jsonb_array_elements(private.ench_partners(p_id)) p where p ->> 'gene' = p_gene
$$;
/** is this enchantment busy in a splice (wearing a trait, or sleeping as a Graft's donor)? */
create or replace function private.ench_spliced(p_id uuid) returns boolean language sql stable as $$
  select exists (select 1 from public.enchant_splices where (a = p_id or b = p_id) and ends_at > now())
$$;

-- ---- size: giant and tiny plots ---------------------------------------------------------------------------------------
/** a plot's Size Ray effect now: {mode, mult, until, linked} — its own, or one that reaches it through an open Wormhole */
create or replace function private.plot_size(p_gx int, p_gy int) returns jsonb language plpgsql stable as $$
declare b record; w record;
begin
  select * into b from public.enchant_buffs where kind in ('plot_giant', 'plot_tiny') and gx = p_gx and gy = p_gy and expires_at > now() order by id desc limit 1;
  if b.id is not null then
    return jsonb_build_object('mode', case when b.kind = 'plot_giant' then 'grow' else 'shrink' end, 'mult', b.mult, 'until', b.expires_at, 'owner', b.player_id, 'linked', false, 'id', b.id,
                              'prank', coalesce((b.data ->> 'prank')::boolean, false), 'by_name', b.data ->> 'by_name');
  end if;
  -- an open wormhole carries the size of its other end
  for w in select e.gx, e.gy, e.owner_id, e.state -> 'open' o from public.enchantments e
            where e.kind = 'wormhole' and e.status = 'active' and coalesce((e.state -> 'open' ->> 'until')::numeric, 0) > extract(epoch from now())
              and ((e.gx = p_gx and e.gy = p_gy) or ((e.state -> 'open' ->> 'gx2')::int = p_gx and (e.state -> 'open' ->> 'gy2')::int = p_gy)
                   or ((e.state -> 'open' ->> 'gx3')::int = p_gx and (e.state -> 'open' ->> 'gy3')::int = p_gy)) loop
    select * into b from public.enchant_buffs
     where kind in ('plot_giant', 'plot_tiny') and expires_at > now() and player_id = w.owner_id
       and ((gx = w.gx and gy = w.gy) or (gx = (w.o ->> 'gx2')::int and gy = (w.o ->> 'gy2')::int) or (gx = (w.o ->> 'gx3')::int and gy = (w.o ->> 'gy3')::int))
       and not (gx = p_gx and gy = p_gy)
     order by id desc limit 1;
    if b.id is not null then
      return jsonb_build_object('mode', case when b.kind = 'plot_giant' then 'grow' else 'shrink' end, 'mult', b.mult, 'until', b.expires_at, 'owner', b.player_id, 'linked', true, 'id', b.id);
    end if;
  end loop;
  return null;
end $$;
create or replace function private.plot_is_tiny(p_gx int, p_gy int) returns boolean language sql stable as $$
  select coalesce(private.plot_size(p_gx, p_gy) ->> 'mode', '') = 'shrink'
$$;
/** was a plot tiny at a moment (epoch seconds)? (foxes can't find a tiny plot) */
create or replace function private.plot_tiny_at(p_gx int, p_gy int, p_at numeric) returns boolean language sql stable as $$
  select exists (select 1 from public.enchant_buffs where kind = 'plot_tiny' and gx = p_gx and gy = p_gy and not coalesce((data ->> 'prank')::boolean, false)
                   and extract(epoch from created_at) <= p_at and extract(epoch from expires_at) > p_at)
$$;

-- ---- clocks: Tempo from every partner, and a tiny plot's fast time ---------------------------------------------------------
create or replace function private.ench_tempo(p_id uuid) returns numeric language sql stable as $$
  select coalesce((select sum((private.splice_strength(s.mode, s.data, me.kind, o.kind) + 1)
                              * greatest(0, extract(epoch from least(now(), s.ends_at) - s.started_at)))
                     from public.enchant_splices s join public.enchantments me on me.id = p_id
                     join public.enchantments o on o.id = case when s.a = p_id then s.b else s.a end
                    where not s.folded and (s.a = p_id or (s.b = p_id and s.mode <> 'graft')) and o.kind = 'clockwork'), 0)
       -- small things live fast: time on a tiny plot runs twice as quick
       + coalesce((select sum(greatest(0, extract(epoch from least(now(), b.expires_at) - greatest(b.created_at, me.born_at))))
                     from public.enchantments me join public.enchant_buffs b on b.kind = 'plot_tiny' and b.gx = me.gx and b.gy = me.gy
                    where me.id = p_id and b.expires_at > me.born_at and not coalesce((b.data ->> 'prank')::boolean, false)), 0)
$$;

create or replace function private.ench_settle(p_id uuid) returns void language plpgsql as $$
declare e public.enchantments; s record;
begin
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
end $$;

-- ---- traits: what every partner lends a reward ---------------------------------------------------------------------------
create or replace function private.ench_pay(p_id uuid, p_base numeric, p_what text) returns jsonb language plpgsql as $$
declare e public.enchantments; p jsonb; v numeric := greatest(coalesce(p_base, 0), 0); v_mods jsonb := '[]'::jsonb; v_paid int := 0; v_extra int := 0;
  k int; b record; v_echo boolean := false; v_gift int; v_to uuid; v_x numeric; v_spread numeric := 0; v_xp int := 1; v_ab text; v_lk jsonb;
begin
  select * into e from public.enchantments where id = p_id;
  if e.owner_id is null or v <= 0 then return jsonb_build_object('paid', 0, 'base', 0, 'mods', '[]'::jsonb); end if;
  if e.level > 1 then
    v := v * (1 + coalesce((private.ench_cfg() ->> 'level_bonus')::numeric, 0.06) * (e.level - 1));
    v_mods := v_mods || jsonb_build_object('label', 'Level ' || e.level, 'emoji', '⭐');
  end if;
  for p in select * from jsonb_array_elements(private.ench_partners(p_id)) loop
    k := least(greatest(coalesce((p ->> 'strength')::int, 1), 1), 3);
    case p ->> 'gene'
      when 'golden' then v := v * (1 + 0.5 * k); v_mods := v_mods || jsonb_build_object('label', 'Golden ×' || (1 + 0.5 * k)::text, 'emoji', '🪿');
      when 'grow' then v := v * (1 + k); v_mods := v_mods || jsonb_build_object('label', 'Giant ×' || (1 + k)::text, 'emoji', '📡');
      when 'chaos' then
        v_x := (array[0.5, 0.75, 1.0])[k] + random() * (array[2.0, 2.75, 3.0])[k];
        v := v * v_x; v_mods := v_mods || jsonb_build_object('label', 'Chaos ×' || round(v_x, 2), 'emoji', '🏺');
      when 'seek' then
        if random() < 0.25 * k then v_extra := v_extra + 50; v_mods := v_mods || jsonb_build_object('label', 'Seeking: a buried chest +50', 'emoji', '🗺️'); end if;
      when 'spread' then
        v := v * (1 + 0.15 * k); v_spread := greatest(v_spread, 0.1 * k);
        v_mods := v_mods || jsonb_build_object('label', 'Spreading +' || (15 * k) || '%', 'emoji', '🦠');
      when 'echo' then
        if random() < (array[0.35, 0.6, 0.8])[k] then v_echo := true; v_mods := v_mods || jsonb_build_object('label', 'Echo! Paid twice', 'emoji', '🪞'); end if;
      when 'linked' then v := v * (1 + 0.4 * k); v_mods := v_mods || jsonb_build_object('label', 'Linked: a second plot +' || (40 * k) || '%', 'emoji', '🌀');
      when 'foresight' then v := v * (1 + 0.2 * k); v_mods := v_mods || jsonb_build_object('label', 'Foresight +' || (20 * k) || '%', 'emoji', '👁️');
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
  perform private.ench_event(p_id, 'paid', jsonb_build_object('what', p_what, 'ink', v_paid, 'mods', v_mods));
  return jsonb_build_object('paid', v_paid, 'base', round(p_base), 'mods', v_mods);
end $$;

create or replace function private.ench_dodge(p_id uuid) returns boolean language plpgsql as $$
declare k int;
begin
  k := private.ench_has_gene(p_id, 'trick');
  if k > 0 and random() < (array[0.5, 0.75, 0.9])[k] then return true; end if;
  k := private.ench_has_gene(p_id, 'foresight');
  if k > 0 and random() < (array[0.35, 0.6, 0.8])[k] then return true; end if;
  return false;
end $$;

create or replace function private.ench_keep_charge(p_id uuid) returns boolean language plpgsql as $$
declare k int := private.ench_has_gene(p_id, 'wish');
begin
  return k > 0 and random() < (array[0.3, 0.55, 0.75])[k];
end $$;

create or replace function private.ench_pick_kind() returns text language plpgsql volatile as $$
declare w jsonb := coalesce(private.ench_cfg() -> 'weights', '{}'::jsonb); k text; v_tot numeric := 0; v_r numeric; v_acc numeric := 0; ks text[] := private.ench_kinds();
begin
  foreach k in array ks loop v_tot := v_tot + greatest(coalesce((w ->> k)::numeric, 1), 0); end loop;
  if v_tot <= 0 then return ks[1 + floor(random() * array_length(ks, 1))::int]; end if;
  v_r := random() * v_tot;
  foreach k in array ks loop
    v_acc := v_acc + greatest(coalesce((w ->> k)::numeric, 1), 0);
    if v_r < v_acc then return k; end if;
  end loop;
  return 'goose';
end $$;

-- ---- hosts: tiny plots can't be found; giants draw everything to them -----------------------------------------------------
create or replace function private.ench_hosts(p_uid uuid, p_gx int, p_gy int, p_n int, p_radius int) returns jsonb language plpgsql as $$
declare v jsonb := '[]'::jsonb; r int := p_radius; x record; i int := 0;
begin
  -- a giant plot is the first thing a Parasite or a Cuckoo sees (60%)
  if random() < 0.6 then
    v := coalesce((select jsonb_agg(t.j) from (
      select jsonb_build_object('gx', w.gx, 'gy', w.gy, 'owner', w.owner_id, 'owner_name', pr.username, 'rarity', w.rarity, 'giant', true) j
        from public.enchant_buffs b join public.world_plots w on w.gx = b.gx and w.gy = b.gy and w.owner_id = b.player_id
        join public.players pl on pl.id = w.owner_id join public.profiles pr on pr.id = w.owner_id
       where b.kind = 'plot_giant' and b.expires_at > now() and w.owner_id <> p_uid and pl.status = 'active' and not coalesce((b.data ->> 'prank')::boolean, false)
         and b.gx between p_gx - p_radius and p_gx + p_radius and b.gy between p_gy - p_radius and p_gy + p_radius
       order by random() limit 1) t), '[]'::jsonb);
  end if;
  while jsonb_array_length(v) < p_n and i < 3 loop
    v := v || coalesce((select jsonb_agg(t.j) from (
      select jsonb_build_object('gx', p.gx, 'gy', p.gy, 'owner', p.owner_id, 'owner_name', pr.username, 'rarity', p.rarity) j
        from (select distinct on (w.owner_id) w.gx, w.gy, w.owner_id, w.rarity from public.world_plots w join public.players pl on pl.id = w.owner_id
               where w.owner_id is not null and w.owner_id <> p_uid and pl.status = 'active'
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
end $$;

-- ---- hooks into the older enchantments ------------------------------------------------------------------------------------
do $$
declare d text; n text;
begin
  -- 🪿 foxes can't find a tiny plot; the Oracle can fix which eggs are Platinum
  d := pg_get_functiondef('private.goose_eval(public.enchantments,timestamp with time zone)'::regprocedure);
  n := replace(d, $a$    elsif private.ench_hash(e.sigil, v_eggs, 500 + k) < v_dodge then v_st := 'dodged';$a$,
                  $a$    elsif private.ench_hash(e.sigil, v_eggs, 500 + k) < v_dodge then v_st := 'dodged';
    elsif private.plot_tiny_at(e.gx, e.gy, vis[k]) then v_st := 'lost';$a$);
  n := replace(n, $a$  v_plat := private.ench_hash(e.sigil, v_eggs, 999) < private.ench_n('goose', 'platinum', 0.03);$a$,
                  $a$  v_plat := coalesce((s -> 'fate_plat' ->> v_eggs::text)::boolean, private.ench_hash(e.sigil, v_eggs, 999) < private.ench_n('goose', 'platinum', 0.03));$a$);
  if position('plot_tiny_at' in n) = 0 or position('fate_plat' in n) = 0 then raise exception 'wonders: goose_eval anchors not found'; end if;
  execute n;
  -- 🧞 with Foresight, the Forbidden Wish's outcome is fixed in advance (so it can be seen)
  d := pg_get_functiondef('private.ench_act_genie(public.enchantments,text,jsonb,timestamp with time zone)'::regprocedure);
  n := replace(d, $a$      v_roll := random();$a$, $a$      v_roll := case when private.ench_has_gene(e.id, 'foresight') > 0 then private.ench_hash(e.sigil, coalesce((s ->> 'forbidden')::int, 0), 4242) else random() end;$a$);
  if n = d then raise exception 'wonders: genie anchor not found'; end if;
  execute n;
  -- 🗺️ a Linked map (spliced with a Wormhole) picks up its pieces through the wormhole, from anywhere
  d := pg_get_functiondef('private.ench_act_map(public.enchantments,text,jsonb,timestamp with time zone)'::regprocedure);
  n := replace(d, $a$      if v_d is null or v_d > v_reach then raise exception 'too_far' using errcode = 'P0001', detail = coalesce(round(v_d)::text, ''); end if;
      s := jsonb_set(s, array['pieces', v_i::text, 'found_at'], to_jsonb(v_now));$a$,
                  $a$      if (v_d is null or v_d > v_reach) and private.ench_has_gene(e.id, 'linked') = 0 then raise exception 'too_far' using errcode = 'P0001', detail = coalesce(round(v_d)::text, ''); end if;
      s := jsonb_set(s, array['pieces', v_i::text, 'found_at'], to_jsonb(v_now));$a$);
  if n = d then raise exception 'wonders: map anchor not found'; end if;
  execute n;
end $$;

create or replace function private.ench_view_genie(e public.enchantments, t timestamptz) returns jsonb language sql stable as $$
  select g || jsonb_build_object('attention', case when g ->> 'freed_until' is null and (g ->> 'wishes')::int >= 3 then 'Three wishes — the Forbidden Wish awaits'
                                                   when g ->> 'freed_until' is null and (g ->> 'wishes')::int >= 1 then 'A wish is ready' end,
                                 -- Djinn of Fate: the Oracle shows how the Forbidden Wish will turn out
                                 'foreseen', case when private.ench_has_gene(e.id, 'foresight') > 0 then
                                   case when private.ench_hash(e.sigil, coalesce((e.state ->> 'forbidden')::int, 0), 4242) < 0.40 then 'granted'
                                        when private.ench_hash(e.sigil, coalesce((e.state ->> 'forbidden')::int, 0), 4242) < 0.75 then 'twisted' else 'freed' end end)
  from (select private.genie_eval(e, t) g) x
$$;

-- 🏺 Pandora's lid, drawn from a seed (random by default; fixed — and so foreseeable — by the Oracle or a Foresight partner)
create or replace function private.pandora_slots(p_sigil int, p_seed bigint, p_n int, p_evils jsonb, p_cycle int) returns jsonb language plpgsql immutable as $$
declare v_p numeric := (array[0.22, 0.32, 0.45])[p_n]; v_out jsonb := '[]'::jsonb; v_left text[]; v_ev text; v_x numeric; v_g numeric; i int; v_evils jsonb := coalesce(p_evils, '[]'::jsonb);
begin
  for i in 1 .. p_n loop
    select array_agg(x order by o) into v_left from unnest(array['plague', 'greed', 'strife', 'envy', 'despair', 'toil', 'sorrow']) with ordinality u(x, o) where not v_evils ? x;
    if v_left is not null and private.ench_hash(p_sigil, p_seed, i * 10 + 1) < v_p then
      v_ev := v_left[1 + floor(private.ench_hash(p_sigil, p_seed, i * 10 + 2) * array_length(v_left, 1))::int];
      v_evils := v_evils || to_jsonb(v_ev);
      v_out := v_out || jsonb_build_array(jsonb_build_object('type', 'evil', 'evil', v_ev));
    else
      v_x := private.ench_hash(p_sigil, p_seed, i * 10 + 3);
      v_g := round((1 + 0.25 * p_cycle) * case p_n when 1 then 30 + private.ench_hash(p_sigil, p_seed, i * 10 + 4) * 30
                                                   when 2 then 45 + private.ench_hash(p_sigil, p_seed, i * 10 + 4) * 45
                                                   else 70 + private.ench_hash(p_sigil, p_seed, i * 10 + 4) * 70 end);
      v_out := v_out || jsonb_build_array(case when v_x < 0.7 then jsonb_build_object('type', 'ink', 'g', v_g)
                                               when v_x < 0.85 then jsonb_build_object('type', 'luck', 'luck', 10)
                                               when v_x < 0.95 then jsonb_build_object('type', 'enchant', 'enchant', 1)
                                               else jsonb_build_object('type', 'golden', 'uses', 2) end);
    end if;
  end loop;
  return v_out;
end $$;
/** the seed Pandora's next lid will use for n notches: the Oracle's, a Foresight partner's fixed one, or null (random) */
create or replace function private.pandora_seed(e public.enchantments, p_n int) returns bigint language sql stable as $$
  select coalesce((e.state -> 'fate_seeds' ->> p_n::text)::bigint,
                  case when private.ench_has_gene(e.id, 'foresight') > 0 then 7777 + coalesce((e.state ->> 'opens')::bigint, 0) * 3 + p_n end)
$$;

create or replace function private.ench_act_pandora(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); v_day text := to_char(t at time zone 'UTC', 'YYYY-MM-DD'); n int := (a ->> 'notches')::int;
  v_evils jsonb := coalesce(e.state -> 'evils', '[]'::jsonb); v_out jsonb := '[]'::jsonb; v_cycle int := coalesce((e.state ->> 'cycle')::int, 0);
  v_pay jsonb; v_c jsonb; v_hope boolean := false; v_lk jsonb; v_tk uuid; v_seed bigint; v_slots jsonb; sl jsonb; v_fated boolean;
begin
  if p_action <> 'open' then raise exception 'invalid_action' using errcode = 'P0001'; end if;
  if n is null or n not between 1 and 3 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if s ->> 'opened_on' = v_day then raise exception 'already_opened' using errcode = 'P0001'; end if;
  if coalesce((s ->> 'locked_until')::numeric, 0) > v_now then raise exception 'box_locked' using errcode = 'P0001'; end if;
  v_seed := private.pandora_seed(e, n);
  v_fated := v_seed is not null;
  v_slots := private.pandora_slots(e.sigil, coalesce(v_seed, floor(random() * 2147483000)::bigint), n, v_evils, v_cycle);
  for sl in select * from jsonb_array_elements(v_slots) loop
    case sl ->> 'type'
      when 'evil' then
        v_c := private.pandora_curse(e, sl ->> 'evil');
        v_evils := v_evils || to_jsonb(sl ->> 'evil');
        if sl ->> 'evil' = 'sorrow' and not (v_c ->> 'dodged')::boolean then s := s || jsonb_build_object('locked_until', v_now + 86400); end if;
        v_out := v_out || jsonb_build_array(jsonb_build_object('type', 'evil') || v_c);
        perform private.ench_event(e.id, 'evil', v_c);
      when 'ink' then
        v_pay := private.ench_pay(e.id, (sl ->> 'g')::numeric, 'a gift from the box');
        v_out := v_out || jsonb_build_array(jsonb_build_object('type', 'ink', 'pay', v_pay));
      when 'luck' then
        v_lk := private.ench_give_luck(e.owner_id, 10, 0);
        v_out := v_out || jsonb_build_array(jsonb_build_object('type', 'luck', 'luck', 10));
      when 'enchant' then
        v_lk := private.ench_give_luck(e.owner_id, 0, 1);
        v_out := v_out || jsonb_build_array(jsonb_build_object('type', 'enchant', 'enchant', 1));
      else
        insert into public.enchant_buffs (player_id, kind, enchant_id, mult, uses, expires_at) values (e.owner_id, 'golden_hour', e.id, 2, 2, now() + interval '3 hours');
        v_out := v_out || jsonb_build_array(jsonb_build_object('type', 'golden', 'uses', 2));
    end case;
  end loop;
  if jsonb_array_length(v_evils) >= 7 then
    v_hope := true;
    v_pay := private.ench_pay(e.id, 400 * (1 + 0.25 * v_cycle), 'Hope');
    v_tk := private.ench_ticket(e.owner_id, 'legendary', 'pandora');
    v_evils := '[]'::jsonb; v_cycle := v_cycle + 1;
    perform private.ench_stat(e.id, 'hope');
    perform private.ench_event(e.id, 'hope', jsonb_build_object('cycle', v_cycle, 'ink', v_pay -> 'paid'));
    insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'hope', 'kind', 'pandora', 'serial', e.serial));
    v_out := v_out || jsonb_build_array(jsonb_build_object('type', 'hope', 'pay', v_pay, 'ticket', 'legendary'));
  end if;
  s := (s - 'fate_seeds') || jsonb_build_object('evils', v_evils, 'opened_on', v_day, 'opens', coalesce((s ->> 'opens')::int, 0) + 1, 'cycle', v_cycle, 'last', v_out);
  if v_fated and e.state ? 'fate_seeds' then perform private.oracle_fulfilled(e.owner_id, 'pandora'); end if;
  perform private.ench_stat(e.id, 'opens');
  perform private.ench_xp(e.id, n);
  return jsonb_build_object('state', s, 'result', jsonb_build_object('notches', n, 'out', v_out, 'hope', v_hope, 'foretold', v_fated));
end $$;

create or replace function private.ench_view_pandora(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); v_day text := to_char(t at time zone 'UTC', 'YYYY-MM-DD'); v_open boolean; v_fore jsonb;
begin
  v_open := coalesce(s ->> 'opened_on', '') <> v_day and coalesce((s ->> 'locked_until')::numeric, 0) <= v_now;
  -- the lid, foreseen (Pandora's Prophecy, or an Oracle's vision)
  if private.pandora_seed(e, 1) is not null then
    v_fore := jsonb_build_object('1', private.pandora_slots(e.sigil, private.pandora_seed(e, 1), 1, s -> 'evils', coalesce((s ->> 'cycle')::int, 0)),
                                 '2', private.pandora_slots(e.sigil, private.pandora_seed(e, 2), 2, s -> 'evils', coalesce((s ->> 'cycle')::int, 0)),
                                 '3', private.pandora_slots(e.sigil, private.pandora_seed(e, 3), 3, s -> 'evils', coalesce((s ->> 'cycle')::int, 0)));
  end if;
  return jsonb_build_object('evils', coalesce(s -> 'evils', '[]'::jsonb), 'all', to_jsonb(private.pandora_evils()), 'cycle', coalesce((s ->> 'cycle')::int, 0),
    'can_open', v_open, 'locked_in', greatest(0, round(coalesce((s ->> 'locked_until')::numeric, 0) - v_now)),
    'next_in', case when not v_open then round(extract(epoch from (date_trunc('day', t at time zone 'UTC') + interval '1 day') - (t at time zone 'UTC'))) end,
    'opens', coalesce((s ->> 'opens')::int, 0), 'last', s -> 'last', 'foreseen', v_fore,
    'curses', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'until', expires_at, 'uses', uses)) from public.enchant_buffs
                        where player_id = e.owner_id and kind like 'curse_%' and expires_at > now() and (uses is null or uses > 0)), '[]'::jsonb),
    'attention', case when v_open then 'The box can be opened today' end);
end $$;

-- ==== 👁️ ORACLE EYE ======================================================================================================
create table if not exists private.oracle_fates (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  what text not null check (what in ('roll', 'reward')),
  outcome jsonb not null,
  oracle_id uuid references public.enchantments (id) on delete set null,
  sealed_by uuid references public.players (id) on delete set null,
  created_at timestamptz not null default now());
create index if not exists oracle_fates_by on private.oracle_fates (player_id, what, id);
create index if not exists oracle_fates_oracle on private.oracle_fates (oracle_id);
create index if not exists oracle_fates_sealed on private.oracle_fates (sealed_by);

/** a fresh roll of fate: what a plot roll would come out as */
create or replace function private.oracle_draw_roll() returns jsonb language plpgsql volatile as $$
declare v_total int; r record; v_u numeric := random() * 1000000; v_acc numeric := 0; c jsonb := private.ench_cfg();
begin
  if coalesce((c ->> 'enabled')::boolean, true) and random() * 100 < coalesce((c ->> 'base_pct')::numeric, 2) then
    return jsonb_build_object('rarity', 'enchanted', 'kind', private.ench_pick_kind());
  end if;
  for r in select id, ppm from public.plot_rarities where ppm > 0 and id not like 'crown%' order by ppm, sort loop
    v_acc := v_acc + r.ppm;
    if v_u < v_acc then return jsonb_build_object('rarity', r.id); end if;
  end loop;
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  if v_total = 0 then return jsonb_build_object('rarity', 'common'); end if;
  return jsonb_build_object('rarity', private.rarity_pick(floor(random() * v_total)::bigint));
end $$;
/** a fortune for a minigame win */
create or replace function private.oracle_draw_reward() returns jsonb language sql volatile as $$
  select jsonb_build_object('mult', case when x < 0.25 then 0.75 when x < 0.62 then 1 when x < 0.87 then 1.5 when x < 0.97 then 2 else 3 end)
  from (select random() x) r
$$;

/** a fate comes true: the next one in line is used up (a sealed prophecy pays both of you) */
create or replace function private.oracle_take(p_uid uuid, p_what text) returns jsonb language plpgsql as $$
declare f private.oracle_fates;
begin
  delete from private.oracle_fates where id = (select id from private.oracle_fates where player_id = p_uid and what = p_what order by id limit 1) returning * into f;
  if f.id is null then return null; end if;
  if f.oracle_id is not null then
    perform private.ench_stat(f.oracle_id, 'fulfilled');
    perform private.ench_xp(f.oracle_id, 1);
  end if;
  if f.sealed_by is not null then
    perform private.grant_ink_paced(p_uid, 10, 'enchantment', 'prophecy', f.id::text, null);
    perform private.grant_ink_paced(f.sealed_by, 10, 'enchantment', 'prophecy', f.id::text, null);
    perform private.notify(f.sealed_by, 'enchant', p_uid, jsonb_build_object('sub', 'prophecy_true', 'kind', 'oracle', 'ink', 10, 'outcome', f.outcome));
    perform private.notify(p_uid, 'enchant', f.sealed_by, jsonb_build_object('sub', 'prophecy_true_you', 'kind', 'oracle', 'ink', 10, 'outcome', f.outcome));
    if f.oracle_id is not null then perform private.ench_event(f.oracle_id, 'prophecy_true', jsonb_build_object('outcome', f.outcome)); end if;
  end if;
  return f.outcome || jsonb_build_object('fate_id', f.id);
end $$;
create or replace function private.oracle_fulfilled(p_uid uuid, p_what text) returns void language plpgsql as $$
declare o uuid;
begin
  select id into o from public.enchantments where owner_id = p_uid and kind = 'oracle' and status = 'active' and state -> 'cards' ->> 'what' = p_what order by born_at limit 1;
  if o is not null then perform private.ench_stat(o, 'fulfilled'); perform private.ench_xp(o, 1); end if;
end $$;

-- the roll obeys fate: a foreseen roll comes out exactly as the Oracle showed (never over an event roll or a Crown)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.take_plot(uuid,integer,integer,text,jsonb)'::regprocedure);
  n := replace(d, 'v_ench text; v_ench_row public.enchantments;', 'v_ench text; v_ench_row public.enchantments; v_fate jsonb;');
  n := replace(n, $a$  -- 2% of rolls are Enchanted (never an event roll, never a Crown, never a plot that already holds a sleeping one)
  if p_method in ('acquire', 'starter', 'purchase') and v_grant.id is null and v_base not like 'crown%'
     and not exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and rarity = 'enchanted') then
    v_ench := private.ench_roll(p_uid);$a$, $a$  -- the Oracle's prophecy, if one is waiting
  if p_method in ('acquire', 'starter', 'purchase') and v_grant.id is null and v_base not like 'crown%'
     and not exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and rarity = 'enchanted') then
    v_fate := private.oracle_take(p_uid, 'roll');
    if v_fate is not null and v_fate ->> 'rarity' <> 'enchanted' then v_rarity := v_fate ->> 'rarity'; v_base := v_rarity; end if;
  end if;
  -- 2% of rolls are Enchanted (never an event roll, never a Crown, never a plot that already holds a sleeping one)
  if p_method in ('acquire', 'starter', 'purchase') and v_grant.id is null and v_base not like 'crown%'
     and not exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and rarity = 'enchanted')
     and (v_fate is null or v_fate ->> 'rarity' = 'enchanted') then
    v_ench := case when v_fate is not null then v_fate ->> 'kind' else private.ench_roll(p_uid) end;$a$);
  n := replace(n, $a$or v_grant.id is not null or v_ench is not null then v_rarity else rarity end,$a$, $a$or v_grant.id is not null or v_ench is not null or v_fate is not null then v_rarity else rarity end,$a$);
  n := replace(n, $a$'rarity', v_rarity, 'group_id', v_group,$a$, $a$'rarity', v_rarity, 'group_id', v_group, 'foretold', v_fate is not null,$a$);
  if position('private.oracle_take(p_uid' in n) = 0 or position('or v_fate is not null then v_rarity' in n) = 0 or position($a$'foretold', v_fate$a$ in n) = 0 then
    raise exception 'wonders: take_plot anchors not found';
  end if;
  execute n;
end $$;

create or replace function private.oracle_eval(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); v_rech numeric := private.ench_n('oracle', 'recharge_h', 24) * 3600; v_c int := coalesce((s ->> 'charges')::int, 0);
  v_at numeric := coalesce((s ->> 'charge_at')::numeric, v_now); v_max int := case when e.level >= 10 then 2 else 1 end;
begin
  if v_c < v_max then v_c := least(v_max, v_c + greatest(floor((v_now - v_at) / v_rech)::int, 0)); end if;
  return jsonb_build_object('charges', v_c, 'max', v_max, 'next_in', case when v_c < v_max then greatest(0, round(v_rech - mod(v_now - v_at, v_rech))) end,
    'cards_n', case when e.level >= 10 then 5 else 3 end, 'rewrites_n', case when e.level >= 10 then 2 else 1 end,
    'unlocks', jsonb_build_object('roll', 1, 'reward', 3, 'pandora', 5, 'egg', 5));
end $$;

/** the cards on the table, as they stand now (a card already come true is marked) */
create or replace function private.oracle_cards(e public.enchantments) returns jsonb language plpgsql stable as $$
declare c jsonb := e.state -> 'cards'; v jsonb := '[]'::jsonb; x jsonb; i int := 0; tg public.enchantments; v_done boolean;
begin
  if jsonb_typeof(c) <> 'object' then return null; end if;
  if c ->> 'what' in ('pandora', 'egg') then select * into tg from public.enchantments where id = (c ->> 'target')::uuid; end if;
  for x in select * from jsonb_array_elements(coalesce(c -> 'list', '[]'::jsonb)) loop
    v_done := case c ->> 'what'
      when 'roll' then not exists (select 1 from private.oracle_fates where id = (x ->> 'fate')::bigint)
      when 'reward' then not exists (select 1 from private.oracle_fates where id = (x ->> 'fate')::bigint)
      when 'egg' then coalesce((tg.state ->> 'eggs')::int, 0) > (x ->> 'egg')::int
      when 'pandora' then tg.id is null or not (tg.state ? 'fate_seeds') else false end;
    v := v || jsonb_build_array(x || jsonb_build_object('i', i, 'done', v_done));
    i := i + 1;
  end loop;
  return c || jsonb_build_object('list', v);
end $$;

create or replace function private.ench_act_oracle(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); g jsonb := private.oracle_eval(e, t); v_c int := (g ->> 'charges')::int; r jsonb;
  v_rech numeric := private.ench_n('oracle', 'recharge_h', 24) * 3600; v_what text; v_n int := (g ->> 'cards_n')::int; v_list jsonb := '[]'::jsonb; f private.oracle_fates;
  i int; tg public.enchantments; v_eggs int; v_seed bigint; v_seeds jsonb; v_card jsonb; v_i int; v_j int; v_tmp jsonb; v_ids bigint[]; v_out jsonb[]; v_to uuid; v_day text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  v_plat boolean; v_cards jsonb; v_left int; v_need int;
begin
  if v_c <> coalesce((s ->> 'charges')::int, 0) then s := s || jsonb_build_object('charge_at', coalesce((s ->> 'charge_at')::numeric, v_now) + (v_c - coalesce((s ->> 'charges')::int, 0)) * v_rech); end if;
  if v_c >= (g ->> 'max')::int then s := s || jsonb_build_object('charge_at', v_now); end if;
  s := s || jsonb_build_object('charges', v_c);
  case p_action
    when 'gaze' then
      if v_c < 1 then raise exception 'no_charges' using errcode = 'P0001'; end if;
      v_what := a ->> 'what';
      if v_what not in ('roll', 'reward', 'pandora', 'egg') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
      if e.level < (g -> 'unlocks' ->> v_what)::int then raise exception 'oracle_locked' using errcode = 'P0001', detail = (g -> 'unlocks' ->> v_what); end if;
      if v_what in ('roll', 'reward') then
        -- what's already fated stays fated; the Eye fills the rest of the line
        select count(*) into v_left from private.oracle_fates where player_id = e.owner_id and what = v_what;
        for i in 1 .. greatest(0, v_n - v_left) loop
          insert into private.oracle_fates (player_id, what, outcome, oracle_id)
          values (e.owner_id, v_what, case when v_what = 'roll' then private.oracle_draw_roll() else private.oracle_draw_reward() end, e.id);
        end loop;
        for f in select * from private.oracle_fates where player_id = e.owner_id and what = v_what order by id limit v_n loop
          v_list := v_list || jsonb_build_array(jsonb_build_object('fate', f.id) || f.outcome);
        end loop;
        s := s || jsonb_build_object('cards', jsonb_build_object('what', v_what, 'list', v_list, 'rewrites', (g ->> 'rewrites_n')::int, 'at', v_now));
      elsif v_what = 'pandora' then
        select * into tg from public.enchantments where id = (a ->> 'target')::uuid and owner_id = e.owner_id and status = 'active' and kind = 'pandora';
        if tg.id is null then raise exception 'bad_target' using errcode = 'P0001'; end if;
        v_seeds := jsonb_build_object('1', floor(random() * 2147483000)::bigint, '2', floor(random() * 2147483000)::bigint, '3', floor(random() * 2147483000)::bigint);
        update public.enchantments set state = state || jsonb_build_object('fate_seeds', v_seeds) where id = tg.id;
        for i in 1 .. 3 loop
          v_list := v_list || jsonb_build_array(jsonb_build_object('notches', i, 'slots', private.pandora_slots(tg.sigil, (v_seeds ->> i::text)::bigint, i, tg.state -> 'evils', coalesce((tg.state ->> 'cycle')::int, 0))));
        end loop;
        s := s || jsonb_build_object('cards', jsonb_build_object('what', 'pandora', 'target', tg.id, 'list', v_list, 'rewrites', (g ->> 'rewrites_n')::int, 'at', v_now));
      else
        select * into tg from public.enchantments where id = (a ->> 'target')::uuid and owner_id = e.owner_id and status = 'active' and kind = 'goose';
        if tg.id is null then raise exception 'bad_target' using errcode = 'P0001'; end if;
        v_eggs := coalesce((tg.state ->> 'eggs')::int, 0);
        v_tmp := coalesce(tg.state -> 'fate_plat', '{}'::jsonb);
        for i in 0 .. v_n - 1 loop
          v_plat := coalesce((v_tmp ->> (v_eggs + i)::text)::boolean, private.ench_hash(tg.sigil, v_eggs + i, 999) < private.ench_n('goose', 'platinum', 0.03));
          v_tmp := v_tmp || jsonb_build_object((v_eggs + i)::text, v_plat);
          v_list := v_list || jsonb_build_array(jsonb_build_object('egg', v_eggs + i, 'platinum', v_plat));
        end loop;
        update public.enchantments set state = state || jsonb_build_object('fate_plat', v_tmp) where id = tg.id;
        s := s || jsonb_build_object('cards', jsonb_build_object('what', 'egg', 'target', tg.id, 'list', v_list, 'rewrites', (g ->> 'rewrites_n')::int, 'at', v_now));
      end if;
      s := s || jsonb_build_object('charges', v_c - 1, 'gazes', coalesce((s ->> 'gazes')::int, 0) + 1);
      if v_c >= (g ->> 'max')::int then s := s || jsonb_build_object('charge_at', v_now); end if;
      perform private.ench_stat(e.id, 'gazes');
      perform private.ench_xp(e.id, 3);
      perform private.ench_event(e.id, 'gaze', jsonb_build_object('what', v_what));
      r := jsonb_build_object('cards', s -> 'cards');
    when 'swap', 'burn' then
      v_cards := s -> 'cards';
      if jsonb_typeof(v_cards) <> 'object' then raise exception 'no_prophecy' using errcode = 'P0001'; end if;
      if coalesce((v_cards ->> 'rewrites')::int, 0) < 1 then raise exception 'no_rewrites' using errcode = 'P0001'; end if;
      v_cards := private.oracle_cards(e) -> 'list';
      v_i := (a ->> 'i')::int; v_j := (a ->> 'j')::int;
      if v_i is null or v_i < 0 or v_i >= jsonb_array_length(v_cards) or coalesce((v_cards -> v_i ->> 'done')::boolean, true) then raise exception 'bad_card' using errcode = 'P0001'; end if;
      v_what := s -> 'cards' ->> 'what';
      if p_action = 'swap' then
        if v_what = 'pandora' then raise exception 'cannot_swap' using errcode = 'P0001'; end if;
        if v_j is null or v_j < 0 or v_j >= jsonb_array_length(v_cards) or v_j = v_i or coalesce((v_cards -> v_j ->> 'done')::boolean, true) then raise exception 'bad_card' using errcode = 'P0001'; end if;
        -- the two outcomes trade places; each card keeps its place in line
        v_card := s -> 'cards' -> 'list' -> v_i; v_tmp := s -> 'cards' -> 'list' -> v_j;
        if v_what in ('roll', 'reward') then
          update private.oracle_fates set outcome = v_tmp - 'fate' - 'burned' where id = (v_card ->> 'fate')::bigint and player_id = e.owner_id;
          update private.oracle_fates set outcome = v_card - 'fate' - 'burned' where id = (v_tmp ->> 'fate')::bigint and player_id = e.owner_id;
          s := jsonb_set(jsonb_set(s, array['cards', 'list', v_i::text], (v_tmp - 'fate') || jsonb_build_object('fate', v_card -> 'fate')),
                         array['cards', 'list', v_j::text], (v_card - 'fate') || jsonb_build_object('fate', v_tmp -> 'fate'));
        else
          update public.enchantments set state = jsonb_set(jsonb_set(state, array['fate_plat', v_card ->> 'egg'], v_tmp -> 'platinum'),
                                                            array['fate_plat', v_tmp ->> 'egg'], v_card -> 'platinum')
           where id = (s -> 'cards' ->> 'target')::uuid and owner_id = e.owner_id;
          s := jsonb_set(jsonb_set(s, array['cards', 'list', v_i::text], v_card || jsonb_build_object('platinum', v_tmp -> 'platinum')),
                         array['cards', 'list', v_j::text], v_tmp || jsonb_build_object('platinum', v_card -> 'platinum'));
        end if;
      else
        -- burn a card: fate draws again (it may come out worse)
        case v_what
          when 'roll' then v_card := private.oracle_draw_roll();
            update private.oracle_fates set outcome = v_card where id = (v_cards -> v_i ->> 'fate')::bigint and player_id = e.owner_id;
            v_card := jsonb_build_object('fate', v_cards -> v_i -> 'fate') || v_card;
          when 'reward' then v_card := private.oracle_draw_reward();
            update private.oracle_fates set outcome = v_card where id = (v_cards -> v_i ->> 'fate')::bigint and player_id = e.owner_id;
            v_card := jsonb_build_object('fate', v_cards -> v_i -> 'fate') || v_card;
          when 'egg' then
            v_plat := random() < private.ench_n('goose', 'platinum', 0.03);
            update public.enchantments set state = jsonb_set(state, array['fate_plat', v_cards -> v_i ->> 'egg'], to_jsonb(v_plat)) where id = (s -> 'cards' ->> 'target')::uuid and owner_id = e.owner_id;
            v_card := jsonb_build_object('egg', v_cards -> v_i -> 'egg', 'platinum', v_plat);
          else
            select * into tg from public.enchantments where id = (s -> 'cards' ->> 'target')::uuid and owner_id = e.owner_id;
            if tg.id is null or not (tg.state ? 'fate_seeds') then raise exception 'bad_card' using errcode = 'P0001'; end if;
            v_seed := floor(random() * 2147483000)::bigint;
            update public.enchantments set state = jsonb_set(state, array['fate_seeds', (v_i + 1)::text], to_jsonb(v_seed)) where id = tg.id;
            v_card := jsonb_build_object('notches', v_i + 1, 'slots', private.pandora_slots(tg.sigil, v_seed, v_i + 1, tg.state -> 'evils', coalesce((tg.state ->> 'cycle')::int, 0)));
        end case;
        s := jsonb_set(s, array['cards', 'list', v_i::text], v_card || jsonb_build_object('burned', true));
      end if;
      s := jsonb_set(s, '{cards,rewrites}', to_jsonb(coalesce((s -> 'cards' ->> 'rewrites')::int, 1) - 1));
      perform private.ench_stat(e.id, 'rewrites');
      perform private.ench_event(e.id, p_action, jsonb_build_object('what', v_what));
      r := jsonb_build_object('cards', s -> 'cards');
    when 'foretell' then
      if s ->> 'foretold_on' = v_day then raise exception 'too_soon' using errcode = 'P0001'; end if;
      select pr.id into v_to from public.profiles pr join public.players pl on pl.id = pr.id
       where lower(pr.username) = lower(trim(leading '@' from coalesce(a ->> 'username', ''))) and pl.status = 'active';
      if v_to is null or v_to = e.owner_id then raise exception 'player_not_found' using errcode = 'P0001'; end if;
      -- their next roll: whatever is already fated for them, or a fresh fate
      select * into f from private.oracle_fates where player_id = v_to and what = 'roll' order by id limit 1;
      if f.id is null then
        insert into private.oracle_fates (player_id, what, outcome, oracle_id, sealed_by) values (v_to, 'roll', private.oracle_draw_roll(), e.id, e.owner_id) returning * into f;
      elsif f.sealed_by is not null then raise exception 'already_sealed' using errcode = 'P0001';
      else update private.oracle_fates set sealed_by = e.owner_id, oracle_id = coalesce(oracle_id, e.id) where id = f.id returning * into f;
      end if;
      perform private.notify(v_to, 'enchant', e.owner_id, jsonb_build_object('sub', 'prophecy_sealed', 'kind', 'oracle'));
      s := s || jsonb_build_object('foretold_on', v_day, 'sealed', coalesce(s -> 'sealed', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('fate', f.id, 'to', v_to, 'to_name', (select username from public.profiles where id = v_to), 'at', v_now, 'outcome', f.outcome)));
      perform private.ench_event(e.id, 'foretell', jsonb_build_object('to', (select username from public.profiles where id = v_to)));
      perform private.ench_xp(e.id, 1);
      r := jsonb_build_object('sealed', true, 'to', (select username from public.profiles where id = v_to), 'outcome', f.outcome);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_oracle(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare g jsonb := private.oracle_eval(e, t); v_cards jsonb := private.oracle_cards(e); v_sealed jsonb;
begin
  select coalesce(jsonb_agg(x || jsonb_build_object('done', not exists (select 1 from private.oracle_fates f where f.id = (x ->> 'fate')::bigint))), '[]'::jsonb)
    into v_sealed from jsonb_array_elements(coalesce(e.state -> 'sealed', '[]'::jsonb)) x;
  return g || jsonb_build_object('cards', v_cards, 'sealed', v_sealed, 'gazes', coalesce((e.state ->> 'gazes')::int, 0),
    'fulfilled', coalesce((e.stats ->> 'fulfilled')::int, 0), 'can_foretell', coalesce(e.state ->> 'foretold_on', '') <> to_char(now() at time zone 'UTC', 'YYYY-MM-DD'),
    'targets', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'serial', serial, 'nickname', nickname)) from public.enchantments
                          where owner_id = e.owner_id and status = 'active' and kind in ('pandora', 'goose')), '[]'::jsonb),
    'queued', jsonb_build_object('roll', (select count(*) from private.oracle_fates where player_id = e.owner_id and what = 'roll'),
                                 'reward', (select count(*) from private.oracle_fates where player_id = e.owner_id and what = 'reward')),
    'attention', case when (g ->> 'charges')::int >= 1 then 'The Eye is open — gaze into it' end);
end $$;

-- ==== 🌀 WORMHOLE ========================================================================================================
/** the drops a wormhole spits out, on its own clock: k-th drop time (epoch), and what it is */
create or replace function private.wormhole_drop(p_sigil int, p_from numeric, p_k int) returns jsonb language plpgsql immutable as $$
declare t numeric := p_from + 1800; i int; x numeric;
begin
  for i in 1 .. p_k loop t := t + 3600 * (2 + 2 * private.ench_hash(p_sigil, p_from::bigint, i)); end loop;
  x := private.ench_hash(p_sigil, p_from::bigint, 1000 + p_k);
  return jsonb_build_object('k', p_k, 'at', round(t), 'type', case when x < 0.65 then 'chest' when x < 0.8 then 'star' when x < 0.92 then 'fox' else 'spores' end);
end $$;

create or replace function private.ench_act_wormhole(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); v_real numeric := extract(epoch from clock_timestamp()); r jsonb; v_el numeric; v_score numeric; v_hrs numeric;
  v_km numeric; v_km3 numeric; v_max numeric; v_d jsonb; v_k int; v_pay jsonb; v_lk jsonb; v_to uuid; v_open jsonb := s -> 'open';
begin
  case p_action
    when 'trace' then
      s := s || jsonb_build_object('trace_at', v_real);
      r := jsonb_build_object('tracing', true);
    when 'open' then
      if jsonb_typeof(v_open) = 'object' and (v_open ->> 'until')::numeric > v_real then raise exception 'already_open' using errcode = 'P0001'; end if;
      if coalesce((s ->> 'next_open_at')::numeric, 0) > v_real then raise exception 'too_soon' using errcode = 'P0001'; end if;
      if not exists (select 1 from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int and owner_id = e.owner_id)
         or ((a ->> 'gx')::int = e.gx and (a ->> 'gy')::int = e.gy) then raise exception 'bad_target' using errcode = 'P0001'; end if;
      v_km := private.ench_cell_m(e.gx, e.gy, (a ->> 'gx')::int, (a ->> 'gy')::int) / 1000;
      v_max := case when e.level >= 5 then 40100 else private.ench_n('wormhole', 'reach_km', 160.9) end;
      if v_km > v_max then raise exception 'too_far' using errcode = 'P0001', detail = round(v_max)::text; end if;
      if a ? 'gx3' then
        if e.level < 10 then raise exception 'oracle_locked' using errcode = 'P0001', detail = '10'; end if;
        if not exists (select 1 from public.world_plots where gx = (a ->> 'gx3')::int and gy = (a ->> 'gy3')::int and owner_id = e.owner_id)
           or ((a ->> 'gx3')::int = e.gx and (a ->> 'gy3')::int = e.gy) or ((a ->> 'gx3')::int = (a ->> 'gx')::int and (a ->> 'gy3')::int = (a ->> 'gy')::int) then
          raise exception 'bad_target' using errcode = 'P0001'; end if;
        v_km3 := private.ench_cell_m(e.gx, e.gy, (a ->> 'gx3')::int, (a ->> 'gy3')::int) / 1000;
      end if;
      -- the spiral: the server times the trace (quicker is steadier), the hand's smoothness does the rest
      v_el := v_real - coalesce((s ->> 'trace_at')::numeric, 0);
      -- (a minute to finish it: careful hands get there too, they just open a less steady wormhole)
      if v_el > 60 or v_el < 0.3 then raise exception 'trace_first' using errcode = 'P0001'; end if;
      v_score := 0.5 * least(1, greatest(0, (6 - v_el) / 5)) + 0.5 * least(1, greatest(0, coalesce((a ->> 'smooth')::numeric, 0.5)));
      v_hrs := round(6 + 12 * v_score, 1);
      v_open := jsonb_build_object('gx2', (a ->> 'gx')::int, 'gy2', (a ->> 'gy')::int, 'km', round(v_km, 1), 'from', v_real, 'from_c', v_now, 'until', v_real + v_hrs * 3600,
                                   'stability', round(v_score * 100), 'hours', v_hrs, 'caught', '[]'::jsonb);
      if a ? 'gx3' then v_open := v_open || jsonb_build_object('gx3', (a ->> 'gx3')::int, 'gy3', (a ->> 'gy3')::int, 'km3', round(v_km3, 1)); end if;
      s := s || jsonb_build_object('open', v_open, 'next_open_at', v_real + private.ench_n('wormhole', 'recharge_h', 24) * 3600, 'trace_at', null);
      perform private.ench_stat(e.id, 'opens');
      update public.enchantments set stats = stats || jsonb_build_object('far_km', greatest(coalesce((stats ->> 'far_km')::numeric, 0), round(greatest(v_km, coalesce(v_km3, 0))))) where id = e.id;
      perform private.ench_xp(e.id, 2);
      perform private.ench_event(e.id, 'opened', jsonb_build_object('km', round(v_km), 'hours', v_hrs, 'stability', round(v_score * 100)));
      insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', e.gx, e.gy, e.gx, e.gy);
      r := jsonb_build_object('open', v_open, 'hours', v_hrs, 'stability', round(v_score * 100));
    when 'close' then
      if jsonb_typeof(v_open) <> 'object' or (v_open ->> 'until')::numeric <= v_real then raise exception 'not_open' using errcode = 'P0001'; end if;
      s := jsonb_set(s, '{open,until}', to_jsonb(v_real));
      r := jsonb_build_object('closed', true);
    when 'catch' then
      if jsonb_typeof(v_open) <> 'object' or (v_open ->> 'until')::numeric <= v_real then raise exception 'not_open' using errcode = 'P0001'; end if;
      v_k := (a ->> 'k')::int;
      v_d := private.wormhole_drop(e.sigil, (v_open ->> 'from_c')::numeric, coalesce(v_k, 0));
      if v_k is null or v_k < 1 or v_now < (v_d ->> 'at')::numeric or v_now > (v_d ->> 'at')::numeric + 300 then raise exception 'nothing_there' using errcode = 'P0001'; end if;
      if coalesce(v_open -> 'caught', '[]'::jsonb) @> to_jsonb(v_k) then raise exception 'already_caught' using errcode = 'P0001'; end if;
      case v_d ->> 'type'
        when 'chest' then v_pay := private.ench_pay(e.id, 20 + round(private.ench_hash(e.sigil, v_k, 77) * 40), 'a chest out of the wormhole');
        when 'star' then v_lk := private.ench_give_luck(e.owner_id, 5, 0);
        when 'fox' then v_pay := private.ench_pay(e.id, 15, 'chased a fox back through');
        else
          v_pay := private.ench_pay(e.id, 10, 'spores out of the wormhole');
          select id into v_to from public.players where id <> e.owner_id and status = 'active' and last_active_at > now() - interval '7 days' order by random() limit 1;
          if v_to is not null then
            perform private.grant_ink_paced(v_to, 5, 'enchantment', 'enchantment', e.id::text, null);
            perform private.notify(v_to, 'enchant', e.owner_id, jsonb_build_object('sub', 'spore', 'ink', 5, 'kind', 'wormhole'));
          end if;
      end case;
      s := jsonb_set(s, '{open,caught}', coalesce(v_open -> 'caught', '[]'::jsonb) || to_jsonb(v_k));
      perform private.ench_stat(e.id, 'catches');
      perform private.ench_event(e.id, 'caught', jsonb_build_object('type', v_d ->> 'type'));
      r := jsonb_build_object('caught', v_d ->> 'type', 'pay', v_pay, 'luck', case when v_lk is not null then 5 end);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.wormhole_ends(e public.enchantments) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('gx', c.gx, 'gy', c.gy, 'home', c.home, 'name', w.name, 'rarity', w.rarity, 'place', (private.city_at(c.gx, c.gy) ->> 'name'))), '[]'::jsonb)
  from (select e.gx gx, e.gy gy, true home, 1 o
        union all select (e.state -> 'open' ->> 'gx2')::int, (e.state -> 'open' ->> 'gy2')::int, false, 2 where e.state -> 'open' ? 'gx2'
        union all select (e.state -> 'open' ->> 'gx3')::int, (e.state -> 'open' ->> 'gy3')::int, false, 3 where e.state -> 'open' ? 'gx3') c
  left join public.world_plots w on w.gx = c.gx and w.gy = c.gy
$$;

create or replace function private.ench_view_wormhole(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); v_real numeric := extract(epoch from now()); v_open jsonb := s -> 'open'; v_is boolean; v_k int; v_d jsonb; v_cur jsonb; v_next jsonb;
begin
  v_is := jsonb_typeof(v_open) = 'object' and (v_open ->> 'until')::numeric > v_real;
  if v_is then
    -- which drop is coming through now, and the next one
    v_k := 1;
    loop
      v_d := private.wormhole_drop(e.sigil, (v_open ->> 'from_c')::numeric, v_k);
      exit when (v_d ->> 'at')::numeric + 300 > v_now or v_k > 60;
      v_k := v_k + 1;
    end loop;
    if (v_d ->> 'at')::numeric <= v_now and not coalesce(v_open -> 'caught', '[]'::jsonb) @> to_jsonb(v_k) then
      v_cur := v_d || jsonb_build_object('left', round((v_d ->> 'at')::numeric + 300 - v_now));
      v_next := private.wormhole_drop(e.sigil, (v_open ->> 'from_c')::numeric, v_k + 1);
    else
      v_next := case when (v_d ->> 'at')::numeric > v_now then v_d else private.wormhole_drop(e.sigil, (v_open ->> 'from_c')::numeric, v_k + 1) end;
    end if;
  end if;
  return jsonb_build_object('open', case when v_is then v_open end, 'ends', private.wormhole_ends(e), 'open_left', case when v_is then round((v_open ->> 'until')::numeric - v_real) end,
    'can_open_in', greatest(0, round(coalesce((s ->> 'next_open_at')::numeric, 0) - v_real)), 'max_km', case when e.level >= 5 then null else private.ench_n('wormhole', 'reach_km', 160.9) end,
    'three', e.level >= 10, 'drop', v_cur, 'next_drop_in', case when v_is and v_next is not null then greatest(0, round((v_next ->> 'at')::numeric - v_now)) end,
    'opens', coalesce((e.stats ->> 'opens')::int, 0), 'catches', coalesce((e.stats ->> 'catches')::int, 0), 'echoes', coalesce((e.stats ->> 'echoes')::int, 0),
    'attention', case when v_cur is not null then 'Something is coming through the wormhole!'
                      when not v_is and coalesce((s ->> 'next_open_at')::numeric, 0) <= v_real then 'The wormhole can be opened' end);
end $$;

-- ==== 📡 SIZE RAY: any plot on the map, grown 100× or shrunk 100× =========================================================
-- Your own plot: the real thing (a giant's minigames pay more; a tiny plot hides, runs fast and hides micro-gems).
-- Anyone else's plot: a PRANK — it looks 100× bigger or smaller on everyone's map for a little while, but nothing
-- about their game changes. They're told who did it and can undo it. One prank per player every 12 hours, never on
-- someone who blocked you (or whom you blocked), and a prank never replaces the owner's own zap.
/** may this player prank that plot's owner now? (raises the reason if not) */
create or replace function private.ray_prank_check(p_by uuid, p_owner uuid, p_gx int, p_gy int) returns void language plpgsql stable as $$
declare v_last timestamptz;
begin
  if exists (select 1 from public.player_blocks where (blocker_id = p_owner and blocked_id = p_by) or (blocker_id = p_by and blocked_id = p_owner)) then
    raise exception 'blocked' using errcode = 'P0001'; end if;
  select max(created_at) into v_last from public.enchant_buffs
   where kind in ('plot_giant', 'plot_tiny') and player_id = p_owner and (data ->> 'by') = p_by::text;
  if v_last > now() - make_interval(hours => private.ench_n('sizeray', 'prank_cooldown_h', 12)::int) then
    raise exception 'prank_cooldown' using errcode = 'P0001', detail = ceil(extract(epoch from v_last + make_interval(hours => private.ench_n('sizeray', 'prank_cooldown_h', 12)::int) - now()) / 3600)::text; end if;
  if exists (select 1 from public.enchant_buffs where kind in ('plot_giant', 'plot_tiny') and gx = p_gx and gy = p_gy and expires_at > now()
               and not coalesce((data ->> 'prank')::boolean, false)) then raise exception 'already_sized' using errcode = 'P0001'; end if;
end $$;

create or replace function private.ench_act_sizeray(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); g jsonb := private.ray_eval(e, t); v_c int := (g ->> 'shots')::int; r jsonb; v_tg jsonb; v_aim jsonb;
  v_rech numeric := private.ench_n('sizeray', 'recharge_h', 8) * 3600; v_el numeric; v_ph numeric; v_acc numeric; v_per numeric := (g ->> 'period_ms')::numeric / 1000;
  x public.enchantments; v_m numeric; v_pay jsonb; v_h jsonb; v_hrs numeric; v_mode text; v_grade text; v_back boolean := false; b public.enchant_buffs; v_gems int[]; v_cell int;
  v_owner uuid; v_prank boolean := false; v_gx int; v_gy int; v_bounce boolean := false; v_by text;
begin
  if v_c <> coalesce((s ->> 'shots')::int, 0) then s := s || jsonb_build_object('shot_at', coalesce((s ->> 'shot_at')::numeric, v_now) + (v_c - coalesce((s ->> 'shots')::int, 0)) * v_rech); end if;
  if v_c >= 3 then s := s || jsonb_build_object('shot_at', v_now); end if;
  s := s || jsonb_build_object('shots', v_c);
  case p_action
    when 'aim' then
      if v_c < 1 then raise exception 'no_shots' using errcode = 'P0001'; end if;
      v_tg := a -> 'target';
      if v_tg ->> 'type' not in ('plot', 'enchant', 'fox', 'parasite') then raise exception 'bad_target' using errcode = 'P0001'; end if;
      if v_tg ->> 'type' = 'plot' then
        -- any claimed plot: yours for real, anyone else's as a prank
        select owner_id into v_owner from public.world_plots where gx = (v_tg ->> 'gx')::int and gy = (v_tg ->> 'gy')::int;
        if v_owner is null then raise exception 'not_claimed' using errcode = 'P0001'; end if;
        v_prank := v_owner <> e.owner_id;
        if v_prank then perform private.ray_prank_check(e.owner_id, v_owner, (v_tg ->> 'gx')::int, (v_tg ->> 'gy')::int); end if;
        v_tg := jsonb_build_object('type', 'plot', 'gx', (v_tg ->> 'gx')::int, 'gy', (v_tg ->> 'gy')::int, 'mode', case when v_tg ->> 'mode' = 'shrink' then 'shrink' else 'grow' end,
                                   'prank', v_prank, 'owner', v_owner);
      end if;
      if v_tg ->> 'type' in ('enchant', 'fox') and not exists (select 1 from public.enchantments where id = (v_tg ->> 'id')::uuid and owner_id = e.owner_id and status = 'active'
           and id <> e.id and (v_tg ->> 'type' <> 'fox' or kind = 'goose')) then raise exception 'bad_target' using errcode = 'P0001'; end if;
      if v_tg ->> 'type' = 'parasite' and not exists (select 1 from public.enchantments where id = (v_tg ->> 'id')::uuid and status = 'active'
           and ((state -> 'host' ->> 'owner') = e.owner_id::text or (state -> 'r' -> 'host' ->> 'owner') = e.owner_id::text)) then raise exception 'bad_target' using errcode = 'P0001'; end if;
      v_aim := jsonb_build_object('at', extract(epoch from clock_timestamp()), 'target', v_tg);
      s := s || jsonb_build_object('aim', v_aim);
      r := jsonb_build_object('aim', v_aim, 'server_time', extract(epoch from clock_timestamp()), 'period_ms', g -> 'period_ms');
    when 'fire' then
      v_aim := s -> 'aim';
      if jsonb_typeof(v_aim) <> 'object' then raise exception 'not_aimed' using errcode = 'P0001'; end if;
      if v_c < 1 then raise exception 'no_shots' using errcode = 'P0001'; end if;
      v_el := extract(epoch from clock_timestamp()) - (v_aim ->> 'at')::numeric - 0.12;
      if v_el > 12 then s := s || jsonb_build_object('aim', null); raise exception 'aim_expired' using errcode = 'P0001'; end if;
      v_ph := mod(greatest(v_el, 0) / v_per, 1);
      v_acc := round((0.5 - 0.5 * cos(2 * pi() * v_ph))::numeric, 3);
      v_grade := case when v_acc >= 0.95 then 'PERFECT' when v_acc >= 0.8 then 'GREAT' when v_acc >= 0.5 then 'GOOD' when v_acc >= 0.15 then 'WIDE' else 'MISS' end;
      v_tg := v_aim -> 'target';
      if not private.ench_keep_charge(e.id) then s := s || jsonb_build_object('shots', v_c - 1); end if;
      if v_c >= 3 then s := s || jsonb_build_object('shot_at', v_now); end if;
      s := s || jsonb_build_object('aim', null);
      case v_tg ->> 'type'
        when 'plot' then
          v_mode := v_tg ->> 'mode'; v_gx := (v_tg ->> 'gx')::int; v_gy := (v_tg ->> 'gy')::int;
          v_prank := coalesce((v_tg ->> 'prank')::boolean, false); v_owner := (v_tg ->> 'owner')::uuid;
          -- (the plot may have changed hands since you aimed)
          if v_owner is distinct from (select owner_id from public.world_plots where gx = v_gx and gy = v_gy) then raise exception 'bad_target' using errcode = 'P0001'; end if;
          if v_grade = 'MISS' then
            v_back := true; v_hrs := 0.5;
            if v_prank then
              -- a prank that misses bounces straight back: YOUR plot gets it, for half an hour
              v_bounce := true; v_prank := false; v_owner := e.owner_id; v_gx := e.gx; v_gy := e.gy;
            else
              -- on your own plot, a total miss backfires: the opposite, for half an hour
              v_mode := case when v_mode = 'grow' then 'shrink' else 'grow' end;
            end if;
          elsif v_prank then v_hrs := case v_grade when 'PERFECT' then 3 when 'GREAT' then 2 when 'GOOD' then 1.5 else 0.75 end;
          else v_hrs := case v_grade when 'PERFECT' then 12 when 'GREAT' then 8 when 'GOOD' then 6 else 2 end; end if;
          if v_prank then
            -- (the owner zapped it themselves in the meantime: theirs stands)
            if exists (select 1 from public.enchant_buffs where kind in ('plot_giant', 'plot_tiny') and gx = v_gx and gy = v_gy and expires_at > now()
                         and not coalesce((data ->> 'prank')::boolean, false)) then raise exception 'already_sized' using errcode = 'P0001'; end if;
            select username into v_by from public.profiles where id = e.owner_id;
          end if;
          -- a plot holds one size at a time: the new zap replaces the old one (ended, not erased: time already spent tiny stays spent)
          update public.enchant_buffs set expires_at = now() where kind in ('plot_giant', 'plot_tiny') and gx = v_gx and gy = v_gy and expires_at > now();
          if v_mode = 'grow' then
            -- 100× on everyone's map; a prank changes nothing about their game
            v_m := case when v_prank then 1 when v_back then 1.2 else round(1.5 + 0.5 * v_acc, 2) end;
            insert into public.enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, data, expires_at)
            values (v_owner, 'plot_giant', v_gx, v_gy, e.id, v_m,
                    jsonb_build_object('scale', 100, 'grade', v_grade, 'tips', 0) || case when v_prank then jsonb_build_object('prank', true, 'by', e.owner_id, 'by_name', v_by) else '{}'::jsonb end,
                    now() + make_interval(secs => (v_hrs * 3600)::double precision));
          else
            v_m := case when v_prank then 1 else 0.7 end;
            -- three micro-gems hide in the tiny world (a 5×5 of dust) — only when it's yours
            if not v_prank then select array_agg(c) into v_gems from (select c from generate_series(0, 24) c order by random() limit 3) q; end if;
            insert into public.enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, data, expires_at)
            values (v_owner, 'plot_tiny', v_gx, v_gy, e.id, v_m,
                    jsonb_build_object('scale', 0.01, 'grade', v_grade, 'gems', coalesce(to_jsonb(v_gems), '[]'::jsonb), 'found', '[]'::jsonb, 'tries', 0)
                    || case when v_prank then jsonb_build_object('prank', true, 'by', e.owner_id, 'by_name', v_by, 'tries', 8) else '{}'::jsonb end,
                    now() + make_interval(secs => (v_hrs * 3600)::double precision));
          end if;
          insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', v_gx - 52, v_gy - 52, v_gx + 52, v_gy + 52);
          perform private.ench_stat(e.id, case when v_mode = 'grow' then 'grown' else 'shrunk' end);
          if v_prank then
            perform private.ench_stat(e.id, 'pranks');
            perform private.notify(v_owner, 'enchant', e.owner_id, jsonb_build_object('sub', 'size_prank', 'kind', 'sizeray', 'mode', v_mode, 'gx', v_gx, 'gy', v_gy, 'hours', v_hrs));
          end if;
          r := jsonb_build_object('mode', v_mode, 'backfire', v_back, 'bounced', v_bounce, 'prank', v_prank, 'hours', v_hrs, 'mult', v_m, 'gx', v_gx, 'gy', v_gy,
                                  'giant', case when v_mode = 'grow' then v_m end,
                                  'owner_name', case when v_prank then (select username from public.profiles where id = v_owner) end);
        when 'enchant' then
          v_m := round(1.5 + 1.0 * v_acc, 2);
          insert into public.enchant_buffs (player_id, kind, enchant_id, mult, expires_at) values (e.owner_id, 'next_reward', (v_tg ->> 'id')::uuid, v_m, now() + interval '3 days');
          r := jsonb_build_object('grown', v_m);
        when 'fox' then
          select * into x from public.enchantments where id = (v_tg ->> 'id')::uuid for update;
          v_h := private.goose_eval(x, private.ench_now(x));
          update public.enchantments set state = state || jsonb_build_object('shrunk', coalesce((v_h ->> 'lurking')::int, jsonb_array_length(v_h -> 'visits'))) where id = x.id;
          r := jsonb_build_object('fox_shrunk', true);
        when 'parasite' then
          select * into x from public.enchantments where id = (v_tg ->> 'id')::uuid for update;
          if x.kind = 'shard' then update public.enchantments set state = jsonb_set(jsonb_set(state, '{r,host}', 'null'::jsonb), '{r,rest_until}', to_jsonb(private.ench_ep(private.ench_now(x)) + 3600)) where id = x.id;
          else update public.enchantments set state = state || jsonb_build_object('host', null, 'rest_until', private.ench_ep(private.ench_now(x)) + 3600) where id = x.id; end if;
          v_pay := private.ench_pay(e.id, 15 + 20 * v_acc, 'shrank a parasite');
          perform private.notify(x.owner_id, 'enchant', e.owner_id, jsonb_build_object('sub', 'parasite_shrunk', 'kind', 'parasite'));
          perform private.ench_event(x.id, 'shrunk', '{}'::jsonb);
          r := jsonb_build_object('parasite_shrunk', true, 'pay', v_pay);
        else null;
      end case;
      perform private.ench_stat(e.id, 'fired');
      if v_acc >= 0.95 then perform private.ench_stat(e.id, 'perfects'); end if;
      perform private.ench_xp(e.id, case when v_acc >= 0.95 then 2 else 1 end);
      perform private.ench_event(e.id, 'zap', jsonb_build_object('target', v_tg ->> 'type', 'mode', v_tg ->> 'mode', 'accuracy', v_acc, 'backfire', v_back, 'bounced', v_bounce,
        'prank', case when v_prank then (select username from public.profiles where id = v_owner) end));
      r := r || jsonb_build_object('accuracy', v_acc, 'grade', v_grade);
    when 'revert' then
      -- your own plot's size, or a prank you pulled
      update public.enchant_buffs set expires_at = now() where kind in ('plot_giant', 'plot_tiny') and gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int and expires_at > now()
         and ((player_id = e.owner_id and not coalesce((data ->> 'prank')::boolean, false)) or (data ->> 'by') = e.owner_id::text);
      if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
      insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', (a ->> 'gx')::int - 52, (a ->> 'gy')::int - 52, (a ->> 'gx')::int + 52, (a ->> 'gy')::int + 52);
      r := jsonb_build_object('reverted', true);
    when 'micro' then
      -- search the tiny world for its micro-gems (8 looks per shrink)
      select * into b from public.enchant_buffs where kind = 'plot_tiny' and gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int and player_id = e.owner_id and expires_at > now()
         and not coalesce((data ->> 'prank')::boolean, false) order by id desc limit 1 for update;
      if b.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
      v_cell := (a ->> 'cell')::int;
      if v_cell is null or v_cell not between 0 and 24 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
      if coalesce((b.data ->> 'tries')::int, 0) >= 8 then raise exception 'no_tries' using errcode = 'P0001'; end if;
      if (b.data -> 'found') @> to_jsonb(v_cell) then raise exception 'already_found' using errcode = 'P0001'; end if;
      if (b.data -> 'gems') @> to_jsonb(v_cell) then
        v_pay := private.ench_pay(e.id, (12 + floor(random() * 14))::numeric, 'a micro-gem in the tiny world');
        update public.enchant_buffs set data = data || jsonb_build_object('tries', coalesce((data ->> 'tries')::int, 0) + 1, 'found', (data -> 'found') || to_jsonb(v_cell)) where id = b.id;
        r := jsonb_build_object('gem', true, 'pay', v_pay);
      else
        update public.enchant_buffs set data = data || jsonb_build_object('tries', coalesce((data ->> 'tries')::int, 0) + 1) where id = b.id;
        r := jsonb_build_object('gem', false, 'near', (select min(abs((g2 #>> '{}')::int % 5 - v_cell % 5) + abs((g2 #>> '{}')::int / 5 - v_cell / 5))
                                                         from jsonb_array_elements(b.data -> 'gems') g2 where not (b.data -> 'found') @> g2));
      end if;
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_sizeray(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare g jsonb := private.ray_eval(e, t);
begin
  return g || jsonb_build_object('server_time', extract(epoch from clock_timestamp()),
    'sizes', coalesce((select jsonb_agg(jsonb_build_object('gx', b.gx, 'gy', b.gy, 'mode', case when b.kind = 'plot_giant' then 'grow' else 'shrink' end, 'mult', b.mult, 'until', b.expires_at,
                                                           'left', round(extract(epoch from b.expires_at - now())), 'grade', b.data ->> 'grade', 'tips', coalesce((b.data ->> 'tips')::int, 0),
                                                           'gems_left', case when b.kind = 'plot_tiny' then 3 - jsonb_array_length(coalesce(b.data -> 'found', '[]'::jsonb)) end,
                                                           'found', b.data -> 'found', 'tries_left', case when b.kind = 'plot_tiny' then 8 - coalesce((b.data ->> 'tries')::int, 0) end,
                                                           'name', w.name, 'rarity', w.rarity, 'prank', coalesce((b.data ->> 'prank')::boolean, false) and b.player_id <> e.owner_id,
                                                           'pranked_by', case when b.player_id = e.owner_id and coalesce((b.data ->> 'prank')::boolean, false) then b.data ->> 'by_name' end,
                                                           'owner_name', (select username from public.profiles where id = b.player_id)) order by b.id desc)
                       from public.enchant_buffs b left join public.world_plots w on w.gx = b.gx and w.gy = b.gy
                      where (b.player_id = e.owner_id or (b.data ->> 'by') = e.owner_id::text) and b.kind in ('plot_giant', 'plot_tiny') and b.expires_at > now()), '[]'::jsonb),
    'giants', coalesce((select jsonb_agg(jsonb_build_object('gx', gx, 'gy', gy, 'mult', mult, 'until', expires_at)) from public.enchant_buffs
                         where player_id = e.owner_id and kind = 'plot_giant' and expires_at > now()), '[]'::jsonb),
    'pranks', coalesce((e.stats ->> 'pranks')::int, 0),
    'attention', case when (g ->> 'shots')::int >= 3 then 'Fully charged — fire away' end);
end $$;

/** your plot was zapped (a prank, or your own): put it back to its normal size */
create or replace function public.size_undo(p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_by text;
begin
  if not exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and owner_id = v_uid) then raise exception 'not_owner' using errcode = 'P0001'; end if;
  update public.enchant_buffs set expires_at = now() where kind in ('plot_giant', 'plot_tiny') and gx = p_gx and gy = p_gy and expires_at > now()
  returning data ->> 'by' into v_by;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx - 52, p_gy - 52, p_gx + 52, p_gy + 52);
  return jsonb_build_object('undone', true, 'was_prank', v_by is not null and v_by <> v_uid::text);
end $$;
revoke all on function public.size_undo(int, int) from public, anon;
grant execute on function public.size_undo(int, int) to authenticated;

/** visit someone's giant plot: you both get a little Ink (once per giant, 30 visitors at most) */
create or replace function public.size_giant_visit(p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); b public.enchant_buffs;
begin
  perform private.rate_limit('giant_visit', 60, 3600);
  select * into b from public.enchant_buffs where kind = 'plot_giant' and gx = p_gx and gy = p_gy and expires_at > now() order by id desc limit 1 for update;
  if b.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if b.player_id = v_uid then raise exception 'own_plot' using errcode = 'P0001'; end if;
  if coalesce(b.data -> 'visitors', '[]'::jsonb) ? v_uid::text then raise exception 'already_visited' using errcode = 'P0001'; end if;
  if coalesce((b.data ->> 'tips')::int, 0) >= 30 then raise exception 'giant_full' using errcode = 'P0001'; end if;
  update public.enchant_buffs set data = data || jsonb_build_object('tips', coalesce((data ->> 'tips')::int, 0) + 1, 'visitors', coalesce(data -> 'visitors', '[]'::jsonb) || to_jsonb(v_uid::text)) where id = b.id;
  perform private.grant_ink_paced(v_uid, 2, 'enchantment', 'giant_visit', b.id::text, null);
  perform private.grant_ink_paced(b.player_id, 4, 'enchantment', 'giant_tip', b.id::text, null);
  perform private.notify(b.player_id, 'enchant', v_uid, jsonb_build_object('sub', 'giant_tip', 'kind', 'sizeray', 'ink', 4, 'gx', p_gx, 'gy', p_gy));
  return jsonb_build_object('tipped', true, 'you', 2, 'them', 4, 'balances', private.balances(v_uid));
end $$;

-- ==== 🧪 SPLICE: every way to splice =========================================================================================
create table if not exists public.enchant_splice_invites (
  id bigint generated always as identity primary key,
  splice_id uuid not null references public.enchantments (id) on delete cascade,
  from_player uuid not null references public.players (id) on delete cascade,
  to_player uuid not null references public.players (id) on delete cascade,
  a uuid not null references public.enchantments (id) on delete cascade,
  b uuid not null references public.enchantments (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '24 hours', responded_at timestamptz);
create index if not exists enchant_splice_invites_to on public.enchant_splice_invites (to_player, status);
create index if not exists enchant_splice_invites_from on public.enchant_splice_invites (splice_id, status);
create index if not exists enchant_splice_invites_fp on public.enchant_splice_invites (from_player);
create index if not exists enchant_splice_invites_a on public.enchant_splice_invites (a);
create index if not exists enchant_splice_invites_b on public.enchant_splice_invites (b);
alter table public.enchant_splice_invites enable row level security;
revoke all on public.enchant_splice_invites from anon, authenticated;

create or replace function private.splice_can(x public.enchantments, p_uid uuid) returns boolean language sql stable as $$
  select x.id is not null and x.owner_id = p_uid and x.status = 'active' and x.kind <> 'splice' and not private.ench_spliced(x.id)
$$;

/** the codex: two-way pairs, trinities, plot hybrids and aberrations */
create or replace function private.splice_codex_add(p_s jsonb, p_list text, p_key text) returns jsonb language sql immutable as $$
  select case when coalesce(p_s -> p_list, '[]'::jsonb) ? p_key then p_s else p_s || jsonb_build_object(p_list, coalesce(p_s -> p_list, '[]'::jsonb) || to_jsonb(p_key)) end
$$;

create or replace function private.ench_act_splice(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); g jsonb := private.splice_eval(e, t); x public.enchantments; y public.enchantments; z public.enchantments; r jsonb;
  v_key text; v_h jsonb; v_rech numeric := private.ench_n('splice', 'recharge_h', 36) * 3600; v_c int := (g ->> 'charges')::int; v_new boolean; v_mode text := coalesce(a ->> 'mode', 'swap');
  v_hrs numeric; v_cost int; v_data jsonb := '{}'::jsonb; v_grp uuid; v_name text; v_ab text; v_pk text; v_pay jsonb; sp record; v_inv bigint; v_friend uuid;
begin
  if v_c <> coalesce((s ->> 'charges')::int, 0) then s := s || jsonb_build_object('charge_at', coalesce((s ->> 'charge_at')::numeric, v_now) + (v_c - coalesce((s ->> 'charges')::int, 0)) * v_rech); end if;
  if v_c >= 2 then s := s || jsonb_build_object('charge_at', v_now); end if;
  case p_action
    when 'splice' then
      if v_mode not in ('swap', 'graft', 'chimera', 'trinity', 'plot', 'friend') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
      v_cost := case when v_mode = 'trinity' then 2 else 1 end;
      if v_c < v_cost then raise exception 'no_charges' using errcode = 'P0001'; end if;
      if exists (select 1 from public.enchant_splices where splice_id = e.id and ends_at > now()) then raise exception 'splice_active' using errcode = 'P0001'; end if;
      if exists (select 1 from public.enchant_splice_invites where splice_id = e.id and status = 'pending' and expires_at > now()) then raise exception 'invite_pending' using errcode = 'P0001'; end if;
      select * into x from public.enchantments where id = (a ->> 'a')::uuid for update;
      if not private.splice_can(x, e.owner_id) then raise exception 'bad_target' using errcode = 'P0001'; end if;
      v_hrs := case v_mode when 'graft' then 12 when 'chimera' then 12 when 'trinity' then 18 else private.ench_n('splice', 'hours', 24) end;
      if v_mode = 'friend' then
        select * into y from public.enchantments where id = (a ->> 'b')::uuid for update;
        if y.id is null or y.status <> 'active' or y.kind = 'splice' or y.owner_id is null or y.owner_id = e.owner_id or private.ench_spliced(y.id) then raise exception 'bad_target' using errcode = 'P0001'; end if;
        if private.friend_state(e.owner_id, y.owner_id) is distinct from 'friends' then raise exception 'not_friends' using errcode = 'P0001'; end if;
        insert into public.enchant_splice_invites (splice_id, from_player, to_player, a, b) values (e.id, e.owner_id, y.owner_id, x.id, y.id) returning id into v_inv;
        perform private.notify(y.owner_id, 'enchant', e.owner_id, jsonb_build_object('sub', 'splice_invite', 'kind', 'splice', 'invite', v_inv,
          'hybrid', private.ench_hybrid(x.kind, y.kind) ->> 0, 'a', x.kind, 'b', y.kind));
        s := s || jsonb_build_object('charges', v_c - 1);
        perform private.ench_event(e.id, 'invited', jsonb_build_object('to', (select username from public.profiles where id = y.owner_id), 'hybrid', private.ench_hybrid(x.kind, y.kind) ->> 0));
        return jsonb_build_object('state', s, 'result', jsonb_build_object('invited', true, 'invite', v_inv, 'hybrid', private.ench_hybrid(x.kind, y.kind) ->> 0, 'a', x.kind, 'b', y.kind));
      elsif v_mode = 'plot' then
        if not exists (select 1 from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int and owner_id = e.owner_id) then raise exception 'bad_target' using errcode = 'P0001'; end if;
        if exists (select 1 from public.enchant_splices zs where zs.plot_gx = (ench_act_splice.a ->> 'gx')::int and zs.plot_gy = (ench_act_splice.a ->> 'gy')::int and zs.ends_at > now()) then raise exception 'already_spliced' using errcode = 'P0001'; end if;
        select coalesce(g2.kind, 'canvas') into v_pk from public.canvas_group_members m join public.canvas_groups g2 on g2.id = m.group_id and g2.status = 'active'
         where m.gx = (a ->> 'gx')::int and m.gy = (a ->> 'gy')::int limit 1;
        v_pk := coalesce(v_pk, 'canvas');
        v_name := private.ench_word(x.kind, 'adj') || ' ' || private.plot_noun(v_pk);
        insert into public.enchant_splices (splice_id, player_id, a, b, ends_at, mode, data, plot_gx, plot_gy)
        values (e.id, e.owner_id, x.id, null, now() + make_interval(secs => (v_hrs * 3600)::double precision), 'plot',
                jsonb_build_object('plot_kind', v_pk, 'name', v_name), (a ->> 'gx')::int, (a ->> 'gy')::int);
        v_key := x.kind || '@' || v_pk;
        v_new := not coalesce(s -> 'plots', '[]'::jsonb) ? v_key;
        s := private.splice_codex_add(s, 'plots', v_key);
        r := jsonb_build_object('hybrid', v_name, 'mode', 'plot', 'a', x.kind, 'plot_kind', v_pk, 'new', v_new, 'trait', private.plot_trait(v_pk));
      elsif v_mode = 'trinity' then
        select * into y from public.enchantments where id = (a ->> 'b')::uuid for update;
        select * into z from public.enchantments where id = (a ->> 'c')::uuid for update;
        if not private.splice_can(y, e.owner_id) or not private.splice_can(z, e.owner_id) or x.id = y.id or y.id = z.id or x.id = z.id then raise exception 'bad_target' using errcode = 'P0001'; end if;
        v_grp := gen_random_uuid();
        v_name := private.ench_trinity_name(x.kind, y.kind, z.kind);
        v_data := jsonb_build_object('name', v_name);
        insert into public.enchant_splices (splice_id, player_id, a, b, ends_at, mode, data, grp) values
          (e.id, e.owner_id, x.id, y.id, now() + make_interval(secs => (v_hrs * 3600)::double precision), 'trinity', v_data, v_grp),
          (e.id, e.owner_id, y.id, z.id, now() + make_interval(secs => (v_hrs * 3600)::double precision), 'trinity', v_data, v_grp),
          (e.id, e.owner_id, x.id, z.id, now() + make_interval(secs => (v_hrs * 3600)::double precision), 'trinity', v_data, v_grp);
        select string_agg(k, '+' order by k) into v_key from unnest(array[x.kind, y.kind, z.kind]) k;
        v_new := not coalesce(s -> 'trinities', '[]'::jsonb) ? v_key;
        s := private.splice_codex_add(s, 'trinities', v_key);
        perform private.ench_event(z.id, 'spliced', jsonb_build_object('hybrid', v_name, 'with', x.kind));
        r := jsonb_build_object('hybrid', v_name, 'mode', 'trinity', 'a', x.kind, 'b', y.kind, 'c', z.kind, 'new', v_new);
      else
        select * into y from public.enchantments where id = (a ->> 'b')::uuid for update;
        if not private.splice_can(y, e.owner_id) or x.id = y.id then raise exception 'bad_target' using errcode = 'P0001'; end if;
        v_h := private.ench_hybrid(x.kind, y.kind);
        if v_mode in ('swap', 'chimera') and random() < private.ench_n('splice', 'aberration', 0.05) then
          v_ab := (private.ench_aberrations())[1 + floor(random() * 6)::int];
          v_data := v_data || jsonb_build_object('aberration', v_ab);
        end if;
        if v_mode = 'chimera' and random() < private.ench_n('splice', 'unstable', 0.12) then
          v_hrs := 1 + floor(random() * 4);
          v_data := v_data || jsonb_build_object('unstable', true);
        end if;
        insert into public.enchant_splices (splice_id, player_id, a, b, ends_at, mode, data)
        values (e.id, e.owner_id, x.id, y.id, now() + make_interval(secs => (v_hrs * 3600)::double precision), v_mode, v_data);
        -- a Graft's donor sleeps while its trait is lent out
        if v_mode = 'graft' then
          if y.frozen_at is not null and now() < y.frozen_until then
            update public.enchantments set frozen_until = greatest(frozen_until, now() + make_interval(secs => (v_hrs * 3600)::double precision)) where id = y.id;
          else
            update public.enchantments set frozen_at = now(), frozen_until = now() + make_interval(secs => (v_hrs * 3600)::double precision) where id = y.id;
          end if;
        end if;
        v_key := least(x.kind, y.kind) || '+' || greatest(x.kind, y.kind);
        v_new := not coalesce(s -> 'codex', '[]'::jsonb) ? v_key;
        s := private.splice_codex_add(s, 'codex', v_key);
        if v_ab is not null then s := private.splice_codex_add(s, 'aberrations', v_ab); end if;
        if (v_new and (v_h ->> 1)::boolean) or v_ab is not null then
          insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', case when v_ab is not null then 'aberration' else 'hybrid' end,
            'kind', 'splice', 'hybrid', coalesce(v_ab, v_h ->> 0), 'a', x.kind, 'b', y.kind));
        end if;
        r := jsonb_build_object('hybrid', coalesce(v_ab, v_h ->> 0), 'pair', v_h ->> 0, 'resonant', v_h -> 1, 'perfect', v_h -> 1, 'new', v_new, 'a', x.kind, 'b', y.kind, 'mode', v_mode,
                                'aberration', v_ab, 'unstable', coalesce((v_data ->> 'unstable')::boolean, false));
      end if;
      s := s || jsonb_build_object('charges', v_c - v_cost);
      perform private.ench_stat(e.id, 'splices');
      perform private.ench_xp(e.id, 2);
      perform private.ench_event(e.id, 'spliced', jsonb_build_object('hybrid', r ->> 'hybrid', 'resonant', coalesce((r ->> 'perfect')::boolean, false), 'a', x.kind, 'b', coalesce(r ->> 'b', r ->> 'plot_kind'), 'mode', v_mode, 'new', v_new));
      perform private.ench_event(x.id, 'spliced', jsonb_build_object('hybrid', r ->> 'hybrid', 'with', coalesce(r ->> 'b', 'plot')));
      if y.id is not null then perform private.ench_event(y.id, 'spliced', jsonb_build_object('hybrid', r ->> 'hybrid', 'with', x.kind)); end if;
      r := r || jsonb_build_object('ends_at', now() + make_interval(secs => (v_hrs * 3600)::double precision), 'hours', v_hrs);
    when 'roar' then
      -- a Chimera's move: a roar every 3 hours
      select * into sp from public.enchant_splices where splice_id = e.id and mode = 'chimera' and ends_at > now() order by id desc limit 1;
      if sp.id is null then raise exception 'no_splice' using errcode = 'P0001'; end if;
      if coalesce((sp.data ->> 'roared_at')::numeric, 0) + 3 * 3600 > extract(epoch from now()) then raise exception 'too_soon' using errcode = 'P0001'; end if;
      update public.enchant_splices set data = data || jsonb_build_object('roared_at', extract(epoch from now())) where id = sp.id;
      v_pay := private.ench_pay(e.id, 30 + 5 * ((select level from public.enchantments where id = sp.a) + (select level from public.enchantments where id = sp.b)), 'the Chimera roars');
      perform private.ench_xp(sp.a, 1); perform private.ench_xp(sp.b, 1);
      r := jsonb_build_object('roared', true, 'pay', v_pay);
    when 'unsplice' then
      for sp in select * from public.enchant_splices where splice_id = e.id and ends_at > now() loop
        if sp.mode = 'graft' then update public.enchantments set frozen_until = least(frozen_until, now()) where id = sp.b and frozen_until > now(); end if;
      end loop;
      update public.enchant_splices set ends_at = now() where splice_id = e.id and ends_at > now();
      if not found then
        update public.enchant_splice_invites set status = 'cancelled', responded_at = now() where splice_id = e.id and status = 'pending';
        if not found then raise exception 'no_splice' using errcode = 'P0001'; end if;
        s := s || jsonb_build_object('charges', least(2, v_c + 1));
        r := jsonb_build_object('cancelled', true);
      else
        r := jsonb_build_object('unspliced', true);
      end if;
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.splice_member(p_id uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('id', m.id, 'kind', m.kind, 'sigil', m.sigil, 'level', m.level, 'owner', private.profile_json(m.owner_id),
                            'name', coalesce(m.nickname, (private.ench_info(m.kind) ->> 'name') || ' #' || m.serial))
  from public.enchantments m where m.id = p_id
$$;

create or replace function private.ench_view_splice(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare g jsonb := private.splice_eval(e, t); v_act jsonb; v_inv jsonb; sp public.enchant_splices; v_members jsonb := '[]'::jsonb; v_ids uuid[] := '{}'; r record;
begin
  select * into sp from public.enchant_splices where splice_id = e.id and ends_at > now() order by id limit 1;
  if sp.id is not null then
    -- who's in it, in order (a Graft: the host first, then the donor)
    for r in select x.a, x.b from public.enchant_splices x where x.splice_id = e.id and x.ends_at > now() and (x.id = sp.id or (sp.grp is not null and x.grp = sp.grp)) order by x.id loop
      if not r.a = any(v_ids) then v_ids := v_ids || r.a; end if;
      if r.b is not null and not r.b = any(v_ids) then v_ids := v_ids || r.b; end if;
    end loop;
    select coalesce(jsonb_agg(private.splice_member(u) order by o), '[]'::jsonb) into v_members from unnest(v_ids) with ordinality q(u, o);
    v_act := jsonb_build_object('mode', sp.mode, 'started_at', sp.started_at, 'ends_at', sp.ends_at, 'data', sp.data, 'members', v_members,
      'plot', case when sp.plot_gx is not null then jsonb_build_array(sp.plot_gx, sp.plot_gy) end,
      'roar_in', greatest(0, round(coalesce((sp.data ->> 'roared_at')::numeric, 0) + 3 * 3600 - extract(epoch from now()))));
  end if;
  if v_act is not null then
    v_act := v_act || jsonb_build_object(
      'hybrid', case when v_act -> 'data' ? 'aberration' then v_act -> 'data' ->> 'aberration'
                     when v_act ->> 'mode' in ('trinity', 'plot') then v_act -> 'data' ->> 'name'
                     else private.ench_hybrid(v_act -> 'members' -> 0 ->> 'kind', v_act -> 'members' -> 1 ->> 'kind') ->> 0 end,
      'perfect', v_act ->> 'mode' not in ('trinity', 'plot') and jsonb_array_length(v_act -> 'members') = 2
                 and (private.ench_hybrid(v_act -> 'members' -> 0 ->> 'kind', v_act -> 'members' -> 1 ->> 'kind') ->> 1)::boolean);
    -- (older screens read these)
    v_act := v_act || jsonb_build_object('a_kind', v_act -> 'members' -> 0 ->> 'kind', 'b_kind', coalesce(v_act -> 'members' -> 1 ->> 'kind', 'plot'),
      'a', v_act -> 'members' -> 0 ->> 'id', 'b', v_act -> 'members' -> 1 ->> 'id', 'a_name', v_act -> 'members' -> 0 ->> 'name', 'b_name', v_act -> 'members' -> 1 ->> 'name',
      'resonant', coalesce((v_act ->> 'perfect')::boolean, false) or v_act -> 'data' ? 'aberration' or v_act ->> 'mode' in ('graft', 'chimera'));
  end if;
  select jsonb_build_object('id', i.id, 'to', private.profile_json(i.to_player), 'a', i.a, 'b', i.b, 'expires_at', i.expires_at,
           'hybrid', private.ench_hybrid((select kind from public.enchantments where id = i.a), (select kind from public.enchantments where id = i.b)) ->> 0)
    into v_inv from public.enchant_splice_invites i where i.splice_id = e.id and i.status = 'pending' and i.expires_at > now() order by i.id desc limit 1;
  return g || jsonb_build_object('active', v_act, 'invite', v_inv, 'codex', coalesce(e.state -> 'codex', '[]'::jsonb), 'trinities', coalesce(e.state -> 'trinities', '[]'::jsonb),
    'plots', coalesce(e.state -> 'plots', '[]'::jsonb), 'aberrations', coalesce(e.state -> 'aberrations', '[]'::jsonb), 'made', coalesce((e.stats ->> 'splices')::int, 0),
    'attention', case when v_act is null and v_inv is null and (g ->> 'charges')::int >= 1 then 'A splice is ready' end);
end $$;

/** friends' enchantments you could splice with */
create or replace function public.splice_friends() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('friend', private.profile_json(f.other), 'enchantments', f.list)) from (
    select o.other, (select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'serial', x.serial, 'sigil', x.sigil, 'level', x.level, 'nickname', x.nickname) order by x.born_at)
                       from public.enchantments x where x.owner_id = o.other and x.status = 'active' and x.kind <> 'splice' and not private.ench_spliced(x.id)) list
      from (select case when requester_id = v_uid then addressee_id else requester_id end other from public.friendships
             where status = 'accepted' and (requester_id = v_uid or addressee_id = v_uid) limit 60) o) f where f.list is not null), '[]'::jsonb);
end $$;

/** splice invitations sent to you */
create or replace function public.splice_invites() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'from', private.profile_json(i.from_player), 'expires_at', i.expires_at,
             'theirs', private.ench_brief(i.a), 'yours', private.ench_brief(i.b),
             'hybrid', private.ench_hybrid(xa.kind, xb.kind) ->> 0, 'perfect', (private.ench_hybrid(xa.kind, xb.kind) ->> 1)::boolean) order by i.id desc)
    from public.enchant_splice_invites i join public.enchantments xa on xa.id = i.a join public.enchantments xb on xb.id = i.b
   where i.to_player = v_uid and i.status = 'pending' and i.expires_at > now()), '[]'::jsonb);
end $$;

create or replace function public.splice_invite_respond(p_id bigint, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); i public.enchant_splice_invites; x public.enchantments; y public.enchantments; sp public.enchantments; v_h jsonb; v_key text;
begin
  perform private.rate_limit('splice_invite', 60, 3600);
  select * into i from public.enchant_splice_invites where id = p_id for update;
  if i.id is null or i.to_player <> v_uid or i.status <> 'pending' then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into sp from public.enchantments where id = i.splice_id for update;
  if not p_accept or i.expires_at <= now() then
    update public.enchant_splice_invites set status = case when p_accept then 'expired' else 'declined' end, responded_at = now() where id = i.id;
    -- the splicer gets the charge back
    update public.enchantments set state = state || jsonb_build_object('charges', least(2, coalesce((state ->> 'charges')::int, 0) + 1)) where id = i.splice_id;
    perform private.notify(i.from_player, 'enchant', v_uid, jsonb_build_object('sub', 'splice_declined', 'kind', 'splice'));
    return jsonb_build_object('declined', true, 'invites', public.splice_invites());
  end if;
  select * into x from public.enchantments where id = i.a for update;
  select * into y from public.enchantments where id = i.b for update;
  if x.status <> 'active' or y.status <> 'active' or x.owner_id <> i.from_player or y.owner_id <> v_uid or private.ench_spliced(x.id) or private.ench_spliced(y.id)
     or sp.status <> 'active' or exists (select 1 from public.enchant_splices where splice_id = sp.id and ends_at > now()) then
    update public.enchant_splice_invites set status = 'expired', responded_at = now() where id = i.id;
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;
  insert into public.enchant_splices (splice_id, player_id, a, b, ends_at, mode) values (sp.id, i.from_player, x.id, y.id, now() + make_interval(hours => private.ench_n('splice', 'hours', 24)::int), 'friend');
  update public.enchant_splice_invites set status = 'accepted', responded_at = now() where id = i.id;
  v_h := private.ench_hybrid(x.kind, y.kind);
  v_key := least(x.kind, y.kind) || '+' || greatest(x.kind, y.kind);
  update public.enchantments set state = private.splice_codex_add(state, 'codex', v_key) where id = sp.id;
  perform private.ench_stat(sp.id, 'splices');
  perform private.ench_event(sp.id, 'spliced', jsonb_build_object('hybrid', v_h ->> 0, 'a', x.kind, 'b', y.kind, 'mode', 'friend'));
  perform private.ench_event(y.id, 'spliced', jsonb_build_object('hybrid', v_h ->> 0, 'with', x.kind));
  perform private.ench_event(x.id, 'spliced', jsonb_build_object('hybrid', v_h ->> 0, 'with', y.kind));
  perform private.notify(i.from_player, 'enchant', v_uid, jsonb_build_object('sub', 'splice_accepted', 'kind', 'splice', 'hybrid', v_h ->> 0));
  return jsonb_build_object('accepted', true, 'hybrid', v_h ->> 0, 'perfect', v_h -> 1, 'a', x.kind, 'b', y.kind, 'invites', public.splice_invites());
end $$;

-- ---- minigame wins: Giant, Tiny, a Wormhole's echo, a spliced plot, the Oracle's fortune ------------------------------------------
create or replace function private.ench_plot_mult_extra(p_uid uuid, p_gx int, p_gy int) returns numeric language sql stable as $$ select 1::numeric $$;

create or replace function private.ench_minigame_mult(p_uid uuid, p_gx int, p_gy int) returns numeric language plpgsql as $$
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
  for sp in select s.*, e.kind ek from public.enchant_splices s join public.enchantments e on e.id = s.a
             where s.mode = 'plot' and s.ends_at > now() and s.player_id = p_uid
               and ((s.plot_gx = p_gx and s.plot_gy = p_gy)
                    or exists (select 1 from public.canvas_group_members m1 join public.canvas_group_members m2 on m2.group_id = m1.group_id
                                where m1.gx = s.plot_gx and m1.gy = s.plot_gy and m2.gx = p_gx and m2.gy = p_gy)) limit 2 loop
    v_g := private.ench_info(sp.ek) ->> 'gene';
    m := m * case v_g when 'golden' then 1.5 when 'grow' then 2 when 'chaos' then 0.5 + random() * 2 when 'seek' then case when random() < 0.25 then 1.5 else 1 end
                      when 'spread' then 1.15 when 'echo' then case when random() < 0.35 then 2 else 1 end when 'wish' then 1.25 when 'trick' then 1.2
                      when 'tempo' then 1.3 when 'linked' then 1.4 when 'foresight' then 1.2 else 1 end;
  end loop;
  -- the Oracle's fortune for this win
  v_f := private.oracle_take(p_uid, 'reward');
  if v_f is not null then m := m * coalesce((v_f ->> 'mult')::numeric, 1); end if;
  return m * private.ench_plot_mult_extra(p_uid, p_gx, p_gy);
end $$;

-- ---- init, views, titles, the dispatcher -------------------------------------------------------------------------------
create or replace function private.ench_init(p_kind text, t timestamptz) returns jsonb language sql stable as $$
  select case p_kind
    when 'goose' then jsonb_build_object('egg_at', private.ench_ep(t), 'polish', 0, 'chased', '[]'::jsonb, 'eggs', 0, 'streak', 0)
    when 'genie' then jsonb_build_object('wishes', 1, 'charge_at', private.ench_ep(t))
    when 'map' then jsonb_build_object('pieces', '[]'::jsonb, 'next_at', 0)
    when 'parasite' then jsonb_build_object('stage', 0, 'feeds', 0)
    when 'cuckoo' then jsonb_build_object('nests', '[]'::jsonb)
    when 'pandora' then jsonb_build_object('evils', '[]'::jsonb, 'cycle', 0)
    when 'splice' then jsonb_build_object('charges', 1, 'charge_at', private.ench_ep(t), 'codex', '[]'::jsonb)
    when 'clockwork' then jsonb_build_object('charge', 30, 'tick_at', private.ench_ep(t))
    when 'sizeray' then jsonb_build_object('shots', 1, 'shot_at', private.ench_ep(t))
    when 'shard' then jsonb_build_object('cracks', 0, 'options', '[]'::jsonb)
    when 'wormhole' then jsonb_build_object('next_open_at', 0)
    when 'oracle' then jsonb_build_object('charges', 1, 'charge_at', private.ench_ep(t))
    else '{}'::jsonb end
$$;

create or replace function private.ench_kind_view(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
begin
  return case e.kind
    when 'goose' then private.ench_view_goose(e, t) when 'genie' then private.ench_view_genie(e, t) when 'map' then private.ench_view_map(e, t)
    when 'parasite' then private.ench_view_parasite(e, t) when 'cuckoo' then private.ench_view_cuckoo(e, t) when 'pandora' then private.ench_view_pandora(e, t)
    when 'splice' then private.ench_view_splice(e, t) when 'clockwork' then private.ench_view_clockwork(e, t) when 'sizeray' then private.ench_view_sizeray(e, t)
    when 'wormhole' then private.ench_view_wormhole(e, t) when 'oracle' then private.ench_view_oracle(e, t)
    when 'shard' then jsonb_build_object('cracks', coalesce((e.state ->> 'cracks')::int, 0), 'options', coalesce(e.state -> 'options', '[]'::jsonb),
      'reflect', case when coalesce((e.state -> 'reflect' ->> 'until')::numeric, 0) > private.ench_ep(t) then e.state -> 'reflect' end,
      'gaze_in', greatest(0, round(coalesce((e.state ->> 'gazed_at')::numeric, 0) + private.ench_n('shard', 'cooldown_h', 20) * 3600 - private.ench_ep(t))),
      'attention', case when coalesce((e.state -> 'reflect' ->> 'until')::numeric, 0) <= private.ench_ep(t)
                         and (jsonb_array_length(coalesce(e.state -> 'options', '[]'::jsonb)) > 0 or coalesce((e.state ->> 'gazed_at')::numeric, 0) + private.ench_n('shard', 'cooldown_h', 20) * 3600 <= private.ench_ep(t))
                        then 'The shard shows new reflections' end)
  end;
end $$;

-- the Mirror Shard can't reflect the two newest (their power lives on the land: a plot to link, a fate to fix)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.ench_act_shard(public.enchantments,text,jsonb,timestamp with time zone)'::regprocedure);
  n := replace(d, $a$and kind not in ('splice', 'shard') order by kind, random()$a$, $a$and kind not in ('splice', 'shard', 'wormhole', 'oracle') order by kind, random()$a$);
  if n = d then raise exception 'wonders: shard anchor not found'; end if;
  execute n;
end $$;

create or replace function private.ench_titles(e public.enchantments) returns text[] language sql stable as $$
  select array_remove(array[
    case when e.level >= 5 then 'Awakened' end, case when e.level >= 10 then 'Ascended' end,
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
    case when e.kind = 'cuckoo' and coalesce((e.stats ->> 'chicks')::int, 0) >= 5 then 'Brood Mother' end,
    case when e.kind = 'cuckoo' and coalesce((e.stats ->> 'chicks')::int, 0) >= 20 then 'Nest Thief' end,
    case when e.kind = 'pandora' and coalesce((e.stats ->> 'hope')::int, 0) >= 1 then 'Hope-Bringer' end,
    case when e.kind = 'splice' and coalesce((e.stats ->> 'splices')::int, 0) >= 10 then 'Mad Scientist' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'codex', '[]'::jsonb)) >= 36 then 'Chimera Codex' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'codex', '[]'::jsonb)) >= 55 then 'Grand Codex' end,
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
    case when e.kind = 'oracle' and coalesce((e.stats ->> 'rewrites')::int, 0) >= 10 then 'Fate-Weaver' end], null)
$$;

create or replace function private.ench_view(p_id uuid) returns jsonb language plpgsql stable as $$
declare e public.enchantments; t timestamptz; x public.enchantments; v_kind jsonb; v_refl jsonb;
begin
  select * into e from public.enchantments where id = p_id;
  if e.id is null then return null; end if;
  t := private.ench_now(e);
  v_kind := private.ench_kind_view(e, t);
  x := private.ench_reflected(e, t);
  if x.id is not null then v_refl := private.ench_kind_view(x, t); end if;
  return private.ench_brief(e.id) || jsonb_build_object(
    'status', e.status, 'xp', e.xp, 'xp_next', 4 * power(e.level, 2), 'xp_prev', 4 * power(e.level - 1, 2), 'stats', e.stats,
    'owner', private.profile_json(e.owner_id), 'first_owner', private.profile_json(e.first_owner),
    'clock', jsonb_build_object('now', t, 'skip_s', round(e.clock_skip + private.ench_tempo(e.id)),
                                'frozen_until', case when e.frozen_at is not null and now() < e.frozen_until then e.frozen_until end),
    'partner', private.ench_partner(e.id), 'partners', private.ench_partners(e.id), 'size', private.plot_size(e.gx, e.gy),
    'view', v_kind, 'reflected', v_refl, 'reflect_kind', x.kind, 'updated_at', e.updated_at,
    'attention', coalesce(v_refl ->> 'attention', v_kind ->> 'attention'), 'server_time', now());
end $$;

create or replace function public.enchant_act(p_id uuid, p_action text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); e public.enchantments; t timestamptz; x public.enchantments; v jsonb; a jsonb := coalesce(p_args, '{}'::jsonb); sp record;
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
    v := case x.kind
      when 'goose' then private.ench_act_goose(x, p_action, a, t) when 'genie' then private.ench_act_genie(x, p_action, a, t) when 'map' then private.ench_act_map(x, p_action, a, t)
      when 'parasite' then private.ench_act_parasite(x, p_action, a, t) when 'cuckoo' then private.ench_act_cuckoo(x, p_action, a, t) when 'pandora' then private.ench_act_pandora(x, p_action, a, t)
      when 'clockwork' then private.ench_act_clockwork(x, p_action, a, t) when 'sizeray' then private.ench_act_sizeray(x, p_action, a, t) end;
    if v is null then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    update public.enchantments set state = state || jsonb_build_object('r', v -> 'state'), updated_at = now() where id = e.id;
  else
    v := case e.kind
      when 'goose' then private.ench_act_goose(e, p_action, a, t) when 'genie' then private.ench_act_genie(e, p_action, a, t) when 'map' then private.ench_act_map(e, p_action, a, t)
      when 'parasite' then private.ench_act_parasite(e, p_action, a, t) when 'cuckoo' then private.ench_act_cuckoo(e, p_action, a, t) when 'pandora' then private.ench_act_pandora(e, p_action, a, t)
      when 'splice' then private.ench_act_splice(e, p_action, a, t) when 'clockwork' then private.ench_act_clockwork(e, p_action, a, t)
      when 'sizeray' then private.ench_act_sizeray(e, p_action, a, t) when 'shard' then private.ench_act_shard(e, p_action, a, t)
      when 'wormhole' then private.ench_act_wormhole(e, p_action, a, t) when 'oracle' then private.ench_act_oracle(e, p_action, a, t) end;
    -- (an act can rewrite other rows of this enchantment's state — the Oracle fixes a goose's eggs — so only keys the act returns are replaced)
    update public.enchantments set state = v -> 'state', updated_at = now() where id = e.id;
  end if;
  select * into e from public.enchantments where id = p_id;
  if private.ench_titles(e) <> e.titles then
    perform private.ench_event(e.id, 'title', jsonb_build_object('titles', to_jsonb(array(select unnest(private.ench_titles(e)) except select unnest(e.titles)))));
    update public.enchantments set titles = private.ench_titles(e) where id = e.id;
  end if;
  return private.ench_view(e.id) || jsonb_build_object('result', v -> 'result', 'balances', private.balances(v_uid));
end $$;

-- ---- the map: living enchantments, what's wrapped round whose plot, giants and specks, wormholes ---------------------------
create or replace function public.enchant_map(p_min_gx int, p_min_gy int, p_max_gx int, p_max_gy int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if p_max_gx - p_min_gx > 20000 or p_max_gy - p_min_gy > 20000 then
    return jsonb_build_object('plots', '[]'::jsonb, 'attached', '[]'::jsonb, 'giants', '[]'::jsonb, 'sizes', '[]'::jsonb, 'wormholes', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'plots', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'gx', e.gx, 'gy', e.gy, 'kind', e.kind, 'serial', e.serial, 'level', e.level, 'nickname', e.nickname,
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
                      where e.status = 'active' and e.kind in ('parasite', 'cuckoo', 'shard')
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
    'wormholes', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'mine', e.owner_id = v_uid, 'owner_name', pr.username, 'until', (e.state -> 'open' ->> 'until')::numeric,
                        'ends', private.wormhole_ends(e)))
                       from public.enchantments e left join public.profiles pr on pr.id = e.owner_id
                      where e.kind = 'wormhole' and e.status = 'active' and coalesce((e.state -> 'open' ->> 'until')::numeric, 0) > extract(epoch from now())
                        and ((e.gx between p_min_gx and p_max_gx and e.gy between p_min_gy and p_max_gy)
                             or ((e.state -> 'open' ->> 'gx2')::int between p_min_gx and p_max_gx and (e.state -> 'open' ->> 'gy2')::int between p_min_gy and p_max_gy)
                             or ((e.state -> 'open' ->> 'gx3')::int between p_min_gx and p_max_gx and (e.state -> 'open' ->> 'gy3')::int between p_min_gy and p_max_gy))), '[]'::jsonb));
end $$;

/** the whole world at a glance: every giant plot and every open wormhole (for the zoomed-out map) */
create or replace function public.enchant_world() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'giants', coalesce((select jsonb_agg(jsonb_build_object('gx', b.gx, 'gy', b.gy, 'mult', b.mult, 'until', b.expires_at, 'rarity', w.rarity, 'owner_name', pr.username, 'mine', b.player_id = auth.uid(),
                                                         'prank', coalesce((b.data ->> 'prank')::boolean, false), 'by_name', b.data ->> 'by_name'))
                         from (select * from public.enchant_buffs where kind = 'plot_giant' and expires_at > now() order by id desc limit 400) b
                         left join public.world_plots w on w.gx = b.gx and w.gy = b.gy left join public.profiles pr on pr.id = b.player_id), '[]'::jsonb),
    'wormholes', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'mine', e.owner_id = auth.uid(), 'ends', private.wormhole_ends(e)))
                            from (select * from public.enchantments where kind = 'wormhole' and status = 'active' and coalesce((state -> 'open' ->> 'until')::numeric, 0) > extract(epoch from now()) limit 300) e), '[]'::jsonb))
$$;

create or replace function public.enchant_visitors() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
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
     where e.status = 'active' and e.kind in ('parasite', 'cuckoo', 'shard')
       and ((st -> 'host' ->> 'owner') = v_uid::text or (st -> 'egg' ->> 'owner') = v_uid::text)) x), '[]'::jsonb);
end $$;

create or replace function public.enchant_bestiary() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  return jsonb_build_object('kinds', (select jsonb_agg(private.ench_info(k) || jsonb_build_object('kind', k,
             'population', (select count(*) from public.enchantments where kind = k and status <> 'gone'),
             'minted', coalesce((select n from private.enchant_serials where kind = k), 0),
             'mine', (select count(*) from public.enchantments where kind = k and status = 'active' and owner_id = v_uid)) order by o)
           from unnest(private.ench_kinds()) with ordinality u(k, o)),
    'codex', coalesce((select jsonb_agg(distinct c) from public.enchantments e cross join lateral jsonb_array_elements_text(coalesce(e.state -> 'codex', '[]'::jsonb)) c
                       where e.owner_id = v_uid and e.kind = 'splice'), '[]'::jsonb),
    'trinities', coalesce((select jsonb_agg(distinct c) from public.enchantments e cross join lateral jsonb_array_elements_text(coalesce(e.state -> 'trinities', '[]'::jsonb)) c
                       where e.owner_id = v_uid and e.kind = 'splice'), '[]'::jsonb),
    'plots', coalesce((select jsonb_agg(distinct c) from public.enchantments e cross join lateral jsonb_array_elements_text(coalesce(e.state -> 'plots', '[]'::jsonb)) c
                       where e.owner_id = v_uid and e.kind = 'splice'), '[]'::jsonb),
    'aberrations', coalesce((select jsonb_agg(distinct c) from public.enchantments e cross join lateral jsonb_array_elements_text(coalesce(e.state -> 'aberrations', '[]'::jsonb)) c
                       where e.owner_id = v_uid and e.kind = 'splice'), '[]'::jsonb),
    'aberrations_total', 6,
    'chance', (select jsonb_build_object('base', coalesce((private.ench_cfg() ->> 'base_pct')::numeric, 2),
                 'charges', coalesce((select enchant from public.player_luck where player_id = v_uid), 0),
                 'step', coalesce((private.ench_cfg() ->> 'luck_pct')::numeric, 2))));
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.size_giant_visit(integer, integer)', 'public.splice_friends()', 'public.splice_invites()', 'public.splice_invite_respond(bigint, boolean)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  execute 'grant execute on function public.enchant_world() to anon, authenticated';
end $$;
