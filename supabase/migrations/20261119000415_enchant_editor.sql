-- The Enchantment editor (admin portal → Enchantments): every number that shapes an enchantment, adjustable live.
--
--  • Every tunable is found in the live code itself: each private.ench_n('<kind>', '<key>', <default>) call is a number
--    the owner can override (game_config 'enchantments' → <kind> → <key>). Nothing has to be listed by hand, so a
--    tunable added later shows up in the editor by itself — with the line of code it sits on.
--  • Power dials for every enchantment (ench_n(<its kind>, …)): all the Ink it pays ×, the bonus per star, the level
--    bonus ×, how fast it levels (XP ×) and the Luck its actions give ×.
--  • The Pocket Sun, every number: its star powers (★1 wider, ★2 longer, ★3 a second sun, ★4 steady, ★5 supernova),
--    heat tiers and how they shrink and burn, the Solar Flare's seconds, the party share, Radiant, orbit speed-up.
--  • The Genie's wishes: Ink, Luck, Golden Hour, the gift, the weekly boon, the Forbidden Wish's odds and price.
--  • Words: each enchantment's tagline, how-it-works lines and its five star powers (name, emoji, text), so what players
--    read matches the numbers (game_config 'enchant_texts').
--  • admin_enchant_editor() / admin_set_enchant_tuning() / admin_set_enchant_texts() (economy), audited as
--    'enchant.tune' / 'enchant.texts'; public.enchant_texts() for the game.

-- ---- every tunable, found in the live code ---------------------------------------------------------------------------
/** each ench_n call in the database: its kind ('*' = every kind: the power dials), key, default, functions and a line */
create or replace function private.ench_tunables()
returns table (kind text, key text, def numeric, fns text[], line text) language sql stable as $$
  with lines as (
    select p.proname::text as fn, l.ln
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
           regexp_split_to_table(p.prosrc, E'\n') as l(ln)
     where n.nspname in ('private', 'public') and p.prosrc like '%ench_n(%' and l.ln like '%ench_n(%'
       and p.proname not in ('ench_n', 'ench_tunables')),
  hits as (
    select l.fn, btrim(l.ln) as ln, m[1] as k1, m[2] as key, m[3] as def
      from lines l, regexp_matches(l.ln, $r$ench_n\(\s*('[a-z_]+'|[a-z_.]+)\s*,\s*'([a-z0-9_]+)'\s*,\s*(-?[0-9]+(?:\.[0-9]+)?)\s*\)$r$, 'g') m)
  select case when left(h.k1, 1) = '''' then btrim(h.k1, '''') else '*' end as kind, h.key,
         (array_agg(h.def::numeric order by h.fn))[1] as def, array_agg(distinct h.fn) as fns, left((array_agg(h.ln order by length(h.ln)))[1], 220) as line
    from hits h
   group by 1, 2
$$;
revoke all on function private.ench_tunables() from public;

