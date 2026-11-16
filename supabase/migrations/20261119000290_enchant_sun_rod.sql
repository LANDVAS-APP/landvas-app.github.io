-- Enchantments, part 9: two leave, two arrive — still twenty.
--
--  🐍 Ouroboros  gone. A coil that's running lets go and pays its bank (a closed circle picks its Aberration first);
--                every Ouroboros straightens into a 🪄 Dowsing Rod — level, XP, Stars, nickname and chronicle kept.
--  🧫 Homunculus gone. One that's awake melts into its heart now (paid in full); every Homunculus's heart lights up
--                into a ☀️ Pocket Sun — level, XP, Stars, nickname and chronicle kept.
--                Running splices with either end and give their charge back; the Endless and Patchwork Traits go,
--                and their hybrids leave every Codex.
--
--  ☀️ Pocket Sun  your own mini Hot Zone. Flick the orb onto the map (within 2 km of you or your plots): a private
--                Hot Zone 150 m across at level 1, up to 400 m at level 10, burning 6 h, once a day.
--                Inside it, for you: ultras ×2 (Warm), ×3 (Hot, 25% smaller), ×4 (White-hot, half the size, burns
--                twice as fast); shinies ×2; three sunspots that roll a tier higher. Rub to stoke it (past 95 heat a rub
--                can snuff it out). Daily Solar Flare: a ring sweeps out, tap as it peaks — 60–120 s where every claim
--                inside keeps the better of two rolls. Orbit mode: parked over your plots, their minigames pay ×1.25
--                and your enchantments there tick 10% faster. Conjunction with the daily Hot Zone multiplies (capped at
--                ultras ×8). Share with your party: they claim inside at half the boost, you get +3 Ink a claim.
--                Trait Radiant: the partner's plot gets a tiny sun of its own and its timers run faster.
--                Leviathan move Sunburst: everyone's hits ×1.5 for 30 s.
--  🪄 Dowsing Rod tune it to a target — a rarity (Uncommon–Mythic), Shiny, any Ultra, one Ultra, Enchanted or one
--                kind. While tuned, rolling that target is harder (½ the natural chance; ⅓ for a specific Ultra or
--                kind) — but every roll that misses pushes the rod deeper, and at full depth the next roll IS the
--                target. Full depth = 3× the target's natural expected wait (4× for specific picks). Anything better
--                is still yours. A slip (a natural hit the rod held back) pushes it 10% deeper.
--                Trait Divining: the same on the partner's own luck. Leviathan move Divine: +20% for 20 s, and it
--                can't hide.
-- Every number is a setting: game_config 'enchantments' → sun / rod (private.ench_n).

-- ---- kinds (the old two are allowed until they've been turned into the new) ------------------------------------------
alter table public.enchantments drop constraint if exists enchantments_kind_check;
alter table public.enchantments add constraint enchantments_kind_check
  check (kind in ('goose', 'genie', 'map', 'parasite', 'cuckoo', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard', 'wormhole', 'oracle',
                  'ouroboros', 'homunculus', 'stormcoil', 'spyglass', 'origami', 'crucible', 'puppeteer', 'deck', 'glyph', 'sun', 'rod'));
update public.game_config set value = jsonb_set(value, '{weights}', ('{"sun": 1, "rod": 1}'::jsonb || coalesce(value -> 'weights', '{}'::jsonb)) - 'ouroboros' - 'homunculus')
 where key = 'enchantments';

alter table public.leviathans add column if not exists sunburst_until timestamptz;
alter table public.leviathans add column if not exists divined_until timestamptz;

-- ---- the roster -------------------------------------------------------------------------------------------------------
create or replace function private.ench_kinds() returns text[] language sql immutable as $$
  select array['goose', 'genie', 'map', 'parasite', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard', 'wormhole', 'oracle',
               'stormcoil', 'spyglass', 'origami', 'crucible', 'puppeteer', 'deck', 'glyph', 'sun', 'rod']
$$;

create or replace function private.ench_info(p_kind text) returns jsonb language sql immutable as $$
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
    when 'stormcoil' then '{"name": "Storm Coil", "emoji": "⚡", "gene": "charged", "gene_name": "Charged"}'
    when 'spyglass' then '{"name": "Spyglass", "emoji": "🔭", "gene": "farsight", "gene_name": "Farsight"}'
    when 'origami' then '{"name": "Origami Pocket", "emoji": "🦢", "gene": "folded", "gene_name": "Folded"}'
    when 'crucible' then '{"name": "Crucible", "emoji": "🔥", "gene": "trick", "gene_name": "Tempered"}'
    when 'puppeteer' then '{"name": "Puppeteer", "emoji": "🎭", "gene": "strings", "gene_name": "Strings"}'
    when 'deck' then '{"name": "Fated Deck", "emoji": "🃏", "gene": "fated", "gene_name": "Fated"}'
    when 'glyph' then '{"name": "Glyphcaster", "emoji": "✍️", "gene": "inscribed", "gene_name": "Inscribed"}'
    when 'sun' then '{"name": "Pocket Sun", "emoji": "☀️", "gene": "radiant", "gene_name": "Radiant"}'
    when 'rod' then '{"name": "Dowsing Rod", "emoji": "🪄", "gene": "divining", "gene_name": "Divining"}'
  end::jsonb
$$;

create or replace function private.ench_init(p_kind text, t timestamptz) returns jsonb language sql stable as $$
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
    when 'stormcoil' then jsonb_build_object('charge', 30)
    when 'spyglass' then jsonb_build_object('looks', 3, 'look_at', private.ench_ep(t))
    when 'origami' then jsonb_build_object('folds', 1, 'fold_at', private.ench_ep(t))
    when 'crucible' then jsonb_build_object('heat', 0, 'metal', '{}'::jsonb, 'runes', '{}'::jsonb)
    when 'puppeteer' then jsonb_build_object('strings', 2, 'string_at', private.ench_ep(t))
    when 'deck' then jsonb_build_object('picked', 0)
    when 'glyph' then jsonb_build_object('mana', 5, 'mana_at', private.ench_ep(t), 'known', '["spiral", "star", "triangle"]'::jsonb)
    when 'sun' then jsonb_build_object('zones', '[]'::jsonb, 'day', null, 'lit', 0)
    when 'rod' then jsonb_build_object('targets', '[]'::jsonb)
    else '{}'::jsonb end
$$;

create or replace function private.ench_hatchable() returns text[] language sql immutable as $$
  select array['spyglass', 'origami', 'crucible', 'puppeteer', 'deck', 'glyph', 'sun', 'rod']
$$;
create or replace function private.ench_reaches(p_kind text) returns boolean language sql immutable as $$
  select p_kind in ('map', 'wormhole', 'puppeteer', 'spyglass', 'origami', 'stormcoil', 'glyph', 'sun', 'rod')
$$;
create or replace function private.rune_of(p_kind text) returns text language sql immutable as $$
  select coalesce(('{"goose": "moon", "genie": "star", "map": "anchor", "parasite": "eye", "pandora": "wave", "splice": "key", "clockwork": "arrow",
    "sizeray": "triangle", "shard": "eye", "wormhole": "hourglass", "oracle": "moon", "stormcoil": "bolt",
    "spyglass": "star", "origami": "triangle", "crucible": "anchor", "puppeteer": "arrow", "deck": "star", "glyph": "wave", "cuckoo": "star",
    "sun": "star", "rod": "arrow"}'::jsonb) ->> p_kind, 'star')
$$;
create or replace function private.ench_word(p_kind text, p_part text) returns text language sql immutable as $$
  select ('{"goose": ["Golden", "Hen"], "genie": ["Wishing", "Djinn"], "map": ["Treasure", "Atlas"], "parasite": ["Hungering", "Worm"],
           "pandora": ["Cursed", "Box"], "clockwork": ["Ticking", "Engine"], "sizeray": ["Giant", "Titan"],
           "shard": ["Mirrored", "Glass"], "wormhole": ["Warped", "Gate"], "oracle": ["All-Seeing", "Eye"], "splice": ["Spliced", "Chimera"],
           "stormcoil": ["Charged", "Storm"], "spyglass": ["Far-Seeing", "Spyglass"], "origami": ["Folded", "Crane"], "crucible": ["Molten", "Anvil"],
           "puppeteer": ["Strung", "Marionette"], "deck": ["Fated", "Card"], "glyph": ["Runic", "Glyph"],
           "sun": ["Radiant", "Sun"], "rod": ["Divining", "Wand"]}'::jsonb
          -> p_kind ->> case when p_part = 'adj' then 0 else 1 end)
$$;

-- the hybrids: the serpent's and the flask's go, the sun's and the rod's come (171 in all, 33 Perfect Matches)
do $$
declare v jsonb;
begin
  select jsonb_object_agg(k, x) into v from jsonb_each(private.ench_hybrids()) h(k, x) where k not like '%ouroboros%' and k not like '%homunculus%';
  v := v || '{"goose+sun": ["Sunrise Goose", false], "genie+sun": ["Djinn of Noon", false], "map+sun": ["Sunstone Map", false], "parasite+sun": ["Sunworm", false],
         "pandora+sun": ["Box of Dawn", false], "clockwork+sun": ["Sundial", true], "sizeray+sun": ["Solar Lens", false], "shard+sun": ["Burning Glass", false],
         "sun+wormhole": ["Solar Gate", false], "oracle+sun": ["Eye of Dawn", false], "stormcoil+sun": ["Solar Storm", true], "spyglass+sun": ["Heliograph", false],
         "origami+sun": ["Paper Lantern", false], "crucible+sun": ["Sunforge", true], "puppeteer+sun": ["Shadow Play", false], "deck+sun": ["The Sun Card", true],
         "glyph+sun": ["Sun Rune", false], "rod+sun": ["Sunwell", true],
         "goose+rod": ["Water-Witch Goose", false], "genie+rod": ["Djinn of Wells", false], "map+rod": ["Divining Map", true], "parasite+rod": ["Root Worm", false],
         "pandora+rod": ["Wishing-Well Box", false], "clockwork+rod": ["Water Clock", false], "rod+sizeray": ["Giant’s Staff", false], "rod+shard": ["Scrying Pool", false],
         "rod+wormhole": ["Deep Gate", false], "oracle+rod": ["Oracle’s Well", false], "rod+stormcoil": ["Lightning Rod", true], "rod+spyglass": ["Prospector’s Glass", false],
         "origami+rod": ["Paper Compass", false], "crucible+rod": ["Ore Finder", false], "puppeteer+rod": ["Marionette Cross", false], "deck+rod": ["Wand Card", false],
         "glyph+rod": ["Rune Wand", false]}'::jsonb;
  execute format('create or replace function private.ench_hybrids() returns jsonb language sql immutable as %L', 'select ' || quote_literal(v::text) || '::jsonb');
end $$;

