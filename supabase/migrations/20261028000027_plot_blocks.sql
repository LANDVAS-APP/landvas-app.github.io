-- v0.13: the map draws owned plots as image tiles, fetched in fixed 64x64-plot blocks.
-- Panning only asks for blocks it hasn't seen yet (instead of re-downloading every
-- plot in view after each move), so the map stays smooth however many plots exist.
-- p_blocks: [[bx, by], ...] (max 64; bx = gx >> 6, by = gy >> 6).
-- Returns {"bx_by": [[gx, gy, type, level, is_mine, group_id, has_art, username, accent, rarity, name], ...]}.
create or replace function public.plot_blocks(p_blocks jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_res jsonb;
begin
  if jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) > 64 then
    raise exception 'too_many_blocks' using errcode = 'P0001';
  end if;
  with req as (
    select distinct (b ->> 0)::int as bx, (b ->> 1)::int as by
    from jsonb_array_elements(p_blocks) b
    where (b ->> 0)::int between 0 and 65535 and (b ->> 1)::int between 0 and 65535
  )
  select coalesce(jsonb_object_agg(r.bx || '_' || r.by, coalesce(rows, '[]'::jsonb)), '{}'::jsonb) into v_res
  from req r
  left join lateral (
    select jsonb_agg(jsonb_build_array(p.gx, p.gy, p.plot_type, p.level, p.owner_id = v_uid, m.group_id,
                                       p.art_rev is not null, pr.username, pr.accent_color, p.rarity, p.name)) as rows
    from public.world_plots p
    left join public.canvas_group_members m on m.gx = p.gx and m.gy = p.gy
    left join public.profiles pr on pr.id = p.owner_id
    where p.bx = r.bx and p.by = r.by and p.owner_id is not null
  ) x on true;
  return v_res;
end $$;
revoke all on function public.plot_blocks(jsonb) from public;
grant execute on function public.plot_blocks(jsonb) to anon, authenticated, service_role;
