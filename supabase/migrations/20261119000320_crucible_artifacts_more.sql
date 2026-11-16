-- The Crucible forges four new artifacts (eight in all), and owning one of each is the Grand Set.
--
--  🪺 Golden Nest      carried — your Golden Goose's eggs pay +6% a level (up to +30%).
--  🪨 Lodestone        on a plot — pulls Ink to the plots around it: +4% a level minigame Ink on every plot of yours in
--                      the 3×3 around it (stacks with a Lantern and inlays).
--  🪶 Phoenix Feather  carried — a missed strike keeps more of the Heat: +8% a level (half becomes up to 90%; Steady
--                      keeps up to 95%; Fury still risks it all).
--  🏺 Ink Amphora      carried — fills with Ink every day: 6 Ink a level when you collect (with the horseshoes' Luck).
--
-- You can carry four now (there are five to carry). The Smith's Set (four different kinds: +5% enchantment Ink) is joined
-- by the Grand Set: all eight kinds, +10%.

alter table public.crucible_artifacts drop constraint if exists crucible_artifacts_kind_check;
alter table public.crucible_artifacts add constraint crucible_artifacts_kind_check
  check (kind in ('horseshoe', 'bell', 'lantern', 'anchor', 'nest', 'lodestone', 'feather', 'amphora'));

/** the kinds you carry (the rest go on a plot) */
create or replace function private.cru_carried_kinds() returns text[] language sql immutable as $$
  select array['horseshoe', 'bell', 'nest', 'feather', 'amphora']
$$;

create or replace function private.cru_recipes() returns jsonb language sql immutable as $$
  select '{"runes": {"steady": {"silver": 3}, "fury": {"gold": 2}, "kind": {"copper": 4}},
           "artifacts": {"horseshoe": {"iron": 6}, "bell": {"silver": 4, "iron": 2}, "lantern": {"gold": 3, "silver": 2}, "anchor": {"platinum": 2, "gold": 2},
                         "nest": {"gold": 3, "copper": 3}, "lodestone": {"iron": 4, "copper": 3}, "feather": {"copper": 3, "gold": 2}, "amphora": {"silver": 3, "copper": 3}},
           "inlay": 2,
           "points": {"iron": 1, "copper": 2, "silver": 4, "gold": 8, "platinum": 16, "starsteel": 32},
           "tiers": [10, 60, 250, 1000],
           "inlay_bonus": {"iron": 0.03, "copper": 0.04, "silver": 0.06, "gold": 0.08, "platinum": 0.11, "starsteel": 0.15},
           "carry": 4}'::jsonb
$$;

/** what each one does, at its level */
create or replace function private.cru_artifact_power(p_kind text, p_level int) returns numeric language sql immutable as $$
  select case p_kind when 'horseshoe' then 1 + p_level
                     when 'bell' then 0.15 + 0.05 * (p_level - 1)
                     when 'lantern' then 0.10 + 0.05 * (p_level - 1)
                     when 'nest' then 0.06 * p_level
                     when 'lodestone' then 0.04 * p_level
                     when 'feather' then 0.08 * p_level
                     when 'amphora' then 6 * p_level
                     else 0 end
$$;

create or replace function private.cru_artifact_json(a public.crucible_artifacts) returns jsonb language sql stable as $$
  select jsonb_build_object('id', a.id, 'kind', a.kind, 'level', a.level, 'gx', a.gx, 'gy', a.gy, 'carried', a.carried,
    'power', case a.kind when 'horseshoe' then (1 + a.level) || ' Luck a day'
                         when 'bell' then '+' || round((0.15 + 0.05 * (a.level - 1)) * 100) || '% damage on the Leviathan'
                         when 'lantern' then '+' || round((0.10 + 0.05 * (a.level - 1)) * 100) || '% minigame Ink on its plot'
                         when 'nest' then '+' || round(private.cru_artifact_power('nest', a.level) * 100) || '% Ink from your Golden Goose''s eggs'
                         when 'lodestone' then '+' || round(private.cru_artifact_power('lodestone', a.level) * 100) || '% minigame Ink on your plots around it (3×3)'
                         when 'feather' then 'A missed strike keeps +' || round(private.cru_artifact_power('feather', a.level) * 100) || '% more Heat'
                         when 'amphora' then private.cru_artifact_power('amphora', a.level)::int || ' Ink a day'
                         else 'No Parasites or pranks on its plot' end)
