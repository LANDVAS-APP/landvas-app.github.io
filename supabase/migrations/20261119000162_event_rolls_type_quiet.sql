-- Event rolls: choose the plot's minigame type too, and keep them quiet — a granted pull never goes on the live feed
-- (no claim, Crown or Luck-pick post). The player just sees their own roll like any other.

alter table private.granted_rolls add column if not exists plot_type text references public.plot_types (id);
create index if not exists granted_rolls_type on private.granted_rolls (plot_type) where plot_type is not null;

-- the Luck-claim kind remembers its plot type for take_plot
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.luck_roll(uuid,integer,integer,text)'::regprocedure);
  n := replace(d, $a$perform set_config('landvas.luck_grant', g.rarity || ':' || case when g.shiny then 't' else 'f' end, true);$a$,
    $a$perform set_config('landvas.luck_grant', g.rarity || ':' || case when g.shiny then 't' else 'f' end || ':' || coalesce(g.plot_type, ''), true);$a$);
  if n = d then raise exception 'event rolls: luck_roll anchor not found'; end if;
  execute n;
end $$;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.take_plot(uuid,integer,integer,text,jsonb)'::regprocedure);
  n := replace(d, 'v_lg text; v_granted boolean := false;', 'v_lg text; v_granted boolean := false; v_gt text;');
  n := replace(n, $a$  v_granted := (v_grant.id is not null and v_rarity = v_grant.rarity) or (v_lg is not null and split_part(v_lg, ':', 1) = v_rarity);$a$,
    $a$  v_granted := (v_grant.id is not null and v_rarity = v_grant.rarity) or (v_lg is not null and split_part(v_lg, ':', 1) = v_rarity);
  if v_granted then
    v_gt := case when v_grant.id is not null and v_rarity = v_grant.rarity then v_grant.plot_type else nullif(split_part(v_lg, ':', 3), '') end;
    if v_gt is not null then v_type := v_gt; end if;
  end if;
  -- event rolls stay quiet: nothing on the live feed for this claim
  perform set_config('landvas.quiet_claim', case when v_granted then '1' else '' end, true);$a$);
  n := replace(n, $a$       set owner_id = p_uid, claimed_at = now(), level = 1, $a$, $a$       set owner_id = p_uid, claimed_at = now(), level = 1, plot_type = coalesce(v_gt, plot_type), $a$);
  if position('v_gt := case' in n) = 0 or position('plot_type = coalesce(v_gt, plot_type)' in n) = 0 then raise exception 'event rolls: take_plot anchors not found'; end if;
  execute n;
end $$;

-- the live feed skips quiet claims
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.feed_claim_trg()'::regprocedure);
  n := replace(d, $a$  if new.method in ('starter', 'acquire', 'purchase') then$a$,
    $a$  if new.method in ('starter', 'acquire', 'purchase') and coalesce(current_setting('landvas.quiet_claim', true), '') <> '1' then$a$);
  if n = d then raise exception 'event rolls: feed_claim_trg anchor not found'; end if;
  execute n;
  -- and a pick from a granted Luck claim isn't posted either
  d := pg_get_functiondef('public.luck_pick(integer,integer,integer)'::regprocedure);
  n := replace(d, $a$  insert into public.feed_events (kind, player_id, data) values ('luck', v_uid, jsonb_build_object('sub', 'pick', 'rarity', v_r, 'of', v_n));$a$,
    $a$  if not exists (select 1 from private.granted_rolls where player_id = v_uid and used_gx = p_gx and used_gy = p_gy and used_at > l.created_at - interval '1 minute') then
    insert into public.feed_events (kind, player_id, data) values ('luck', v_uid, jsonb_build_object('sub', 'pick', 'rarity', v_r, 'of', v_n));
  end if;$a$);
  if n = d then raise exception 'event rolls: luck_pick anchor not found'; end if;
  execute n;
end $$;

-- admin: the plot type
drop function if exists public.admin_grant_roll(uuid, text, integer, integer, boolean, text, text, integer);
create or replace function public.admin_grant_roll(p_player uuid, p_rarity text, p_after int default 1, p_count int default 1, p_shiny boolean default false,
  p_note text default null, p_mode text default 'claim', p_slot int default null, p_plot_type text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); v_base int; i int;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.players where id = p_player) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.plot_rarities where id = p_rarity) then raise exception 'invalid_rarity' using errcode = 'P0001'; end if;
  if p_plot_type is not null and not exists (select 1 from public.plot_types where id = p_plot_type) then raise exception 'invalid_plot_type' using errcode = 'P0001'; end if;
  if coalesce(p_mode, 'claim') not in ('claim', 'luck') then raise exception 'invalid_mode' using errcode = 'P0001'; end if;
  if p_after is null or p_after not between 1 and 100000 or p_count is null or p_count not between 1 and 1000 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if p_slot is not null and p_slot not between 1 and 6 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  v_base := private.roll_count(p_player);
  for i in 0 .. p_count - 1 loop
    insert into private.granted_rolls (player_id, rarity, shiny, at_roll, note, created_by, mode, slot, plot_type)
    values (p_player, p_rarity, coalesce(p_shiny, false), case when p_mode = 'luck' then 0 else v_base + p_after + i end, left(p_note, 300), v_uid, coalesce(p_mode, 'claim'),
            case when p_mode = 'luck' then p_slot end, p_plot_type);
  end loop;
  perform private.audit('rolls.grant', 'player', p_player::text, jsonb_build_object('rarity', p_rarity, 'after', p_after, 'count', p_count, 'shiny', p_shiny, 'note', p_note,
    'mode', coalesce(p_mode, 'claim'), 'slot', p_slot, 'plot_type', p_plot_type));
  return public.admin_roll_grants(p_player);
end $$;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_roll_grants(uuid)'::regprocedure);
  n := replace(d, $a$'mode', g.mode, 'slot', g.slot,$a$, $a$'mode', g.mode, 'slot', g.slot, 'plot_type', g.plot_type,$a$);
  if n = d then raise exception 'event rolls: admin_roll_grants anchor not found'; end if;
  execute n;
  execute 'revoke all on function public.admin_grant_roll(uuid, text, integer, integer, boolean, text, text, integer, text) from public, anon';
  execute 'grant execute on function public.admin_grant_roll(uuid, text, integer, integer, boolean, text, text, integer, text) to authenticated';
end $$;
