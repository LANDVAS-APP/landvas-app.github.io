-- Enchantments, part 2: the ten enchantments, each with its own rules, timers and other players in the loop.
--
-- Every timer runs on the enchantment's own clock (private.ench_now): Clockwork can fast-forward or freeze it, and a
-- Clockwork splice runs it at triple speed. Every Ink reward goes through private.ench_pay (level, splice genes, a
-- size-rayed reward, curses, Ink Flow). Times in `state` are epoch seconds.
--
--  🪿 Golden Goose  an egg grows for hours (bigger the longer you wait, 3% are Platinum ×3); tap to polish it; a fox comes
--                   by at secret times — catch it in its 25-minute window or it bites a chunk out; unbroken eggs build a
--                   golden streak.
--  🧞 Genie         rub the lamp; a wish recharges every 8 h (hold 3): Ink, Luck, Enchanted Luck or a Golden Hour (×2 on
--                   the next 3 minigame wins). With 3 stored, the Forbidden Wish: 7 wishes — or a twisted fortune and a cold
--                   lamp — or the Genie goes free, leaving a Mythic+ roll ticket.
--  🗺️ Treasure Map  four pieces hidden on other players' plots nearby (or buried in the wild); walk your explorer to each,
--                   their owners get a finder's tip; the full map shows an X — dig it up (5 digs) for a chest.
--  🦠 Parasite      leaps onto a random player's plot; if it isn't shaken off in 20 h it feeds (Ink). 3 feeds: Parasite;
--                   10: Symbiote — its hosts share the meal and can welcome it for more.
--  🪺 Cuckoo        scout three nests (rarer hosts pay more, watchful owners spot eggs); lay; hatch in 10 h — unless the
--                   owner finds the egg and throws it out (and is paid for it).
--  🏺 Pandora's Box once a day lift the lid 1–3 notches: gifts — or one of seven evils escapes (a curse). Release all
--                   seven and Hope comes out: a Legendary+ roll ticket and a fortune; the box resets, richer.
--  🧪 Splice        fuse two of your enchantments for 24 h: each wears the other's gene (36 hybrids, 8 resonant pairs at
--                   double strength); discover them all for the Codex.
--  ⚙️ Clockwork     wind the key (and it ticks on its own) to store minutes; fast-forward any enchantment's clock or
--                   freeze it — freezing a spliced one keeps the hybrid alive longer.
--  📡 Size Ray      aim (a needle swings — fire at the peak), then grow a plot (giant: its minigames pay ×1.5–2 for 6 h),
--                   grow an enchantment's next reward, shrink a goose's fox, or shrink a parasite off your plot and eat its meal.
--  🪞 Mirror Shard  gaze into it: three other players' enchantments are reflected — step through one and the shard becomes
--                   it for 24 h (its owner is told and tipped). Seven cracks and it shatters into Luck.

-- ---- shared helpers -------------------------------------------------------------------------------------------------
create or replace function private.ench_ep(p_t timestamptz) returns numeric language sql immutable as $$ select extract(epoch from p_t)::numeric $$;
create or replace function private.ench_ts(p_e numeric) returns timestamptz language sql immutable as $$ select case when p_e is null then null else to_timestamp(p_e::double precision) end $$;

/** metres from the player's explorer to the middle of a cell (null without an explorer) */
create or replace function private.ench_dist_m(p_uid uuid, p_gx int, p_gy int) returns double precision language sql stable as $$
  select private.haversine_m(x.lng, x.lat, private.lng_of(p_gx + 0.5), private.lat_of(p_gy + 0.5)) from private.explorer_now(p_uid) x limit 1
$$;
create or replace function private.ench_cell_m(p_ax int, p_ay int, p_bx int, p_by int) returns double precision language sql immutable as $$
  select private.haversine_m(private.lng_of(p_ax + 0.5), private.lat_of(p_ay + 0.5), private.lng_of(p_bx + 0.5), private.lat_of(p_by + 0.5))
$$;
create or replace function private.ench_bearing(p_ax int, p_ay int, p_bx int, p_by int) returns int language sql immutable as $$
  select ((degrees(atan2((p_bx - p_ax)::double precision, (p_ay - p_by)::double precision))::int % 360) + 360) % 360
$$;

/** n other players' plots near a cell (one per owner, randomly), widening if there aren't enough */
create or replace function private.ench_hosts(p_uid uuid, p_gx int, p_gy int, p_n int, p_radius int) returns jsonb language plpgsql as $$
declare v jsonb := '[]'::jsonb; r int := p_radius; x record; i int := 0;
begin
  while jsonb_array_length(v) < p_n and i < 3 loop
    v := coalesce((select jsonb_agg(t.j) from (
      select jsonb_build_object('gx', p.gx, 'gy', p.gy, 'owner', p.owner_id, 'owner_name', pr.username, 'rarity', p.rarity) j
        from (select distinct on (w.owner_id) w.gx, w.gy, w.owner_id, w.rarity from public.world_plots w join public.players pl on pl.id = w.owner_id
               where w.owner_id is not null and w.owner_id <> p_uid and pl.status = 'active'
                 and w.gx between p_gx - r and p_gx + r and w.gy between p_gy - r and p_gy + r
               order by w.owner_id, random()) p join public.profiles pr on pr.id = p.owner_id
       order by random() limit p_n) t), '[]'::jsonb);
    r := r * 6; i := i + 1;
  end loop;
  if jsonb_array_length(v) < p_n then
    -- anywhere in the world: random active players' plots
    for x in select w.gx, w.gy, w.owner_id, w.rarity, pr.username from public.players pl join public.profiles pr on pr.id = pl.id
               cross join lateral (select gx, gy, owner_id, rarity from public.world_plots where owner_id = pl.id order by random() limit 1) w
              where pl.id <> p_uid and pl.status = 'active' and not exists (select 1 from jsonb_array_elements(v) e where (e ->> 'owner')::uuid = pl.id)
              order by random() limit p_n - jsonb_array_length(v) loop
      v := v || jsonb_build_array(jsonb_build_object('gx', x.gx, 'gy', x.gy, 'owner', x.owner_id, 'owner_name', x.username, 'rarity', x.rarity));
    end loop;
  end if;
  return v;
end $$;

/** a free (unclaimed) cell between min and max cells away */
create or replace function private.ench_free_cell(p_gx int, p_gy int, p_min int, p_max int) returns int[] language plpgsql as $$
declare i int; a float8; d float8; x int; y int;
begin
  for i in 1 .. 60 loop
    a := random() * 2 * pi(); d := p_min + random() * (p_max - p_min);
    x := (p_gx + round(cos(a) * d)::int + 4194304) % 4194304; y := least(greatest(p_gy + round(sin(a) * d)::int, 0), 4194303);
    if not exists (select 1 from public.world_plots where gx = x and gy = y and (owner_id is not null or locked)) then return array[x, y]; end if;
  end loop;
  return array[(p_gx + p_min) % 4194304, p_gy];
end $$;

create or replace function private.ench_rarity_factor(p_r text) returns numeric language sql stable as $$
  select case when p_r like 'crown%' then 5 when p_r = 'enchanted' then 2.5
              when coalesce((select ppm from public.plot_rarities where id = p_r), 0) > 0 then 4
              else coalesce(('{"common": 1, "uncommon": 1.1, "rare": 1.3, "epic": 1.6, "legendary": 2.2, "mythic": 3}'::jsonb ->> p_r)::numeric, 1) end
$$;

/** give Luck / Enchanted Luck (capped at their maximums) */
create or replace function private.ench_give_luck(p_uid uuid, p_luck int, p_enchant int) returns jsonb language plpgsql as $$
declare v_max int := coalesce((private.cfg('luck') ->> 'max')::int, 100); v_emax int := coalesce((private.ench_cfg() ->> 'luck_max')::int, 9); l public.player_luck;
begin
  insert into public.player_luck (player_id) values (p_uid) on conflict (player_id) do nothing;
  update public.player_luck set luck = least(v_max, luck + greatest(p_luck, 0)), enchant = least(v_emax, enchant + greatest(p_enchant, 0)), updated_at = now()
   where player_id = p_uid returning * into l;
  return jsonb_build_object('luck', l.luck, 'enchant', l.enchant);
end $$;

create or replace function private.ench_ticket(p_uid uuid, p_min text, p_source text) returns uuid language sql as $$
  insert into public.roll_tickets (player_id, min_rarity, source) values (p_uid, p_min, p_source) returning id
$$;

-- ==== 🪿 GOLDEN GOOSE ==================================================================================================
create or replace function private.goose_visits(e public.enchantments, p_egg numeric, p_eggs int) returns numeric[] language plpgsql immutable as $$
declare v numeric[] := '{}'; t numeric := p_egg + 3600 * (1.5 + 2.5 * private.ench_hash(e.sigil, p_eggs, 0)); k int := 0;
begin
  while k < 14 loop
    v := v || t; k := k + 1;
    t := t + 3600 * (2.5 + 2.5 * private.ench_hash(e.sigil, p_eggs, k));
  end loop;
  return v;
end $$;

