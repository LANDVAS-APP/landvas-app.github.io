-- Arcade: Classic or Endless for Versus and Team too, and scores with no top.
--
-- 1. Matches (Versus, Team, and any match mode) can be played Classic or Endless. The host picks in the lobby
--    (arcade_match_set_play); everyone in the match plays that style. An Endless match waits up to 30 minutes for
--    everyone to run out of lives, and a Team target in Endless is 4× the Classic one.
-- 2. No score cap in any mode. A score is kept exactly as played (into the millions), as long as it's humanly
--    possible in the time the run lasted (a generous envelope that grows with the run, so combos and multipliers that
--    build up in a long Endless run fit). Classic scores used to stop at each cabinet's top score, which made Versus
--    end in ties.
-- 3. What a run *pays* (tickets, Ink, the owner's cut, match bonuses) is exactly what it paid before: Classic pays up to
--    the cabinet's top score, Endless up to what the game allows per second. Bigger scores don't mint more.
-- 4. Every arcade switch (Live control → Earning switches) also stops tickets for that cabinet, arcade or match.

-- ---- columns ---------------------------------------------------------------------------------------------------
alter table public.arcade_matches add column if not exists play text not null default 'classic';
do $$ begin
  alter table public.arcade_matches add constraint arcade_matches_play_chk check (play in ('classic', 'endless'));
exception when duplicate_object then null; end $$;
alter table public.arcade_plays add column if not exists reward_score int;
alter table public.arcade_plays add column if not exists claimed_score int;
alter table public.arcade_mirror_plays add column if not exists reward_score int;
alter table public.arcade_mirror_plays add column if not exists claimed_score int;
alter table public.arcade_secret_plays add column if not exists reward_score int;
alter table public.arcade_secret_plays add column if not exists claimed_score int;

update public.game_config set value = jsonb_set(value, '{match}', coalesce(value -> 'match', '{}'::jsonb)
  || jsonb_build_object('endless_round_minutes', coalesce((value -> 'match' ->> 'endless_round_minutes')::int, 30),
                        'endless_target_mult', coalesce((value -> 'match' ->> 'endless_target_mult')::numeric, 4)))
  || jsonb_build_object('endless_reward_minutes', coalesce((value ->> 'endless_reward_minutes')::int, 240))
where key = 'arcade';

-- ---- the score as played, and what it pays ---------------------------------------------------------------------
/** The score kept: what was played, with no top score, inside what a human could reach in that time. The envelope is
 *  per_second × seconds × (1 + seconds / ramp_seconds) × headroom, so the allowed rate grows through a run (at 30
 *  minutes about 90× the game's base rate) — room for any combo — while a made-up score is still refused. */
create or replace function private.arc_score(g jsonb, p_secs numeric, p_score bigint) returns int language sql immutable as $$
  select greatest(0, least(coalesce(p_score, 0)::numeric,
    ceil(greatest(coalesce(p_secs, 0), 0) * coalesce((g ->> 'per_second')::numeric, 20)
         * (1 + greatest(coalesce(p_secs, 0), 0) / greatest(coalesce((g ->> 'ramp_seconds')::numeric, 60), 1))
         * greatest(coalesce((g ->> 'headroom')::numeric, 1.5), 1)),
    2147483647::numeric))::int
$$;

/** What a run pays on: exactly the old limits (Classic up to the cabinet's top score, never faster than the game). */
create or replace function private.arc_reward_score(g jsonb, p_mode text, p_secs numeric, p_score int) returns int language sql immutable as $$
  select greatest(0, least(coalesce(p_score, 0)::numeric,
    ceil(greatest(coalesce(p_secs, 0), 0) * coalesce((g ->> 'per_second')::numeric, 20)),
    case when p_mode = 'endless' then 2147483647 else coalesce((g ->> 'max_score')::int, 500) end))::int
$$;

-- ---- the cabinets ----------------------------------------------------------------------------------------------
select private.fn_patch('public.arcade_finish(uuid,integer)', 'v_score int;', 'v_score int; v_rs int; v_arc_off boolean := false;');
select private.fn_patch('public.arcade_finish(uuid,integer)',
  '  v_score := greatest(0, least(coalesce(p_score, 0), ceil(v_secs * coalesce((g ->> ''per_second'')::numeric, 20))::int,
    case when s.mode = ''endless'' then 2147483647 else coalesce((g ->> ''max_score'')::int, 500) end));',
  '  -- the score as played (no top score), and what it pays (exactly as before)
  v_score := private.arc_score(g, v_secs, p_score);
  v_rs := private.arc_reward_score(g, s.mode, v_secs, v_score);');
