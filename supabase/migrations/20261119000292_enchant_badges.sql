-- Enchantments, part 11: badges — 124 of them, for every enchantment and the things you do with them (some secret).
-- Like every badge they never pay Ink: each pays Luck, and the hardest Enchanted Luck too.
-- Counted two ways, the larger wins: a per-player tally that grows with every stat an enchantment keeps
-- (public.ench_feats, fed by private.ench_stat — it stays yours even when the enchantment moves on), and the stats on
-- the enchantments you own now. Checked after every enchantment action (the badges come back with the action), and
-- with every other badge check.

alter table public.achievements add column if not exists is_secret boolean not null default false;
alter table public.achievements drop constraint if exists achievements_category_check;
alter table public.achievements add constraint achievements_category_check
  check (category in ('creation', 'collection', 'exploration', 'mastery', 'community', 'rarity', 'daily', 'travel', 'estate', 'kinds', 'enchant'));

create table if not exists public.ench_feats (
  player_id uuid not null references public.players (id) on delete cascade,
  key text not null,
  n numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (player_id, key));
alter table public.ench_feats enable row level security;

create or replace function private.feat(p_uid uuid, p_key text, p_add numeric default 1) returns void language sql as $$
  insert into public.ench_feats (player_id, key, n) values (p_uid, p_key, p_add)
  on conflict (player_id, key) do update set n = public.ench_feats.n + excluded.n, updated_at = now()
$$;
create or replace function private.feat_once(p_uid uuid, p_key text) returns void language sql as $$
  insert into public.ench_feats (player_id, key, n) values (p_uid, p_key, 1) on conflict (player_id, key) do nothing
$$;

-- every stat an enchantment keeps is tallied for its owner too
create or replace function private.ench_stat(p_id uuid, p_key text, p_add numeric default 1) returns void language plpgsql as $$
declare v_owner uuid; v_kind text;
begin
  update public.enchantments set stats = stats || jsonb_build_object(p_key, coalesce((stats ->> p_key)::numeric, 0) + p_add) where id = p_id
  returning owner_id, kind into v_owner, v_kind;
  if v_owner is not null then
    perform private.feat(v_owner, v_kind || '.' || p_key, p_add);
    if p_key in ('ink', 'gold_eggs', 'spores', 'boxes', 'echoes_done', 'arcs', 'div_hits', 'giant_days', 'named') then perform private.feat(v_owner, 'all.' || p_key, p_add); end if;
  end if;
end $$;

-- the Traits that keep their own counts tally them too
select private.fn_patch('private.trait_egg(public.enchantments)', $a$  rf := private.ench_refill(e, 1);$a$, $b$  perform private.feat(e.owner_id, 'all.gold_eggs');
  rf := private.ench_refill(e, 1);$b$);
select private.fn_patch('private.trait_box(public.enchantments)', $a$  if random() < private.ench_n('pandora', 'chaos_good', 0.7) then$a$, $b$  perform private.feat(e.owner_id, 'all.boxes');
  if random() < private.ench_n('pandora', 'chaos_good', 0.7) then$b$);
select private.fn_patch('private.static_add(public.enchantments)', $a$  perform private.ench_event(e.id, 'arced', jsonb_build_object('plots', v_n));$a$,
  $b$  perform private.feat(e.owner_id, 'all.arcs');
  perform private.ench_event(e.id, 'arced', jsonb_build_object('plots', v_n));$b$);