create or replace function private.goose_eval(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_egg numeric := (s ->> 'egg_at')::numeric; v_now numeric := private.ench_ep(t); v_eggs int := coalesce((s ->> 'eggs')::int, 0);
  v_age numeric; v_base numeric; v_val numeric; vis numeric[]; k int; v_win numeric := 25 * 60; v_st text; v_bites int := 0; v_lurk int; v_lurk_end numeric;
  v_next numeric; v_list jsonb := '[]'::jsonb; v_plat boolean; v_max numeric := private.ench_n('goose', 'max', 140); v_tau numeric := private.ench_n('goose', 'tau_h', 6);
  v_chased jsonb := coalesce(s -> 'chased', '[]'::jsonb); v_dodge numeric := coalesce((s ->> 'dodge')::numeric, 0);
begin
  v_age := greatest(v_now - v_egg, 0);
  v_base := 6 + (v_max - 6) * (1 - exp(-(v_age / 3600) / v_tau));
  v_val := v_base + coalesce((s ->> 'polish')::numeric, 0);
  vis := private.goose_visits(e, v_egg, v_eggs);
  for k in 1 .. array_length(vis, 1) loop
    exit when vis[k] > v_now;
    if v_chased @> jsonb_build_array(k - 1) then v_st := 'chased';
    elsif (s ->> 'shrunk')::int = k - 1 then v_st := case when v_now < vis[k] + v_win then 'lurking_small' else 'shrunk' end;
    elsif v_now < vis[k] + v_win then v_st := 'lurking'; v_lurk := k - 1; v_lurk_end := vis[k] + v_win;
    elsif private.ench_hash(e.sigil, v_eggs, 500 + k) < v_dodge then v_st := 'dodged';
    else v_st := 'bit'; v_bites := v_bites + 1; v_val := v_val * (1 - private.ench_n('goose', 'bite', 0.35));
    end if;
    v_list := v_list || jsonb_build_object('k', k - 1, 'at', vis[k], 'state', v_st);
  end loop;
  select min(x) into v_next from unnest(vis) x where x > v_now;
  v_plat := private.ench_hash(e.sigil, v_eggs, 999) < private.ench_n('goose', 'platinum', 0.03);
  if v_plat then v_val := v_val * 3; end if;
  return jsonb_build_object('age_s', round(v_age), 'value', round(v_val), 'grow', round((1 - exp(-(v_age / 3600) / v_tau)) * 100, 1), 'platinum', v_plat,
    'bites', v_bites, 'visits', v_list, 'lurking', v_lurk, 'lurk_end', v_lurk_end,
    'rustle', v_next is not null and v_next - v_now < 1800, 'polish', coalesce((s ->> 'polish')::int, 0), 'polish_max', 30,
    'polish_ready_in', greatest(0, coalesce((s ->> 'last_polish')::numeric, 0) + 600 - v_now), 'eggs', v_eggs, 'streak', coalesce((s ->> 'streak')::int, 0),
    'can_collect', v_age >= 1200, 'collect_in', greatest(0, 1200 - v_age));
end $$;

create or replace function private.ench_act_goose(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; g jsonb := private.goose_eval(e, t); v_now numeric := private.ench_ep(t); r jsonb; v_pay jsonb; v_streak int; v_clean boolean;
begin
  case p_action
    when 'chase' then
      if g ->> 'lurking' is null then raise exception 'no_fox' using errcode = 'P0001'; end if;
      s := jsonb_set(s, '{chased}', coalesce(s -> 'chased', '[]'::jsonb) || to_jsonb((g ->> 'lurking')::int));
      perform private.ench_stat(e.id, 'foxes');
      v_pay := private.ench_pay(e.id, 3, 'fox chased');
      perform private.ench_event(e.id, 'fox', jsonb_build_object('chased', true));
      r := jsonb_build_object('chased', true, 'pay', v_pay);
    when 'polish' then
      if coalesce((s ->> 'last_polish')::numeric, 0) + 600 > v_now then raise exception 'too_soon' using errcode = 'P0001'; end if;
      if coalesce((s ->> 'polish')::int, 0) >= 30 then raise exception 'polished' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('polish', coalesce((s ->> 'polish')::int, 0) + 3, 'last_polish', v_now);
      perform private.ench_stat(e.id, 'polishes');
      r := jsonb_build_object('polished', 3);
    when 'collect' then
      if not (g ->> 'can_collect')::boolean then raise exception 'egg_not_ready' using errcode = 'P0001'; end if;
      v_clean := (g ->> 'bites')::int = 0;
      v_streak := case when v_clean then coalesce((s ->> 'streak')::int, 0) + 1 else 0 end;
      v_pay := private.ench_pay(e.id, (g ->> 'value')::numeric * (1 + 0.05 * least(coalesce((s ->> 'streak')::int, 0), 10)), case when (g ->> 'platinum')::boolean then 'platinum egg' else 'golden egg' end);
      perform private.ench_stat(e.id, 'eggs');
      if (g ->> 'platinum')::boolean then perform private.ench_stat(e.id, 'platinum'); end if;
      update public.enchantments set stats = stats || jsonb_build_object('best_streak', greatest(coalesce((stats ->> 'best_streak')::int, 0), v_streak)) where id = e.id;
      perform private.ench_event(e.id, 'egg', jsonb_build_object('value', g ->> 'value', 'platinum', g -> 'platinum', 'bites', g -> 'bites', 'streak', v_streak));
      s := s || jsonb_build_object('egg_at', v_now, 'polish', 0, 'last_polish', 0, 'chased', '[]'::jsonb, 'shrunk', null, 'eggs', coalesce((s ->> 'eggs')::int, 0) + 1,
                                   'streak', v_streak, 'dodge', case when private.ench_partner(e.id) ->> 'gene' = 'trick' then 0.5 else 0 end);
      r := jsonb_build_object('egg', g, 'pay', v_pay, 'streak', v_streak);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_goose(e public.enchantments, t timestamptz) returns jsonb language sql stable as $$
  select g || jsonb_build_object('attention', case when g ->> 'lurking' is not null then 'A fox is at the egg!' when (g ->> 'grow')::numeric >= 85 then 'The egg is huge — collect it' end)
  from (select private.goose_eval(e, t) g) x
$$;

-- ==== 🧞 GENIE ========================================================================================================
create or replace function private.genie_eval(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); v_rech numeric := private.ench_n('genie', 'recharge_h', 8) * 3600; v_max int := 3;
  v_w int := coalesce((s ->> 'wishes')::int, 0); v_at numeric := coalesce((s ->> 'charge_at')::numeric, v_now); v_n int; v_cold boolean; v_free boolean;
begin
  v_cold := coalesce((s ->> 'cold_until')::numeric, 0) > v_now;
  v_free := coalesce((s ->> 'freed_until')::numeric, 0) > v_now;
  if not v_cold and not v_free and v_w < v_max then
    v_n := floor((v_now - greatest(v_at, coalesce((s ->> 'cold_until')::numeric, 0), coalesce((s ->> 'freed_until')::numeric, 0))) / v_rech)::int;
    v_w := least(v_max, v_w + greatest(v_n, 0));
  end if;
  return jsonb_build_object('wishes', v_w, 'max', v_max, 'next_in', case when v_cold or v_free or v_w >= v_max then null
           else greatest(0, round(v_rech - mod(v_now - greatest(v_at, coalesce((s ->> 'cold_until')::numeric, 0), coalesce((s ->> 'freed_until')::numeric, 0)), v_rech))) end,
    'cold_until', case when v_cold then s -> 'cold_until' end, 'freed_until', case when v_free then s -> 'freed_until' end,
    'made', coalesce((s ->> 'made')::int, 0), 'forbidden', coalesce((s ->> 'forbidden')::int, 0), 'last', s -> 'last');
end $$;

create or replace function private.ench_act_genie(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; g jsonb := private.genie_eval(e, t); v_now numeric := private.ench_ep(t); v_w int := (g ->> 'wishes')::int; r jsonb; v_pay jsonb;
  v_rech numeric := private.ench_n('genie', 'recharge_h', 8) * 3600; v_roll numeric; v_kept boolean := false; v_lk jsonb; v_out text;
begin
  if g ->> 'freed_until' is not null then raise exception 'genie_free' using errcode = 'P0001'; end if;
  -- (the recharge so far is banked; partial progress keeps running)
  if v_w <> coalesce((s ->> 'wishes')::int, 0) then
    s := s || jsonb_build_object('charge_at', coalesce((s ->> 'charge_at')::numeric, v_now) + (v_w - coalesce((s ->> 'wishes')::int, 0)) * v_rech);
  end if;
  if v_w >= 3 or (s ->> 'charge_at') is null then s := s || jsonb_build_object('charge_at', v_now); end if;
  case p_action
    when 'wish' then
      if v_w < 1 then raise exception 'no_wishes' using errcode = 'P0001'; end if;
      v_kept := private.ench_keep_charge(e.id);
      case a ->> 'wish'
        when 'ink' then v_pay := private.ench_pay(e.id, (40 + floor(random() * 51))::numeric, 'wish: Ink'); r := jsonb_build_object('wish', 'ink', 'pay', v_pay);
        when 'luck' then v_lk := private.ench_give_luck(e.owner_id, 15, 0); r := jsonb_build_object('wish', 'luck', 'luck', 15, 'now', v_lk);
        when 'enchant' then v_lk := private.ench_give_luck(e.owner_id, 0, 1); r := jsonb_build_object('wish', 'enchant', 'enchant', 1, 'now', v_lk);
        when 'golden' then
          insert into public.enchant_buffs (player_id, kind, enchant_id, mult, uses, expires_at) values (e.owner_id, 'golden_hour', e.id, 2, 3, now() + interval '3 hours');
          r := jsonb_build_object('wish', 'golden', 'mult', 2, 'uses', 3);
        else raise exception 'invalid_action' using errcode = 'P0001';
      end case;
      s := s || jsonb_build_object('wishes', case when v_kept then v_w else v_w - 1 end, 'made', coalesce((s ->> 'made')::int, 0) + 1, 'last', a ->> 'wish');
      perform private.ench_stat(e.id, 'wishes');
      perform private.ench_xp(e.id, 1);
      perform private.ench_event(e.id, 'wish', jsonb_build_object('wish', a ->> 'wish', 'kept', v_kept));
      r := r || jsonb_build_object('kept', v_kept);
    when 'forbidden' then
      if v_w < 3 then raise exception 'need_three_wishes' using errcode = 'P0001'; end if;
      v_roll := random();
      if v_roll < 0.40 then
        v_out := 'granted'; s := s || jsonb_build_object('wishes', 7);
      elsif v_roll < 0.75 then
        if private.ench_dodge(e.id) then v_out := 'granted'; s := s || jsonb_build_object('wishes', 7);
        else
          v_out := 'twisted'; v_pay := private.ench_pay(e.id, 260, 'forbidden wish (twisted)');
          s := s || jsonb_build_object('wishes', 0, 'cold_until', v_now + 72 * 3600, 'charge_at', v_now + 72 * 3600);
        end if;
      else
        v_out := 'freed';
        perform private.ench_ticket(e.owner_id, 'mythic', 'genie');
        s := s || jsonb_build_object('wishes', 0, 'freed_until', v_now + 7 * 86400, 'charge_at', v_now + 7 * 86400);
        perform private.ench_stat(e.id, 'freed');
        insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'genie_freed', 'kind', 'genie', 'serial', e.serial));
      end if;
      s := s || jsonb_build_object('forbidden', coalesce((s ->> 'forbidden')::int, 0) + 1, 'last', 'forbidden:' || v_out);
      perform private.ench_stat(e.id, 'forbidden');
      perform private.ench_xp(e.id, 3);
      perform private.ench_event(e.id, 'forbidden', jsonb_build_object('outcome', v_out));
      r := jsonb_build_object('forbidden', v_out, 'pay', v_pay);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_genie(e public.enchantments, t timestamptz) returns jsonb language sql stable as $$
  select g || jsonb_build_object('attention', case when g ->> 'freed_until' is null and (g ->> 'wishes')::int >= 3 then 'Three wishes — the Forbidden Wish awaits'
                                                   when g ->> 'freed_until' is null and (g ->> 'wishes')::int >= 1 then 'A wish is ready' end)
  from (select private.genie_eval(e, t) g) x
$$;

-- ==== 🗺️ TREASURE MAP ==================================================================================================
create or replace function private.ench_act_map(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); r jsonb; v_hosts jsonb; v_p jsonb; v_i int; v_d double precision; v_cell int[]; v_pay jsonb;
  v_reach numeric := private.ench_n('map', 'reach_m', 150); v_dig numeric := private.ench_n('map', 'dig_m', 90); v_found int; v_tk uuid; v_tk2 uuid; v_ink numeric; k int;
  x public.enchantments; v jsonb;
begin
  case p_action
    when 'draw' then
      if jsonb_array_length(coalesce(s -> 'pieces', '[]'::jsonb)) > 0 then raise exception 'map_active' using errcode = 'P0001'; end if;
      if coalesce((s ->> 'next_at')::numeric, 0) > v_now then raise exception 'too_soon' using errcode = 'P0001'; end if;
      v_hosts := private.ench_hosts(e.owner_id, e.gx, e.gy, 4, private.ench_n('map', 'radius', 700)::int);
      v_p := '[]'::jsonb;
      for k in 0 .. 3 loop
        if k < jsonb_array_length(v_hosts) then
          v_p := v_p || jsonb_build_array((v_hosts -> k) || jsonb_build_object('wild', false));
        else
          -- not enough players nearby: buried in the wild
          v_cell := private.ench_free_cell(e.gx, e.gy, 80, 500);
          v_p := v_p || jsonb_build_array(jsonb_build_object('gx', v_cell[1], 'gy', v_cell[2], 'wild', true));
        end if;
      end loop;
      select jsonb_agg(pc || jsonb_build_object('m', round(private.ench_cell_m(e.gx, e.gy, (pc ->> 'gx')::int, (pc ->> 'gy')::int)),
                                               'bearing', private.ench_bearing(e.gx, e.gy, (pc ->> 'gx')::int, (pc ->> 'gy')::int), 'found_at', null))
        into v_p from jsonb_array_elements(v_p) pc;
      s := s || jsonb_build_object('pieces', v_p, 'x', null, 'dug', 0, 'drawn_at', v_now, 'redrawn', false);
      perform private.ench_event(e.id, 'map', jsonb_build_object('drawn', true));
      r := jsonb_build_object('drawn', true);
    when 'redraw' then
      if jsonb_array_length(coalesce(s -> 'pieces', '[]'::jsonb)) = 0 or coalesce((s ->> 'redrawn')::boolean, false)
         or exists (select 1 from jsonb_array_elements(s -> 'pieces') p where p ->> 'found_at' is not null) then raise exception 'cannot_redraw' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('pieces', '[]'::jsonb, 'next_at', 0);
      x := e; x.state := s;
      v := private.ench_act_map(x, 'draw', a, t);
      s := (v -> 'state') || jsonb_build_object('redrawn', true);
      r := v -> 'result';
    when 'collect' then
      v_i := (a ->> 'i')::int;
      v_p := s -> 'pieces' -> v_i;
      if v_p is null or v_p ->> 'found_at' is not null then raise exception 'not_found' using errcode = 'P0001'; end if;
      v_d := private.ench_dist_m(e.owner_id, (v_p ->> 'gx')::int, (v_p ->> 'gy')::int);
      if v_d is null or v_d > v_reach then raise exception 'too_far' using errcode = 'P0001', detail = coalesce(round(v_d)::text, ''); end if;
      s := jsonb_set(s, array['pieces', v_i::text, 'found_at'], to_jsonb(v_now));
      perform private.ench_stat(e.id, 'pieces');
      if not coalesce((v_p ->> 'wild')::boolean, false) and (v_p ->> 'owner') is not null then
        perform private.grant_ink_paced((v_p ->> 'owner')::uuid, 3, 'enchantment', 'treasure_tip', e.id::text, null);
        perform private.notify((v_p ->> 'owner')::uuid, 'enchant', e.owner_id, jsonb_build_object('sub', 'treasure_piece', 'kind', 'map', 'ink', 3, 'gx', v_p -> 'gx', 'gy', v_p -> 'gy'));
      end if;
      select count(*) into v_found from jsonb_array_elements(s -> 'pieces') p where p ->> 'found_at' is not null;
      if v_found = 4 then
        v_cell := private.ench_free_cell(e.gx, e.gy, 60, 300);
        s := s || jsonb_build_object('x', jsonb_build_object('gx', v_cell[1], 'gy', v_cell[2], 'm', round(private.ench_cell_m(e.gx, e.gy, v_cell[1], v_cell[2])),
                                                             'bearing', private.ench_bearing(e.gx, e.gy, v_cell[1], v_cell[2])));
      end if;
      perform private.ench_event(e.id, 'piece', jsonb_build_object('n', v_found));
      perform private.ench_xp(e.id, 1);
      r := jsonb_build_object('found', v_found, 'x', s -> 'x');
    when 'dig' then
      if s -> 'x' is null or jsonb_typeof(s -> 'x') <> 'object' then raise exception 'no_x' using errcode = 'P0001'; end if;
      v_d := private.ench_dist_m(e.owner_id, (s -> 'x' ->> 'gx')::int, (s -> 'x' ->> 'gy')::int);
      if v_d is null or v_d > v_dig then raise exception 'too_far' using errcode = 'P0001', detail = coalesce(round(v_d)::text, ''); end if;
      if extract(epoch from clock_timestamp()) - coalesce((s ->> 'last_dig')::numeric, 0) < 0.35 then raise exception 'too_fast' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('dug', coalesce((s ->> 'dug')::int, 0) + 1, 'last_dig', extract(epoch from clock_timestamp()));
      if (s ->> 'dug')::int < 5 then
        r := jsonb_build_object('dug', (s ->> 'dug')::int);
      else
        v_ink := 120 + floor(random() * 201);
        v_pay := private.ench_pay(e.id, v_ink, 'treasure chest');
        if random() < private.ench_n('map', 'epic_ticket', 0.18) then v_tk := private.ench_ticket(e.owner_id, 'epic', 'treasure'); end if;
        if random() < private.ench_n('map', 'legendary_ticket', 0.05) then v_tk2 := private.ench_ticket(e.owner_id, 'legendary', 'treasure'); end if;
        perform private.ench_stat(e.id, 'maps');
        perform private.ench_event(e.id, 'chest', jsonb_build_object('ink', v_pay -> 'paid', 'epic', v_tk is not null, 'legendary', v_tk2 is not null));
        if v_tk2 is not null then insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'treasure', 'kind', 'map', 'serial', e.serial, 'ticket', 'legendary')); end if;
        s := s || jsonb_build_object('pieces', '[]'::jsonb, 'x', null, 'dug', 0, 'next_at', v_now + private.ench_n('map', 'cooldown_h', 10) * 3600, 'maps', coalesce((s ->> 'maps')::int, 0) + 1);
        r := jsonb_build_object('dug', 5, 'chest', true, 'pay', v_pay, 'ticket', case when v_tk2 is not null then 'legendary' when v_tk is not null then 'epic' end);
      end if;
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_map(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); v_p jsonb; v_found int; v_x jsonb; v_reach numeric := private.ench_n('map', 'reach_m', 150);
begin
  select coalesce(jsonb_agg(p || jsonb_build_object('dist', round(private.ench_dist_m(e.owner_id, (p ->> 'gx')::int, (p ->> 'gy')::int)))), '[]'::jsonb),
         count(*) filter (where p ->> 'found_at' is not null)
    into v_p, v_found from jsonb_array_elements(coalesce(s -> 'pieces', '[]'::jsonb)) p;
  v_x := case when jsonb_typeof(s -> 'x') = 'object' then (s -> 'x') || jsonb_build_object('dist', round(private.ench_dist_m(e.owner_id, (s -> 'x' ->> 'gx')::int, (s -> 'x' ->> 'gy')::int))) end;
  return jsonb_build_object('pieces', v_p, 'found', v_found, 'x', v_x, 'dug', coalesce((s ->> 'dug')::int, 0), 'maps', coalesce((s ->> 'maps')::int, 0),
    'reach_m', v_reach, 'dig_m', private.ench_n('map', 'dig_m', 90), 'redrawn', coalesce((s ->> 'redrawn')::boolean, false),
    'can_draw', jsonb_array_length(v_p) = 0 and coalesce((s ->> 'next_at')::numeric, 0) <= v_now,
    'next_in', greatest(0, round(coalesce((s ->> 'next_at')::numeric, 0) - v_now)),
    'attention', case when jsonb_array_length(v_p) = 0 and coalesce((s ->> 'next_at')::numeric, 0) <= v_now then 'A new map can be drawn'
                      when v_x is not null and (v_x ->> 'dist')::numeric <= private.ench_n('map', 'dig_m', 90) then 'You''re standing on the X — dig!'
                      when exists (select 1 from jsonb_array_elements(v_p) p where p ->> 'found_at' is null and (p ->> 'dist')::numeric <= v_reach) then 'A map piece is in reach' end);
