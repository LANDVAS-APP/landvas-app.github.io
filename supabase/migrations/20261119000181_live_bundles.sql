-- Live versions of the game in the iOS / Android apps, without a store release.
-- Every deploy builds the game's web code for the apps, publishes its files on landvas.app/ota/<key>/<build>/ and
-- records here which build is current for each kind of app binary (the compatibility key: same native plugins and
-- ads setting, see scripts/native-compat.mjs), with the sha-256 of every file. The app (src/native/liveBundle.ts)
-- fetches only the files it doesn't already have, checks each against this list, and applies the new build after
-- it has been away for a while or on its next launch. A build that doesn't start rolls back by itself.
--
-- Staff control it from the admin portal (Live control → Live versions), in game_config 'app' -> 'ota':
--   on: false stops sending new builds; paused_for: app versions under store review keep the build inside them;
--   back_to_store_build: every app goes back to the build that came with it from the store.

create table if not exists public.ota_bundles (
  compat text primary key check (compat ~ '^[a-f0-9]{8,64}$'),
  build text not null check (build ~ '^[A-Za-z0-9._-]{1,64}$'),
  built_at timestamptz,
  published_at timestamptz not null default now(),
  base_url text not null check (base_url ~ '^https://'),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'array'),
  files int not null,
  bytes bigint not null
);
-- read only through the functions below; written by the deploy (as the database owner)
alter table public.ota_bundles enable row level security;
revoke all on public.ota_bundles from anon, authenticated;

-- the review hold starts on for 1.0.0: the stores review exactly the build they were sent
update public.game_config
   set value = value || jsonb_build_object('ota', jsonb_build_object('on', true, 'paused_for', jsonb_build_array('1.0.0'), 'back_to_store_build', false))
 where key = 'app' and not (value ? 'ota');

create or replace function private.app_config_valid(v jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(v) = 'object'
    and coalesce(v ->> 'min_version', '0') ~ '^\d+(\.\d+){0,3}$'
    and coalesce(v ->> 'latest_version', '0') ~ '^\d+(\.\d+){0,3}$'
    and jsonb_typeof(coalesce(v -> 'hidden_pages', '[]'::jsonb)) = 'array'
    and jsonb_typeof(coalesce(v -> 'hidden_pages_apps', '[]'::jsonb)) = 'array'
    and jsonb_typeof(coalesce(v -> 'maintenance', '{}'::jsonb)) = 'object'
    and jsonb_typeof(coalesce(v -> 'ota', '{}'::jsonb)) = 'object'
    and jsonb_typeof(coalesce(v -> 'ota' -> 'paused_for', '[]'::jsonb)) = 'array'
    and not exists (select 1 from jsonb_array_elements_text(coalesce(v -> 'ota' -> 'paused_for', '[]'::jsonb)) x where x !~ '^\d+(\.\d+){0,3}$')
    -- the pages the game can't work without are never switched off
    and not exists (
      select 1 from jsonb_array_elements_text(coalesce(v -> 'hidden_pages', '[]'::jsonb) || coalesce(v -> 'hidden_pages_apps', '[]'::jsonb)) p
      where p !~ '^/[a-z0-9/_-]+$' or p in ('/', '/world', '/hub', '/welcome', '/settings', '/support', '/legal', '/onboarding', '/reset-password')
    )
$$;

-- what every copy of the game reads: the live settings plus which build is current for each kind of app (small)
create or replace function public.app_config() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(private.cfg('app'), '{}'::jsonb) || jsonb_build_object('ota_builds', coalesce((
    select jsonb_object_agg(compat, jsonb_build_object('build', build, 'built_at', built_at, 'published_at', published_at, 'files', files, 'bytes', bytes))
    from public.ota_bundles), '{}'::jsonb))
$$;
revoke all on function public.app_config() from public;
grant execute on function public.app_config() to anon, authenticated, service_role;

-- the file list for one kind of app, fetched only when it is about to take a new build
create or replace function public.ota_manifest(p_compat text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('build', build, 'built_at', built_at, 'base_url', base_url, 'manifest', manifest)
  from public.ota_bundles where compat = p_compat
$$;
revoke all on function public.ota_manifest(text) from public;
grant execute on function public.ota_manifest(text) to anon, authenticated, service_role;

-- the deploy records a published build (runs as the database owner through the Management API)
create or replace function private.ota_publish(p_compat text, p_build text, p_built_at timestamptz, p_base_url text, p_manifest jsonb) returns void
language plpgsql as $$
begin
  if jsonb_typeof(p_manifest) <> 'array' or jsonb_array_length(p_manifest) = 0
     or not exists (select 1 from jsonb_array_elements(p_manifest) e where e ->> 'file_name' = 'index.html') then
    raise exception 'ota_bad_manifest' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_manifest) e
             where coalesce(e ->> 'file_hash', '') !~ '^[a-f0-9]{64}$' or coalesce(e ->> 'download_url', '') not like p_base_url || '%'
                or coalesce(e ->> 'file_name', '') ~ '(^/|\.\.)') then
    raise exception 'ota_bad_manifest' using errcode = 'P0001';
  end if;
  insert into public.ota_bundles (compat, build, built_at, published_at, base_url, manifest, files, bytes)
  values (p_compat, p_build, p_built_at, now(), p_base_url, p_manifest, jsonb_array_length(p_manifest),
          (select coalesce(sum((e ->> 'size')::bigint), 0) from jsonb_array_elements(p_manifest) e))
  on conflict (compat) do update set build = excluded.build, built_at = excluded.built_at, published_at = now(),
    base_url = excluded.base_url, manifest = excluded.manifest, files = excluded.files, bytes = excluded.bytes;
end $$;
revoke all on function private.ota_publish(text, text, timestamptz, text, jsonb) from public;

-- what app_config() adds is never stored back into the settings (a form that saved the whole thing back)
create or replace function private.app_config_guard() returns trigger
language plpgsql as $$
begin
  if new.key = 'app' then
    new.value := new.value - 'ota_builds';
    if not private.app_config_valid(new.value) then
      raise exception 'invalid_app_config' using errcode = 'P0001',
        detail = 'Versions look like 1.2.0, page lists are lists of addresses like /space, and the map, settings, help and sign-in pages can''t be switched off.';
    end if;
  end if;
  return new;
end $$;
