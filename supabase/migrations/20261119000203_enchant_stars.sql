-- Enchantments, part 5: ⭐ Stars. Pour a copy of an enchantment into another of the same kind and it earns a star.
--
--  ★1 takes 1 copy, ★2 one more, ★3 two more (4 copies in all). Every star adds +10% to all the Ink it pays, and
--  each kind gets a new power at each star (45 in all, listed in private.ench_star_powers below). Levels 1–10 stay as
--  they are: the copy's XP pours in too. The copy's plot stays yours and takes its own roll (the rarity that plot would
--  have had without the enchantment).
--
--  Essence: an enchantment of another kind can be poured in as Essence. Three Essence pour in as one copy, so a star
--  never depends on finding the same kind again (15 kinds at 2% each: a given kind turns up about once in 750 rolls).
--  Essence the enchantment can't take (it already has ★3) is kept for the next one.
--
--  A copy that's busy can't be poured: spliced, coiling, mid-storm or walking the map.

-- ---- the columns, and Essence ------------------------------------------------------------------------------------------
alter table public.enchantments add column if not exists stars int not null default 0;
alter table public.enchantments add column if not exists star_fill int not null default 0;
alter table public.enchantments drop constraint if exists enchantments_stars_check;
alter table public.enchantments add constraint enchantments_stars_check check (stars between 0 and 3 and star_fill >= 0);

create table if not exists public.enchant_essence (
  player_id uuid primary key references public.players(id) on delete cascade,
  essence int not null default 0 check (essence >= 0),
  updated_at timestamptz not null default now());
alter table public.enchant_essence enable row level security;

/** copies a star takes: ★1 one, ★2 one more, ★3 two more */
create or replace function private.ench_star_need(p_star int) returns int language sql immutable as $$
  select case p_star when 1 then 1 when 2 then 1 when 3 then 2 end
$$;

/** each kind's three star powers (what the client shows; the code that does them is patched in below) */
create or replace function private.ench_star_powers(p_kind text) returns jsonb language sql immutable as $$
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
    when 'cuckoo' then '[{"name": "Wide Wings", "emoji": "🪽", "text": "Scouts twice as far and finds 5 nests."},
                         {"name": "Quick Hatch", "emoji": "🥚", "text": "Eggs hatch in 6 hours, not 10."},
                         {"name": "Changeling", "emoji": "🎭", "text": "A thrown-out egg rolls on into another nest, and feathers fall 3× as often."}]'
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
    else '[]' end::jsonb
$$;

/** what an enchantment's page shows about its stars */
create or replace function private.ench_star_view(e public.enchantments) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'star_need', case when e.stars < 3 then private.ench_star_need(e.stars + 1) end,
    'star_ink', 10 * e.stars,
    'powers', coalesce((select jsonb_agg(p || jsonb_build_object('star', i, 'on', e.stars >= i) order by i)
                          from jsonb_array_elements(private.ench_star_powers(e.kind)) with ordinality q(p, i)), '[]'::jsonb),
    'essence', coalesce((select x.essence from public.enchant_essence x where x.player_id = e.owner_id), 0),
    'copies', (select count(*)::int from public.enchantments x where x.owner_id = e.owner_id and x.kind = e.kind and x.id <> e.id and x.status = 'active'))
$$;

/** a Quad's name: three adjectives and a noun (the four kinds in a fixed order) */
create or replace function private.ench_quad_name(p_a text, p_b text, p_c text, p_d text) returns text language sql immutable as $$
  select 'The ' || private.ench_word(k[1], 'adj') || ' ' || private.ench_word(k[2], 'adj') || ' ' || private.ench_word(k[3], 'adj') || ' ' || private.ench_word(k[4], 'noun')
  from (select array_agg(x order by x) k from unnest(array[p_a, p_b, p_c, p_d]) x) s
$$;

-- ---- the merge ---------------------------------------------------------------------------------------------------------
/** pour p_copy into p_target: the same kind fills its next star; another kind becomes Essence (3 Essence = 1 copy).
    With no copy, it pours 3 banked Essence. */
create or replace function public.enchant_merge(p_target uuid, p_copy uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); e public.enchantments; c public.enchantments; v_same boolean := false; v_fill int; v_stars int;
  v_ess int := 0; v_from_ess boolean := false; v_up boolean := false; v_rar text; v_power jsonb; v_copy jsonb;
begin
  perform private.rate_limit('enchant_merge', 120, 3600);
  if p_copy is not null and p_copy = p_target then raise exception 'bad_target' using errcode = 'P0001'; end if;
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
end $$;

do $$
begin
  execute 'revoke all on function public.enchant_merge(uuid, uuid) from public, anon';
  execute 'grant execute on function public.enchant_merge(uuid, uuid) to authenticated';
end $$;

-- ---- patching: every change below must find its place (or the migration stops) ----------------------------------------
create or replace function private._star_patch(p_fn text, p_from text, p_to text, p_n int default 1) returns void language plpgsql as $$
declare d text; v_n int;
begin
  d := pg_get_functiondef(p_fn::regprocedure);
  v_n := (length(d) - length(replace(d, p_from, ''))) / greatest(length(p_from), 1);
  if v_n <> p_n then raise exception 'stars: % — expected % of [%], found %', p_fn, p_n, left(p_from, 90), v_n; end if;
  execute replace(d, p_from, p_to);