/** everything the enchantment badges count, for one player */
create or replace function private.ench_metrics(p_uid uuid) returns jsonb language sql stable as $$
  with cur as (
    select e.kind || '.' || s.key k, sum((s.value)::numeric) n
      from public.enchantments e cross join lateral jsonb_each(e.stats) s
     where e.owner_id = p_uid and e.status <> 'gone' and jsonb_typeof(s.value) = 'number' group by 1),
  f as (select key k, n from public.ench_feats where player_id = p_uid),
  allk as (select k, max(n) n from (select * from cur union all select * from f) u group by k),
  alls as (select 'all.' || split_part(k, '.', 2) k, sum(n) n from cur where split_part(k, '.', 2) in ('gold_eggs', 'spores', 'boxes', 'echoes_done', 'arcs', 'div_hits', 'giant_days', 'ink') group by 1),
  glyph as (select 'glyph.cast.' || m.key k, sum((m.value)::numeric) n
              from public.enchantments e cross join lateral jsonb_each(coalesce(e.state -> 'mastery', '{}'::jsonb)) m
             where e.owner_id = p_uid and e.kind = 'glyph' and jsonb_typeof(m.value) = 'number' group by 1)
  select coalesce((select jsonb_object_agg(a.metric, 0) from public.achievements a where a.category = 'enchant'), '{}'::jsonb)
    || coalesce((select jsonb_object_agg('ench.' || k, n) from (
           select k, max(n) n from (select * from allk union all select * from alls union all select * from glyph) z group by k) q), '{}'::jsonb)
    || jsonb_build_object(
      'ench.kinds_owned', (select count(distinct kind) from public.enchantments where (owner_id = p_uid or first_owner = p_uid) and kind <> 'cuckoo'),
      'ench.max_level', coalesce((select max(level) from public.enchantments where owner_id = p_uid and status <> 'gone'), 0),
      'ench.max_stars', coalesce((select max(stars) from public.enchantments where owner_id = p_uid and status <> 'gone'), 0),
      'ench.codex', coalesce((select max(jsonb_array_length(coalesce(state -> 'codex', '[]'::jsonb))) from public.enchantments where owner_id = p_uid and kind = 'splice'), 0),
      'ench.aberrations', coalesce((select max(jsonb_array_length(coalesce(state -> 'aberrations', '[]'::jsonb))) from public.enchantments where owner_id = p_uid and kind = 'splice'), 0),
      'ench.genes', (select count(*) from public.ench_feats where player_id = p_uid and key like 'gene.%'),
      'ench.lev_kinds', (select count(*) from public.ench_feats where player_id = p_uid and key like 'lev.%'),
      'ench.titles', (select count(distinct t) from public.enchantments e cross join lateral unnest(e.titles) t where e.owner_id = p_uid and e.status <> 'gone'),
      'ench.glyph.known', coalesce((select max(jsonb_array_length(coalesce(state -> 'known', '[]'::jsonb))) from public.enchantments where owner_id = p_uid and kind = 'glyph'), 0),
      'ench.glyph.secret_casts', coalesce((select sum(coalesce((state -> 'mastery' ->> g)::numeric, 0)) from public.enchantments, unnest(array['rune', 'phoenix', 'void', 'omega']) g
                                            where owner_id = p_uid and kind = 'glyph'), 0),
      'ench.deck.complete', (select count(*) from public.enchantments where owner_id = p_uid and kind = 'deck' and coalesce((stats ->> 'complete')::boolean, false)),
      'ench.from_ouroboros', (select count(*) from public.enchantments where owner_id = p_uid and status <> 'gone' and stats ->> 'hatched_from' = 'ouroboros'),
      'ench.from_homunculus', (select count(*) from public.enchantments where owner_id = p_uid and status <> 'gone' and stats ->> 'hatched_from' = 'homunculus'))
$$;

/** check the enchantment badges only (cheap: after every enchantment action) */
create or replace function private.ench_badges(p_uid uuid) returns jsonb language plpgsql as $$
declare v_m jsonb; v_new jsonb := '[]'::jsonb; a record;
begin
  if p_uid is null then return v_new; end if;
  v_m := private.ench_metrics(p_uid);
  for a in select * from public.achievements x where x.is_active and x.category = 'enchant'
             and not exists (select 1 from public.player_achievements pa where pa.player_id = p_uid and pa.achievement_key = x.key) order by x.sort loop
    if coalesce((v_m ->> a.metric)::numeric, 0) >= a.threshold then
      insert into public.player_achievements (player_id, achievement_key) values (p_uid, a.key) on conflict do nothing;
      if found then
        -- (never Ink — badges pay Luck, and the big ones Enchanted Luck)
        perform private.ench_give_luck(p_uid, coalesce((a.reward ->> 'luck')::int, 0), coalesce((a.reward ->> 'enchanted_luck')::int, 0));
        v_new := v_new || jsonb_build_array(jsonb_build_object('key', a.key, 'name', a.name, 'description', a.description, 'icon', a.icon, 'reward', a.reward,
                                                               'category', a.category, 'threshold', a.threshold, 'secret', a.is_secret));
      end if;
    end if;
  end loop;
  return v_new;
end $$;

-- every other badge check counts them too
-- (the general check leaves the enchantment badges to their own, which pays them in Luck)
select private.fn_patch('private.evaluate_achievements(uuid)', $a$    where x.is_active and not exists$a$, $b$    where x.is_active and x.category <> 'enchant' and not exists$b$);
select private.fn_patch('private.evaluate_achievements(uuid)', $a$  return v_new;$a$, $b$  return v_new || private.ench_badges(p_uid);$b$);
select private.fn_patch('public.achievements_catalog()', $a$  if v_uid is not null then v_m := private.achievement_metrics(v_uid); end if;$a$,
  $b$  if v_uid is not null then v_m := private.achievement_metrics(v_uid) || private.ench_metrics(v_uid); end if;$b$);
