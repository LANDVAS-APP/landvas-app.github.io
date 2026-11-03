-- v0.31 Playdates and eggs. Visit someone's sanctuary and bring one of your Inkborn to play with one
-- of theirs in a co-op round (their creature plays alongside yours). Both of you earn a little Ink
-- and bond, and a great round lays eggs: one for each of you, and never the same egg — each one
-- leans towards its own owner's creature, with a chance of something neither parent had. Eggs hatch
-- into new Inkborn after a while.

update public.game_config set value = value || jsonb_build_object('playdates', '{
  "enabled": true, "seconds": 45, "max_score": 140, "points_per_ink": 6, "max_ink": 20, "host_tip": 4,
  "egg_score": 45, "eggs_per_day": 3, "pair_cooldown_hours": 20, "hatch_minutes": 60, "mutation": 0.18
}'::jsonb)
 where key = 'inkborn';

alter table public.inkborn drop constraint if exists inkborn_source_check;
alter table public.inkborn add constraint inkborn_source_check check (source in ('drawn', 'random', 'custom', 'bred'));

create table if not exists public.inkborn_playdates (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.players (id) on delete cascade,
  guest_inkborn uuid not null references public.inkborn (id) on delete cascade,
  host_id uuid not null references public.players (id) on delete cascade,
  host_inkborn uuid not null references public.inkborn (id) on delete cascade,
  seed int not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz, score int, ink int, eggs boolean not null default false
);
create index if not exists inkborn_playdates_guest_idx on public.inkborn_playdates (guest_id, started_at desc);
alter table public.inkborn_playdates enable row level security;
revoke all on public.inkborn_playdates from anon, authenticated;

create table if not exists public.inkborn_eggs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players (id) on delete cascade,
  playdate_id uuid references public.inkborn_playdates (id) on delete set null,
  kind text not null,                -- what the shell looks like: 'speckled', 'swirl', 'starry', 'striped', 'glimmer', 'cosmic'
  shell jsonb not null,              -- shell colours
  genome jsonb not null,             -- what hatches
  parents jsonb not null,            -- [{name, owner, genome}] for the card
  mutated boolean not null default false,
  laid_at timestamptz not null default now(),
  hatch_at timestamptz not null,
  hatched_inkborn uuid references public.inkborn (id) on delete set null,
  seen boolean not null default false
);
create index if not exists inkborn_eggs_owner_idx on public.inkborn_eggs (owner_id, laid_at desc);
alter table public.inkborn_eggs enable row level security;
revoke all on public.inkborn_eggs from anon, authenticated;

create or replace function private.pd_cfg() returns jsonb language sql stable as $$ select coalesce(private.ink_cfg() -> 'playdates', '{}'::jsonb) $$;

/** Mix two genomes, leaning on `lead` (65% of its genes), plus maybe a mutation. Returns {genome, mutated}. */
create or replace function private.mix_genome(lead jsonb, other jsonb, p_mutation numeric) returns jsonb
language plpgsql volatile as $$
declare k text; g jsonb := '{}'::jsonb; v_mut boolean := false; v_from jsonb;
begin
  for k in select jsonb_object_keys(lead || other) loop
    if k in ('legs', 'gait') then continue; end if;
    v_from := case when random() < 0.65 then lead else other end;
    g := g || jsonb_build_object(k, coalesce(v_from -> k, lead -> k, other -> k));
  end loop;
  -- how it gets about comes as a pair (legs and gait) from one parent
  v_from := case when random() < 0.65 then lead else other end;
  g := g || jsonb_build_object('legs', coalesce(v_from -> 'legs', '2'::jsonb), 'gait', coalesce(v_from -> 'gait', '"walk"'::jsonb));
  if random() < p_mutation then
    v_mut := true;
    case floor(random() * 5)::int
      when 0 then g := g || jsonb_build_object('eyecount', least(6, greatest(1, coalesce((g ->> 'eyecount')::int, 2) + case when random() < 0.5 then 1 else -1 end)));
      when 1 then g := g || jsonb_build_object('pattern', (array['spots', 'stripes', 'patches', 'stars'])[1 + floor(random() * 4)::int]);
      when 2 then g := g || jsonb_build_object('horns', (array['nubs', 'curly', 'antlers', 'unicorn'])[1 + floor(random() * 4)::int]);
      when 3 then g := g || jsonb_build_object('wings', (array['tiny', 'leaf'])[1 + floor(random() * 2)::int]);
      else g := g || jsonb_build_object('size', round((0.8 + random() * 0.45)::numeric, 2));
    end case;
  end if;
  return jsonb_build_object('genome', g, 'mutated', v_mut);
end $$;

create or replace function private.egg_json(e public.inkborn_eggs) returns jsonb language sql stable as $$
  select jsonb_build_object('id', e.id, 'kind', e.kind, 'shell', e.shell, 'parents', e.parents, 'mutated', e.mutated,
    'laid_at', e.laid_at, 'hatch_at', e.hatch_at, 'ready', now() >= e.hatch_at, 'hatched', e.hatched_inkborn is not null, 'seen', e.seen,
    -- what's inside stays a surprise until it hatches
    'genome', case when e.hatched_inkborn is not null then e.genome else null end)
