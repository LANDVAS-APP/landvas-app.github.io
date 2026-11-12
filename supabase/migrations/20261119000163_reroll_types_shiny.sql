-- Luck rerolls roll the whole plot: every roll has its own rarity, minigame type and shiny chance (the same odds as
-- any claim), so you can see and keep the one you want — a shiny, or the minigame you like.

alter table public.luck_choices add column if not exists types jsonb;
alter table public.luck_choices add column if not exists shinies jsonb;
alter table public.luck_choices add column if not exists best int;

create or replace function private.roll_plot_type() returns text language plpgsql volatile as $$
declare v_total int; v_roll int; v_acc int := 0; r record;
begin
  select coalesce(sum(weight), 0) into v_total from public.plot_types where weight > 0;
  if v_total = 0 then return 'graphite'; end if;
  v_roll := floor(random() * v_total)::int;
  for r in select id, weight from public.plot_types where weight > 0 order by sort, id loop
    v_acc := v_acc + r.weight;
    if v_roll < v_acc then return r.id; end if;
  end loop;
  return 'graphite';
end $$;

/** the same shiny chance a claim gets (Hot Zone included) */
create or replace function private.roll_shiny_at(p_gx int, p_gy int) returns boolean language plpgsql volatile as $$
declare c jsonb := private.cfg('shiny'); v_n numeric := greatest(coalesce((c ->> 'one_in')::numeric, 1000), 1);
begin
  if not coalesce((c ->> 'enabled')::boolean, true) then return false; end if;
  if private.in_hot_zone(p_gx, p_gy) then v_n := v_n / coalesce((private.cfg('hot_zones') ->> 'shiny_mult')::numeric, 2); end if;
  return random() < 1 / v_n;
end $$;

create or replace function private.luck_roll(p_uid uuid, p_gx int, p_gy int, p_rarity text) returns text language plpgsql as $$
declare c jsonb := private.cfg('luck'); v_luck int; v_arm int; v_n int; v_used int; v_total int; v_opts jsonb := jsonb_build_array(p_rarity);
  v_types jsonb; v_shiny jsonb; v_best int; v_try text; r record; i int; v_x numeric; v_per int; g private.granted_rolls; v_idx int; v_bt text;
begin
  if not coalesce((c ->> 'enabled')::boolean, true) or p_rarity like 'crown%' then return p_rarity; end if;
  select luck, armed into v_luck, v_arm from public.player_luck where player_id = p_uid for update;
  v_per := greatest(coalesce((c ->> 'points_per_roll')::int, 20), 1);
  v_n := least(floor(coalesce(v_luck, 0)::numeric / v_per)::int, coalesce((c ->> 'max_rolls')::int, 6) - 1, coalesce(v_arm, 0));
  if v_n < 1 then return p_rarity; end if;
  v_used := v_n * v_per;
  update public.player_luck set luck = luck - v_used, armed = 0, lucky_rolls = lucky_rolls + 1, updated_at = now() where player_id = p_uid;
  -- the plot's own roll: its own type (or an event roll's), and a shiny chance like any claim
  v_bt := coalesce(nullif(current_setting('landvas.base_type', true), ''), (select plot_type from public.world_plots where gx = p_gx and gy = p_gy), private.plot_type_for(p_gx, p_gy));
  v_types := jsonb_build_array(v_bt);
  v_shiny := jsonb_build_array(private.roll_shiny_at(p_gx, p_gy));
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  v_x := 1 + v_used::numeric / greatest(coalesce((c ->> 'points_per_ultra_x')::numeric, 10), 1);
  for i in 1 .. v_n loop
    v_try := private.rarity_pick(floor(random() * v_total)::int);
    for r in select id, ppm from public.plot_rarities where ppm > 0 order by ppm loop
      if random() * 1000000 < r.ppm * v_x then v_try := r.id; exit; end if;
    end loop;
    v_opts := v_opts || jsonb_build_array(v_try);
    v_types := v_types || jsonb_build_array(private.roll_plot_type());
    v_shiny := v_shiny || jsonb_build_array(private.roll_shiny_at(p_gx, p_gy));
  end loop;
  -- an event roll waiting for this player's Luck claim
  select * into g from private.granted_rolls where player_id = p_uid and mode = 'luck' and used_at is null and cancelled_at is null
   order by id limit 1 for update skip locked;
  if g.id is not null then
    for i in 0 .. jsonb_array_length(v_opts) - 1 loop
      if g.slot is null or i = least(g.slot, jsonb_array_length(v_opts)) - 1 then
        v_opts := jsonb_set(v_opts, array[i::text], to_jsonb(g.rarity));
        if g.plot_type is not null then v_types := jsonb_set(v_types, array[i::text], to_jsonb(g.plot_type)); end if;
        if g.shiny then v_shiny := jsonb_set(v_shiny, array[i::text], 'true'::jsonb); end if;
      end if;
    end loop;
    update private.granted_rolls set used_at = now(), used_gx = p_gx, used_gy = p_gy where id = g.id;
    perform private.audit('rolls.grant_used', 'player', p_uid::text, jsonb_build_object('grant', g.id, 'rarity', g.rarity, 'gx', p_gx, 'gy', p_gy, 'mode', 'luck', 'slot', g.slot));
    perform set_config('landvas.luck_grant', g.rarity || ':' || case when g.shiny then 't' else 'f' end || ':' || coalesce(g.plot_type, ''), true);
  end if;
  -- the best: rarest, then shiny, then the earliest
  select (o.ord - 1)::int into v_best from jsonb_array_elements_text(v_opts) with ordinality o(r, ord)
   order by private.plot_rarity_rank(o.r) desc, (v_shiny ->> (o.ord - 1)::int)::boolean desc, o.ord limit 1;
  insert into public.luck_choices (player_id, gx, gy, options, types, shinies, best) values (p_uid, p_gx, p_gy, v_opts, v_types, v_shiny, v_best)
  on conflict (player_id, gx, gy) do update set options = excluded.options, types = excluded.types, shinies = excluded.shinies, best = excluded.best, picked = null, created_at = now();
  return v_opts ->> v_best;