$$;

/** all eight kinds */
create or replace function private.cru_grand(p_uid uuid) returns boolean language sql stable as $$
  select (select count(distinct kind) from public.crucible_artifacts where player_id = p_uid) >= 8
$$;

-- 🪨 the Lodestone pulls Ink to your plots around it
create or replace function private.forge_plot_mult(p_uid uuid, p_gx int, p_gy int) returns numeric language sql stable as $$
  select (1 + coalesce((select (private.cru_recipes() -> 'inlay_bonus' ->> i.metal)::numeric from public.crucible_inlays i where i.gx = p_gx and i.gy = p_gy and i.player_id = p_uid), 0))
       * (1 + coalesce((select 0.10 + 0.05 * (a.level - 1) from public.crucible_artifacts a where a.gx = p_gx and a.gy = p_gy and a.player_id = p_uid and a.kind = 'lantern'), 0))
       * (1 + coalesce((select sum(private.cru_artifact_power('lodestone', a.level)) from public.crucible_artifacts a
                         where a.player_id = p_uid and a.kind = 'lodestone' and a.gx between p_gx - 1 and p_gx + 1 and a.gy between p_gy - 1 and p_gy + 1), 0))
       * coalesce((select max(b.mult) from public.enchant_buffs b where b.kind = 'crease' and b.gx = p_gx and b.gy = p_gy and b.player_id = p_uid and b.expires_at > now()), 1)
$$;

-- ---- the Crucible's own actions ------------------------------------------------------------------------------------
-- forge any of the eight
select private.fn_patch('private.ench_act_crucible(public.enchantments,text,jsonb,timestamptz)',
  $a$if v_m not in ('horseshoe', 'bell', 'lantern', 'anchor') then raise exception 'invalid_action'$a$,
  $b$if v_m not in ('horseshoe', 'bell', 'lantern', 'anchor', 'nest', 'lodestone', 'feather', 'amphora') then raise exception 'invalid_action'$b$);
-- carry the five that are carried, four at once
select private.fn_patch('private.ench_act_crucible(public.enchantments,text,jsonb,timestamptz)',
  $a$      if art.kind in ('horseshoe', 'bell') then$a$, $b$      if art.kind = any (private.cru_carried_kinds()) then$b$);
select private.fn_patch('private.ench_act_crucible(public.enchantments,text,jsonb,timestamptz)',
  $a$where player_id = e.owner_id and carried) >= 3 then raise exception 'hands_full'$a$,
  $b$where player_id = e.owner_id and carried) >= coalesce((private.cru_recipes() ->> 'carry')::int, 4) then raise exception 'hands_full'$b$);
-- 🪶 a missed strike keeps more of the Heat
select private.fn_patch('private.ench_act_crucible(public.enchantments,text,jsonb,timestamptz)',
  $a$        v_keep := case when v_rune = 'fury' then 0 when v_rune = 'steady' then 0.75 else 0.5 end;$a$,
  $b$        v_keep := case when v_rune = 'fury' then 0 when v_rune = 'steady' then 0.75 else 0.5 end;
        if v_rune is distinct from 'fury' then
          v_keep := least(case when v_rune = 'steady' then 0.95 else 0.9 end, v_keep + coalesce((select sum(private.cru_artifact_power('feather', x.level))
                      from public.crucible_artifacts x where x.player_id = e.owner_id and x.kind = 'feather' and x.carried), 0));
        end if;$b$);
