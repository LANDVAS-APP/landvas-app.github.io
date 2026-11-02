-- Inkborn v0.24: more to do with your creatures.
--  * New care actions: brush, fetch, trick, bathe and hide & seek. They grow happiness and bond
--    (bond keeps its daily cap of 40 per creature) and never pay Ink, so they can't be farmed.
--  * Three new Inkborn games: Leaf Leap, Lily Hop and Song Bloom (same daily Ink cap as the others).
--  * habitat_residents: who lives on the habitat plots in view, so the map can show the real
--    creatures wandering about their habitats (only what a visitor to the habitat could see).

alter table public.inkborn add column if not exists care_at jsonb not null default '{}'::jsonb;

update public.game_config
   set value = value || jsonb_build_object('games', coalesce(value -> 'games', '{}'::jsonb) || '{
     "leafleap":  {"enabled": true, "seconds": 50, "energy": 15, "max_score": 160, "points_per_ink": 5, "max_ink": 25},
     "lilyhop":   {"enabled": true, "seconds": 45, "energy": 15, "max_score": 120, "points_per_ink": 4, "max_ink": 25},
     "songbloom": {"enabled": true, "seconds": 50, "energy": 15, "max_score": 120, "points_per_ink": 4, "max_ink": 25}
   }'::jsonb)
 where key = 'inkborn';

-- care: pet, feed and play as before, plus brush, fetch, trick, bathe and hideseek.
create or replace function public.inkborn_care(p_id uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c public.inkborn%rowtype; v_now jsonb; v_hap int; v_en int; v_bond int := 0; v_msg text;
  v_day timestamptz := private.day_start(now()); v_last timestamptz;
begin
  perform private.rate_limit('inkborn_care', 600, 3600);
  select * into c from public.inkborn where id = p_id for update;
  if not found or c.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if c.job is not null then raise exception 'inkborn_busy' using errcode = 'P0001'; end if;
  v_now := private.inkborn_now(c);
  v_hap := (v_now ->> 'happiness')::int; v_en := (v_now ->> 'energy')::int;
  if c.bond_day is distinct from v_day then c.bond_today := 0; end if;
  v_last := (c.care_at ->> p_action)::timestamptz;
  case p_action
    when 'pet' then v_hap := least(100, v_hap + 4); v_bond := 1; v_msg := 'purr';
    when 'feed' then
      if c.last_fed is not null and c.last_fed > now() - interval '45 minutes' then v_hap := least(100, v_hap + 1); v_msg := 'full';
      else v_hap := least(100, v_hap + 12); v_en := least(100, v_en + 15); v_bond := 3; v_msg := 'yum'; c.last_fed := now(); end if;
    when 'play' then
      if v_en < 15 then v_msg := 'tired';
      else v_hap := least(100, v_hap + 15); v_en := v_en - 15; v_bond := 5; v_msg := 'yay'; c.last_played := now(); end if;
    when 'brush' then
      if v_last is not null and v_last > now() - interval '30 minutes' then v_hap := least(100, v_hap + 1); v_msg := 'fluffy';
      else v_hap := least(100, v_hap + 6); v_bond := 2; v_msg := 'shiny'; end if;
    when 'fetch' then
      if v_en < 5 then v_msg := 'tired';
      else v_hap := least(100, v_hap + 8); v_en := v_en - 5; v_bond := 3; v_msg := 'fetch'; c.last_played := now(); end if;
    when 'trick' then
      if c.bond < 10 then v_hap := least(100, v_hap + 1); v_msg := 'unsure';
      elsif v_en < 3 then v_msg := 'tired';
      else v_hap := least(100, v_hap + 6); v_en := v_en - 3; v_bond := 3; v_msg := 'trick'; end if;
    when 'bathe' then
      if v_last is not null and v_last > now() - interval '60 minutes' then v_hap := least(100, v_hap + 1); v_msg := 'clean';
      else v_hap := least(100, v_hap + 8); v_bond := 2; v_msg := 'splash'; end if;
    when 'hideseek' then
      if v_en < 10 then v_msg := 'tired';
      elsif v_last is not null and v_last > now() - interval '5 minutes' then v_hap := least(100, v_hap + 2); v_msg := 'again';
      else v_hap := least(100, v_hap + 10); v_en := v_en - 10; v_bond := 4; v_msg := 'found'; c.last_played := now(); end if;
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  if v_msg not in ('tired', 'full', 'fluffy', 'unsure', 'clean', 'again') then
    c.care_at := c.care_at || jsonb_build_object(p_action, now());
  end if;
  v_bond := least(v_bond, greatest(0, 40 - c.bond_today));
  update public.inkborn set happiness = v_hap, energy = v_en, stats_at = now(), bond = bond + v_bond, bond_today = c.bond_today + v_bond, bond_day = v_day,
         last_fed = c.last_fed, last_played = c.last_played, care_at = c.care_at, updated_at = now()
   where id = c.id returning * into c;
  return private.inkborn_json(c, v_uid) || jsonb_build_object('reaction', v_msg, 'bond_gain', v_bond);
end $$;

-- The creatures living on habitat plots (by canvas group), for drawing them on the map.
-- Only what anyone visiting the habitat could see: name, look and how lively they are.
create or replace function public.habitat_residents(p_groups jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_ids uuid[];
begin
  if jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) > 64 then
    raise exception 'too_many_groups' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(x::uuid), '{}') into v_ids from jsonb_array_elements_text(p_groups) x
   where x ~ '^[0-9a-fA-F-]{36}$';
  return (
    select coalesce(jsonb_object_agg(g.id::text, coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'genome', c.genome, 'personality', c.personality,
               'mine', c.owner_id is not distinct from v_uid) || private.inkborn_now(c) order by c.created_at)
        from (select * from public.inkborn c where c.habitat_id = h.id and c.job is null order by c.created_at limit 8) c
    ), '[]'::jsonb)), '{}'::jsonb)
    from public.canvas_groups g
    join public.habitats h on h.group_id = g.id
    where g.id = any(v_ids) and g.kind = 'habitat' and g.status = 'active' and private.visible_to(g.owner_id, v_uid));
end $$;

revoke all on function public.habitat_residents(jsonb) from public;
grant execute on function public.habitat_residents(jsonb) to anon, authenticated, service_role;
revoke all on function public.inkborn_care(uuid, text) from public, anon;
grant execute on function public.inkborn_care(uuid, text) to authenticated, service_role;