-- ---- power dials for every enchantment ---------------------------------------------------------------------------
-- 💰 all the Ink it pays ×; ⭐ the bonus per star (+10% each); the level bonus ×
select private.fn_patch('private.ench_pay(uuid,numeric,text)',
  $a$  select * into e from public.enchantments where id = p_id;$a$,
  $b$  select * into e from public.enchantments where id = p_id;
  -- (the owner's dial: all the Ink this kind pays)
  v := v * greatest(private.ench_n(e.kind, 'pay_x', 1), 0);$b$);
select private.fn_patch('private.ench_pay(uuid,numeric,text)',
  $a$    v := v * (1 + coalesce((private.ench_cfg() ->> 'level_bonus')::numeric, 0.06) * (e.level - 1));$a$,
  $b$    v := v * (1 + coalesce((private.ench_cfg() ->> 'level_bonus')::numeric, 0.06) * private.ench_n(e.kind, 'level_pay_x', 1) * (e.level - 1));$b$);
select private.fn_patch('private.ench_pay(uuid,numeric,text)',
  $a$    v := v * (1 + 0.1 * e.stars);
    v_mods := v_mods || jsonb_build_object('label', repeat('★', e.stars) || ' +' || (10 * e.stars) || '%', 'emoji', '🌟');$a$,
  $b$    v := v * (1 + private.ench_n(e.kind, 'star_pay', 0.1) * e.stars);
    v_mods := v_mods || jsonb_build_object('label', repeat('★', e.stars) || ' +' || round(100 * private.ench_n(e.kind, 'star_pay', 0.1) * e.stars) || '%', 'emoji', '🌟');$b$);
-- 📈 how fast it levels
select private.fn_patch('private.ench_xp(uuid,integer)',
  $a$  update public.enchantments set xp = xp + p_n where id = p_id returning xp, level into v_xp, v_lv;$a$,
  $b$  update public.enchantments set xp = xp + greatest(0, round(p_n * private.ench_n(kind, 'xp_x', 1)))::int where id = p_id returning xp, level into v_xp, v_lv;$b$);
-- 🍀 the Luck its actions give (the kind acting is known for the length of the action)
select private.fn_patch('public.enchant_act(uuid,text,jsonb)',
  $a$  x := private.ench_reflected(e, t);$a$,
  $b$  x := private.ench_reflected(e, t);
  perform set_config('landvas.ench_kind', coalesce(x.kind, e.kind), true);$b$);
select private.fn_patch('private.ench_give_luck(uuid,integer,integer)',
  $a$declare v_max int := coalesce((private.cfg('luck') ->> 'max')::int, 100);$a$,
  $b$declare v_max int := coalesce((private.cfg('luck') ->> 'max')::int, 100);
  v_k text := nullif(current_setting('landvas.ench_kind', true), ''); v_lx numeric := greatest(private.ench_n(v_k, 'luck_x', 1), 0);$b$);
select private.fn_patch('private.ench_give_luck(uuid,integer,integer)',
  $a$luck = least(v_max, luck + greatest(p_luck, 0))$a$,
  $b$luck = least(v_max, luck + greatest(round(p_luck * v_lx)::int, 0))$b$);

-- ---- ☀️ the Pocket Sun, every number ----------------------------------------------------------------------------------
-- its star powers: ★1 Corona (wider), ★2 Long Day (longer), ★3 Binary Star (another sun, another a day)
select private.fn_patch('private.sun_eval(public.enchantments,timestamptz)',
  $a$  v_per := private.ench_n('sun', 'per_day', 1)::int + case when e.stars >= 3 then 1 else 0 end;
  v_max := 1 + case when e.stars >= 3 then 1 else 0 end;$a$,
  $b$  v_per := private.ench_n('sun', 'per_day', 1)::int + case when e.stars >= 3 then private.ench_n('sun', 'star3_per_day', 1)::int else 0 end;
  v_max := private.ench_n('sun', 'max_suns', 1)::int + case when e.stars >= 3 then private.ench_n('sun', 'star3_suns', 1)::int else 0 end;$b$);
select private.fn_patch('private.sun_eval(public.enchantments,timestamptz)',
  $a$                * case when e.stars >= 1 then 1.5 else 1 end),$a$,
  $b$                * case when e.stars >= 1 then private.ench_n('sun', 'star1_r_x', 1.5) else 1 end),$b$);
select private.fn_patch('private.sun_eval(public.enchantments,timestamptz)',
  $a$'fuel_h', private.ench_n('sun', 'fuel_h', 6) * case when e.stars >= 2 then 2 else 1 end,$a$,
  $b$'fuel_h', private.ench_n('sun', 'fuel_h', 6) * case when e.stars >= 2 then private.ench_n('sun', 'star2_fuel_x', 2) else 1 end,$b$);
-- ★4 Solar Wind (steady white-hot, full share for the party) and ★5 Supernova: at which star they come (6 = never)
select private.fn_patch('private.ench_act_sun(public.enchantments,text,jsonb,timestamptz)',
  $a$'heat', 30, 'heat_at', v_ep,$a$,
  $b$'heat', private.ench_n('sun', 'start_heat', 30), 'heat_at', v_ep,$b$);
select private.fn_patch('private.ench_act_sun(public.enchantments,text,jsonb,timestamptz)',
  $a$'steady', e.stars >= 4, 'full_party', e.stars >= 4, 'nova', e.stars >= 5);$a$,
  $b$'steady', e.stars >= private.ench_n('sun', 'steady_star', 4), 'full_party', e.stars >= private.ench_n('sun', 'full_party_star', 4),
             'nova', e.stars >= private.ench_n('sun', 'nova_star', 5));$b$);