end $$;

-- the stars, everywhere an enchantment shows: its brief, its page, the map, its titles — and +10% Ink a star
select private._star_patch('private.ench_brief(uuid)', $a$'level', e.level,$a$, $b$'level', e.level, 'stars', e.stars, 'star_fill', e.star_fill,$b$);
select private._star_patch('private.ench_view(uuid)', $a$'server_time', now());$a$, $b$'server_time', now()) || private.ench_star_view(e);$b$);
select private._star_patch('public.enchant_map(integer,integer,integer,integer)', $a$'level', e.level$a$, $b$'level', e.level, 'stars', e.stars$b$);
select private._star_patch('private.ench_titles(public.enchantments)',
  $a$case when e.level >= 5 then 'Awakened' end, case when e.level >= 10 then 'Ascended' end,$a$,
  $b$case when e.level >= 5 then 'Awakened' end, case when e.level >= 10 then 'Ascended' end,
    case when e.stars >= 1 then 'Starlit' end, case when e.stars >= 2 then 'Starforged' end, case when e.stars >= 3 then 'Supernova' end,$b$);
select private._star_patch('private.ench_pay(uuid,numeric,text)',
  $a$  for p in select * from jsonb_array_elements(private.ench_partners(p_id)) loop$a$,
  $b$  if coalesce(e.stars, 0) > 0 then
    v := v * (1 + 0.1 * e.stars);
    v_mods := v_mods || jsonb_build_object('label', repeat('★', e.stars) || ' +' || (10 * e.stars) || '%', 'emoji', '🌟');
  end if;
  for p in select * from jsonb_array_elements(private.ench_partners(p_id)) loop$b$);

-- 🪿 Golden Goose: Gilded Nest · Fox Hunter · Gosling
select private._star_patch('private.goose_eval(public.enchantments,timestamp with time zone)',
  $a$private.ench_hash(e.sigil, v_eggs, 999) < private.ench_n('goose', 'platinum', 0.03));$a$,
  $b$private.ench_hash(e.sigil, v_eggs, 999) < private.ench_n('goose', 'platinum', 0.03) * case when e.stars >= 1 then 2 else 1 end);$b$);
select private._star_patch('private.goose_eval(public.enchantments,timestamp with time zone)',
  $a$'eggs', v_eggs,$a$, $b$'eggs', v_eggs, 'gosling_in', case when e.stars >= 3 then 5 - mod(v_eggs, 5) end,$b$);
select private._star_patch('private.ench_act_oracle(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$private.ench_hash(tg.sigil, v_eggs + i, 999) < private.ench_n('goose', 'platinum', 0.03));$a$,
  $b$private.ench_hash(tg.sigil, v_eggs + i, 999) < private.ench_n('goose', 'platinum', 0.03) * case when tg.stars >= 1 then 2 else 1 end);$b$);