-- a secret badge stays a secret until it's yours
select private.fn_patch('public.achievements_catalog()',
  $a$'key', a.key, 'name', a.name, 'description', a.description, 'icon', a.icon, 'category', a.category,$a$,
  $b$'key', a.key, 'name', case when a.is_secret and pa.unlocked_at is null then '???' else a.name end,
      'description', case when a.is_secret and pa.unlocked_at is null then 'A secret. Keep playing with your enchantments to find it.' else a.description end,
      'icon', case when a.is_secret and pa.unlocked_at is null then '❔' else a.icon end, 'category', a.category, 'secret', a.is_secret, 'metric', a.metric,$b$);

-- an enchantment action: its Traits are counted as used, and the badges come back with it
select private.fn_patch('public.enchant_act(uuid,text,jsonb)',
  $a$  return private.ench_view(e.id) || jsonb_build_object('result', v -> 'result', 'balances', private.balances(v_uid));
end$a$,
  $b$  insert into public.ench_feats (player_id, key, n)
  select v_uid, 'gene.' || (p ->> 'gene'), 1 from jsonb_array_elements(private.ench_partners(e.id)) p where p ->> 'gene' is not null
  on conflict (player_id, key) do nothing;
  return private.ench_view(e.id) || jsonb_build_object('result', v -> 'result', 'balances', private.balances(v_uid), 'achievements', private.ench_badges(v_uid));
end$b$);
select private.fn_patch('public.enchant_act(uuid,text,jsonb)',
  $a$    perform private.ench_event(e.id, 'named', jsonb_build_object('name', nullif(left(trim(coalesce(a ->> 'name', '')), 24), '')));$a$,
  $b$    perform private.ench_event(e.id, 'named', jsonb_build_object('name', nullif(left(trim(coalesce(a ->> 'name', '')), 24), '')));
    if nullif(trim(coalesce(a ->> 'name', '')), '') is not null then perform private.feat_once(v_uid, 'all.named'); end if;
    return private.ench_view(e.id) || jsonb_build_object('achievements', private.ench_badges(v_uid));$b$);
select private.fn_patch('public.enchant_act(uuid,text,jsonb)',
  $a$    return private.ench_view(e.id) || jsonb_build_object('result', v, 'balances', private.balances(v_uid));$a$,
  $b$    return private.ench_view(e.id) || jsonb_build_object('result', v, 'balances', private.balances(v_uid), 'achievements', private.ench_badges(v_uid));$b$);
select private.fn_patch('public.leviathan_hit(text,integer,uuid)',
  $a$    perform private.ench_event(e.id, 'leviathan', jsonb_build_object('move', m ->> 0, 'dmg', v_dmg));$a$,
  $b$    perform private.ench_event(e.id, 'leviathan', jsonb_build_object('move', m ->> 0, 'dmg', v_dmg));
    perform private.feat_once(v_uid, 'lev.' || e.kind);$b$);