-- the Solar Flare: how long each grade lasts
select private.fn_patch('private.ench_act_sun(public.enchantments,text,jsonb,timestamptz)',
  $a$v_secs := case v_grade when 'PERFECT' then 120 when 'GREAT' then 90 when 'GOOD' then 75 else 60 end;$a$,
  $b$v_secs := (case v_grade when 'PERFECT' then private.ench_n('sun', 'flare_perfect_s', 120) when 'GREAT' then private.ench_n('sun', 'flare_great_s', 90)
                         when 'GOOD' then private.ench_n('sun', 'flare_good_s', 75) else private.ench_n('sun', 'flare_wide_s', 60) end)::int;$b$);
-- the heat: how fast it cools, where Hot and White-hot begin, how much they shrink, how fast white-hot burns fuel
select private.fn_patch('private.sun_zone(jsonb,numeric)',
  $a$  v_steady boolean; v_fuel numeric; v_nova numeric; v_hout numeric; v_len numeric := private.ench_n('sun', 'nova_s', 900);$a$,
  $b$  v_steady boolean; v_fuel numeric; v_nova numeric; v_hout numeric; v_len numeric := private.ench_n('sun', 'nova_s', 900);
  v_cool numeric := greatest(private.ench_n('sun', 'cool_per_h', 6), 0.01); v_wh numeric := private.ench_n('sun', 'white_heat', 90);
  v_hh numeric := private.ench_n('sun', 'hot_heat', 50); v_burn numeric := greatest(private.ench_n('sun', 'white_burn', 2), 1);$b$);
select private.fn_patch('private.sun_zone(jsonb,numeric)',
  $a$  v_heat := case when v_h0 <= 30 then v_h0 else greatest(30, v_h0 - 6 * v_dt / 3600) end;$a$,
  $b$  v_heat := case when v_h0 <= 30 then v_h0 else greatest(30, v_h0 - v_cool * v_dt / 3600) end;$b$);
select private.fn_patch('private.sun_zone(jsonb,numeric)',
  $a$  v_w := case when v_h0 >= 90 and not v_steady then least(v_dt, (v_h0 - 90) / 6 * 3600) else 0 end;
  v_used := 2 * v_w + (v_dt - v_w);$a$,
  $b$  v_w := case when v_h0 >= v_wh and not v_steady then least(v_dt, (v_h0 - v_wh) / v_cool * 3600) else 0 end;
  v_used := v_burn * v_w + (v_dt - v_w);$b$);
select private.fn_patch('private.sun_zone(jsonb,numeric)',
  $a$      v_hout := case when v_h0 <= 30 then v_h0 else greatest(30, v_h0 - 6 * v_fuel / 3600) end;
      if v_hout >= 90 then$a$,
  $b$      v_hout := case when v_h0 <= 30 then v_h0 else greatest(30, v_h0 - v_cool * v_fuel / 3600) end;
      if v_hout >= v_wh then$b$);
select private.fn_patch('private.sun_zone(jsonb,numeric)',
  $a$'r_m', round(coalesce((z ->> 'r0')::numeric, 150) * 2),$a$,
  $b$'r_m', round(coalesce((z ->> 'r0')::numeric, 150) * private.ench_n('sun', 'nova_r_x', 2)),$b$);
select private.fn_patch('private.sun_zone(jsonb,numeric)',
  $a$  v_tier := case when v_heat >= 90 then 'white' when v_heat >= 50 then 'hot' else 'warm' end;
  v_r := coalesce((z ->> 'r0')::numeric, 150) * case v_tier when 'white' then 0.5 when 'hot' then 0.75 else 1 end;
  v_white := case when v_heat >= 90 and not v_steady then (v_heat - 90) / 6 * 3600 else 0 end;
  v_until := case when v_left <= 0 then p_ep when v_left <= 2 * v_white then p_ep + v_left / 2 else p_ep + v_white + (v_left - 2 * v_white) end;$a$,
  $b$  v_tier := case when v_heat >= v_wh then 'white' when v_heat >= v_hh then 'hot' else 'warm' end;
  v_r := coalesce((z ->> 'r0')::numeric, 150) * case v_tier when 'white' then private.ench_n('sun', 'white_r_x', 0.5) when 'hot' then private.ench_n('sun', 'hot_r_x', 0.75) else 1 end;
  v_white := case when v_heat >= v_wh and not v_steady then (v_heat - v_wh) / v_cool * 3600 else 0 end;
  v_until := case when v_left <= 0 then p_ep when v_left <= v_burn * v_white then p_ep + v_left / v_burn else p_ep + v_white + (v_left - v_burn * v_white) end;$b$);