-- ---- the Ouroboros and the Homunculus leave ---------------------------------------------------------------------------
do $$
declare r record; v jsonb; v_lv int; v_glow boolean; v_luck int; v_serial int;
begin
  -- a running coil lets go: its bank is paid (a closed circle that's waiting picks its Aberration first)
  for r in select * from public.enchantments where kind = 'ouroboros' and jsonb_typeof(state -> 'coil') = 'object' loop
    begin
      if r.state -> 'coil' ->> 'status' = 'closed' then
        perform private.ouro_close(r.id, (private.ench_aberrations())[1 + floor(random() * 6)::int]);
      else
        update public.enchant_splices set data = data - 'coil_by' where id in (select x::bigint from jsonb_array_elements_text(r.state -> 'coil' -> 'rows') x);
        if r.owner_id is not null then perform private.ench_pay(r.id, coalesce((r.state -> 'coil' ->> 'bank')::numeric, 0), 'the circle let go'); end if;
      end if;
    exception when others then raise warning 'ouroboros %: %', r.id, sqlerrm; end;
  end loop;
  update public.enchant_splices set data = data - 'coil_by' - 'coil_k' where data ? 'coil_by' or data ? 'coil_k';
  -- an awake Homunculus melts into its heart now, paid in full
  for r in select * from public.enchantments where kind = 'homunculus' and jsonb_typeof(state -> 'awake') = 'object' and owner_id is not null loop
    begin
      select coalesce(sum(least(3, greatest(1, coalesce((p ->> 'lv')::int, 1)))), 0)::int, coalesce(bool_or(coalesce((p ->> 'glow')::boolean, false)), false)
        into v_lv, v_glow from jsonb_array_elements(coalesce(r.state -> 'parts', '[]'::jsonb)) p;
      perform private.ench_pay(r.id, (private.ench_n('homunculus', 'heart_ink', 80) + 30 * v_lv + 2 * coalesce((r.state -> 'awake' ->> 'greets')::int, 0)) * case when r.stars >= 3 then 2 else 1 end, 'the Homunculus’s heart');
      v_luck := 1 + case when v_glow then 1 else 0 end + case when r.stars >= 3 then 1 else 0 end;
      perform private.ench_give_luck(r.owner_id, 0, v_luck);
      perform private.splice_spark(r.owner_id, 'heart');
    exception when others then raise warning 'homunculus %: %', r.id, sqlerrm; end;
  end loop;
  -- running splices with either in them end, and give their charge back (once per group)
  for r in select distinct on (coalesce(sp.grp::text, sp.id::text)) sp.* from public.enchant_splices sp
             join public.enchantments e on e.id = sp.a or e.id = sp.b
            where e.kind in ('ouroboros', 'homunculus') and sp.ends_at > now() loop
    update public.enchant_splices set ends_at = now() where (grp is not distinct from r.grp and r.grp is not null) or id = r.id;
    if r.splice_id is not null then
      update public.enchantments set state = state || jsonb_build_object('bonus', least(6, coalesce((state ->> 'bonus')::int, 0) + 1)) where id = r.splice_id and kind = 'splice';
    end if;
  end loop;
  -- the serpent straightens into a rod; the heart lights up into a sun
  for r in select * from public.enchantments where kind in ('ouroboros', 'homunculus') loop
    insert into private.enchant_serials (kind, n) values (case when r.kind = 'ouroboros' then 'rod' else 'sun' end, 1)
      on conflict (kind) do update set n = private.enchant_serials.n + 1 returning n into v_serial;
    update public.enchantments
       set kind = case when r.kind = 'ouroboros' then 'rod' else 'sun' end, serial = v_serial,
           state = private.ench_init(case when r.kind = 'ouroboros' then 'rod' else 'sun' end, now()),
           titles = array(select x from unnest(titles) x where x not in ('Eternal', 'Tail-Catcher', 'Snakeskin', 'Alchemist', 'Generations', 'Many Limbs')),
           stats = jsonb_build_object('hatched_from', r.kind) || (stats - 'circles' - 'clean' - 'bites' - 'coils' - 'wakes' - 'hearts' - 'max_parts' - 'boosts'),
           updated_at = now()
     where id = r.id;
    perform private.ench_event(r.id, 'became', jsonb_build_object('from', r.kind, 'kind', case when r.kind = 'ouroboros' then 'rod' else 'sun' end, 'serial', v_serial));
    if r.owner_id is not null and r.status = 'active' then
      perform private.notify(r.owner_id, 'enchant', null, jsonb_build_object('sub', 'became', 'from', r.kind, 'kind', case when r.kind = 'ouroboros' then 'rod' else 'sun' end, 'id', r.id));
    end if;
  end loop;
  -- their hybrids leave every Codex
  update public.enchantments set state = state
      || jsonb_build_object('codex', coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(state -> 'codex', '[]'::jsonb)) x where x::text not like '%ouroboros%' and x::text not like '%homunculus%'), '[]'::jsonb))
      || case when state ? 'trinities' then jsonb_build_object('trinities', coalesce((select jsonb_agg(x) from jsonb_array_elements(state -> 'trinities') x where x::text not like '%ouroboros%' and x::text not like '%homunculus%'), '[]'::jsonb)) else '{}'::jsonb end
      || case when state ? 'quads' then jsonb_build_object('quads', coalesce((select jsonb_agg(x) from jsonb_array_elements(state -> 'quads') x where x::text not like '%ouroboros%' and x::text not like '%homunculus%'), '[]'::jsonb)) else '{}'::jsonb end
   where kind = 'splice' and (state::text like '%ouroboros%' or state::text like '%homunculus%');
  -- a Mirror Shard that was dreaming of either wakes up
  update public.enchantments set state = state || jsonb_build_object('options', '[]'::jsonb)
   where kind = 'shard' and state -> 'options' @? '$[*] ? (@.kind == "ouroboros" || @.kind == "homunculus")';
end $$;

alter table public.enchantments drop constraint if exists enchantments_kind_check;
alter table public.enchantments add constraint enchantments_kind_check
  check (kind in ('goose', 'genie', 'map', 'parasite', 'cuckoo', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard', 'wormhole', 'oracle',
                  'stormcoil', 'spyglass', 'origami', 'crucible', 'puppeteer', 'deck', 'glyph', 'sun', 'rod'));

-- ---- small shared pieces ---------------------------------------------------------------------------------------------
/** the owner's active enchantments wearing a Trait right now, with its strength */
create or replace function private.gene_wearers(p_owner uuid, p_gene text) returns table(id uuid, kind text, gx int, gy int, k int) language sql stable as $$
  select e.id, e.kind, e.gx, e.gy, private.ench_has_gene(e.id, p_gene)
    from public.enchantments e
   where e.owner_id = p_owner and e.status = 'active'
     and exists (select 1 from public.enchant_splices s where (s.a = e.id or s.b = e.id) and s.started_at <= now() and s.ends_at > now())
     and private.ench_has_gene(e.id, p_gene) > 0
$$;
/** a player's party-mates (everyone sharing a party with them) */
create or replace function private.party_mates(p_uid uuid) returns uuid[] language sql stable as $$
  select coalesce(array_agg(distinct m2.player_id), '{}') from public.travel_group_members m1
    join public.travel_group_members m2 on m2.group_id = m1.group_id
   where m1.player_id = p_uid and m2.player_id <> p_uid
$$;
/** a kind's share of the enchanted rolls (by the owner's weights) */
create or replace function private.ench_kind_share(p_kind text) returns numeric language sql stable as $$
  select greatest(coalesce((w ->> p_kind)::numeric, 1), 0) / nullif((select sum(greatest(coalesce((w ->> k)::numeric, 1), 0)) from unnest(private.ench_kinds()) k), 0)
  from (select coalesce(private.ench_cfg() -> 'weights', '{}'::jsonb) w) x
$$;
/** a random free cell within p_m metres of a cell (none: null) */
create or replace function private.free_cell_within(p_gx int, p_gy int, p_m numeric) returns int[] language plpgsql as $$
declare i int; a float8; d float8; x int; y int; v_cells numeric := greatest(1, p_m / 3.2);
begin
  for i in 1 .. 40 loop
    a := random() * 2 * pi(); d := sqrt(random()) * v_cells;
    x := (p_gx + round(cos(a) * d)::int + 4194304) % 4194304; y := least(greatest(p_gy + round(sin(a) * d)::int, 0), 4194303);
    continue when private.ench_cell_m(p_gx, p_gy, x, y) > p_m;
    if not exists (select 1 from public.world_plots where gx = x and gy = y and (owner_id is not null or locked)) then return array[x, y]; end if;
  end loop;
  return null;
end $$;

-- ---- ☀️ the Pocket Sun ------------------------------------------------------------------------------------------------
/** a zone as it is right now: heat cools 6 an hour (never below 30), fuel burns twice as fast while white-hot */
create or replace function private.sun_zone(z jsonb, p_ep numeric) returns jsonb language plpgsql stable as $$
declare v_h0 numeric; v_dt numeric; v_heat numeric; v_tier text; v_used numeric; v_w numeric; v_left numeric; v_r numeric; v_until numeric; v_white numeric;
begin
  if z is null or jsonb_typeof(z) <> 'object' then return null; end if;
  v_h0 := coalesce((z ->> 'heat')::numeric, 30);
  v_dt := greatest(0, p_ep - coalesce((z ->> 'heat_at')::numeric, p_ep));
  v_heat := case when v_h0 <= 30 then v_h0 else greatest(30, v_h0 - 6 * v_dt / 3600) end;
  -- white-hot for the first (heat − 90) / 6 hours of the stretch
  v_w := case when v_h0 >= 90 then least(v_dt, (v_h0 - 90) / 6 * 3600) else 0 end;
  v_used := 2 * v_w + (v_dt - v_w);
  v_left := coalesce((z ->> 'fuel')::numeric, 0) - v_used;
  v_tier := case when v_heat >= 90 then 'white' when v_heat >= 50 then 'hot' else 'warm' end;
  v_r := coalesce((z ->> 'r0')::numeric, 150) * case v_tier when 'white' then 0.5 when 'hot' then 0.75 else 1 end;
  v_white := case when v_heat >= 90 then (v_heat - 90) / 6 * 3600 else 0 end;
  v_until := case when v_left <= 0 then p_ep when v_left <= 2 * v_white then p_ep + v_left / 2 else p_ep + v_white + (v_left - 2 * v_white) end;
  return z || jsonb_build_object('heat_now', round(v_heat, 1), 'tier', v_tier, 'r_m', round(v_r),
    'mult', case v_tier when 'white' then private.ench_n('sun', 'white_x', 4) when 'hot' then private.ench_n('sun', 'hot_x', 3) else private.ench_n('sun', 'warm_x', 2) end,
    'left_s', round(greatest(v_left, 0)), 'until', round(v_until), 'alive', v_left > 0 and not coalesce((z ->> 'out')::boolean, false),
    'flare', coalesce((z ->> 'flare_until')::numeric, 0) > p_ep);
end $$;

/** settle every zone at this moment (so heat and fuel can change from here), dropping the burnt-out ones */
create or replace function private.sun_settle(p_zones jsonb, p_ep numeric) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg((zz - 'heat_now' - 'tier' - 'r_m' - 'mult' - 'left_s' - 'until' - 'alive' - 'flare')
           || jsonb_build_object('heat', zz -> 'heat_now', 'heat_at', p_ep, 'fuel', zz -> 'left_s', 'fuel_at', p_ep)), '[]'::jsonb)
    from (select private.sun_zone(z, p_ep) zz from jsonb_array_elements(coalesce(p_zones, '[]'::jsonb)) z) x
   where (zz ->> 'alive')::boolean
$$;