end $$;

-- take_plot: tell Luck the plot's own type; after the claim, the best roll's type and shine stick until you choose;
-- the result carries every roll's type and shine
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.take_plot(uuid,integer,integer,text,jsonb)'::regprocedure);
  n := replace(d, $a$    v_lucky := private.luck_roll(p_uid, p_gx, p_gy, v_base);$a$,
    $a$    perform set_config('landvas.base_type', coalesce(v_grant.plot_type, (select plot_type from public.world_plots where gx = p_gx and gy = p_gy and owner_id is null), v_type), true);
    v_lucky := private.luck_roll(p_uid, p_gx, p_gy, v_base);$a$);
  n := replace(n, $a$  insert into public.plot_ownership (gx, gy, player_id, method, cost)$a$,
    $a$  if p_method in ('acquire', 'starter') then
    update public.world_plots p set plot_type = coalesce(l.types ->> l.best, p.plot_type), shiny = coalesce((l.shinies ->> l.best)::boolean, p.shiny)
      from public.luck_choices l
     where p.gx = p_gx and p.gy = p_gy and l.player_id = p_uid and l.gx = p_gx and l.gy = p_gy and l.picked is null and l.created_at = now() and l.types is not null
    returning p.plot_type into v_type;
    v_type := coalesce(v_type, (select plot_type from public.world_plots where gx = p_gx and gy = p_gy));
  end if;
  insert into public.plot_ownership (gx, gy, player_id, method, cost)$a$);
  n := replace(n, $a$'choices', (select options from public.luck_choices where player_id = p_uid and gx = p_gx and gy = p_gy and picked is null and created_at > now() - interval '1 minute'),$a$,
    $a$'choices', (select options from public.luck_choices where player_id = p_uid and gx = p_gx and gy = p_gy and picked is null and created_at > now() - interval '1 minute'),
    'choice_types', (select types from public.luck_choices where player_id = p_uid and gx = p_gx and gy = p_gy and picked is null and created_at > now() - interval '1 minute'),
    'choice_shiny', (select shinies from public.luck_choices where player_id = p_uid and gx = p_gx and gy = p_gy and picked is null and created_at > now() - interval '1 minute'),$a$);
  if position('landvas.base_type' in n) = 0 or position('l.types ->> l.best' in n) = 0 or position('choice_shiny' in n) = 0 then raise exception 'rerolls: take_plot anchors not found'; end if;
  execute n;
end $$;

-- keeping a roll keeps its type and shine too
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.luck_pick(integer,integer,integer)'::regprocedure);
  n := replace(d, $a$  update public.world_plots set rarity = v_r, updated_at = now() where gx = p_gx and gy = p_gy;$a$,
    $a$  update public.world_plots set rarity = v_r, plot_type = coalesce(l.types ->> p_idx, plot_type), shiny = coalesce((l.shinies ->> p_idx)::boolean, shiny), updated_at = now()
   where gx = p_gx and gy = p_gy;$a$);
  n := replace(n, $a$return jsonb_build_object('rarity', v_r, 'usd_per_second', private.plot_rent_rate(v_r, 1),$a$,
    $a$return jsonb_build_object('rarity', v_r, 'plot_type', l.types ->> p_idx, 'shiny', coalesce((l.shinies ->> p_idx)::boolean, false),
                            'usd_per_second', (select private.plot_rate(p, r.usd_per_second) from public.world_plots p join public.plot_rarities r on r.id = p.rarity where p.gx = p_gx and p.gy = p_gy),$a$);
  if position('l.types ->> p_idx, plot_type' in n) = 0 or position($a$'plot_type', l.types ->> p_idx$a$ in n) = 0 then raise exception 'rerolls: luck_pick anchors not found'; end if;
  execute n;
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.roll_plot_type()', 'private.roll_shiny_at(integer, integer)', 'private.luck_roll(uuid, integer, integer, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
