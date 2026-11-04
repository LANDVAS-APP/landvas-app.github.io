-- v0.51 Updates that look like real announcements, one draft per update, and every past update.
--   * announcements gain `content`: a theme, a big emoji, a subtitle and feature cards ({emoji, title, text}).
--     Players see a proper announcement (hero banner + features); old text-only updates still show fine
--   * every build with something players would notice becomes its own draft (no more piling builds into one)
--   * the deploy also offers every past update that was never announced, dated when it was built, so staff can
--     preview and publish older updates too
--   * discarding a draft keeps a hidden marker, so the same update isn't offered again on the next deploy

alter table public.announcements add column if not exists content jsonb;
alter table public.announcements add column if not exists built_at timestamptz;
alter table public.announcements drop constraint if exists announcements_status_check;
alter table public.announcements add constraint announcements_status_check check (status in ('draft', 'published', 'discarded'));
alter table public.announcements drop constraint if exists announcements_source_check;
alter table public.announcements add constraint announcements_source_check check (source in ('manual', 'auto', 'backfill'));

-- the old waiting draft piled several builds together; drop it so each of those updates is offered on its own
delete from public.announcements where status = 'draft' and source = 'auto';

create or replace function private.announcement_json(a public.announcements, p_seen timestamptz) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'kind', a.kind, 'link', a.link,
                            'popup', a.popup, 'published_at', a.published_at, 'content', a.content, 'built_at', a.built_at,
                            'unread', p_seen is null or a.published_at > p_seen)
$$;

create or replace function public.admin_announcements() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support']);
begin
  return (select coalesce(jsonb_agg(private.announcement_json(a, null) || jsonb_build_object('active', a.active, 'status', a.status, 'source', a.source,
            'builds', a.builds, 'created_at', a.updated_at,
            'author', case when a.created_by is not null then private.profile_json(a.created_by) end)
            order by a.status = 'published', coalesce(a.built_at, a.published_at) desc), '[]'::jsonb)
          from public.announcements a where a.status <> 'discarded');
end $$;

create or replace function public.my_notifications() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_ann jsonb;
begin
  v_ann := public.announcements_list(10);
  return jsonb_build_object(
    'announcements', v_ann -> 'items',
    'unread_announcements', coalesce((v_ann ->> 'unread')::int, 0),
    'support_replies', case when v_uid is null then 0 else (select count(*) from public.support_tickets
                         where player_id = v_uid and last_staff_reply_at is not null and last_staff_reply_at > player_seen_at) end,
    'open_tickets_staff', case when private.is_support_staff(v_uid) then (select count(*) from public.support_tickets where status = 'open') else null end,
    'drafts_staff', case when private.is_support_staff(v_uid) then (select count(*) from public.announcements where status = 'draft') else null end);
end $$;

/** Set the announcement's rich content (theme, emoji, subtitle, feature cards). Staff only. */
create or replace function public.admin_announcement_content(p_id uuid, p_content jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support']); v_row public.announcements%rowtype;
begin
  if p_content is not null and (jsonb_typeof(p_content) <> 'object' or length(p_content::text) > 12000
     or (p_content ? 'features' and (jsonb_typeof(p_content -> 'features') <> 'array' or jsonb_array_length(p_content -> 'features') > 20))) then
    raise exception 'invalid_content' using errcode = 'P0001';
  end if;
  update public.announcements set content = p_content, updated_at = now() where id = p_id returning * into v_row;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  return private.announcement_json(v_row, null);
end $$;

-- deleting a draft only hides it (so the same update isn't offered again); published ones really go
create or replace function public.admin_announcement_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support']); v_status text;
begin
  select status into v_status from public.announcements where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_status = 'draft' then update public.announcements set status = 'discarded', active = false, updated_at = now() where id = p_id;
  else delete from public.announcements where id = p_id; end if;
  perform private.audit('announcement.delete', 'announcement', p_id::text, jsonb_build_object('was', v_status));
  return jsonb_build_object('ok', true);
end $$;

/** Called by the deploy (as the database owner): one draft per update. p = {sha, title, body, notes, content,
    built_at, source}. An update already drafted, published or discarded is skipped. */
create or replace function private.build_update_draft(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.announcements%rowtype; v_sha text := left(coalesce(p ->> 'sha', ''), 40);
begin
  if v_sha = '' or coalesce(btrim(p ->> 'body'), '') = '' then return jsonb_build_object('ok', false, 'why', 'empty'); end if;
  if exists (select 1 from public.announcements a, jsonb_array_elements(a.builds) b where b ->> 'sha' = v_sha) then
    return jsonb_build_object('ok', false, 'why', 'seen');
  end if;
  insert into public.announcements (title, body, kind, link, popup, active, status, source, builds, content, built_at)
  values (left(coalesce(nullif(btrim(p ->> 'title'), ''), 'What’s new in LANDVAS'), 120), left(btrim(p ->> 'body'), 4000), 'update',
          case when p ->> 'link' ~ '^/[A-Za-z0-9/_?=&#.\-]*$' then p ->> 'link' end, true, true, 'draft',
          case when p ->> 'source' = 'backfill' then 'backfill' else 'auto' end,
          jsonb_build_array(jsonb_build_object('sha', v_sha, 'at', coalesce(p ->> 'built_at', now()::text), 'notes', coalesce(p -> 'notes', '[]'::jsonb))),
          case when jsonb_typeof(p -> 'content') = 'object' then p -> 'content' else null end,
          coalesce((p ->> 'built_at')::timestamptz, now()))
  returning * into d;
  return jsonb_build_object('ok', true, 'id', d.id);
end $$;
/** Many at once (the deploy sends this build's updates and any older ones never announced). */
create or replace function private.build_update_drafts(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare x jsonb; v_new int := 0; r jsonb;
begin
  for x in select value from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    r := private.build_update_draft(x);
    if (r ->> 'ok')::boolean then v_new := v_new + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'new_drafts', v_new);
end $$;

do $$
begin
  execute 'revoke all on function private.build_update_drafts(jsonb) from public';
  execute 'revoke all on function public.admin_announcement_content(uuid, jsonb) from public, anon';
  execute 'grant execute on function public.admin_announcement_content(uuid, jsonb) to authenticated, service_role';
end $$;
