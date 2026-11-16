-- Helping hands: anyone can come and help with someone else's place, and anyone at their place can be joined to help.
--  * Farms: visitors water the owner's growing crops (they grow faster, and give +1 at harvest, like the owner's own
--    watering) — up to 8 a day at each farm, a little Ink for the helper (accounts a day old), and the owner hears who
--    helped. (Realms already pay their owner a cut of visitors' minigames; businesses take visitors' tips.)
--  * Where you are: being at a farm, business, realm or sanctuary is an activity of its own ('place'), with the way in,
--    so friends, your party and anyone teaming up can follow you there and help.

create table if not exists public.farm_helps (
  helper_id uuid not null references public.players (id) on delete cascade,
  farm_id uuid not null references public.farms (id) on delete cascade,
  day timestamptz not null,
  n int not null default 0,
  primary key (helper_id, farm_id, day)
);
create index if not exists farm_helps_farm_idx on public.farm_helps (farm_id);
alter table public.farm_helps enable row level security;
revoke all on public.farm_helps from anon, authenticated;
update public.game_config set value = value || '{"help": {"per_day": 8, "ink": 1}}'::jsonb where key = 'farm' and not (value ? 'help');

/** Water someone else's growing crop for them. */
create or replace function public.farm_help(p_farm uuid, p_bed int) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); f public.farms%rowtype; b public.farm_beds%rowtype;
  c jsonb := coalesce(private.farm_cfg() -> 'help', '{}'::jsonb); v_max int := coalesce((c ->> 'per_day')::int, 8);
  v_day timestamptz := private.day_start(now()); v_n int; v_ink int := 0;
begin
  perform private.rate_limit('farm_act', 1200, 3600);
  select * into f from public.farms where id = p_farm;
  if not found or not private.visible_to(f.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if f.owner_id = v_uid then raise exception 'own_farm' using errcode = 'P0001'; end if;
  insert into public.farm_helps (helper_id, farm_id, day) values (v_uid, f.id, v_day) on conflict do nothing;
  select n into v_n from public.farm_helps where helper_id = v_uid and farm_id = f.id and day = v_day for update;
  if v_n >= v_max then raise exception 'already_done' using errcode = 'P0001'; end if;
  select * into b from public.farm_beds where farm_id = f.id and idx = p_bed for update;
  if not found or b.watered or b.ready_at <= now() then raise exception 'nothing_to_do' using errcode = 'P0001'; end if;
  update public.farm_beds set watered = true,
         ready_at = now() + (ready_at - now()) * (1 - coalesce((private.farm_cfg() ->> 'water_speedup')::numeric, 0.4))
   where farm_id = f.id and idx = p_bed;
  update public.farm_helps set n = n + 1 where helper_id = v_uid and farm_id = f.id and day = v_day;
  if private.old_enough(v_uid, 24) then
    v_ink := coalesce((c ->> 'ink')::int, 1);
    if v_ink > 0 then perform private.grant(v_uid, jsonb_build_object('ink', v_ink), 'farm', 'farm_help', f.id::text, 'farm-help:' || f.id || ':' || v_uid || ':' || v_day::date || ':' || (v_n + 1)); end if;
  end if;
  -- the owner hears about it (once a day for each helper)
  -- (a visit alert from them in the last hour becomes a "helped" one rather than a second ping)
  if v_n = 0 then
    update public.player_notifications set data = data || jsonb_build_object('help', true), read_at = null
     where id = (select id from public.player_notifications where player_id = f.owner_id and kind = 'visit' and actor_id = v_uid
                   and created_at > now() - interval '1 hour' order by id desc limit 1);
    if not found then perform private.notify(f.owner_id, 'visit', v_uid, jsonb_build_object('farm', f.id, 'help', true)); end if;
  end if;
  return private.farm_json(f.id, v_uid) || jsonb_build_object('helped', true, 'helps_left', v_max - v_n - 1, 'ink', v_ink, 'balances', private.balances(v_uid));
end $$;

/** how many more crops you can water at this farm today */
create or replace function public.farm_helps_left(p_farm uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select greatest(0, coalesce((private.farm_cfg() -> 'help' ->> 'per_day')::int, 8)
    - coalesce((select n from public.farm_helps where helper_id = auth.uid() and farm_id = p_farm and day = private.day_start(now())), 0))
$$;

-- being at a place (a farm, business, realm or sanctuary) is something people can follow you into
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.set_activity(text, jsonb)'::regprocedure);
  n := replace(d, $a$'other', 'arcade', 'party', 'home') then$a$, $b$'other', 'arcade', 'party', 'home', 'place') then$b$);
  if n = d then raise exception 'helping_hands: set_activity anchor not found'; end if;
  execute n;
end $$;

do $$ declare f text; begin
  foreach f in array array['public.farm_help(uuid, integer)', 'public.farm_helps_left(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
