-- v0.8: site-wide update announcements (with a bell + popup) and in-app support tickets.
-- No email addresses are published anywhere: support happens inside the game.

-- ===== 0. No public contact emails ===============================================
update public.game_config
   set value = (value - 'support_email' - 'abuse_email' - 'copyright_email') || '{"support": "in_app"}'::jsonb,
       description = 'Legal versions. Support, abuse and copyright requests go through in-app support tickets.'
 where key = 'legal';

-- ===== 1. Announcements ==========================================================
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 4000),
  kind text not null default 'update' check (kind in ('update', 'event', 'maintenance', 'news')),
  link text check (link is null or (link ~ '^/[A-Za-z0-9/_?=&#.-]*$' and char_length(link) <= 200)),
  popup boolean not null default true,     -- also show it as a popup to everyone who hasn't seen it
  active boolean not null default true,
  created_by uuid references public.players(id) on delete set null,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists announcements_published on public.announcements (published_at desc) where active;
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;

create table if not exists public.announcement_reads (
  player_id uuid primary key references public.players(id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.announcement_reads enable row level security;
revoke all on public.announcement_reads from anon, authenticated;

create or replace function private.announcement_json(a public.announcements, p_seen timestamptz) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'kind', a.kind, 'link', a.link,
                            'popup', a.popup, 'published_at', a.published_at,
                            'unread', p_seen is null or a.published_at > p_seen)
$$;

-- Everyone (signed in or not) sees the active updates; signed-in players also learn which are new to them.
create or replace function public.announcements_list(p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_seen timestamptz; v_rows jsonb;
begin
  if v_uid is not null then
    select seen_at into v_seen from public.announcement_reads where player_id = v_uid;
    -- a brand-new player isn't greeted with the whole history: only updates from after they joined count as new
    if v_seen is null then select created_at into v_seen from public.players where id = v_uid; end if;
  else
    v_seen := now();
  end if;
  select coalesce(jsonb_agg(private.announcement_json(a, v_seen) order by a.published_at desc), '[]'::jsonb) into v_rows
  from (select * from public.announcements where active and published_at <= now()
        order by published_at desc limit least(greatest(coalesce(p_limit, 20), 1), 50)) a;
  return jsonb_build_object('items', v_rows, 'seen_at', v_seen,
    'unread', (select count(*) from public.announcements where active and published_at <= now() and published_at > coalesce(v_seen, now())));
end $$;

create or replace function public.mark_announcements_seen() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  insert into public.announcement_reads (player_id, seen_at) values (v_uid, now())
  on conflict (player_id) do update set seen_at = now();
  return jsonb_build_object('ok', true, 'seen_at', now());
end $$;

create or replace function public.admin_announcement_save(
  p_id uuid, p_title text, p_body text, p_kind text default 'update', p_link text default null,
  p_popup boolean default true, p_active boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support']); v_row public.announcements%rowtype;
begin
  if p_id is null then
    insert into public.announcements (title, body, kind, link, popup, active, created_by)
    values (btrim(p_title), btrim(p_body), coalesce(p_kind, 'update'), nullif(btrim(coalesce(p_link, '')), ''), coalesce(p_popup, true), coalesce(p_active, true), v_uid)
    returning * into v_row;
  else
    update public.announcements
       set title = btrim(p_title), body = btrim(p_body), kind = coalesce(p_kind, kind),
           link = nullif(btrim(coalesce(p_link, '')), ''), popup = coalesce(p_popup, popup), active = coalesce(p_active, active), updated_at = now()
     where id = p_id returning * into v_row;
    if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  end if;
  perform private.audit(case when p_id is null then 'announcement.create' else 'announcement.update' end, 'announcement', v_row.id::text,
                        jsonb_build_object('title', v_row.title, 'active', v_row.active));
  return private.announcement_json(v_row, null) || jsonb_build_object('active', v_row.active);
end $$;

create or replace function public.admin_announcement_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support']);
begin
  delete from public.announcements where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.audit('announcement.delete', 'announcement', p_id::text);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_announcements() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support']);
begin
  return (select coalesce(jsonb_agg(private.announcement_json(a, null) || jsonb_build_object('active', a.active,
            'author', case when a.created_by is not null then private.profile_json(a.created_by) end) order by a.published_at desc), '[]'::jsonb)
          from public.announcements a);
end $$;

-- ===== 2. Support tickets =========================================================
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  subject text not null check (char_length(subject) between 3 and 120),
  category text not null default 'other' check (category in ('account', 'bug', 'payments', 'minigames', 'art', 'report', 'copyright', 'privacy', 'other')),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  player_seen_at timestamptz not null default now(),
  staff_seen_at timestamptz,
  last_message_at timestamptz not null default now(),
  last_staff_reply_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists support_tickets_player on public.support_tickets (player_id, last_message_at desc);
create index if not exists support_tickets_status on public.support_tickets (status, last_message_at desc);
alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from anon, authenticated;

create table if not exists public.support_messages (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid references public.players(id) on delete set null,
  is_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket on public.support_messages (ticket_id, id);
alter table public.support_messages enable row level security;
revoke all on public.support_messages from anon, authenticated;

create or replace function private.is_support_staff(p_uid uuid) returns boolean
language sql stable as $$ select private.has_role(p_uid, array['support', 'moderator']) $$;

create or replace function private.ticket_json(t public.support_tickets, p_staff boolean) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', t.id, 'subject', t.subject, 'category', t.category, 'status', t.status,
    'created_at', t.created_at, 'last_message_at', t.last_message_at,
    'unread', case when p_staff then t.staff_seen_at is null or t.last_message_at > t.staff_seen_at
                   else t.last_staff_reply_at is not null and t.last_staff_reply_at > t.player_seen_at end,
    'messages', (select count(*) from public.support_messages m where m.ticket_id = t.id))
  || case when p_staff then jsonb_build_object('player', private.profile_json(t.player_id)) else '{}'::jsonb end
$$;

create or replace function public.support_create(p_subject text, p_category text, p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_t public.support_tickets%rowtype;
begin
  perform private.rate_limit('support_create', 8, 86400);
  if char_length(btrim(coalesce(p_body, ''))) < 5 then raise exception 'message_too_short' using errcode = 'P0001'; end if;
  insert into public.support_tickets (player_id, subject, category) values (v_uid, btrim(p_subject), coalesce(p_category, 'other'))
  returning * into v_t;
  insert into public.support_messages (ticket_id, author_id, is_staff, body) values (v_t.id, v_uid, false, btrim(p_body));
  return private.ticket_json(v_t, false);
end $$;

create or replace function public.support_my_tickets() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return (select coalesce(jsonb_agg(private.ticket_json(t, false) order by t.last_message_at desc), '[]'::jsonb)
          from (select * from public.support_tickets where player_id = v_uid order by last_message_at desc limit 50) t);
end $$;

-- One ticket's thread, for its player or support staff. Opening it marks it read for that side.
create or replace function public.support_ticket(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_t public.support_tickets%rowtype; v_staff boolean;
begin
  select * into v_t from public.support_tickets where id = p_id;
  v_staff := private.is_support_staff(v_uid);
  if not found or v_uid is null or (v_t.player_id <> v_uid and not v_staff) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_t.player_id = v_uid then update public.support_tickets set player_seen_at = now() where id = p_id;
  else update public.support_tickets set staff_seen_at = now() where id = p_id; end if;
  return private.ticket_json(v_t, v_staff and v_t.player_id <> v_uid) || jsonb_build_object(
    'thread', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'body', m.body, 'is_staff', m.is_staff, 'created_at', m.created_at,
                 'author', case when m.is_staff then jsonb_build_object('display_name', 'LANDVAS Support')
                                else private.profile_json(m.author_id) end) order by m.id), '[]'::jsonb)
               from public.support_messages m where m.ticket_id = p_id));
end $$;

create or replace function public.support_reply(p_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_t public.support_tickets%rowtype; v_staff boolean; v_mine boolean;
begin
  perform private.rate_limit('support_reply', 60, 3600);
  select * into v_t from public.support_tickets where id = p_id for update;
  v_mine := found and v_t.player_id = v_uid;
  v_staff := found and not v_mine and private.is_support_staff(v_uid);
  if not (v_mine or v_staff) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 then raise exception 'message_too_short' using errcode = 'P0001'; end if;
  insert into public.support_messages (ticket_id, author_id, is_staff, body) values (p_id, v_uid, v_staff, btrim(p_body));
  update public.support_tickets
     set status = case when v_staff then 'answered' else 'open' end,
         last_message_at = now(),
         last_staff_reply_at = case when v_staff then now() else last_staff_reply_at end,
         staff_seen_at = case when v_staff then now() else staff_seen_at end,
         player_seen_at = case when v_mine then now() else player_seen_at end
   where id = p_id returning * into v_t;
  if v_staff then perform private.audit('support.reply', 'support_ticket', p_id::text); end if;
  return private.ticket_json(v_t, v_staff);
end $$;

create or replace function public.support_set_status(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_t public.support_tickets%rowtype; v_staff boolean;
begin
  select * into v_t from public.support_tickets where id = p_id for update;
  v_staff := private.is_support_staff(v_uid);
  if not found or (v_t.player_id <> v_uid and not v_staff) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_status not in ('open', 'closed') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  update public.support_tickets set status = p_status where id = p_id returning * into v_t;
  return private.ticket_json(v_t, v_staff and v_t.player_id <> v_uid);
end $$;

create or replace function public.admin_support_tickets(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['support', 'moderator']);
begin
  return jsonb_build_object(
    'tickets', (select coalesce(jsonb_agg(private.ticket_json(t, true) order by (t.status = 'open') desc, t.last_message_at desc), '[]'::jsonb)
                from (select * from public.support_tickets where p_status is null or status = p_status
                      order by (status = 'open') desc, last_message_at desc limit 200) t),
    'counts', (select jsonb_build_object('open', count(*) filter (where status = 'open'),
                                         'answered', count(*) filter (where status = 'answered'),
                                         'closed', count(*) filter (where status = 'closed')) from public.support_tickets));
end $$;

-- ===== 3. The bell: what's new for me ============================================
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
    'open_tickets_staff', case when private.is_support_staff(v_uid) then (select count(*) from public.support_tickets where status = 'open') else null end);
end $$;

-- ===== 4. Grants ==================================================================
revoke all on function private.announcement_json(public.announcements, timestamptz) from public;
revoke all on function private.ticket_json(public.support_tickets, boolean) from public;
revoke all on function private.is_support_staff(uuid) from public;
revoke all on function public.announcements_list(int) from public;
grant execute on function public.announcements_list(int) to anon, authenticated, service_role;
revoke all on function public.my_notifications() from public;
grant execute on function public.my_notifications() to anon, authenticated, service_role;
do $$
declare f text;
begin
  foreach f in array array[
    'public.mark_announcements_seen()',
    'public.admin_announcement_save(uuid, text, text, text, text, boolean, boolean)',
    'public.admin_announcement_delete(uuid)', 'public.admin_announcements()',
    'public.support_create(text, text, text)', 'public.support_my_tickets()', 'public.support_ticket(uuid)',
    'public.support_reply(uuid, text)', 'public.support_set_status(uuid, text)', 'public.admin_support_tickets(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