select private.fn_patch('public.arcade_finish(uuid,integer)', 'if v_secs <= 3600 and a.id is not null then',
  'if v_secs <= (case when s.mode = ''endless'' then coalesce((cfg ->> ''endless_reward_minutes'')::numeric, 240) * 60 else 3600 end) and a.id is not null then');
select private.fn_patch('public.arcade_finish(uuid,integer)', '    v_hot := private.arc_hot(a) = s.game;',
  '    v_hot := private.arc_hot(a) = s.game;
    if private.earn_any_off() then
      if private.earn_off(array[''mult:arcade_hot'']) then v_hot := false; end if;
      -- this cabinet / this arcade / the arcade switched off: the game plays on, nothing is won
      v_arc_off := private.earn_off(array[''reason:arcade'', ''arcade.tickets'', ''arcade.game:'' || s.game,
                     ''plotkind:'' || coalesce((select kind from public.canvas_groups where id = a.group_id), ''arcade'')]);
      if v_arc_off then perform private.earn_note(''arcade.tickets'', v_rs); v_rs := 0; v_hot := false; end if;
    end if;');
select private.fn_patch('public.arcade_finish(uuid,integer)', 'v_first := v_score > 0 and', 'v_first := v_rs > 0 and');
select private.fn_patch('public.arcade_finish(uuid,integer)', 'v_tix := floor(v_score *', 'v_tix := floor(v_rs *');
select private.fn_patch('public.arcade_finish(uuid,integer)', 'v_inkf := p.ink_frac + v_score /', 'v_inkf := p.ink_frac + v_rs /');
select private.fn_patch('public.arcade_finish(uuid,integer)', 'set finished_at = now(), score = v_score,',
  'set finished_at = now(), score = v_score, reward_score = coalesce(v_rs, 0), claimed_score = greatest(coalesce(p_score, 0), 0),');

-- the mirrored arcade
select private.fn_patch('public.arcade_mirror_finish(uuid,integer)', 'v_score int;', 'v_score int; v_rs int;');
select private.fn_patch('public.arcade_mirror_finish(uuid,integer)',
  '  v_score := greatest(0, least(coalesce(p_score, 0), ceil(v_secs * coalesce((g ->> ''per_second'')::numeric, 20))::int,
    case when s.mode = ''endless'' then 2147483647 else coalesce((g ->> ''max_score'')::int, 500) end));',
  '  v_score := private.arc_score(g, v_secs, p_score);
  v_rs := private.arc_reward_score(g, s.mode, v_secs, v_score);
  if private.earn_any_off() and private.earn_off(array[''reason:arcade'', ''arcade.tickets'', ''arcade.mirror'', ''arcade.game:'' || s.game]) then
    perform private.earn_note(''arcade.mirror'', v_rs); v_rs := 0;
  end if;');
select private.fn_patch('public.arcade_mirror_finish(uuid,integer)', '  if v_secs <= 3600 then',
  '  if v_secs <= (case when s.mode = ''endless'' then coalesce((private.arc_cfg() ->> ''endless_reward_minutes'')::numeric, 240) * 60 else 3600 end) then');
select private.fn_patch('public.arcade_mirror_finish(uuid,integer)', 'v_tix := floor(v_score *', 'v_tix := floor(v_rs *');
select private.fn_patch('public.arcade_mirror_finish(uuid,integer)', '+ v_score * coalesce((c ->> ''ink_mult'')', '+ v_rs * coalesce((c ->> ''ink_mult'')');
select private.fn_patch('public.arcade_mirror_finish(uuid,integer)', 'set finished_at = now(), score = v_score,',
  'set finished_at = now(), score = v_score, reward_score = coalesce(v_rs, 0), claimed_score = greatest(coalesce(p_score, 0), 0),');

-- the secret games
select private.fn_patch('public.arcade_secret_finish(uuid,integer,jsonb)', 'v_score int;', 'v_score int; v_rs int;');
select private.fn_patch('public.arcade_secret_finish(uuid,integer,jsonb)',
  '  v_score := greatest(0, least(coalesce(p_score, 0), ceil(v_secs * coalesce((g ->> ''per_second'')::numeric, 20))::int,
    case when s.mode = ''endless'' then 2147483647 else coalesce((g ->> ''max_score'')::int, 500) end));',
  '  v_score := private.arc_score(g, v_secs, p_score);
  v_rs := private.arc_reward_score(g, s.mode, v_secs, v_score);
  if private.earn_any_off() and private.earn_off(array[''reason:arcade'', ''arcade.tickets'', ''arcade.secret:'' || s.secret, ''arcade.game:'' || s.game]) then
    perform private.earn_note(''arcade.secret:'' || s.secret, v_rs); v_rs := 0;
  end if;');
