-- v0.18.1: new players get 4 free plots (the starter plot plus the next three), bigger
-- drawings are accepted, a history of every player's sketches and drawings (to share), and
-- today's earnings by source for the Play & Earn page.

update public.game_config set value = value || jsonb_build_object('free_plots', coalesce((value ->> 'free_plots')::int, 4)) where key = 'economy';

-- the price of an unclaimed plot never depends on (or reveals) its type or rarity;
-- a player's first `free_plots` plots are free, then the price grows from the base
create or replace function private.acquire_cost(p_uid uuid, p_gx int, p_gy int) returns jsonb
language plpgsql stable as $$
declare v_cfg jsonb := private.cfg('economy') -> 'acquire'; v_free int := greatest(coalesce((private.cfg('economy') ->> 'free_plots')::int, 1), 1);
  v_owned int; v_cost numeric;
begin
  select count(*) into v_owned from public.world_plots where owner_id = p_uid;
  if v_owned < v_free then return jsonb_build_object('ink', 0, 'owned', v_owned, 'free_left', v_free - v_owned); end if;
  v_cost := coalesce((v_cfg ->> 'base_ink')::numeric, 100) * power(coalesce((v_cfg ->> 'growth')::numeric, 1), greatest(v_owned - v_free, 0));
  v_cost := least(round(v_cost), coalesce((v_cfg ->> 'max_ink')::numeric, 1000000));
  return jsonb_build_object('ink', v_cost::bigint, 'owned', v_owned, 'free_left', 0);
end $$;

-- longer sketches are fine
create or replace function private.check_strokes(p jsonb, p_min int default 1) returns void
language plpgsql immutable as $$
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) < p_min or jsonb_array_length(p) > 6000 or octet_length(p::text) > 700000 then
    raise exception 'invalid_drawing' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p) s
             where jsonb_typeof(s) <> 'object' or jsonb_typeof(s -> 'p') <> 'array' or coalesce((s ->> 'c')::int, -1) not between 0 and 15
                or coalesce((s ->> 'w')::numeric, 0) not between 1 and 200) then
    raise exception 'invalid_drawing' using errcode = 'P0001';
  end if;
end $$;

-- every sketch you've made
create or replace function public.my_sketches(p_limit int default 60) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'word', s.word, 'strokes', s.strokes, 'votes', s.votes, 'place', s.place, 'prize', s.prize,
           'day', s.day, 'live', s.day = private.day_start(now())) order by s.day desc), '[]'::jsonb)
  from (select * from public.sketches where player_id = auth.uid() and submitted_at is not null order by day desc limit least(greatest(coalesce(p_limit, 60), 1), 200)) s
$$;

-- a sketch anyone can open from a shared link (the artist is named once voting has closed)
create or replace function public.sketch_public(p_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', s.id, 'word', s.word, 'strokes', s.strokes, 'place', s.place, 'day', s.day,
           'voting', s.day = private.day_start(now()),
           'artist', case when s.day < private.day_start(now()) or s.player_id = auth.uid() then private.profile_json(s.player_id) end)
  from public.sketches s where s.id = p_id and s.submitted_at is not null
$$;

-- every word you've drawn in Draw & Guess
create or replace function public.my_doodles(p_limit int default 60) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'word', d.word, 'strokes', d.strokes, 'guesses', d.guesses, 'solved', d.solved,
           'ink', d.drawer_ink, 'created_at', d.submitted_at) order by d.submitted_at desc), '[]'::jsonb)
  from (select * from public.doodles where drawer_id = auth.uid() and submitted_at is not null order by submitted_at desc limit least(greatest(coalesce(p_limit, 60), 1), 200)) d
$$;

-- what you've earned today, by where it came from
create or replace function public.my_earnings_today() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('total', coalesce(sum(delta), 0), 'resets_at', private.day_start(now()) + interval '1 day',
           'by_reason', coalesce(jsonb_object_agg(reason, s) filter (where reason is not null), '{}'::jsonb))
  from (select reason, sum(delta) as s, sum(delta) as delta from public.resource_ledger
         where player_id = auth.uid() and resource = 'ink' and delta > 0 and created_at >= private.day_start(now()) group by reason) x
$$;

do $$
declare f text;
begin
  foreach f in array array['public.my_sketches(int)', 'public.my_doodles(int)', 'public.my_earnings_today()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  execute 'revoke all on function public.sketch_public(uuid) from public';
  execute 'grant execute on function public.sketch_public(uuid) to anon, authenticated, service_role';
end $$;
