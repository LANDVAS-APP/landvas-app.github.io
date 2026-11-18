-- Enchantments, part 14: 🫙 Déjà Vu — the twenty-first kind. A glass jar that catches moments and lets them happen again.
--
--  So much in LANDVAS only lasts a moment: the day's Hot Zone, a Solar Flare, the Leviathan's Weak Spot, a bolt from a
--  storm, a falling star, a Golden Hour. While one is happening near you, swipe the jar through it and twist the lid
--  shut: the moment is caught. Uncork it later — anywhere, whenever you like — and it happens again, where you are.
--
--   🔥 the Hot Zone      → uncorked on a spot in reach: a Déjà Vu zone, 150 m (+10 m a level) for 15 min, ultras ×2.5
--   🌞 a Solar Flare     → a zone where every claim keeps the better of two rolls, for 60 s
--   🎯 a Weak Spot       → the Leviathan's weak moment again, for everyone: half its length (Sunburst / Divine too)
--   ⚡ a bolt of lightning→ strikes one of your spliced enchantments: a storm mutation (1 in 6 an Aberration)
--   🌠 a falling star    → three stars fall into your hand (Ink, Luck or a Golden Hour each)
--   ✨ a Golden Hour     → bottled for later: it stops now and starts again when you uncork it
--
--  The jar holds 3 moments. Each fades as it waits (full strength → half over 7 days, then it's gone) and every source can
--  be caught once (one Hot Zone a day, one scoop a storm, a shower, a weak moment). Strength scales what comes out.
--  Stars: ★1 Wide Neck (holds 4) · ★2 Good Cork (fades over 14 days) · ★3 Double Take (once a day an uncorked moment
--  leaves half of itself in the jar) · ★4 Vintage (uncorked moments 50% stronger) · ★5 Eternal Moment (moments never fade,
--  and uncorked zones are shared with your party).
--  Trait 🫙 Preserved: the good its partner makes lasts ×(1 + 0.5k) longer (giants, creases, glows, wards, shields,
--  overcharges, static, the Grand Show), and bad things on it pass ×(1 + 0.5k) sooner (the curses it lets out, scorches and the
--  Leviathan's trample on its plot).
--  Leviathan move Déjà Vu: every hit landed on it in the last 10 seconds lands again (never another Déjà Vu's).
-- Every number is a setting: game_config 'enchantments' → dejavu (private.ench_n), so the Enchantment editor shows them.

-- ---- the kind ---------------------------------------------------------------------------------------------------------
alter table public.enchantments drop constraint if exists enchantments_kind_check;
alter table public.enchantments add constraint enchantments_kind_check
  check (kind in ('goose', 'genie', 'map', 'parasite', 'cuckoo', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard', 'wormhole', 'oracle',
                  'stormcoil', 'spyglass', 'origami', 'crucible', 'puppeteer', 'deck', 'glyph', 'sun', 'rod', 'dejavu'));
-- it rolls as often as every other kind (weight 1); the chance of an Enchanted roll itself is unchanged
update public.game_config set value = jsonb_set(value, '{weights}', '{"dejavu": 1}'::jsonb || coalesce(value -> 'weights', '{}'::jsonb))
 where key = 'enchantments' and not coalesce(value -> 'weights', '{}'::jsonb) ? 'dejavu';

select private.fn_patch('private.ench_kinds()', $a$'sun', 'rod']$a$, $b$'sun', 'rod', 'dejavu']$b$);
select private.fn_patch('private.ench_info(text)',
  $a$    when 'rod' then '{"name": "Dowsing Rod", "emoji": "🪄", "gene": "divining", "gene_name": "Divining"}'$a$,
  $b$    when 'rod' then '{"name": "Dowsing Rod", "emoji": "🪄", "gene": "divining", "gene_name": "Divining"}'
    when 'dejavu' then '{"name": "Déjà Vu", "emoji": "🫙", "gene": "preserved", "gene_name": "Preserved"}'$b$);
select private.fn_patch('private.ench_init(text,timestamptz)',
  $a$    when 'rod' then jsonb_build_object('targets', '[]'::jsonb)$a$,
  $b$    when 'rod' then jsonb_build_object('targets', '[]'::jsonb)
    when 'dejavu' then jsonb_build_object('jar', '[]'::jsonb, 'zones', '[]'::jsonb, 'seen', '{}'::jsonb, 'n', 0)$b$);
select private.fn_patch('private.ench_hatchable()', $a$'glyph', 'sun', 'rod']$a$, $b$'glyph', 'sun', 'rod', 'dejavu']$b$);
select private.fn_patch('private.ench_reaches(text)', $a$'glyph', 'sun', 'rod')$a$, $b$'glyph', 'sun', 'rod', 'dejavu')$b$);
select private.fn_patch('private.rune_of(text)', $a$"sun": "star", "rod": "arrow"}$a$, $b$"sun": "star", "rod": "arrow", "dejavu": "hourglass"}$b$);
select private.fn_patch('private.ench_word(text,text)', $a$"rod": ["Divining", "Wand"]}$a$, $b$"rod": ["Divining", "Wand"], "dejavu": ["Twice-Lived", "Jar"]}$b$);

-- the hybrids: nineteen more (190 in all, 36 Perfect Matches)
do $$
declare v jsonb;
begin
  v := private.ench_hybrids() || '{"dejavu+goose": ["Preserved Egg", false], "dejavu+genie": ["Wish in a Jar", false], "dejavu+map": ["Jarred Map", false],
         "dejavu+parasite": ["Specimen Jar", false], "dejavu+pandora": ["Bottled Evil", true], "clockwork+dejavu": ["Time in a Bottle", true],
         "dejavu+sizeray": ["Jarred Giant", false], "dejavu+shard": ["Bottled Reflection", false], "dejavu+wormhole": ["Bottleneck", false],
         "dejavu+oracle": ["Jar of Omens", false], "dejavu+sun": ["Sunjar", false], "dejavu+rod": ["Deep Jar", false],
         "dejavu+stormcoil": ["Lightning in a Bottle", true], "dejavu+spyglass": ["Ship in a Bottle", false], "dejavu+origami": ["Folded Moment", false],
         "crucible+dejavu": ["Jar of Embers", false], "dejavu+puppeteer": ["Encore Jar", false], "deck+dejavu": ["Card in a Jar", false],
         "dejavu+glyph": ["Bottled Spell", false]}'::jsonb;
  execute format('create or replace function private.ench_hybrids() returns jsonb language sql immutable as %L', 'select ' || quote_literal(v::text) || '::jsonb');