end $$;

-- ==== 🦠 PARASITE / SYMBIOTE =========================================================================================
create or replace function private.ench_act_parasite(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); r jsonb; h jsonb; v_feed numeric := private.ench_n('parasite', 'feed_h', 20) * 3600; v_stage int := coalesce((s ->> 'stage')::int, 0);
  v_pay jsonb; v_feeds int; v_new int; v_gift int; v_hosts jsonb;
begin
  case p_action
    when 'release' then
      if jsonb_typeof(s -> 'host') = 'object' then raise exception 'already_attached' using errcode = 'P0001'; end if;
      if coalesce((s ->> 'rest_until')::numeric, 0) > v_now then raise exception 'too_soon' using errcode = 'P0001'; end if;
      v_hosts := private.ench_hosts(e.owner_id, e.gx, e.gy, 1, 2000000);
      if jsonb_array_length(v_hosts) = 0 then raise exception 'no_hosts' using errcode = 'P0001'; end if;
      h := (v_hosts -> 0) || jsonb_build_object('at', v_now, 'welcomed', false);
      s := s || jsonb_build_object('host', h);
      perform private.notify((h ->> 'owner')::uuid, 'enchant', e.owner_id, jsonb_build_object('sub', case when v_stage = 2 then 'symbiote_attached' else 'parasite_attached' end, 'kind', 'parasite',
        'gx', h -> 'gx', 'gy', h -> 'gy', 'id', e.id));
      perform private.ench_event(e.id, 'leap', jsonb_build_object('host', h ->> 'owner_name'));
      r := jsonb_build_object('host', h);
    when 'harvest' then
      h := s -> 'host';
      if jsonb_typeof(h) <> 'object' then raise exception 'not_attached' using errcode = 'P0001'; end if;
      if v_now - (h ->> 'at')::numeric < v_feed then raise exception 'still_feeding' using errcode = 'P0001'; end if;
      v_pay := private.ench_pay(e.id, (array[25, 45, 60])[v_stage + 1], 'fed on @' || (h ->> 'owner_name'));
      if v_stage = 2 then
        -- a Symbiote shares the meal
        v_gift := round(coalesce((v_pay ->> 'paid')::numeric, 0) * case when (h ->> 'welcomed')::boolean then 0.75 else 0.5 end)::int;
        if v_gift > 0 then
          perform private.grant_ink_paced((h ->> 'owner')::uuid, v_gift, 'enchantment', 'symbiote', e.id::text, null);
          perform private.notify((h ->> 'owner')::uuid, 'enchant', e.owner_id, jsonb_build_object('sub', 'symbiote_gift', 'kind', 'parasite', 'ink', v_gift));
        end if;
      end if;
      v_feeds := coalesce((s ->> 'feeds')::int, 0) + 1;
      v_new := case when v_feeds >= 10 then 2 when v_feeds >= 3 then 1 else 0 end;
      s := s || jsonb_build_object('host', null, 'feeds', v_feeds, 'stage', v_new, 'rest_until', v_now + 3600);
      perform private.ench_stat(e.id, 'feeds');
      perform private.ench_event(e.id, 'fed', jsonb_build_object('host', h ->> 'owner_name', 'ink', v_pay -> 'paid'));
      if v_new > v_stage then
        perform private.ench_event(e.id, 'evolved', jsonb_build_object('stage', v_new));
        if v_new = 2 then insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'symbiote', 'kind', 'parasite', 'serial', e.serial)); end if;
      end if;
      r := jsonb_build_object('pay', v_pay, 'evolved', v_new > v_stage, 'stage', v_new, 'gift', v_gift);
    when 'recall' then
      h := s -> 'host';
      if jsonb_typeof(h) <> 'object' then raise exception 'not_attached' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('host', null, 'rest_until', v_now + 1800);
      r := jsonb_build_object('recalled', true);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_parasite(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); h jsonb := case when jsonb_typeof(e.state -> 'host') = 'object' then e.state -> 'host' end;
  v_feed numeric := private.ench_n('parasite', 'feed_h', 20) * 3600; v_f int := coalesce((s ->> 'feeds')::int, 0);
begin
  return jsonb_build_object('stage', coalesce((s ->> 'stage')::int, 0), 'feeds', v_f, 'next_stage_at', case when v_f < 3 then 3 when v_f < 10 then 10 end,
    'host', h, 'fed', case when h is not null then least(100, round((v_now - (h ->> 'at')::numeric) / v_feed * 100)) end,
    'ready_in', case when h is not null then greatest(0, round((h ->> 'at')::numeric + v_feed - v_now)) end,
    'rest_in', greatest(0, round(coalesce((s ->> 'rest_until')::numeric, 0) - v_now)), 'shaken', coalesce((s ->> 'shaken')::int, 0),
    'attention', case when h is null and coalesce((s ->> 'rest_until')::numeric, 0) <= v_now then 'Hungry — release it onto a host'
                      when h is not null and v_now - (h ->> 'at')::numeric >= v_feed then 'Fully fed — harvest it' end);
end $$;

-- ==== 🪺 CUCKOO =======================================================================================================
/** how watchful a player is (how often they're around): 0.12 … 0.75 */
create or replace function private.ench_watch(p_uid uuid) returns numeric language sql stable as $$
  select case when last_active_at > now() - interval '1 hour' then 0.75 when last_active_at > now() - interval '1 day' then 0.5
              when last_active_at > now() - interval '3 days' then 0.3 else 0.12 end from public.players where id = p_uid
$$;

create or replace function private.ench_act_cuckoo(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); r jsonb; v_n jsonb; v_egg jsonb; v_pay jsonb; v_hatch numeric := private.ench_n('cuckoo', 'hatch_h', 10) * 3600;
  v_lk jsonb; v_i int;
