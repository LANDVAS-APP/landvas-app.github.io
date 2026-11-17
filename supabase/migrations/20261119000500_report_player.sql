-- Report a player (App Store guideline 1.2: every kind of player content can be reported, not just chat lines and art).
-- Covers what a player puts on show that isn't a single chat message or artwork: their name, picture, bio, plot names,
-- Inkborn, home, clan or party names, and how they behave (harassment, cheating, spam). Lands in the moderation queue
-- (admin.landvas.app) like the other reports. One open report per reporter and player; 20 an hour.

create or replace function public.report_player(p_player_id uuid, p_reason text, p_details text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.rate_limit('report', 20, 3600);
  if p_player_id is null or p_player_id = v_uid then raise exception 'cannot_report_self' using errcode = 'P0001'; end if;
  if p_reason not in ('name', 'picture', 'content', 'harassment', 'cheating', 'spam', 'personal_info', 'other') then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.players where id = p_player_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  -- already reported by you and still open: nothing new to add
  if exists (select 1 from public.moderation_cases c where c.kind = 'report' and c.status = 'open' and c.reporter_id = v_uid
             and c.subject_player_id = p_player_id and c.reason = 'player_' || p_reason) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  insert into public.moderation_cases (kind, priority, subject_player_id, reporter_id, reason, details)
  values ('report', case when p_reason in ('harassment', 'personal_info') then 1 else 2 end, p_player_id, v_uid,
          'player_' || p_reason, jsonb_build_object('details', left(coalesce(p_details, ''), 1000),
            'username', (select username from public.profiles where id = p_player_id)));
  return jsonb_build_object('ok', true);
end $$;

do $$ begin
  revoke all on function public.report_player(uuid, text, text) from public, anon;
  grant execute on function public.report_player(uuid, text, text) to authenticated, service_role;
end $$;