end $$;

-- ---- 🫙 the jar ------------------------------------------------------------------------------------------------------
/** what each moment is called */
create or replace function private.dv_moment(p_t text) returns jsonb language sql immutable as $$
  select (('{"hotzone": {"name": "the Hot Zone", "emoji": "🔥"}, "flare": {"name": "a Solar Flare", "emoji": "🌞"},
            "weakspot": {"name": "a weak moment", "emoji": "🎯"}, "bolt": {"name": "a bolt of lightning", "emoji": "⚡"},
            "star": {"name": "a falling star", "emoji": "🌠"}, "golden": {"name": "a Golden Hour", "emoji": "✨"}}'::jsonb) -> p_t)
$$;

/** how many moments it holds (★1 Wide Neck: one more) */
create or replace function private.dv_cap(e public.enchantments) returns int language sql stable as $$
  select private.ench_n('dejavu', 'cap', 3)::int + case when e.stars >= 1 then 1 else 0 end
$$;

/** how long a moment keeps, in seconds (★2 Good Cork: twice as long; ★5: forever — null) */
create or replace function private.dv_fade_s(e public.enchantments) returns numeric language sql stable as $$
  select case when e.stars >= 5 then null else private.ench_n('dejavu', 'fade_d', 7) * 86400 * case when e.stars >= 2 then 2 else 1 end end
$$;

/** a caught moment as it is now: its strength fades from full to half as it waits, then it's gone */
create or replace function private.dv_now(e public.enchantments, m jsonb, p_ep numeric) returns jsonb language plpgsql stable as $$
declare v_f numeric := private.dv_fade_s(e); v_age numeric := greatest(0, p_ep - coalesce((m ->> 'at')::numeric, p_ep)); v_s numeric;
begin
  if v_f is not null and v_age >= v_f then return null; end if;
  v_s := coalesce((m ->> 's0')::numeric, 1) * case when v_f is null then 1 else 1 - 0.5 * v_age / v_f end;
  return m || jsonb_build_object('s', round(v_s, 3), 'pct', round(100 * v_s), 'gone_at', case when v_f is not null then round(coalesce((m ->> 'at')::numeric, p_ep) + v_f) end,
    'name', private.dv_moment(m ->> 't') ->> 'name', 'emoji', private.dv_moment(m ->> 't') ->> 'emoji');
end $$;

/** the moments still in the jar (faded ones gone) */
create or replace function private.dv_jar(e public.enchantments, p_ep numeric) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x.j order by (x.j ->> 'i')::int), '[]'::jsonb)
    from (select private.dv_now(e, m, p_ep) j from jsonb_array_elements(coalesce(e.state -> 'jar', '[]'::jsonb)) m) x
   where x.j is not null
$$;

/** its zones still burning */
create or replace function private.dv_zones(s jsonb, p_ep numeric) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(z order by (z ->> 'i')::int), '[]'::jsonb) from jsonb_array_elements(coalesce(s -> 'zones', '[]'::jsonb)) z where (z ->> 'until')::numeric > p_ep
$$;

/** the moments happening near the owner right now, that this jar hasn't caught yet.
    (This runs in every view of the jar, and the Grimoire's list polls views: so it stays cheap and bounded — a few
    indexed lookups, and storms and showers only in a box around your explorer, never a scan of the world.) */
create or replace function private.dv_live(e public.enchantments) returns jsonb language plpgsql stable as $$
declare v_uid uuid := e.owner_id; v_ep numeric := extract(epoch from now()); v_seen jsonb := coalesce(e.state -> 'seen', '{}'::jsonb); v_out jsonb := '[]'::jsonb;
  v_range numeric := private.ench_n('dejavu', 'range_m', 2000) * private.ench_reach(e.id); c record; hz jsonb; l public.leviathans; r record; v_src text; v_in boolean := false;
  v_rad int; v_cells int;
