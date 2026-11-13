-- Ink Flow becomes a true option (Admin > Earnings > Ink Flow), and ships switched OFF.
--
-- Off = classic Ink, exactly as it was before Ink pacing / Ink Flow:
--   * no hidden rate: every payout is paid in full (only a player's own Pandora's Greed curse slows their Ink)
--   * every game keeps its own daily cap as it always had (minigame paid runs, realms, business, farm, space, planets,
--     Inkborn, the arena, home games, map finds)
--   * the arcade is truly uncapped again: no daily arcade Ink cap, and Endless runs pay for the whole score
--   * group games (balloons / race) have no daily Ink cap
-- On = Ink Flow as built: the hidden rate around the daily target, the arcade and group-game caps, and the optional
-- "uncap Ink for everyone".
-- Kept either way: minigames pay Ink only for a full clear (every round of the level).

/** Ink Flow (the dynamic, hidden Ink rate) is on */
create or replace function private.ink_flow_on() returns boolean language sql stable as $$
  select coalesce((private.cfg('ink_pacing') ->> 'enabled')::boolean, true)
$$;
revoke all on function private.ink_flow_on() from public, anon, authenticated;

do $$
declare d text; n text;
begin
  -- the hidden rate only runs with Ink Flow on; off, a payout is paid in full (a Greed curse still slows it)
  d := pg_get_functiondef('private.ink_pace(uuid,integer,text)'::regprocedure);
  n := replace(d, $a$  if not coalesce((c ->> 'enabled')::boolean, true) or not coalesce(c -> 'paced', '[]'::jsonb) ? p_reason then return p_amount; end if;$a$,
                  $a$  if not coalesce(c -> 'paced', '[]'::jsonb) ? p_reason then return p_amount; end if;
  -- Ink Flow off: classic Ink, paid in full (only the player's own Pandora's Greed curse slows it)
  if not coalesce((c ->> 'enabled')::boolean, true) then
    v_x := p_amount * private.ench_pace_curse(p_uid);
    if v_x >= p_amount then return p_amount; end if;
    v_pay := floor(v_x)::int + case when random() < v_x - floor(v_x) then 1 else 0 end;
    perform set_config('landvas.ink_pace_factor', (v_pay::numeric / p_amount)::text, true);
    perform set_config('landvas.ink_pace_cut', (private.ink_pace_cut() + (p_amount - v_pay))::text, true);
    return v_pay;
  end if;$a$);
  if n = d then raise exception 'ink flow optional: ink_pace anchor not found'; end if;
  execute n;

  -- arcade: one run's max Ink (Endless included) only with Ink Flow on
  d := pg_get_functiondef('public.arcade_finish(uuid,integer)'::regprocedure);
  n := replace(d, $a$    v_inkf := least(v_inkf, p.ink_frac + coalesce((g ->> 'max_ink')::numeric, 10));$a$,
                  $a$    if private.ink_flow_on() then v_inkf := least(v_inkf, p.ink_frac + coalesce((g ->> 'max_ink')::numeric, 10)); end if;$a$);
  if n = d then raise exception 'ink flow optional: arcade_finish anchor not found'; end if;
  execute n;

  -- arcade: the daily arcade Ink cap only with Ink Flow on (classic arcade had none)
  d := pg_get_functiondef('private.arc_pay(uuid,integer,text,text)'::regprocedure);
  n := replace(d, $a$  if not private.ink_uncapped() and coalesce((private.arc_cfg() ->> 'daily_ink_cap')::int, 150) > 0 then$a$,
                  $a$  if private.ink_flow_on() and not private.ink_uncapped() and coalesce((private.arc_cfg() ->> 'daily_ink_cap')::int, 150) > 0 then$a$);
  if n = d then raise exception 'ink flow optional: arc_pay anchor not found'; end if;
  execute n;

  -- group games: the daily cap only with Ink Flow on (classic group games had none)
  d := pg_get_functiondef('private.gg_pay(uuid,integer,text,text)'::regprocedure);
  n := replace(d, $a$  if private.ink_uncapped() then v_pay := p_amount; end if;$a$,
                  $a$  if private.ink_uncapped() or not private.ink_flow_on() then v_pay := p_amount; end if;$a$);
  if n = d then raise exception 'ink flow optional: gg_pay anchor not found'; end if;
  execute n;

  -- the owner's switch: turning Ink Flow off also brings the daily caps back (uncapped only ever runs with Flow on)
  d := pg_get_functiondef('public.admin_set_ink_pacing(jsonb)'::regprocedure);
  n := replace(d, $a$  -- uncapped Ink only ever runs with Ink Flow on
  if coalesce((v ->> 'uncapped')::boolean, false) then v := v || '{"enabled": true}'::jsonb; end if;$a$,
                  $a$  -- uncapped Ink only ever runs with Ink Flow on: switching Flow off brings the caps back…
  if p_config ? 'enabled' and not coalesce((p_config ->> 'enabled')::boolean, true) and not coalesce((p_config ->> 'uncapped')::boolean, false) then
    v := v || '{"uncapped": false}'::jsonb;
  end if;
  -- …and uncapping switches Flow on
  if coalesce((v ->> 'uncapped')::boolean, false) then v := v || '{"enabled": true}'::jsonb; end if;$a$);
  if n = d then raise exception 'ink flow optional: admin_set_ink_pacing anchor not found'; end if;
  execute n;
end $$;

-- ships off: classic Ink for everyone until the owner switches Ink Flow on
update public.game_config set value = value || '{"enabled": false, "uncapped": false}'::jsonb where key = 'ink_pacing';