-- claims: a party mate's share (without ★4), Radiant's boost per strength
select private.fn_patch('private.sun_for_claim(uuid,integer,integer)',
  $a$then v_m := 1 + (v_m - 1) / 2; end if;$a$,
  $b$then v_m := 1 + (v_m - 1) * private.ench_n('sun', 'party_share', 0.5); end if;$b$);
select private.fn_patch('private.sun_for_claim(uuid,integer,integer)',
  $a$    v_m := 1 + 0.5 * least(r.k, 3);$a$,
  $b$    v_m := 1 + private.ench_n('sun', 'radiant_x', 0.5) * least(r.k, 3);$b$);
-- in orbit: how much faster your enchantments under it tick
select private.fn_patch('private.sun_warm_tick()',
  $a$set clock_skip = clock_skip + 0.1 * v_dt$a$,
  $b$set clock_skip = clock_skip + private.ench_n('sun', 'orbit_tick', 0.1) * v_dt$b$);

-- ---- 🧞 the Genie's wishes -------------------------------------------------------------------------------------------
-- how many it holds (and its star powers: ★1 one more, ★4 two more and faster)
select private.fn_patch('private.genie_eval(public.enchantments,timestamptz)',
  $a$v_rech numeric := private.ench_n('genie', 'recharge_h', 8) * 3600 * case when e.stars >= 4 then 0.75 else 1 end; v_max int := 3 + case when e.stars >= 4 then 2 when e.stars >= 1 then 1 else 0 end;$a$,
  $b$v_rech numeric := private.ench_n('genie', 'recharge_h', 8) * 3600 * case when e.stars >= 4 then private.ench_n('genie', 'star4_recharge_x', 0.75) else 1 end;
  v_max int := private.ench_n('genie', 'wishes', 3)::int + case when e.stars >= 4 then private.ench_n('genie', 'star4_wishes', 2)::int when e.stars >= 1 then private.ench_n('genie', 'star1_wishes', 1)::int else 0 end;$b$);
select private.fn_patch('private.genie_eval(public.enchantments,timestamptz)',
  $a$coalesce((s ->> 'boon_at')::numeric, 0) + 7 * 86400 - extract(epoch from now())$a$,
  $b$coalesce((s ->> 'boon_at')::numeric, 0) + private.ench_n('genie', 'boon_days', 7) * 86400 - extract(epoch from now())$b$);
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamptz)',
  $a$v_rech numeric := private.ench_n('genie', 'recharge_h', 8) * 3600 * case when e.stars >= 4 then 0.75 else 1 end;$a$,
  $b$v_rech numeric := private.ench_n('genie', 'recharge_h', 8) * 3600 * case when e.stars >= 4 then private.ench_n('genie', 'star4_recharge_x', 0.75) else 1 end;$b$);
-- the wishes themselves
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamptz)',
  $a$v_pay := private.ench_pay(e.id, (40 + floor(random() * 51))::numeric, 'wish: Ink');$a$,
  $b$v_pay := private.ench_pay(e.id, (private.ench_n('genie', 'wish_ink_min', 40)
                    + floor(random() * (greatest(private.ench_n('genie', 'wish_ink_max', 90) - private.ench_n('genie', 'wish_ink_min', 40), 0) + 1)))::numeric, 'wish: Ink');$b$);
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamptz)',
  $a$v_lk := private.ench_give_luck(e.owner_id, 15, 0); r := jsonb_build_object('wish', 'luck', 'luck', 15, 'now', v_lk);$a$,
  $b$v_lk := private.ench_give_luck(e.owner_id, private.ench_n('genie', 'wish_luck', 15)::int, 0); r := jsonb_build_object('wish', 'luck', 'luck', private.ench_n('genie', 'wish_luck', 15)::int, 'now', v_lk);$b$);
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamptz)',
  $a$v_lk := private.ench_give_luck(e.owner_id, 0, 1); r := jsonb_build_object('wish', 'enchant', 'enchant', 1, 'now', v_lk);$a$,
  $b$v_lk := private.ench_give_luck(e.owner_id, 0, private.ench_n('genie', 'wish_enchant', 1)::int); r := jsonb_build_object('wish', 'enchant', 'enchant', private.ench_n('genie', 'wish_enchant', 1)::int, 'now', v_lk);$b$);
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamptz)',
  $a$values (e.owner_id, 'golden_hour', e.id, 2, 3, now() + interval '3 hours');$a$,
  $b$values (e.owner_id, 'golden_hour', e.id, private.ench_n('genie', 'golden_x', 2), private.ench_n('genie', 'golden_uses', 3)::int,
                  now() + make_interval(mins => round(private.ench_n('genie', 'golden_h', 3) * 60)::int));$b$);
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamptz)',
  $a$r := jsonb_build_object('wish', 'golden', 'mult', 2, 'uses', 3);$a$,
  $b$r := jsonb_build_object('wish', 'golden', 'mult', private.ench_n('genie', 'golden_x', 2), 'uses', private.ench_n('genie', 'golden_uses', 3)::int);$b$);
