-- Live control of the apps and the game's pages, with no app update.
-- game_config 'app' (edited from the admin portal: Live control) is read by every copy of the game, the iOS and
-- Android apps included, when it starts, when it comes back to the front and every few minutes:
--   * min_version / latest_version: apps older than min_version must update (a full-screen prompt with the store
--     button); apps older than latest_version are offered the update once.
--   * maintenance: a planned "back soon" screen for everyone (staff on the website still get in).
--   * hidden_pages / hidden_pages_apps: switch any page of the game off everywhere, or only in the apps. Its buttons
--     and cards disappear and its address goes back to the main screen.
--   * links: the community and support links the game shows.
-- Everything else (prices, rewards, minigames, events, the shop, rarities, switches, announcements) was already live
-- in game_config, feature_flags and their own tables.

insert into public.game_config (key, value, description) values ('app', jsonb_build_object(
  'min_version', '1.0.0',
  'latest_version', '1.0.0',
  'update', jsonb_build_object(
    'title', 'Time to update LANDVAS',
    'message', 'This version of LANDVAS is too old to keep playing. Update it from the store and you''ll be right back where you left off.',
    'soft_title', 'A new LANDVAS is out',
    'soft_message', 'Update from the store for the latest features and fixes.'),
  'store', jsonb_build_object(
    'ios', '',
    'android', 'https://play.google.com/store/apps/details?id=com.landvas.app'),
  'maintenance', jsonb_build_object('on', false, 'title', 'Back soon', 'message', 'We''re making LANDVAS better. Your plots keep earning while we work.', 'until', null),
  'hidden_pages', '[]'::jsonb,
  'hidden_pages_apps', '[]'::jsonb,
  'links', jsonb_build_object('discord', 'https://discord.gg/EsEQB9Zw3', 'reddit', 'https://www.reddit.com/r/LANDVAS/', 'support_email', 'contact@landvas.app', 'website', 'https://landvas.app')
), 'The apps and the game''s pages, live: required and latest app version, store links, planned maintenance, pages switched off, links. Reaches every player within minutes, with no app update.')
on conflict (key) do nothing;

-- what the game reads (signed in or not: the update and maintenance screens show before sign-in too)
create or replace function public.app_config() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(private.cfg('app'), '{}'::jsonb)
$$;
revoke all on function public.app_config() from public;
grant execute on function public.app_config() to anon, authenticated, service_role;

-- saving it: the same checks as every other setting, plus a shape the apps can always read
create or replace function private.app_config_valid(v jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(v) = 'object'
    and coalesce(v ->> 'min_version', '0') ~ '^\d+(\.\d+){0,3}$'
    and coalesce(v ->> 'latest_version', '0') ~ '^\d+(\.\d+){0,3}$'
    and jsonb_typeof(coalesce(v -> 'hidden_pages', '[]'::jsonb)) = 'array'
    and jsonb_typeof(coalesce(v -> 'hidden_pages_apps', '[]'::jsonb)) = 'array'
    and jsonb_typeof(coalesce(v -> 'maintenance', '{}'::jsonb)) = 'object'
    -- the pages the game can't work without are never switched off
    and not exists (
      select 1 from jsonb_array_elements_text(coalesce(v -> 'hidden_pages', '[]'::jsonb) || coalesce(v -> 'hidden_pages_apps', '[]'::jsonb)) p
      where p !~ '^/[a-z0-9/_-]+$' or p in ('/', '/world', '/hub', '/welcome', '/settings', '/support', '/legal', '/onboarding', '/reset-password')
    )
$$;

create or replace function private.app_config_guard() returns trigger
language plpgsql as $$
begin
  if new.key = 'app' and not private.app_config_valid(new.value) then
    raise exception 'invalid_app_config' using errcode = 'P0001',
      detail = 'Versions look like 1.2.0, page lists are lists of addresses like /space, and the map, settings, help and sign-in pages can''t be switched off.';
  end if;
  return new;
end $$;

drop trigger if exists app_config_guard on public.game_config;
create trigger app_config_guard before insert or update on public.game_config
  for each row when (new.key = 'app') execute function private.app_config_guard();
