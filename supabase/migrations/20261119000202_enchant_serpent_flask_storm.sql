-- Enchantments, part 4: three made for splicing, and more ways to get Splice charges.
--
--  🐍 Ouroboros   coil it around any splice you have running (not a Graft). When the splice would end it loops instead:
--                 every loop (12 h; 6 h while it's spliced with a Clockwork) the hybrid's Traits grow (×2 from loop 2, ×3
--                 from loop 4) and Ink is banked — but each loop is likelier to bite through (0, 10, 20, 35, 50, 60, 70%).
--                 A bite snaps the splice, loses the bank, and the serpent sheds its skin for a day. Catch the tail (a
--                 timing tap) before a loop to halve its risk. Break the circle to cash out. Survive 7 loops and the
--                 circle closes: you choose which Aberration the hybrid becomes. A coiled unstable Chimera is steadied.
--                 Trait: Endless (+10% Ink, and its splice renews itself when it ends).
--  🧫 Homunculus  every splice you make drips into its flask: it grows a body part from each enchantment in it (a part it
--                 already has grows instead; an Aberration's parts glow and count double). At 5 it can wake (4 while it's
--                 spliced with a Storm Coil) and walks out onto the map for 7 days, moving between your plots every 2 hours
--                 (you can lead it). The plot it stands on wears its parts in its minigames. Anyone can greet it. Then it
--                 melts into a Heart — Ink, Enchanted Luck and a Splice charge — and keeps one part for the next one.
--                 Trait: Patchwork (every reward borrows a surprise Trait from its parts).
--  ⚡ Storm Coil  crank it full, then call a 3-minute thunderstorm over your plots. Bolts strike your spliced enchantments
--                 and your plots — tap them as they land. A bolt on a hybrid mutates it: +6 h, a surge (its Traits doubled),
--                 an overcharge (its next reward ×2) or, 1 in 6, an Aberration. Bolts on plots pay Ink; missed ones can
--                 scorch the plot (its minigames −20% for an hour). Stray bolts land on neighbours' plots, and anyone can
--                 catch those. Trait: Charged (+25% Ink, and a splice with it is 3× as likely to mutate).
--  🧪 Splice      more charges: the more plots you own, the more it holds and the faster they come back (2 → 5, 36 h → 20 h);
--                 buy one with Ink (300, then 600, then 1,200 a day); crack an Inkborn egg into it (2 a day); a Golden
--                 Goose egg sometimes carries a spark (a Platinum one always does); a Homunculus's Heart brings one.
--                 Spare charges (bought, cracked, sparked) don't count against the lab's limit and never go to waste.

-- ---- kinds -----------------------------------------------------------------------------------------------------------
alter table public.enchantments drop constraint if exists enchantments_kind_check;
alter table public.enchantments add constraint enchantments_kind_check
  check (kind in ('goose', 'genie', 'map', 'parasite', 'cuckoo', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard', 'wormhole', 'oracle',
                  'ouroboros', 'homunculus', 'stormcoil'));

-- the three new kinds roll as often as the others (keeping any weights the owner already set)
update public.game_config set value = jsonb_set(value, '{weights}', '{"ouroboros": 1, "homunculus": 1, "stormcoil": 1}'::jsonb || coalesce(value -> 'weights', '{}'::jsonb))
 where key = 'enchantments';

create index if not exists enchant_splices_open on public.enchant_splices (ends_at) where not folded;

create or replace function private.ench_kinds() returns text[] language sql immutable as $$
  select array['goose', 'genie', 'map', 'parasite', 'cuckoo', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard', 'wormhole', 'oracle',
               'ouroboros', 'homunculus', 'stormcoil']
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
    when 'ouroboros' then '{"name": "Ouroboros", "emoji": "🐍", "gene": "endless", "gene_name": "Endless"}'
    when 'homunculus' then '{"name": "Homunculus", "emoji": "🧫", "gene": "patchwork", "gene_name": "Patchwork"}'
    when 'stormcoil' then '{"name": "Storm Coil", "emoji": "⚡", "gene": "charged", "gene_name": "Charged"}'
  end::jsonb
$$;

/** the 91 two-way hybrids: a name, and whether the pair is a Perfect Match (traits doubled) */
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
      "clockwork+oracle": ["Clock of Ages", false], "oracle+sizeray": ["Far-Sight Ray", false], "oracle+shard": ["Scrying Glass", false],
      "goose+ouroboros": ["Eternal Egg", false], "genie+ouroboros": ["Undying Djinn", false], "map+ouroboros": ["Map of Return", false],
      "ouroboros+parasite": ["Tail-Eater Worm", false], "cuckoo+ouroboros": ["Ever-Nest", false], "ouroboros+pandora": ["Box Without End", false],
      "clockwork+ouroboros": ["Infinity Clock", true], "ouroboros+sizeray": ["Coil Titan", false], "ouroboros+shard": ["Endless Mirror", true],
      "ouroboros+wormhole": ["Möbius Gate", false], "oracle+ouroboros": ["Eye of Eternity", false],
      "goose+homunculus": ["Golem Hen", false], "genie+homunculus": ["Flask Djinn", true], "homunculus+map": ["Patchwork Atlas", false],
      "homunculus+parasite": ["Flesh-Weaver", true], "cuckoo+homunculus": ["Changeling Child", false], "homunculus+pandora": ["Box of Limbs", false],
      "clockwork+homunculus": ["Clockwork Golem", false], "homunculus+sizeray": ["Titan-Born", false], "homunculus+shard": ["Glass Golem", false],
      "homunculus+wormhole": ["Walker Between", false], "homunculus+oracle": ["Many-Eyed Child", false],
      "goose+stormcoil": ["Thunder Goose", false], "genie+stormcoil": ["Storm Djinn", false], "map+stormcoil": ["Map of Storms", false],
      "parasite+stormcoil": ["Galvanic Leech", false], "cuckoo+stormcoil": ["Thunderbird", true], "pandora+stormcoil": ["Box of Thunder", false],
      "clockwork+stormcoil": ["Dynamo Clock", false], "sizeray+stormcoil": ["Plasma Ray", false], "shard+stormcoil": ["Fulgurite", false],
      "stormcoil+wormhole": ["Storm Gate", false], "oracle+stormcoil": ["Eye of the Storm", true],
      "homunculus+ouroboros": ["Undying Child", false], "homunculus+stormcoil": ["Galvanized Golem", true], "ouroboros+stormcoil": ["Storm Serpent", false]}'::jsonb
    -> (least(p_a, p_b) || '+' || greatest(p_a, p_b))), '["Chimera", false]'::jsonb)
$$;

create or replace function private.ench_word(p_kind text, p_part text) returns text language sql immutable as $$
  select ('{"goose": ["Golden", "Hen"], "genie": ["Wishing", "Djinn"], "map": ["Treasure", "Atlas"], "parasite": ["Hungering", "Worm"],
           "cuckoo": ["Trickster", "Roc"], "pandora": ["Cursed", "Box"], "clockwork": ["Ticking", "Engine"], "sizeray": ["Giant", "Titan"],
           "shard": ["Mirrored", "Glass"], "wormhole": ["Warped", "Gate"], "oracle": ["All-Seeing", "Eye"], "splice": ["Spliced", "Chimera"],
           "ouroboros": ["Endless", "Serpent"], "homunculus": ["Patchwork", "Golem"], "stormcoil": ["Charged", "Storm"]}'::jsonb
          -> p_kind ->> case when p_part = 'adj' then 0 else 1 end)
$$;

/** what each enchantment does to the Leviathan: [move name, damage factor (lo, hi), effect] */
create or replace function private.lev_move(p_kind text) returns jsonb language sql immutable as $$
  select (('{"goose": ["Egg Bomb", 1.0, 1.0, null], "genie": ["Wish of Ruin", 0.4, 2.4, null], "map": ["Buried Cannon", 1.1, 1.1, null],
            "parasite": ["Leech", 1.0, 1.0, null], "cuckoo": ["Decoy Egg", 0.6, 0.6, "decoy"], "pandora": ["Unleash an Evil", 0.5, 2.0, null],
            "splice": ["Chimera Strike", 1.3, 1.3, null], "clockwork": ["Freeze Time", 0.4, 0.4, "freeze"], "sizeray": ["Shrink Ray", 0.4, 0.4, "shrink"],
            "shard": ["Reflect the Roar", 1.2, 1.2, null], "wormhole": ["Pull Through", 0.6, 0.6, "pull"], "oracle": ["Foretell the Weak Spot", 0.4, 0.4, "foretell"],
            "ouroboros": ["Constrict", 0.8, 1.6, null], "homunculus": ["Patchwork Punch", 0.5, 2.0, null], "stormcoil": ["Lightning Strike", 1.0, 1.8, null]}'::jsonb) -> p_kind)
$$;

/** how strong a splice row is for one side: 1 normal, 2 a Perfect Match / Graft / Chimera / a coil's second loop / a storm's
    surge, 3 an Aberration / a coil from its fourth loop */
create or replace function private.splice_strength(p_mode text, p_data jsonb, p_me text, p_other text) returns int language sql immutable as $$
  select greatest(
    case when p_data ? 'aberration' then 3
         when p_mode in ('graft', 'chimera') then 2
         when p_mode = 'plot' then 1
         when p_other is not null and (private.ench_hybrid(p_me, p_other) ->> 1)::boolean then 2
         else 1 end,
    least(3, coalesce((p_data ->> 'coil_k')::int, 0)),
    least(3, coalesce((p_data ->> 'storm_k')::int, 0)))
$$;

/** is this enchantment busy in a splice? (a coiled splice stays busy across a loop boundary until it's settled) */
create or replace function private.ench_spliced(p_id uuid) returns boolean language sql stable as $$
  select exists (select 1 from public.enchant_splices where (a = p_id or b = p_id) and (ends_at > now() or (data ? 'coil_by' and not folded)))
$$;

-- ==== 🧪 SPLICE CHARGES ===================================================================================================
/** the lab: the more plots you own, the more charges a Splice holds and the faster they come back */
create or replace function private.splice_lab(p_uid uuid) returns jsonb language plpgsql stable as $$
declare n int := 0; th int[] := array[0, 25, 75, 150, 300]; mx int[] := array[2, 3, 3, 4, 5]; rh numeric[] := array[36, 32, 28, 24, 20];
  i int := 1; j int; v_base numeric := private.ench_n('splice', 'recharge_h', 36);
begin
  if p_uid is not null then select count(*) into n from public.world_plots where owner_id = p_uid; end if;
  for j in 1 .. 5 loop if n >= th[j] then i := j; end if; end loop;
  return jsonb_build_object('plots', n, 'tier', i, 'max', mx[i], 'recharge_h', round(rh[i] * v_base / 36, 2),
    'next_plots', case when i < 5 then th[i + 1] end, 'next_max', case when i < 5 then mx[i + 1] end,
    'next_recharge_h', case when i < 5 then round(rh[i + 1] * v_base / 36, 2) end);
end $$;

/** how many of something a player has done today (charges bought, eggs cracked) */
create or replace function private.splice_today(p_uid uuid, p_kind text) returns int language sql stable as $$
  select count(*)::int from public.enchant_buffs where player_id = p_uid and kind = p_kind and created_at >= private.day_start(now())
$$;
create or replace function private.splice_shop(p_uid uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('bought', b, 'per_day', pd, 'price', case when b < pd then round(private.ench_n('splice', 'buy_ink', 300) * power(2, b))::bigint end,
                            'eggs', g, 'eggs_per_day', ed, 'bonus_max', private.ench_n('splice', 'bonus_max', 6)::int,
                            'spark_pct', round(private.ench_n('splice', 'goose_spark', 0.2) * 100))
  from (select private.splice_today(p_uid, 'splice_buy') b, private.ench_n('splice', 'buy_per_day', 3)::int pd,
               private.splice_today(p_uid, 'splice_egg') g, private.ench_n('splice', 'eggs_per_day', 2)::int ed) x
$$;

/** natural charges (they come back by themselves, up to the lab's limit) and spare ones (bought, cracked, sparked) */
create or replace function private.splice_eval(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); lab jsonb := private.splice_lab(e.owner_id);
  v_max int := (lab ->> 'max')::int; v_rech numeric := (lab ->> 'recharge_h')::numeric * 3600;
  v_c int := coalesce((s ->> 'charges')::int, 0); v_at numeric := coalesce((s ->> 'charge_at')::numeric, v_now); v_n int; v_b int := coalesce((s ->> 'bonus')::int, 0);
begin
  if v_c < v_max then v_n := floor((v_now - v_at) / v_rech)::int; v_c := least(v_max, v_c + greatest(v_n, 0)); end if;
  return jsonb_build_object('charges', v_c + v_b, 'natural', v_c, 'bonus', v_b, 'max', v_max, 'recharge_h', lab -> 'recharge_h', 'lab', lab,
    'next_in', case when v_c < v_max then greatest(0, round(v_rech - mod(greatest(v_now - v_at, 0), v_rech))) end,
    'shop', private.splice_shop(e.owner_id),
    'eggs', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'kind', g.kind, 'shell', g.shell, 'mutated', g.mutated) order by g.laid_at)
                        from (select * from public.inkborn_eggs where owner_id = e.owner_id and hatched_inkborn is null and hatched_at is null order by laid_at limit 12) g), '[]'::jsonb));
