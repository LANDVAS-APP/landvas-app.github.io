-- 🪞 Every Mirror Shard reflection works — the Glyphcaster's drawing, the Fated Deck's cards, the Spyglass's looks, the
-- Pocket Sun's throw, the Clockwork's Toll and Rewind, the Genie's star wishes.
--
-- What was wrong: a reflection acts on a stand-in (the shard's row with the reflected kind and the reflected state,
-- private.ench_reflected), but several kinds save their state part-way through an action straight to the row by id
-- (`update … set state = s where id = e.id`, then read it back) — on a shard that wrote the reflected kind's state over
-- the shard's own (its reflection, cracks and options), so the app kept those actions switched off on reflections.
-- Now, while a reflection acts, the shard's row holds the reflected state; whatever the action writes and reads back
-- by id is the reflection's, and afterwards the shard's own state comes back with the new reflected state inside it.
--
-- Reflected suns also get what real suns get from the heartbeat (orbit warmth, a supernova) and their sunspots.
-- And every shard reflecting a kind whose actions were switched off gets its charges back and a fresh 24 hours.

-- ---- a reflection acts on its own state ------------------------------------------------------------------------------
select private.fn_patch('public.enchant_act(uuid,text,jsonb)',
  $a$    v_kind := x.kind;
    v := case x.kind$a$,
  $b$    v_kind := x.kind;
    -- (the shard's row holds the reflected state while the reflection acts — see the top of this migration)
    update public.enchantments set state = coalesce(x.state, '{}'::jsonb) where id = e.id;
    v := case x.kind$b$);
select private.fn_patch('public.enchant_act(uuid,text,jsonb)',
  $a$    if v is null then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    update public.enchantments set state = state || jsonb_build_object('r', v -> 'state'), updated_at = now() where id = e.id;$a$,
  $b$    if v is null then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    -- (the shard's own state comes back, with the reflection's new state inside it)
    update public.enchantments set state = e.state || jsonb_build_object('r', v -> 'state'), updated_at = now() where id = e.id;$b$);

-- ---- reflected suns ---------------------------------------------------------------------------------------------------
/** a sun's zones, real or reflected */
create or replace function private.sun_zones_of(s jsonb, p_kind text) returns jsonb language sql immutable as $$
  select coalesce(case when p_kind = 'sun' then s -> 'zones' else s -> 'r' -> 'zones' end, '[]'::jsonb)
$$;
/** the same state with its zones replaced, real or reflected */
create or replace function private.sun_zones_put(s jsonb, p_kind text, zs jsonb) returns jsonb language sql immutable as $$
  select case when p_kind = 'sun' then s || jsonb_build_object('zones', zs)
              else s || jsonb_build_object('r', coalesce(s -> 'r', '{}'::jsonb) || jsonb_build_object('zones', zs)) end
$$;
/** is this a sun (or a shard reflecting one right now)? */
create or replace function private.sun_like(e public.enchantments) returns boolean language sql stable as $$
  select e.status = 'active' and (e.kind = 'sun' or (e.kind = 'shard' and e.state -> 'reflect' ->> 'kind' = 'sun'
         and coalesce((e.state -> 'reflect' ->> 'until')::numeric, 0) > extract(epoch from now())))
$$;

create or replace function private.sun_spot_take(p_uid uuid, p_gx integer, p_gy integer) returns boolean language plpgsql as $$
declare e public.enchantments; v_ep numeric := extract(epoch from now()); v_found boolean := false; zs jsonb;
begin
  for e in select x.* from public.enchantments x where x.owner_id = p_uid and x.kind in ('sun', 'shard') and private.sun_like(x)
            and private.sun_zones_of(x.state, x.kind) @> jsonb_build_array(jsonb_build_object('spots', jsonb_build_array(jsonb_build_array(p_gx, p_gy)))) for update loop
    select coalesce(jsonb_agg(case when (private.sun_zone(z, v_ep) ->> 'alive')::boolean and z -> 'spots' @> jsonb_build_array(jsonb_build_array(p_gx, p_gy))
                                   then z || jsonb_build_object('spots', coalesce((select jsonb_agg(c) from jsonb_array_elements(z -> 'spots') c where c <> jsonb_build_array(p_gx, p_gy)), '[]'::jsonb))
                                   else z end), '[]'::jsonb),
           bool_or((private.sun_zone(z, v_ep) ->> 'alive')::boolean and z -> 'spots' @> jsonb_build_array(jsonb_build_array(p_gx, p_gy)))
      into zs, v_found from jsonb_array_elements(private.sun_zones_of(e.state, e.kind)) z;
    if v_found then
      update public.enchantments set state = private.sun_zones_put(state, kind, zs) where id = e.id;
      perform private.ench_stat(e.id, 'sunspots');
      perform private.fairplay(p_uid, 'sun_spot', p_gx, p_gy, jsonb_build_object('sun', e.id));
      return true;
    end if;
  end loop;
  return false;
end $$;

create or replace function private.sun_warm_tick() returns void language plpgsql as $$
declare r public.enchantments; v_ep numeric := extract(epoch from now()); v_dt numeric; zs jsonb; z jsonb; i int; v_cells int;
begin
  for r in select e.* from public.enchantments e where e.kind in ('sun', 'shard') and e.status = 'active' and e.owner_id is not null and private.sun_like(e)
             and private.sun_zones_of(e.state, e.kind) @? '$[*] ? (@.mode == "orbit")' limit 2000 loop
    zs := private.sun_zones_of(r.state, r.kind);
    for i in 0 .. jsonb_array_length(zs) - 1 loop
      z := private.sun_zone(zs -> i, v_ep);
      continue when z ->> 'mode' <> 'orbit' or not (z ->> 'alive')::boolean;
      v_dt := least(600, greatest(0, v_ep - coalesce((z ->> 'warm_at')::numeric, v_ep)));
      continue when v_dt < 30;
      v_cells := ceil((z ->> 'r_m')::numeric / 3)::int + 2;
      update public.enchantments x set clock_skip = clock_skip + private.ench_n('sun', 'orbit_tick', 0.1) * v_dt
       where x.owner_id = r.owner_id and x.status = 'active' and x.id <> r.id
         and x.gx between (z ->> 'gx')::int - v_cells and (z ->> 'gx')::int + v_cells and x.gy between (z ->> 'gy')::int - v_cells and (z ->> 'gy')::int + v_cells
         and private.ench_cell_m(x.gx, x.gy, (z ->> 'gx')::int, (z ->> 'gy')::int) <= (z ->> 'r_m')::numeric;
      zs := jsonb_set(zs, array[i::text, 'warm_at'], to_jsonb(v_ep));
    end loop;
    update public.enchantments set state = private.sun_zones_put(state, kind, zs) where id = r.id;
  end loop;
end $$;

create or replace function private.sun_nova_tick() returns void language plpgsql as $$
declare e public.enchantments; zs jsonb; z jsonb; v_ep numeric := extract(epoch from now()); v_i int; v_new boolean;
begin
  for e in select x.* from public.enchantments x
            where x.kind in ('sun', 'shard') and private.sun_like(x) and private.sun_zones_of(x.state, x.kind) @> '[{"nova": true}]'::jsonb for update skip locked loop
    zs := private.sun_zones_of(e.state, e.kind); v_new := false;
    for v_i in 0 .. jsonb_array_length(zs) - 1 loop
      z := private.sun_zone(zs -> v_i, v_ep);
      if z ->> 'tier' = 'nova' and not coalesce((zs -> v_i ->> 'nova_seen')::boolean, false) then
        zs := jsonb_set(zs, array[v_i::text], (zs -> v_i) || jsonb_build_object('nova_seen', true, 'nova_from', (z ->> 'nova_from')::numeric));
        v_new := true;
        perform private.ench_stat(e.id, 'novas');
        perform private.ench_event(e.id, 'nova', jsonb_build_object('i', zs -> v_i -> 'i', 'gx', z -> 'gx', 'gy', z -> 'gy', 'r', z -> 'r_m'));
        perform private.notify(e.owner_id, 'enchant', null, jsonb_build_object('sub', 'sun_nova', 'kind', 'sun', 'gx', z -> 'gx', 'gy', z -> 'gy'));
        insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'supernova', 'kind', 'sun', 'serial', e.serial));
      end if;
    end loop;
    if v_new then update public.enchantments set state = private.sun_zones_put(state, kind, zs), updated_at = now() where id = e.id; end if;
  end loop;
end $$;

-- ---- the reflections that couldn't act: their charges back, and a fresh 24 hours ------------------------------------
-- (Glyphcaster mana and today's study, Fated Deck picks, Spyglass looks, the Clockwork's
--  rewinds today — and the reflection runs a full day from now; mirrored suns were given back in 410)
update public.enchantments
   set state = state || jsonb_build_object(
         'reflect', (state -> 'reflect') || jsonb_build_object('until', greatest((state -> 'reflect' ->> 'until')::numeric, extract(epoch from now()) + 86400)),
         'r', coalesce(state -> 'r', '{}'::jsonb) - 'mana' - 'mana_at' - 'study_day' - 'picked' - 'flipped' - 'pending' - 'looks' - 'look_at' - 'lit' - 'day'),
       updated_at = now()
 where kind = 'shard' and status = 'active'
   and state -> 'reflect' ->> 'kind' in ('glyph', 'deck', 'spyglass', 'clockwork', 'genie')
   and coalesce((state -> 'reflect' ->> 'until')::numeric, 0) > extract(epoch from now());