begin
  case p_action
    when 'scout' then
      if jsonb_typeof(s -> 'egg') = 'object' then raise exception 'egg_out' using errcode = 'P0001'; end if;
      if jsonb_array_length(coalesce(s -> 'nests', '[]'::jsonb)) > 0 and coalesce((s ->> 'rescouted')::boolean, false) then raise exception 'already_scouted' using errcode = 'P0001'; end if;
      select coalesce(jsonb_agg(n || jsonb_build_object('watch', private.ench_watch((n ->> 'owner')::uuid), 'reward', round(40 * private.ench_rarity_factor(n ->> 'rarity')),
                                                       'm', round(private.ench_cell_m(e.gx, e.gy, (n ->> 'gx')::int, (n ->> 'gy')::int)))), '[]'::jsonb)
        into v_n from jsonb_array_elements(private.ench_hosts(e.owner_id, e.gx, e.gy, 3, private.ench_n('cuckoo', 'radius', 1500)::int)) n;
      if jsonb_array_length(v_n) = 0 then raise exception 'no_hosts' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('nests', v_n, 'rescouted', jsonb_array_length(coalesce(s -> 'nests', '[]'::jsonb)) > 0);
      r := jsonb_build_object('nests', v_n);
    when 'lay' then
      if jsonb_typeof(s -> 'egg') = 'object' then raise exception 'egg_out' using errcode = 'P0001'; end if;
      v_i := (a ->> 'i')::int;
      v_n := s -> 'nests' -> v_i;
      if v_n is null then raise exception 'not_found' using errcode = 'P0001'; end if;
      v_egg := v_n || jsonb_build_object('laid_at', v_now, 'hatch_at', v_now + v_hatch, 'spotted', false);
      -- a watchful owner may spot it at once
      if random() < (v_n ->> 'watch')::numeric then
        v_egg := v_egg || jsonb_build_object('spotted', true);
        perform private.notify((v_n ->> 'owner')::uuid, 'enchant', null, jsonb_build_object('sub', 'cuckoo_egg', 'kind', 'cuckoo', 'gx', v_n -> 'gx', 'gy', v_n -> 'gy', 'id', e.id));
      end if;
      s := s || jsonb_build_object('egg', v_egg, 'nests', '[]'::jsonb, 'rescouted', false);
      perform private.ench_event(e.id, 'laid', jsonb_build_object('host', v_n ->> 'owner_name', 'rarity', v_n ->> 'rarity'));
      r := jsonb_build_object('egg', v_egg);
    when 'raise' then
      v_egg := s -> 'egg';
      if jsonb_typeof(v_egg) <> 'object' then raise exception 'no_egg' using errcode = 'P0001'; end if;
      if (v_egg ->> 'hatch_at')::numeric > v_now then raise exception 'not_hatched' using errcode = 'P0001'; end if;
      v_pay := private.ench_pay(e.id, (v_egg ->> 'reward')::numeric, 'cuckoo chick from @' || (v_egg ->> 'owner_name'));
      if random() < 0.1 then v_lk := private.ench_give_luck(e.owner_id, 20, 0); end if;
      perform private.ench_stat(e.id, 'chicks');
      perform private.ench_event(e.id, 'hatched', jsonb_build_object('host', v_egg ->> 'owner_name', 'ink', v_pay -> 'paid', 'feather', v_lk is not null));
      s := s || jsonb_build_object('egg', null);
      r := jsonb_build_object('pay', v_pay, 'feather', v_lk is not null);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_cuckoo(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); v_egg jsonb := case when jsonb_typeof(e.state -> 'egg') = 'object' then e.state -> 'egg' end;
begin
  return jsonb_build_object('nests', coalesce(s -> 'nests', '[]'::jsonb), 'egg', v_egg, 'rescouted', coalesce((s ->> 'rescouted')::boolean, false),
    'hatch_in', case when v_egg is not null then greatest(0, round((v_egg ->> 'hatch_at')::numeric - v_now)) end,
    'hatched', v_egg is not null and (v_egg ->> 'hatch_at')::numeric <= v_now,
    'chicks', coalesce((e.stats ->> 'chicks')::int, 0), 'lost', coalesce((s ->> 'lost')::int, 0),
    'attention', case when v_egg is not null and (v_egg ->> 'hatch_at')::numeric <= v_now then 'The chick has hatched!' when v_egg is null then 'Ready to lay an egg' end);
end $$;

-- ==== 🏺 PANDORA'S BOX ===============================================================================================
create or replace function private.pandora_evils() returns text[] language sql immutable as $$
  select array['plague', 'greed', 'strife', 'envy', 'despair', 'toil', 'sorrow']
$$;

/** an evil escapes: its curse lands (unless dodged) */
create or replace function private.pandora_curse(e public.enchantments, p_evil text) returns jsonb language plpgsql as $$
declare v_dodge boolean := private.ench_dodge(e.id);
begin
  if v_dodge then return jsonb_build_object('evil', p_evil, 'dodged', true); end if;
  case p_evil
    when 'plague' then insert into public.enchant_buffs (player_id, kind, enchant_id, mult, expires_at) values (e.owner_id, 'curse_plague', e.id, 0.7, now() + interval '6 hours');
    when 'greed' then insert into public.enchant_buffs (player_id, kind, enchant_id, mult, expires_at) values (e.owner_id, 'curse_greed', e.id, 0.75, now() + interval '2 hours');
    when 'strife' then insert into public.enchant_buffs (player_id, kind, enchant_id, mult, uses, expires_at) values (e.owner_id, 'curse_strife', e.id, 0.5, 1, now() + interval '1 day');
    when 'envy' then update public.player_luck set luck = greatest(0, luck - 15) where player_id = e.owner_id;
    when 'despair' then update public.player_luck set enchant = 0 where player_id = e.owner_id;
    when 'toil' then update public.enchantments set clock_skip = clock_skip - 7200 where owner_id = e.owner_id and status = 'active' and id <> e.id;
    else null; -- sorrow: the box itself stays shut a day longer (handled by the caller)
  end case;
  return jsonb_build_object('evil', p_evil, 'dodged', false);
end $$;

create or replace function private.ench_act_pandora(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); v_day text := to_char(t at time zone 'UTC', 'YYYY-MM-DD'); n int := (a ->> 'notches')::int; i int;
  v_evils jsonb := coalesce(e.state -> 'evils', '[]'::jsonb); v_out jsonb := '[]'::jsonb; v_p numeric; v_ev text; v_left text[]; v_g numeric; v_cycle int := coalesce((e.state ->> 'cycle')::int, 0);
  v_pay jsonb; v_c jsonb; v_hope boolean := false; v_lk jsonb; v_x numeric; v_tk uuid;
begin
  if p_action <> 'open' then raise exception 'invalid_action' using errcode = 'P0001'; end if;
  if n is null or n not between 1 and 3 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if s ->> 'opened_on' = v_day then raise exception 'already_opened' using errcode = 'P0001'; end if;
  if coalesce((s ->> 'locked_until')::numeric, 0) > v_now then raise exception 'box_locked' using errcode = 'P0001'; end if;
  v_p := (array[0.22, 0.32, 0.45])[n];
  for i in 1 .. n loop
    select array_agg(x) into v_left from unnest(private.pandora_evils()) x where not v_evils ? x;
    if v_left is not null and random() < v_p then
      v_ev := v_left[1 + floor(random() * array_length(v_left, 1))::int];
      v_c := private.pandora_curse(e, v_ev);
      v_evils := v_evils || to_jsonb(v_ev);
      if v_ev = 'sorrow' and not (v_c ->> 'dodged')::boolean then s := s || jsonb_build_object('locked_until', v_now + 86400); end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object('type', 'evil') || v_c);
      perform private.ench_event(e.id, 'evil', v_c);
    else
      v_x := random();
      v_g := (1 + 0.25 * v_cycle) * case n when 1 then 30 + random() * 30 when 2 then 45 + random() * 45 else 70 + random() * 70 end;
      if v_x < 0.7 then
        v_pay := private.ench_pay(e.id, v_g, 'a gift from the box');
        v_out := v_out || jsonb_build_array(jsonb_build_object('type', 'ink', 'pay', v_pay));
      elsif v_x < 0.85 then
        v_lk := private.ench_give_luck(e.owner_id, 10, 0);
        v_out := v_out || jsonb_build_array(jsonb_build_object('type', 'luck', 'luck', 10));
      elsif v_x < 0.95 then
        v_lk := private.ench_give_luck(e.owner_id, 0, 1);
        v_out := v_out || jsonb_build_array(jsonb_build_object('type', 'enchant', 'enchant', 1));
      else
        insert into public.enchant_buffs (player_id, kind, enchant_id, mult, uses, expires_at) values (e.owner_id, 'golden_hour', e.id, 2, 2, now() + interval '3 hours');
        v_out := v_out || jsonb_build_array(jsonb_build_object('type', 'golden', 'uses', 2));
      end if;
    end if;
  end loop;
  -- all seven out: Hope
  if jsonb_array_length(v_evils) >= 7 then
    v_hope := true;
    v_pay := private.ench_pay(e.id, 400 * (1 + 0.25 * v_cycle), 'Hope');
    v_tk := private.ench_ticket(e.owner_id, 'legendary', 'pandora');
    v_evils := '[]'::jsonb; v_cycle := v_cycle + 1;
    perform private.ench_stat(e.id, 'hope');
    perform private.ench_event(e.id, 'hope', jsonb_build_object('cycle', v_cycle, 'ink', v_pay -> 'paid'));
    insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'hope', 'kind', 'pandora', 'serial', e.serial));
    v_out := v_out || jsonb_build_array(jsonb_build_object('type', 'hope', 'pay', v_pay, 'ticket', 'legendary'));
  end if;
  s := s || jsonb_build_object('evils', v_evils, 'opened_on', v_day, 'opens', coalesce((s ->> 'opens')::int, 0) + 1, 'cycle', v_cycle, 'last', v_out);
  perform private.ench_stat(e.id, 'opens');
  perform private.ench_xp(e.id, n);
  return jsonb_build_object('state', s, 'result', jsonb_build_object('notches', n, 'out', v_out, 'hope', v_hope));
end $$;

create or replace function private.ench_view_pandora(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); v_day text := to_char(t at time zone 'UTC', 'YYYY-MM-DD'); v_open boolean;
begin
  v_open := coalesce(s ->> 'opened_on', '') <> v_day and coalesce((s ->> 'locked_until')::numeric, 0) <= v_now;
  return jsonb_build_object('evils', coalesce(s -> 'evils', '[]'::jsonb), 'all', to_jsonb(private.pandora_evils()), 'cycle', coalesce((s ->> 'cycle')::int, 0),
    'can_open', v_open, 'locked_in', greatest(0, round(coalesce((s ->> 'locked_until')::numeric, 0) - v_now)),
    'next_in', case when not v_open then round(extract(epoch from (date_trunc('day', t at time zone 'UTC') + interval '1 day') - (t at time zone 'UTC'))) end,
    'opens', coalesce((s ->> 'opens')::int, 0), 'last', s -> 'last',
    'curses', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'until', expires_at, 'uses', uses)) from public.enchant_buffs
                        where player_id = e.owner_id and kind like 'curse_%' and expires_at > now() and (uses is null or uses > 0)), '[]'::jsonb),
    'attention', case when v_open then 'The box can be opened today' end);
end $$;

-- ==== 🧪 SPLICE =======================================================================================================
create or replace function private.splice_eval(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); v_rech numeric := private.ench_n('splice', 'recharge_h', 36) * 3600; v_c int := coalesce((s ->> 'charges')::int, 0);
  v_at numeric := coalesce((s ->> 'charge_at')::numeric, v_now); v_n int;
begin
  if v_c < 2 then v_n := floor((v_now - v_at) / v_rech)::int; v_c := least(2, v_c + greatest(v_n, 0)); end if;
  return jsonb_build_object('charges', v_c, 'max', 2, 'next_in', case when v_c < 2 then greatest(0, round(v_rech - mod(v_now - v_at, v_rech))) end);
end $$;

create or replace function private.ench_act_splice(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); g jsonb := private.splice_eval(e, t); x public.enchantments; y public.enchantments; r jsonb; v_key text; v_h jsonb;
  v_rech numeric := private.ench_n('splice', 'recharge_h', 36) * 3600; v_c int := (g ->> 'charges')::int; v_new boolean; v_hrs numeric := private.ench_n('splice', 'hours', 24);