-- the badges
-- 124 badges
insert into public.achievements (key, name, description, icon, category, metric, threshold, reward, sort, is_secret) values
  ('en_first', 'Something Stirs', 'Own your first enchantment.', '🔮', 'enchant', 'ench.kinds_owned', 1, '{"luck": 2}', 700, false),
  ('en_kinds_5', 'Collector of Wonders', 'Own 5 different kinds of enchantment.', '📖', 'enchant', 'ench.kinds_owned', 5, '{"luck": 5}', 701, false),
  ('en_kinds_10', 'Menagerie', 'Own 10 different kinds of enchantment.', '🦄', 'enchant', 'ench.kinds_owned', 10, '{"luck": 12}', 702, false),
  ('en_kinds_20', 'Grand Grimoire', 'Own all 20 kinds of enchantment.', '📚', 'enchant', 'ench.kinds_owned', 20, '{"luck": 50, "enchanted_luck": 1}', 703, false),
  ('en_level_5', 'Awakened', 'Raise an enchantment to level 5.', '⭐', 'enchant', 'ench.max_level', 5, '{"luck": 2}', 704, false),
  ('en_level_10', 'Ascended', 'Raise an enchantment to level 10.', '🌟', 'enchant', 'ench.max_level', 10, '{"luck": 10}', 705, false),
  ('en_star_1', 'Starlit', 'Pour a copy in and earn an enchantment’s first star.', '✨', 'enchant', 'ench.max_stars', 1, '{"luck": 2}', 706, false),
  ('en_star_3', 'Supernova', 'Earn an enchantment’s third star.', '💫', 'enchant', 'ench.max_stars', 3, '{"luck": 15}', 707, false),
  ('en_star_4', 'Comet-Crowned', 'Earn an enchantment’s fourth star.', '☄️', 'enchant', 'ench.max_stars', 4, '{"luck": 30, "enchanted_luck": 1}', 708, false),
  ('en_star_5', 'Ascendant', 'Earn an enchantment’s fifth star — the constellation wakes.', '🌌', 'enchant', 'ench.max_stars', 5, '{"luck": 60, "enchanted_luck": 2}', 709, false),
  ('en_ink_1k', 'Ink From Magic', 'Your enchantments pay you 1,000 Ink.', '💧', 'enchant', 'ench.all.ink', 1000, '{"luck": 2}', 710, false),
  ('en_ink_25k', 'Living Ink', 'Your enchantments pay you 25,000 Ink.', '🌊', 'enchant', 'ench.all.ink', 25000, '{"luck": 20}', 711, false),
  ('en_ink_250k', 'Sea of Spells', 'Your enchantments pay you 250,000 Ink.', '🐋', 'enchant', 'ench.all.ink', 250000, '{"luck": 60, "enchanted_luck": 2}', 712, false),
  ('en_genes_3', 'Trait Tinkerer', 'Use 3 different splice Traits.', '🧬', 'enchant', 'ench.genes', 3, '{"luck": 2}', 713, false),
  ('en_genes_10', 'Trait Tamer', 'Use 10 different splice Traits.', '🧬', 'enchant', 'ench.genes', 10, '{"luck": 12}', 714, false),
  ('en_genes_19', 'Every Trait There Is', 'Use all 19 splice Traits.', '🧬', 'enchant', 'ench.genes', 19, '{"luck": 50, "enchanted_luck": 1}', 715, false),
  ('en_lev_1', 'Monster Hunter', 'Use an enchantment’s move on the Leviathan.', '🐉', 'enchant', 'ench.lev_kinds', 1, '{"luck": 2}', 716, false),
  ('en_lev_10', 'The Grimoire vs the Beast', 'Use 10 different enchantments’ moves on the Leviathan.', '🐲', 'enchant', 'ench.lev_kinds', 10, '{"luck": 20}', 717, false),
  ('en_named', 'Name-Giver', 'Give an enchantment a name of its own.', '🏷️', 'enchant', 'ench.all.named', 1, '{"luck": 2}', 718, false),
  ('en_titles_10', 'Decorated', 'Your enchantments have earned 10 titles.', '🎖️', 'enchant', 'ench.titles', 10, '{"luck": 8}', 719, false),
  ('gs_eggs_10', 'Golden Hen', 'Collect 10 golden eggs.', '🥚', 'enchant', 'ench.goose.eggs', 10, '{"luck": 2}', 720, false),
  ('gs_eggs_100', 'Egg Tycoon', 'Collect 100 golden eggs.', '🪺', 'enchant', 'ench.goose.eggs', 100, '{"luck": 15}', 721, false),
  ('gs_fox_10', 'Fox-Scarer', 'Scare 10 foxes off your goose’s egg.', '🦊', 'enchant', 'ench.goose.foxes', 10, '{"luck": 2}', 722, false),
  ('gs_fox_50', 'Fox-Bane', 'Scare 50 foxes off your goose’s egg.', '🦊', 'enchant', 'ench.goose.foxes', 50, '{"luck": 10}', 723, false),
  ('gs_fox_250', 'Fox Nemesis', 'Scare 250 foxes off your goose’s egg.', '🦊', 'enchant', 'ench.goose.foxes', 250, '{"luck": 40, "enchanted_luck": 1}', 724, false),
  ('gs_plat_1', 'Platinum Touch', 'Collect a Platinum egg.', '🤍', 'enchant', 'ench.goose.platinum', 1, '{"luck": 4}', 725, false),
  ('gs_plat_10', 'Platinum Flock', 'Collect 10 Platinum eggs.', '💎', 'enchant', 'ench.goose.platinum', 10, '{"luck": 20}', 726, false),
  ('gs_polish_100', 'Spit-Shine', 'Polish your eggs 100 times.', '🧽', 'enchant', 'ench.goose.polishes', 100, '{"luck": 5}', 727, false),
  ('gn_wish_10', 'Wish Upon a Lamp', 'Make 10 wishes.', '🪔', 'enchant', 'ench.genie.wishes', 10, '{"luck": 2}', 728, false),
  ('gn_wish_100', 'Wishmaster', 'Make 100 wishes.', '🧞', 'enchant', 'ench.genie.wishes', 100, '{"luck": 20}', 729, false),
  ('gn_forbidden', 'Forbidden', 'Make the Forbidden Wish.', '⛓️', 'enchant', 'ench.genie.forbidden', 1, '{"luck": 5}', 730, false),
  ('gn_freed', 'Set It Free', 'Your Genie goes free.', '🕊️', 'enchant', 'ench.genie.freed', 1, '{"luck": 8}', 731, true),
  ('gn_gifts_25', 'Wish Giver', 'Gift 25 wishes to friends.', '🎁', 'enchant', 'ench.genie.gifts', 25, '{"luck": 12}', 732, false),
  ('mp_maps_1', 'X Marks the Spot', 'Dig up a Treasure Map’s chest.', '❌', 'enchant', 'ench.map.maps', 1, '{"luck": 2}', 733, false),
  ('mp_maps_25', 'Cartographer', 'Dig up 25 Treasure Map chests.', '🗺️', 'enchant', 'ench.map.maps', 25, '{"luck": 20}', 734, false),
  ('mp_pieces_100', 'Piece by Piece', 'Pick up 100 map pieces.', '🧩', 'enchant', 'ench.map.pieces', 100, '{"luck": 10}', 735, false),
  ('ps_feeds_10', 'Symbiosis', 'Feed a Parasite 10 times — enough to evolve.', '🦠', 'enchant', 'ench.parasite.feeds', 10, '{"luck": 5}', 736, false),
  ('ps_feeds_100', 'Devourer', 'Feed your Parasites 100 times.', '🧫', 'enchant', 'ench.parasite.feeds', 100, '{"luck": 20}', 737, false),
  ('pd_open_10', 'Curious', 'Lift Pandora’s lid 10 times.', '🏺', 'enchant', 'ench.pandora.opens', 10, '{"luck": 2}', 738, false),
  ('pd_hope_1', 'Hope Remains', 'Let all seven evils out, and Hope rise.', '🌈', 'enchant', 'ench.pandora.hope', 1, '{"luck": 10}', 739, false),
  ('pd_hope_5', 'Keeper of Hope', 'Raise Hope five times.', '🕯️', 'enchant', 'ench.pandora.hope', 5, '{"luck": 30, "enchanted_luck": 1}', 740, false),
  ('pd_blessing', 'Evil Turned Good', 'An escaped evil turns into its blessing (★5).', '😇', 'enchant', 'ench.pandora.blessings', 1, '{"luck": 15}', 741, true),
  ('sp_10', 'Mad Scientist', 'Make 10 splices.', '🧪', 'enchant', 'ench.splice.splices', 10, '{"luck": 5}', 742, false),
  ('sp_100', 'Chimera Factory', 'Make 100 splices.', '🐉', 'enchant', 'ench.splice.splices', 100, '{"luck": 25, "enchanted_luck": 1}', 743, false),
  ('sp_codex_50', 'Codex Keeper', 'Discover 50 hybrids.', '📕', 'enchant', 'ench.codex', 50, '{"luck": 15}', 744, false),
  ('sp_codex_all', 'Codex Complete', 'Discover all 171 hybrids.', '📗', 'enchant', 'ench.codex', 171, '{"luck": 60, "enchanted_luck": 2}', 745, false),
  ('sp_aberr_1', 'Aberrant', 'Make an Aberration.', '☣️', 'enchant', 'ench.aberrations', 1, '{"luck": 10}', 746, true),
  ('sp_aberr_6', 'All Six Horrors', 'Make all six Aberrations.', '👁️‍🗨️', 'enchant', 'ench.aberrations', 6, '{"luck": 60, "enchanted_luck": 1}', 747, true),
  ('sp_eternal', 'Forever Fused', 'Make a splice that never ends (★5).', '♾️', 'enchant', 'ench.splice.eternal', 1, '{"luck": 25, "enchanted_luck": 1}', 748, false),
  ('cw_wind_100', 'Timekeeper', 'Wind the key 100 times.', '🗝️', 'enchant', 'ench.clockwork.winds', 100, '{"luck": 5}', 749, false),
  ('cw_wind_1000', 'Perpetual Motion', 'Wind the key 1,000 times.', '⚙️', 'enchant', 'ench.clockwork.winds', 1000, '{"luck": 30, "enchanted_luck": 1}', 750, false),
  ('cw_freeze_10', 'Stopwatch', 'Freeze time 10 times.', '⏸️', 'enchant', 'ench.clockwork.freezes', 10, '{"luck": 5}', 751, false),
  ('cw_rewind_1', 'Rewound', 'Rewind something bad that happened.', '⏪', 'enchant', 'ench.clockwork.rewinds', 1, '{"luck": 5}', 752, false),
  ('cw_rewind_25', 'Time Thief', 'Rewind 25 bad moments.', '⏳', 'enchant', 'ench.clockwork.rewinds', 25, '{"luck": 25, "enchanted_luck": 1}', 753, false),
  ('cw_roll', 'Butterfly Effect', 'Rewind a plot roll and roll it again.', '🦋', 'enchant', 'ench.clockwork.rewound_rolls', 1, '{"luck": 12}', 754, false),
  ('cw_paradox', 'Paradox', 'Keep the better of two timelines (★5).', '🌀', 'enchant', 'ench.clockwork.paradoxes', 1, '{"luck": 25, "enchanted_luck": 1}', 755, true),
  ('sr_perfect_10', 'Sharpshooter', 'Fire 10 PERFECT Size Ray shots.', '🎯', 'enchant', 'ench.sizeray.perfects', 10, '{"luck": 8}', 756, false),
  ('sr_fired_100', 'Big Bang', 'Fire the Size Ray 100 times.', '📡', 'enchant', 'ench.sizeray.fired', 100, '{"luck": 15}', 757, false),
  ('sr_pranks_10', 'Prankster', 'Prank 10 players with the Size Ray.', '🃏', 'enchant', 'ench.sizeray.pranks', 10, '{"luck": 5}', 758, false),
  ('sr_mega', 'Megaray', 'Grow a plot 1,000× (★4).', '🗼', 'enchant', 'ench.sizeray.megas', 1, '{"luck": 20}', 759, false),
  ('sh_reflect_10', 'Many Faces', 'Make 10 reflections.', '🪞', 'enchant', 'ench.shard.reflections', 10, '{"luck": 5}', 760, false),
  ('sh_shatter', 'Seven Years', 'Shatter the Mirror Shard.', '💥', 'enchant', 'ench.shard.shatters', 1, '{"luck": 8}', 761, false),
  ('wh_open_5', 'Gatekeeper', 'Open the Wormhole 5 times.', '🌀', 'enchant', 'ench.wormhole.opens', 5, '{"luck": 5}', 762, false),
  ('wh_open_50', 'Space Folder', 'Open the Wormhole 50 times.', '🕳️', 'enchant', 'ench.wormhole.opens', 50, '{"luck": 25, "enchanted_luck": 1}', 763, false),
  ('wh_catch_25', 'Something Came Through', 'Catch 25 things falling out of a Wormhole.', '🧲', 'enchant', 'ench.wormhole.catches', 25, '{"luck": 10}', 764, false),
  ('or_true_10', 'Seer', '10 of the Oracle’s cards come true.', '👁️', 'enchant', 'ench.oracle.fulfilled', 10, '{"luck": 5}', 765, false),
  ('or_true_100', 'Prophet', '100 of the Oracle’s cards come true.', '🔮', 'enchant', 'ench.oracle.fulfilled', 100, '{"luck": 30, "enchanted_luck": 1}', 766, false),
  ('or_rewrite_10', 'Fate-Weaver', 'Rewrite fate 10 times.', '🧵', 'enchant', 'ench.oracle.rewrites', 10, '{"luck": 8}', 767, false),
  ('sc_storm_10', 'Stormcaller', 'Call 10 storms.', '⛈️', 'enchant', 'ench.stormcoil.storms', 10, '{"luck": 8}', 768, false),
  ('sc_bolt_50', 'Lightning Hands', 'Catch 50 bolts.', '⚡', 'enchant', 'ench.stormcoil.bolts', 50, '{"luck": 8}', 769, false),
  ('sc_bolt_500', 'Thunderborn', 'Catch 500 bolts.', '🌩️', 'enchant', 'ench.stormcoil.bolts', 500, '{"luck": 40, "enchanted_luck": 1}', 770, false),
  ('sc_aberr', 'Galvanist', 'Make an Aberration with lightning.', '🧟', 'enchant', 'ench.stormcoil.aberrations', 1, '{"luck": 15}', 771, true),
  ('sg_look_50', 'Eagle-Eye', 'Take 50 looks through the Spyglass.', '🔭', 'enchant', 'ench.spyglass.looks', 50, '{"luck": 8}', 772, false),
  ('sg_claim_10', 'Prospector', 'Claim 10 plots you sighted.', '⛏️', 'enchant', 'ench.spyglass.claimed', 10, '{"luck": 10}', 773, false),
  ('sg_grand', 'Far-Seer', 'Sight a Legendary or better.', '🌠', 'enchant', 'ench.spyglass.grand', 1, '{"luck": 8}', 774, false),
  ('og_unfold_10', 'Paper Crane', 'Unfold 10 plots.', '🦢', 'enchant', 'ench.origami.unfolds', 10, '{"luck": 5}', 775, false),
  ('og_unfold_100', 'Thousand Cranes', 'Unfold 100 plots.', '🕊️', 'enchant', 'ench.origami.unfolds', 100, '{"luck": 30, "enchanted_luck": 1}', 776, false),
  ('og_carry_10', 'Pocketful of Power', 'Carry a folded plot’s powers 10 km with you.', '🎒', 'enchant', 'ench.origami.carry_km', 10, '{"luck": 12}', 777, false),
  ('og_kraken', 'Kraken Walker', 'Carry a folded Kraken through the streets.', '🐙', 'enchant', 'ench.origami.kraken_carry', 1, '{"luck": 15}', 778, true),
  ('cr_melt_25', 'Smelter', 'Melt 25 plots.', '🫕', 'enchant', 'ench.crucible.melts', 25, '{"luck": 8}', 779, false),
  ('cr_win_5', 'Forgemaster', 'Forge 5 plots up a tier.', '⚒️', 'enchant', 'ench.crucible.wins', 5, '{"luck": 10}', 780, false),
  ('cr_strike_100', 'Hammer Time', 'Strike the anvil 100 times.', '🔨', 'enchant', 'ench.crucible.strikes', 100, '{"luck": 15}', 781, false),
  ('cr_art_4', 'Artificer', 'Craft 4 artifacts.', '🔔', 'enchant', 'ench.crucible.artifacts', 4, '{"luck": 8}', 782, false),
  ('pp_shows_10', 'Marionettist', 'Put on 10 puppet shows.', '🎭', 'enchant', 'ench.puppeteer.shows', 10, '{"luck": 5}', 783, false),
  ('pp_wins_50', 'Grand Puppeteer', 'Win 50 puppet runs.', '🪆', 'enchant', 'ench.puppeteer.wins', 50, '{"luck": 20}', 784, false),
  ('pp_auto_1', 'Pulling Strings', 'Watch your puppet clear a level by itself.', '🧵', 'enchant', 'ench.puppeteer.auto_levels', 1, '{"luck": 2}', 785, false),
  ('pp_auto_100', 'Ventriloquist', 'Your puppet clears 100 levels by itself.', '🗣️', 'enchant', 'ench.puppeteer.auto_levels', 100, '{"luck": 25, "enchanted_luck": 1}', 786, false),
  ('dk_draws_30', 'Card Sharp', 'Turn 30 cards.', '🃏', 'enchant', 'ench.deck.draws', 30, '{"luck": 8}', 787, false),
  ('dk_foils_3', 'Gilded Hand', 'Turn 3 gilded cards.', '🌟', 'enchant', 'ench.deck.foils', 3, '{"luck": 10}', 788, false),
  ('dk_complete', 'All 22', 'Collect every one of the 22 cards.', '🎴', 'enchant', 'ench.deck.complete', 1, '{"luck": 40, "enchanted_luck": 1}', 789, false),
  ('gl_cast_25', 'Scribe', 'Cast 25 glyphs.', '✍️', 'enchant', 'ench.glyph.casts', 25, '{"luck": 5}', 790, false),
  ('gl_cast_250', 'Archmage', 'Cast 250 glyphs.', '🧙', 'enchant', 'ench.glyph.casts', 250, '{"luck": 30, "enchanted_luck": 1}', 791, false),
  ('gl_bolt_25', 'Thunder Scribe', 'Cast Thunder 25 times.', '⚡', 'enchant', 'ench.glyph.cast.bolt', 25, '{"luck": 10}', 792, false),
  ('gl_spiral_10', 'Vortex Caller', 'Cast the Vortex 10 times.', '🌀', 'enchant', 'ench.glyph.cast.spiral', 10, '{"luck": 5}', 793, false),
  ('gl_ward_10', 'Warden', 'Cast Ward 10 times.', '🛡️', 'enchant', 'ench.glyph.cast.triangle', 10, '{"luck": 5}', 794, false),
  ('gl_star_25', 'Wishing Star', 'Cast Wish 25 times.', '⭐', 'enchant', 'ench.glyph.cast.star', 25, '{"luck": 8}', 795, false),
  ('gl_flame_10', 'Firestarter', 'Cast Ignite 10 times.', '🔥', 'enchant', 'ench.glyph.cast.flame', 10, '{"luck": 8}', 796, false),
  ('gl_infinity', 'Endless', 'Cast the Endless glyph.', '♾️', 'enchant', 'ench.glyph.cast.infinity', 1, '{"luck": 8}', 797, false),
  ('gl_secret', 'Keeper of Secrets', 'Cast a secret glyph.', '🗝️', 'enchant', 'ench.glyph.secret_casts', 1, '{"luck": 20}', 798, true),
  ('gl_known_24', 'Spellwright', 'Find all 24 glyphs.', '📜', 'enchant', 'ench.glyph.known', 24, '{"luck": 50, "enchanted_luck": 1}', 799, false),
  ('sn_light_1', 'First Light', 'Light a Pocket Sun.', '☀️', 'enchant', 'ench.sun.ignites', 1, '{"luck": 2}', 800, false),
  ('sn_light_25', 'Sunkeeper', 'Light 25 Pocket Suns.', '🌞', 'enchant', 'ench.sun.ignites', 25, '{"luck": 15}', 801, false),
  ('sn_perfect', 'Corona', 'Fire a PERFECT Solar Flare.', '🌟', 'enchant', 'ench.sun.perfect_flares', 1, '{"luck": 8}', 802, false),
  ('sn_white', 'White Heat', 'Stoke a sun white-hot.', '🤍', 'enchant', 'ench.sun.white_hot', 1, '{"luck": 5}', 803, false),
  ('sn_snuffed', 'Too Close to the Sun', 'Stoke a sun until it goes out.', '🌑', 'enchant', 'ench.sun.snuffed', 1, '{"luck": 5}', 804, true),
  ('sn_spots_10', 'Sunspotter', 'Claim 10 sunspots.', '🔆', 'enchant', 'ench.sun.sunspots', 10, '{"luck": 12}', 805, false),
  ('sn_party_10', 'Shared Daylight', 'Your party claims 10 plots in your sun.', '🤝', 'enchant', 'ench.sun.party_claims', 10, '{"luck": 10}', 806, false),
  ('sn_conj', 'Conjunction', 'Claim where your sun overlaps the daily Hot Zone.', '🪐', 'enchant', 'ench.sun.conjunctions', 1, '{"luck": 15}', 807, true),
  ('sn_nova', 'Supernova', 'Let a Pocket Sun go supernova (★5).', '💥', 'enchant', 'ench.sun.novas', 1, '{"luck": 40, "enchanted_luck": 1}', 808, false),
  ('rd_tune', 'Water-Witch', 'Tune a Dowsing Rod to a target.', '🪄', 'enchant', 'ench.rod.tunes', 1, '{"luck": 2}', 809, false),
  ('rd_hit_1', 'Divined', 'Your Dowsing Rod brings up its target.', '💧', 'enchant', 'ench.rod.dowsed', 1, '{"luck": 8}', 810, false),
  ('rd_hit_10', 'Lodefinder', 'Your Dowsing Rods bring up 10 targets.', '⛲', 'enchant', 'ench.rod.dowsed', 10, '{"luck": 25, "enchanted_luck": 1}', 811, false),
  ('rd_deep', 'Deep Diviner', 'Dowse a Mythic, an Ultra or a Primordial.', '🌊', 'enchant', 'ench.rod.deep_dowsed', 1, '{"luck": 30, "enchanted_luck": 1}', 812, false),
  ('rd_slip', 'It Slipped Away', 'Feel the rod hold back a natural hit.', '🫗', 'enchant', 'ench.rod.slips', 1, '{"luck": 2}', 813, true),
  ('rd_walk', 'Divining Walk', 'Let the rod walk you to a spot (★3).', '🚶', 'enchant', 'ench.rod.walk_found', 1, '{"luck": 10}', 814, false),
  ('tr_gold_10', 'Golden Touch', 'Crack 10 golden eggs (the Golden Trait).', '🪿', 'enchant', 'ench.all.gold_eggs', 10, '{"luck": 8}', 815, false),
  ('tr_spore_25', 'Spore Season', 'Send 25 spores (the Spreading Trait).', '🍄', 'enchant', 'ench.all.spores', 25, '{"luck": 8}', 816, false),
  ('tr_chaos_10', 'Agent of Chaos', 'Open 10 chaos boxes (the Chaos Trait).', '🎲', 'enchant', 'ench.all.boxes', 10, '{"luck": 8}', 817, false),
  ('tr_echo_10', 'Echo Chamber', '10 actions echo by themselves (the Echo Trait).', '🔁', 'enchant', 'ench.all.echoes_done', 10, '{"luck": 8}', 818, false),
  ('tr_arc_5', 'Static Shock', 'Arc static to your plots 5 times (the Charged Trait).', '🔋', 'enchant', 'ench.all.arcs', 5, '{"luck": 8}', 819, false),
  ('tr_divine', 'Fated by the Rod', 'Divining brings up its target (the Divining Trait).', '🔮', 'enchant', 'ench.all.div_hits', 1, '{"luck": 10}', 820, false),
  ('tr_giant_7', 'Standing Tall', 'A Giant plot stands for 7 days (the Giant Trait).', '🗼', 'enchant', 'ench.all.giant_days', 7, '{"luck": 8}', 821, false),
  ('en_serpent', 'Born of the Serpent', 'Own a Dowsing Rod that was once an Ouroboros.', '🐍', 'enchant', 'ench.from_ouroboros', 1, '{"luck": 5}', 822, true),
  ('en_heart', 'Heart of a Star', 'Own a Pocket Sun that was once a Homunculus.', '🧫', 'enchant', 'ench.from_homunculus', 1, '{"luck": 5}', 823, true)
on conflict (key) do update set name = excluded.name, description = excluded.description, icon = excluded.icon, category = excluded.category, metric = excluded.metric,
  threshold = excluded.threshold, reward = excluded.reward, sort = excluded.sort, is_secret = excluded.is_secret, is_active = true;