select private.fn_patch('public.arcade_secret_finish(uuid,integer,jsonb)', '  if v_secs <= 3600 then',
  '  if v_secs <= (case when s.mode = ''endless'' then coalesce((private.arc_cfg() ->> ''endless_reward_minutes'')::numeric, 240) * 60 else 3600 end) then');
select private.fn_patch('public.arcade_secret_finish(uuid,integer,jsonb)', 'v_tix := floor(v_score *', 'v_tix := floor(v_rs *');
select private.fn_patch('public.arcade_secret_finish(uuid,integer,jsonb)', '+ v_score * coalesce((c ->> ''ink_mult'')', '+ v_rs * coalesce((c ->> ''ink_mult'')');
select private.fn_patch('public.arcade_secret_finish(uuid,integer,jsonb)', 'set finished_at = now(), score = v_score,',
  'set finished_at = now(), score = v_score, reward_score = coalesce(v_rs, 0), claimed_score = greatest(coalesce(p_score, 0), 0),', false);

-- ---- matches: Classic or Endless --------------------------------------------------------------------------------
select private.fn_patch('private.arc_match_json(uuid,uuid)', '''mode'', m.mode, ', '''mode'', m.mode, ''play'', m.play, ');
select private.fn_patch('public.arcade_match_start(uuid)', 'm.game, m.seed, ''classic'', v_at)', 'm.game, m.seed, coalesce(m.play, ''classic''), v_at)');
-- an Endless round waits longer for everyone to run out of lives
select private.fn_patch('private.arc_match_settle(uuid)',
  'm.started_at > now() - make_interval(mins => coalesce((c ->> ''round_minutes'')::int, 6))',
  'm.started_at > now() - make_interval(mins => case when m.play = ''endless'' then coalesce((c ->> ''endless_round_minutes'')::int, 30) else coalesce((c ->> ''round_minutes'')::int, 6) end)');
-- the squad's Ink is on what the runs pay on, not the (uncapped) score
select private.fn_patch('private.arc_match_settle(uuid)', 'coalesce(ap.tickets, 0) tickets', 'coalesce(ap.tickets, 0) tickets, coalesce(ap.reward_score, ap.score, 0) rscore');
select private.fn_patch('private.arc_match_settle(uuid)', 'select ink_frac + r.score /', 'select ink_frac + r.rscore /');
select private.fn_patch('private.arc_match_settle(uuid)', '    if v_b > 0 then',
  '    if v_b > 0 and private.earn_any_off() and private.earn_off(array[''reason:arcade'', ''arcade.tickets'', ''arcade.match'', ''arcade.game:'' || m.game]) then
      perform private.earn_note(''arcade.match'', v_b); v_b := 0;
    end if;
    if v_b > 0 then');

/** The host picks Classic or Endless for the lobby (everyone plays the same). */
create or replace function public.arcade_match_set_play(p_match uuid, p_play text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.arcade_matches%rowtype; g jsonb; v_base int;
begin
  select * into m from public.arcade_matches where id = p_match for update;
  if not found or m.status <> 'lobby' then raise exception 'match_closed' using errcode = 'P0001'; end if;
  if m.host_id <> v_uid then raise exception 'not_host' using errcode = 'P0001'; end if;
  if coalesce(p_play, '') not in ('classic', 'endless') then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  if m.play = p_play then return private.arc_match_json(m.id, v_uid); end if;
  g := coalesce(private.arc_cfg() -> 'games' -> m.game, private.arc_cfg() -> 'carnival' -> 'games' -> m.game);
  v_base := greatest(20, floor(coalesce((g ->> 'points_per_ink')::numeric, 200) / 2)::int);
  update public.arcade_matches
     set play = p_play,
         target = case when m.mode = 'team' and m.target is not null
                       then case when p_play = 'endless' then ceil(v_base * coalesce((private.arc_cfg() -> 'match' ->> 'endless_target_mult')::numeric, 4))::int else v_base end
                       else target end
   where id = m.id;
  return private.arc_match_json(m.id, v_uid);
end $$;
revoke all on function public.arcade_match_set_play(uuid, text) from public, anon;
grant execute on function public.arcade_match_set_play(uuid, text) to authenticated;