end $$;

/** a spare charge lands in one of a player's Splices (the emptiest); null if they have none with room */
create or replace function private.splice_spark(p_uid uuid, p_from text) returns uuid language plpgsql as $$
declare x public.enchantments; v_max int := private.ench_n('splice', 'bonus_max', 6)::int;
begin
  if p_uid is null then return null; end if;
  select * into x from public.enchantments where owner_id = p_uid and kind = 'splice' and status = 'active' and coalesce((state ->> 'bonus')::int, 0) < v_max
   order by coalesce((state ->> 'bonus')::int, 0), born_at limit 1 for update;
  if x.id is null then return null; end if;
  update public.enchantments set state = state || jsonb_build_object('bonus', coalesce((state ->> 'bonus')::int, 0) + 1), updated_at = now() where id = x.id;
  perform private.ench_stat(x.id, 'spares');
  perform private.ench_event(x.id, 'charge', jsonb_build_object('from', p_from));
  return x.id;
end $$;

-- ==== 🧫 HOMUNCULUS helpers (the splice drips into it) =====================================================================
/** how much the flask holds toward waking: a part counts 1, a glowing (Aberration) part 2 */
create or replace function private.homu_weight(p_parts jsonb) returns int language sql immutable as $$
  select coalesce(sum(case when coalesce((p ->> 'glow')::boolean, false) then 2 else 1 end), 0)::int from jsonb_array_elements(coalesce(p_parts, '[]'::jsonb)) p
$$;
/** what one part adds to a plot's minigames (before its level and glow) */
create or replace function private.homu_part_bonus(p_gene text) returns numeric language sql immutable as $$
  select case p_gene when 'golden' then 0.25 when 'grow' then 0.4 when 'chaos' then 0.2 when 'seek' then 0.15 when 'spread' then 0.1 when 'echo' then 0.2
    when 'wish' then 0.15 when 'trick' then 0.1 when 'tempo' then 0.15 when 'linked' then 0.2 when 'foresight' then 0.1 when 'endless' then 0.1
    when 'charged' then 0.15 else 0.1 end::numeric
$$;
/** what the plot it stands on gets: every part adds its share (more at higher levels, half again glowing), up to +150% */
create or replace function private.homu_mult(p_parts jsonb) returns numeric language sql stable as $$
  select 1 + least(private.ench_n('homunculus', 'boost_cap', 1.5), coalesce(sum(private.homu_part_bonus(private.ench_info(p ->> 'k') ->> 'gene')
                 * (0.6 + 0.4 * least(3, greatest(1, coalesce((p ->> 'lv')::int, 1))))
                 * case when coalesce((p ->> 'glow')::boolean, false) then 1.5 else 1 end), 0))
  from jsonb_array_elements(coalesce(p_parts, '[]'::jsonb)) p
$$;
/** where a walking Homunculus is (by its own clock): where it was led, or the plot its walk has reached; null in the flask or melted */
create or replace function private.homu_pos(p_aw jsonb, p_now numeric) returns int[] language plpgsql immutable as $$
declare n int; v_step numeric; i int;
begin
  if p_aw is null or jsonb_typeof(p_aw) <> 'object' or p_now >= (p_aw ->> 'until')::numeric then return null; end if;
  if jsonb_typeof(p_aw -> 'lead') = 'object' and p_now < (p_aw -> 'lead' ->> 'until')::numeric then
    return array[(p_aw -> 'lead' ->> 'gx')::int, (p_aw -> 'lead' ->> 'gy')::int];
  end if;
  n := jsonb_array_length(coalesce(p_aw -> 'plots', '[]'::jsonb));
  if n = 0 then return null; end if;
  v_step := floor(greatest(0, p_now - (p_aw ->> 'at')::numeric) / greatest(600, coalesce((p_aw ->> 'step_s')::numeric, 7200)));
  i := abs(hashtext((p_aw ->> 'seed') || ':' || v_step::text)) % n;
  return array[(p_aw -> 'plots' -> i ->> 0)::int, (p_aw -> 'plots' -> i ->> 1)::int];
end $$;
/** Patchwork: a Trait borrowed at random from a Homunculus's parts */
create or replace function private.homu_borrow(p_id uuid) returns text language sql volatile as $$
  select coalesce((select private.ench_info(p ->> 'k') ->> 'gene' from public.enchantments h cross join lateral jsonb_array_elements(coalesce(h.state -> 'parts', '[]'::jsonb)) p
                    where h.id = p_id and private.ench_info(p ->> 'k') ->> 'gene' is not null and private.ench_info(p ->> 'k') ->> 'gene' <> 'patchwork'
                    order by random() limit 1), 'homely')
$$;

/** a splice drips into every Homunculus its maker owns: a new part for each enchantment in it, or a part that grows */
create or replace function private.homu_drip(p_uid uuid, p_kinds text[], p_ab boolean, p_hybrid text) returns void language plpgsql as $$
declare h public.enchantments; k text; v_parts jsonb; v_i int; v_max int := private.ench_n('homunculus', 'max_parts', 7)::int; v_new jsonb; v_grew jsonb;
begin
  if p_uid is null then return; end if;
  for h in select * from public.enchantments where owner_id = p_uid and kind = 'homunculus' and status = 'active' order by born_at for update loop
    v_parts := coalesce(h.state -> 'parts', '[]'::jsonb); v_new := '[]'::jsonb; v_grew := '[]'::jsonb;
    foreach k in array coalesce(p_kinds, '{}'::text[]) loop
      if k is null or k in ('homunculus', 'splice') then continue; end if;
      v_i := null;
      select (q.o - 1)::int into v_i from jsonb_array_elements(v_parts) with ordinality q(p, o) where q.p ->> 'k' = k limit 1;
      if v_i is not null then
        v_parts := jsonb_set(v_parts, array[v_i::text], (v_parts -> v_i) || jsonb_build_object('lv', least(3, coalesce((v_parts -> v_i ->> 'lv')::int, 1) + 1))
                              || case when coalesce(p_ab, false) then '{"glow": true}'::jsonb else '{}'::jsonb end);
        v_grew := v_grew || to_jsonb(k);
      elsif jsonb_array_length(v_parts) < v_max then
        v_parts := v_parts || jsonb_build_array(jsonb_build_object('k', k, 'lv', 1, 'glow', coalesce(p_ab, false), 'from', p_hybrid));
        v_new := v_new || to_jsonb(k);
      end if;
    end loop;
    if jsonb_array_length(v_new) + jsonb_array_length(v_grew) > 0 then
      update public.enchantments set state = state || jsonb_build_object('parts', v_parts), updated_at = now(),
             stats = stats || jsonb_build_object('max_parts', greatest(coalesce((stats ->> 'max_parts')::int, 0), jsonb_array_length(v_parts))) where id = h.id;
      perform private.ench_event(h.id, 'drip', jsonb_build_object('hybrid', p_hybrid, 'new', v_new, 'grew', v_grew, 'glow', coalesce(p_ab, false)));
      perform private.ench_xp(h.id, 1);
    end if;
  end loop;
end $$;

-- ==== 🧪 SPLICE: charges come from everywhere; a Storm Coil charges a splice; every splice drips into a Homunculus ==========
create or replace function private.ench_act_splice(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); g jsonb := private.splice_eval(e, t); x public.enchantments; y public.enchantments; z public.enchantments; r jsonb;
  v_key text; v_h jsonb; v_max int := (g ->> 'max')::int; v_rech numeric := (g ->> 'recharge_h')::numeric * 3600; v_nat int := (g ->> 'natural')::int;
  v_bonus int := (g ->> 'bonus')::int; v_c int := (g ->> 'charges')::int; v_new boolean; v_mode text := coalesce(a ->> 'mode', 'swap');
  v_hrs numeric; v_cost int; v_take int; v_data jsonb := '{}'::jsonb; v_grp uuid; v_name text; v_ab text; v_pk text; v_pay jsonb; sp record; v_inv bigint;
  v_abp numeric; v_shop jsonb; v_price bigint; v_egg public.inkborn_eggs; v_bmax int := private.ench_n('splice', 'bonus_max', 6)::int;
