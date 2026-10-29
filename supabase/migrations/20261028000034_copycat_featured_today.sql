-- v0.17: Copy Cat, a fifth PvP minigame — both players paint the same generated example
-- drawing and whoever's copy is closest wins the round. Plus "Featured today": the paintings
-- staff featured today, topped up with the community's most inspiring new art of the day.

alter table public.pvp_matches drop constraint if exists pvp_matches_game_check;
alter table public.pvp_matches add constraint pvp_matches_game_check check (game in ('turfwars', 'paletteclash', 'forgery', 'pixelrecall', 'copycat'));


create or replace function private.check_pvp_config_trg() returns trigger
language plpgsql as $$
declare g record; v jsonb := new.value; x jsonb;
begin
  if new.key <> 'pvp' then return new; end if;
  if coalesce((v ->> 'daily_rewarded_matches')::int, -1) not between 0 and 1000
     or coalesce((v ->> 'min_account_hours')::numeric, -1) not between 0 and 8760
     or coalesce((v ->> 'min_quality_pct')::numeric, -1) not between 0 and 100
     or coalesce((v ->> 'rematch_cooldown_hours')::numeric, -1) not between 0 and 720
     or coalesce((v ->> 'round_seconds')::int, 0) not between 20 and 600
     or coalesce((v ->> 'open_hours')::numeric, 0) not between 1 and 720
     or jsonb_typeof(v -> 'games') is distinct from 'object' then
    raise exception 'invalid_pvp_config' using errcode = 'P0001';
  end if;
  for g in select k, val from jsonb_each(v -> 'games') e(k, val) loop
    if g.k not in ('turfwars', 'paletteclash', 'forgery', 'pixelrecall', 'copycat')
       or coalesce((g.val ->> 'rounds')::int, 0) not between 1 and 7
       or coalesce((g.val ->> 'win_ink')::numeric, -1) not between 0 and 100000
       or coalesce((g.val ->> 'draw_ink')::numeric, 0) not between 0 and 100000
       or (g.val ? 'round_win_ink' and (jsonb_typeof(g.val -> 'round_win_ink') <> 'array' or jsonb_array_length(g.val -> 'round_win_ink') > 7)) then
      raise exception 'invalid_pvp_config' using errcode = 'P0001';
    end if;
    for x in select e from jsonb_array_elements(case when jsonb_typeof(g.val -> 'round_win_ink') = 'array' then g.val -> 'round_win_ink' else '[]'::jsonb end) e loop
      if jsonb_typeof(x) <> 'number' or x::numeric not between 0 and 100000 then raise exception 'invalid_pvp_config' using errcode = 'P0001'; end if;
    end loop;
    perform private.check_bonus_rules(g.val -> 'bonuses');
  end loop;
  return new;
end $$;

create or replace function public.pvp_play(p_game text, p_idempotency_key text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_cfg jsonb := private.cfg('pvp'); g jsonb; v_prev jsonb;
  m public.pvp_matches%rowtype; r public.pvp_runs%rowtype; v_res jsonb; v_cool interval;
begin
  perform private.pvp_sweep();
  if not coalesce((v_cfg ->> 'enabled')::boolean, false) then raise exception 'pvp_disabled' using errcode = 'P0001'; end if;
  g := private.pvp_game_cfg(p_game);
  if p_game not in ('turfwars', 'paletteclash', 'forgery', 'pixelrecall', 'copycat') or not coalesce((g ->> 'enabled')::boolean, true) then
    raise exception 'invalid_game' using errcode = 'P0001';
  end if;
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'pvp_play');
  if v_prev is not null then return v_prev; end if;
  perform private.rate_limit('pvp_play', 60, 3600);
  if exists (select 1 from public.pvp_runs x where x.player_id = v_uid and x.finished_at is null) then
    raise exception 'pvp_in_progress' using errcode = 'P0001';
  end if;
  v_cool := make_interval(secs => coalesce((v_cfg ->> 'rematch_cooldown_hours')::numeric, 24) * 3600);
  select * into m from public.pvp_matches x
   where x.status = 'waiting' and x.game = p_game and x.created_by <> v_uid and x.open_until > now()
     and not exists (  -- no rematch against the same player within the cooldown
       select 1 from public.pvp_runs mine join public.pvp_runs theirs on theirs.match_id = mine.match_id and theirs.player_id = x.created_by
       where mine.player_id = v_uid and mine.started_at > now() - v_cool)
   order by random() limit 1 for update skip locked;
  if found then
    update public.pvp_matches set status = 'playing' where id = m.id returning * into m;
    insert into public.pvp_runs (match_id, player_id, seat) values (m.id, v_uid, 'b') returning * into r;
  else
    insert into public.pvp_matches (game, seed, rounds, created_by, open_until)
    values (p_game, floor(random() * 2147483646 + 1)::bigint, least(greatest(coalesce((g ->> 'rounds')::int, 3), 1), 7), v_uid,
            now() + make_interval(secs => coalesce((v_cfg ->> 'open_hours')::numeric, 48) * 3600))
    returning * into m;
    insert into public.pvp_runs (match_id, player_id, seat) values (m.id, v_uid, 'a') returning * into r;
  end if;
  v_res := private.pvp_start_json(m, r);
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

update public.game_config
   set value = jsonb_set(value, '{games,copycat}', coalesce(value -> 'games' -> 'copycat',
                 '{"enabled": true, "rounds": 3, "win_ink": 12, "draw_ink": 3, "round_win_ink": [0, 0, 0], "bonuses": []}'::jsonb), true)
 where key = 'pvp';

-- Featured today: today's staff picks first, then the most inspired art published in the last day
create or replace function public.featured_today(p_limit int default 12) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_limit int := least(greatest(coalesce(p_limit, 12), 1), 30); v_res jsonb;
begin
  with staff as (
    select a.id, private.artwork_card(a, v_uid) || jsonb_build_object('pick', 'staff', 'note', f.note) as card, 0 as grp, f.sort as s1, -extract(epoch from f.starts_at) as s2
      from public.featured_artwork f join public.artwork_publications a on a.id = f.publication_id
     where a.status = 'published' and f.starts_at >= private.day_start(now()) - interval '1 day'
       and (f.ends_at is null or f.ends_at > now()) and private.visible_to(a.owner_id, v_uid)
  ), community as (
    select a.id, private.artwork_card(a, v_uid) || jsonb_build_object('pick', 'community') as card, 1 as grp, -a.appreciation_count as s1, -extract(epoch from a.published_at) as s2
      from public.artwork_publications a
     where a.status = 'published' and a.published_at > now() - interval '1 day' and private.visible_to(a.owner_id, v_uid)
       and a.id not in (select id from staff)
     order by a.appreciation_count desc, a.published_at desc limit v_limit
  ), both_ as (select * from staff union all select * from community)
  select coalesce(jsonb_agg(card order by grp, s1, s2), '[]'::jsonb) into v_res
    from (select * from both_ order by grp, s1, s2 limit v_limit) x;
  return v_res;
end $$;

do $$
begin
  execute 'revoke all on function public.featured_today(int) from public';
  execute 'grant execute on function public.featured_today(int) to anon, authenticated, service_role';
  execute 'revoke all on function public.pvp_play(text, text) from public, anon';
  execute 'grant execute on function public.pvp_play(text, text) to authenticated, service_role';
end $$;
