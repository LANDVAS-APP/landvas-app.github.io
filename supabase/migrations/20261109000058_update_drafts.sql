-- v0.40 Auto-written updates. Every deploy writes (or adds to) a draft update from the build's notes.
-- Drafts are never shown to players: staff preview them in Admin → Updates, edit if they like, then
-- approve (publish) or discard. Until one is approved, later builds keep adding to the same draft.

alter table public.announcements add column if not exists status text not null default 'published';
alter table public.announcements drop constraint if exists announcements_status_check;
alter table public.announcements add constraint announcements_status_check check (status in ('draft', 'published'));
alter table public.announcements add column if not exists source text not null default 'manual';
alter table public.announcements drop constraint if exists announcements_source_check;
alter table public.announcements add constraint announcements_source_check check (source in ('manual', 'auto'));
alter table public.announcements add column if not exists builds jsonb not null default '[]'::jsonb; -- [{sha, at, notes: [..]}]
create index if not exists announcements_drafts on public.announcements (created_by) where status = 'draft';

-- what players see: published only
create or replace function public.announcements_list(p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_seen timestamptz; v_rows jsonb;
begin
  if v_uid is not null then
    select seen_at into v_seen from public.announcement_reads where player_id = v_uid;
    if v_seen is null then select created_at into v_seen from public.players where id = v_uid; end if;
  else
    v_seen := now();
  end if;
  select coalesce(jsonb_agg(private.announcement_json(a, v_seen) order by a.published_at desc), '[]'::jsonb) into v_rows
  from (select * from public.announcements where active and status = 'published' and published_at <= now()
        order by published_at desc limit least(greatest(coalesce(p_limit, 20), 1), 50)) a;
  return jsonb_build_object('items', v_rows, 'seen_at', v_seen,
    'unread', (select count(*) from public.announcements where active and status = 'published' and published_at <= now() and published_at > coalesce(v_seen, now())));
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

create or replace function public.admin_announcements() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support']);
begin
  return (select coalesce(jsonb_agg(private.announcement_json(a, null) || jsonb_build_object('active', a.active, 'status', a.status, 'source', a.source,
            'builds', a.builds, 'created_at', a.updated_at,
            'author', case when a.created_by is not null then private.profile_json(a.created_by) end) order by a.status = 'published', a.published_at desc), '[]'::jsonb)
          from public.announcements a);
end $$;

/** Approve a draft: publish it now (with any edits), so it goes out on everyone's bell (and pops up if asked). */
create or replace function public.admin_announcement_publish(p_id uuid, p_title text, p_body text, p_kind text default 'update', p_link text default null, p_popup boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support']); v_row public.announcements%rowtype;
begin
  update public.announcements
     set title = btrim(p_title), body = btrim(p_body), kind = coalesce(p_kind, kind), link = nullif(btrim(coalesce(p_link, '')), ''),
         popup = coalesce(p_popup, popup), active = true, status = 'published', published_at = now(), updated_at = now(), created_by = coalesce(created_by, v_uid)
   where id = p_id and status = 'draft' returning * into v_row;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.audit('announcement.publish', 'announcement', v_row.id::text, jsonb_build_object('title', v_row.title, 'source', v_row.source));
  return private.announcement_json(v_row, null) || jsonb_build_object('active', true, 'status', v_row.status);
end $$;

/** Staff can also write an update as a draft, to preview it before it goes out. */
create or replace function public.admin_announcement_draft(p_title text, p_body text, p_kind text default 'update', p_link text default null, p_popup boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support']); v_row public.announcements%rowtype;
begin
  insert into public.announcements (title, body, kind, link, popup, active, status, source, created_by)
  values (btrim(p_title), btrim(p_body), coalesce(p_kind, 'update'), nullif(btrim(coalesce(p_link, '')), ''), coalesce(p_popup, true), true, 'draft', 'manual', v_uid)
  returning * into v_row;
  perform private.audit('announcement.draft', 'announcement', v_row.id::text, jsonb_build_object('title', v_row.title));
  return private.announcement_json(v_row, null) || jsonb_build_object('status', 'draft');
end $$;

/** Called by the deploy (as the database owner, never by players): add a build's notes to the waiting draft,
    or start a new one. p = {sha, title, body, notes: [..]}. The same build twice is ignored. */
create or replace function private.build_update_draft(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.announcements%rowtype; v_sha text := left(coalesce(p ->> 'sha', ''), 40); v_title text; v_body text;
begin
  if v_sha = '' or coalesce(btrim(p ->> 'body'), '') = '' then return jsonb_build_object('ok', false, 'why', 'empty'); end if;
  if exists (select 1 from public.announcements a, jsonb_array_elements(a.builds) b where b ->> 'sha' = v_sha) then
    return jsonb_build_object('ok', false, 'why', 'seen');
  end if;
  select * into d from public.announcements where status = 'draft' and source = 'auto' order by updated_at desc limit 1 for update;
  v_title := left(coalesce(nullif(btrim(p ->> 'title'), ''), 'What’s new in LANDVAS'), 120);
  if found then
    -- a waiting draft: keep its (maybe edited) headline, add the new notes underneath
    v_body := left(d.body || E'\n' || btrim(p ->> 'body'), 4000);
    update public.announcements set body = v_body, builds = builds || jsonb_build_array(jsonb_build_object('sha', v_sha, 'at', now(), 'notes', coalesce(p -> 'notes', '[]'::jsonb))),
           updated_at = now() where id = d.id;
    return jsonb_build_object('ok', true, 'id', d.id, 'merged', true);
  end if;
  insert into public.announcements (title, body, kind, popup, active, status, source, builds)
  values (v_title, left(btrim(p ->> 'body'), 4000), 'update', true, true, 'draft', 'auto',
          jsonb_build_array(jsonb_build_object('sha', v_sha, 'at', now(), 'notes', coalesce(p -> 'notes', '[]'::jsonb))))
  returning * into d;
  return jsonb_build_object('ok', true, 'id', d.id, 'merged', false);
end $$;

do $$
begin
  execute 'revoke all on function private.build_update_draft(jsonb) from public';
  execute 'revoke all on function public.admin_announcement_publish(uuid, text, text, text, text, boolean) from public, anon';
  execute 'grant execute on function public.admin_announcement_publish(uuid, text, text, text, text, boolean) to authenticated, service_role';
  execute 'revoke all on function public.admin_announcement_draft(text, text, text, text, boolean) from public, anon';
  execute 'grant execute on function public.admin_announcement_draft(text, text, text, text, boolean) to authenticated, service_role';
end $$;
