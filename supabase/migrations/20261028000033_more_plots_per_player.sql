-- v0.16: a 10,000-plot mural needs 10,000 plots, so a player may own at least that many.
update public.game_config
   set value = value || jsonb_build_object('max_plots_per_player', greatest(coalesce((value ->> 'max_plots_per_player')::int, 0), 10000))
 where key = 'limits';