begin
  if v_c <> coalesce((s ->> 'charges')::int, 0) then s := s || jsonb_build_object('charge_at', coalesce((s ->> 'charge_at')::numeric, v_now) + (v_c - coalesce((s ->> 'charges')::int, 0)) * v_rech); end if;
  if v_c >= 2 then s := s || jsonb_build_object('charge_at', v_now); end if;
  case p_action
    when 'splice' then
      if v_c < 1 then raise exception 'no_charges' using errcode = 'P0001'; end if;
      if exists (select 1 from public.enchant_splices where splice_id = e.id and ends_at > now()) then raise exception 'splice_active' using errcode = 'P0001'; end if;
      select * into x from public.enchantments where id = (a ->> 'a')::uuid for update;
      select * into y from public.enchantments where id = (a ->> 'b')::uuid for update;
      if x.id is null or y.id is null or x.id = y.id or x.owner_id is distinct from e.owner_id or y.owner_id is distinct from e.owner_id
         or x.status <> 'active' or y.status <> 'active' or x.kind = 'splice' or y.kind = 'splice' then raise exception 'bad_target' using errcode = 'P0001'; end if;
      if private.ench_partner(x.id) is not null or private.ench_partner(y.id) is not null then raise exception 'already_spliced' using errcode = 'P0001'; end if;
      insert into public.enchant_splices (splice_id, player_id, a, b, ends_at) values (e.id, e.owner_id, x.id, y.id, now() + make_interval(hours => v_hrs::int));
      v_key := least(x.kind, y.kind) || '+' || greatest(x.kind, y.kind);
      v_h := private.ench_hybrid(x.kind, y.kind);
      v_new := not coalesce(s -> 'codex', '[]'::jsonb) ? v_key;
      s := s || jsonb_build_object('charges', v_c - 1, 'codex', case when v_new then coalesce(s -> 'codex', '[]'::jsonb) || to_jsonb(v_key) else coalesce(s -> 'codex', '[]'::jsonb) end);
      perform private.ench_stat(e.id, 'splices');
      perform private.ench_xp(e.id, 2);
      perform private.ench_event(e.id, 'spliced', jsonb_build_object('hybrid', v_h ->> 0, 'resonant', v_h -> 1, 'a', x.kind, 'b', y.kind, 'new', v_new));
      perform private.ench_event(x.id, 'spliced', jsonb_build_object('hybrid', v_h ->> 0, 'with', y.kind));
      perform private.ench_event(y.id, 'spliced', jsonb_build_object('hybrid', v_h ->> 0, 'with', x.kind));
      if v_new and (v_h ->> 1)::boolean then
        insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'hybrid', 'kind', 'splice', 'hybrid', v_h ->> 0, 'a', x.kind, 'b', y.kind));
      end if;
      r := jsonb_build_object('hybrid', v_h ->> 0, 'resonant', v_h -> 1, 'new', v_new, 'a', x.kind, 'b', y.kind, 'ends_at', now() + make_interval(hours => v_hrs::int));
    when 'unsplice' then
      update public.enchant_splices set ends_at = now() where splice_id = e.id and ends_at > now();
      if not found then raise exception 'no_splice' using errcode = 'P0001'; end if;
      r := jsonb_build_object('unspliced', true);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_splice(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare g jsonb := private.splice_eval(e, t); v_act jsonb;
begin
  select jsonb_build_object('a', sp.a, 'b', sp.b, 'a_kind', xa.kind, 'b_kind', xb.kind, 'hybrid', private.ench_hybrid(xa.kind, xb.kind) ->> 0,
                            'resonant', (private.ench_hybrid(xa.kind, xb.kind) ->> 1)::boolean, 'started_at', sp.started_at, 'ends_at', sp.ends_at,
                            'a_name', coalesce(xa.nickname, (private.ench_info(xa.kind) ->> 'name') || ' #' || xa.serial),
                            'b_name', coalesce(xb.nickname, (private.ench_info(xb.kind) ->> 'name') || ' #' || xb.serial))
    into v_act from public.enchant_splices sp join public.enchantments xa on xa.id = sp.a join public.enchantments xb on xb.id = sp.b
   where sp.splice_id = e.id and sp.ends_at > now() order by sp.id desc limit 1;
  return g || jsonb_build_object('active', v_act, 'codex', coalesce(e.state -> 'codex', '[]'::jsonb), 'made', coalesce((e.stats ->> 'splices')::int, 0),
    'attention', case when v_act is null and (g ->> 'charges')::int >= 1 then 'A splice is ready' end);
end $$;

-- ==== ⚙️ CLOCKWORK ====================================================================================================
create or replace function private.clock_eval(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); v_cap numeric := private.ench_n('clockwork', 'cap_min', 240); v_ch numeric; v_day text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  v_turns int := private.ench_n('clockwork', 'turns', 15)::int;
begin
  v_ch := least(v_cap, coalesce((s ->> 'charge')::numeric, 0) + greatest(0, v_now - coalesce((s ->> 'tick_at')::numeric, v_now)) / 3600 * private.ench_n('clockwork', 'tick_min_h', 3));
  return jsonb_build_object('charge', round(v_ch, 1), 'cap', v_cap, 'per_turn', private.ench_n('clockwork', 'turn_min', 8),
    'turns_left', case when s ->> 'wound_on' = v_day then greatest(0, v_turns - coalesce((s ->> 'turns')::int, 0)) else v_turns end, 'turns_max', v_turns,
    'freeze_cost', private.ench_n('clockwork', 'freeze_min_h', 20));
end $$;

create or replace function private.ench_act_clockwork(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); g jsonb := private.clock_eval(e, t); v_ch numeric := (g ->> 'charge')::numeric; r jsonb; x public.enchantments;
  v_day text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD'); v_n int; v_m numeric; v_h numeric;
begin
  s := s || jsonb_build_object('charge', v_ch, 'tick_at', v_now);
  case p_action
    when 'wind' then
      v_n := least(greatest(coalesce((a ->> 'turns')::int, 0), 0), (g ->> 'turns_left')::int);
      if v_n < 1 then raise exception 'wound_out' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('charge', least((g ->> 'cap')::numeric, v_ch + v_n * (g ->> 'per_turn')::numeric),
                                   'wound_on', v_day, 'turns', case when s ->> 'wound_on' = v_day then coalesce((s ->> 'turns')::int, 0) else 0 end + v_n);
      perform private.ench_stat(e.id, 'winds', v_n);
      if v_n >= 5 then perform private.ench_xp(e.id, 1); end if;
      r := jsonb_build_object('wound', v_n, 'charge', s -> 'charge');
    when 'forward' then
      select * into x from public.enchantments where id = (a ->> 'target')::uuid for update;
      if x.id is null or x.id = e.id or x.owner_id is distinct from e.owner_id or x.status <> 'active' then raise exception 'bad_target' using errcode = 'P0001'; end if;
      if x.frozen_at is not null and now() < x.frozen_until then raise exception 'target_frozen' using errcode = 'P0001'; end if;
      v_m := least(greatest(coalesce((a ->> 'minutes')::numeric, 0), 1), v_ch);
      if v_m < 1 then raise exception 'not_enough_charge' using errcode = 'P0001'; end if;
      perform private.ench_settle(x.id);
      update public.enchantments set clock_skip = clock_skip + v_m * 60 where id = x.id;
      s := s || jsonb_build_object('charge', v_ch - v_m);
      perform private.ench_stat(e.id, 'forwarded', v_m);
      perform private.ench_xp(e.id, 1);
      perform private.ench_event(e.id, 'forward', jsonb_build_object('target', x.kind, 'minutes', round(v_m)));
      perform private.ench_event(x.id, 'forwarded', jsonb_build_object('minutes', round(v_m)));
      r := jsonb_build_object('forwarded', round(v_m), 'target', x.id);
    when 'freeze' then
      select * into x from public.enchantments where id = (a ->> 'target')::uuid for update;
      if x.id is null or x.id = e.id or x.owner_id is distinct from e.owner_id or x.status <> 'active' then raise exception 'bad_target' using errcode = 'P0001'; end if;
      v_h := least(greatest(coalesce((a ->> 'hours')::numeric, 1), 1), 12);
      if v_ch < v_h * (g ->> 'freeze_cost')::numeric then raise exception 'not_enough_charge' using errcode = 'P0001'; end if;
      perform private.ench_settle(x.id);
      select * into x from public.enchantments where id = x.id;
      if x.frozen_at is not null and now() < x.frozen_until then
        update public.enchantments set frozen_until = frozen_until + make_interval(secs => (v_h * 3600)::double precision) where id = x.id;
      else
        update public.enchantments set frozen_at = now(), frozen_until = now() + make_interval(secs => (v_h * 3600)::double precision) where id = x.id;
      end if;
      -- a frozen hybrid stays spliced longer
      update public.enchant_splices sp set ends_at = sp.ends_at + make_interval(secs => (v_h * 3600)::double precision) where (sp.a = x.id or sp.b = x.id) and sp.ends_at > now();
      s := s || jsonb_build_object('charge', v_ch - v_h * (g ->> 'freeze_cost')::numeric);
      perform private.ench_stat(e.id, 'freezes');
      perform private.ench_xp(e.id, 1);
      perform private.ench_event(e.id, 'freeze', jsonb_build_object('target', x.kind, 'hours', v_h));
      perform private.ench_event(x.id, 'frozen', jsonb_build_object('hours', v_h));
      r := jsonb_build_object('frozen', v_h, 'target', x.id);
    when 'unfreeze' then
      select * into x from public.enchantments where id = (a ->> 'target')::uuid for update;
      if x.id is null or x.owner_id is distinct from e.owner_id or x.frozen_at is null or now() >= x.frozen_until then raise exception 'bad_target' using errcode = 'P0001'; end if;
      update public.enchantments set frozen_until = now() where id = x.id;
      perform private.ench_settle(x.id);
      r := jsonb_build_object('unfrozen', true);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_clockwork(e public.enchantments, t timestamptz) returns jsonb language sql stable as $$
  select g || jsonb_build_object('attention', case when (g ->> 'turns_left')::int > 0 then 'The key can be wound' end)
  from (select private.clock_eval(e, t) g) x
$$;

-- ==== 📡 SIZE RAY =====================================================================================================
create or replace function private.ray_eval(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); v_rech numeric := private.ench_n('sizeray', 'recharge_h', 8) * 3600; v_c int := coalesce((s ->> 'shots')::int, 0);
  v_at numeric := coalesce((s ->> 'shot_at')::numeric, v_now);
begin
  if v_c < 3 then v_c := least(3, v_c + greatest(floor((v_now - v_at) / v_rech)::int, 0)); end if;
  return jsonb_build_object('shots', v_c, 'max', 3, 'next_in', case when v_c < 3 then greatest(0, round(v_rech - mod(v_now - v_at, v_rech))) end,
    'period_ms', private.ench_n('sizeray', 'period_ms', 1400), 'aim', s -> 'aim', 'perfects', coalesce((e.stats ->> 'perfects')::int, 0));
end $$;

create or replace function private.ench_act_sizeray(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); g jsonb := private.ray_eval(e, t); v_c int := (g ->> 'shots')::int; r jsonb; v_tg jsonb; v_aim jsonb;
  v_rech numeric := private.ench_n('sizeray', 'recharge_h', 8) * 3600; v_el numeric; v_ph numeric; v_acc numeric; v_per numeric := (g ->> 'period_ms')::numeric / 1000;
  x public.enchantments; v_m numeric; v_pay jsonb; v_h jsonb; v_hrs numeric;
begin
  if v_c <> coalesce((s ->> 'shots')::int, 0) then s := s || jsonb_build_object('shot_at', coalesce((s ->> 'shot_at')::numeric, v_now) + (v_c - coalesce((s ->> 'shots')::int, 0)) * v_rech); end if;
  if v_c >= 3 then s := s || jsonb_build_object('shot_at', v_now); end if;
  s := s || jsonb_build_object('shots', v_c);
  case p_action
    when 'aim' then
      if v_c < 1 then raise exception 'no_shots' using errcode = 'P0001'; end if;
      v_tg := a -> 'target';
      if v_tg ->> 'type' not in ('plot', 'enchant', 'fox', 'parasite') then raise exception 'bad_target' using errcode = 'P0001'; end if;
      if v_tg ->> 'type' = 'plot' and not exists (select 1 from public.world_plots where gx = (v_tg ->> 'gx')::int and gy = (v_tg ->> 'gy')::int and owner_id = e.owner_id) then
        raise exception 'bad_target' using errcode = 'P0001'; end if;
      if v_tg ->> 'type' in ('enchant', 'fox') and not exists (select 1 from public.enchantments where id = (v_tg ->> 'id')::uuid and owner_id = e.owner_id and status = 'active'
           and id <> e.id and (v_tg ->> 'type' <> 'fox' or kind = 'goose')) then raise exception 'bad_target' using errcode = 'P0001'; end if;
      if v_tg ->> 'type' = 'parasite' and not exists (select 1 from public.enchantments where id = (v_tg ->> 'id')::uuid and status = 'active'
           and ((state -> 'host' ->> 'owner') = e.owner_id::text or (state -> 'r' -> 'host' ->> 'owner') = e.owner_id::text)) then raise exception 'bad_target' using errcode = 'P0001'; end if;
      v_aim := jsonb_build_object('at', extract(epoch from clock_timestamp()), 'target', v_tg);
      s := s || jsonb_build_object('aim', v_aim);
      r := jsonb_build_object('aim', v_aim, 'server_time', extract(epoch from clock_timestamp()), 'period_ms', g -> 'period_ms');
    when 'fire' then
      v_aim := s -> 'aim';
      if jsonb_typeof(v_aim) <> 'object' then raise exception 'not_aimed' using errcode = 'P0001'; end if;
      if v_c < 1 then raise exception 'no_shots' using errcode = 'P0001'; end if;
      v_el := extract(epoch from clock_timestamp()) - (v_aim ->> 'at')::numeric - 0.12;
      if v_el > 12 then s := s || jsonb_build_object('aim', null); raise exception 'aim_expired' using errcode = 'P0001'; end if;
      v_ph := mod(greatest(v_el, 0) / v_per, 1);
      v_acc := round((0.5 - 0.5 * cos(2 * pi() * v_ph))::numeric, 3);
      v_tg := v_aim -> 'target';
      if not private.ench_keep_charge(e.id) then s := s || jsonb_build_object('shots', v_c - 1); end if;
      if v_c >= 3 then s := s || jsonb_build_object('shot_at', v_now); end if;
      s := s || jsonb_build_object('aim', null);
      case v_tg ->> 'type'
        when 'plot' then
          v_m := round(1.5 + 0.5 * v_acc, 2); v_hrs := case when v_acc >= 0.95 then 8 else 6 end;
          insert into public.enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, expires_at)
          values (e.owner_id, 'plot_giant', (v_tg ->> 'gx')::int, (v_tg ->> 'gy')::int, e.id, v_m, now() + make_interval(hours => v_hrs::int));
          insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', (v_tg ->> 'gx')::int, (v_tg ->> 'gy')::int, (v_tg ->> 'gx')::int, (v_tg ->> 'gy')::int);
          r := jsonb_build_object('giant', v_m, 'hours', v_hrs);
        when 'enchant' then
          v_m := round(1.5 + 1.0 * v_acc, 2);
          insert into public.enchant_buffs (player_id, kind, enchant_id, mult, expires_at) values (e.owner_id, 'next_reward', (v_tg ->> 'id')::uuid, v_m, now() + interval '3 days');
          r := jsonb_build_object('grown', v_m);
        when 'fox' then
          select * into x from public.enchantments where id = (v_tg ->> 'id')::uuid for update;
          -- the next fox (the one lurking now, or the next to come) is shrunk: it can't bite
          v_h := private.goose_eval(x, private.ench_now(x));
          update public.enchantments set state = state || jsonb_build_object('shrunk', coalesce((v_h ->> 'lurking')::int, jsonb_array_length(v_h -> 'visits'))) where id = x.id;
          r := jsonb_build_object('fox_shrunk', true);
        when 'parasite' then
          select * into x from public.enchantments where id = (v_tg ->> 'id')::uuid for update;
          if x.kind = 'shard' then update public.enchantments set state = jsonb_set(jsonb_set(state, '{r,host}', 'null'::jsonb), '{r,rest_until}', to_jsonb(private.ench_ep(private.ench_now(x)) + 3600)) where id = x.id;
          else update public.enchantments set state = state || jsonb_build_object('host', null, 'rest_until', private.ench_ep(private.ench_now(x)) + 3600) where id = x.id; end if;
          v_pay := private.ench_pay(e.id, 15 + 20 * v_acc, 'shrank a parasite');
          perform private.notify(x.owner_id, 'enchant', e.owner_id, jsonb_build_object('sub', 'parasite_shrunk', 'kind', 'parasite'));
          perform private.ench_event(x.id, 'shrunk', '{}'::jsonb);
          r := jsonb_build_object('parasite_shrunk', true, 'pay', v_pay);
        else null;
      end case;
      perform private.ench_stat(e.id, 'fired');
      if v_acc >= 0.95 then perform private.ench_stat(e.id, 'perfects'); end if;
      perform private.ench_xp(e.id, case when v_acc >= 0.95 then 2 else 1 end);
      perform private.ench_event(e.id, 'zap', jsonb_build_object('target', v_tg ->> 'type', 'accuracy', v_acc));
      r := r || jsonb_build_object('accuracy', v_acc, 'grade', case when v_acc >= 0.95 then 'PERFECT' when v_acc >= 0.8 then 'GREAT' when v_acc >= 0.5 then 'GOOD' else 'WIDE' end);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