-- ★2 the gift to a friend
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamptz)',
  $a$perform private.grant_ink_paced(v_to, 30, 'enchantment', 'wish_gift', e.id::text, null);
      perform private.notify(v_to, 'enchant', e.owner_id, jsonb_build_object('sub', 'wish_gift', 'kind', 'genie', 'ink', 30));
      v_pay := private.ench_pay(e.id, 10, 'a wish given away');$a$,
  $b$perform private.grant_ink_paced(v_to, private.ench_n('genie', 'gift_ink', 30)::int, 'enchantment', 'wish_gift', e.id::text, null);
      perform private.notify(v_to, 'enchant', e.owner_id, jsonb_build_object('sub', 'wish_gift', 'kind', 'genie', 'ink', private.ench_n('genie', 'gift_ink', 30)::int));
      v_pay := private.ench_pay(e.id, private.ench_n('genie', 'gift_self', 10), 'a wish given away');$b$);
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamptz)',
  $a$r := jsonb_build_object('gift', true, 'to', v_name, 'ink', 30, 'pay', v_pay);$a$,
  $b$r := jsonb_build_object('gift', true, 'to', v_name, 'ink', private.ench_n('genie', 'gift_ink', 30)::int, 'pay', v_pay);$b$);
-- ★3 the weekly boon
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamptz)',
  $a$if coalesce((s ->> 'boon_at')::numeric, 0) + 7 * 86400 > extract(epoch from now()) then$a$,
  $b$if coalesce((s ->> 'boon_at')::numeric, 0) + private.ench_n('genie', 'boon_days', 7) * 86400 > extract(epoch from now()) then$b$);
-- the Forbidden Wish: granted / twisted / freed, what a twist pays and how long the lamp goes cold or free
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamptz)',
  $a$      if v_roll < 0.40 then$a$, $b$      if v_roll < private.ench_n('genie', 'forbid_grant', 0.40) then$b$);
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamptz)',
  $a$      elsif v_roll < 0.75 then$a$, $b$      elsif v_roll < private.ench_n('genie', 'forbid_twist', 0.75) then$b$);
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamptz)',
  $a$v_pay := private.ench_pay(e.id, 260, 'forbidden wish (twisted)');
          s := s || jsonb_build_object('wishes', 0, 'cold_until', v_now + 72 * 3600, 'charge_at', v_now + 72 * 3600);$a$,
  $b$v_pay := private.ench_pay(e.id, private.ench_n('genie', 'twist_ink', 260), 'forbidden wish (twisted)');
          s := s || jsonb_build_object('wishes', 0, 'cold_until', v_now + private.ench_n('genie', 'twist_cold_h', 72) * 3600, 'charge_at', v_now + private.ench_n('genie', 'twist_cold_h', 72) * 3600);$b$);
select private.fn_patch('private.ench_act_genie(public.enchantments,text,jsonb,timestamptz)',
  $a$s := s || jsonb_build_object('wishes', 0, 'freed_until', v_now + 7 * 86400, 'charge_at', v_now + 7 * 86400);$a$,
  $b$s := s || jsonb_build_object('wishes', 0, 'freed_until', v_now + private.ench_n('genie', 'freed_days', 7) * 86400, 'charge_at', v_now + private.ench_n('genie', 'freed_days', 7) * 86400);$b$);
