-- Applied ONLY by the in-browser local mode (PGlite). Never apply to Supabase.
-- Local mode has a single device and no human moderators, so artwork is
-- auto-approved after automated validation, and the developer may grant
-- themselves the admin console from Settings.
update public.game_config set value = jsonb_set(value, '{mode}', '"auto"') where key = 'moderation';
update public.feature_flags set enabled = true where key = 'local_dev_mode';