create or replace function private.ench_view_sizeray(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare g jsonb := private.ray_eval(e, t);
begin
  return g || jsonb_build_object('server_time', extract(epoch from clock_timestamp()),
    'giants', coalesce((select jsonb_agg(jsonb_build_object('gx', gx, 'gy', gy, 'mult', mult, 'until', expires_at)) from public.enchant_buffs
                         where player_id = e.owner_id and kind = 'plot_giant' and expires_at > now()), '[]'::jsonb),
    'attention', case when (g ->> 'shots')::int >= 3 then 'Fully charged — fire away' end);
end $$;

-- ==== 🪞 MIRROR SHARD =================================================================================================
create or replace function private.ench_act_shard(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); r jsonb; v_o jsonb; v_pick jsonb; v_cracks int; v_lk jsonb; v_shat boolean := false;
begin
  case p_action
    when 'gaze' then
      if coalesce((s -> 'reflect' ->> 'until')::numeric, 0) > v_now then raise exception 'reflecting' using errcode = 'P0001'; end if;
      if coalesce((s ->> 'gazed_at')::numeric, 0) + private.ench_n('shard', 'cooldown_h', 20) * 3600 > v_now and jsonb_array_length(coalesce(s -> 'options', '[]'::jsonb)) = 0 then
        raise exception 'too_soon' using errcode = 'P0001'; end if;
      if jsonb_array_length(coalesce(s -> 'options', '[]'::jsonb)) = 0 then
        -- three other players' enchantments (one per kind), else dreams of kinds
        select coalesce(jsonb_agg(o.j), '[]'::jsonb) into v_o from (
          select jsonb_build_object('kind', x.kind, 'id', x.id, 'serial', x.serial, 'owner', x.owner_id, 'owner_name', pr.username, 'level', x.level) j
            from (select distinct on (kind) * from public.enchantments where status = 'active' and owner_id is not null and owner_id <> e.owner_id
                   and kind not in ('splice', 'shard') order by kind, random()) x join public.profiles pr on pr.id = x.owner_id
           order by random() limit 3) o;
        while jsonb_array_length(v_o) < 3 loop
          v_o := v_o || jsonb_build_array(jsonb_build_object('kind', (array['goose', 'genie', 'map', 'parasite', 'cuckoo', 'pandora', 'clockwork', 'sizeray'])[1 + floor(random() * 8)::int], 'dream', true));
        end loop;
        s := s || jsonb_build_object('options', v_o, 'gazed_at', v_now);
      end if;
      r := jsonb_build_object('options', s -> 'options');
    when 'step' then
      v_pick := s -> 'options' -> ((a ->> 'i')::int);
      if v_pick is null then raise exception 'not_found' using errcode = 'P0001'; end if;
      v_cracks := coalesce((s ->> 'cracks')::int, 0) + 1;
      s := s || jsonb_build_object('reflect', v_pick || jsonb_build_object('until', v_now + private.ench_n('shard', 'hours', 24) * 3600, 'from', v_now),
                                   'r', private.ench_init(v_pick ->> 'kind', t), 'options', '[]'::jsonb, 'cracks', v_cracks);
      if v_pick ->> 'owner' is not null then
        perform private.grant_ink_paced((v_pick ->> 'owner')::uuid, 3, 'enchantment', 'mirror_tip', e.id::text, null);
        perform private.notify((v_pick ->> 'owner')::uuid, 'enchant', e.owner_id, jsonb_build_object('sub', 'mirror_seen', 'kind', v_pick ->> 'kind', 'ink', 3));
      end if;
      perform private.ench_stat(e.id, 'reflections');
      perform private.ench_xp(e.id, 1);
      perform private.ench_event(e.id, 'reflect', jsonb_build_object('kind', v_pick ->> 'kind', 'owner', v_pick ->> 'owner_name'));
      if v_cracks >= 7 then
        v_shat := true; v_lk := private.ench_give_luck(e.owner_id, 20, 1);
        s := s || jsonb_build_object('cracks', 0);
        perform private.ench_stat(e.id, 'shatters');
        perform private.ench_event(e.id, 'shatter', '{}'::jsonb);
        insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'shatter', 'kind', 'shard', 'serial', e.serial));
      end if;
      r := jsonb_build_object('reflect', s -> 'reflect', 'shattered', v_shat);
    when 'release' then
      if coalesce((s -> 'reflect' ->> 'until')::numeric, 0) <= v_now then raise exception 'not_reflecting' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('reflect', null, 'r', null);
      r := jsonb_build_object('released', true);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

/** a reflection runs the reflected enchantment's rules on the shard's own row (its own state, under state.r) */
create or replace function private.ench_reflected(e public.enchantments, t timestamptz) returns public.enchantments language plpgsql stable as $$
declare x public.enchantments := e;
begin
  if e.kind <> 'shard' or coalesce((e.state -> 'reflect' ->> 'until')::numeric, 0) <= private.ench_ep(t) then return null; end if;
  x.kind := e.state -> 'reflect' ->> 'kind';
  x.state := coalesce(e.state -> 'r', '{}'::jsonb);
  return x;
end $$;

-- ---- init, views and the dispatcher ---------------------------------------------------------------------------------
create or replace function private.ench_init(p_kind text, t timestamptz) returns jsonb language sql stable as $$
  select case p_kind
    when 'goose' then jsonb_build_object('egg_at', private.ench_ep(t), 'polish', 0, 'chased', '[]'::jsonb, 'eggs', 0, 'streak', 0)
    when 'genie' then jsonb_build_object('wishes', 1, 'charge_at', private.ench_ep(t))
    when 'map' then jsonb_build_object('pieces', '[]'::jsonb, 'next_at', 0)
    when 'parasite' then jsonb_build_object('stage', 0, 'feeds', 0)
    when 'cuckoo' then jsonb_build_object('nests', '[]'::jsonb)
    when 'pandora' then jsonb_build_object('evils', '[]'::jsonb, 'cycle', 0)
    when 'splice' then jsonb_build_object('charges', 1, 'charge_at', private.ench_ep(t), 'codex', '[]'::jsonb)
    when 'clockwork' then jsonb_build_object('charge', 30, 'tick_at', private.ench_ep(t))
    when 'sizeray' then jsonb_build_object('shots', 1, 'shot_at', private.ench_ep(t))
    when 'shard' then jsonb_build_object('cracks', 0, 'options', '[]'::jsonb)
    else '{}'::jsonb end