begin
  -- natural charges that came back since the last look are written down (and the clock rests while it's full)
  if v_nat <> coalesce((s ->> 'charges')::int, 0) then s := s || jsonb_build_object('charge_at', coalesce((s ->> 'charge_at')::numeric, v_now) + (v_nat - coalesce((s ->> 'charges')::int, 0)) * v_rech); end if;
  if v_nat >= v_max then s := s || jsonb_build_object('charge_at', v_now); end if;
  s := s || jsonb_build_object('charges', v_nat, 'bonus', v_bonus);
  case p_action
    when 'splice' then
      if v_mode not in ('swap', 'graft', 'chimera', 'trinity', 'plot', 'friend') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
      v_cost := case when v_mode = 'trinity' then 2 else 1 end;
      if v_c < v_cost then raise exception 'no_charges' using errcode = 'P0001'; end if;
      if exists (select 1 from public.enchant_splices zs where zs.splice_id = e.id and (zs.ends_at > now() or (zs.data ? 'coil_by' and not zs.folded))) then raise exception 'splice_active' using errcode = 'P0001'; end if;
      if exists (select 1 from public.enchant_splice_invites where splice_id = e.id and status = 'pending' and expires_at > now()) then raise exception 'invite_pending' using errcode = 'P0001'; end if;
      select * into x from public.enchantments where id = (a ->> 'a')::uuid for update;
      if not private.splice_can(x, e.owner_id) then raise exception 'bad_target' using errcode = 'P0001'; end if;
      -- natural charges first, then spare ones
      v_take := least(v_nat, v_cost);
      s := s || jsonb_build_object('charges', v_nat - v_take, 'bonus', v_bonus - (v_cost - v_take));
      v_hrs := case v_mode when 'graft' then 12 when 'chimera' then 12 when 'trinity' then 18 else private.ench_n('splice', 'hours', 24) end;
      if v_mode = 'friend' then
        select * into y from public.enchantments where id = (a ->> 'b')::uuid for update;
        if y.id is null or y.status <> 'active' or y.kind = 'splice' or y.owner_id is null or y.owner_id = e.owner_id or private.ench_spliced(y.id) then raise exception 'bad_target' using errcode = 'P0001'; end if;
        if private.friend_state(e.owner_id, y.owner_id) is distinct from 'friends' then raise exception 'not_friends' using errcode = 'P0001'; end if;
        insert into public.enchant_splice_invites (splice_id, from_player, to_player, a, b) values (e.id, e.owner_id, y.owner_id, x.id, y.id) returning id into v_inv;
        perform private.notify(y.owner_id, 'enchant', e.owner_id, jsonb_build_object('sub', 'splice_invite', 'kind', 'splice', 'invite', v_inv,
          'hybrid', private.ench_hybrid(x.kind, y.kind) ->> 0, 'a', x.kind, 'b', y.kind));
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
        -- a Storm Coil in the splice: Charged, three times as likely to mutate
        v_abp := private.ench_n('splice', 'aberration', 0.05) * case when 'stormcoil' in (x.kind, y.kind) then private.ench_n('stormcoil', 'charged_x', 3) else 1 end;
        if v_mode in ('swap', 'chimera') and random() < v_abp then
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
      perform private.ench_stat(e.id, 'splices');
      perform private.ench_xp(e.id, 2);
      perform private.ench_event(e.id, 'spliced', jsonb_build_object('hybrid', r ->> 'hybrid', 'resonant', coalesce((r ->> 'perfect')::boolean, false), 'a', x.kind, 'b', coalesce(r ->> 'b', r ->> 'plot_kind'), 'mode', v_mode, 'new', v_new));
      perform private.ench_event(x.id, 'spliced', jsonb_build_object('hybrid', r ->> 'hybrid', 'with', coalesce(r ->> 'b', 'plot')));
      if y.id is not null then perform private.ench_event(y.id, 'spliced', jsonb_build_object('hybrid', r ->> 'hybrid', 'with', x.kind)); end if;
      -- 🧫 the splice drips into the maker's Homunculus
      perform private.homu_drip(e.owner_id, array[x.kind, y.kind, z.kind], v_ab is not null, r ->> 'hybrid');
      r := r || jsonb_build_object('ends_at', now() + make_interval(secs => (v_hrs * 3600)::double precision), 'hours', v_hrs);
    when 'buy' then
      -- a spare charge for Ink (the price doubles with each one bought today)
      v_shop := private.splice_shop(e.owner_id);
      if v_bonus >= v_bmax then raise exception 'charges_full' using errcode = 'P0001'; end if;
      if (v_shop ->> 'price') is null then raise exception 'bought_out' using errcode = 'P0001'; end if;
      v_price := (v_shop ->> 'price')::bigint;
      perform private.charge(e.owner_id, jsonb_build_object('ink', v_price), 'enchantment', 'splice_charge', e.id::text, 'splice-buy:' || e.id || ':' || gen_random_uuid());
      insert into public.enchant_buffs (player_id, kind, enchant_id, mult, data, expires_at)
      values (e.owner_id, 'splice_buy', e.id, 1, jsonb_build_object('ink', v_price), private.day_start(now()) + interval '2 days');
      s := s || jsonb_build_object('bonus', v_bonus + 1);
      perform private.ench_stat(e.id, 'spares');
      perform private.ench_event(e.id, 'charge', jsonb_build_object('from', 'ink', 'ink', v_price));
      r := jsonb_build_object('bought', 1, 'ink', v_price, 'shop', private.splice_shop(e.owner_id));
    when 'egg' then
      -- crack an unhatched Inkborn egg into the vat
      v_shop := private.splice_shop(e.owner_id);
      if v_bonus >= v_bmax then raise exception 'charges_full' using errcode = 'P0001'; end if;
      if (v_shop ->> 'eggs')::int >= (v_shop ->> 'eggs_per_day')::int then raise exception 'eggs_today' using errcode = 'P0001'; end if;
      select * into v_egg from public.inkborn_eggs where id = (a ->> 'egg')::uuid and owner_id = e.owner_id and hatched_inkborn is null and hatched_at is null for update;
      if v_egg.id is null then raise exception 'bad_target' using errcode = 'P0001'; end if;
      delete from public.inkborn_eggs where id = v_egg.id;
      insert into public.enchant_buffs (player_id, kind, enchant_id, mult, data, expires_at)
      values (e.owner_id, 'splice_egg', e.id, 1, jsonb_build_object('egg', v_egg.kind), private.day_start(now()) + interval '2 days');
      s := s || jsonb_build_object('bonus', v_bonus + 1);
      perform private.ench_stat(e.id, 'spares');
      perform private.ench_event(e.id, 'charge', jsonb_build_object('from', 'egg', 'egg', v_egg.kind));
      r := jsonb_build_object('cracked', true, 'egg', v_egg.kind, 'shop', private.splice_shop(e.owner_id));
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
        s := case when v_nat < v_max then s || jsonb_build_object('charges', v_nat + 1) else s || jsonb_build_object('bonus', v_bonus + 1) end;
        r := jsonb_build_object('cancelled', true);
      else
        r := jsonb_build_object('unspliced', true);
      end if;
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

/** a charge given back (a declined invitation): natural if there's room, spare if not */
create or replace function private.splice_refund(p_id uuid) returns void language plpgsql as $$
declare e public.enchantments; g jsonb;
begin
  select * into e from public.enchantments where id = p_id for update;
  if e.id is null then return; end if;
  g := private.splice_eval(e, private.ench_now(e));
  if (g ->> 'natural')::int < (g ->> 'max')::int then
    update public.enchantments set state = state || jsonb_build_object('charges', (g ->> 'natural')::int + 1,
      'charge_at', case when (g ->> 'natural')::int <> coalesce((state ->> 'charges')::int, 0)
                        then coalesce((state ->> 'charge_at')::numeric, private.ench_ep(now())) + ((g ->> 'natural')::int - coalesce((state ->> 'charges')::int, 0)) * (g ->> 'recharge_h')::numeric * 3600
                        else coalesce((state ->> 'charge_at')::numeric, private.ench_ep(now())) end) where id = p_id;
  else
    update public.enchantments set state = state || jsonb_build_object('bonus', coalesce((state ->> 'bonus')::int, 0) + 1) where id = p_id;
  end if;
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
    perform private.splice_refund(i.splice_id);
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
  -- 🧫 a friend's splice drips into both players' Homunculi
  perform private.homu_drip(i.from_player, array[x.kind, y.kind], false, v_h ->> 0);
  perform private.homu_drip(v_uid, array[x.kind, y.kind], false, v_h ->> 0);
  perform private.notify(i.from_player, 'enchant', v_uid, jsonb_build_object('sub', 'splice_accepted', 'kind', 'splice', 'hybrid', v_h ->> 0));
  return jsonb_build_object('accepted', true, 'hybrid', v_h ->> 0, 'perfect', v_h -> 1, 'a', x.kind, 'b', y.kind, 'invites', public.splice_invites());
end $$;

-- ==== traits: Endless, Patchwork and Charged on every reward ===============================================================
-- (as 20261119000201 — Seeking's real chests, Wishing and Trickster paying where they've nothing else to do — plus the three
--  new Traits, Trickster dodging the Ouroboros's bites and the Storm Coil's scorches, and the Storm Coil's overcharge)
create or replace function private.ench_pay(p_id uuid, p_base numeric, p_what text) returns jsonb language plpgsql as $$
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
        if e.kind not in ('goose', 'genie', 'cuckoo', 'pandora', 'ouroboros', 'stormcoil') then
          v := v * (1 + 0.2 * k); v_mods := v_mods || jsonb_build_object('label', 'Trickster +' || (20 * k) || '%', 'emoji', '🪺');
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
end $$;

-- ---- minigame wins: a spliced plot wears the new Traits; a walking Homunculus and a scorched plot ------------------------
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
  for sp in select s.*, e.kind ek, e.id eid from public.enchant_splices s join public.enchantments e on e.id = s.a
             where s.mode = 'plot' and s.ends_at > now() and s.player_id = p_uid
               and ((s.plot_gx = p_gx and s.plot_gy = p_gy)
                    or exists (select 1 from public.canvas_group_members m1 join public.canvas_group_members m2 on m2.group_id = m1.group_id
                                where m1.gx = s.plot_gx and m1.gy = s.plot_gy and m2.gx = p_gx and m2.gy = p_gy)) limit 2 loop
    v_g := private.ench_info(sp.ek) ->> 'gene';
    if v_g = 'patchwork' then v_g := private.homu_borrow(sp.eid); end if;
    m := m * case v_g when 'golden' then 1.5 when 'grow' then 2 when 'chaos' then 0.5 + random() * 2 when 'seek' then case when random() < 0.25 then 1.5 else 1 end
                      when 'spread' then 1.15 when 'echo' then case when random() < 0.35 then 2 else 1 end when 'wish' then 1.25 when 'trick' then 1.2
                      when 'tempo' then 1.3 when 'linked' then 1.4 when 'foresight' then 1.2 when 'endless' then 1.1 when 'charged' then 1.25 when 'homely' then 1.15 else 1 end;
  end loop;
  -- the Oracle's fortune for this win
  v_f := private.oracle_take(p_uid, 'reward');
  if v_f is not null then m := m * coalesce((v_f ->> 'mult')::numeric, 1); end if;
  return m * private.ench_plot_mult_extra(p_uid, p_gx, p_gy);
end $$;

create or replace function private.ench_plot_mult_extra(p_uid uuid, p_gx int, p_gy int) returns numeric language plpgsql as $$
declare m numeric := 1; h public.enchantments; v_pos int[];
begin
  -- 🐉 trampled by the Leviathan: 40% less until it's scrubbed
  if exists (select 1 from public.leviathan_trampled where gx = p_gx and gy = p_gy and until > now() and scrubbed_at is null) then m := m * 0.6; end if;
  -- ⚡ a bolt nobody caught scorched it
  if exists (select 1 from public.enchant_buffs where player_id = p_uid and kind = 'scorch' and gx = p_gx and gy = p_gy and expires_at > now()) then m := m * 0.8; end if;
  -- 🧫 a Homunculus standing on it lends it its parts
  for h in select * from public.enchantments where owner_id = p_uid and kind = 'homunculus' and status = 'active' and jsonb_typeof(state -> 'awake') = 'object' loop
    v_pos := private.homu_pos(h.state -> 'awake', private.ench_ep(private.ench_now(h)));
    if v_pos is not null and v_pos[1] = p_gx and v_pos[2] = p_gy then
      m := m * private.homu_mult(h.state -> 'parts');
      perform private.ench_stat(h.id, 'boosts');
    end if;
  end loop;
  return m;
end $$;

-- ==== 🐍 OUROBOROS ========================================================================================================
create or replace function private.ouro_risk(p_k int) returns numeric language sql stable as $$
  select coalesce((private.ench_cfg() -> 'ouroboros' -> 'risk' ->> (least(greatest(p_k, 1), 7) - 1))::numeric,
                  ('{0, 0.10, 0.20, 0.35, 0.50, 0.60, 0.70}'::numeric[])[least(greatest(p_k, 1), 7)])
$$;
/** a loop's length: 12 h, or 6 h while the Ouroboros is spliced with a Clockwork (an Infinity Clock) */
create or replace function private.ouro_period(e public.enchantments) returns numeric language sql stable as $$
  select case when exists (select 1 from jsonb_array_elements(private.ench_partners(e.id)) p where p ->> 'kind' = 'clockwork') then 0.5 else 1 end
         * private.ench_n('ouroboros', 'loop_h', 12) * 3600
$$;
create or replace function private.ouro_loop_ink(p_k int) returns numeric language sql stable as $$
  select private.ench_n('ouroboros', 'loop_ink', 40) + 20 * p_k
$$;
/** the splices a player has running that an Ouroboros could coil (a Trinity's three rows count once; not Grafts) */
create or replace function private.ouro_coilable(p_uid uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x.j order by x.ends_at), '[]'::jsonb) from (
    select distinct on (coalesce(s.grp::text, s.id::text)) s.ends_at, jsonb_build_object('row', s.id, 'mode', s.mode, 'ends_at', s.ends_at, 'splice_id', s.splice_id,
      'hybrid', coalesce(s.data ->> 'aberration', case when s.mode in ('trinity', 'plot') then s.data ->> 'name' else private.ench_hybrid(ea.kind, eb.kind) ->> 0 end),
      'a', ea.kind, 'b', coalesce(eb.kind, 'plot'), 'a_sigil', ea.sigil, 'b_sigil', eb.sigil, 'unstable', coalesce((s.data ->> 'unstable')::boolean, false),
      'coiled', s.data ? 'coil_by') j
      from public.enchant_splices s join public.enchantments ea on ea.id = s.a left join public.enchantments eb on eb.id = s.b
     where s.player_id = p_uid and s.ends_at > now() + interval '1 minute' and not s.folded and s.mode <> 'graft'
     order by coalesce(s.grp::text, s.id::text), s.id) x
$$;

/** the circle closes: the coiled hybrid becomes the Aberration chosen (or a random one if nobody chose in time) */
create or replace function private.ouro_close(p_id uuid, p_ab text) returns jsonb language plpgsql as $$
declare e public.enchantments; c jsonb; v_ab text := p_ab; v_rows bigint[]; v_pay jsonb; v_now numeric := extract(epoch from now());
begin
  select * into e from public.enchantments where id = p_id for update;
  c := e.state -> 'coil';
  if e.id is null or jsonb_typeof(c) <> 'object' or c ->> 'status' <> 'closed' then return null; end if;
  if v_ab is null or not v_ab = any(private.ench_aberrations()) then v_ab := (private.ench_aberrations())[1 + floor(random() * 6)::int]; end if;
  select array_agg(x::bigint) into v_rows from jsonb_array_elements_text(c -> 'rows') x;
  update public.enchant_splices set data = (data - 'coil_by') || jsonb_build_object('aberration', v_ab, 'coil_k', 3, 'circle', true),
         ends_at = now() + make_interval(secs => (private.ench_n('ouroboros', 'closed_h', 24) * 3600)::double precision) where id = any(v_rows);
  update public.enchantments set state = private.splice_codex_add(state, 'aberrations', v_ab) where id = (c ->> 'splice_id')::uuid and kind = 'splice';
  v_pay := private.ench_pay(e.id, coalesce((c ->> 'bank')::numeric, 0) * 1.5, 'the circle closed');
  update public.enchantments set state = state || jsonb_build_object('coil', null, 'chase', null, 'rest_until', v_now + private.ench_n('ouroboros', 'rest_h', 6) * 3600,
    'last', jsonb_build_object('end', 'closed', 'loops', 7, 'ink', v_pay -> 'paid', 'hybrid', c -> 'hybrid', 'aberration', v_ab, 'at', v_now)), updated_at = now() where id = e.id;
  perform private.ench_stat(e.id, 'circles');
  perform private.ench_xp(e.id, 5);
  perform private.ench_event(e.id, 'circle', jsonb_build_object('aberration', v_ab, 'hybrid', c ->> 'hybrid'));
  insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'circle', 'kind', 'ouroboros', 'hybrid', v_ab, 'from', c ->> 'hybrid'));
  return jsonb_build_object('aberration', v_ab, 'pay', v_pay);
