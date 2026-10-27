-- Artwork review switch for the operator.
--   reviews ON  (moderation.mode = 'manual'): every artwork waits in the review queue
--   reviews OFF (moderation.mode = 'auto'):   every artwork goes live after automated checks
-- Switching reviews off also publishes everything that is waiting.

-- Owners and admins may approve their own artwork (there may be nobody else to ask);
-- moderators still cannot review their own work.
create or replace function public.admin_review_publication(p_publication_id uuid, p_decision text, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']); v_pub public.artwork_publications%rowtype;
begin
  select * into v_pub from public.artwork_publications where id = p_publication_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_pub.status not in ('pending_review', 'rejected') then raise exception 'invalid_publication_state' using errcode = 'P0001'; end if;
  if v_pub.owner_id = v_uid and not exists (select 1 from public.admin_roles where player_id = v_uid and role in ('owner', 'admin')) then
    raise exception 'cannot_review_own' using errcode = 'P0001';
  end if;
  if p_decision = 'approve' then
    update public.artwork_publications set status = 'approved', reviewed_by = v_uid, reviewed_at = now(),
           decision_reason = null, updated_at = now() where id = p_publication_id;
    perform private.enqueue_job('publish_publication', jsonb_build_object('publication_id', p_publication_id));
  elsif p_decision = 'reject' then
    if p_reason is null or char_length(trim(p_reason)) < 4 then raise exception 'reason_required' using errcode = 'P0001'; end if;
    update public.artwork_publications set status = 'rejected', reviewed_by = v_uid, reviewed_at = now(),
           decision_reason = p_reason, updated_at = now() where id = p_publication_id;
  else
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  update public.moderation_cases set status = 'resolved', resolution = p_decision || coalesce(': ' || p_reason, ''),
         resolved_by = v_uid, resolved_at = now()
  where publication_id = p_publication_id and kind in ('review', 'auto_flag', 'appeal') and status = 'open';
  perform private.audit('artwork.review', 'publication', p_publication_id::text, jsonb_build_object('decision', p_decision, 'reason', p_reason));
  return private.publication_json((select a from public.artwork_publications a where a.id = p_publication_id));
end $$;

create or replace function private.approve_all_pending(p_uid uuid, p_note text) returns int
language plpgsql as $$
declare r record; v_n int := 0;
begin
  for r in select id from public.artwork_publications where status = 'pending_review' order by created_at for update loop
    update public.artwork_publications set status = 'approved', reviewed_by = p_uid, reviewed_at = now(),
           decision_reason = null, updated_at = now() where id = r.id;
    perform private.enqueue_job('publish_publication', jsonb_build_object('publication_id', r.id));
    update public.moderation_cases set status = 'resolved', resolution = 'approve: ' || p_note, resolved_by = p_uid, resolved_at = now()
     where publication_id = r.id and kind in ('review', 'appeal') and status = 'open';
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.admin_review_mode() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']); v_mode text := coalesce(private.cfg('moderation') ->> 'mode', 'manual');
begin
  return jsonb_build_object('reviews', v_mode <> 'auto', 'mode', v_mode,
                            'pending', (select count(*) from public.artwork_publications where status = 'pending_review'));
end $$;

create or replace function public.admin_set_review_mode(p_reviews boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']); v_n int := 0; v_mode text := case when p_reviews then 'manual' else 'auto' end;
begin
  update public.game_config set value = jsonb_set(value, '{mode}', to_jsonb(v_mode)), updated_at = now(), updated_by = v_uid
   where key = 'moderation';
  if not p_reviews then v_n := private.approve_all_pending(v_uid, 'reviews turned off'); end if;
  perform private.audit('moderation.review_mode', 'config', 'moderation', jsonb_build_object('reviews', p_reviews, 'auto_approved', v_n));
  return jsonb_build_object('reviews', p_reviews, 'mode', v_mode, 'approved', v_n,
                            'pending', (select count(*) from public.artwork_publications where status = 'pending_review'));
end $$;

create or replace function public.admin_approve_all_pending() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']); v_n int;
begin
  v_n := private.approve_all_pending(v_uid, 'bulk approval');
  perform private.audit('artwork.approve_all', 'publication', '*', jsonb_build_object('approved', v_n));
  return jsonb_build_object('approved', v_n);
end $$;

-- Everything waiting for review, newest last, with what the reviewer needs to decide.
create or replace function public.admin_pending_publications(p_limit int default 60) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']);
begin
  return coalesce((
    select jsonb_agg(private.publication_json(a) || jsonb_build_object(
             'artist', private.profile_json(a.owner_id),
             'artist_strikes', (select strikes from public.players where id = a.owner_id),
             'artist_published', (select count(*) from public.artwork_publications x where x.owner_id = a.owner_id and x.status in ('published', 'superseded')),
             'is_mine', a.owner_id = v_uid) order by a.created_at)
    from (select * from public.artwork_publications where status = 'pending_review' order by created_at limit least(greatest(coalesce(p_limit, 60), 1), 200)) a), '[]'::jsonb);
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.approve_all_pending(uuid, text)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array[
    'public.admin_review_publication(uuid, text, text)', 'public.admin_review_mode()', 'public.admin_set_review_mode(boolean)',
    'public.admin_approve_all_pending()', 'public.admin_pending_publications(int)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon, authenticated', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
