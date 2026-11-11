-- v1.0: only Art plots (art canvases, and the canvas Estates / Domains they merge into) can be painted.
-- A Base plot, a farm, an arcade, a home… keeps any art it already had, but can't save or publish new art.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.save_draft(uuid,uuid,jsonb,text,text,boolean)'::regprocedure);
  n := replace(d, $a$  if v_proj.status <> 'active' then raise exception 'project_archived' using errcode = 'P0001'; end if;$a$,
    $a$  if v_proj.status <> 'active' then raise exception 'project_archived' using errcode = 'P0001'; end if;
  if (select private.kind_family(kind) from public.canvas_groups where id = v_proj.group_id) not in ('canvas', 'habitat') then -- (habitats say so themselves)
    raise exception 'not_a_canvas' using errcode = 'P0001';
  end if;$a$);
  if n = d then raise exception 'paint art plots only: save_draft anchor not found'; end if;
  execute n;

  d := pg_get_functiondef('public.request_publication(uuid,uuid,text,text,boolean)'::regprocedure);
  n := replace(d, $a$  select * into v_ver from public.artwork_versions where id = p_version_id and project_id = p_project_id;$a$,
    $a$  if private.kind_family(v_group.kind) not in ('canvas', 'habitat') then raise exception 'not_a_canvas' using errcode = 'P0001'; end if;
  select * into v_ver from public.artwork_versions where id = p_version_id and project_id = p_project_id;$a$);
  if n = d then raise exception 'paint art plots only: request_publication anchor not found'; end if;
  execute n;
end $$;
