-- Primordial refunds give back the very ultras that were fused: no picking any more.
--
-- A Primordial fused from three ultras was already turned back into the first of them (20261119000270). Now the other
-- two come back too, by themselves:
--   · each comes back on its own spot (the plot the fusion released), if nobody has claimed that spot since;
--   · if someone has, the player's next claim rolls it instead (a granted roll, the same delivery as event prizes).
-- The player gets one alert listing all three. The picker is gone: primordial_refund_choose refuses, and
-- primordial_refund_status never lists anything to pick (older apps call it and simply show nothing).
--
-- Players who already picked are put on the same footing (the owner's call, Nov 16 2026): what they picked is undone
-- and the ultras they fused come back the same way —
--   · the plot that took the first pick turns back into the first ultra;
--   · a pick still waiting for a claim is cancelled;
--   · a pick that already landed on a claim: that plot goes back to its own roll (as if there had been no pick);
--   · a picked plot that has since changed (fused again, released, given away) is left as it is and noted for staff,
--     and that ultra isn't given a second time.

-- ---- bookkeeping ------------------------------------------------------------------------------------------------
alter table public.primordial_refunds drop constraint if exists primordial_refunds_status_check;
alter table public.primordial_refunds add constraint primordial_refunds_status_check check (status in ('open', 'chosen', 'returned', 'void'));
alter table public.primordial_refunds add column if not exists returned jsonb;          -- how each of the three came back
alter table public.primordial_refunds add column if not exists returned_at timestamptz;

-- a plot handed back by a refund
alter table public.plot_ownership drop constraint if exists plot_ownership_method_check;
alter table public.plot_ownership add constraint plot_ownership_method_check
  check (method in ('starter', 'acquire', 'admin_grant', 'purchase', 'unfold', 'chain', 'wander', 'fusion', 'refund'));

-- ---- giving one ultra back ------------------------------------------------------------------------------------------
/** one fused ultra back: onto its own spot if that spot is still free, otherwise onto the player's next claim */
create or replace function private.refund_give(p_uid uuid, p_cell jsonb, p_rarity text, p_ref bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare w public.world_plots; v_gx int := (p_cell ->> 0)::int; v_gy int := (p_cell ->> 1)::int; v_g bigint;
begin
  if v_gx is not null and v_gy is not null then
    select * into w from public.world_plots where gx = v_gx and gy = v_gy for update;
    if w.gx is null or (w.owner_id is null and not coalesce(w.locked, false) and w.rarity not like 'crown%' and w.rarity <> 'enchanted') then
      begin
        perform set_config('landvas.rx_quiet', '1', true);   -- the spot's own roll is replaced at once: never announce it
        perform private.take_plot(p_uid, v_gx, v_gy, 'refund', jsonb_build_object('refund', p_ref));
        update public.world_plots set shiny = false where gx = v_gx and gy = v_gy;   -- no random shiny on a plot coming home
        perform set_config('landvas.rx_quiet', '', true);
        perform private.rx_set_rarity(p_uid, v_gx, v_gy, p_rarity, 'refund');
        perform private.rx_sync(v_gx, v_gy);
        return jsonb_build_object('rarity', p_rarity, 'how', 'plot', 'gx', v_gx, 'gy', v_gy);
      exception when others then
        perform set_config('landvas.rx_quiet', '', true);   -- couldn't take the spot after all: the next claim rolls it
      end;
    end if;
  end if;
  insert into private.granted_rolls (player_id, rarity, at_roll, note)
  values (p_uid, p_rarity, private.roll_count(p_uid) + 1, 'Primordial refund #' || p_ref) returning id into v_g;
  return jsonb_build_object('rarity', p_rarity, 'how', 'claim', 'grant', v_g);
end $$;
revoke all on function private.refund_give(uuid, jsonb, text, bigint) from public;

-- ---- every open or picked refund: the fused ultras come back ------------------------------------------------------
create or replace function private.primordial_refunds_return() returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare f public.primordial_refunds; w public.world_plots; g private.granted_rolls; v_rel jsonb; v_cells jsonb; v_out jsonb; v_notes text[];
        v_orig text; v_pick text; v_n int := 0; i int; v_own text;
begin
  perform set_config('request.jwt.claims', coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}'), true);
  for f in select * from public.primordial_refunds where status in ('open', 'chosen') order by id for update loop
    -- the spots the fusion released (the second and third ultras), as the fair-play log recorded them
    select l.data -> 'released' into v_rel from private.fairplay_log l
     where l.kind = 'rx_fuse' and l.player_id = f.player_id and l.gx = f.gx and l.gy = f.gy and l.at = f.fused_at limit 1;
    v_cells := jsonb_build_array(jsonb_build_array(f.gx, f.gy), coalesce(v_rel -> 0, 'null'::jsonb), coalesce(v_rel -> 1, 'null'::jsonb));
    v_out := '[]'::jsonb; v_notes := '{}';
    perform private.rent_settle(f.player_id);

    if f.status = 'open' then
      -- the first ultra is already back on the plot (it turned back when the refund opened)
      v_out := jsonb_build_array(jsonb_build_object('rarity', f.fused_from ->> 0, 'how', 'plot', 'gx', f.gx, 'gy', f.gy));
      for i in 1 .. 2 loop
        v_out := v_out || jsonb_build_array(private.refund_give(f.player_id, v_cells -> i, f.fused_from ->> i, f.id));
      end loop;
    else
      -- picked already: undo each pick, then give back the ultra that was fused in its place
      for i in 0 .. 2 loop
        v_orig := f.fused_from ->> i; v_pick := f.picks[i + 1];
        -- where the pick went: picks 2 and 3 were granted rolls; pick 1 went on the plot, or (if the plot had left them) a grant too
        g := null;
        if i > 0 then
          select * into g from private.granted_rolls where id = f.grants[i] for update;
        else
          select * into g from private.granted_rolls
           where player_id = f.player_id and note = 'Primordial refund #' || f.id and not (id = any (coalesce(f.grants, '{}'))) order by id limit 1 for update;
        end if;
        if g.id is null then
          -- the first pick went on the plot itself
          select * into w from public.world_plots where gx = f.gx and gy = f.gy for update;
          if w.owner_id = f.player_id and w.rarity = v_pick then
            if v_pick <> v_orig then
              perform private.rx_set_rarity(f.player_id, f.gx, f.gy, v_orig, 'refund');
              perform private.rx_sync(f.gx, f.gy);
            end if;
            v_out := v_out || jsonb_build_array(jsonb_build_object('rarity', v_orig, 'how', 'plot', 'gx', f.gx, 'gy', f.gy, 'was', v_pick));
          else
            v_notes := v_notes || format('pick %s (%s) on the plot has changed (now %s) — left as it is', i + 1, v_pick, coalesce(w.rarity, 'gone'));
          end if;
        elsif g.cancelled_at is not null then
          v_notes := v_notes || format('pick %s (%s) was cancelled by staff — not given back', i + 1, v_pick);
        elsif g.used_at is null then
          -- still waiting for a claim: cancel it, and the fused ultra comes back instead
          update private.granted_rolls set cancelled_at = now(), note = coalesce(note, '') || ' — replaced by the fused ultra' where id = g.id;
          v_out := v_out || jsonb_build_array(private.refund_give(f.player_id, v_cells -> i, v_orig, f.id) || jsonb_build_object('was', v_pick));
        else
          -- it already landed on a claim: that plot goes back to its own roll, and the fused ultra comes back as for everyone
          select * into w from public.world_plots where gx = g.used_gx and gy = g.used_gy for update;
          if w.owner_id = f.player_id and w.rarity = v_pick then
            v_own := private.plot_rarity_for(w.gx, w.gy);
            if v_own like 'crown%' or v_own = 'enchanted' then v_own := 'mythic'; end if;
            perform private.rx_set_rarity(f.player_id, w.gx, w.gy, v_own, 'refund');
            perform private.rx_sync(w.gx, w.gy);
            v_out := v_out || jsonb_build_array(private.refund_give(f.player_id, v_cells -> i, v_orig, f.id)
                                                || jsonb_build_object('was', v_pick, 'undone', jsonb_build_object('gx', w.gx, 'gy', w.gy, 'now', v_own)));
          else
            v_notes := v_notes || format('pick %s (%s) landed on %s,%s, which has changed (now %s) — left as it is', i + 1, v_pick, g.used_gx, g.used_gy, coalesce(w.rarity, 'gone'));
          end if;
        end if;
      end loop;
    end if;

    update public.primordial_refunds
       set status = 'returned', returned = v_out, returned_at = now(),
           note = nullif(concat_ws('; ', note, nullif(array_to_string(v_notes, '; '), '')), '')
     where id = f.id;
    -- the old "pick three" alert goes; one alert says what came back
    delete from public.player_notifications where player_id = f.player_id and kind = 'power' and data ->> 'sub' = 'refund';
    perform private.notify(f.player_id, 'power', null, jsonb_build_object(
      'sub', 'refund_back', 'rarity', f.primordial, 'gx', f.gx, 'gy', f.gy, 'refund', f.id,
      'back', (select coalesce(jsonb_agg(x ->> 'rarity'), '[]'::jsonb) from jsonb_array_elements(v_out) x),
      'claims', (select count(*) from jsonb_array_elements(v_out) x where x ->> 'how' = 'claim'),
      'swapped', f.status = 'chosen'));
    perform private.audit('primordial.refund_returned', 'player', f.player_id::text,
      jsonb_build_object('refund', f.id, 'primordial', f.primordial, 'fused_from', f.fused_from, 'picks', to_jsonb(f.picks), 'returned', v_out, 'notes', to_jsonb(v_notes)));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function private.primordial_refunds_return() from public;

-- opening a refund (for any fused Primordial not refunded yet) now gives everything back straight away
create or replace function private.primordial_refunds_open() returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare e record; w public.world_plots; v_back text; v_id bigint; v_n int := 0;
begin
  perform set_config('request.jwt.claims', coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}'), true);
  for e in select l.player_id, l.gx, l.gy, l.at, l.data from private.fairplay_log l
            where l.kind = 'rx_fuse' and jsonb_typeof(l.data -> 'from') = 'array' and jsonb_array_length(l.data -> 'from') = 3
            order by l.at loop
    continue when exists (select 1 from public.primordial_refunds where player_id = e.player_id and gx = e.gx and gy = e.gy and fused_at = e.at);
    select * into w from public.world_plots where gx = e.gx and gy = e.gy for update;
    v_back := e.data -> 'from' ->> 0;
    if w.owner_id is distinct from e.player_id or not exists (select 1 from public.plot_rarities r where r.id = w.rarity and r.tier = 'primordial') then
      insert into public.primordial_refunds (player_id, gx, gy, primordial, fused_from, fused_at, status, note)
      values (e.player_id, e.gx, e.gy, coalesce(e.data ->> 'to', '?'), e.data -> 'from', e.at, 'void',
              case when w.owner_id is distinct from e.player_id then 'no longer theirs' else 'no longer a Primordial (now ' || coalesce(w.rarity, '?') || ')' end);
      continue;
    end if;
    perform private.rent_settle(e.player_id);
    perform private.rx_set_rarity(e.player_id, e.gx, e.gy, v_back, 'refund');
    perform private.rx_sync(e.gx, e.gy);
    insert into public.primordial_refunds (player_id, gx, gy, primordial, fused_from, fused_at, reverted_to)
    values (e.player_id, e.gx, e.gy, w.rarity, e.data -> 'from', e.at, v_back) returning id into v_id;
    perform private.audit('primordial.refund_opened', 'player', e.player_id::text, jsonb_build_object('refund', v_id, 'primordial', w.rarity, 'gx', e.gx, 'gy', e.gy, 'back_to', v_back));
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then perform private.primordial_refunds_return(); end if;
  return v_n;
end $$;
revoke all on function private.primordial_refunds_open() from public;

-- ---- no more picking ------------------------------------------------------------------------------------------------
create or replace function public.primordial_refund_status() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('open', '[]'::jsonb, 'choices', '[]'::jsonb)
$$;

create or replace function public.primordial_refund_choose(p_id bigint, p_picks text[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'not_found' using errcode = 'P0001';   -- refunds give back the fused ultras by themselves now
end $$;

create or replace function public.primordial_refunds_mine() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'gx', f.gx, 'gy', f.gy, 'primordial', f.primordial, 'fused_from', f.fused_from, 'fused_at', f.fused_at,
                                               'status', f.status, 'returned', f.returned, 'returned_at', f.returned_at) order by f.id), '[]'::jsonb)
  from public.primordial_refunds f where f.player_id = auth.uid() and f.status in ('open', 'chosen', 'returned')
$$;

create or replace function public.admin_primordial_refunds() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'player', private.profile_json(f.player_id), 'gx', f.gx, 'gy', f.gy, 'primordial', f.primordial,
                     'fused_from', f.fused_from, 'fused_at', f.fused_at, 'status', f.status, 'reverted_to', f.reverted_to, 'picks', to_jsonb(f.picks),
                     'returned', f.returned, 'returned_at', f.returned_at, 'note', f.note, 'chosen_at', f.chosen_at) order by f.id desc)
                   from public.primordial_refunds f), '[]'::jsonb);
end $$;

drop function if exists private.refund_choices();
update public.game_config set value = value - 'refund_exclude' where key = 'rarity_powers';

-- ---- now: everyone's fused ultras come back -----------------------------------------------------------------------
select private.primordial_refunds_return();