$$;

create or replace function private.ench_kind_view(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
begin
  return case e.kind
    when 'goose' then private.ench_view_goose(e, t) when 'genie' then private.ench_view_genie(e, t) when 'map' then private.ench_view_map(e, t)
    when 'parasite' then private.ench_view_parasite(e, t) when 'cuckoo' then private.ench_view_cuckoo(e, t) when 'pandora' then private.ench_view_pandora(e, t)
    when 'splice' then private.ench_view_splice(e, t) when 'clockwork' then private.ench_view_clockwork(e, t) when 'sizeray' then private.ench_view_sizeray(e, t)
    when 'shard' then jsonb_build_object('cracks', coalesce((e.state ->> 'cracks')::int, 0), 'options', coalesce(e.state -> 'options', '[]'::jsonb),
      'reflect', case when coalesce((e.state -> 'reflect' ->> 'until')::numeric, 0) > private.ench_ep(t) then e.state -> 'reflect' end,
      'gaze_in', greatest(0, round(coalesce((e.state ->> 'gazed_at')::numeric, 0) + private.ench_n('shard', 'cooldown_h', 20) * 3600 - private.ench_ep(t))),
      'attention', case when coalesce((e.state -> 'reflect' ->> 'until')::numeric, 0) <= private.ench_ep(t)
                         and (jsonb_array_length(coalesce(e.state -> 'options', '[]'::jsonb)) > 0 or coalesce((e.state ->> 'gazed_at')::numeric, 0) + private.ench_n('shard', 'cooldown_h', 20) * 3600 <= private.ench_ep(t))
                        then 'The shard shows new reflections' end)
  end;
end $$;

create or replace function private.ench_titles(e public.enchantments) returns text[] language sql stable as $$
  select array_remove(array[
    case when e.level >= 5 then 'Awakened' end, case when e.level >= 10 then 'Ascended' end,
    case when e.kind = 'goose' and coalesce((e.stats ->> 'foxes')::int, 0) >= 10 then 'Fox-Bane' end,
    case when e.kind = 'goose' and coalesce((e.stats ->> 'eggs')::int, 0) >= 25 then 'Golden Hen' end,
    case when e.kind = 'goose' and coalesce((e.stats ->> 'best_streak')::int, 0) >= 7 then 'Unbroken' end,
    case when e.kind = 'goose' and coalesce((e.stats ->> 'platinum')::int, 0) >= 1 then 'Platinum' end,
    case when e.kind = 'genie' and coalesce((e.stats ->> 'forbidden')::int, 0) >= 1 then 'Forbidden' end,
    case when e.kind = 'genie' and coalesce((e.stats ->> 'wishes')::int, 0) >= 30 then 'Wishmaster' end,
    case when e.kind = 'genie' and coalesce((e.stats ->> 'freed')::int, 0) >= 1 then 'Liberator' end,
    case when e.kind = 'map' and coalesce((e.stats ->> 'maps')::int, 0) >= 5 then 'Cartographer' end,
    case when e.kind = 'map' and coalesce((e.stats ->> 'pieces')::int, 0) >= 40 then 'Pathfinder' end,
    case when e.kind = 'parasite' and coalesce((e.state ->> 'stage')::int, 0) >= 2 then 'Symbiote' end,
    case when e.kind = 'parasite' and coalesce((e.stats ->> 'feeds')::int, 0) >= 25 then 'Devourer' end,
    case when e.kind = 'cuckoo' and coalesce((e.stats ->> 'chicks')::int, 0) >= 5 then 'Brood Mother' end,
    case when e.kind = 'cuckoo' and coalesce((e.stats ->> 'chicks')::int, 0) >= 20 then 'Nest Thief' end,
    case when e.kind = 'pandora' and coalesce((e.stats ->> 'hope')::int, 0) >= 1 then 'Hope-Bringer' end,
    case when e.kind = 'splice' and coalesce((e.stats ->> 'splices')::int, 0) >= 10 then 'Mad Scientist' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'codex', '[]'::jsonb)) >= 36 then 'Chimera Codex' end,
    case when e.kind = 'clockwork' and coalesce((e.stats ->> 'winds')::int, 0) >= 100 then 'Timekeeper' end,
    case when e.kind = 'clockwork' and coalesce((e.stats ->> 'freezes')::int, 0) >= 10 then 'Stopwatch' end,
    case when e.kind = 'sizeray' and coalesce((e.stats ->> 'perfects')::int, 0) >= 10 then 'Sharpshooter' end,
    case when e.kind = 'sizeray' and coalesce((e.stats ->> 'fired')::int, 0) >= 50 then 'Big Bang' end,
    case when e.kind = 'shard' and coalesce((e.stats ->> 'shatters')::int, 0) >= 1 then 'Seven Years' end,
    case when e.kind = 'shard' and coalesce((e.stats ->> 'reflections')::int, 0) >= 20 then 'Many Faces' end], null)
$$;

/** the short card (roll result, lists, map) */
create or replace function private.ench_brief(p_id uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('id', e.id, 'kind', e.kind, 'serial', e.serial, 'sigil', e.sigil, 'nickname', e.nickname, 'level', e.level, 'gx', e.gx, 'gy', e.gy,
           'titles', to_jsonb(e.titles), 'born_place', e.born_place, 'born_at', e.born_at,
           'minted', (select n from private.enchant_serials where kind = e.kind),
           'population', (select count(*) from public.enchantments x where x.kind = e.kind and x.status <> 'gone'))
         || (private.ench_info(e.kind) - 'gene_name')
  from public.enchantments e where e.id = p_id
$$;

/** everything about one enchantment (its owner's view) */
create or replace function private.ench_view(p_id uuid) returns jsonb language plpgsql stable as $$
declare e public.enchantments; t timestamptz; x public.enchantments; v jsonb; v_kind jsonb; v_refl jsonb;
begin
  select * into e from public.enchantments where id = p_id;
  if e.id is null then return null; end if;
  t := private.ench_now(e);
  v_kind := private.ench_kind_view(e, t);
  x := private.ench_reflected(e, t);
  if x.id is not null then v_refl := private.ench_kind_view(x, t); end if;
  return private.ench_brief(e.id) || jsonb_build_object(
    'status', e.status, 'xp', e.xp, 'xp_next', 4 * power(e.level, 2), 'xp_prev', 4 * power(e.level - 1, 2), 'stats', e.stats,
    'owner', private.profile_json(e.owner_id), 'first_owner', private.profile_json(e.first_owner),
    'clock', jsonb_build_object('now', t, 'skip_s', round(e.clock_skip + private.ench_tempo(e.id)),
                                'frozen_until', case when e.frozen_at is not null and now() < e.frozen_until then e.frozen_until end),
    'partner', private.ench_partner(e.id), 'view', v_kind, 'reflected', v_refl, 'reflect_kind', x.kind,
    'attention', coalesce(v_refl ->> 'attention', v_kind ->> 'attention'), 'server_time', now());
end $$;

-- ---- public RPCs -----------------------------------------------------------------------------------------------------
create or replace function public.my_enchantments() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return coalesce((select jsonb_agg(private.ench_view(id) order by born_at) from (select id, born_at from public.enchantments where owner_id = v_uid and status = 'active' order by born_at limit 200) x), '[]'::jsonb);
end $$;

create or replace function public.enchant_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); e public.enchantments;
begin
  select * into e from public.enchantments where id = p_id;
  if e.id is null or e.status = 'gone' then raise exception 'not_found' using errcode = 'P0001'; end if;
  if e.owner_id = v_uid then return private.ench_view(e.id); end if;
  return private.ench_brief(e.id) || jsonb_build_object('status', e.status, 'owner', private.profile_json(e.owner_id), 'first_owner', private.profile_json(e.first_owner),
    'partner', private.ench_partner(e.id), 'stats', jsonb_build_object('ink', e.stats -> 'ink'), 'mine', false);
end $$;

create or replace function public.enchant_at(p_gx int, p_gy int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select private.ench_brief(id) || jsonb_build_object('owner', private.profile_json(owner_id), 'status', status, 'partner', private.ench_partner(id), 'mine', owner_id = auth.uid())
  from public.enchantments where gx = p_gx and gy = p_gy and status <> 'gone'
$$;

create or replace function public.enchant_act(p_id uuid, p_action text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); e public.enchantments; t timestamptz; x public.enchantments; v jsonb; a jsonb := coalesce(p_args, '{}'::jsonb);
begin
  perform private.rate_limit('enchant_act', 1500, 3600);
  select * into e from public.enchantments where id = p_id for update;
  if e.id is null or e.owner_id is distinct from v_uid or e.status <> 'active' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform private.ench_settle(e.id);
  select * into e from public.enchantments where id = p_id;
  t := private.ench_now(e);
  if p_action = 'rename' then
    update public.enchantments set nickname = nullif(left(trim(coalesce(a ->> 'name', '')), 24), ''), updated_at = now() where id = e.id;
    perform private.ench_event(e.id, 'named', jsonb_build_object('name', nullif(left(trim(coalesce(a ->> 'name', '')), 24), '')));
    return private.ench_view(e.id);
  end if;
  x := private.ench_reflected(e, t);
  if x.id is not null and p_action not in ('gaze', 'step', 'release') then
    -- a reflection: the reflected rules, on the shard's own reflected state
    v := case x.kind
      when 'goose' then private.ench_act_goose(x, p_action, a, t) when 'genie' then private.ench_act_genie(x, p_action, a, t) when 'map' then private.ench_act_map(x, p_action, a, t)
      when 'parasite' then private.ench_act_parasite(x, p_action, a, t) when 'cuckoo' then private.ench_act_cuckoo(x, p_action, a, t) when 'pandora' then private.ench_act_pandora(x, p_action, a, t)
      when 'clockwork' then private.ench_act_clockwork(x, p_action, a, t) when 'sizeray' then private.ench_act_sizeray(x, p_action, a, t) end;
    if v is null then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    update public.enchantments set state = state || jsonb_build_object('r', v -> 'state'), updated_at = now() where id = e.id;
  else
    v := case e.kind
      when 'goose' then private.ench_act_goose(e, p_action, a, t) when 'genie' then private.ench_act_genie(e, p_action, a, t) when 'map' then private.ench_act_map(e, p_action, a, t)
      when 'parasite' then private.ench_act_parasite(e, p_action, a, t) when 'cuckoo' then private.ench_act_cuckoo(e, p_action, a, t) when 'pandora' then private.ench_act_pandora(e, p_action, a, t)
      when 'splice' then private.ench_act_splice(e, p_action, a, t) when 'clockwork' then private.ench_act_clockwork(e, p_action, a, t)
      when 'sizeray' then private.ench_act_sizeray(e, p_action, a, t) when 'shard' then private.ench_act_shard(e, p_action, a, t) end;
    update public.enchantments set state = v -> 'state', updated_at = now() where id = e.id;
  end if;
  -- titles it earned
  select * into e from public.enchantments where id = p_id;
  if private.ench_titles(e) <> e.titles then
    perform private.ench_event(e.id, 'title', jsonb_build_object('titles', to_jsonb(array(select unnest(private.ench_titles(e)) except select unnest(e.titles)))));
    update public.enchantments set titles = private.ench_titles(e) where id = e.id;
  end if;
  return private.ench_view(e.id) || jsonb_build_object('result', v -> 'result', 'balances', private.balances(v_uid));
end $$;

create or replace function public.enchant_chronicle(p_id uuid, p_before bigint default null) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'data', data, 'at', created_at) order by id desc), '[]'::jsonb)
  from (select * from public.enchant_events where enchant_id = p_id and (p_before is null or id < p_before)
          and exists (select 1 from public.enchantments e where e.id = p_id and e.owner_id = auth.uid())
        order by id desc limit 40) x
$$;