-- 🏺 collecting: the horseshoes' Luck and the amphoras' Ink
select private.fn_patch('private.ench_act_crucible(public.enchantments,text,jsonb,timestamptz)',
  $a$      select coalesce(sum(1 + level), 0) into v_cnt from public.crucible_artifacts where player_id = e.owner_id and kind = 'horseshoe' and carried;
      if v_cnt = 0 then raise exception 'no_horseshoe' using errcode = 'P0001'; end if;
      v_lk := private.ench_give_luck(e.owner_id, v_cnt, 0);
      s := s || jsonb_build_object('tend_day', v_day);
      perform private.ench_event(e.id, 'tended', jsonb_build_object('luck', v_cnt));
      r := jsonb_build_object('luck', v_cnt, 'given', v_lk);$a$,
  $b$      select coalesce(sum(1 + level), 0) into v_cnt from public.crucible_artifacts where player_id = e.owner_id and kind = 'horseshoe' and carried;
      select coalesce(sum(private.cru_artifact_power('amphora', level)), 0)::int into v_pts from public.crucible_artifacts where player_id = e.owner_id and kind = 'amphora' and carried;
      if v_cnt = 0 and v_pts = 0 then raise exception 'no_horseshoe' using errcode = 'P0001'; end if;
      if v_cnt > 0 then v_lk := private.ench_give_luck(e.owner_id, v_cnt, 0); end if;
      if v_pts > 0 then v_pts := private.grant_ink_paced(e.owner_id, v_pts, 'enchantment', 'enchantment', e.id::text, null); perform private.ench_stat(e.id, 'ink', v_pts); end if;
      s := s || jsonb_build_object('tend_day', v_day);
      perform private.ench_event(e.id, 'tended', jsonb_build_object('luck', v_cnt, 'ink', v_pts));
      r := jsonb_build_object('luck', v_cnt, 'given', v_lk, 'ink', v_pts, 'balances', private.balances(e.owner_id));$b$);

-- the Crucible's screen: the Grand Set, and the amphoras count toward "something to collect"
select private.fn_patch('private.ench_view_crucible(public.enchantments,timestamptz)',
  $a$'tend_ready', coalesce(s ->> 'tend_day', '') <> private.today()::text and exists (select 1 from public.crucible_artifacts where player_id = e.owner_id and kind = 'horseshoe' and carried),$a$,
  $b$'tend_ready', coalesce(s ->> 'tend_day', '') <> private.today()::text and exists (select 1 from public.crucible_artifacts where player_id = e.owner_id and kind in ('horseshoe', 'amphora') and carried),
    'grand', private.cru_grand(e.owner_id), 'carry', coalesce((private.cru_recipes() ->> 'carry')::int, 4),
    'kinds_owned', (select count(distinct kind) from public.crucible_artifacts where player_id = e.owner_id),$b$);
select private.fn_patch('private.ench_view_crucible(public.enchantments,timestamptz)',
  $a$    'attention', case when coalesce(s ->> 'tend_day', '') <> private.today()::text and exists (select 1 from public.crucible_artifacts where player_id = e.owner_id and kind = 'horseshoe' and carried)
                      then 'Your horseshoes have Luck for you'$a$,
  $b$    'attention', case when coalesce(s ->> 'tend_day', '') <> private.today()::text and exists (select 1 from public.crucible_artifacts where player_id = e.owner_id and kind in ('horseshoe', 'amphora') and carried)
                      then 'Your artifacts have gifts for you'$b$);

-- ---- what enchantments pay -----------------------------------------------------------------------------------------
-- 🪺 the Golden Nest for the goose's eggs, and the Grand Set
select private.fn_patch('private.ench_pay(uuid,numeric,text)',
  $a$  if private.cru_set(e.owner_id) then v := v * 1.05; v_mods := v_mods || jsonb_build_object('label', 'Smith’s Set +5%', 'emoji', '⚒️'); end if;$a$,
  $b$  if private.cru_grand(e.owner_id) then v := v * 1.10; v_mods := v_mods || jsonb_build_object('label', 'Grand Set +10%', 'emoji', '🏆');
  elsif private.cru_set(e.owner_id) then v := v * 1.05; v_mods := v_mods || jsonb_build_object('label', 'Smith’s Set +5%', 'emoji', '⚒️'); end if;
  if e.kind = 'goose' then
    select sum(private.cru_artifact_power('nest', x.level)) into v_x from public.crucible_artifacts x where x.player_id = e.owner_id and x.kind = 'nest' and x.carried;
    if coalesce(v_x, 0) > 0 then v := v * (1 + v_x); v_mods := v_mods || jsonb_build_object('label', 'Golden Nest +' || round(v_x * 100) || '%', 'emoji', '🪺'); end if;
  end if;$b$);