begin
  if v_uid is null then return v_out; end if;
  select * into c from private.explorer_now(v_uid);
  v_cells := ceil(v_range / 3)::int + 2;
  -- 🔥 today's Hot Zone: your explorer is in it, or one of your plots is
  hz := private.hot_zone(private.today());
  if hz is not null then
    v_src := 'hot:' || private.today()::text;
    if not v_seen ? v_src then
      v_in := c.gx is not null and private.in_hot_zone(c.gx, c.gy);
      if not v_in then
        v_rad := (hz ->> 'radius')::int;
        v_in := exists (select 1 from public.world_plots w where w.owner_id = v_uid
                          and w.gx between (hz ->> 'gx')::int - v_rad and (hz ->> 'gx')::int + v_rad and w.gy between (hz ->> 'gy')::int - v_rad and (hz ->> 'gy')::int + v_rad
                          and private.in_hot_zone(w.gx, w.gy));
      end if;
      if v_in then v_out := v_out || jsonb_build_array(jsonb_build_object('t', 'hotzone', 'src', v_src, 'from', hz ->> 'name', 'd', jsonb_build_object('city', hz ->> 'name'))); end if;
    end if;
  end if;
  -- 🌞 a Solar Flare of your own Pocket Sun (or a party-mate's shared one)
  for r in select x.eid, x.owner_id, x.z from private.sun_live(array[v_uid] || private.party_mates(v_uid)) x
            where (x.z ->> 'flare')::boolean and (x.owner_id = v_uid or coalesce((x.z ->> 'party')::boolean, false)) limit 3 loop
    v_src := 'flare:' || r.eid || ':' || (r.z ->> 'i') || ':' || private.today()::text;
    continue when v_seen ? v_src;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t', 'flare', 'src', v_src, 'from', case when r.owner_id = v_uid then 'your Pocket Sun' else '@' || coalesce((select username from public.profiles where id = r.owner_id), '?') || '’s sun' end,
                                                           'd', '{}'::jsonb));
    exit;
  end loop;
  -- 🎯 the Leviathan's weak moment (a Weak Spot, a Sunburst or a Divine, whichever is strongest), if you can see it
  select * into l from public.leviathans where status in ('walking', 'enraged', 'fleeing') order by spawned_at desc limit 1;
  -- (a weak moment a jar let out can't be caught again: no loops)
  if l.id is not null and (not private.lev_hidden(l) or private.lev_spotted(l, v_uid)) then
    if l.weakspot_until > now() and extract(epoch from l.weakspot_until) > coalesce((l.data ->> 'dv_weakspot')::numeric, 0) + 0.5 then
      v_src := 'lev:' || l.id || ':weakspot:' || floor(extract(epoch from l.weakspot_until) / 60);
      if not v_seen ? v_src then v_out := v_out || jsonb_build_array(jsonb_build_object('t', 'weakspot', 'src', v_src, 'from', 'the Leviathan',
        'd', jsonb_build_object('col', 'weakspot', 'secs', 10, 'label', 'Weak Spot · ×2'))); end if;
    elsif l.sunburst_until > now() and extract(epoch from l.sunburst_until) > coalesce((l.data ->> 'dv_sunburst')::numeric, 0) + 0.5 then
      v_src := 'lev:' || l.id || ':sunburst:' || floor(extract(epoch from l.sunburst_until) / 60);
      if not v_seen ? v_src then v_out := v_out || jsonb_build_array(jsonb_build_object('t', 'weakspot', 'src', v_src, 'from', 'the Leviathan',
        'd', jsonb_build_object('col', 'sunburst', 'secs', 30, 'label', 'Sunburst · ×1.5'))); end if;
    elsif l.divined_until > now() and extract(epoch from l.divined_until) > coalesce((l.data ->> 'dv_divined')::numeric, 0) + 0.5 then
      v_src := 'lev:' || l.id || ':divined:' || floor(extract(epoch from l.divined_until) / 60);
      if not v_seen ? v_src then v_out := v_out || jsonb_build_array(jsonb_build_object('t', 'weakspot', 'src', v_src, 'from', 'the Leviathan',
        'd', jsonb_build_object('col', 'divined', 'secs', 20, 'label', 'Divine · +20%'))); end if;
    end if;
  end if;
  -- ⚡ a storm raging near your explorer (anyone's, your own too)
  for r in select x.id, x.gx, x.gy, x.owner_id, x.state -> 'storm' ->> 'at' sat from public.enchantments x
            where c.gx is not null and x.gx between c.gx - v_cells and c.gx + v_cells and x.gy between c.gy - v_cells and c.gy + v_cells
              and x.kind = 'stormcoil' and x.status = 'active' and jsonb_typeof(x.state -> 'storm') = 'object'
              and not coalesce((x.state -> 'storm' ->> 'settled')::boolean, false)
              and (x.state -> 'storm' ->> 'until')::numeric > v_ep and (x.state -> 'storm' ->> 'at')::numeric <= v_ep limit 20 loop
    v_src := 'storm:' || r.id || ':' || r.sat;
    continue when v_seen ? v_src or private.ench_cell_m(c.gx, c.gy, r.gx, r.gy) > v_range;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t', 'bolt', 'src', v_src,
      'from', case when r.owner_id = v_uid then 'your storm' else '@' || coalesce((select username from public.profiles where id = r.owner_id), '?') || '’s storm' end,
      'd', jsonb_build_object('storm', r.id)));
    exit;
  end loop;
  -- 🌠 a shower of falling stars near your explorer
  for r in select s.gx, s.gy, s.data ->> 'shower' sh from public.rarity_spots s
            where c.gx is not null and s.gx between c.gx - v_cells and c.gx + v_cells and s.gy between c.gy - v_cells and c.gy + v_cells
              and s.kind = 'star' and s.expires_at > now() limit 40 loop
    v_src := 'star:' || coalesce(r.sh, r.gx || '_' || r.gy);
    continue when v_seen ? v_src or private.ench_cell_m(c.gx, c.gy, r.gx, r.gy) > v_range;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t', 'star', 'src', v_src, 'from', 'a Fallen Star shower', 'd', jsonb_build_object('shower', r.sh)));
    exit;
  end loop;
  -- ✨ a Golden Hour you have running (bottling it moves it into the jar; one that came out of a jar can't go back in)
  for r in select b.id, b.uses, b.mult from public.enchant_buffs b where b.player_id = v_uid and b.kind = 'golden_hour' and b.expires_at > now() and coalesce(b.uses, 0) > 0
              and not b.data ? 'dejavu'
            order by b.uses desc, b.id limit 1 loop
    v_src := 'gold:' || r.id;
    continue when v_seen ? v_src;
    v_out := v_out || jsonb_build_array(jsonb_build_object('t', 'golden', 'src', v_src, 'from', 'your Golden Hour',
      'd', jsonb_build_object('buff', r.id, 'uses', r.uses, 'mult', r.mult)));
  end loop;
  return (select coalesce(jsonb_agg(m || jsonb_build_object('name', private.dv_moment(m ->> 't') ->> 'name', 'emoji', private.dv_moment(m ->> 't') ->> 'emoji')), '[]'::jsonb)
            from jsonb_array_elements(v_out) m);
end $$;

/** the owner's enchantments in a live splice (where a bottled bolt can strike) */
create or replace function private.dv_hybrids(p_uid uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'serial', x.serial, 'name', coalesce(x.nickname, (private.ench_info(x.kind) ->> 'name') || ' #' || x.serial),
                                               'hybrid', private.ench_partner(x.id) ->> 'hybrid') order by x.kind, x.serial), '[]'::jsonb)
    from public.enchantments x where x.owner_id = p_uid and x.status = 'active' and private.ench_spliced(x.id)
$$;

