-- v0.12.1: staff (owner, admins, moderators) publish their own art without waiting in the
-- review queue; anything of theirs already waiting goes live now. Players' art still follows
-- the review switch.

create or replace function public.svc_publication_processed(p_publication_id uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pub public.artwork_publications%rowtype; v_mode text := coalesce(private.cfg('moderation') ->> 'mode', 'manual'); v_status text;
begin
  select * into v_pub from public.artwork_publications where id = p_publication_id for update;
  if not found then return null; end if;
  if v_pub.status <> 'processing' then return jsonb_build_object('status', v_pub.status, 'skipped', true); end if;
  if not coalesce((p_result ->> 'ok')::boolean, false) then
    update public.artwork_publications set status = 'rejected', processed_at = now(), updated_at = now(),
           decision_reason = coalesce(p_result ->> 'error', 'The artwork failed validation.')
     where id = p_publication_id;
    return jsonb_build_object('status', 'rejected');
  end if;
  update public.artwork_publications
     set preview_path = p_result ->> 'preview_path', thumb_path = p_result ->> 'thumb_path',
         preview_width = (p_result ->> 'preview_width')::int, preview_height = (p_result ->> 'preview_height')::int,
         color_count = (p_result ->> 'color_count')::int, screening = p_result -> 'screening',
         processed_at = now(), updated_at = now()
   where id = p_publication_id;
  if coalesce((p_result -> 'screening' ->> 'flagged')::boolean, false) then
    v_status := 'rejected';
    update public.artwork_publications set status = v_status,
           decision_reason = 'Automated safety screening flagged this artwork. You can appeal this decision.'
     where id = p_publication_id;
    insert into public.moderation_cases (kind, priority, publication_id, subject_player_id, reason, details)
    values ('auto_flag', 1, p_publication_id, v_pub.owner_id, 'automated_screening', coalesce(p_result -> 'screening', '{}'::jsonb));
  -- staff (owner, admins, moderators) don't need to review their own art
  elsif v_mode = 'auto' or (v_mode = 'screened' and coalesce(p_result -> 'screening' ->> 'provider', 'none') <> 'none')
        or private.has_role(v_pub.owner_id, array['moderator']) then
    v_status := 'approved';
    update public.artwork_publications set status = v_status, reviewed_at = now() where id = p_publication_id;
    perform private.enqueue_job('publish_publication', jsonb_build_object('publication_id', p_publication_id));
  else
    v_status := 'pending_review';
    update public.artwork_publications set status = v_status where id = p_publication_id;
    insert into public.moderation_cases (kind, priority, publication_id, subject_player_id, reason)
    values ('review', 2, p_publication_id, v_pub.owner_id, 'new_publication');
  end if;
  return jsonb_build_object('status', v_status);
end $$;

do $$
declare p record;
begin
  for p in select a.id from public.artwork_publications a
           where a.status = 'pending_review' and private.has_role(a.owner_id, array['moderator']) loop
    update public.artwork_publications set status = 'approved', reviewed_at = now() where id = p.id;
    update public.moderation_cases set status = 'resolved', resolved_at = now()
     where publication_id = p.id and kind = 'review' and status = 'open';
    perform private.enqueue_job('publish_publication', jsonb_build_object('publication_id', p.id));
  end loop;
end $$;