select private.fn_patch('private.ench_view_genie(public.enchantments,timestamptz)',
  $a$4242) < 0.40 then 'granted'$a$, $b$4242) < private.ench_n('genie', 'forbid_grant', 0.40) then 'granted'$b$);
select private.fn_patch('private.ench_view_genie(public.enchantments,timestamptz)',
  $a$4242) < 0.75 then 'twisted'$a$, $b$4242) < private.ench_n('genie', 'forbid_twist', 0.75) then 'twisted'$b$);

-- ---- words players read ----------------------------------------------------------------------------------------------
insert into public.game_config (key, value, description) values
  ('enchant_texts', '{}'::jsonb, 'The Enchantment editor''s words: per kind {tagline, how[], star_powers[5]} shown in the game instead of the built-in text')
on conflict (key) do nothing;
-- the five star powers come from the editor when it has them
-- (all three changes in one go: the body has to stay whole)
do $do$
declare d text := pg_get_functiondef('private.ench_star_powers(text)'::regprocedure);
begin
  if position(' IMMUTABLE' in d) = 0 or position('  select case p_kind' in d) = 0 or position(E'    else \'[]\' end::jsonb\n$function$' in d) = 0 then
    raise exception 'enchant editor: ench_star_powers anchors not found';
  end if;
  d := replace(d, ' IMMUTABLE', ' STABLE');
  d := replace(d, '  select case p_kind',
    '  select coalesce(case when jsonb_typeof(private.cfg(''enchant_texts'') -> p_kind -> ''star_powers'') = ''array'' then private.cfg(''enchant_texts'') -> p_kind -> ''star_powers'' end, case p_kind');
  d := replace(d, E'    else \'[]\' end::jsonb\n$function$', E'    else \'[]\' end::jsonb)\n$function$');
  execute d;
end $do$;

/** the editor's words for the game: {kind: {tagline, how}} (the star powers come with each enchantment's own view) */
create or replace function public.enchant_texts() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(k, v - 'star_powers'), '{}'::jsonb) from jsonb_each(coalesce(private.cfg('enchant_texts'), '{}'::jsonb)) x(k, v)
   where jsonb_typeof(v) = 'object'
$$;
grant execute on function public.enchant_texts() to anon, authenticated;

-- ---- the editor --------------------------------------------------------------------------------------------------------
/** everything the Enchantment editor shows: every kind's numbers (default, now, where), dials, weight, words, history */
create or replace function public.admin_enchant_editor() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c jsonb; v_kinds text[]; v_tun jsonb; v_gen jsonb; v_pop jsonb;
begin
  perform private.require_admin(array['owner', 'economy']);
  c := private.ench_cfg();
  select array_agg(k order by k) into v_kinds from (select unnest(private.ench_kinds()) k union select 'cuckoo' union select distinct kind from private.ench_tunables() where kind <> '*') x;
  select coalesce(jsonb_object_agg(kind, tun), '{}'::jsonb) into v_tun from (
    select t.kind, jsonb_agg(jsonb_build_object('key', t.key, 'def', t.def, 'value', c -> t.kind -> t.key, 'fns', to_jsonb(t.fns), 'line', t.line) order by t.key) tun
      from private.ench_tunables() t where t.kind <> '*' group by t.kind) x;
  select coalesce(jsonb_agg(jsonb_build_object('key', t.key, 'def', t.def, 'fns', to_jsonb(t.fns), 'line', t.line) order by t.key), '[]'::jsonb) into v_gen
    from private.ench_tunables() t where t.kind = '*';
  select coalesce(jsonb_object_agg(kind, jsonb_build_object('alive', alive, 'minted', minted)), '{}'::jsonb) into v_pop
    from (select kind, count(*) filter (where status = 'active') alive, coalesce(max(serial), 0) minted from public.enchantments group by kind) x;
  return jsonb_build_object(
    'kinds', (select jsonb_agg(jsonb_build_object(
        'kind', k,
        'tunables', coalesce(v_tun -> k, '[]'::jsonb),
        -- the dials every kind has, with this kind's values
        'dials', (select coalesce(jsonb_agg(g || jsonb_build_object('value', c -> k -> (g ->> 'key'))), '[]'::jsonb) from jsonb_array_elements(v_gen) g),
        'weight', coalesce(c -> 'weights' -> k, '1'::jsonb),
        'pop', coalesce(v_pop -> k, '{"alive": 0, "minted": 0}'::jsonb),
        'texts', coalesce(private.cfg('enchant_texts') -> k, '{}'::jsonb),
        'star_powers', private.ench_star_powers(k)) order by k) from unnest(v_kinds) k),
    'global', jsonb_build_object('enabled', coalesce((c ->> 'enabled')::boolean, true), 'base_pct', coalesce((c ->> 'base_pct')::numeric, 2),
      'luck_pct', coalesce((c ->> 'luck_pct')::numeric, 2), 'luck_ink', coalesce((c ->> 'luck_ink')::numeric, 500), 'luck_max', coalesce((c ->> 'luck_max')::numeric, 9),
      'level_bonus', coalesce((c ->> 'level_bonus')::numeric, 0.06), 'max_level', coalesce((c ->> 'max_level')::numeric, 10)),
    'history', (select coalesce(jsonb_agg(h order by (h ->> 'at') desc), '[]'::jsonb) from (
        select jsonb_build_object('at', a.created_at, 'action', a.action, 'kind', a.target_id, 'details', a.details,
                                  'by', (select username from public.profiles p where p.id = a.actor_id)) h
          from public.audit_logs a where a.action in ('enchant.tune', 'enchant.texts') order by a.created_at desc limit 40) x));