$$;

/** Start a playdate: your creature visits one of someone else's. */
create or replace function public.inkborn_playdate_start(p_mine uuid, p_theirs uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); a public.inkborn%rowtype; b public.inkborn%rowtype; p public.inkborn_playdates%rowtype; c jsonb := private.pd_cfg();
begin
  perform private.rate_limit('inkborn_playdate', 60, 3600);
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  select * into a from public.inkborn where id = p_mine;
  if not found or a.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  select * into b from public.inkborn where id = p_theirs;
  if not found or not private.visible_to(b.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if b.owner_id = v_uid then raise exception 'playdate_own' using errcode = 'P0001'; end if;
  insert into public.inkborn_playdates (guest_id, guest_inkborn, host_id, host_inkborn, seed)
  values (v_uid, a.id, b.owner_id, b.id, floor(random() * 2147483647)::int) returning * into p;
  return jsonb_build_object('session', p.id, 'seed', p.seed, 'seconds', coalesce((c ->> 'seconds')::int, 45), 'egg_score', coalesce((c ->> 'egg_score')::int, 45),
    'mine', jsonb_build_object('id', a.id, 'name', a.name, 'genome', a.genome),
    'theirs', jsonb_build_object('id', b.id, 'name', b.name, 'genome', b.genome, 'owner', private.profile_json(b.owner_id)),
    'eggs_left', greatest(0, coalesce((c ->> 'eggs_per_day')::int, 3) - (select count(*) from public.inkborn_playdates
                   where guest_id = v_uid and eggs and started_at >= private.day_start(now()))));
end $$;

create or replace function public.inkborn_playdate_finish(p_session uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); p public.inkborn_playdates%rowtype; c jsonb := private.pd_cfg();
  a public.inkborn%rowtype; b public.inkborn%rowtype; v_secs numeric; v_score int; v_ink int := 0; v_paid int := 0; v_tip int := 0;
  v_eggs boolean := false; v_why text; m1 jsonb; m2 jsonb; e1 public.inkborn_eggs%rowtype; e2 public.inkborn_eggs%rowtype;
  v_kinds text[] := array['speckled', 'swirl', 'starry', 'striped', 'glimmer', 'cosmic']; k1 int; k2 int;
  v_parents jsonb; v_hatch timestamptz;
begin
  select * into p from public.inkborn_playdates where id = p_session for update;
  if not found or p.guest_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if p.finished_at is not null then return jsonb_build_object('score', p.score, 'paid', p.ink, 'repeat', true); end if;
  v_secs := extract(epoch from (now() - p.started_at));
  if v_secs < coalesce((c ->> 'seconds')::int, 45) * 0.85 then raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  v_score := greatest(0, least(coalesce(p_score, 0), coalesce((c ->> 'max_score')::int, 140)));
  select * into a from public.inkborn where id = p.guest_inkborn;
  select * into b from public.inkborn where id = p.host_inkborn;
  if v_secs <= 1800 then
    v_ink := least(coalesce((c ->> 'max_ink')::int, 20), floor(v_score / greatest(1, coalesce((c ->> 'points_per_ink')::numeric, 6))))::int;
    v_paid := private.inkborn_pay(v_uid, v_ink, 'playdate', p.id::text, 'playdate:' || p.id);
    if v_score > 0 then v_tip := private.inkborn_pay(p.host_id, coalesce((c ->> 'host_tip')::int, 4), 'playdate_host', p.id::text, 'playdate-host:' || p.id); end if;
  end if;
  if v_score > 0 then update public.inkborn set bond = bond + 2, updated_at = now() where id in (p.guest_inkborn, p.host_inkborn); end if;
  -- eggs: a great round, eggs left today, and these two haven't had eggs together lately
  if v_score < coalesce((c ->> 'egg_score')::int, 45) then v_why := 'score';
  elsif (select count(*) from public.inkborn_playdates where guest_id = v_uid and eggs and started_at >= private.day_start(now())) >= coalesce((c ->> 'eggs_per_day')::int, 3) then v_why := 'daily';
  elsif exists (select 1 from public.inkborn_playdates where eggs and finished_at > now() - make_interval(hours => coalesce((c ->> 'pair_cooldown_hours')::int, 20))
                 and ((guest_inkborn = p.guest_inkborn and host_inkborn = p.host_inkborn) or (guest_inkborn = p.host_inkborn and host_inkborn = p.guest_inkborn))) then v_why := 'pair';
  elsif a.id is null or b.id is null then v_why := 'gone';
  else
    v_eggs := true;
    v_hatch := now() + make_interval(mins => coalesce((c ->> 'hatch_minutes')::int, 60));
    v_parents := jsonb_build_array(
      jsonb_build_object('name', a.name, 'owner', (select username from public.profiles where id = a.owner_id), 'genome', a.genome),
      jsonb_build_object('name', b.name, 'owner', (select username from public.profiles where id = b.owner_id), 'genome', b.genome));
    -- one egg each, and never the same kind: yours leans on your creature, theirs on theirs
    k1 := 1 + floor(random() * 6)::int; k2 := 1 + ((k1 + floor(random() * 5)::int) % 6);
    m1 := private.mix_genome(a.genome, b.genome, coalesce((c ->> 'mutation')::numeric, 0.18));
    m2 := private.mix_genome(b.genome, a.genome, coalesce((c ->> 'mutation')::numeric, 0.18));
    insert into public.inkborn_eggs (owner_id, playdate_id, kind, shell, genome, parents, mutated, hatch_at)
    values (v_uid, p.id, v_kinds[k1], jsonb_build_object('a', a.genome ->> 'color', 'b', b.genome ->> 'color', 'c', a.genome ->> 'accent'), m1 -> 'genome', v_parents, (m1 ->> 'mutated')::boolean, v_hatch)
    returning * into e1;
    insert into public.inkborn_eggs (owner_id, playdate_id, kind, shell, genome, parents, mutated, hatch_at)
    values (p.host_id, p.id, v_kinds[k2], jsonb_build_object('a', b.genome ->> 'color', 'b', a.genome ->> 'color', 'c', b.genome ->> 'accent'), m2 -> 'genome', v_parents, (m2 ->> 'mutated')::boolean, v_hatch)
    returning * into e2;
  end if;
  update public.inkborn_playdates set finished_at = now(), score = v_score, ink = v_paid, eggs = v_eggs where id = p.id;
  return jsonb_build_object('score', v_score, 'earned', v_ink, 'paid', v_paid, 'capped', v_paid < v_ink, 'host_tip', v_tip, 'balances', private.balances(v_uid),
    'egg', case when v_eggs then private.egg_json(e1) else null end,
    'their_egg', case when v_eggs then jsonb_build_object('kind', e2.kind) else null end,
    'no_egg_because', v_why);
end $$;

create or replace function public.inkborn_eggs() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(private.egg_json(e) order by e.hatched_inkborn is not null, e.hatch_at), '[]'::jsonb)
  from public.inkborn_eggs e where e.owner_id = auth.uid() and (e.hatched_inkborn is null or e.laid_at > now() - interval '3 days')
