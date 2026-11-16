-- 🧱 Block Splash replaces Sculptor.
--
-- Sculptor (the Clay plots' face-stretcher) is gone. Its plots become Stencil plots, whose minigame is Block Splash:
-- drag paint stencils onto an 8×8 canvas, fill rows and columns to splash them away, chain combos, clear the round's
-- lines. Every plot that was Clay is Stencil now and keeps its level progress (the levels carry over to Block Splash).
-- Also gone: every trace of games that no longer exist (Sculptor, PatternShift, HueFlow) — their old sessions, records,
-- level progress on no plot, leaderboard rows and achievements.

-- ---- what's left of games that no longer exist -------------------------------------------------------------------
delete from public.minigame_sessions where game in ('sculptor', 'patternshift', 'hueflow');
delete from public.minigame_records where game in ('sculptor', 'patternshift', 'hueflow');
delete from public.plot_game_progress where game in ('patternshift', 'hueflow');
delete from public.achievements where metric in ('patternshift', 'hueflow', 'sculptor');

-- ---- the new plot type and game ------------------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in select conname, conrelid::regclass as tbl from pg_constraint
           where contype = 'c' and conrelid in ('public.plot_types'::regclass, 'public.minigame_sessions'::regclass)
             and (pg_get_constraintdef(oid) like '%sculptor%' or pg_get_constraintdef(oid) like '%clay%') loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

insert into public.plot_types (id, name, minigame, minigame_name, tagline, color_primary, color_secondary, weight, acquire_multiplier, sort)
select 'stencil', 'Stencil', 'blocksplash', 'Block Splash', 'Cut shapes, ready to spray', '#FF4FD8', '#7CF56B', weight, acquire_multiplier, sort
  from public.plot_types where id = 'clay'
on conflict (id) do nothing;
insert into public.plot_types (id, name, minigame, minigame_name, tagline, color_primary, color_secondary, weight, acquire_multiplier, sort)
values ('stencil', 'Stencil', 'blocksplash', 'Block Splash', 'Cut shapes, ready to spray', '#FF4FD8', '#7CF56B', 20, 1.0, 6)
on conflict (id) do nothing;

-- every Clay plot is a Stencil plot now (and everything that remembers a plot type)
update public.world_plots set plot_type = 'stencil' where plot_type = 'clay';
update private.granted_rolls set plot_type = 'stencil' where plot_type = 'clay';
update public.roll_tickets set plot_type = 'stencil' where plot_type = 'clay';
update public.luck_choices set types = replace(types::text, '"clay"', '"stencil"')::jsonb where types::text like '%"clay"%';
update private.godroll_log set types = replace(types::text, '"clay"', '"stencil"')::jsonb where types::text like '%"clay"%';
-- their plots' level progress carries over to Block Splash (a fresh best score)
update public.plot_game_progress set game = 'blocksplash', best_score = 0 where game = 'sculptor';
delete from public.plot_types where id = 'clay';

alter table public.plot_types add constraint plot_types_id_check
  check (id in ('graphite', 'pigment', 'mosaic', 'lumina', 'fresco', 'stencil', 'prism', 'glass'));
alter table public.plot_types add constraint plot_types_minigame_check
  check (minigame in ('tracecraft', 'colorburst', 'paintpop', 'lightlines', 'memorymural', 'blocksplash', 'rollermural', 'mirrorline'));
alter table public.minigame_sessions add constraint minigame_sessions_game_check
  check (game in ('tracecraft', 'colorburst', 'paintpop', 'lightlines', 'memorymural', 'blocksplash', 'rollermural', 'mirrorline'));

-- the game's settings: Sculptor's (rounds, Ink per level, max level…), now Block Splash's
update public.game_config
   set value = jsonb_set(value, '{games}',
         ((coalesce(value -> 'games', '{}'::jsonb) - 'sculptor' - 'patternshift' - 'hueflow')
          || jsonb_build_object('blocksplash', coalesce(value -> 'games' -> 'blocksplash', value -> 'games' -> 'sculptor', '{}'::jsonb)
                                               || jsonb_build_object('enabled', true, 'rounds', coalesce((value -> 'games' -> 'sculptor' ->> 'rounds')::int, 5)))))
 where key = 'minigames';

-- ---- badges: Block Splash's, in place of PatternShift's --------------------------------------------------------------
select private.fn_patch('private.achievement_metrics(uuid)',
  $a$'patternshift', (select coalesce(max(highest_level), 0) from public.minigame_records where player_id = p_uid and game = 'patternshift'),$a$,
  $a$'blocksplash', (select coalesce(max(highest_level), 0) from public.minigame_records where player_id = p_uid and game = 'blocksplash'),$a$);
insert into public.achievements (key, name, description, icon, category, metric, threshold, reward, sort, is_active)
select v.key, v.name, v.description, v.icon, 'mastery', 'blocksplash', v.threshold, v.reward::jsonb, coalesce((select max(sort) from public.achievements), 0) + v.n, true
  from (values ('blocksplash_5', 'Block Splash Rookie', 'Clear Block Splash level 5.', '🧱', 5, '{"pigments": 7}', 1),
               ('master_of_stencil', 'Master of Stencil', 'Clear Block Splash level 10.', '🧱', 10, '{"pigments": 12, "gallery_tokens": 2}', 2),
               ('blocksplash_25', 'Block Splash Expert', 'Clear Block Splash level 25.', '🧱', 25, '{"pigments": 17, "gallery_tokens": 1}', 3),
               ('blocksplash_50', 'Block Splash Grandmaster', 'Clear Block Splash level 50.', '🧱', 50, '{"pigments": 30, "gallery_tokens": 2}', 4)) as v(key, name, description, icon, threshold, reward, n)
on conflict (key) do nothing;