/** what other players' enchantments are doing to your plots: parasites feeding, cuckoo eggs */
create or replace function public.enchant_visitors() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_now numeric;
begin
  return coalesce((select jsonb_agg(v order by v ->> 'at' desc) from (
    select jsonb_build_object('id', e.id, 'kind', case when e.kind = 'shard' then e.state -> 'reflect' ->> 'kind' else e.kind end, 'mirror', e.kind = 'shard',
             'owner', private.profile_json(e.owner_id), 'serial', e.serial,
             'stage', coalesce((st ->> 'stage')::int, 0), 'welcomed', coalesce((st -> 'host' ->> 'welcomed')::boolean, false),
             'gx', coalesce(st -> 'host' -> 'gx', st -> 'egg' -> 'gx'), 'gy', coalesce(st -> 'host' -> 'gy', st -> 'egg' -> 'gy'),
             'at', coalesce(st -> 'host' -> 'at', st -> 'egg' -> 'laid_at'), 'hatch_at', st -> 'egg' -> 'hatch_at',
             'what', case when jsonb_typeof(st -> 'host') = 'object' then 'parasite' else 'egg' end) v
      from public.enchantments e cross join lateral (select case when e.kind = 'shard' then coalesce(e.state -> 'r', '{}'::jsonb) else e.state end st) s
     where e.status = 'active' and e.kind in ('parasite', 'cuckoo', 'shard')
       and ((st -> 'host' ->> 'owner') = v_uid::text or (st -> 'egg' ->> 'owner') = v_uid::text)) x), '[]'::jsonb);
end $$;

/** shake a parasite off your plot, welcome a symbiote, or throw out a cuckoo's egg */
create or replace function public.enchant_visitor_act(p_id uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); e public.enchantments; st jsonb; v_shard boolean; r jsonb; v_now numeric; v_n jsonb; v_alt jsonb;
begin
  perform private.rate_limit('enchant_visitor', 300, 3600);
  select * into e from public.enchantments where id = p_id for update;
  if e.id is null or e.status <> 'active' then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_shard := e.kind = 'shard';
  st := case when v_shard then coalesce(e.state -> 'r', '{}'::jsonb) else e.state end;
  v_now := private.ench_ep(private.ench_now(e));
  case p_action
    when 'shake' then
      if (st -> 'host' ->> 'owner') is distinct from v_uid::text then raise exception 'not_found' using errcode = 'P0001'; end if;
      if coalesce((st ->> 'stage')::int, 0) >= 2 then raise exception 'symbiote' using errcode = 'P0001'; end if;
      st := st || jsonb_build_object('host', null, 'shaken', coalesce((st ->> 'shaken')::int, 0) + 1, 'rest_until', v_now + 3600);
      perform private.grant_ink_paced(v_uid, 6, 'enchantment', 'shake', e.id::text, null);
      perform private.notify(e.owner_id, 'enchant', v_uid, jsonb_build_object('sub', 'parasite_shaken', 'kind', 'parasite'));
      perform private.ench_event(e.id, 'shaken', jsonb_build_object('by', v_uid));
      r := jsonb_build_object('shaken', true, 'ink', 6);
    when 'welcome' then
      if (st -> 'host' ->> 'owner') is distinct from v_uid::text or coalesce((st ->> 'stage')::int, 0) < 2 then raise exception 'not_found' using errcode = 'P0001'; end if;
      st := jsonb_set(st, '{host,welcomed}', 'true'::jsonb);
      r := jsonb_build_object('welcomed', true);
    when 'eject' then
      if (st -> 'egg' ->> 'owner') is distinct from v_uid::text then raise exception 'not_found' using errcode = 'P0001'; end if;
      if private.ench_dodge(e.id) then
        -- a Trickster egg rolls on into a neighbour's nest
        v_alt := private.ench_hosts(e.owner_id, (st -> 'egg' ->> 'gx')::int, (st -> 'egg' ->> 'gy')::int, 1, 300) -> 0;
      end if;
      if v_alt is not null and (v_alt ->> 'owner') <> v_uid::text then
        st := jsonb_set(st, '{egg}', (st -> 'egg') || v_alt || jsonb_build_object('reward', round(40 * private.ench_rarity_factor(v_alt ->> 'rarity'))));
        r := jsonb_build_object('ejected', true, 'rolled_on', true, 'ink', 8);
      else
        st := st || jsonb_build_object('egg', null, 'lost', coalesce((st ->> 'lost')::int, 0) + 1);
        perform private.notify(e.owner_id, 'enchant', v_uid, jsonb_build_object('sub', 'cuckoo_ejected', 'kind', 'cuckoo'));
        r := jsonb_build_object('ejected', true, 'ink', 8);
      end if;
      perform private.grant_ink_paced(v_uid, 8, 'enchantment', 'eject', e.id::text, null);
      perform private.ench_event(e.id, 'ejected', jsonb_build_object('by', v_uid));
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  if v_shard then update public.enchantments set state = state || jsonb_build_object('r', st) where id = e.id;
  else update public.enchantments set state = st where id = e.id; end if;
  return jsonb_build_object('result', r, 'visitors', public.enchant_visitors(), 'balances', private.balances(v_uid));
end $$;

/** enchanted plots (and what they've attached to) in a map area */
create or replace function public.enchant_map(p_min_gx int, p_min_gy int, p_max_gx int, p_max_gy int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if p_max_gx - p_min_gx > 20000 or p_max_gy - p_min_gy > 20000 then return jsonb_build_object('plots', '[]'::jsonb, 'attached', '[]'::jsonb, 'giants', '[]'::jsonb); end if;
  return jsonb_build_object(
    'plots', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'gx', e.gx, 'gy', e.gy, 'kind', e.kind, 'serial', e.serial, 'level', e.level, 'nickname', e.nickname,
                         'status', e.status, 'mine', e.owner_id = v_uid, 'owner_name', pr.username, 'sigil', e.sigil,
                         'partner', (private.ench_partner(e.id) ->> 'kind'), 'frozen', e.frozen_at is not null and now() < e.frozen_until,
                         'reflect', case when e.kind = 'shard' and coalesce((e.state -> 'reflect' ->> 'until')::numeric, 0) > private.ench_ep(private.ench_now(e)) then e.state -> 'reflect' ->> 'kind' end))
                       from public.enchantments e left join public.profiles pr on pr.id = e.owner_id
                      where e.status <> 'gone' and e.gx between p_min_gx and p_max_gx and e.gy between p_min_gy and p_max_gy limit 300), '[]'::jsonb),
    'attached', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'what', case when jsonb_typeof(st -> 'host') = 'object' then 'parasite' else 'egg' end,
                         'stage', coalesce((st ->> 'stage')::int, 0), 'gx', coalesce(st -> 'host' -> 'gx', st -> 'egg' -> 'gx'), 'gy', coalesce(st -> 'host' -> 'gy', st -> 'egg' -> 'gy'),
                         'mine', e.owner_id = v_uid, 'on_mine', coalesce(st -> 'host' ->> 'owner', st -> 'egg' ->> 'owner') = v_uid::text))
                       from public.enchantments e cross join lateral (select case when e.kind = 'shard' then coalesce(e.state -> 'r', '{}'::jsonb) else e.state end st) s
                      where e.status = 'active' and e.kind in ('parasite', 'cuckoo', 'shard')
                        and coalesce((st -> 'host' ->> 'gx')::int, (st -> 'egg' ->> 'gx')::int) between p_min_gx and p_max_gx
                        and coalesce((st -> 'host' ->> 'gy')::int, (st -> 'egg' ->> 'gy')::int) between p_min_gy and p_max_gy
                        -- a sneaky egg only shows to its layer and to a host who spotted it
                        and (jsonb_typeof(st -> 'host') = 'object' or e.owner_id = v_uid or coalesce((st -> 'egg' ->> 'spotted')::boolean, false))), '[]'::jsonb),
    'giants', coalesce((select jsonb_agg(jsonb_build_object('gx', gx, 'gy', gy, 'mult', mult)) from public.enchant_buffs
                        where kind = 'plot_giant' and expires_at > now() and gx between p_min_gx and p_max_gx and gy between p_min_gy and p_max_gy), '[]'::jsonb));
end $$;

/** the ten kinds: how many exist, how many are yours, and your Splice Codex */
create or replace function public.enchant_bestiary() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  return jsonb_build_object('kinds', (select jsonb_agg(private.ench_info(k) || jsonb_build_object('kind', k,
             'population', (select count(*) from public.enchantments where kind = k and status <> 'gone'),
             'minted', coalesce((select n from private.enchant_serials where kind = k), 0),
             'mine', (select count(*) from public.enchantments where kind = k and status = 'active' and owner_id = v_uid)) order by o)
           from unnest(array['goose', 'genie', 'map', 'parasite', 'cuckoo', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard']) with ordinality u(k, o)),
    'codex', coalesce((select jsonb_agg(distinct c) from public.enchantments e cross join lateral jsonb_array_elements_text(coalesce(e.state -> 'codex', '[]'::jsonb)) c
                       where e.owner_id = v_uid and e.kind = 'splice'), '[]'::jsonb),
    'chance', (select jsonb_build_object('base', coalesce((private.ench_cfg() ->> 'base_pct')::numeric, 2),
                 'charges', coalesce((select enchant from public.player_luck where player_id = v_uid), 0),
                 'step', coalesce((private.ench_cfg() ->> 'luck_pct')::numeric, 2))));
end $$;

/** the owner gives a player an enchanted plot (an event prize, or to make up for a problem) */
create or replace function public.admin_give_enchantment(p_player uuid, p_kind text, p_reason text, p_near_gx int default null, p_near_gy int default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); v jsonb; e public.enchantments;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if private.ench_info(p_kind) is null then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  v := public.admin_give_plot(p_player, 'common', false, null, p_reason, false, p_near_gx, p_near_gy);
  update public.world_plots set rarity = 'enchanted' where gx = (v ->> 'gx')::int and gy = (v ->> 'gy')::int;
  e := private.ench_create(p_kind, p_player, (v ->> 'gx')::int, (v ->> 'gy')::int);
  perform private.audit('enchant.given', 'player', p_player::text, jsonb_build_object('kind', p_kind, 'id', e.id, 'reason', p_reason));
  return private.ench_brief(e.id);
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.my_enchantments()', 'public.enchant_get(uuid)', 'public.enchant_at(integer, integer)', 'public.enchant_act(uuid, text, jsonb)',
                           'public.enchant_chronicle(uuid, bigint)', 'public.enchant_visitors()', 'public.enchant_visitor_act(uuid, text)',
                           'public.admin_give_enchantment(uuid, text, text, integer, integer)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['public.enchant_map(integer, integer, integer, integer)', 'public.enchant_bestiary()'] loop
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

-- ---- the owner's Enchantments settings (Admin → Earnings) are checked before they're saved -------------------------
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_config_set(text,jsonb)'::regprocedure);
  n := replace(d, $a$  if p_key = 'rent' then$a$, $a$  if p_key = 'enchantments' and (
       jsonb_typeof(coalesce(p_value -> 'enabled', 'true'::jsonb)) <> 'boolean'
    or coalesce((p_value ->> 'base_pct')::numeric, -1) not between 0 and 100
    or coalesce((p_value ->> 'luck_pct')::numeric, -1) not between 0 and 100
    or coalesce((p_value ->> 'luck_ink')::numeric, 0) not between 1 and 1000000
    or coalesce((p_value ->> 'luck_max')::numeric, -1) not between 0 and 100
    or coalesce((p_value ->> 'level_bonus')::numeric, 0.06) not between 0 and 1
    or coalesce((p_value ->> 'max_level')::numeric, 10) not between 1 and 10
    or jsonb_typeof(coalesce(p_value -> 'weights', '{}'::jsonb)) <> 'object'
    or exists (select 1 from jsonb_each(coalesce(p_value -> 'weights', '{}'::jsonb)) w
               where jsonb_typeof(w.value) <> 'number' or (w.value #>> '{}')::numeric < 0 or (w.value #>> '{}')::numeric > 1000)) then
    raise exception 'invalid_enchant_config' using errcode = 'P0001';
  end if;
  if p_key = 'rent' then$a$);
  if position('invalid_enchant_config' in n) = 0 then raise exception 'enchantments: admin_config_set anchor not found'; end if;
  execute n;
end $$;