end $$;

/** settle a coil: every loop boundary that's passed either holds (stronger, more banked) or bites through */
create or replace function private.ouro_settle(p_id uuid) returns void language plpgsql as $$
declare e public.enchantments; c jsonb; v_now numeric := extract(epoch from now()); k int; v_risk numeric; v_rows bigint[]; v_bite boolean; v_n int := 0;
  v_live int; v_pay jsonb; v_kk int;
begin
  select * into e from public.enchantments where id = p_id and kind = 'ouroboros' for update;
  if e.id is null then return; end if;
  c := e.state -> 'coil';
  if jsonb_typeof(c) is distinct from 'object' then return; end if;
  select array_agg(x::bigint) into v_rows from jsonb_array_elements_text(c -> 'rows') x;
  -- the splice was separated by hand, or the serpent went dormant: the circle breaks (what's banked is paid)
  select count(*) into v_live from public.enchant_splices where id = any(v_rows) and ends_at >= to_timestamp((c ->> 'until')::double precision) - interval '2 seconds';
  if e.status <> 'active' or v_live < coalesce(array_length(v_rows, 1), 0) then
    update public.enchant_splices set data = data - 'coil_by' where id = any(v_rows);
    if e.status = 'active' and coalesce((c ->> 'bank')::numeric, 0) > 0 then v_pay := private.ench_pay(e.id, (c ->> 'bank')::numeric, 'the circle broke'); end if;
    update public.enchantments set state = state || jsonb_build_object('coil', null, 'chase', null, 'rest_until', v_now + private.ench_n('ouroboros', 'rest_h', 6) * 3600,
      'last', jsonb_build_object('end', 'uncoiled', 'loops', c -> 'loops', 'ink', coalesce(v_pay -> 'paid', '0'::jsonb), 'hybrid', c -> 'hybrid', 'at', v_now)), updated_at = now() where id = e.id;
    perform private.ench_event(e.id, 'uncoiled', jsonb_build_object('hybrid', c ->> 'hybrid', 'loops', c -> 'loops'));
    return;
  end if;
  if c ->> 'status' = 'closed' then
    if v_now > (c ->> 'closed_at')::numeric + private.ench_n('ouroboros', 'choose_h', 46) * 3600 then perform private.ouro_close(e.id, null); end if;
    return;
  end if;
  while c ->> 'status' = 'coiled' and (c ->> 'next_at')::numeric <= v_now and v_n < 10 loop
    v_n := v_n + 1;
    k := coalesce((c ->> 'loops')::int, 0) + 1;
    v_risk := private.ouro_risk(k) * case when coalesce((c -> 'catch' ->> 'loop')::int = k, false) then coalesce((c -> 'catch' ->> 'mult')::numeric, 1) else 1 end;
    v_bite := random() < v_risk;
    -- a Trickster or Foresight Trait on the serpent can slip a bite
    if v_bite and private.ench_dodge(e.id) then v_bite := false; perform private.ench_event(e.id, 'slipped', jsonb_build_object('loop', k)); end if;
    if v_bite then
      update public.enchant_splices set data = data - 'coil_by' - 'coil_k', ends_at = least(ends_at, to_timestamp((c ->> 'next_at')::double precision)) where id = any(v_rows);
      update public.enchantments set state = state || jsonb_build_object('coil', null, 'chase', null, 'shed_until', v_now + private.ench_n('ouroboros', 'shed_h', 24) * 3600,
        'last', jsonb_build_object('end', 'bitten', 'loops', k - 1, 'lost', c -> 'bank', 'hybrid', c -> 'hybrid', 'at', v_now)), updated_at = now() where id = e.id;
      perform private.ench_stat(e.id, 'bites');
      perform private.ench_event(e.id, 'bitten', jsonb_build_object('loop', k, 'lost', c -> 'bank', 'hybrid', c ->> 'hybrid'));
      perform private.notify(e.owner_id, 'enchant', null, jsonb_build_object('sub', 'coil_bitten', 'kind', 'ouroboros', 'loop', k, 'lost', c -> 'bank', 'hybrid', c ->> 'hybrid', 'id', e.id));
      return;
    end if;
    -- it held: one more loop, stronger
    v_kk := case when k >= 4 then 3 when k >= 2 then 2 else 0 end;
    c := c || jsonb_build_object('loops', k, 'bank', coalesce((c ->> 'bank')::numeric, 0) + private.ouro_loop_ink(k),
                                 'next_at', (c ->> 'next_at')::numeric + (c ->> 'period')::numeric, 'catch', null, 'held_at', v_now);
    if k >= 7 then
      c := c || jsonb_build_object('status', 'closed', 'closed_at', v_now, 'until', v_now + 48 * 3600);
      update public.enchant_splices set ends_at = now() + interval '48 hours', data = data || jsonb_build_object('coil_k', 3) where id = any(v_rows);
      perform private.ench_event(e.id, 'closed', jsonb_build_object('hybrid', c ->> 'hybrid', 'bank', c -> 'bank'));
      perform private.notify(e.owner_id, 'enchant', null, jsonb_build_object('sub', 'coil_closed', 'kind', 'ouroboros', 'hybrid', c ->> 'hybrid', 'id', e.id));
    else
      c := c || jsonb_build_object('until', (c ->> 'next_at')::numeric);
      update public.enchant_splices set ends_at = to_timestamp((c ->> 'next_at')::double precision), data = data || jsonb_build_object('coil_k', v_kk) where id = any(v_rows);
      perform private.ench_event(e.id, 'looped', jsonb_build_object('loop', k, 'bank', c -> 'bank'));
    end if;
    perform private.ench_xp(e.id, 1);
  end loop;
  if v_n > 0 then update public.enchantments set state = state || jsonb_build_object('coil', c), updated_at = now() where id = e.id; end if;
end $$;

create or replace function private.ench_act_ouroboros(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; c jsonb := e.state -> 'coil'; v_now numeric := extract(epoch from now()); r jsonb; sp public.enchant_splices; v_rows bigint[]; v_first numeric; v_per numeric;
  v_hyb text; ka text; kb text; v_kinds jsonb; v_el numeric; v_ph numeric; v_acc numeric; v_grade text; v_mult numeric; k int; v_pay jsonb; v_ch jsonb; v_cl jsonb;
begin
  case p_action
    when 'coil' then
      if jsonb_typeof(c) = 'object' then raise exception 'coil_active' using errcode = 'P0001'; end if;
      if coalesce((s ->> 'shed_until')::numeric, 0) > v_now then raise exception 'shedding' using errcode = 'P0001'; end if;
      if coalesce((s ->> 'rest_until')::numeric, 0) > v_now then raise exception 'too_soon' using errcode = 'P0001'; end if;
      select * into sp from public.enchant_splices where id = (ench_act_ouroboros.a ->> 'row')::bigint and player_id = e.owner_id and ends_at > now() + interval '1 minute' and not folded for update;
      if sp.id is null or sp.mode = 'graft' then raise exception 'bad_target' using errcode = 'P0001'; end if;
      select array_agg(x.id order by x.id) into v_rows from public.enchant_splices x where (sp.grp is not null and x.grp = sp.grp and x.ends_at > now()) or x.id = sp.id;
      if exists (select 1 from public.enchant_splices where id = any(v_rows) and data ? 'coil_by') then raise exception 'already_coiled' using errcode = 'P0001'; end if;
      select kind into ka from public.enchantments where id = sp.a;
      select kind into kb from public.enchantments where id = sp.b;
      select coalesce(jsonb_agg(distinct m.kind), '[]'::jsonb) into v_kinds from public.enchant_splices x join public.enchantments m on m.id in (x.a, x.b) where x.id = any(v_rows);
      v_hyb := coalesce(sp.data ->> 'aberration', case when sp.mode in ('trinity', 'plot') then sp.data ->> 'name' else private.ench_hybrid(ka, kb) ->> 0 end);
      v_per := private.ouro_period(e);
      -- the first loop comes round when the splice would have ended (at least half an hour from now)
      v_first := greatest(extract(epoch from sp.ends_at), v_now + 1800);
      update public.enchant_splices set ends_at = to_timestamp(v_first::double precision),
             data = data || jsonb_build_object('coil_by', e.id, 'unstable', false) || case when coalesce((data ->> 'unstable')::boolean, false) then '{"steadied": true}'::jsonb else '{}'::jsonb end
       where id = any(v_rows);
      c := jsonb_build_object('status', 'coiled', 'rows', to_jsonb(v_rows), 'splice_id', sp.splice_id, 'hybrid', v_hyb, 'mode', sp.mode, 'kinds', v_kinds,
        'loops', 0, 'bank', 0, 'next_at', v_first, 'until', v_first, 'period', v_per, 'started_at', v_now, 'steadied', coalesce((sp.data ->> 'unstable')::boolean, false));
      s := s || jsonb_build_object('coil', c, 'chase', null);
      perform private.ench_stat(e.id, 'coils'); perform private.ench_xp(e.id, 2);
      perform private.ench_event(e.id, 'coiled', jsonb_build_object('hybrid', v_hyb));
      r := jsonb_build_object('coiled', true, 'hybrid', v_hyb, 'next_at', v_first, 'steadied', c -> 'steadied', 'period_h', round(v_per / 3600, 1));
    when 'chase' then
      -- the head starts round the ring after its tail (the server keeps the time)
      if c ->> 'status' is distinct from 'coiled' then raise exception 'no_coil' using errcode = 'P0001'; end if;
      k := coalesce((c ->> 'loops')::int, 0) + 1;
      if coalesce((c -> 'catch' ->> 'loop')::int = k, false) then raise exception 'already_caught' using errcode = 'P0001'; end if;
      v_ch := jsonb_build_object('at', extract(epoch from clock_timestamp()), 'period', round((1.25 + random() * 0.5)::numeric, 3), 'loop', k);
      s := s || jsonb_build_object('chase', v_ch);
      r := jsonb_build_object('chase', v_ch, 'server_time', extract(epoch from clock_timestamp()), 'period_ms', round((v_ch ->> 'period')::numeric * 1000));
    when 'catch' then
      v_ch := s -> 'chase';
      if jsonb_typeof(v_ch) is distinct from 'object' or c ->> 'status' is distinct from 'coiled' then raise exception 'not_aimed' using errcode = 'P0001'; end if;
      k := coalesce((c ->> 'loops')::int, 0) + 1;
      if (v_ch ->> 'loop')::int <> k or coalesce((c -> 'catch' ->> 'loop')::int = k, false) then raise exception 'already_caught' using errcode = 'P0001'; end if;
      v_el := extract(epoch from clock_timestamp()) - (v_ch ->> 'at')::numeric - 0.12;
      if v_el > 20 then raise exception 'aim_expired' using errcode = 'P0001'; end if;
      -- the head meets its tail once every lap: tap as they touch (not before the first lap is nearly done)
      v_ph := mod(greatest(v_el, 0) / (v_ch ->> 'period')::numeric, 1);
      v_acc := case when v_el < (v_ch ->> 'period')::numeric * 0.6 then 0 else round((0.5 + 0.5 * cos(2 * pi() * v_ph))::numeric, 3) end;
      v_grade := case when v_acc >= 0.9 then 'CLEAN' when v_acc >= 0.6 then 'CLOSE' else 'MISS' end;
      v_mult := case v_grade when 'CLEAN' then 0.5 when 'CLOSE' then 0.75 else 1 end;
      c := c || jsonb_build_object('catch', jsonb_build_object('loop', k, 'grade', v_grade, 'mult', v_mult, 'acc', v_acc));
      s := s || jsonb_build_object('coil', c, 'chase', null);
      if v_grade = 'CLEAN' then perform private.ench_stat(e.id, 'clean'); end if;
      perform private.ench_event(e.id, 'catch', jsonb_build_object('loop', k, 'grade', v_grade));
      r := jsonb_build_object('grade', v_grade, 'accuracy', v_acc, 'loop', k, 'risk', round(private.ouro_risk(k) * v_mult, 3), 'risk_base', round(private.ouro_risk(k), 3));
    when 'break' then
      -- let go: what's banked is paid; the hybrid stays fused until the loop it's in comes round
      if jsonb_typeof(c) is distinct from 'object' then raise exception 'no_coil' using errcode = 'P0001'; end if;
      update public.enchant_splices set data = data - 'coil_by' where id in (select x::bigint from jsonb_array_elements_text(c -> 'rows') x);
      v_pay := private.ench_pay(e.id, coalesce((c ->> 'bank')::numeric, 0), 'broke the circle');
      s := s || jsonb_build_object('coil', null, 'chase', null, 'rest_until', v_now + private.ench_n('ouroboros', 'rest_h', 6) * 3600,
        'last', jsonb_build_object('end', 'broke', 'loops', c -> 'loops', 'ink', v_pay -> 'paid', 'hybrid', c -> 'hybrid', 'at', v_now));
      perform private.ench_event(e.id, 'broke', jsonb_build_object('loops', c -> 'loops', 'ink', v_pay -> 'paid'));
      r := jsonb_build_object('broke', true, 'pay', v_pay, 'loops', c -> 'loops');
    when 'choose' then
      if c ->> 'status' is distinct from 'closed' then raise exception 'not_ready' using errcode = 'P0001'; end if;
      if not coalesce(a ->> 'aberration', '') = any(private.ench_aberrations()) then raise exception 'bad_target' using errcode = 'P0001'; end if;
      v_cl := private.ouro_close(e.id, a ->> 'aberration');
      select state into s from public.enchantments where id = e.id;
      r := jsonb_build_object('closed', true, 'aberration', v_cl ->> 'aberration', 'pay', v_cl -> 'pay', 'hybrid', c ->> 'hybrid');
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_ouroboros(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; c jsonb := e.state -> 'coil'; v_now numeric := extract(epoch from now()); k int := coalesce((e.state -> 'coil' ->> 'loops')::int, 0) + 1;
  v_caught boolean := coalesce((e.state -> 'coil' -> 'catch' ->> 'loop')::int = coalesce((e.state -> 'coil' ->> 'loops')::int, 0) + 1, false); v_coilable jsonb := '[]'::jsonb; v_mem jsonb;
begin
  if jsonb_typeof(c) is distinct from 'object' then v_coilable := private.ouro_coilable(e.owner_id);
  else
    select coalesce(jsonb_agg(distinct jsonb_build_object('id', m.id, 'kind', m.kind, 'sigil', m.sigil, 'level', m.level)), '[]'::jsonb) into v_mem
      from public.enchant_splices x join public.enchantments m on m.id in (x.a, x.b) where x.id in (select y::bigint from jsonb_array_elements_text(c -> 'rows') y);
  end if;
  return jsonb_build_object(
    'coil', case when jsonb_typeof(c) = 'object' then c || jsonb_build_object(
        'next_in', greatest(0, round((c ->> 'next_at')::numeric - v_now)), 'members', v_mem, 'loop_next', k,
        'risk_next', case when c ->> 'status' = 'coiled' then round(private.ouro_risk(k) * case when v_caught then coalesce((c -> 'catch' ->> 'mult')::numeric, 1) else 1 end, 3) end,
        'risk_base', round(private.ouro_risk(k), 3), 'caught', v_caught, 'grade', case when v_caught then c -> 'catch' ->> 'grade' end,
        'bank_next', private.ouro_loop_ink(k),
        'strength', case when coalesce((c ->> 'loops')::int, 0) >= 4 then 3 when coalesce((c ->> 'loops')::int, 0) >= 2 then 2 else 1 end,
        'choose_in', case when c ->> 'status' = 'closed' then greatest(0, round((c ->> 'closed_at')::numeric + private.ench_n('ouroboros', 'choose_h', 46) * 3600 - v_now)) end) end,
    'risks', (select jsonb_agg(round(private.ouro_risk(i), 3) order by i) from generate_series(1, 7) i),
    'shed_in', greatest(0, round(coalesce((s ->> 'shed_until')::numeric, 0) - v_now)), 'rest_in', greatest(0, round(coalesce((s ->> 'rest_until')::numeric, 0) - v_now)),
    'coilable', v_coilable, 'period_h', round(private.ouro_period(e) / 3600, 1), 'last', s -> 'last', 'aberrations', to_jsonb(private.ench_aberrations()),
    'chase', case when jsonb_typeof(s -> 'chase') = 'object' then s -> 'chase' end, 'server_now', extract(epoch from clock_timestamp()),
    'attention', case when c ->> 'status' = 'closed' then 'The circle closed — choose its Aberration'
                      when c ->> 'status' = 'coiled' and not v_caught and (c ->> 'next_at')::numeric - v_now < 6 * 3600 then 'Catch its tail before the next loop'
                      when jsonb_typeof(c) is distinct from 'object' and coalesce((s ->> 'shed_until')::numeric, 0) <= v_now and coalesce((s ->> 'rest_until')::numeric, 0) <= v_now
                           and jsonb_array_length(v_coilable) > 0 then 'It wants to coil around a splice' end);
end $$;

-- ---- 🐍 Endless: a splice with an Ouroboros in it renews itself when it ends (once, twice or three times) -------------------
create or replace function private.endless_renew(p_id uuid) returns void language plpgsql as $$
declare sp record; v_k int; v_dur numeric; v_rows bigint[];
begin
  for sp in select s.*, ea.kind ka, eb.kind kb, ea.status sa, eb.status sb from public.enchant_splices s join public.enchantments ea on ea.id = s.a left join public.enchantments eb on eb.id = s.b
             where not s.folded and s.ends_at <= now() and s.ends_at > now() - interval '3 days' and s.mode <> 'graft' and not (s.data ? 'coil_by')
               and (p_id is null or s.a = p_id or s.b = p_id) and (ea.kind = 'ouroboros' or eb.kind = 'ouroboros')
             order by s.id loop
    if sp.sa <> 'active' or (sp.b is not null and sp.sb <> 'active') then continue; end if;
    v_k := greatest(private.splice_strength(sp.mode, sp.data, sp.ka, sp.kb), coalesce(private.splice_strength(sp.mode, sp.data, sp.kb, sp.ka), 1));
    if coalesce((sp.data ->> 'renewed')::int, 0) >= v_k then continue; end if;
    v_dur := coalesce((sp.data ->> 'dur')::numeric, extract(epoch from sp.ends_at - sp.started_at));
    select array_agg(x.id) into v_rows from public.enchant_splices x where (sp.grp is not null and x.grp = sp.grp) or x.id = sp.id;
    update public.enchant_splices set ends_at = ends_at + make_interval(secs => v_dur::double precision),
           data = data || jsonb_build_object('renewed', coalesce((sp.data ->> 'renewed')::int, 0) + 1, 'dur', v_dur)
     where id = any(v_rows) and not folded and ends_at <= now();
    if found then
      perform private.ench_event(case when sp.ka = 'ouroboros' then sp.a else sp.b end, 'renewed',
        jsonb_build_object('hybrid', coalesce(sp.data ->> 'aberration', case when sp.mode in ('trinity', 'plot') then sp.data ->> 'name' else private.ench_hybrid(sp.ka, sp.kb) ->> 0 end),
                           'n', coalesce((sp.data ->> 'renewed')::int, 0) + 1, 'of', v_k));
    end if;
  end loop;
end $$;

-- ==== 🧫 HOMUNCULUS =======================================================================================================
create or replace function private.homu_eval(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); aw jsonb := e.state -> 'awake'; v_pos int[]; v_need int; v_w int; v_step numeric; v_day text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  v_galv boolean;
begin
  v_w := private.homu_weight(s -> 'parts');
  -- lightning wakes it sooner: spliced with a Storm Coil (a Galvanized Golem) it needs one part less
  v_galv := exists (select 1 from jsonb_array_elements(private.ench_partners(e.id)) p where p ->> 'kind' = 'stormcoil');
  v_need := private.ench_n('homunculus', 'need', 5)::int - case when v_galv then 1 else 0 end;
  if jsonb_typeof(aw) = 'object' then
    v_pos := private.homu_pos(aw, v_now);
    v_step := greatest(600, coalesce((aw ->> 'step_s')::numeric, 7200));
  end if;
  return jsonb_build_object('parts', coalesce(s -> 'parts', '[]'::jsonb), 'weight', v_w, 'need', v_need, 'galvanized', v_galv, 'gen', coalesce((s ->> 'gen')::int, 1),
    'mult', round(private.homu_mult(s -> 'parts'), 2), 'max_parts', private.ench_n('homunculus', 'max_parts', 7)::int,
    'can_wake', jsonb_typeof(aw) is distinct from 'object' and v_w >= v_need,
    'awake', case when jsonb_typeof(aw) = 'object' then jsonb_build_object(
        'pos', case when v_pos is not null then to_jsonb(v_pos) end, 'left', greatest(0, round((aw ->> 'until')::numeric - v_now)),
        'melted', v_now >= (aw ->> 'until')::numeric, 'plots', jsonb_array_length(coalesce(aw -> 'plots', '[]'::jsonb)),
        'next_move_in', case when jsonb_typeof(aw -> 'lead') = 'object' and v_now < (aw -> 'lead' ->> 'until')::numeric then round((aw -> 'lead' ->> 'until')::numeric - v_now)
                             else round(v_step - mod(greatest(0, v_now - (aw ->> 'at')::numeric), v_step)) end,
        'led', jsonb_typeof(aw -> 'lead') = 'object' and v_now < (aw -> 'lead' ->> 'until')::numeric,
        'leads_left', greatest(0, private.ench_n('homunculus', 'leads_per_day', 2)::int - case when aw ->> 'lead_day' = v_day then coalesce((aw ->> 'leads')::int, 0) else 0 end),
        'greets', coalesce((aw ->> 'greets')::int, 0), 'greets_today', case when aw ->> 'greet_day' = v_day then jsonb_array_length(coalesce(aw -> 'greeted', '[]'::jsonb)) else 0 end) end);
end $$;

create or replace function private.ench_act_homunculus(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; g jsonb := private.homu_eval(e, t); v_now numeric := private.ench_ep(t); r jsonb; aw jsonb := e.state -> 'awake'; v_plots jsonb;
  v_day text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD'); v_pay jsonb; v_lv int; v_glow boolean; v_keep jsonb; v_spark uuid; v_luck int;
begin
  case p_action
    when 'wake' then
      if not (g ->> 'can_wake')::boolean then raise exception 'not_ready' using errcode = 'P0001'; end if;
      -- it walks the plots you own: the dozen nearest its flask and a handful of others
      select coalesce(jsonb_agg(jsonb_build_array(q.gx, q.gy)), '[]'::jsonb) into v_plots from (
        (select w.gx, w.gy from public.world_plots w where w.owner_id = e.owner_id order by abs(w.gx - e.gx) + abs(w.gy - e.gy) limit 12)
        union
        (select w.gx, w.gy from public.world_plots w where w.owner_id = e.owner_id order by random() limit 18)) q;
      if jsonb_array_length(v_plots) = 0 then v_plots := jsonb_build_array(jsonb_build_array(e.gx, e.gy)); end if;
      aw := jsonb_build_object('at', v_now, 'until', v_now + private.ench_n('homunculus', 'life_h', 168) * 3600, 'seed', floor(random() * 1e9)::bigint,
                               'step_s', private.ench_n('homunculus', 'step_h', 2) * 3600, 'plots', v_plots, 'greets', 0);
      s := s || jsonb_build_object('awake', aw);
      perform private.ench_stat(e.id, 'wakes'); perform private.ench_xp(e.id, 3);
      perform private.ench_event(e.id, 'awoke', jsonb_build_object('parts', jsonb_array_length(coalesce(s -> 'parts', '[]'::jsonb)), 'gen', coalesce((s ->> 'gen')::int, 1)));
      insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'awoke', 'kind', 'homunculus',
        'parts', (select coalesce(jsonb_agg(p ->> 'k'), '[]'::jsonb) from jsonb_array_elements(coalesce(s -> 'parts', '[]'::jsonb)) p)));
      r := jsonb_build_object('awake', true, 'pos', to_jsonb(private.homu_pos(aw, v_now)), 'plots', jsonb_array_length(v_plots));
    when 'lead' then
      if jsonb_typeof(aw) is distinct from 'object' or (g -> 'awake' ->> 'melted')::boolean then raise exception 'not_awake' using errcode = 'P0001'; end if;
      if (g -> 'awake' ->> 'leads_left')::int < 1 then raise exception 'too_soon' using errcode = 'P0001'; end if;
      if not exists (select 1 from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int and owner_id = e.owner_id) then raise exception 'bad_target' using errcode = 'P0001'; end if;
      aw := aw || jsonb_build_object('lead', jsonb_build_object('gx', (a ->> 'gx')::int, 'gy', (a ->> 'gy')::int, 'until', v_now + private.ench_n('homunculus', 'lead_h', 6) * 3600),
                                     'lead_day', v_day, 'leads', case when aw ->> 'lead_day' = v_day then coalesce((aw ->> 'leads')::int, 0) else 0 end + 1);
      s := s || jsonb_build_object('awake', aw);
      perform private.ench_event(e.id, 'led', jsonb_build_object('gx', (a ->> 'gx')::int, 'gy', (a ->> 'gy')::int));
      r := jsonb_build_object('led', true, 'pos', jsonb_build_array((a ->> 'gx')::int, (a ->> 'gy')::int));
    when 'heart' then
      -- its week is up: it melts into a heart, and one part stays in the flask for the next one
      if jsonb_typeof(aw) is distinct from 'object' or not (g -> 'awake' ->> 'melted')::boolean then raise exception 'not_ready' using errcode = 'P0001'; end if;
      select coalesce(sum(least(3, greatest(1, coalesce((p ->> 'lv')::int, 1)))), 0)::int, coalesce(bool_or(coalesce((p ->> 'glow')::boolean, false)), false)
        into v_lv, v_glow from jsonb_array_elements(coalesce(s -> 'parts', '[]'::jsonb)) p;
      v_pay := private.ench_pay(e.id, private.ench_n('homunculus', 'heart_ink', 80) + 30 * v_lv + 2 * coalesce((aw ->> 'greets')::int, 0), 'the Homunculus’s heart');
      v_luck := 1 + case when v_glow then 1 else 0 end;
      perform private.ench_give_luck(e.owner_id, 0, v_luck);
      v_spark := private.splice_spark(e.owner_id, 'heart');
      select p into v_keep from jsonb_array_elements(coalesce(s -> 'parts', '[]'::jsonb)) p where p ->> 'k' = a ->> 'keep' limit 1;
      s := s || jsonb_build_object('awake', null, 'gen', coalesce((s ->> 'gen')::int, 1) + 1,
        'parts', case when v_keep is not null then jsonb_build_array(jsonb_build_object('k', v_keep ->> 'k', 'lv', 1, 'glow', false, 'heir', true, 'from', v_keep ->> 'from')) else '[]'::jsonb end);
      perform private.ench_stat(e.id, 'hearts');
      perform private.ench_event(e.id, 'heart', jsonb_build_object('ink', v_pay -> 'paid', 'luck', v_luck, 'spark', v_spark is not null, 'kept', v_keep ->> 'k'));
      r := jsonb_build_object('heart', true, 'pay', v_pay, 'enchanted_luck', v_luck, 'spark', v_spark is not null, 'kept', v_keep ->> 'k');
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_homunculus(e public.enchantments, t timestamptz) returns jsonb language sql stable as $$
  select g || jsonb_build_object('attention', case when (g ->> 'can_wake')::boolean then 'It’s ready to wake'
                                                   when (g -> 'awake' ->> 'melted')::boolean then 'Its week is up — collect its heart' end)
  from (select private.homu_eval(e, t) g) x
$$;

/** greet someone's walking Homunculus: once a day each (it remembers 40 a day) */
create or replace function public.homunculus_greet(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); e public.enchantments; aw jsonb; v_day text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD'); v_by jsonb;
begin
  perform private.rate_limit('homu_greet', 60, 3600);
  select * into e from public.enchantments where id = p_id and kind = 'homunculus' and status = 'active' for update;
  aw := e.state -> 'awake';
  if e.id is null or jsonb_typeof(aw) is distinct from 'object' or private.homu_pos(aw, private.ench_ep(private.ench_now(e))) is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if e.owner_id = v_uid then raise exception 'own_homunculus' using errcode = 'P0001'; end if;
  v_by := case when aw ->> 'greet_day' = v_day then coalesce(aw -> 'greeted', '[]'::jsonb) else '[]'::jsonb end;
  if v_by ? v_uid::text then raise exception 'already_greeted' using errcode = 'P0001'; end if;
  if jsonb_array_length(v_by) >= private.ench_n('homunculus', 'greets_per_day', 40) then raise exception 'greets_full' using errcode = 'P0001'; end if;
  aw := aw || jsonb_build_object('greet_day', v_day, 'greeted', v_by || to_jsonb(v_uid::text), 'greets', coalesce((aw ->> 'greets')::int, 0) + 1);
  update public.enchantments set state = state || jsonb_build_object('awake', aw) where id = e.id;
  perform private.grant_ink_paced(v_uid, 3, 'enchantment', 'homu_greet', e.id::text, null);
  perform private.grant_ink_paced(e.owner_id, 5, 'enchantment', 'homu_greeted', e.id::text, null);
  perform private.ench_event(e.id, 'greeted', jsonb_build_object('by', (select username from public.profiles where id = v_uid)));
  if jsonb_array_length(v_by) = 0 then perform private.notify(e.owner_id, 'enchant', v_uid, jsonb_build_object('sub', 'homu_greet', 'kind', 'homunculus', 'ink', 5, 'id', e.id)); end if;
  return jsonb_build_object('greeted', true, 'you', 3, 'them', 5, 'balances', private.balances(v_uid));
end $$;

-- ==== ⚡ STORM COIL =======================================================================================================
create or replace function private.storm_eval(e public.enchantments) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_day text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD'); v_per int; v_used int; st jsonb := e.state -> 'storm'; v_t int;
begin
  v_per := private.ench_n('stormcoil', 'per_day', 1)::int + case when e.level >= 10 then 1 else 0 end;
  v_used := case when s ->> 'storm_day' = v_day then coalesce((s ->> 'storms_today')::int, 0) else 0 end;
  select count(distinct m.id) into v_t from public.enchant_splices sp join public.enchantments m on m.id = sp.a or (m.id = sp.b and sp.mode <> 'graft')
   where m.owner_id = e.owner_id and m.status = 'active' and sp.ends_at > now() and not sp.folded;
  return jsonb_build_object('charge', least(100, coalesce((s ->> 'charge')::numeric, 0)), 'per_turn', private.ench_n('stormcoil', 'per_turn', 10),
    'storms_left', greatest(0, v_per - v_used), 'per_day', v_per, 'hybrids', v_t,
    'storm', case when jsonb_typeof(st) = 'object' and not coalesce((st ->> 'settled')::boolean, false) then st end,
    'last', s -> 'last', 'server_now', extract(epoch from clock_timestamp()));
end $$;

/** a bolt on a hybrid: +6 h, a surge, an overcharge — or, 1 in 6, an Aberration */
create or replace function private.storm_mutate(p_owner uuid, p_target uuid) returns jsonb language plpgsql as $$
declare sp public.enchant_splices; v_r numeric := random(); v_ab text; v_rows bigint[]; v_name text; ka text; kb text; v_k int;
begin
  select * into sp from public.enchant_splices where (a = p_target or (b = p_target and mode <> 'graft')) and ends_at > now() and not folded order by id desc limit 1 for update;
  if sp.id is null then return jsonb_build_object('what', 'ink'); end if;
  select array_agg(x.id) into v_rows from public.enchant_splices x where (sp.grp is not null and x.grp = sp.grp and x.ends_at > now()) or x.id = sp.id;
  select kind into ka from public.enchantments where id = sp.a;
  select kind into kb from public.enchantments where id = sp.b;
  v_name := coalesce(sp.data ->> 'aberration', case when sp.mode in ('trinity', 'plot') then sp.data ->> 'name' else private.ench_hybrid(ka, kb) ->> 0 end);
  if v_r < private.ench_n('stormcoil', 'aberration', 0.17) and not sp.data ? 'aberration' then
    v_ab := (private.ench_aberrations())[1 + floor(random() * 6)::int];
    update public.enchant_splices set data = data || jsonb_build_object('aberration', v_ab, 'storm_ab', true) where id = any(v_rows);
    update public.enchantments set state = private.splice_codex_add(state, 'aberrations', v_ab) where id = sp.splice_id and kind = 'splice';
    insert into public.feed_events (kind, player_id, data) values ('enchant', p_owner, jsonb_build_object('sub', 'aberration', 'kind', 'stormcoil', 'hybrid', v_ab, 'storm', true));
    return jsonb_build_object('what', 'aberration', 'aberration', v_ab, 'from', v_name);
  elsif v_r < private.ench_n('stormcoil', 'aberration', 0.17) + 0.2 then
    v_k := least(3, greatest(2, coalesce((sp.data ->> 'storm_k')::int, 1) + 1));
    update public.enchant_splices set data = data || jsonb_build_object('storm_k', v_k) where id = any(v_rows);
    return jsonb_build_object('what', 'surge', 'hybrid', v_name, 'k', v_k);
  elsif v_r < private.ench_n('stormcoil', 'aberration', 0.17) + 0.5 or sp.data ? 'coil_by' or coalesce((sp.data ->> 'storm_ext')::numeric, 0) >= 18 then
    insert into public.enchant_buffs (player_id, kind, enchant_id, mult, data, expires_at) values (p_owner, 'next_reward', p_target, 2, '{"by": "storm"}'::jsonb, now() + interval '12 hours');
    return jsonb_build_object('what', 'overcharge', 'hybrid', v_name);
  else
    update public.enchant_splices set ends_at = ends_at + interval '6 hours', data = data || jsonb_build_object('storm_ext', coalesce((data ->> 'storm_ext')::numeric, 0) + 6) where id = any(v_rows);
    return jsonb_build_object('what', 'extend', 'hybrid', v_name, 'hours', 6);
  end if;
end $$;

/** the storm passes: uncaught bolts on plots may scorch them; everything caught is paid */
create or replace function private.storm_settle(p_id uuid) returns void language plpgsql as $$
declare e public.enchantments; st jsonb; b jsonb; v_sc int := 0; v_pay jsonb; v_caught int;
begin
  select * into e from public.enchantments where id = p_id and kind = 'stormcoil' for update;
  st := e.state -> 'storm';
  if e.id is null or jsonb_typeof(st) is distinct from 'object' or coalesce((st ->> 'settled')::boolean, false) or extract(epoch from now()) < (st ->> 'until')::numeric + 3 then return; end if;
  for b in select x from jsonb_array_elements(st -> 'bolts') x loop
    if b ->> 'kind' = 'ink' and not coalesce(st -> 'caught', '{}'::jsonb) ? (b ->> 'i') and random() < private.ench_n('stormcoil', 'scorch', 0.3) and not private.ench_dodge(e.id)
       and not exists (select 1 from public.enchant_buffs where kind = 'scorch' and gx = (b ->> 'gx')::int and gy = (b ->> 'gy')::int and expires_at > now()) then
      insert into public.enchant_buffs (player_id, kind, gx, gy, mult, data, expires_at) values (e.owner_id, 'scorch', (b ->> 'gx')::int, (b ->> 'gy')::int, 0.8, '{}'::jsonb, now() + interval '1 hour');
      v_sc := v_sc + 1;
    end if;
  end loop;
  select count(*)::int into v_caught from jsonb_object_keys(coalesce(st -> 'caught', '{}'::jsonb)) k;
  if e.owner_id is not null and e.status = 'active' and coalesce((st ->> 'ink')::numeric, 0) > 0 then v_pay := private.ench_pay(e.id, (st ->> 'ink')::numeric, 'the storm'); end if;
  st := st || jsonb_build_object('settled', true);
  update public.enchantments set state = state || jsonb_build_object('storm', st, 'last', jsonb_build_object('caught', v_caught, 'of', jsonb_array_length(st -> 'bolts'),
      'scorched', v_sc, 'ink', coalesce((v_pay ->> 'paid')::int, 0), 'pay', v_pay, 'mut', coalesce(st -> 'mut', '[]'::jsonb), 'at', st -> 'until')), updated_at = now() where id = e.id;
  perform private.ench_event(e.id, 'storm_end', jsonb_build_object('caught', v_caught, 'of', jsonb_array_length(st -> 'bolts'), 'scorched', v_sc, 'ink', coalesce((v_pay ->> 'paid')::int, 0)));
  perform private.ench_xp(e.id, 2);
end $$;

create or replace function private.ench_act_stormcoil(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; g jsonb := private.storm_eval(e); r jsonb; v_day text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD'); v_n int; st jsonb;
  v_targets jsonb; v_mine jsonb; v_stray jsonb; v_bolts jsonb := '[]'::jsonb; i int; v_t numeric; v_len numeric; v_kind text; tg jsonb; v_mi int := 0; v_i int; bolt jsonb;
  v_el numeric; v_out jsonb; v_ink numeric := 0; v_at numeric;
begin
  case p_action
    when 'crank' then
      v_n := least(greatest(coalesce((a ->> 'turns')::int, 0), 0), 10);
      if v_n < 1 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
      if (g ->> 'charge')::numeric >= 100 then raise exception 'charged' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('charge', least(100, (g ->> 'charge')::numeric + v_n * (g ->> 'per_turn')::numeric));
      perform private.ench_stat(e.id, 'cranks', v_n);
      r := jsonb_build_object('cranked', v_n, 'charge', s -> 'charge');
    when 'storm' then
      if (g ->> 'charge')::numeric < 100 then raise exception 'not_charged' using errcode = 'P0001'; end if;
      if (g ->> 'storms_left')::int < 1 then raise exception 'too_soon' using errcode = 'P0001'; end if;
      if g -> 'storm' is not null and jsonb_typeof(g -> 'storm') = 'object' then raise exception 'storm_active' using errcode = 'P0001'; end if;
      -- what the lightning goes for: your spliced enchantments, your plots near the coil, and (now and then) a neighbour's plot
      select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'gx', q.gx, 'gy', q.gy, 'kind', q.kind)), '[]'::jsonb) into v_targets from (
        select distinct m.id, m.gx, m.gy, m.kind from public.enchant_splices sp join public.enchantments m on m.id = sp.a or (m.id = sp.b and sp.mode <> 'graft')
         where m.owner_id = e.owner_id and m.status = 'active' and sp.ends_at > now() + interval '5 minutes' and not sp.folded limit 8) q;
      select coalesce(jsonb_agg(jsonb_build_array(q.gx, q.gy)), '[]'::jsonb) into v_mine from (
        select w.gx, w.gy from public.world_plots w where w.owner_id = e.owner_id order by abs(w.gx - e.gx) + abs(w.gy - e.gy) limit 30) q;
      if jsonb_array_length(v_mine) = 0 then v_mine := jsonb_build_array(jsonb_build_array(e.gx, e.gy)); end if;
      select coalesce(jsonb_agg(jsonb_build_object('gx', q.gx, 'gy', q.gy, 'owner', q.owner_id)), '[]'::jsonb) into v_stray from (
        select w.gx, w.gy, w.owner_id from public.world_plots w where w.owner_id is not null and w.owner_id <> e.owner_id
           and w.gx between e.gx - 80 and e.gx + 80 and w.gy between e.gy - 80 and e.gy + 80 order by random() limit 12) q;
      v_n := private.ench_n('stormcoil', 'bolts', 18)::int; v_len := private.ench_n('stormcoil', 'secs', 180);
      for i in 0 .. v_n - 1 loop
        v_t := round((6 + i * (v_len - 20) / v_n + random() * 4)::numeric, 2);
        v_kind := case when jsonb_array_length(v_targets) > 0 and (i % 3 = 1 or random() < 0.15) then 'mutate'
                       when jsonb_array_length(v_stray) > 0 and random() < 0.18 then 'stray' else 'ink' end;
        if v_kind = 'mutate' then
          tg := v_targets -> (v_mi % jsonb_array_length(v_targets)); v_mi := v_mi + 1;
          bolt := jsonb_build_object('i', i, 't', v_t, 'kind', 'mutate', 'gx', tg -> 'gx', 'gy', tg -> 'gy', 'target', tg -> 'id', 'tkind', tg -> 'kind');
        elsif v_kind = 'stray' then
          tg := v_stray -> floor(random() * jsonb_array_length(v_stray))::int;
          bolt := jsonb_build_object('i', i, 't', v_t, 'kind', 'stray', 'gx', tg -> 'gx', 'gy', tg -> 'gy', 'owner', tg -> 'owner');
        else
          tg := v_mine -> floor(random() * jsonb_array_length(v_mine))::int;
          bolt := jsonb_build_object('i', i, 't', v_t, 'kind', 'ink', 'gx', tg -> 0, 'gy', tg -> 1);
        end if;
        v_bolts := v_bolts || jsonb_build_array(bolt);
      end loop;
      v_at := extract(epoch from clock_timestamp());
      st := jsonb_build_object('n', coalesce((e.stats ->> 'storms')::int, 0) + 1, 'at', v_at, 'until', v_at + v_len, 'bolts', v_bolts, 'caught', '{}'::jsonb, 'ink', 0, 'mut', '[]'::jsonb);
      s := s || jsonb_build_object('charge', 0, 'storm', st, 'storm_day', v_day,
                                   'storms_today', case when s ->> 'storm_day' = v_day then coalesce((s ->> 'storms_today')::int, 0) else 0 end + 1);
      perform private.ench_stat(e.id, 'storms'); perform private.ench_xp(e.id, 2);
      perform private.ench_event(e.id, 'storm', jsonb_build_object('bolts', v_n, 'hybrids', jsonb_array_length(v_targets)));
      insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'storm', 'kind', 'stormcoil', 'hybrids', jsonb_array_length(v_targets)));
      r := jsonb_build_object('storm', st, 'server_now', extract(epoch from clock_timestamp()));
    when 'catch' then
      st := s -> 'storm';
      if jsonb_typeof(st) is distinct from 'object' or coalesce((st ->> 'settled')::boolean, false) then raise exception 'no_storm' using errcode = 'P0001'; end if;
      v_i := (a ->> 'i')::int; bolt := st -> 'bolts' -> v_i;
      if v_i is null or bolt is null then raise exception 'bad_target' using errcode = 'P0001'; end if;
      if coalesce(st -> 'caught', '{}'::jsonb) ? v_i::text then raise exception 'already_caught' using errcode = 'P0001'; end if;
      -- a bolt can be caught while it gathers (1.6 s before it lands) and just after it strikes
      v_el := extract(epoch from clock_timestamp()) - (st ->> 'at')::numeric;
      if v_el < (bolt ->> 't')::numeric - 1.6 or v_el > (bolt ->> 't')::numeric + 0.8 then raise exception 'missed' using errcode = 'P0001'; end if;
      st := jsonb_set(st, array['caught', v_i::text], to_jsonb(e.owner_id::text));
      if bolt ->> 'kind' = 'mutate' then
        v_out := private.storm_mutate(e.owner_id, (bolt ->> 'target')::uuid);
        if v_out ->> 'what' = 'ink' then v_ink := 12; else v_ink := 6; end if;
        if v_out ->> 'what' = 'aberration' then perform private.ench_stat(e.id, 'aberrations'); end if;
        st := st || jsonb_build_object('mut', coalesce(st -> 'mut', '[]'::jsonb) || jsonb_build_array(v_out || jsonb_build_object('kind', bolt -> 'tkind')));
      else
        v_ink := case when bolt ->> 'kind' = 'stray' then 8 else 12 end;
        v_out := jsonb_build_object('what', 'ink');
      end if;
      st := st || jsonb_build_object('ink', coalesce((st ->> 'ink')::numeric, 0) + v_ink);
      s := s || jsonb_build_object('storm', st);
      perform private.ench_stat(e.id, 'bolts');
      r := v_out || jsonb_build_object('i', v_i, 'ink', v_ink, 'bolt', bolt);
    when 'end' then
      -- (the storm settles when it's over — this just hands back what it came to)
      if jsonb_typeof(s -> 'storm') = 'object' and not coalesce((s -> 'storm' ->> 'settled')::boolean, false) then raise exception 'too_soon' using errcode = 'P0001'; end if;
      r := jsonb_build_object('ended', true, 'last', s -> 'last', 'pay', s -> 'last' -> 'pay');
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_stormcoil(e public.enchantments, t timestamptz) returns jsonb language sql stable as $$
  select g || jsonb_build_object('attention', case when g -> 'storm' is not null and jsonb_typeof(g -> 'storm') = 'object' then 'A storm is raging — catch the bolts!'
                                                   when (g ->> 'charge')::numeric >= 100 and (g ->> 'storms_left')::int > 0 then 'Fully charged — call the storm'
                                                   when (g ->> 'storms_left')::int > 0 then 'Crank it up for a storm' end)
  from (select private.storm_eval(e) g) x
$$;

/** catch a stray bolt that landed on someone else's storm (a few Ink for you, a little for the storm) */
create or replace function public.storm_catch(p_id uuid, p_i int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); e public.enchantments; st jsonb; b jsonb; v_el numeric;
begin
  perform private.rate_limit('storm_catch', 600, 3600);
  select * into e from public.enchantments where id = p_id and kind = 'stormcoil' and status = 'active' for update;
  st := e.state -> 'storm';
  if e.id is null or jsonb_typeof(st) is distinct from 'object' or coalesce((st ->> 'settled')::boolean, false) then raise exception 'no_storm' using errcode = 'P0001'; end if;
  if e.owner_id = v_uid then raise exception 'own_storm' using errcode = 'P0001'; end if;
  b := st -> 'bolts' -> p_i;
  if b is null or b ->> 'kind' <> 'stray' then raise exception 'bad_target' using errcode = 'P0001'; end if;
  if coalesce(st -> 'caught', '{}'::jsonb) ? p_i::text then raise exception 'already_caught' using errcode = 'P0001'; end if;
  v_el := extract(epoch from clock_timestamp()) - (st ->> 'at')::numeric;
  if v_el < (b ->> 't')::numeric - 1.6 or v_el > (b ->> 't')::numeric + 0.8 then raise exception 'missed' using errcode = 'P0001'; end if;
  st := jsonb_set(st, array['caught', p_i::text], to_jsonb(v_uid::text));
  st := st || jsonb_build_object('ink', coalesce((st ->> 'ink')::numeric, 0) + 2);
  update public.enchantments set state = state || jsonb_build_object('storm', st) where id = e.id;
  perform private.grant_ink_paced(v_uid, 5, 'enchantment', 'storm_catch', e.id::text, null);
  return jsonb_build_object('caught', true, 'ink', 5, 'balances', private.balances(v_uid));
end $$;

-- ==== settling: coils, renewals and storms come before a splice is folded away ============================================
create or replace function private.ench_settle(p_id uuid) returns void language plpgsql as $$
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
end $$;

/** the heartbeat: loops that came round, splices that renew, storms that passed */
create or replace function private.wonders_tick() returns void language plpgsql as $$
declare r record;
begin
  for r in select id from public.enchantments where kind = 'ouroboros' and jsonb_typeof(state -> 'coil') = 'object' limit 2000 loop
    perform private.ouro_settle(r.id);
  end loop;
  for r in select id from public.enchantments where kind = 'stormcoil' and jsonb_typeof(state -> 'storm') = 'object' and not coalesce((state -> 'storm' ->> 'settled')::boolean, false)
             and (state -> 'storm' ->> 'until')::numeric + 3 < extract(epoch from now()) limit 500 loop
    perform private.storm_settle(r.id);
  end loop;
  perform private.endless_renew(null);
end $$;

-- ==== init, views, titles, the dispatcher ==================================================================================
create or replace function private.ench_init(p_kind text, t timestamptz) returns jsonb language sql stable as $$
  select case p_kind
    when 'goose' then jsonb_build_object('egg_at', private.ench_ep(t), 'polish', 0, 'chased', '[]'::jsonb, 'eggs', 0, 'streak', 0)
    when 'genie' then jsonb_build_object('wishes', 1, 'charge_at', private.ench_ep(t))
    when 'map' then jsonb_build_object('pieces', '[]'::jsonb, 'next_at', 0)
    when 'parasite' then jsonb_build_object('stage', 0, 'feeds', 0)
    when 'cuckoo' then jsonb_build_object('nests', '[]'::jsonb)
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
    else '{}'::jsonb end
$$;

create or replace function private.ench_kind_view(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
begin
  return case e.kind
    when 'goose' then private.ench_view_goose(e, t) when 'genie' then private.ench_view_genie(e, t) when 'map' then private.ench_view_map(e, t)
    when 'parasite' then private.ench_view_parasite(e, t) when 'cuckoo' then private.ench_view_cuckoo(e, t) when 'pandora' then private.ench_view_pandora(e, t)
    when 'splice' then private.ench_view_splice(e, t) when 'clockwork' then private.ench_view_clockwork(e, t) when 'sizeray' then private.ench_view_sizeray(e, t)
    when 'wormhole' then private.ench_view_wormhole(e, t) when 'oracle' then private.ench_view_oracle(e, t)
    when 'ouroboros' then private.ench_view_ouroboros(e, t) when 'homunculus' then private.ench_view_homunculus(e, t) when 'stormcoil' then private.ench_view_stormcoil(e, t)
    when 'shard' then jsonb_build_object('cracks', coalesce((e.state ->> 'cracks')::int, 0), 'options', coalesce(e.state -> 'options', '[]'::jsonb),
      'reflect', case when coalesce((e.state -> 'reflect' ->> 'until')::numeric, 0) > private.ench_ep(t) then e.state -> 'reflect' end,
      'gaze_in', greatest(0, round(coalesce((e.state ->> 'gazed_at')::numeric, 0) + private.ench_n('shard', 'cooldown_h', 20) * 3600 - private.ench_ep(t))),
      'attention', case when coalesce((e.state -> 'reflect' ->> 'until')::numeric, 0) <= private.ench_ep(t)
                         and (jsonb_array_length(coalesce(e.state -> 'options', '[]'::jsonb)) > 0 or coalesce((e.state ->> 'gazed_at')::numeric, 0) + private.ench_n('shard', 'cooldown_h', 20) * 3600 <= private.ench_ep(t))
                        then 'The shard shows new reflections' end)
  end;
end $$;

-- the Mirror Shard can't reflect the three new ones either (their power lives in a coil, a flask and a storm)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.ench_act_shard(public.enchantments,text,jsonb,timestamp with time zone)'::regprocedure);
  n := replace(d, $a$and kind not in ('splice', 'shard', 'wormhole', 'oracle') order by kind, random()$a$,
                  $a$and kind not in ('splice', 'shard', 'wormhole', 'oracle', 'ouroboros', 'homunculus', 'stormcoil') order by kind, random()$a$);
  if n = d then raise exception 'serpent: shard anchor not found'; end if;
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
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'codex', '[]'::jsonb)) >= 91 then 'Codex Complete' end,
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
    case when e.kind = 'stormcoil' and coalesce((e.stats ->> 'aberrations')::int, 0) >= 1 then 'Galvanist' end], null)