$$;

create or replace function public.inkborn_eggs_seen() returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  with u as (update public.inkborn_eggs set seen = true where owner_id = auth.uid() and not seen returning 1) select jsonb_build_object('ok', true, 'marked', (select count(*) from u))
$$;

/** Hatch a ready egg into a new Inkborn (it moves into your starter sanctuary, or waits if that's full). */
create or replace function public.inkborn_egg_hatch(p_egg uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); e public.inkborn_eggs%rowtype; v_name text; v_pers text; v_starter uuid; h public.habitats%rowtype; c public.inkborn%rowtype;
begin
  select * into e from public.inkborn_eggs where id = p_egg for update;
  if not found or e.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if e.hatched_inkborn is not null then raise exception 'egg_hatched' using errcode = 'P0001'; end if;
  if now() < e.hatch_at then raise exception 'egg_not_ready' using errcode = 'P0001'; end if;
  if (select count(*) from public.inkborn where owner_id = v_uid) >= coalesce((private.ink_cfg() ->> 'max_creatures')::int, 60) then
    raise exception 'too_many_creatures' using errcode = 'P0001';
  end if;
  v_name := private.chat_clean(p_name);
  if v_name is null or char_length(v_name) not between 1 and 24 or v_name <> btrim(p_name) then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  v_pers := coalesce(e.genome ->> 'mood', 'curious');
  if v_pers not in ('playful', 'sleepy', 'curious', 'shy', 'foodie', 'brave') then v_pers := 'curious'; end if;
  v_starter := private.starter_habitat(v_uid);
  select * into h from public.habitats where id = v_starter;
  insert into public.inkborn (owner_id, client_key, name, source, genome, personality, habitat_id)
  values (v_uid, 'egg-' || e.id::text, v_name, 'bred', e.genome, v_pers,
          case when (select count(*) from public.inkborn where habitat_id = h.id) < private.habitat_capacity(h) then h.id else null end)
  returning * into c;
  update public.inkborn_eggs set hatched_inkborn = c.id, seen = true where id = e.id;
  return jsonb_build_object('inkborn', private.inkborn_json(c, v_uid), 'egg', private.egg_json((select x from public.inkborn_eggs x where x.id = e.id)));
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.pd_cfg()', 'private.mix_genome(jsonb, jsonb, numeric)', 'private.egg_json(public.inkborn_eggs)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.inkborn_playdate_start(uuid, uuid)', 'public.inkborn_playdate_finish(uuid, int)', 'public.inkborn_eggs()',
    'public.inkborn_eggs_seen()', 'public.inkborn_egg_hatch(uuid, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
