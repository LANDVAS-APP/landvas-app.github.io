-- v0.47 Switching what a plot is (Art Canvas, Inkborn Habitat, Farm…) costs a small Ink fee. Choosing for a
-- brand-new plot is still free (the first few minutes after it's claimed), and nothing already set changes.

insert into public.game_config (key, value, description) values ('plot_switch', '{"fee": 20, "free_minutes": 15}',
  'Switching a plot''s type: the Ink fee, and how long after claiming a plot its first choice is free.')
on conflict (key) do nothing;
alter table public.canvas_groups add column if not exists kind_changed_at timestamptz;

create or replace function public.set_group_kind(p_group_id uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.canvas_groups%rowtype; h public.habitats%rowtype; v_starter uuid; v_fee int := 0;
begin
  perform private.rate_limit('set_group_kind', 60, 3600);
  select * into g from public.canvas_groups where id = p_group_id for update;
  if not found or g.owner_id <> v_uid or g.status <> 'active' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.plot_kinds where id = p_kind and enabled) then raise exception 'invalid_plot_kind' using errcode = 'P0001'; end if;
  if g.kind = p_kind then return private.group_json(g.id); end if;
  -- choosing what a brand-new plot becomes is free; after that, switching costs a little Ink
  if g.kind_changed_at is not null or g.created_at < now() - make_interval(mins => coalesce((private.cfg('plot_switch') ->> 'free_minutes')::int, 15)) then
    v_fee := coalesce((private.cfg('plot_switch') ->> 'fee')::int, 20);
    if v_fee > 0 then perform private.charge(v_uid, jsonb_build_object('ink', v_fee), 'plot_switch', 'group', g.id::text, 'plot-switch:' || g.id || ':' || gen_random_uuid()); end if;
  end if;
  if exists (select 1 from public.artwork_publications where group_id = g.id and status in ('processing', 'pending_review', 'approved', 'uploading')) then
    raise exception 'publication_in_progress' using errcode = 'P0001';
  end if;
  select * into h from public.habitats where group_id = g.id;
  if p_kind = 'farm' then
    insert into public.farms (owner_id, group_id) values (v_uid, g.id) on conflict (group_id) do update set owner_id = excluded.owner_id;
  end if;
  if p_kind = 'habitat' then
    if h.id is null then insert into public.habitats (owner_id, group_id, kind) values (v_uid, g.id, 'plot') returning * into h; end if;
    -- creatures that lived here before come home
    update public.inkborn set habitat_id = h.id, prev_habitat_id = null where owner_id = v_uid and prev_habitat_id = h.id;
  elsif h.id is not null then
    -- the habitat (layout + who lived here) is kept; its creatures wait in the starter sanctuary
    v_starter := private.starter_habitat(v_uid);
    update public.inkborn set prev_habitat_id = h.id, habitat_id = v_starter where habitat_id = h.id;
  end if;
  update public.canvas_groups set kind = p_kind, kind_changed_at = now(), updated_at = now() where id = g.id;
  perform private.audit('group.kind', 'group', g.id::text, jsonb_build_object('from', g.kind, 'to', p_kind));
  return private.group_json(g.id) || jsonb_build_object('fee', v_fee, 'balances', private.balances(v_uid));
end $$;