create or replace function private.sun_eval(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare v_ep numeric := extract(epoch from now()); v_day text := private.today()::text; v_lit int; v_per int; v_max int; v_zs jsonb;
begin
  v_lit := case when e.state ->> 'day' = v_day then coalesce((e.state ->> 'lit')::int, 0) else 0 end;
  v_per := private.ench_n('sun', 'per_day', 1)::int + case when e.stars >= 3 then 1 else 0 end;
  v_max := 1 + case when e.stars >= 3 then 1 else 0 end;
  select coalesce(jsonb_agg(private.sun_zone(z, v_ep) order by (z ->> 'i')::int), '[]'::jsonb) into v_zs
    from jsonb_array_elements(coalesce(e.state -> 'zones', '[]'::jsonb)) z where (private.sun_zone(z, v_ep) ->> 'alive')::boolean;
  return jsonb_build_object('zones', v_zs, 'lit_today', v_lit, 'per_day', v_per, 'max_zones', v_max,
    'ignites_left', greatest(0, v_per - v_lit), 'can_ignite', v_lit < v_per and jsonb_array_length(v_zs) < v_max,
    'range_m', round(private.ench_n('sun', 'range_m', 2000) * private.ench_reach(e.id)),
    'r0', round((private.ench_n('sun', 'r_min', 150) + (private.ench_n('sun', 'r_max', 400) - private.ench_n('sun', 'r_min', 150)) * (least(e.level, 10) - 1) / 9.0)
                * case when e.stars >= 1 then 1.5 else 1 end),
    'fuel_h', private.ench_n('sun', 'fuel_h', 6) * case when e.stars >= 2 then 2 else 1 end,
    'flare_ready', coalesce(e.state ->> 'flare_day', '') <> v_day and jsonb_array_length(v_zs) > 0,
    'next_day_in', greatest(0, round(extract(epoch from private.day_start(now()) + interval '1 day' - now()))));
end $$;

create or replace function private.ench_view_sun(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare g jsonb := private.sun_eval(e, t); c record; v_party boolean;
begin
  select * into c from private.explorer_now(e.owner_id);
  v_party := cardinality(private.party_mates(e.owner_id)) > 0;
  return g || jsonb_build_object('explorer', case when c.gx is not null then jsonb_build_array(c.gx, c.gy) end, 'in_party', v_party,
    'hot_zone', private.hot_zone(private.today()), 'last', e.state -> 'last',
    'ignites', coalesce((e.stats ->> 'ignites')::int, 0), 'sun_claims', coalesce((e.stats ->> 'sun_claims')::int, 0), 'sunspots', coalesce((e.stats ->> 'sunspots')::int, 0),
    'conjunction', exists (select 1 from jsonb_array_elements(g -> 'zones') z where private.in_hot_zone((z ->> 'gx')::int, (z ->> 'gy')::int)),
    'attention', case when (g ->> 'can_ignite')::boolean then 'Ready to light' when (g ->> 'flare_ready')::boolean then 'A Solar Flare is ready' end);
end $$;

create or replace function private.ench_act_sun(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; g jsonb := private.sun_eval(e, t); r jsonb; v_ep numeric := extract(epoch from now()); v_day text := private.today()::text;
  zs jsonb; z jsonb; v_gx int; v_gy int; v_i int; v_idx int; v_n int; v_heat numeric; v_out boolean := false; v_spots jsonb := '[]'::jsonb; v_c int[];
  v_err numeric; v_grade text; v_secs int; v_mode text; k int;
begin
  zs := private.sun_settle(s -> 'zones', v_ep);
  -- which zone (by its number), else the first one burning
  v_i := nullif(a ->> 'i', '')::int;
  select (o - 1)::int into v_idx from jsonb_array_elements(zs) with ordinality x(zz, o) where v_i is null or (zz ->> 'i')::int = v_i order by o limit 1;
  case p_action
    when 'ignite' then
      v_gx := (a ->> 'gx')::int; v_gy := (a ->> 'gy')::int;
      if v_gx is null or v_gy is null or v_gx not between 0 and 4194303 or v_gy not between 0 and 4194303 then raise exception 'invalid_plot' using errcode = 'P0001'; end if;
      if not (g ->> 'can_ignite')::boolean then
        if (g ->> 'ignites_left')::int < 1 then raise exception 'no_ignites' using errcode = 'P0001'; end if;
        raise exception 'sun_burning' using errcode = 'P0001';
      end if;
      if not private.spy_in_range(e.owner_id, v_gx, v_gy, (g ->> 'range_m')::numeric) then raise exception 'out_of_range' using errcode = 'P0001'; end if;
      v_mode := case when a ->> 'mode' = 'orbit' then 'orbit' else 'claim' end;
      for k in 1 .. private.ench_n('sun', 'sunspots', 3)::int loop
        v_c := private.free_cell_within(v_gx, v_gy, (g ->> 'r0')::numeric * 0.8);
        if v_c is not null and not v_spots @> jsonb_build_array(jsonb_build_array(v_c[1], v_c[2])) then v_spots := v_spots || jsonb_build_array(jsonb_build_array(v_c[1], v_c[2])); end if;
      end loop;
      z := jsonb_build_object('i', coalesce((e.stats ->> 'ignites')::int, 0) + 1, 'gx', v_gx, 'gy', v_gy, 'r0', (g ->> 'r0')::numeric, 'lit_at', v_ep,
             'fuel', (g ->> 'fuel_h')::numeric * 3600, 'fuel_at', v_ep, 'heat', 30, 'heat_at', v_ep, 'mode', v_mode,
             'party', coalesce((a ->> 'party')::boolean, false), 'spots', v_spots, 'claims', 0, 'warm_at', v_ep);
      zs := zs || jsonb_build_array(z);
      s := s || jsonb_build_object('zones', zs, 'day', v_day, 'lit', (g ->> 'lit_today')::int + 1);
      perform private.ench_stat(e.id, 'ignites');
      perform private.ench_xp(e.id, 1);
      perform private.fairplay(e.owner_id, 'sun_ignite', v_gx, v_gy, jsonb_build_object('enchant', e.id, 'mode', v_mode));
      perform private.ench_event(e.id, 'ignited', jsonb_build_object('gx', v_gx, 'gy', v_gy, 'r', round((g ->> 'r0')::numeric), 'mode', v_mode));
      r := jsonb_build_object('zone', private.sun_zone(z, v_ep));
    when 'stoke' then
      if v_idx is null then raise exception 'no_sun' using errcode = 'P0001'; end if;
      z := zs -> v_idx;
      v_n := least(greatest(coalesce((a ->> 'n')::int, 1), 1), 6);
      v_heat := coalesce((z ->> 'heat')::numeric, 30);
      for k in 1 .. v_n loop
        v_heat := least(100, v_heat + private.ench_n('sun', 'stoke_heat', 7));
        if v_heat > 95 and random() < private.ench_n('sun', 'snuff_pct', 0.12) then v_out := true; exit; end if;
      end loop;
      perform private.ench_stat(e.id, 'stokes', v_n);
      if v_out then
        zs := zs - v_idx;
        s := s || jsonb_build_object('zones', zs, 'last', jsonb_build_object('end', 'snuffed', 'i', z -> 'i', 'at', v_ep));
        perform private.ench_stat(e.id, 'snuffed');
        perform private.ench_event(e.id, 'snuffed', jsonb_build_object('i', z -> 'i'));
        r := jsonb_build_object('snuffed', true, 'heat', v_heat);
      else
        z := z || jsonb_build_object('heat', v_heat, 'heat_at', v_ep);
        if v_heat >= 90 then perform private.ench_stat(e.id, 'white_hot'); end if;
        zs := jsonb_set(zs, array[v_idx::text], z);
        s := s || jsonb_build_object('zones', zs);
        r := jsonb_build_object('zone', private.sun_zone(z, v_ep), 'heat', v_heat);
      end if;
    when 'aim' then
      -- the flare: a ring sweeps out and peaks 1.6 s from now (the server keeps the time)
      if coalesce(s ->> 'flare_day', '') = v_day then raise exception 'already_today' using errcode = 'P0001'; end if;
      if jsonb_array_length(zs) = 0 then raise exception 'no_sun' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('zones', zs, 'ring_at', v_ep + 1.6);
      r := jsonb_build_object('ring_at', v_ep + 1.6, 'server_now', v_ep);
    when 'flare' then
      if s ->> 'ring_at' is null or v_ep > (s ->> 'ring_at')::numeric + 3 then raise exception 'no_ring' using errcode = 'P0001'; end if;
      if coalesce(s ->> 'flare_day', '') = v_day then raise exception 'already_today' using errcode = 'P0001'; end if;
      v_err := abs(v_ep - (s ->> 'ring_at')::numeric);
      v_grade := case when v_err <= 0.15 then 'PERFECT' when v_err <= 0.35 then 'GREAT' when v_err <= 0.7 then 'GOOD' else 'WIDE' end;
      v_secs := case v_grade when 'PERFECT' then 120 when 'GREAT' then 90 when 'GOOD' then 75 else 60 end;
      select coalesce(jsonb_agg(zz || jsonb_build_object('flare_until', v_ep + v_secs)), '[]'::jsonb) into zs from jsonb_array_elements(zs) zz;
      s := s || jsonb_build_object('zones', zs, 'flare_day', v_day, 'ring_at', null);
      perform private.ench_stat(e.id, 'flares');
      if v_grade = 'PERFECT' then perform private.ench_stat(e.id, 'perfect_flares'); end if;
      perform private.ench_xp(e.id, case when v_grade = 'PERFECT' then 2 else 1 end);
      perform private.ench_event(e.id, 'flared', jsonb_build_object('grade', v_grade, 's', v_secs));
      r := jsonb_build_object('grade', v_grade, 'secs', v_secs, 'err', round(v_err, 3), 'flare_until', v_ep + v_secs);
    when 'mode' then
      if v_idx is null then raise exception 'no_sun' using errcode = 'P0001'; end if;
      v_mode := case when a ->> 'mode' = 'orbit' then 'orbit' else 'claim' end;
      zs := jsonb_set(zs, array[v_idx::text], (zs -> v_idx) || jsonb_build_object('mode', v_mode, 'warm_at', v_ep));
      s := s || jsonb_build_object('zones', zs);
      r := jsonb_build_object('mode', v_mode);
    when 'share' then
      if v_idx is null then raise exception 'no_sun' using errcode = 'P0001'; end if;
      zs := jsonb_set(zs, array[v_idx::text], (zs -> v_idx) || jsonb_build_object('party', coalesce((a ->> 'on')::boolean, true)));
      s := s || jsonb_build_object('zones', zs);
      r := jsonb_build_object('party', coalesce((a ->> 'on')::boolean, true));
    when 'douse' then
      if v_idx is null then raise exception 'no_sun' using errcode = 'P0001'; end if;
      zs := zs - v_idx;
      s := s || jsonb_build_object('zones', zs, 'last', jsonb_build_object('end', 'doused', 'at', v_ep));
      perform private.ench_event(e.id, 'doused', '{}'::jsonb);
      r := jsonb_build_object('doused', true);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

/** every burning zone of these owners' suns (and of a Mirror Shard reflecting one) */
create or replace function private.sun_live(p_owners uuid[]) returns table(eid uuid, owner_id uuid, z jsonb) language sql stable as $$
  select e.id, e.owner_id, private.sun_zone(z0, extract(epoch from now()))
    from public.enchantments e
    cross join lateral jsonb_array_elements(case when e.kind = 'sun' then coalesce(e.state -> 'zones', '[]'::jsonb) else coalesce(e.state -> 'r' -> 'zones', '[]'::jsonb) end) z0
   where e.owner_id = any(p_owners) and e.status = 'active'
     and (e.kind = 'sun' or (e.kind = 'shard' and e.state -> 'reflect' ->> 'kind' = 'sun' and (e.state -> 'reflect' ->> 'until')::numeric > extract(epoch from now())))
     and (private.sun_zone(z0, extract(epoch from now())) ->> 'alive')::boolean
$$;

/** the strongest sun a claim here sits in, for this player: their own, a party-mate's shared one, or a Radiant plot's */
create or replace function private.sun_for_claim(p_uid uuid, p_gx int, p_gy int) returns jsonb language plpgsql stable as $$
declare r record; v_best jsonb; v_m numeric; v_hot boolean; v_hx numeric := coalesce((private.cfg('hot_zones') ->> 'ultra_mult')::numeric, 5);
  v_cap numeric := private.ench_n('sun', 'conjunction_cap', 8);
begin
  if p_uid is null then return null; end if;
  v_hot := private.in_hot_zone(p_gx, p_gy);
  for r in select * from private.sun_live(array[p_uid] || private.party_mates(p_uid)) loop
    continue when r.z ->> 'mode' = 'orbit';
    continue when r.owner_id <> p_uid and not coalesce((r.z ->> 'party')::boolean, false);
    continue when private.ench_cell_m((r.z ->> 'gx')::int, (r.z ->> 'gy')::int, p_gx, p_gy) > (r.z ->> 'r_m')::numeric;
    v_m := (r.z ->> 'mult')::numeric;
    if r.owner_id <> p_uid then v_m := 1 + (v_m - 1) / 2; end if;
    if v_hot then v_m := least(v_cap, v_m * v_hx); end if;
    if v_best is null or v_m > (v_best ->> 'um')::numeric then
      v_best := jsonb_build_object('id', r.eid, 'owner', r.owner_id, 'i', r.z -> 'i', 'um', v_m, 'flare', (r.z ->> 'flare')::boolean,
                                   'party', r.owner_id <> p_uid, 'tier', r.z ->> 'tier', 'conjunction', v_hot);
    end if;
  end loop;
  -- ☀️ Radiant: a plot wearing a Pocket Sun's Trait carries a tiny sun of its own (40 / 80 / 120 m)
  for r in select * from private.gene_wearers(p_uid, 'radiant') w loop
    continue when private.ench_cell_m(r.gx, r.gy, p_gx, p_gy) > private.ench_n('sun', 'radiant_m', 40) * least(r.k, 3);
    v_m := 1 + 0.5 * least(r.k, 3);
    if v_hot then v_m := least(v_cap, v_m * v_hx); end if;
    if v_best is null or v_m > (v_best ->> 'um')::numeric then
      v_best := jsonb_build_object('id', r.id, 'owner', p_uid, 'um', v_m, 'flare', false, 'party', false, 'tier', 'radiant', 'radiant', true, 'conjunction', v_hot);
    end if;
  end loop;
  return v_best;
end $$;

/** a claim made inside a sun: counted, and a party-mate's claim tips the sun's owner */
create or replace function private.sun_claimed(p_sun jsonb, p_uid uuid, p_gx int, p_gy int) returns void language plpgsql as $$
declare v_owner uuid := (p_sun ->> 'owner')::uuid; v_day text := private.today()::text; e public.enchantments;
begin
  select * into e from public.enchantments where id = (p_sun ->> 'id')::uuid;
  if e.id is null then return; end if;
  perform private.ench_stat(e.id, 'sun_claims');
  if coalesce((p_sun ->> 'conjunction')::boolean, false) then perform private.ench_stat(e.id, 'conjunctions'); end if;
  if coalesce((p_sun ->> 'party')::boolean, false) and v_owner <> p_uid then
    perform private.ench_stat(e.id, 'party_claims');
    if coalesce(e.stats ->> 'tip_day', '') <> v_day then update public.enchantments set stats = stats || jsonb_build_object('tip_day', v_day, 'tip_n', 0) where id = e.id; end if;
    if coalesce((select (stats ->> 'tip_n')::int from public.enchantments where id = e.id), 0) < private.ench_n('sun', 'party_tips_day', 20) then
      perform private.grant_ink_paced(v_owner, private.ench_n('sun', 'party_tip', 3)::int, 'enchantment', 'sun_tip', e.id::text, null);
      update public.enchantments set stats = stats || jsonb_build_object('tip_n', coalesce((stats ->> 'tip_n')::int, 0) + 1) where id = e.id;
      perform private.notify(v_owner, 'enchant', p_uid, jsonb_build_object('sub', 'sun_party_claim', 'kind', 'sun', 'ink', private.ench_n('sun', 'party_tip', 3)));
    end if;
  end if;
  perform private.fairplay(p_uid, 'sun_claim', p_gx, p_gy, jsonb_build_object('sun', e.id, 'um', p_sun -> 'um', 'flare', p_sun -> 'flare'));
end $$;

/** a sunspot under this claim (the owner's own suns): it rolls a tier higher, and is used up */
create or replace function private.sun_spot_take(p_uid uuid, p_gx int, p_gy int) returns boolean language plpgsql as $$
declare e record; v_ep numeric := extract(epoch from now()); v_found boolean := false; zs jsonb;
begin
  for e in select x.* from public.enchantments x where x.owner_id = p_uid and x.kind = 'sun' and x.status = 'active'
            and x.state -> 'zones' @> jsonb_build_array(jsonb_build_object('spots', jsonb_build_array(jsonb_build_array(p_gx, p_gy)))) for update loop
    select coalesce(jsonb_agg(case when (private.sun_zone(z, v_ep) ->> 'alive')::boolean and z -> 'spots' @> jsonb_build_array(jsonb_build_array(p_gx, p_gy))
                                   then z || jsonb_build_object('spots', coalesce((select jsonb_agg(c) from jsonb_array_elements(z -> 'spots') c where c <> jsonb_build_array(p_gx, p_gy)), '[]'::jsonb))
                                   else z end), '[]'::jsonb),
           bool_or((private.sun_zone(z, v_ep) ->> 'alive')::boolean and z -> 'spots' @> jsonb_build_array(jsonb_build_array(p_gx, p_gy)))
      into zs, v_found from jsonb_array_elements(e.state -> 'zones') z;
    if v_found then
      update public.enchantments set state = state || jsonb_build_object('zones', zs) where id = e.id;
      perform private.ench_stat(e.id, 'sunspots');
      perform private.fairplay(p_uid, 'sun_spot', p_gx, p_gy, jsonb_build_object('sun', e.id));
      return true;
    end if;
  end loop;
  return false;
end $$;

-- ---- 🪄 the Dowsing Rod -----------------------------------------------------------------------------------------------
/** the natural chance a roll lands a target */
create or replace function private.rod_p(p_t text, p_id text) returns numeric language sql stable as $$
  select case p_t
    when 'rarity' then (select weight::numeric from public.plot_rarities where id = p_id and weight > 0)
                       / nullif((select sum(weight) from public.plot_rarities where weight > 0), 0)
                       * (1 - (select coalesce(sum(ppm), 0) from public.plot_rarities where ppm > 0 and id not like 'crown%') / 1e6)
    when 'shiny' then 1 / greatest(coalesce((private.cfg('shiny') ->> 'one_in')::numeric, 1000), 1)
    when 'ultra' then (select coalesce(sum(ppm), 0) from public.plot_rarities where ppm > 0 and id not like 'crown%' and coalesce(tier, 'ultra') = 'ultra') / 1e6
    when 'ultra_id' then (select ppm::numeric from public.plot_rarities where id = p_id and ppm > 0 and id not like 'crown%' and coalesce(tier, 'ultra') = 'ultra') / 1e6
    when 'primordial' then (select coalesce(sum(ppb), 0) from public.plot_rarities where ppb > 0) / 1e9
    when 'enchanted' then coalesce((private.ench_cfg() ->> 'base_pct')::numeric, 2) / 100
    when 'kind' then case when p_id = any(private.ench_kinds()) then coalesce((private.ench_cfg() ->> 'base_pct')::numeric, 2) / 100 * private.ench_kind_share(p_id) end
  end
$$;
/** how much harder a tuned roll is (the chance it keeps a natural hit) */
create or replace function private.rod_h(e public.enchantments, p_t text) returns numeric language sql stable as $$
  select case when e.stars >= 5 then 1
              when p_t in ('ultra_id', 'kind', 'primordial') then private.ench_n('rod', 'h_specific', 0.3333)
              else private.ench_n('rod', 'h', 0.5) end
$$;
/** full depth: M × the natural expected wait (M 3, or 4 for a specific pick), shorter with levels and ★1 */
create or replace function private.rod_need(e public.enchantments, p_t text, p_id text) returns int language sql stable as $$
  select greatest(2, least(1000000000, ceil(
           (case when p_t in ('ultra_id', 'kind', 'primordial') then private.ench_n('rod', 'm_specific', 4) else private.ench_n('rod', 'm', 3) end)
           * (1 - 0.02 * (least(e.level, 10) - 1)) * case when e.stars >= 1 then 0.85 else 1 end
           / greatest(coalesce(private.rod_p(p_t, p_id), 0), 1e-8)))::int)
$$;
create or replace function private.rod_name(p_t text, p_id text) returns text language sql stable as $$
  select case p_t when 'rarity' then (select name from public.plot_rarities where id = p_id) when 'shiny' then 'Shiny' when 'ultra' then 'any Ultra'
                  when 'ultra_id' then (select name from public.plot_rarities where id = p_id) when 'primordial' then 'any Primordial'
                  when 'enchanted' then 'Enchanted' when 'kind' then private.ench_info(p_id) ->> 'name' end
$$;
/** what the rod can be tuned to */
create or replace function private.rod_catalog(e public.enchantments) returns jsonb language sql stable as $$
  select jsonb_agg(x.j order by x.o, x.s) from (
    select 1 o, sort::numeric s, jsonb_build_object('t', 'rarity', 'id', id, 'name', name, 'p', private.rod_p('rarity', id)) j from public.plot_rarities where id in ('uncommon', 'rare', 'epic', 'legendary', 'mythic')
    union all select 2, 0, jsonb_build_object('t', 'shiny', 'id', 'shiny', 'name', 'Shiny', 'p', private.rod_p('shiny', null))
    union all select 3, 0, jsonb_build_object('t', 'ultra', 'id', 'ultra', 'name', 'any Ultra', 'p', private.rod_p('ultra', null))
    union all select 4, -ppm::numeric, jsonb_build_object('t', 'ultra_id', 'id', id, 'name', name, 'p', private.rod_p('ultra_id', id))
                from public.plot_rarities where ppm > 0 and id not like 'crown%' and coalesce(tier, 'ultra') = 'ultra'
    union all select 5, 0, jsonb_build_object('t', 'primordial', 'id', 'primordial', 'name', 'any Primordial', 'p', private.rod_p('primordial', null), 'stars', 5)
    union all select 6, 0, jsonb_build_object('t', 'enchanted', 'id', 'enchanted', 'name', 'Enchanted', 'p', private.rod_p('enchanted', null))
    union all select 7, array_position(private.ench_kinds(), k), jsonb_build_object('t', 'kind', 'id', k, 'name', private.ench_info(k) ->> 'name', 'p', private.rod_p('kind', k)) from unnest(private.ench_kinds()) k) x
$$;
/** a slot's live numbers */
create or replace function private.rod_slot(e public.enchantments, tg jsonb) returns jsonb language sql stable as $$
  select tg || jsonb_build_object('name', private.rod_name(tg ->> 't', tg ->> 'id'), 'p', private.rod_p(tg ->> 't', tg ->> 'id'),
    'h', private.rod_h(e, tg ->> 't'), 'q', private.rod_p(tg ->> 't', tg ->> 'id') * private.rod_h(e, tg ->> 't'),
    'need', private.rod_need(e, tg ->> 't', tg ->> 'id'), 'depth', coalesce((tg ->> 'depth')::int, 0),
    'pct', round(100.0 * coalesce((tg ->> 'depth')::int, 0) / private.rod_need(e, tg ->> 't', tg ->> 'id'), 1))
$$;
create or replace function private.rod_slots_max(e public.enchantments) returns int language sql stable as $$
  select case when e.stars >= 4 then 2 else 1 end
$$;
create or replace function private.ench_view_rod(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare v_slots jsonb; v_active uuid;
begin
  select coalesce(jsonb_agg(private.rod_slot(e, tg) order by o), '[]'::jsonb) into v_slots from jsonb_array_elements(coalesce(e.state -> 'targets', '[]'::jsonb)) with ordinality x(tg, o);
  select x.id into v_active from public.enchantments x where x.owner_id = e.owner_id and x.kind = 'rod' and x.status = 'active' and jsonb_array_length(coalesce(x.state -> 'targets', '[]'::jsonb)) > 0
   order by (select max((tt ->> 'tuned_at')::numeric) from jsonb_array_elements(x.state -> 'targets') tt) desc nulls last limit 1;
  return jsonb_build_object('targets', v_slots, 'slots', private.rod_slots_max(e), 'catalog', private.rod_catalog(e),
    'dowsing', v_active = e.id, 'resting', v_active is not null and v_active <> e.id,
    'keeps', case when e.stars >= 2 then 0.5 else 0 end,
    'walk_ready', e.stars >= 3 and coalesce(e.state ->> 'walk_day', '') <> private.today()::text and jsonb_array_length(v_slots) > 0,
    'hits', coalesce((e.stats ->> 'dowsed')::int, 0), 'slips', coalesce((e.stats ->> 'slips')::int, 0), 'last', e.state -> 'last',
    'attention', case when jsonb_array_length(v_slots) = 0 then 'Tune it to what you want to roll'
                      when e.stars >= 3 and coalesce(e.state ->> 'walk_day', '') <> private.today()::text then 'It can walk the map for a sign today' end);
end $$;

create or replace function private.ench_act_rod(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; r jsonb; v_ep numeric := extract(epoch from now()); ts jsonb := coalesce(e.state -> 'targets', '[]'::jsonb); v_slot int; v_t text; v_id text;
  v_old jsonb; v_keep numeric; v_d int; i int; v_cell int[]; c record; v_roll jsonb; v_sid bigint; v_tg jsonb; v_match boolean;
begin
  case p_action
    when 'tune' then
      v_t := a ->> 't'; v_id := coalesce(a ->> 'id', a ->> 't');
      if not exists (select 1 from jsonb_array_elements(private.rod_catalog(e)) x where x ->> 't' = v_t and x ->> 'id' = v_id and coalesce((x ->> 'stars')::int, 0) <= e.stars) then
        raise exception 'bad_target' using errcode = 'P0001';
      end if;
      if private.rod_p(v_t, v_id) is null or private.rod_p(v_t, v_id) <= 0 then raise exception 'bad_target' using errcode = 'P0001'; end if;
      v_slot := least(greatest(coalesce((a ->> 'slot')::int, 0), 0), private.rod_slots_max(e) - 1);
      if exists (select 1 from jsonb_array_elements(ts) with ordinality x(tg, o) where o - 1 <> v_slot and tg ->> 't' = v_t and tg ->> 'id' = v_id) then
        raise exception 'already_tuned' using errcode = 'P0001';
      end if;
      v_old := ts -> v_slot;
      -- retuning drains the depth (★2 keeps half of how deep it was)
      v_keep := case when e.stars >= 2 then 0.5 else 0 end;
      v_d := case when v_old is null then 0
                  when v_old ->> 't' = v_t and v_old ->> 'id' = v_id then coalesce((v_old ->> 'depth')::int, 0)
                  else floor(v_keep * coalesce((v_old ->> 'depth')::numeric, 0) / greatest(private.rod_need(e, v_old ->> 't', v_old ->> 'id'), 1) * private.rod_need(e, v_t, v_id))::int end;
      v_tg := jsonb_build_object('t', v_t, 'id', v_id, 'depth', v_d, 'tuned_at', v_ep, 'hits', 0, 'slips', 0);
      if v_slot < jsonb_array_length(ts) then ts := jsonb_set(ts, array[v_slot::text], v_tg); else ts := ts || jsonb_build_array(v_tg); end if;
      s := s || jsonb_build_object('targets', ts);
      perform private.ench_stat(e.id, 'tunes');
      perform private.ench_event(e.id, 'tuned', jsonb_build_object('t', v_t, 'id', v_id, 'name', private.rod_name(v_t, v_id), 'need', private.rod_need(e, v_t, v_id), 'depth', v_d));
      r := jsonb_build_object('tuned', private.rod_slot(e, v_tg));
    when 'untune' then
      v_slot := coalesce((a ->> 'slot')::int, 0);
      if ts -> v_slot is null then raise exception 'not_found' using errcode = 'P0001'; end if;
      ts := ts - v_slot;
      s := s || jsonb_build_object('targets', ts);
      r := jsonb_build_object('untuned', true);
    when 'wake' then
      -- make this one the rod that dowses (the others rest, keeping their depth)
      if jsonb_array_length(ts) = 0 then raise exception 'not_tuned' using errcode = 'P0001'; end if;
      select coalesce(jsonb_agg(tg || jsonb_build_object('tuned_at', v_ep)), '[]'::jsonb) into ts from jsonb_array_elements(ts) tg;
      s := s || jsonb_build_object('targets', ts);
      r := jsonb_build_object('dowsing', true);
    when 'walk' then
      -- ★3 Divining Walk: once a day it walks up to 60 free spots near you and twitches over one that would read as the target
      if e.stars < 3 then raise exception 'stars_locked' using errcode = 'P0001', detail = '3'; end if;
      if coalesce(s ->> 'walk_day', '') = private.today()::text then raise exception 'already_today' using errcode = 'P0001'; end if;
      if jsonb_array_length(ts) = 0 then raise exception 'not_tuned' using errcode = 'P0001'; end if;
      select * into c from private.explorer_now(e.owner_id);
      s := s || jsonb_build_object('walk_day', private.today()::text);
      r := jsonb_build_object('found', false, 'walked', 0);
      for i in 1 .. 60 loop
        v_cell := private.free_cell_within(coalesce(c.gx, e.gx), coalesce(c.gy, e.gy), private.ench_n('rod', 'walk_m', 1000) * private.ench_reach(e.id));
        continue when v_cell is null;
        continue when exists (select 1 from private.spy_sightings where player_id = e.owner_id and gx = v_cell[1] and gy = v_cell[2] and used_at is null and refunded_at is null and expires_at > now());
        v_roll := private.spy_roll(v_cell[1], v_cell[2]);
        r := r || jsonb_build_object('walked', i);
        v_match := exists (select 1 from jsonb_array_elements(ts) tg where tg ->> 't' <> 'shiny'
                    and (private.rod_is(tg ->> 't', tg ->> 'id', v_roll ->> 'rarity', v_roll ->> 'kind') or private.rod_better(tg ->> 't', tg ->> 'id', v_roll ->> 'rarity', v_roll ->> 'kind')));
        if v_match then
          insert into private.spy_sightings (player_id, enchant_id, gx, gy, rarity, kind, hot, expires_at)
          values (e.owner_id, e.id, v_cell[1], v_cell[2], v_roll ->> 'rarity', v_roll ->> 'kind', private.in_hot_zone(v_cell[1], v_cell[2]), now() + interval '24 hours')
          returning id into v_sid;
          perform private.fairplay(e.owner_id, 'rod_walk', v_cell[1], v_cell[2], jsonb_build_object('enchant', e.id, 'rarity', v_roll ->> 'rarity'));
          perform private.ench_stat(e.id, 'walk_found');
          r := r || jsonb_build_object('found', true, 'sighting', private.spy_json(v_sid));
          exit;
        end if;
      end loop;
      perform private.ench_xp(e.id, 1);
      perform private.ench_event(e.id, 'walked', jsonb_build_object('found', r -> 'found', 'rarity', r -> 'sighting' -> 'rarity'));
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

/** did this roll land the target? */
create or replace function private.rod_is(p_t text, p_id text, p_r text, p_en text) returns boolean language sql stable as $$
  select coalesce(case p_t
    when 'rarity' then p_en is null and p_r = p_id
    when 'ultra' then p_en is null and p_r not like 'crown%' and exists (select 1 from public.plot_rarities where id = p_r and ppm > 0 and coalesce(tier, 'ultra') = 'ultra')
    when 'ultra_id' then p_en is null and p_r = p_id
    when 'primordial' then p_en is null and exists (select 1 from public.plot_rarities where id = p_r and tier = 'primordial')
    when 'enchanted' then p_en is not null
    when 'kind' then p_en = p_id
    else false end, false)
$$;
/** is it better than the target? (then it's yours, and the rod goes on) */
create or replace function private.rod_better(p_t text, p_id text, p_r text, p_en text) returns boolean language sql stable as $$
  select coalesce(case p_t
    when 'rarity' then p_en is null and p_r <> 'enchanted' and private.plot_rarity_rank(p_r) > private.plot_rarity_rank(p_id)
    when 'ultra' then p_en is null and (p_r like 'crown%' or exists (select 1 from public.plot_rarities where id = p_r and tier in ('primordial', 'fusion')))
    when 'ultra_id' then p_en is null and p_r <> 'enchanted' and private.plot_rarity_rank(p_r) > private.plot_rarity_rank(p_id)
    when 'shiny' then false
    else false end, false)
$$;
/** what the rod brings up at full depth */
create or replace function private.rod_force(p_t text, p_id text) returns jsonb language plpgsql as $$
declare v text; v_acc numeric := 0; v_r numeric; r record;
begin
  case p_t
    when 'rarity' then return jsonb_build_object('rarity', p_id);
    when 'ultra_id' then return jsonb_build_object('rarity', p_id);
    when 'ultra' then
      v_r := random() * (select sum(ppm) from public.plot_rarities where ppm > 0 and id not like 'crown%' and coalesce(tier, 'ultra') = 'ultra');
      for r in select id, ppm from public.plot_rarities where ppm > 0 and id not like 'crown%' and coalesce(tier, 'ultra') = 'ultra' order by sort loop
        v_acc := v_acc + r.ppm; if v_r < v_acc then return jsonb_build_object('rarity', r.id); end if;
      end loop;
      return jsonb_build_object('rarity', 'solar');
    when 'primordial' then
      v_r := random() * (select sum(ppb) from public.plot_rarities where ppb > 0);
      for r in select id, ppb from public.plot_rarities where ppb > 0 order by sort loop
        v_acc := v_acc + r.ppb; if v_r < v_acc then return jsonb_build_object('rarity', r.id); end if;
      end loop;
      return jsonb_build_object('rarity', 'heart_world');
    when 'enchanted' then return jsonb_build_object('rarity', 'enchanted', 'ench', private.ench_pick_kind());
    when 'kind' then return jsonb_build_object('rarity', 'enchanted', 'ench', p_id);
    else return null;
  end case;
end $$;
/** a slip: the rod held a natural hit back — the roll is made again without it */
create or replace function private.rod_slip(p_t text, p_id text, p_pre text, p_gx int, p_gy int, p_uid uuid) returns jsonb language plpgsql as $$
declare v text; v_total int;
begin
  if p_t in ('enchanted', 'kind') then return jsonb_build_object('rarity', p_pre, 'ench', null); end if;
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  if p_t = 'rarity' then
    v := private.rx_roll(p_gx, p_gy, 'rodslip' || p_uid || floor(extract(epoch from clock_timestamp()) * 1000)::text, 1, false);
    if v = p_id or private.plot_rarity_rank(v) >= private.plot_rarity_rank(p_id) then v := (private.rx_ladder())[greatest(1, array_position(private.rx_ladder(), p_id) - 1)]; end if;
    return jsonb_build_object('rarity', v, 'ench', null);
  end if;
  -- (an ultra or a Primordial that slipped: an everyday roll in its place)
  return jsonb_build_object('rarity', private.rarity_pick(floor(random() * greatest(v_total, 1))::bigint), 'ench', null);
end $$;

/** 🪄 dowse a claim: the player's dowsing rod (the one tuned most recently) — harder per roll, certain in the end */
create or replace function private.rod_dowse(p_uid uuid, p_gx int, p_gy int, p_rarity text, p_ench text, p_pre text) returns jsonb language plpgsql as $$
declare e public.enchantments; ts jsonb; tg jsonb; i int; v_t text; v_id text; v_h numeric; v_need int; v_d int; v_step int;
  v_r text := p_rarity; v_en text := p_ench; v_info jsonb := '[]'::jsonb; v_forced boolean := false; v_fx jsonb; v_res text; v_changed boolean := false;
begin
  if p_uid is null or p_rarity like 'crown%' then return null; end if;
  select * into e from public.enchantments where owner_id = p_uid and kind = 'rod' and status = 'active' and jsonb_array_length(coalesce(state -> 'targets', '[]'::jsonb)) > 0
   order by (select max((tt ->> 'tuned_at')::numeric) from jsonb_array_elements(state -> 'targets') tt) desc nulls last limit 1 for update;
  if e.id is null then return null; end if;
  if e.frozen_at is not null and now() < e.frozen_until then return null; end if;
  ts := e.state -> 'targets';
  v_step := case when e.stars >= 5 then 2 else 1 end;
  for i in 0 .. jsonb_array_length(ts) - 1 loop
    tg := ts -> i; v_t := tg ->> 't'; v_id := tg ->> 'id';
    continue when v_t = 'shiny';
    v_h := private.rod_h(e, v_t); v_need := private.rod_need(e, v_t, v_id); v_d := coalesce((tg ->> 'depth')::int, 0);
    if private.rod_is(v_t, v_id, v_r, v_en) then
      if v_forced or random() < v_h then
        v_res := 'hit'; v_d := 0; tg := tg || jsonb_build_object('hits', coalesce((tg ->> 'hits')::int, 0) + 1);
      else
        v_fx := private.rod_slip(v_t, v_id, p_pre, p_gx, p_gy, p_uid);
        v_r := v_fx ->> 'rarity'; v_en := v_fx ->> 'ench'; v_changed := true;
        v_res := 'slip'; v_d := least(v_need - 1, v_d + greatest(1, ceil(v_need * private.ench_n('rod', 'slip_depth', 0.1))::int));
        tg := tg || jsonb_build_object('slips', coalesce((tg ->> 'slips')::int, 0) + 1);
      end if;
    elsif private.rod_better(v_t, v_id, v_r, v_en) then
      v_res := 'better'; v_d := v_d + v_step;
    else
      v_d := v_d + v_step;
      if v_d >= v_need and not v_forced and v_r not like 'crown%' then
        v_fx := private.rod_force(v_t, v_id);
        v_r := v_fx ->> 'rarity'; v_en := v_fx ->> 'ench'; v_changed := true; v_forced := true;
        v_res := 'forced'; v_d := 0; tg := tg || jsonb_build_object('hits', coalesce((tg ->> 'hits')::int, 0) + 1);
      else v_res := 'miss'; end if;
    end if;
    if v_res in ('hit', 'forced') then
      perform private.ench_stat(e.id, 'dowsed');
      if v_t in ('ultra', 'ultra_id', 'primordial') or (v_t = 'rarity' and v_id = 'mythic') then perform private.ench_stat(e.id, 'deep_dowsed'); end if;
      perform private.fairplay(p_uid, 'rod_' || v_res, p_gx, p_gy, jsonb_build_object('enchant', e.id, 't', v_t, 'id', v_id, 'rarity', v_r, 'ench', v_en));
      perform private.ench_xp(e.id, 3);
      perform private.ench_event(e.id, 'dowsed', jsonb_build_object('t', v_t, 'id', v_id, 'name', private.rod_name(v_t, v_id), 'how', v_res, 'gx', p_gx, 'gy', p_gy));
    elsif v_res = 'slip' then
      perform private.ench_stat(e.id, 'slips');
      perform private.ench_event(e.id, 'rod_slip', jsonb_build_object('t', v_t, 'id', v_id, 'name', private.rod_name(v_t, v_id), 'depth', v_d, 'need', v_need));
    end if;
    tg := tg || jsonb_build_object('depth', v_d);
    ts := jsonb_set(ts, array[i::text], tg);
    v_info := v_info || jsonb_build_array(jsonb_build_object('slot', i, 't', v_t, 'id', v_id, 'name', private.rod_name(v_t, v_id), 'result', v_res, 'depth', v_d, 'need', v_need,
                                                           'rod', e.id, 'serial', e.serial));
  end loop;
  update public.enchantments set state = state || jsonb_build_object('targets', ts,
           'last', case when v_info @? '$[*] ? (@.result == "hit" || @.result == "forced" || @.result == "slip")' then (select x from jsonb_array_elements(v_info) x where x ->> 'result' in ('hit', 'forced', 'slip') limit 1) || jsonb_build_object('at', extract(epoch from now())) else state -> 'last' end),
         updated_at = now()
   where id = e.id;
  return jsonb_build_object('rarity', v_r, 'ench', v_en, 'changed', v_changed, 'info', v_info);
end $$;

/** a rod tuned to Shiny dowses the shine (rolled when the plot was claimed) */
create or replace function private.rod_shiny(p_uid uuid, p_gx int, p_gy int) returns jsonb language plpgsql as $$
declare e public.enchantments; ts jsonb; tg jsonb; i int; v_need int; v_d int; v_sh boolean; v_res text; v_info jsonb := '[]'::jsonb;
begin
  select * into e from public.enchantments where owner_id = p_uid and kind = 'rod' and status = 'active' and state -> 'targets' @? '$[*] ? (@.t == "shiny")'
   order by (select max((tt ->> 'tuned_at')::numeric) from jsonb_array_elements(state -> 'targets') tt) desc nulls last limit 1 for update;
  if e.id is null then return null; end if;
  -- (only the rod that's dowsing)
  if exists (select 1 from public.enchantments x where x.owner_id = p_uid and x.kind = 'rod' and x.status = 'active' and x.id <> e.id
               and (select max((tt ->> 'tuned_at')::numeric) from jsonb_array_elements(x.state -> 'targets') tt)
                   > (select max((tt ->> 'tuned_at')::numeric) from jsonb_array_elements(e.state -> 'targets') tt)) then return null; end if;
  select shiny into v_sh from public.world_plots where gx = p_gx and gy = p_gy;
  ts := e.state -> 'targets';
  for i in 0 .. jsonb_array_length(ts) - 1 loop
    tg := ts -> i;
    continue when tg ->> 't' <> 'shiny';
    v_need := private.rod_need(e, 'shiny', 'shiny'); v_d := coalesce((tg ->> 'depth')::int, 0);
    if v_sh then
      if random() < private.rod_h(e, 'shiny') then v_res := 'hit'; v_d := 0;
      else
        update public.world_plots set shiny = false where gx = p_gx and gy = p_gy;
        v_res := 'slip'; v_d := least(v_need - 1, v_d + greatest(1, ceil(v_need * private.ench_n('rod', 'slip_depth', 0.1))::int));
        perform private.ench_stat(e.id, 'slips');
      end if;
    else
      v_d := v_d + case when e.stars >= 5 then 2 else 1 end;
      if v_d >= v_need then update public.world_plots set shiny = true where gx = p_gx and gy = p_gy; v_res := 'forced'; v_d := 0; else v_res := 'miss'; end if;
    end if;
    if v_res in ('hit', 'forced') then
      perform private.ench_stat(e.id, 'dowsed'); perform private.ench_xp(e.id, 3);
      perform private.fairplay(p_uid, 'rod_' || v_res, p_gx, p_gy, jsonb_build_object('enchant', e.id, 't', 'shiny'));
      perform private.ench_event(e.id, 'dowsed', jsonb_build_object('t', 'shiny', 'id', 'shiny', 'name', 'Shiny', 'how', v_res, 'gx', p_gx, 'gy', p_gy));
    end if;
    ts := jsonb_set(ts, array[i::text], tg || jsonb_build_object('depth', v_d));
    v_info := v_info || jsonb_build_array(jsonb_build_object('slot', i, 't', 'shiny', 'id', 'shiny', 'name', 'Shiny', 'result', v_res, 'depth', v_d, 'need', v_need, 'rod', e.id, 'serial', e.serial));
  end loop;
  update public.enchantments set state = state || jsonb_build_object('targets', ts) where id = e.id;
  return v_info;
end $$;

-- ---- weaving the new two in, the old two out --------------------------------------------------------------------------
-- what they do on your page
select private.fn_patch('public.enchant_act(uuid,text,jsonb)',
  $a$when 'ouroboros' then private.ench_act_ouroboros(e, p_action, a, t) when 'homunculus' then private.ench_act_homunculus(e, p_action, a, t)$a$,
  $b$when 'sun' then private.ench_act_sun(e, p_action, a, t) when 'rod' then private.ench_act_rod(e, p_action, a, t)$b$);
select private.fn_patch('public.enchant_act(uuid,text,jsonb)',
  $a$when 'clockwork' then private.ench_act_clockwork(x, p_action, a, t) when 'sizeray' then private.ench_act_sizeray(x, p_action, a, t) end;$a$,
  $b$when 'clockwork' then private.ench_act_clockwork(x, p_action, a, t) when 'sizeray' then private.ench_act_sizeray(x, p_action, a, t)
      when 'sun' then private.ench_act_sun(x, p_action, a, t) end;$b$);
select private.fn_patch('private.ench_kind_view(public.enchantments,timestamptz)',
  $a$when 'ouroboros' then private.ench_view_ouroboros(e, t) when 'homunculus' then private.ench_view_homunculus(e, t) when 'stormcoil'$a$,
  $b$when 'sun' then private.ench_view_sun(e, t) when 'rod' then private.ench_view_rod(e, t) when 'stormcoil'$b$);

-- no coils to settle, no splices that renew themselves
create or replace function private.ench_settle(p_id uuid) returns void language plpgsql as $$
declare e public.enchantments; s record;
begin
  select * into e from public.enchantments where id = p_id;
  if e.kind = 'stormcoil' then perform private.storm_settle(p_id); end if;
  select * into e from public.enchantments where id = p_id;
  if e.frozen_at is not null and now() >= e.frozen_until then
    update public.enchantments set clock_skip = clock_skip - extract(epoch from frozen_until - frozen_at), frozen_at = null, frozen_until = null where id = p_id;
  end if;
  for s in select sp.*, ea.kind ka, eb.kind kb from public.enchant_splices sp join public.enchantments ea on ea.id = sp.a left join public.enchantments eb on eb.id = sp.b
            where not sp.folded and sp.ends_at <= now() and (sp.a = p_id or sp.b = p_id) for update of sp loop
    -- the Tempo (a Clockwork) and the warmth (a Pocket Sun's Radiant) a finished splice gave, kept for good
    if s.kb = 'clockwork' then
      update public.enchantments set clock_skip = clock_skip + (private.splice_strength(s.mode, s.data, s.ka, s.kb) + 1) * extract(epoch from s.ends_at - s.started_at) where id = s.a;
    end if;
    if s.ka = 'clockwork' and s.b is not null and s.mode <> 'graft' then
      update public.enchantments set clock_skip = clock_skip + (private.splice_strength(s.mode, s.data, s.kb, s.ka) + 1) * extract(epoch from s.ends_at - s.started_at) where id = s.b;
    end if;
    if s.kb = 'sun' then
      update public.enchantments set clock_skip = clock_skip + 0.1 * private.splice_strength(s.mode, s.data, s.ka, s.kb) * extract(epoch from s.ends_at - s.started_at) where id = s.a;
    end if;
    if s.ka = 'sun' and s.b is not null and s.mode <> 'graft' then
      update public.enchantments set clock_skip = clock_skip + 0.1 * private.splice_strength(s.mode, s.data, s.kb, s.ka) * extract(epoch from s.ends_at - s.started_at) where id = s.b;
    end if;
    update public.enchant_splices set folded = true where id = s.id;
  end loop;
end $$;

-- ☀️ Radiant: the partner's timers run 10% faster a strength in its warmth (like a Clockwork's Tempo)
create or replace function private.ench_tempo(p_id uuid) returns numeric language sql stable as $$
  select coalesce((select sum((private.splice_strength(s.mode, s.data, me.kind, o.kind) + 1)
                              * greatest(0, extract(epoch from least(now(), s.ends_at) - s.started_at)))
                     from public.enchant_splices s join public.enchantments me on me.id = p_id
                     join public.enchantments o on o.id = case when s.a = p_id then s.b else s.a end
                    where not s.folded and (s.a = p_id or (s.b = p_id and s.mode <> 'graft')) and o.kind = 'clockwork'), 0)
       + coalesce((select sum(0.1 * private.splice_strength(s.mode, s.data, me.kind, o.kind)
                              * greatest(0, extract(epoch from least(now(), s.ends_at) - s.started_at)))
                     from public.enchant_splices s join public.enchantments me on me.id = p_id
                     join public.enchantments o on o.id = case when s.a = p_id then s.b else s.a end
                    where not s.folded and (s.a = p_id or (s.b = p_id and s.mode <> 'graft')) and o.kind = 'sun'), 0)
       -- small things live fast: time on a tiny plot runs twice as quick
       + coalesce((select sum(greatest(0, extract(epoch from least(now(), b.expires_at) - greatest(b.created_at, me.born_at))))
                     from public.enchantments me join public.enchant_buffs b on b.kind = 'plot_tiny' and b.gx = me.gx and b.gy = me.gy
                    where me.id = p_id and b.expires_at > me.born_at and not coalesce((b.data ->> 'prank')::boolean, false)), 0)
$$;
create or replace function private.ench_rate(p_id uuid) returns numeric language sql stable as $$
  select case
    when exists (select 1 from public.enchantments e where e.id = p_id and e.frozen_at is not null and now() < e.frozen_until) then 0
    else 1
      + coalesce((select sum(private.splice_strength(s.mode, s.data, me.kind, o.kind) + 1)
                    from public.enchant_splices s join public.enchantments me on me.id = p_id
                    join public.enchantments o on o.id = case when s.a = p_id then s.b else s.a end
                   where not s.folded and (s.a = p_id or (s.b = p_id and s.mode <> 'graft')) and o.kind = 'clockwork'
                     and s.started_at <= now() and s.ends_at > now()), 0)
      + coalesce((select sum(0.1 * private.splice_strength(s.mode, s.data, me.kind, o.kind))
                    from public.enchant_splices s join public.enchantments me on me.id = p_id
                    join public.enchantments o on o.id = case when s.a = p_id then s.b else s.a end
                   where not s.folded and (s.a = p_id or (s.b = p_id and s.mode <> 'graft')) and o.kind = 'sun'
                     and s.started_at <= now() and s.ends_at > now()), 0)
      + case when exists (select 1 from public.enchantments me join public.enchant_buffs b on b.kind = 'plot_tiny' and b.gx = me.gx and b.gy = me.gy
                           where me.id = p_id and b.created_at <= now() and b.expires_at > now() and not coalesce((b.data ->> 'prank')::boolean, false))
             then 1 else 0 end
  end
$$;

create or replace function private.splice_strength(p_mode text, p_data jsonb, p_me text, p_other text) returns integer language sql immutable as $$
  select greatest(
    case when p_data ? 'aberration' then 3
         when p_mode in ('graft', 'chimera') then 2
         when p_mode = 'plot' then 1
         when p_other is not null and (private.ench_hybrid(p_me, p_other) ->> 1)::boolean then 2
         else 1 end,
    least(3, coalesce((p_data ->> 'storm_k')::int, 0)))
$$;

-- ☀️ an orbiting sun warms your enchantments under it (10% faster); the heartbeat does it
create or replace function private.sun_warm_tick() returns void language plpgsql as $$
declare r record; v_ep numeric := extract(epoch from now()); v_dt numeric; zs jsonb; z jsonb; i int; v_cells int;
begin
  for r in select e.* from public.enchantments e where e.kind = 'sun' and e.status = 'active' and e.owner_id is not null
             and e.state -> 'zones' @? '$[*] ? (@.mode == "orbit")' limit 2000 loop
    zs := r.state -> 'zones';
    for i in 0 .. jsonb_array_length(zs) - 1 loop
      z := private.sun_zone(zs -> i, v_ep);
      continue when z ->> 'mode' <> 'orbit' or not (z ->> 'alive')::boolean;
      v_dt := least(600, greatest(0, v_ep - coalesce((z ->> 'warm_at')::numeric, v_ep)));
      continue when v_dt < 30;
      v_cells := ceil((z ->> 'r_m')::numeric / 3)::int + 2;
      update public.enchantments x set clock_skip = clock_skip + 0.1 * v_dt
       where x.owner_id = r.owner_id and x.status = 'active' and x.id <> r.id
         and x.gx between (z ->> 'gx')::int - v_cells and (z ->> 'gx')::int + v_cells and x.gy between (z ->> 'gy')::int - v_cells and (z ->> 'gy')::int + v_cells
         and private.ench_cell_m(x.gx, x.gy, (z ->> 'gx')::int, (z ->> 'gy')::int) <= (z ->> 'r_m')::numeric;
      zs := jsonb_set(zs, array[i::text, 'warm_at'], to_jsonb(v_ep));
    end loop;
    update public.enchantments set state = state || jsonb_build_object('zones', zs) where id = r.id;
  end loop;
end $$;

create or replace function private.wonders_tick() returns void language plpgsql as $$
declare r record;
begin
  -- the Ultra Expansion's powers (their own errors never stop the rest)
  begin perform private.rx_tick(); exception when others then raise warning 'rx_tick: %', sqlerrm; end;
  for r in select id from public.enchantments where kind = 'stormcoil' and jsonb_typeof(state -> 'storm') = 'object' and not coalesce((state -> 'storm' ->> 'settled')::boolean, false)
             and (state -> 'storm' ->> 'until')::numeric + 3 < extract(epoch from now()) limit 500 loop
    perform private.storm_settle(r.id);
  end loop;
  for r in
    select x.id from public.enchantments x
     where x.status = 'active' and x.id in (
             select s.a from public.enchant_splices s join public.enchantments o on o.id = s.b
              where s.started_at <= now() and s.ends_at > now() and o.kind in ('puppeteer', 'spyglass', 'parasite', 'sizeray', 'genie')
             union
             select s.b from public.enchant_splices s join public.enchantments o on o.id = s.a
              where s.b is not null and s.mode <> 'graft' and s.started_at <= now() and s.ends_at > now() and o.kind in ('puppeteer', 'spyglass', 'parasite', 'sizeray', 'genie'))
       and coalesce(x.stats ->> 'trait_day', '') <> private.today()::text
     limit 3000 loop
    begin perform private.trait_daily(r.id); exception when others then raise warning 'trait_daily %: %', r.id, sqlerrm; end;
  end loop;
  begin perform private.sun_warm_tick(); exception when others then raise warning 'sun_warm_tick: %', sqlerrm; end;
  begin perform private.trait_tick(); exception when others then raise warning 'trait_tick: %', sqlerrm; end;
end $$;
-- (the Traits' work on the heartbeat: filled in by the next migration)
create or replace function private.trait_tick() returns void language plpgsql as $$ begin null; end $$;

-- the splice no longer drips into a flask
select private.fn_patch('private.ench_act_splice(public.enchantments,text,jsonb,timestamptz)',
  $a$      -- 🧫 the splice drips into the maker's Homunculus
      perform private.homu_drip(e.owner_id, array[x.kind, y.kind, z.kind], v_ab is not null, r ->> 'hybrid');
$a$, '');
select private.fn_patch('private.ench_act_splice(public.enchantments,text,jsonb,timestamptz)', $a$ or (zs.data ? 'coil_by' and not zs.folded)$a$, '');
select private.fn_patch('public.splice_invite_respond(bigint,boolean)',
  $a$  -- 🧫 a friend's splice drips into both players' Homunculi
  perform private.homu_drip(i.from_player, array[x.kind, y.kind], false, v_h ->> 0);
  perform private.homu_drip(v_uid, array[x.kind, y.kind], false, v_h ->> 0);
$a$, '');
select private.fn_patch('public.enchant_merge(uuid,uuid)', $a$ or (data ? 'coil_by' and not folded)$a$, '');
select private.fn_patch('public.enchant_merge(uuid,uuid)', $a$       or (c.kind = 'ouroboros' and jsonb_typeof(c.state -> 'coil') = 'object')
$a$, '');
select private.fn_patch('public.enchant_merge(uuid,uuid)', $a$
       or (c.kind = 'homunculus' and jsonb_typeof(c.state -> 'awake') = 'object') then$a$, ' then');
select private.fn_patch('private.ori_why_not(public.enchantments,public.world_plots)', $a$
                                               or (x.kind = 'homunculus' and jsonb_typeof(x.state -> 'awake') = 'object'))) then return 'enchant_busy'; end if;$a$,
  $b$)) then return 'enchant_busy'; end if;$b$);
select private.fn_patch('private.ench_pay(uuid,numeric,text)', $a$    -- 🧫 Patchwork: this reward borrows a Trait from one of the Homunculus's parts
    if v_gene = 'patchwork' then
      v_gene := private.homu_borrow((p ->> 'id')::uuid);
      v_mods := v_mods || jsonb_build_object('label', 'Patchwork borrowed ' || coalesce(
        (select private.ench_info(kk) ->> 'gene_name' from unnest(private.ench_kinds()) kk where private.ench_info(kk) ->> 'gene' = v_gene limit 1), 'a stitch'), 'emoji', '🧫');
    end if;
$a$, '');
select private.fn_patch('private.ench_minigame_mult__raw(uuid,integer,integer)', $a$    if v_g = 'patchwork' then v_g := private.homu_borrow(sp.eid); end if;
$a$, '');
-- a Mirror Shard never reflects a Dowsing Rod (a Pocket Sun it can)
select private.fn_patch('private.ench_act_shard(public.enchantments,text,jsonb,timestamptz)',
  $a$'ouroboros', 'homunculus', 'stormcoil'$a$, $b$'rod', 'stormcoil'$b$);

-- the plot's minigames: no Homunculus standing on it; a sun in orbit over it warms them
create or replace function private.ench_plot_mult_extra(p_uid uuid, p_gx int, p_gy int) returns numeric language plpgsql as $$
declare m numeric := 1; r record; v_sun numeric := 1;
begin
  -- 🐉 trampled by the Leviathan: 40% less until it's scrubbed
  if exists (select 1 from public.leviathan_trampled where gx = p_gx and gy = p_gy and until > now() and scrubbed_at is null) then m := m * 0.6; end if;
  -- ⚡ a bolt nobody caught scorched it
  if exists (select 1 from public.enchant_buffs where player_id = p_uid and kind = 'scorch' and gx = p_gx and gy = p_gy and expires_at > now()) then m := m * 0.8; end if;
  -- ☀️ under your Pocket Sun in orbit: its warmth (×1.25 warm, ×1.35 hot, ×1.5 white-hot)
  for r in select * from private.sun_live(array[p_uid]) x where x.z ->> 'mode' = 'orbit' loop
    continue when private.ench_cell_m((r.z ->> 'gx')::int, (r.z ->> 'gy')::int, p_gx, p_gy) > (r.z ->> 'r_m')::numeric;
    v_sun := greatest(v_sun, case r.z ->> 'tier' when 'white' then private.ench_n('sun', 'orbit_white', 1.5) when 'hot' then private.ench_n('sun', 'orbit_hot', 1.35) else private.ench_n('sun', 'orbit_x', 1.25) end);
    perform private.ench_stat(r.eid, 'warmed');
  end loop;
  return m * v_sun * private.trait_plot_mult(p_uid, p_gx, p_gy);
end $$;
-- (the Traits' plot powers: filled in by the next migration)
create or replace function private.trait_plot_mult(p_uid uuid, p_gx int, p_gy int) returns numeric language sql stable as $$ select 1::numeric $$;

-- the map: no walkers, no coils; your suns (and your party's shared ones)
create or replace function public.enchant_map2(p_min_gx int, p_min_gy int, p_max_gx int, p_max_gy int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_suns jsonb := '[]'::jsonb;
begin
  if p_max_gx - p_min_gx > 20000 or p_max_gy - p_min_gy > 20000 then
    return jsonb_build_object('suns', '[]'::jsonb, 'storms', '[]'::jsonb, 'server_now', extract(epoch from clock_timestamp()));
  end if;
  if v_uid is not null then
    select coalesce(jsonb_agg(jsonb_build_object('id', x.eid, 'i', x.z -> 'i', 'gx', x.z -> 'gx', 'gy', x.z -> 'gy', 'r_m', x.z -> 'r_m', 'tier', x.z -> 'tier', 'heat', x.z -> 'heat_now',
             'mode', x.z -> 'mode', 'flare', x.z -> 'flare', 'flare_until', x.z -> 'flare_until', 'until', x.z -> 'until', 'party', coalesce(x.z -> 'party', 'false'::jsonb),
             'mine', x.owner_id = v_uid, 'owner_name', pr.username, 'spots', case when x.owner_id = v_uid then coalesce(x.z -> 'spots', '[]'::jsonb) else '[]'::jsonb end,
             'reflected', (select kind from public.enchantments where id = x.eid) = 'shard')), '[]'::jsonb) into v_suns
      from private.sun_live(array[v_uid] || private.party_mates(v_uid)) x left join public.profiles pr on pr.id = x.owner_id
     where (x.owner_id = v_uid or coalesce((x.z ->> 'party')::boolean, false))
       and (x.z ->> 'gx')::int between p_min_gx - 200 and p_max_gx + 200 and (x.z ->> 'gy')::int between p_min_gy - 200 and p_max_gy + 200;
  end if;
  return jsonb_build_object(
    'suns', v_suns,
    'storms', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'gx', e.gx, 'gy', e.gy, 'mine', e.owner_id = v_uid, 'owner_name', pr.username,
                         'at', e.state -> 'storm' -> 'at', 'until', e.state -> 'storm' -> 'until',
                         'bolts', (select coalesce(jsonb_agg(jsonb_build_object('i', b -> 'i', 't', b -> 't', 'gx', b -> 'gx', 'gy', b -> 'gy', 'kind', b ->> 'kind',
                                     'on_mine', v_uid is not null and b ->> 'owner' = v_uid::text) order by (b ->> 'i')::int), '[]'::jsonb)
                                     from jsonb_array_elements(e.state -> 'storm' -> 'bolts') b),
                         'caught', (select coalesce(jsonb_agg(k::int), '[]'::jsonb) from jsonb_object_keys(coalesce(e.state -> 'storm' -> 'caught', '{}'::jsonb)) k)))
                       from public.enchantments e left join public.profiles pr on pr.id = e.owner_id
                      where e.kind = 'stormcoil' and e.status = 'active' and jsonb_typeof(e.state -> 'storm') = 'object'
                        and not coalesce((e.state -> 'storm' ->> 'settled')::boolean, false) and (e.state -> 'storm' ->> 'until')::numeric > extract(epoch from now()) - 5
                        and e.gx between p_min_gx - 300 and p_max_gx + 300 and e.gy between p_min_gy - 300 and p_max_gy + 300), '[]'::jsonb),
    'server_now', extract(epoch from clock_timestamp()));
end $$;

-- ---- the roll: a sun's boost, its sunspots and shine; the rod's dowsing ----------------------------------------------
select private.fn_patch('private.rx_claim_roll(uuid,integer,integer,text)', $a$declare v text := p_rarity; v_alt text;$a$, $b$declare v text := p_rarity; v_alt text; v_sun jsonb;$b$);
select private.fn_patch('private.rx_claim_roll(uuid,integer,integer,text)',
  $a$  if private.rx_has(p_uid, 'loom') then$a$,
  $b$  -- ☀️ inside a Pocket Sun (yours, a party-mate's shared one, or a Radiant plot's): a sun roll, and the better is kept
  v_sun := private.sun_for_claim(p_uid, p_gx, p_gy);
  if v_sun is not null then
    v_alt := private.rx_roll(p_gx, p_gy, 'psun' || (v_sun ->> 'id') || p_uid || private.today()::text, (v_sun ->> 'um')::numeric, coalesce((v_sun ->> 'flare')::boolean, false));
    v := private.rx_best(v, v_alt);
    perform private.sun_claimed(v_sun, p_uid, p_gx, p_gy);
  end if;
  if private.rx_has(p_uid, 'loom') then$b$);
select private.fn_patch('private.rx_claim_bump(uuid,integer,integer)',
  $a$  if b = 0 and private.rx_on_beam(p_uid, p_gx, p_gy) then b := 1; end if;$a$,
  $b$  if b = 0 and private.rx_on_beam(p_uid, p_gx, p_gy) then b := 1; end if;
  -- ☀️ a sunspot of your Pocket Sun
  if b = 0 and private.sun_spot_take(p_uid, p_gx, p_gy) then b := 1; end if;$b$);
create or replace function private.rx_shiny_x(p_uid uuid, p_gx int, p_gy int) returns numeric language sql stable as $$
  select (case when p_uid is not null and private.rx_in_sunspot(p_uid, p_gx, p_gy) and not private.in_hot_zone(p_gx, p_gy) then coalesce((private.cfg('hot_zones') ->> 'shiny_mult')::numeric, 2) else 1 end)
       * (case when private.rx_rule_at(p_gx, p_gy, 'shiny') then private.rx_n('throne_ink', 'shiny', 3) else 1 end)
       -- ☀️ inside your own Pocket Sun
       * (case when p_uid is not null and exists (select 1 from private.sun_live(array[p_uid]) x where x.owner_id = p_uid and x.z ->> 'mode' <> 'orbit'
                                                    and private.ench_cell_m((x.z ->> 'gx')::int, (x.z ->> 'gy')::int, p_gx, p_gy) <= (x.z ->> 'r_m')::numeric)
               then private.ench_n('sun', 'shiny_x', 2) else 1 end)
$$;

-- the claim: the rod dowses it last (after luck, the Primordials and the sun), and then the shine
select private.fn_patch('private.take_plot(uuid,integer,integer,text,jsonb)',
  $a$v_rx boolean := false; v_rx_r text; v_bump int; v_chain jsonb;$a$,
  $b$v_rx boolean := false; v_rx_r text; v_bump int; v_chain jsonb; v_pre text; v_rod jsonb; v_rod_s jsonb; v_rod_ok boolean := false;$b$);
select private.fn_patch('private.take_plot(uuid,integer,integer,text,jsonb)',
  $a$  -- 2% of rolls are Enchanted (never an event roll, never a Crown, never a plot that already holds a sleeping one)$a$,
  $b$  -- (what it would be if it didn't turn out Enchanted — a Dowsing Rod that holds an enchantment back falls back on it)
  v_pre := v_rarity;
  v_rod_ok := p_method in ('acquire', 'starter', 'purchase') and v_grant.id is null and v_base not like 'crown%' and v_sight is null and v_fate is null
              and not exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and rarity = 'enchanted');
  -- 2% of rolls are Enchanted (never an event roll, never a Crown, never a plot that already holds a sleeping one)$b$);
select private.fn_patch('private.take_plot(uuid,integer,integer,text,jsonb)',
  $a$  v_lg := nullif(current_setting('landvas.luck_grant', true), '');$a$,
  $b$  -- 🪄 a Dowsing Rod tuned to a target: harder per roll, certain at full depth
  if v_rod_ok then
    v_rod := private.rod_dowse(p_uid, p_gx, p_gy, v_rarity, v_ench, v_pre);
    if v_rod is not null and coalesce((v_rod ->> 'changed')::boolean, false) then
      v_rarity := v_rod ->> 'rarity'; v_ench := v_rod ->> 'ench'; v_rx := true;
      if v_ench is null and v_base = 'enchanted' then v_base := v_rarity; end if;
      -- (what it brought up, or held back, is final: no Luck choice over it)
      delete from public.luck_choices where player_id = p_uid and gx = p_gx and gy = p_gy and picked is null and created_at = now();
      v_lucky := null;
    end if;
  end if;
  v_lg := nullif(current_setting('landvas.luck_grant', true), '');$b$);
select private.fn_patch('private.take_plot(uuid,integer,integer,text,jsonb)',
  $a$  insert into public.plot_ownership (gx, gy, player_id, method, cost)$a$,
  $b$  if v_rod_ok and v_rarity <> 'enchanted' then v_rod_s := private.rod_shiny(p_uid, p_gx, p_gy); end if;
  insert into public.plot_ownership (gx, gy, player_id, method, cost)$b$);
select private.fn_patch('private.take_plot(uuid,integer,integer,text,jsonb)',
  $a$'chained', v_chain,$a$,
  $b$'chained', v_chain, 'dowsed', case when v_rod is not null or v_rod_s is not null then coalesce(v_rod -> 'info', '[]'::jsonb) || coalesce(v_rod_s, '[]'::jsonb) end,$b$);

-- ---- the Leviathan: Sunburst and Divine ------------------------------------------------------------------------------
create or replace function private.lev_move(p_kind text) returns jsonb language sql immutable as $$
  select (('{"goose": ["Egg Bomb", 1.0, 1.0, null], "genie": ["Wish of Ruin", 0.4, 2.4, null], "map": ["Buried Cannon", 1.1, 1.1, null],
            "parasite": ["Leech", 1.0, 1.0, null], "pandora": ["Unleash an Evil", 0.5, 2.0, null],
            "splice": ["Chimera Strike", 1.3, 1.3, null], "clockwork": ["Freeze Time", 0.4, 0.4, "freeze"], "sizeray": ["Shrink Ray", 0.4, 0.4, "shrink"],
            "shard": ["Reflect the Roar", 1.2, 1.2, null], "wormhole": ["Pull Through", 0.6, 0.6, "pull"], "oracle": ["Foretell the Weak Spot", 0.4, 0.4, "foretell"],
            "stormcoil": ["Lightning Strike", 1.0, 1.8, null],
            "spyglass": ["Weak Spot", 0.4, 0.4, "weakspot"], "origami": ["Paper Shield", 0.6, 0.6, "shield"], "crucible": ["Molten Pour", 1.1, 2.1, null],
            "puppeteer": ["Tangle", 0.5, 0.5, "tangle"], "deck": ["The Tower", 1.0, 5.0, null], "glyph": ["Thunder Glyph", 0.6, 2.6, "glyph"],
            "sun": ["Sunburst", 0.9, 1.4, "sunburst"], "rod": ["Divine", 0.6, 0.9, "divine"]}'::jsonb) -> p_kind)
$$;
create or replace function private.lev_mult(l public.leviathans) returns numeric language sql stable as $$
  select (case when l.shrunk_until > now() then 1.5 else 1 end) * (case when l.foretold_until > now() then 1.25 else 1 end) * (case when l.weakspot_until > now() then 2 else 1 end)
       * (case when l.sunburst_until > now() then 1.5 else 1 end) * (case when l.divined_until > now() then 1.2 else 1 end)
$$;
select private.fn_patch('public.leviathan_hit(text,integer,uuid)',
  $a$      when 'tangle' then perform private.lev_pause(l.id, 600);$a$,
  $b$      when 'tangle' then perform private.lev_pause(l.id, 600);
      -- ☀️ Sunburst: everyone's hits ×1.5 for 30 seconds
      when 'sunburst' then update public.leviathans set sunburst_until = greatest(coalesce(sunburst_until, now()), now()) + interval '30 seconds' where id = l.id;
      -- 🪄 Divine: +20% for 20 seconds, and it can't hide
      when 'divine' then
        update public.leviathans set divined_until = greatest(coalesce(divined_until, now()), now()) + interval '20 seconds' where id = l.id;
        if private.lev_hidden(l) then update public.leviathans set hidden_until = null where id = l.id; v_eff := 'reveal'; end if;$b$);
select private.fn_patch('public.leviathan_hit(text,integer,uuid)',
  $a$when 'tangle' then ' — tangled in the strings'$a$,
  $b$when 'tangle' then ' — tangled in the strings' when 'sunburst' then ' — everyone hits ×1.5 for 30 s!' when 'divine' then ' — everyone hits +20% for 20 s'$b$);
select private.fn_patch('private.lev_state(uuid,boolean)',
  $a$'weakspot_until', case when l.weakspot_until > now() then l.weakspot_until end,$a$,
  $b$'weakspot_until', case when l.weakspot_until > now() then l.weakspot_until end,
             'sunburst_until', case when l.sunburst_until > now() then l.sunburst_until end, 'divined_until', case when l.divined_until > now() then l.divined_until end,$b$);

-- ---- titles and stars -------------------------------------------------------------------------------------------------
select private.fn_patch('private.ench_titles(public.enchantments)',
  $a$    case when e.kind = 'ouroboros' and coalesce((e.stats ->> 'circles')::int, 0) >= 1 then 'Eternal' end,
    case when e.kind = 'ouroboros' and coalesce((e.stats ->> 'clean')::int, 0) >= 10 then 'Tail-Catcher' end,
    case when e.kind = 'ouroboros' and coalesce((e.stats ->> 'bites')::int, 0) >= 3 then 'Snakeskin' end,
    case when e.kind = 'homunculus' and coalesce((e.stats ->> 'wakes')::int, 0) >= 1 then 'Alchemist' end,
    case when e.kind = 'homunculus' and coalesce((e.stats ->> 'hearts')::int, 0) >= 3 then 'Generations' end,
    case when e.kind = 'homunculus' and coalesce((e.stats ->> 'max_parts')::int, 0) >= 7 then 'Many Limbs' end,$a$,
  $b$    case when e.kind = 'sun' and coalesce((e.stats ->> 'ignites')::int, 0) >= 10 then 'Sunkeeper' end,
    case when e.kind = 'sun' and coalesce((e.stats ->> 'perfect_flares')::int, 0) >= 5 then 'Corona' end,
    case when e.kind = 'sun' and coalesce((e.stats ->> 'sunspots')::int, 0) >= 10 then 'Sunspotter' end,
    case when e.kind = 'rod' and coalesce((e.stats ->> 'dowsed')::int, 0) >= 1 then 'Diviner' end,
    case when e.kind = 'rod' and coalesce((e.stats ->> 'deep_dowsed')::int, 0) >= 1 then 'Deep Diviner' end,
    case when e.kind = 'rod' and coalesce((e.stats ->> 'dowsed')::int, 0) >= 10 then 'Lodefinder' end,$b$);
select private.fn_patch('private.ench_star_powers(text)',
  $a$    when 'ouroboros' then '[{"name": "Thick Scales", "emoji": "🛡️", "text": "Every loop is 25% less likely to bite."},
                            {"name": "Shed Skin", "emoji": "🐍", "text": "A bite takes only half the bank: the rest is paid."},
                            {"name": "World Serpent", "emoji": "🌍", "text": "Every loop banks double Ink."}]'
    when 'homunculus' then '[{"name": "Quickening", "emoji": "⚡", "text": "Wakes with one part fewer."},
                             {"name": "Long Life", "emoji": "🕯️", "text": "Walks 10 days, not 7, and can be led 3 times a day."},
                             {"name": "Philosopher’s Heart", "emoji": "❤️‍🔥", "text": "Its heart pays double and brings one more Enchanted Luck."}]'$a$,
  $b$    when 'sun' then '[{"name": "Corona", "emoji": "🌞", "text": "Its zone is 50% wider."},
                      {"name": "Long Day", "emoji": "🌅", "text": "A sun burns 12 hours, not 6."},
                      {"name": "Binary Star", "emoji": "✨", "text": "Two suns at once — and two a day."}]'
    when 'rod' then '[{"name": "Supple Fork", "emoji": "🌿", "text": "Full depth comes 15% sooner."},
                      {"name": "Deep Well", "emoji": "💧", "text": "Retuning keeps half of how deep it was."},
                      {"name": "Divining Walk", "emoji": "🚶", "text": "Once a day it walks the map near you and twitches over a spot that would read as its target."}]'$b$);

-- ---- the old functions go --------------------------------------------------------------------------------------------
drop function if exists private.ench_act_ouroboros(public.enchantments, text, jsonb, timestamptz);
drop function if exists private.ench_view_ouroboros(public.enchantments, timestamptz);
drop function if exists private.ench_act_homunculus(public.enchantments, text, jsonb, timestamptz);
drop function if exists private.ench_view_homunculus(public.enchantments, timestamptz);
drop function if exists public.homunculus_greet(uuid);
do $$
declare f record;
begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private' and (p.proname like 'ouro\_%' or p.proname like 'homu\_%' or p.proname = 'endless_renew') loop
    execute 'drop function if exists ' || f.sig;
  end loop;
end $$;

-- the Traits' work, kept per kind
revoke all on function private.ench_act_sun(public.enchantments, text, jsonb, timestamptz) from public;
revoke all on function private.ench_act_rod(public.enchantments, text, jsonb, timestamptz) from public;