select private._star_patch('private.ench_act_goose(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_streak int; v_clean boolean;$a$, $b$v_streak int; v_clean boolean; v_gos uuid;$b$);
select private._star_patch('private.ench_act_goose(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_pay := private.ench_pay(e.id, 3, 'fox chased');$a$,
  $b$v_pay := private.ench_pay(e.id, case when e.stars >= 2 then 15 else 3 end, 'fox chased');
      if e.stars >= 2 then perform private.ench_give_luck(e.owner_id, 3, 0); end if;$b$);
select private._star_patch('private.ench_act_goose(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$r := jsonb_build_object('chased', true, 'pay', v_pay);$a$, $b$r := jsonb_build_object('chased', true, 'pay', v_pay, 'luck', case when e.stars >= 2 then 3 end);$b$);
select private._star_patch('private.ench_act_goose(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$perform private.ench_stat(e.id, 'eggs');$a$,
  $b$perform private.ench_stat(e.id, 'eggs');
      if e.stars >= 3 and mod(coalesce((s ->> 'eggs')::int, 0) + 1, 5) = 0 then v_gos := private.ench_ticket(e.owner_id, 'rare', 'gosling'); end if;$b$);
select private._star_patch('private.ench_act_goose(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$r := jsonb_build_object('egg', g, 'pay', v_pay, 'streak', v_streak);$a$, $b$r := jsonb_build_object('egg', g, 'pay', v_pay, 'streak', v_streak, 'gosling', v_gos is not null);$b$);

-- 🧞 Genie: Fourth Wish · Gift of Wishes · Master's Boon
select private._star_patch('private.genie_eval(public.enchantments,timestamp with time zone)', $a$v_max int := 3;$a$, $b$v_max int := 3 + case when e.stars >= 1 then 1 else 0 end;$b$);
select private._star_patch('private.genie_eval(public.enchantments,timestamp with time zone)',
  $a$'made', coalesce((s ->> 'made')::int, 0),$a$,
  $b$'gift_used', coalesce(s ->> 'gift_on' = to_char(now() at time zone 'UTC', 'YYYY-MM-DD'), false),
    'boon_in', case when e.stars >= 3 then greatest(0, round(coalesce((s ->> 'boon_at')::numeric, 0) + 7 * 86400 - extract(epoch from now()))) end,
    'made', coalesce((s ->> 'made')::int, 0),$b$);
select private._star_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$if v_w >= 3 or (s ->> 'charge_at') is null then$a$, $b$if v_w >= (g ->> 'max')::int or (s ->> 'charge_at') is null then$b$);
select private._star_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_kept boolean := false; v_lk jsonb; v_out text;$a$, $b$v_kept boolean := false; v_lk jsonb; v_out text; v_to uuid; v_tk uuid; v_name text;$b$);
select private._star_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$    when 'forbidden' then$a$,
  $b$    when 'gift' then
      -- ★2: a wish for a friend
      if e.stars < 2 then raise exception 'stars_locked' using errcode = 'P0001', detail = '2'; end if;
      if v_w < 1 then raise exception 'no_wishes' using errcode = 'P0001'; end if;
      if s ->> 'gift_on' = to_char(now() at time zone 'UTC', 'YYYY-MM-DD') then raise exception 'too_soon' using errcode = 'P0001'; end if;
      select pr.id, pr.username into v_to, v_name from public.profiles pr join public.players pl on pl.id = pr.id
       where lower(pr.username) = lower(trim(leading '@' from coalesce(a ->> 'username', ''))) and pl.status = 'active';
      if v_to is null or v_to = e.owner_id then raise exception 'player_not_found' using errcode = 'P0001'; end if;
      if private.friend_state(e.owner_id, v_to) is distinct from 'friends' then raise exception 'not_friends' using errcode = 'P0001', detail = 'wish'; end if;
      perform private.grant_ink_paced(v_to, 30, 'enchantment', 'wish_gift', e.id::text, null);
      perform private.notify(v_to, 'enchant', e.owner_id, jsonb_build_object('sub', 'wish_gift', 'kind', 'genie', 'ink', 30));
      v_pay := private.ench_pay(e.id, 10, 'a wish given away');
      s := s || jsonb_build_object('wishes', v_w - 1, 'gift_on', to_char(now() at time zone 'UTC', 'YYYY-MM-DD'), 'made', coalesce((s ->> 'made')::int, 0) + 1, 'last', 'gift');
      perform private.ench_stat(e.id, 'gifts');
      perform private.ench_xp(e.id, 1);
      perform private.ench_event(e.id, 'gift', jsonb_build_object('to', v_name));
      r := jsonb_build_object('gift', true, 'to', v_name, 'ink', 30, 'pay', v_pay);
    when 'boon' then
      -- ★3: once a week (real days: a Clockwork can't hurry it)
      if e.stars < 3 then raise exception 'stars_locked' using errcode = 'P0001', detail = '3'; end if;
      if coalesce((s ->> 'boon_at')::numeric, 0) + 7 * 86400 > extract(epoch from now()) then raise exception 'too_soon' using errcode = 'P0001'; end if;
      v_tk := private.ench_ticket(e.owner_id, 'epic', 'genie_boon');
      s := s || jsonb_build_object('boon_at', extract(epoch from now()), 'last', 'boon');
      perform private.ench_stat(e.id, 'boons');
      perform private.ench_xp(e.id, 2);
      perform private.ench_event(e.id, 'boon', '{}'::jsonb);
      r := jsonb_build_object('boon', true, 'ticket', 'epic');
    when 'forbidden' then$b$);

-- 🗺️ Treasure Map: Long Arm · Quick Ink · Mother Lode
select private._star_patch('private.ench_act_map(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_reach numeric := private.ench_n('map', 'reach_m', 150); v_dig numeric := private.ench_n('map', 'dig_m', 90);$a$,
  $b$v_reach numeric := case when e.stars >= 1 then 400 else private.ench_n('map', 'reach_m', 150) end;
  v_dig numeric := case when e.stars >= 1 then 250 else private.ench_n('map', 'dig_m', 90) end;$b$);
select private._star_patch('private.ench_act_map(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$'next_at', v_now + private.ench_n('map', 'cooldown_h', 10) * 3600,$a$,
  $b$'next_at', v_now + private.ench_n('map', 'cooldown_h', 10) * 3600 * case when e.stars >= 2 then 0.5 else 1 end,$b$);
select private._star_patch('private.ench_act_map(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$if random() < private.ench_n('map', 'epic_ticket', 0.18) then$a$, $b$if e.stars >= 3 or random() < private.ench_n('map', 'epic_ticket', 0.18) then$b$);
select private._star_patch('private.ench_act_map(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$if random() < private.ench_n('map', 'legendary_ticket', 0.05) then$a$,
  $b$if random() < private.ench_n('map', 'legendary_ticket', 0.05) * (case when e.stars >= 3 then 3 else 1 end) then$b$);
select private._star_patch('private.ench_view_map(public.enchantments,timestamp with time zone)',
  $a$v_reach numeric := private.ench_n('map', 'reach_m', 150);$a$, $b$v_reach numeric := case when e.stars >= 1 then 400 else private.ench_n('map', 'reach_m', 150) end;$b$);
select private._star_patch('private.ench_view_map(public.enchantments,timestamp with time zone)',
  $a$private.ench_n('map', 'dig_m', 90)$a$, $b$(case when e.stars >= 1 then 250 else private.ench_n('map', 'dig_m', 90) end)$b$, 2);

-- 🪱 Parasite: Quick Jaws · Fast Evolver · Queen
select private._star_patch('private.ench_act_parasite(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_feed numeric := private.ench_n('parasite', 'feed_h', 20) * 3600;$a$,
  $b$v_feed numeric := private.ench_n('parasite', 'feed_h', 20) * 3600 * case when e.stars >= 1 then 0.7 else 1 end;$b$);
select private._star_patch('private.ench_view_parasite(public.enchantments,timestamp with time zone)',
  $a$v_feed numeric := private.ench_n('parasite', 'feed_h', 20) * 3600;$a$,
  $b$v_feed numeric := private.ench_n('parasite', 'feed_h', 20) * 3600 * case when e.stars >= 1 then 0.7 else 1 end;$b$);
select private._star_patch('private.ench_act_parasite(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_new := case when v_feeds >= 10 then 2 when v_feeds >= 3 then 1 else 0 end;$a$,
  $b$v_new := greatest(v_stage, case when v_feeds >= case when e.stars >= 2 then 6 else 10 end then 2 when v_feeds >= case when e.stars >= 2 then 2 else 3 end then 1 else 0 end);$b$);
select private._star_patch('private.ench_view_parasite(public.enchantments,timestamp with time zone)',
  $a$'next_stage_at', case when v_f < 3 then 3 when v_f < 10 then 10 end,$a$,
  $b$'next_stage_at', case when e.stars >= 2 then case when v_f < 2 then 2 when v_f < 6 then 6 end else case when v_f < 3 then 3 when v_f < 10 then 10 end end,$b$);
select private._star_patch('private.ench_act_parasite(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$(array[25, 45, 60])[v_stage + 1], 'fed on @'$a$, $b$(array[25, 45, 60])[v_stage + 1] * case when e.stars >= 3 then 1.5 else 1 end, 'fed on @'$b$);

-- 🐦 Cuckoo: Wide Wings · Quick Hatch · Changeling
select private._star_patch('private.ench_act_cuckoo(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$private.ench_hosts(e.owner_id, e.gx, e.gy, 3, private.ench_n('cuckoo', 'radius', 1500)::int)$a$,
  $b$private.ench_hosts(e.owner_id, e.gx, e.gy, case when e.stars >= 1 then 5 else 3 end, (private.ench_n('cuckoo', 'radius', 1500) * case when e.stars >= 1 then 2 else 1 end)::int)$b$);
select private._star_patch('private.ench_act_cuckoo(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_hatch numeric := private.ench_n('cuckoo', 'hatch_h', 10) * 3600;$a$,
  $b$v_hatch numeric := private.ench_n('cuckoo', 'hatch_h', 10) * 3600 * case when e.stars >= 2 then 0.6 else 1 end;$b$);
select private._star_patch('private.ench_act_cuckoo(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$if random() < 0.1 then v_lk := private.ench_give_luck(e.owner_id, 20, 0); end if;$a$,
  $b$if random() < (case when e.stars >= 3 then 0.3 else 0.1 end) then v_lk := private.ench_give_luck(e.owner_id, 20, 0); end if;$b$);
select private._star_patch('public.enchant_visitor_act(uuid,text)',
  $a$if private.ench_dodge(e.id) then$a$, $b$if private.ench_dodge(e.id) or (e.kind = 'cuckoo' and e.stars >= 3) then$b$);

-- 🏺 Pandora's Box: Lighter Lid · Gilded Gifts · Greater Hope
select private._star_patch('private.ench_act_pandora(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$if jsonb_array_length(v_evils) >= 7 then$a$, $b$if jsonb_array_length(v_evils) >= (case when e.stars >= 1 then 6 else 7 end) then$b$);
select private._star_patch('private.ench_act_pandora(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_pay := private.ench_pay(e.id, (sl ->> 'g')::numeric, 'a gift from the box');$a$,
  $b$v_pay := private.ench_pay(e.id, (sl ->> 'g')::numeric * case when e.stars >= 2 then 2 else 1 end, 'a gift from the box');$b$);
select private._star_patch('private.ench_act_pandora(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_pay := private.ench_pay(e.id, 400 * (1 + 0.25 * v_cycle), 'Hope');$a$,
  $b$v_pay := private.ench_pay(e.id, 400 * (1 + 0.25 * v_cycle) * case when e.stars >= 3 then 2 else 1 end, 'Hope');$b$);
select private._star_patch('private.ench_act_pandora(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_tk := private.ench_ticket(e.owner_id, 'legendary', 'pandora');$a$,
  $b$v_tk := private.ench_ticket(e.owner_id, case when e.stars >= 3 then 'mythic' else 'legendary' end, 'pandora');$b$);
select private._star_patch('private.ench_act_pandora(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$'type', 'hope', 'pay', v_pay, 'ticket', 'legendary')$a$, $b$'type', 'hope', 'pay', v_pay, 'ticket', case when e.stars >= 3 then 'mythic' else 'legendary' end)$b$);
select private._star_patch('private.ench_view_pandora(public.enchantments,timestamp with time zone)',
  $a$'opens', coalesce((s ->> 'opens')::int, 0), 'last', s -> 'last', 'foreseen', v_fore,$a$,
  $b$'opens', coalesce((s ->> 'opens')::int, 0), 'last', s -> 'last', 'foreseen', v_fore, 'hope_at', case when e.stars >= 1 then 6 else 7 end,$b$);

-- ⏰ Clockwork: Mainspring · Fine Gears · Toll of Hours
select private._star_patch('private.clock_eval(public.enchantments,timestamp with time zone)',
  $a$v_cap numeric := private.ench_n('clockwork', 'cap_min', 240);$a$, $b$v_cap numeric := private.ench_n('clockwork', 'cap_min', 240) + case when e.stars >= 1 then 120 else 0 end;$b$);
select private._star_patch('private.clock_eval(public.enchantments,timestamp with time zone)',
  $a$v_turns int := private.ench_n('clockwork', 'turns', 15)::int;$a$, $b$v_turns int := private.ench_n('clockwork', 'turns', 15)::int + case when e.stars >= 1 then 5 else 0 end;$b$);
select private._star_patch('private.clock_eval(public.enchantments,timestamp with time zone)',
  $a$'freeze_cost', private.ench_n('clockwork', 'freeze_min_h', 20));$a$,
  $b$'freeze_cost', private.ench_n('clockwork', 'freeze_min_h', 20) * case when e.stars >= 2 then 0.5 else 1 end,
    'skip_x', case when e.stars >= 2 then 1.5 else 1 end, 'toll', e.stars >= 3, 'toll_used', coalesce(s ->> 'toll_on' = v_day, false));$b$);
select private._star_patch('private.ench_act_clockwork(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$update public.enchantments set clock_skip = clock_skip + v_m * 60 where id = x.id;$a$,
  $b$update public.enchantments set clock_skip = clock_skip + v_m * 60 * case when e.stars >= 2 then 1.5 else 1 end where id = x.id;$b$);
select private._star_patch('private.ench_act_clockwork(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$r := jsonb_build_object('forwarded', round(v_m), 'target', x.id);$a$,
  $b$r := jsonb_build_object('forwarded', round(v_m), 'skipped', round(v_m * case when e.stars >= 2 then 1.5 else 1 end), 'target', x.id);$b$);
select private._star_patch('private.ench_act_clockwork(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$    when 'unfreeze' then$a$,
  $b$    when 'toll' then
      -- ★3: the clock strikes, and every other enchantment you own jumps half an hour ahead (once a day)
      if e.stars < 3 then raise exception 'stars_locked' using errcode = 'P0001', detail = '3'; end if;
      if s ->> 'toll_on' = v_day then raise exception 'too_soon' using errcode = 'P0001'; end if;
      v_n := 0;
      for x in select * from public.enchantments where owner_id = e.owner_id and status = 'active' and id <> e.id
                 and not (frozen_at is not null and now() < frozen_until) order by id for update loop
        perform private.ench_settle(x.id);
        update public.enchantments set clock_skip = clock_skip + 1800 where id = x.id;
        perform private.ench_event(x.id, 'forwarded', jsonb_build_object('minutes', 30, 'toll', true));
        v_n := v_n + 1;
      end loop;
      s := s || jsonb_build_object('toll_on', v_day);
      perform private.ench_stat(e.id, 'tolls');
      perform private.ench_xp(e.id, 2);
      perform private.ench_event(e.id, 'toll', jsonb_build_object('n', v_n));
      r := jsonb_build_object('tolled', v_n, 'minutes', 30);
    when 'unfreeze' then$b$);

-- 📡 Size Ray: Fourth Cell · Long Burn · Titan Beam
select private._star_patch('private.ray_eval(public.enchantments,timestamp with time zone)',
  $a$v_at numeric := coalesce((s ->> 'shot_at')::numeric, v_now);$a$, $b$v_at numeric := coalesce((s ->> 'shot_at')::numeric, v_now); v_max int := 3 + case when e.stars >= 1 then 1 else 0 end;$b$);
select private._star_patch('private.ray_eval(public.enchantments,timestamp with time zone)',
  $a$if v_c < 3 then v_c := least(3,$a$, $b$if v_c < v_max then v_c := least(v_max,$b$);
select private._star_patch('private.ray_eval(public.enchantments,timestamp with time zone)',
  $a$'max', 3, 'next_in', case when v_c < 3 then$a$, $b$'max', v_max, 'next_in', case when v_c < v_max then$b$);
select private._star_patch('private.ench_act_sizeray(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$if v_c >= 3 then s := s || jsonb_build_object('shot_at', v_now); end if;$a$, $b$if v_c >= (g ->> 'max')::int then s := s || jsonb_build_object('shot_at', v_now); end if;$b$, 2);
select private._star_patch('private.ench_act_sizeray(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$else v_hrs := case v_grade when 'PERFECT' then 12 when 'GREAT' then 8 when 'GOOD' then 6 else 2 end; end if;$a$,
  $b$else v_hrs := case v_grade when 'PERFECT' then 12 when 'GREAT' then 8 when 'GOOD' then 6 else 2 end * case when e.stars >= 2 then 2 else 1 end; end if;$b$);
select private._star_patch('private.ench_act_sizeray(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_m := case when v_prank then 1 when v_back then 1.2 else round(1.5 + 0.5 * v_acc, 2) end;$a$,
  $b$v_m := case when v_prank then 1 when v_back then 1.2 when e.stars >= 3 and v_grade in ('PERFECT', 'GREAT') then 3 else round(1.5 + 0.5 * v_acc, 2) end;$b$);

-- 🪞 Mirror Shard: Long Gaze · Quicksilver · Perfect Mirror
select private._star_patch('private.ench_act_shard(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$'until', v_now + private.ench_n('shard', 'hours', 24) * 3600$a$, $b$'until', v_now + private.ench_n('shard', 'hours', 24) * 3600 * case when e.stars >= 1 then 1.5 else 1 end$b$);
select private._star_patch('private.ench_act_shard(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$private.ench_n('shard', 'cooldown_h', 20) * 3600 > v_now$a$, $b$private.ench_n('shard', 'cooldown_h', 20) * 3600 * (case when e.stars >= 2 then 0.6 else 1 end) > v_now$b$);
select private._star_patch('private.ench_kind_view(public.enchantments,timestamp with time zone)',
  $a$private.ench_n('shard', 'cooldown_h', 20) * 3600$a$, $b$private.ench_n('shard', 'cooldown_h', 20) * 3600 * case when e.stars >= 2 then 0.6 else 1 end$b$, 2);
select private._star_patch('private.ench_reflected(public.enchantments,timestamp with time zone)',
  $a$  x.state := coalesce(e.state -> 'r', '{}'::jsonb);$a$,
  $b$  x.state := coalesce(e.state -> 'r', '{}'::jsonb);
  -- (a reflection has the kind's powers only through a ★3 Shard's Perfect Mirror: ★1)
  x.stars := case when e.stars >= 3 then 1 else 0 end; x.star_fill := 0;$b$);

-- 🌀 Wormhole: Quick Spiral · Steady Throat · Third Mouth
select private._star_patch('private.ench_act_wormhole(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$'next_open_at', v_real + private.ench_n('wormhole', 'recharge_h', 24) * 3600,$a$,
  $b$'next_open_at', v_real + private.ench_n('wormhole', 'recharge_h', 24) * 3600 * case when e.stars >= 1 then 2.0 / 3 else 1 end,$b$);
select private._star_patch('private.ench_act_wormhole(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_hrs := round(6 + 12 * v_score, 1);$a$, $b$v_hrs := round(6 + 12 * v_score + case when e.stars >= 2 then 6 else 0 end, 1);$b$);
select private._star_patch('private.ench_act_wormhole(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$if e.level < 10 then raise exception 'oracle_locked'$a$, $b$if e.level < 10 and e.stars < 3 then raise exception 'oracle_locked'$b$);
select private._star_patch('private.ench_act_wormhole(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_pay := private.ench_pay(e.id, 20 + round(private.ench_hash(e.sigil, v_k, 77) * 40), 'a chest out of the wormhole');$a$,
  $b$v_pay := private.ench_pay(e.id, (20 + round(private.ench_hash(e.sigil, v_k, 77) * 40)) * case when e.stars >= 3 then 2 else 1 end, 'a chest out of the wormhole');$b$);
select private._star_patch('private.ench_view_wormhole(public.enchantments,timestamp with time zone)',
  $a$'three', e.level >= 10,$a$, $b$'three', e.level >= 10 or e.stars >= 3,$b$);

-- 👁️ Oracle: Longer Sight · Fate-Bender · Third Eye
select private._star_patch('private.oracle_eval(public.enchantments,timestamp with time zone)',
  $a$v_max int := case when e.level >= 10 then 2 else 1 end;$a$, $b$v_max int := case when e.level >= 10 then 2 else 1 end + case when e.stars >= 3 then 1 else 0 end;$b$);
select private._star_patch('private.oracle_eval(public.enchantments,timestamp with time zone)',
  $a$'cards_n', case when e.level >= 10 then 5 else 3 end, 'rewrites_n', case when e.level >= 10 then 2 else 1 end,$a$,
  $b$'cards_n', case when e.level >= 10 then 5 else 3 end + case when e.stars >= 1 then 1 else 0 end,
    'rewrites_n', case when e.level >= 10 then 2 else 1 end + case when e.stars >= 2 then 1 else 0 end,$b$);

-- 🧪 Splice: Spare Coil · Long Graft · Quaternion
select private._star_patch('private.splice_eval(public.enchantments,timestamp with time zone)',
  $a$v_max int := (lab ->> 'max')::int;$a$, $b$v_max int := (lab ->> 'max')::int + case when e.stars >= 1 then 1 else 0 end;$b$);
select private._star_patch('private.ench_act_splice(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_key text; v_h jsonb;$a$, $b$v_key text; w4 public.enchantments; v_h jsonb;$b$);
select private._star_patch('private.ench_act_splice(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$if v_mode not in ('swap', 'graft', 'chimera', 'trinity', 'plot', 'friend') then$a$, $b$if v_mode not in ('swap', 'graft', 'chimera', 'trinity', 'quad', 'plot', 'friend') then$b$);
select private._star_patch('private.ench_act_splice(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_cost := case when v_mode = 'trinity' then 2 else 1 end;$a$,
  $b$v_cost := case when v_mode = 'trinity' then 2 when v_mode = 'quad' then 3 else 1 end;
      if v_mode = 'quad' and e.stars < 3 then raise exception 'stars_locked' using errcode = 'P0001', detail = '3'; end if;$b$);
select private._star_patch('private.ench_act_splice(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_hrs := case v_mode when 'graft' then 12 when 'chimera' then 12 when 'trinity' then 18 else private.ench_n('splice', 'hours', 24) end;$a$,
  $b$v_hrs := case v_mode when 'graft' then 12 when 'chimera' then 12 when 'trinity' then 18 when 'quad' then 18 else private.ench_n('splice', 'hours', 24) end
               * case when e.stars >= 2 then 1.5 else 1 end;$b$);
select private._star_patch('private.ench_act_splice(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$      elsif v_mode = 'trinity' then$a$,
  $b$      elsif v_mode = 'quad' then
        -- ★3: four at once — every one of them partners the other three (six bonds, one group)
        select * into y from public.enchantments where id = (a ->> 'b')::uuid for update;
        select * into z from public.enchantments where id = (a ->> 'c')::uuid for update;
        select * into w4 from public.enchantments where id = (a ->> 'd')::uuid for update;
        if not private.splice_can(y, e.owner_id) or not private.splice_can(z, e.owner_id) or not private.splice_can(w4, e.owner_id)
           or cardinality(array(select distinct u from unnest(array[x.id, y.id, z.id, w4.id]) u)) < 4 then raise exception 'bad_target' using errcode = 'P0001'; end if;
        v_grp := gen_random_uuid();
        v_name := private.ench_quad_name(x.kind, y.kind, z.kind, w4.kind);
        v_data := jsonb_build_object('name', v_name, 'quad', true);
        insert into public.enchant_splices (splice_id, player_id, a, b, ends_at, mode, data, grp)
        select e.id, e.owner_id, q.m1, q.m2, now() + make_interval(secs => (v_hrs * 3600)::double precision), 'trinity', v_data, v_grp
          from (values (x.id, y.id), (x.id, z.id), (x.id, w4.id), (y.id, z.id), (y.id, w4.id), (z.id, w4.id)) q(m1, m2);
        select string_agg(k, '+' order by k) into v_key from unnest(array[x.kind, y.kind, z.kind, w4.kind]) k;
        v_new := not coalesce(s -> 'quads', '[]'::jsonb) ? v_key;
        s := private.splice_codex_add(s, 'quads', v_key);
        perform private.ench_event(z.id, 'spliced', jsonb_build_object('hybrid', v_name, 'with', x.kind));
        perform private.ench_event(w4.id, 'spliced', jsonb_build_object('hybrid', v_name, 'with', x.kind));
        r := jsonb_build_object('hybrid', v_name, 'mode', 'quad', 'a', x.kind, 'b', y.kind, 'c', z.kind, 'd', w4.kind, 'new', v_new);
      elsif v_mode = 'trinity' then$b$);

select private._star_patch('private.ench_view_splice(public.enchantments,timestamp with time zone)',
  $a$'trinities', coalesce(e.state -> 'trinities', '[]'::jsonb),$a$, $b$'trinities', coalesce(e.state -> 'trinities', '[]'::jsonb), 'quads', coalesce(e.state -> 'quads', '[]'::jsonb),$b$);

-- 🐍 Ouroboros: Thick Scales · Shed Skin · World Serpent
select private._star_patch('private.ouro_settle(uuid)',
  $a$v_risk := private.ouro_risk(k) * case when$a$, $b$v_risk := private.ouro_risk(k) * case when e.stars >= 1 then 0.75 else 1 end * case when$b$);
select private._star_patch('private.ouro_settle(uuid)',
  $a$      perform private.ench_stat(e.id, 'bites');$a$,
  $b$      -- ★2: the shed skin keeps half the bank
      if e.stars >= 2 and coalesce((c ->> 'bank')::numeric, 0) > 0 then v_pay := private.ench_pay(e.id, round((c ->> 'bank')::numeric / 2), 'shed skin: half the bank'); end if;
      perform private.ench_stat(e.id, 'bites');$b$);
select private._star_patch('private.ouro_settle(uuid)',
  $a$'bank', coalesce((c ->> 'bank')::numeric, 0) + private.ouro_loop_ink(k),$a$,
  $b$'bank', coalesce((c ->> 'bank')::numeric, 0) + private.ouro_loop_ink(k) * case when e.stars >= 3 then 2 else 1 end,$b$);
select private._star_patch('private.ench_act_ouroboros(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$'risk', round(private.ouro_risk(k) * v_mult, 3)$a$, $b$'risk', round(private.ouro_risk(k) * v_mult * case when e.stars >= 1 then 0.75 else 1 end, 3)$b$);
select private._star_patch('private.ench_view_ouroboros(public.enchantments,timestamp with time zone)',
  $a$then round(private.ouro_risk(k) * case$a$, $b$then round(private.ouro_risk(k) * case when e.stars >= 1 then 0.75 else 1 end * case$b$);
select private._star_patch('private.ench_view_ouroboros(public.enchantments,timestamp with time zone)',
  $a$jsonb_agg(round(private.ouro_risk(i), 3) order by i)$a$, $b$jsonb_agg(round(private.ouro_risk(i) * case when e.stars >= 1 then 0.75 else 1 end, 3) order by i)$b$);

-- 🧫 Homunculus: Quickening · Long Life · Philosopher's Heart
select private._star_patch('private.homu_eval(public.enchantments,timestamp with time zone)',
  $a$v_need := private.ench_n('homunculus', 'need', 5)::int - case when v_galv then 1 else 0 end;$a$,
  $b$v_need := private.ench_n('homunculus', 'need', 5)::int - case when v_galv then 1 else 0 end - case when e.stars >= 1 then 1 else 0 end;$b$);
select private._star_patch('private.homu_eval(public.enchantments,timestamp with time zone)',
  $a$'leads_left', greatest(0, private.ench_n('homunculus', 'leads_per_day', 2)::int -$a$,
  $b$'leads_left', greatest(0, private.ench_n('homunculus', 'leads_per_day', 2)::int + case when e.stars >= 2 then 1 else 0 end -$b$);
select private._star_patch('private.ench_act_homunculus(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$'until', v_now + private.ench_n('homunculus', 'life_h', 168) * 3600,$a$,
  $b$'until', v_now + private.ench_n('homunculus', 'life_h', 168) * 3600 * case when e.stars >= 2 then 10.0 / 7 else 1 end,$b$);
select private._star_patch('private.ench_act_homunculus(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$private.ench_n('homunculus', 'heart_ink', 80) + 30 * v_lv + 2 * coalesce((aw ->> 'greets')::int, 0), 'the Homunculus’s heart');$a$,
  $b$(private.ench_n('homunculus', 'heart_ink', 80) + 30 * v_lv + 2 * coalesce((aw ->> 'greets')::int, 0)) * case when e.stars >= 3 then 2 else 1 end, 'the Homunculus’s heart');$b$);
select private._star_patch('private.ench_act_homunculus(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$v_luck := 1 + case when v_glow then 1 else 0 end;$a$, $b$v_luck := 1 + case when v_glow then 1 else 0 end + case when e.stars >= 3 then 1 else 0 end;$b$);

-- ⚡ Storm Coil: Twin Storms · Ball Lightning · Eye of the Storm
select private._star_patch('private.storm_eval(public.enchantments)',
  $a$v_per := private.ench_n('stormcoil', 'per_day', 1)::int + case when e.level >= 10 then 1 else 0 end;$a$,
  $b$v_per := private.ench_n('stormcoil', 'per_day', 1)::int + case when e.level >= 10 then 1 else 0 end + case when e.stars >= 1 then 1 else 0 end;$b$);
select private._star_patch('private.ench_act_stormcoil(public.enchantments,text,jsonb,timestamp with time zone)',
  $a$st := st || jsonb_build_object('ink', coalesce((st ->> 'ink')::numeric, 0) + v_ink);$a$,
  $b$if e.stars >= 2 then v_ink := v_ink * 2; end if;
      st := st || jsonb_build_object('ink', coalesce((st ->> 'ink')::numeric, 0) + v_ink);$b$);
select private._star_patch('private.storm_settle(uuid)',
  $a$random() < private.ench_n('stormcoil', 'scorch', 0.3)$a$, $b$e.stars < 3 and random() < private.ench_n('stormcoil', 'scorch', 0.3)$b$);
select private._star_patch('private.storm_mutate(uuid,uuid)',
  $a$private.ench_n('stormcoil', 'aberration', 0.17)$a$, $b$v_abx$b$, 3);
select private._star_patch('private.storm_mutate(uuid,uuid)',
  $a$declare sp public.enchant_splices; v_r numeric := random();$a$,
  $b$declare sp public.enchant_splices; v_r numeric := random();
  v_abx numeric := private.ench_n('stormcoil', 'aberration', 0.17) * case when coalesce((select max(x.stars) from public.enchantments x
                     where x.owner_id = p_owner and x.kind = 'stormcoil' and x.status = 'active'), 0) >= 3 then 2 else 1 end;$b$);

drop function private._star_patch(text, text, text, int);