end $$;
revoke all on function public.admin_enchant_editor() from public, anon;
grant execute on function public.admin_enchant_editor() to authenticated;

/** change numbers for one kind ('global' for the shared ones): {key: number | null (back to default)}; 'weight' too */
create or replace function public.admin_set_enchant_tuning(p_kind text, p_values jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare c jsonb; k text; v jsonb; v_known text[]; v_was jsonb := '{}'::jsonb; v_now jsonb := '{}'::jsonb; v_n numeric;
  v_global text[] := array['base_pct', 'luck_pct', 'luck_ink', 'luck_max', 'level_bonus', 'max_level'];
begin
  perform private.require_admin(array['owner', 'economy']);
  if jsonb_typeof(p_values) is distinct from 'object' or p_values = '{}'::jsonb then raise exception 'nothing_to_change' using errcode = 'P0001'; end if;
  if p_kind <> 'global' and not exists (select 1 from unnest(private.ench_kinds() || array['cuckoo']) x where x = p_kind)
     and not exists (select 1 from private.ench_tunables() t where t.kind = p_kind) then
    raise exception 'unknown_kind' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(t.key), '{}') into v_known from private.ench_tunables() t where t.kind = p_kind or (t.kind = '*' and p_kind <> 'global');
  select value into c from public.game_config where key = 'enchantments' for update;
  c := coalesce(c, '{}'::jsonb);
  for k, v in select * from jsonb_each(p_values) loop
    if p_kind = 'global' and k = 'enabled' then
      if jsonb_typeof(v) <> 'boolean' then raise exception 'bad_value' using errcode = 'P0001', detail = k; end if;
      v_was := v_was || jsonb_build_object(k, c -> k); c := c || jsonb_build_object(k, v); v_now := v_now || jsonb_build_object(k, v);
      continue;
    end if;
    if not (k = 'weight' and p_kind <> 'global') and not (p_kind = 'global' and k = any (v_global)) and not (k = any (v_known)) then
      raise exception 'unknown_setting' using errcode = 'P0001', detail = k;
    end if;
    if jsonb_typeof(v) not in ('number', 'null') then raise exception 'bad_value' using errcode = 'P0001', detail = k; end if;
    v_n := case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric end;
    if v_n is not null and (v_n < -1000000000 or v_n > 1000000000) then raise exception 'bad_value' using errcode = 'P0001', detail = k; end if;
    if k = 'weight' then
      if v_n is not null and v_n < 0 then raise exception 'bad_value' using errcode = 'P0001', detail = k; end if;
      v_was := v_was || jsonb_build_object(k, c -> 'weights' -> p_kind);
      c := jsonb_set(c, '{weights}', case when v_n is null then coalesce(c -> 'weights', '{}'::jsonb) - p_kind
                                          else coalesce(c -> 'weights', '{}'::jsonb) || jsonb_build_object(p_kind, v_n) end);
    elsif p_kind = 'global' then
      v_was := v_was || jsonb_build_object(k, c -> k);
      c := case when v_n is null then c - k else c || jsonb_build_object(k, v_n) end;
    else
      v_was := v_was || jsonb_build_object(k, c -> p_kind -> k);
      c := jsonb_set(c, array[p_kind], case when v_n is null then coalesce(c -> p_kind, '{}'::jsonb) - k
                                            else coalesce(c -> p_kind, '{}'::jsonb) || jsonb_build_object(k, v_n) end);
    end if;
    v_now := v_now || jsonb_build_object(k, v);
  end loop;
  insert into public.game_config (key, value, description) values ('enchantments', c, 'Enchantments: odds, weights and every kind''s numbers')
    on conflict (key) do update set value = excluded.value;
  perform private.audit('enchant.tune', 'enchantment', p_kind, jsonb_build_object('from', v_was, 'to', v_now));
  return public.admin_enchant_editor();
