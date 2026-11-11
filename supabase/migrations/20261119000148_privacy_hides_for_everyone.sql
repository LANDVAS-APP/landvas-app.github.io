-- Privacy that actually hides: anything you switch off disappears from the live feed for everyone — you included —
-- and that covers all your past posts too (the feed is filtered when it's read, so switching back on brings them back).
-- Changing a switch also nudges every open feed to look again, so it's gone from screens right away.

create or replace function public.feed_recent(p_after_id bigint default null, p_before_id bigint default null, p_limit int default 40) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'created_at', e.created_at,
                                        'data', case when e.kind = 'exploring' then e.data || private.room_json(e.player_id, e.data ->> 'world') else e.data end,
                                        'player', private.profile_json(e.player_id)) order by e.id desc)
    from (select f.* from public.feed_events f join public.profiles pr on pr.id = f.player_id
          where (p_after_id is null or f.id > p_after_id) and (p_before_id is null or f.id < p_before_id)
            and private.visible_to(f.player_id, v_uid)
            and private.feed_shown(pr.privacy, f.kind, f.data)
            and (f.kind <> 'publish' or exists (select 1 from public.artwork_publications a
                                                where a.id = (f.data ->> 'publication_id')::uuid and a.status = 'published'))
          order by f.id desc limit least(greatest(coalesce(p_limit, 40), 1), 100)) e), '[]'::jsonb);
end $$;

create or replace function public.set_privacy(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_clean jsonb;
begin
  select coalesce(jsonb_object_agg(k, (p_patch ->> k)::boolean), '{}'::jsonb) into v_clean
  from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) k
  where k = any (private.privacy_keys()) and jsonb_typeof(p_patch -> k) = 'boolean';
  update public.profiles set privacy = privacy || v_clean where id = v_uid;
  -- every open feed looks again (and drops what's now hidden)
  begin
    perform private.push(array['feed'], 'feed');
  exception when others then null; -- a push is only a hint
  end;
  return private.privacy_json(v_uid);
end $$;