create or replace function private.ench_view_dejavu(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare v_ep numeric := extract(epoch from now()); v_jar jsonb := private.dv_jar(e, v_ep); v_live jsonb := private.dv_live(e); v_cap int := private.dv_cap(e); c record;
  v_lev boolean := exists (select 1 from public.leviathans where status in ('walking', 'enraged', 'fleeing'));
begin
  select * into c from private.explorer_now(e.owner_id);
  return jsonb_build_object('jar', v_jar, 'cap', v_cap, 'live', v_live, 'zones', private.dv_zones(e.state, v_ep),
    'range_m', round(private.ench_n('dejavu', 'range_m', 2000) * private.ench_reach(e.id)),
    'zone_m', round(private.ench_n('dejavu', 'zone_m', 150) + 10 * (least(e.level, 10) - 1)),
    'fade_d', case when private.dv_fade_s(e) is null then null else round(private.dv_fade_s(e) / 86400) end,
    'vintage', e.stars >= 4, 'double_take', e.stars >= 3 and coalesce(e.state ->> 'dt_day', '') <> private.today()::text, 'shared', e.stars >= 5,
    'explorer', case when c.gx is not null then jsonb_build_array(c.gx, c.gy) end, 'hybrids', private.dv_hybrids(e.owner_id), 'leviathan', v_lev,
    'hot_zone', private.hot_zone(private.today()),
    'last', e.state -> 'last', 'scooped', coalesce((e.stats ->> 'scooped')::int, 0), 'uncorked', coalesce((e.stats ->> 'uncorked')::int, 0),
    'attention', case when jsonb_array_length(v_live) > 0 and jsonb_array_length(v_jar) < v_cap then (v_live -> 0 ->> 'emoji') || ' A moment is happening — catch it in the jar'
                      when jsonb_array_length(v_jar) > 0 and exists (select 1 from jsonb_array_elements(v_jar) m where (m ->> 'gone_at')::numeric - v_ep < 86400)
                        then 'A moment in the jar is fading — uncork it soon' end);
end $$;

create or replace function private.ench_act_dejavu(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; v_ep numeric := extract(epoch from now()); v_jar jsonb := private.dv_jar(e, v_ep); v_live jsonb; m jsonb; r jsonb; v_idx int; v_i int;
  v_t text; v_s numeric; v_sx numeric; v_gx int; v_gy int; z jsonb; zs jsonb; v_r numeric; v_secs numeric; v_n int; v_k int; v_ink numeric := 0; v_luck int := 0; v_gold int := 0;
  v_pay jsonb; v_x numeric; l public.leviathans; v_uses int; v_dt boolean := false; v_seen jsonb; v_day text := private.today()::text; v_target uuid; v_hits jsonb;
begin
  -- (what's faded is gone; what's been caught is remembered for 3 days)
  select coalesce(jsonb_object_agg(k, x), '{}'::jsonb) into v_seen from jsonb_each(coalesce(s -> 'seen', '{}'::jsonb)) j(k, x) where (x #>> '{}')::numeric > v_ep - 3 * 86400;
  s := s || jsonb_build_object('jar', (select coalesce(jsonb_agg(j - 's' - 'pct' - 'gone_at' - 'name' - 'emoji' order by (j ->> 'i')::int), '[]'::jsonb) from jsonb_array_elements(v_jar) j),
                               'zones', private.dv_zones(s, v_ep), 'seen', v_seen);
  case p_action
    when 'scoop' then
      if jsonb_array_length(v_jar) >= private.dv_cap(e) then raise exception 'jar_full' using errcode = 'P0001'; end if;
      v_live := private.dv_live(e);
      select x into m from jsonb_array_elements(v_live) x where (a ->> 'src' is not null and x ->> 'src' = a ->> 'src') or (a ->> 'src' is null and x ->> 't' = a ->> 't') limit 1;
      if m is null then raise exception 'no_moment' using errcode = 'P0001'; end if;
      v_t := m ->> 't';
      -- ✨ a Golden Hour goes into the jar whole: it stops running now
      if v_t = 'golden' then
        delete from public.enchant_buffs where id = (m -> 'd' ->> 'buff')::bigint and player_id = e.owner_id and kind = 'golden_hour' and coalesce(uses, 0) > 0
          returning uses, mult into v_uses, v_x;
        if v_uses is null then raise exception 'no_moment' using errcode = 'P0001'; end if;
        m := jsonb_set(m, '{d}', (m -> 'd') || jsonb_build_object('uses', v_uses, 'mult', v_x));
      end if;
      v_i := coalesce((s ->> 'n')::int, 0) + 1;
      m := jsonb_build_object('i', v_i, 't', v_t, 'src', m ->> 'src', 'from', m ->> 'from', 'd', m -> 'd', 'at', v_ep, 's0', 1);
      s := s || jsonb_build_object('jar', (s -> 'jar') || jsonb_build_array(m), 'n', v_i, 'seen', (s -> 'seen') || jsonb_build_object(m ->> 'src', v_ep),
                                   'last', jsonb_build_object('did', 'scoop', 't', v_t, 'at', v_ep));
      perform private.ench_stat(e.id, 'scooped');
      if coalesce((e.stats ->> ('scoop_' || v_t))::int, 0) = 0 then perform private.ench_stat(e.id, 'moment_kinds'); end if;
      perform private.ench_stat(e.id, 'scoop_' || v_t);
      perform private.ench_xp(e.id, 1);
      perform private.fairplay(e.owner_id, 'dv_scoop', e.gx, e.gy, jsonb_build_object('enchant', e.id, 't', v_t, 'src', m ->> 'src'));
      perform private.ench_event(e.id, 'scooped', jsonb_build_object('t', v_t, 'name', private.dv_moment(v_t) ->> 'name', 'from', m ->> 'from'));
      r := jsonb_build_object('scooped', private.dv_now(e, m, v_ep));

    when 'uncork' then
      v_i := (a ->> 'i')::int;
      select (o - 1)::int into v_idx from jsonb_array_elements(s -> 'jar') with ordinality x(j, o) where (j ->> 'i')::int = v_i;
      if v_idx is null then raise exception 'no_moment' using errcode = 'P0001'; end if;
      m := private.dv_now(e, s -> 'jar' -> v_idx, v_ep);
      if m is null then raise exception 'no_moment' using errcode = 'P0001'; end if;
      v_t := m ->> 't'; v_s := (m ->> 's')::numeric;
      -- ★4 Vintage: what comes out is 50% stronger
      v_sx := v_s * case when e.stars >= 4 then private.ench_n('dejavu', 'vintage_x', 1.5) else 1 end;
      case v_t
        when 'hotzone', 'flare' then
          v_gx := (a ->> 'gx')::int; v_gy := (a ->> 'gy')::int;
          if v_gx is null or v_gy is null or v_gx not between 0 and 4194303 or v_gy not between 0 and 4194303 then raise exception 'invalid_plot' using errcode = 'P0001'; end if;
          if not private.spy_in_range(e.owner_id, v_gx, v_gy, private.ench_n('dejavu', 'range_m', 2000) * private.ench_reach(e.id)) then raise exception 'out_of_range' using errcode = 'P0001'; end if;
          zs := s -> 'zones';
          if jsonb_array_length(zs) >= private.ench_n('dejavu', 'max_zones', 3) then raise exception 'too_many_zones' using errcode = 'P0001'; end if;
          v_r := private.ench_n('dejavu', 'zone_m', 150) + 10 * (least(e.level, 10) - 1);
          if v_t = 'hotzone' then
            v_x := 1 + (private.ench_n('dejavu', 'zone_x', 2.5) - 1) * v_sx;
            v_secs := greatest(300, private.ench_n('dejavu', 'zone_min', 15) * 60 * v_sx);
          else
            v_x := 1;
            v_secs := greatest(20, private.ench_n('dejavu', 'flare_s', 60) * v_sx);
          end if;
          z := jsonb_build_object('i', coalesce((s ->> 'n')::int, 0) + 1, 't', v_t, 'gx', v_gx, 'gy', v_gy, 'r_m', round(v_r), 'um', round(v_x, 2), 'flare', v_t = 'flare',
                                  'at', v_ep, 'until', v_ep + round(v_secs), 'party', e.stars >= 5);
          s := s || jsonb_build_object('zones', zs || jsonb_build_array(z), 'n', coalesce((s ->> 'n')::int, 0) + 1);
          perform private.fairplay(e.owner_id, 'dv_zone', v_gx, v_gy, jsonb_build_object('enchant', e.id, 't', v_t, 'um', z -> 'um', 'secs', round(v_secs)));
          r := jsonb_build_object('zone', z);
        when 'weakspot' then
          select * into l from public.leviathans where status in ('walking', 'enraged', 'fleeing') order by spawned_at desc limit 1 for update;
          if l.id is null then raise exception 'no_leviathan' using errcode = 'P0001'; end if;
          v_secs := greatest(1, round(coalesce((m -> 'd' ->> 'secs')::numeric, 10) * private.ench_n('dejavu', 'lev_part', 0.5) * v_sx));
          -- (what a jar lets out is remembered, so nobody can catch it again)
          case m -> 'd' ->> 'col'
            when 'sunburst' then update public.leviathans set sunburst_until = greatest(coalesce(sunburst_until, now()), now()) + make_interval(secs => v_secs) where id = l.id returning * into l;
              update public.leviathans set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('dv_sunburst', extract(epoch from l.sunburst_until)) where id = l.id;
            when 'divined' then update public.leviathans set divined_until = greatest(coalesce(divined_until, now()), now()) + make_interval(secs => v_secs) where id = l.id returning * into l;
              update public.leviathans set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('dv_divined', extract(epoch from l.divined_until)) where id = l.id;
            else update public.leviathans set weakspot_until = greatest(coalesce(weakspot_until, now()), now()) + make_interval(secs => v_secs) where id = l.id returning * into l;
              update public.leviathans set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('dv_weakspot', extract(epoch from l.weakspot_until)) where id = l.id;
          end case;
          insert into public.leviathan_hits (lev_id, player_id, move, label, emoji, dmg)
          values (l.id, e.owner_id, 'enchant', coalesce(e.nickname, 'Déjà Vu') || ' · uncorked a ' || coalesce(m -> 'd' ->> 'label', 'weak moment') || ' — everyone, again, for ' || v_secs || ' s!', '🫙', 0);
          r := jsonb_build_object('lev', jsonb_build_object('col', m -> 'd' ->> 'col', 'secs', v_secs, 'label', m -> 'd' ->> 'label'));
        when 'bolt' then
          v_target := nullif(a ->> 'target', '')::uuid;
          if v_target is null or not exists (select 1 from public.enchantments x where x.id = v_target and x.owner_id = e.owner_id and x.status = 'active') then
            raise exception 'bad_target' using errcode = 'P0001';
          end if;
          if not private.ench_spliced(v_target) then raise exception 'not_spliced' using errcode = 'P0001'; end if;
          r := private.storm_mutate(e.owner_id, v_target);
          if r ->> 'what' = 'aberration' then perform private.ench_stat(e.id, 'bottled_ab'); end if;
          r := jsonb_build_object('bolt', r || jsonb_build_object('target', v_target));
        when 'star' then
          v_n := greatest(1, round(private.ench_n('dejavu', 'stars', 3) * v_sx))::int;
          for v_k in 1 .. v_n loop
            v_x := random();
            if v_x < 0.7 then v_ink := v_ink + private.ench_n('dejavu', 'star_ink', 10);
            elsif v_x < 0.95 then v_luck := v_luck + private.ench_n('dejavu', 'star_luck', 3)::int;
            else v_gold := v_gold + 1; end if;
          end loop;
          if v_ink > 0 then v_pay := private.ench_pay(e.id, v_ink, 'a bottled falling star'); end if;
          if v_luck > 0 then perform private.ench_give_luck(e.owner_id, v_luck, 0); end if;
          if v_gold > 0 then perform private.rx_golden(e.owner_id, jsonb_build_object('dejavu', true)); end if;
          r := jsonb_build_object('stars', jsonb_build_object('n', v_n, 'ink', coalesce((v_pay ->> 'paid')::int, 0), 'luck', v_luck, 'golden', v_gold > 0, 'pay', v_pay));
        when 'golden' then
          -- (as many wins as were bottled, fewer as it fades; ★4 Vintage can add one)
          v_n := coalesce((m -> 'd' ->> 'uses')::int, 3);
          v_uses := greatest(1, ceil(v_n * least(v_sx, 1)))::int;
          if e.stars >= 4 then v_uses := least(v_n + 1, greatest(v_uses, ceil(v_n * v_sx)::int)); end if;
          insert into public.enchant_buffs (player_id, kind, mult, uses, data, expires_at)
          values (e.owner_id, 'golden_hour', coalesce((m -> 'd' ->> 'mult')::numeric, 2), v_uses, jsonb_build_object('dejavu', e.id), now() + interval '24 hours');
          perform private.ench_stat(e.id, 'golden_uncorked');
          r := jsonb_build_object('golden', jsonb_build_object('uses', v_uses, 'mult', coalesce((m -> 'd' ->> 'mult')::numeric, 2)));
        else raise exception 'no_moment' using errcode = 'P0001';
      end case;
      -- ★3 Double Take: once a day, half of what was uncorked stays in the jar
      if e.stars >= 3 and coalesce(s ->> 'dt_day', '') <> v_day and not coalesce((m ->> 'dt')::boolean, false) then
        v_dt := true;
        s := jsonb_set(s, array['jar', v_idx::text], (s -> 'jar' -> v_idx) || jsonb_build_object('s0', round(coalesce((s -> 'jar' -> v_idx ->> 's0')::numeric, 1) * 0.5, 3), 'dt', true));
        s := s || jsonb_build_object('dt_day', v_day);
      else
        s := jsonb_set(s, '{jar}', (s -> 'jar') - v_idx);
      end if;
      s := s || jsonb_build_object('last', jsonb_build_object('did', 'uncork', 't', v_t, 'at', v_ep, 'pct', m -> 'pct'));
      perform private.ench_stat(e.id, 'uncorked');
      perform private.ench_stat(e.id, 'uncork_' || v_t);
      perform private.ench_xp(e.id, 2);
      perform private.fairplay(e.owner_id, 'dv_uncork', e.gx, e.gy, jsonb_build_object('enchant', e.id, 't', v_t, 's', v_s, 'result', r));
      perform private.ench_event(e.id, 'uncorked', jsonb_build_object('t', v_t, 'name', m ->> 'name', 'pct', m -> 'pct', 'double', v_dt) || r);
      r := r || jsonb_build_object('t', v_t, 'pct', m -> 'pct', 'double_take', v_dt);

    when 'pour' then
      v_i := (a ->> 'i')::int;
      select (o - 1)::int into v_idx from jsonb_array_elements(s -> 'jar') with ordinality x(j, o) where (j ->> 'i')::int = v_i;
      if v_idx is null then raise exception 'no_moment' using errcode = 'P0001'; end if;
      v_t := s -> 'jar' -> v_idx ->> 't';
      s := jsonb_set(s, '{jar}', (s -> 'jar') - v_idx);
      perform private.ench_event(e.id, 'poured', jsonb_build_object('t', v_t, 'name', private.dv_moment(v_t) ->> 'name'));
      r := jsonb_build_object('poured', v_t);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

/** the strongest Déjà Vu zone a claim here sits in, for this player: their own, or a party-mate's shared one (★5) at half */
create or replace function private.dv_for_claim(p_uid uuid, p_gx int, p_gy int) returns jsonb language plpgsql stable as $$
declare r record; v_best jsonb; v_m numeric; v_ep numeric := extract(epoch from now()); v_score numeric;
begin
  if p_uid is null then return null; end if;
  for r in select e.id, e.owner_id, z from public.enchantments e cross join lateral jsonb_array_elements(coalesce(e.state -> 'zones', '[]'::jsonb)) z
            where e.owner_id = any(array[p_uid] || private.party_mates(p_uid)) and e.kind = 'dejavu' and e.status = 'active'
              and jsonb_array_length(coalesce(e.state -> 'zones', '[]'::jsonb)) > 0 loop
    continue when (r.z ->> 'until')::numeric <= v_ep;
    continue when r.owner_id <> p_uid and not coalesce((r.z ->> 'party')::boolean, false);
    continue when private.ench_cell_m((r.z ->> 'gx')::int, (r.z ->> 'gy')::int, p_gx, p_gy) > (r.z ->> 'r_m')::numeric;
    v_m := (r.z ->> 'um')::numeric;
    if r.owner_id <> p_uid then v_m := 1 + (v_m - 1) / 2; end if;
    v_score := v_m + case when coalesce((r.z ->> 'flare')::boolean, false) then 0.75 else 0 end;
    if v_best is null or v_score > (v_best ->> 'score')::numeric then
      v_best := jsonb_build_object('id', r.id, 'i', r.z -> 'i', 'um', v_m, 'flare', coalesce((r.z ->> 'flare')::boolean, false), 'party', r.owner_id <> p_uid, 'score', v_score);
    end if;
  end loop;
  return v_best;
end $$;

-- the claim: inside a Déjà Vu zone it rolls again (the uncorked Hot Zone's ultras, or the Flare's better of two), and the better is kept
select private.fn_patch('private.rx_claim_roll(uuid,integer,integer,text)', $a$declare v text := p_rarity; v_alt text; v_sun jsonb;$a$,
  $b$declare v text := p_rarity; v_alt text; v_sun jsonb; v_dv jsonb;$b$);
select private.fn_patch('private.rx_claim_roll(uuid,integer,integer,text)',
  $a$  if private.rx_has(p_uid, 'loom') then$a$,
  $b$  -- 🫙 inside a Déjà Vu zone: the moment happens again — a second roll, and the better is kept
  v_dv := private.dv_for_claim(p_uid, p_gx, p_gy);
  if v_dv is not null then
    v_alt := private.rx_roll(p_gx, p_gy, 'dvz' || (v_dv ->> 'id') || (v_dv ->> 'i') || p_uid, (v_dv ->> 'um')::numeric, coalesce((v_dv ->> 'flare')::boolean, false));
    v := private.rx_best(v, v_alt);
    perform private.ench_stat((v_dv ->> 'id')::uuid, 'zone_claims');
    perform private.fairplay(p_uid, 'dv_claim', p_gx, p_gy, v_dv);
  end if;
  if private.rx_has(p_uid, 'loom') then$b$);

-- its zones on the map (yours, and your party's shared ones)
create or replace function private.dv_map(p_uid uuid, p_min_gx int, p_min_gy int, p_max_gx int, p_max_gy int) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'i', z -> 'i', 't', z ->> 't', 'gx', z -> 'gx', 'gy', z -> 'gy', 'r_m', z -> 'r_m', 'um', z -> 'um', 'flare', z -> 'flare',
                                               'until', z -> 'until', 'mine', e.owner_id = p_uid, 'owner_name', pr.username)), '[]'::jsonb)
    from public.enchantments e cross join lateral jsonb_array_elements(coalesce(e.state -> 'zones', '[]'::jsonb)) z
    left join public.profiles pr on pr.id = e.owner_id
   where p_uid is not null and e.owner_id = any(array[p_uid] || private.party_mates(p_uid)) and e.kind = 'dejavu' and e.status = 'active'
     and (z ->> 'until')::numeric > extract(epoch from now()) and (e.owner_id = p_uid or coalesce((z ->> 'party')::boolean, false))
     and (z ->> 'gx')::int between p_min_gx - 200 and p_max_gx + 200 and (z ->> 'gy')::int between p_min_gy - 200 and p_max_gy + 200
$$;
select private.fn_patch('public.enchant_map2(integer,integer,integer,integer)',
  $a$  return jsonb_build_object(
    'suns', v_suns,$a$,
  $b$  return jsonb_build_object(
    'echoes', private.dv_map(v_uid, p_min_gx, p_min_gy, p_max_gx, p_max_gy),
    'suns', v_suns,$b$);

-- ---- weaving it in ----------------------------------------------------------------------------------------------------
select private.fn_patch('public.enchant_act(uuid,text,jsonb)',
  $a$when 'sun' then private.ench_act_sun(e, p_action, a, t) when 'rod' then private.ench_act_rod(e, p_action, a, t)$a$,
  $b$when 'sun' then private.ench_act_sun(e, p_action, a, t) when 'rod' then private.ench_act_rod(e, p_action, a, t)
      when 'dejavu' then private.ench_act_dejavu(e, p_action, a, t)$b$);
select private.fn_patch('private.ench_kind_view(public.enchantments,timestamptz)',
  $a$when 'sun' then private.ench_view_sun(e, t) when 'rod' then private.ench_view_rod(e, t)$a$,
  $b$when 'sun' then private.ench_view_sun(e, t) when 'rod' then private.ench_view_rod(e, t) when 'dejavu' then private.ench_view_dejavu(e, t)$b$);
-- a Mirror Shard can't reflect a jar of moments (a reflection would bottle them twice)
select private.fn_patch('private.ench_act_shard(public.enchantments,text,jsonb,timestamptz)', $a$'oracle', 'rod', 'stormcoil'$a$, $b$'oracle', 'rod', 'dejavu', 'stormcoil'$b$);
-- a jar with moments in it can't be poured into another enchantment (uncork or pour them out first)
select private.fn_patch('public.enchant_merge(uuid,uuid)',
  $a$       or (c.kind = 'stormcoil' and jsonb_typeof(c.state -> 'storm') = 'object' and not coalesce((c.state -> 'storm' ->> 'settled')::boolean, false)) then$a$,
  $b$       or (c.kind = 'stormcoil' and jsonb_typeof(c.state -> 'storm') = 'object' and not coalesce((c.state -> 'storm' ->> 'settled')::boolean, false))
       or (c.kind = 'dejavu' and jsonb_array_length(coalesce(c.state -> 'jar', '[]'::jsonb)) > 0) then$b$);
-- 🪿 a golden egg (the Golden Trait) on a Déjà Vu: every moment in the jar a day fresher
select private.fn_patch('private.ench_refill(public.enchantments,integer)',
  $a$    else null;
  end case;
  if v_what is null then return null; end if;$a$,
  $b$    when 'dejavu' then
      if jsonb_array_length(coalesce(s -> 'jar', '[]'::jsonb)) > 0 then
        s := s || jsonb_build_object('jar', (select jsonb_agg(m || jsonb_build_object('at', least(extract(epoch from now()), coalesce((m ->> 'at')::numeric, 0) + 86400 * p_n)))
                                               from jsonb_array_elements(s -> 'jar') m));
        v_what := 'every moment in the jar a day fresher';
      end if;
    else null;
  end case;
  if v_what is null then return null; end if;$b$);
-- a plot spliced with it: its minigames pay 15% more
select private.fn_patch('private.ench_minigame_mult__raw(uuid,integer,integer)', $a$when 'inscribed' then 1.1 when 'homely' then 1.15 else 1 end;$a$,
  $b$when 'inscribed' then 1.1 when 'preserved' then 1.15 when 'homely' then 1.15 else 1 end;$b$);

-- ---- 🫙 Preserved: the good its partner makes lasts longer, the bad on it passes sooner --------------------------------
create or replace function private.dv_preserve_buff() returns trigger language plpgsql as $$
declare k int := 0; v_eid uuid; v_len interval; v_good boolean; v_bad boolean; v_f numeric;
begin
  begin
    v_good := new.kind in ('plot_giant', 'plot_tiny', 'crease', 'glow', 'ward', 'glyph_leaf', 'paper_shield', 'grand_show', 'next_reward', 'fate_tower', 'glyph_bolt', 'static')
              and not coalesce((new.data ->> 'prank')::boolean, false) and not new.data ? 'preserved';
    v_bad := (new.kind like 'curse\_%' or new.kind = 'scorch') and not new.data ? 'preserved';
    if not (v_good or v_bad) then return new; end if;
    if new.enchant_id is not null then v_eid := new.enchant_id; k := private.ench_has_gene(new.enchant_id, 'preserved'); end if;
    -- a scorch on a plot: the enchantment living there may wear it
    if coalesce(k, 0) = 0 and new.kind = 'scorch' and new.gx is not null then
      select x.id into v_eid from public.enchantments x where x.gx = new.gx and x.gy = new.gy and x.status = 'active';
      if v_eid is not null then k := private.ench_has_gene(v_eid, 'preserved'); end if;
    end if;
    if coalesce(k, 0) <= 0 then return new; end if;
    v_len := new.expires_at - coalesce(new.created_at, now());
    if v_len <= interval '0' then return new; end if;
    v_f := 1 + private.ench_n('dejavu', 'preserve_k', 0.5) * least(k, 3);
    new.expires_at := coalesce(new.created_at, now()) + case when v_good then v_len * v_f else v_len / v_f end;
    new.data := new.data || jsonb_build_object('preserved', least(k, 3));
    perform private.ench_stat(v_eid, case when v_good then 'preserved_good' else 'preserved_bad' end);
  exception when others then
    return new; -- (never stop the buff itself)
  end;
  return new;
end $$;
drop trigger if exists enchant_buffs_preserve on public.enchant_buffs;
create trigger enchant_buffs_preserve before insert on public.enchant_buffs for each row execute function private.dv_preserve_buff();

create or replace function private.dv_preserve_trample() returns trigger language plpgsql as $$
declare v_eid uuid; k int := 0;
begin
  begin
    select x.id into v_eid from public.enchantments x where x.gx = new.gx and x.gy = new.gy and x.status = 'active';
    if v_eid is null then return new; end if;
    k := private.ench_has_gene(v_eid, 'preserved');
    if coalesce(k, 0) <= 0 or new.until <= coalesce(new.at, now()) then return new; end if;
    new.until := coalesce(new.at, now()) + (new.until - coalesce(new.at, now())) / (1 + private.ench_n('dejavu', 'preserve_k', 0.5) * least(k, 3));
    perform private.ench_stat(v_eid, 'preserved_bad');
  exception when others then
    return new;
  end;
  return new;
end $$;
drop trigger if exists leviathan_trampled_preserve on public.leviathan_trampled;
create trigger leviathan_trampled_preserve before insert on public.leviathan_trampled for each row execute function private.dv_preserve_trample();

-- the Trait on its page: how much longer, and what it has done
select private.fn_patch('private.trait_view(public.enchantments)',
  $a$  k := private.ench_has_gene(e.id, 'radiant');$a$,
  $b$  k := private.ench_has_gene(e.id, 'preserved');
  if k > 0 then o := o || jsonb_build_object('preserved', jsonb_build_object('k', k, 'x', 1 + private.ench_n('dejavu', 'preserve_k', 0.5) * least(k, 3),
      'good', coalesce((e.stats ->> 'preserved_good')::int, 0), 'bad', coalesce((e.stats ->> 'preserved_bad')::int, 0))); end if;
  k := private.ench_has_gene(e.id, 'radiant');$b$);

-- ---- the Leviathan: Déjà Vu — the last 10 seconds of everyone's hits land again --------------------------------------
select private.fn_patch('private.lev_move(text)', $a$"rod": ["Divine", 0.6, 0.9, "divine"]}$a$,
  $b$"rod": ["Divine", 0.6, 0.9, "divine"], "dejavu": ["Déjà Vu", 0.3, 0.5, "dejavu"]}$b$);
select private.fn_patch('public.leviathan_hit(text,integer,uuid)', $a$  v_miss numeric := private.lev_n('tiny_miss', 0.5);$a$,
  $b$  v_miss numeric := private.lev_n('tiny_miss', 0.5); v_rep bigint := 0;$b$);
select private.fn_patch('public.leviathan_hit(text,integer,uuid)', $a$      when 'shrink' then$a$,
  $b$      -- 🫙 Déjà Vu: every hit of the last 10 seconds lands again (never another Déjà Vu's), up to 4× its own move
      when 'dejavu' then
        select coalesce(sum(h.dmg), 0) into v_rep from public.leviathan_hits h
         where h.lev_id = l.id and h.created_at > now() - make_interval(secs => private.ench_n('dejavu', 'lev_window_s', 10)) and h.emoji <> '🫙';
        v_rep := least(v_rep, round((2500 + 400 * e.level) * private.ench_n('dejavu', 'lev_cap_x', 4))::bigint);
        v_dmg := v_dmg + v_rep;
        perform private.ench_stat(e.id, 'replayed', v_rep);
      when 'shrink' then$b$);
select private.fn_patch('public.leviathan_hit(text,integer,uuid)', $a$when 'divine' then ' — everyone hits +20% for 20 s'$a$,
  $b$when 'divine' then ' — everyone hits +20% for 20 s' when 'dejavu' then ' — the last 10 s of hits landed again (+' || v_rep || ')'$b$);

-- ---- titles, stars, badges --------------------------------------------------------------------------------------------
select private.fn_patch('private.ench_titles(public.enchantments)',
  $a$    case when e.kind = 'rod' and coalesce((e.stats ->> 'dowsed')::int, 0) >= 10 then 'Lodefinder' end,$a$,
  $b$    case when e.kind = 'rod' and coalesce((e.stats ->> 'dowsed')::int, 0) >= 10 then 'Lodefinder' end,
    case when e.kind = 'dejavu' and coalesce((e.stats ->> 'scooped')::int, 0) >= 10 then 'Moment-Catcher' end,
    case when e.kind = 'dejavu' and coalesce((e.stats ->> 'uncorked')::int, 0) >= 10 then 'Twice-Lived' end,
    case when e.kind = 'dejavu' and coalesce((e.stats ->> 'uncork_bolt')::int, 0) >= 5 then 'Bottled Lightning' end,$b$);
select private.fn_patch('private.ench_star_powers(text)',
  $a$    when 'rod' then '[$a$,
  $b$    when 'dejavu' then '[{"name": "Wide Neck", "emoji": "🫙", "text": "The jar holds 4 moments, not 3."},
                         {"name": "Good Cork", "emoji": "🍾", "text": "Moments fade over 14 days, not 7."},
                         {"name": "Double Take", "emoji": "🔁", "text": "Once a day, an uncorked moment leaves half of itself in the jar."},
                         {"name": "Vintage", "emoji": "🍷", "text": "Every moment comes out of the jar 50% stronger."},
                         {"name": "Eternal Moment", "emoji": "♾️", "text": "Moments never fade — and the zones you uncork are shared with your party."}]'
    when 'rod' then '[$b$);

insert into public.achievements (key, name, description, icon, category, metric, threshold, reward, sort, is_secret) values
  ('dv_first', 'Déjà Vu', 'Catch a moment in a Déjà Vu jar.', '🫙', 'enchant', 'ench.dejavu.scooped', 1, '{"luck": 5}', 838, false),
  ('dv_twice', 'Twice Upon a Time', 'Uncork 10 moments.', '🔁', 'enchant', 'ench.dejavu.uncorked', 10, '{"luck": 12}', 839, false),
  ('dv_kinds', 'Collector of Moments', 'Catch every kind of moment: a Hot Zone, a Solar Flare, a weak moment, a bolt, a falling star and a Golden Hour.', '🗃️', 'enchant', 'ench.dejavu.moment_kinds', 6, '{"luck": 20, "enchanted_luck": 1}', 840, false),
  ('dv_saved', 'Saved for Later', 'Bottle a Golden Hour and uncork it.', '✨', 'enchant', 'ench.dejavu.golden_uncorked', 1, '{"luck": 8}', 841, false),
  ('dv_again', 'All Over Again', 'Land 25,000 damage on the Leviathan with Déjà Vu replays.', '🐉', 'enchant', 'ench.dejavu.replayed', 25000, '{"luck": 15}', 842, false),
  ('dv_lightning', 'Lightning in a Bottle', 'Uncork a bottled bolt that mutates a hybrid into an Aberration.', '⚡', 'enchant', 'ench.dejavu.bottled_ab', 1, '{"luck": 25, "enchanted_luck": 1}', 843, true)
on conflict (key) do nothing;

revoke all on function private.ench_act_dejavu(public.enchantments, text, jsonb, timestamptz) from public;
revoke all on function private.ench_view_dejavu(public.enchantments, timestamptz) from public;
revoke all on function private.dv_live(public.enchantments) from public;
revoke all on function private.dv_for_claim(uuid, int, int) from public;