end $$;
revoke all on function public.admin_set_enchant_tuning(text, jsonb) from public, anon;
grant execute on function public.admin_set_enchant_tuning(text, jsonb) to authenticated;

/** the words for one kind: {tagline, how: [lines], star_powers: [5 × {name, emoji, text}]} — null (or a missing part) = the built-in */
create or replace function public.admin_set_enchant_texts(p_kind text, p_texts jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare c jsonb; t jsonb := '{}'::jsonb; v_p jsonb;
begin
  perform private.require_admin(array['owner', 'economy']);
  if not exists (select 1 from unnest(private.ench_kinds() || array['cuckoo']) x where x = p_kind) then raise exception 'unknown_kind' using errcode = 'P0001'; end if;
  if p_texts is not null and jsonb_typeof(p_texts) = 'object' then
    if nullif(btrim(p_texts ->> 'tagline'), '') is not null then
      if length(p_texts ->> 'tagline') > 200 then raise exception 'too_long' using errcode = 'P0001', detail = 'tagline'; end if;
      t := t || jsonb_build_object('tagline', btrim(p_texts ->> 'tagline'));
    end if;
    if jsonb_typeof(p_texts -> 'how') = 'array' and jsonb_array_length(p_texts -> 'how') > 0 then
      if jsonb_array_length(p_texts -> 'how') > 12 or exists (select 1 from jsonb_array_elements(p_texts -> 'how') l where jsonb_typeof(l) <> 'string' or length(l #>> '{}') > 600) then
        raise exception 'bad_value' using errcode = 'P0001', detail = 'how';
      end if;
      t := t || jsonb_build_object('how', (select jsonb_agg(to_jsonb(btrim(l #>> '{}'))) from jsonb_array_elements(p_texts -> 'how') l where btrim(l #>> '{}') <> ''));
    end if;
    if jsonb_typeof(p_texts -> 'star_powers') = 'array' then
      if jsonb_array_length(p_texts -> 'star_powers') <> 5 then raise exception 'bad_value' using errcode = 'P0001', detail = 'star_powers'; end if;
      for v_p in select * from jsonb_array_elements(p_texts -> 'star_powers') loop
        if nullif(btrim(v_p ->> 'name'), '') is null or nullif(btrim(v_p ->> 'text'), '') is null or length(v_p ->> 'name') > 40 or length(v_p ->> 'text') > 300 or length(coalesce(v_p ->> 'emoji', '')) > 16 then
          raise exception 'bad_value' using errcode = 'P0001', detail = 'star_powers';
        end if;
      end loop;
      t := t || jsonb_build_object('star_powers', (select jsonb_agg(jsonb_build_object('name', btrim(sp ->> 'name'), 'emoji', coalesce(nullif(btrim(sp ->> 'emoji'), ''), '⭐'), 'text', btrim(sp ->> 'text')))
                                                     from jsonb_array_elements(p_texts -> 'star_powers') sp));
    end if;
  end if;
  select value into c from public.game_config where key = 'enchant_texts' for update;
  c := coalesce(c, '{}'::jsonb);
  c := case when t = '{}'::jsonb then c - p_kind else c || jsonb_build_object(p_kind, t) end;
  update public.game_config set value = c where key = 'enchant_texts';
  perform private.audit('enchant.texts', 'enchantment', p_kind, jsonb_build_object('parts', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(t) k)));
  return public.admin_enchant_editor();
end $$;
revoke all on function public.admin_set_enchant_texts(text, jsonb) from public, anon;
grant execute on function public.admin_set_enchant_texts(text, jsonb) to authenticated;