$$;

create or replace function public.enchant_act(p_id uuid, p_action text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
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
      when 'parasite' then private.ench_act_parasite(x, p_action, a, t) when 'cuckoo' then private.ench_act_cuckoo(x, p_action, a, t) when 'pandora' then private.ench_act_pandora(x, p_action, a, t)
      when 'clockwork' then private.ench_act_clockwork(x, p_action, a, t) when 'sizeray' then private.ench_act_sizeray(x, p_action, a, t) end;
    if v is null then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    update public.enchantments set state = state || jsonb_build_object('r', v -> 'state'), updated_at = now() where id = e.id;
  else
    v_kind := e.kind;
    v := case e.kind
      when 'goose' then private.ench_act_goose(e, p_action, a, t) when 'genie' then private.ench_act_genie(e, p_action, a, t) when 'map' then private.ench_act_map(e, p_action, a, t)
      when 'parasite' then private.ench_act_parasite(e, p_action, a, t) when 'cuckoo' then private.ench_act_cuckoo(e, p_action, a, t) when 'pandora' then private.ench_act_pandora(e, p_action, a, t)
      when 'splice' then private.ench_act_splice(e, p_action, a, t) when 'clockwork' then private.ench_act_clockwork(e, p_action, a, t)
      when 'sizeray' then private.ench_act_sizeray(e, p_action, a, t) when 'shard' then private.ench_act_shard(e, p_action, a, t)
      when 'wormhole' then private.ench_act_wormhole(e, p_action, a, t) when 'oracle' then private.ench_act_oracle(e, p_action, a, t)
      when 'ouroboros' then private.ench_act_ouroboros(e, p_action, a, t) when 'homunculus' then private.ench_act_homunculus(e, p_action, a, t)
      when 'stormcoil' then private.ench_act_stormcoil(e, p_action, a, t) end;
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
end $$;

-- ==== the map: walking Homunculi, coiled serpents, storms ==================================================================
create or replace function public.enchant_map2(p_min_gx int, p_min_gy int, p_max_gx int, p_max_gy int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_walk jsonb := '[]'::jsonb; h public.enchantments; v_pos int[]; v_day text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
begin
  if p_max_gx - p_min_gx > 20000 or p_max_gy - p_min_gy > 20000 then
    return jsonb_build_object('walkers', '[]'::jsonb, 'coils', '[]'::jsonb, 'storms', '[]'::jsonb, 'server_now', extract(epoch from clock_timestamp()));
  end if;
  for h in select * from public.enchantments where kind = 'homunculus' and status = 'active' and jsonb_typeof(state -> 'awake') = 'object' limit 2000 loop
    v_pos := private.homu_pos(h.state -> 'awake', private.ench_ep(private.ench_now(h)));
    if v_pos is not null and v_pos[1] between p_min_gx - 8 and p_max_gx + 8 and v_pos[2] between p_min_gy - 8 and p_max_gy + 8 then
      v_walk := v_walk || jsonb_build_array(jsonb_build_object('id', h.id, 'gx', v_pos[1], 'gy', v_pos[2], 'mine', h.owner_id = v_uid,
        'owner_name', (select username from public.profiles where id = h.owner_id), 'serial', h.serial, 'nickname', h.nickname, 'sigil', h.sigil, 'level', h.level,
        'parts', (select coalesce(jsonb_agg(jsonb_build_object('k', p ->> 'k', 'lv', coalesce((p ->> 'lv')::int, 1), 'glow', coalesce((p ->> 'glow')::boolean, false))), '[]'::jsonb)
                    from jsonb_array_elements(coalesce(h.state -> 'parts', '[]'::jsonb)) p),
        'mult', round(private.homu_mult(h.state -> 'parts'), 2), 'home', jsonb_build_array(h.gx, h.gy),
        'greeted', v_uid is not null and h.state -> 'awake' ->> 'greet_day' = v_day and coalesce(h.state -> 'awake' -> 'greeted', '[]'::jsonb) ? v_uid::text));
    end if;
  end loop;
  return jsonb_build_object(
    'walkers', v_walk,
    'coils', coalesce((select jsonb_agg(distinct jsonb_build_object('id', o.id, 'gx', coalesce(m.gx, sp.plot_gx), 'gy', coalesce(m.gy, sp.plot_gy),
                         'loops', coalesce((o.state -> 'coil' ->> 'loops')::int, 0), 'status', o.state -> 'coil' ->> 'status', 'mine', o.owner_id = v_uid))
                       from public.enchantments o cross join lateral jsonb_array_elements_text(o.state -> 'coil' -> 'rows') rid
                       join public.enchant_splices sp on sp.id = rid::bigint
                       left join public.enchantments m on m.id = sp.a or m.id = sp.b
                      where o.kind = 'ouroboros' and o.status = 'active' and jsonb_typeof(o.state -> 'coil') = 'object'
                        and coalesce(m.gx, sp.plot_gx) between p_min_gx - 8 and p_max_gx + 8 and coalesce(m.gy, sp.plot_gy) between p_min_gy - 8 and p_max_gy + 8), '[]'::jsonb),
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

do $$
declare f text;
begin
  foreach f in array array['public.homunculus_greet(uuid)', 'public.storm_catch(uuid, integer)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  execute 'grant execute on function public.enchant_map2(integer, integer, integer, integer) to anon, authenticated';
end $$;

-- the heartbeat runs every two minutes where pg_cron is available (Supabase); elsewhere coils and storms settle when someone acts
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.unschedule(jobid) from cron.job where jobname = 'landvas-wonders';
      perform cron.schedule('landvas-wonders', '*/2 * * * *', 'select private.wonders_tick()');
    exception when others then
      raise notice 'pg_cron not available here (%): coils and storms settle on demand', sqlerrm;
    end;
  end if;
end $$;
