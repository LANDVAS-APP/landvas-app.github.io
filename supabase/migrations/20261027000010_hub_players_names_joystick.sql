-- LANDVAS v0.3
--   * the operator's admin hub: one owner, claimed once with a one-time code
--   * public players directory and each player's land
--   * custom plot names (set when claiming, renameable, moderated)
--   * joystick movement with a timed tank (refilled daily, and by rewarded ads
--     once an ad network is connected)
--   * GPS fixes are validated against the previous *real* fix, so joystick or
--     tap travel never counts as a jump and the explorer can snap back to you
--   * admin-tunable minigame earnings (global and per-game Ink multipliers)

-- ===== Owner ===================================================================
-- Only the SHA-256 of the one-time code lives here; the code itself was handed
-- to the operator privately. Once claimed, the claim can never be used again.
create table if not exists private.owner_claim (
  id int primary key default 1 check (id = 1),
  code_sha256 text not null check (code_sha256 ~ '^[0-9a-f]{64}$'),
  claimed_by uuid references public.players(id) on delete set null,
  claimed_at timestamptz
);
insert into private.owner_claim (id, code_sha256)
values (1, '1a4b0601c0a3b2d76e98da4d6df563c4b067aa37961f4d3cfda2c6c828e28d54')
on conflict (id) do nothing;

create or replace function public.owner_status() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  return jsonb_build_object(
    'claimed', exists (select 1 from public.admin_roles where role = 'owner'),
    'is_owner', v_uid is not null and exists (select 1 from public.admin_roles where player_id = v_uid and role = 'owner'));
end $$;

-- Failed attempts return {ok:false} instead of raising, so the rate limit and
-- the security log survive the call.
create or replace function public.claim_owner(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player();
  v_norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  c private.owner_claim%rowtype;
begin
  perform private.rate_limit('owner_claim', 8, 3600);
  if exists (select 1 from public.admin_roles where role = 'owner') then
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;
  select * into c from private.owner_claim where id = 1 for update;
  if not found or c.claimed_by is not null
     or encode(sha256(convert_to(v_norm, 'UTF8')), 'hex') is distinct from c.code_sha256 then
    insert into private.security_events (player_id, kind, details) values (v_uid, 'owner_claim_failed', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;
  insert into public.admin_roles (player_id, role, granted_by) values (v_uid, 'owner', v_uid) on conflict do nothing;
  update private.owner_claim set claimed_by = v_uid, claimed_at = now() where id = 1;
  perform private.audit('role.owner_claimed', 'player', v_uid::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'state', public.my_state());
end $$;

-- ===== Plot names ===============================================================

alter table public.world_plots add column if not exists name text check (char_length(name) between 1 and 32);

-- a plot's name belongs to its owner: it is cleared whenever ownership changes
create or replace function private.plot_name_reset() returns trigger
language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id then new.name := null; end if;
  return new;
end $$;
drop trigger if exists world_plots_name_reset on public.world_plots;
create trigger world_plots_name_reset before update of owner_id on public.world_plots
  for each row execute function private.plot_name_reset();

update public.game_config
   set value = value || jsonb_build_object(
     'blocked_words', jsonb_build_array(
       'fuck', 'fucker', 'fucking', 'shit', 'bitch', 'cunt', 'whore', 'slut', 'dick', 'cock', 'pussy', 'penis', 'vagina',
       'tits', 'boobs', 'porn', 'sex', 'cum', 'anal', 'rape', 'rapist', 'nazi', 'hitler', 'kkk', 'nigger', 'nigga', 'faggot',
       'fag', 'retard', 'kike', 'spic', 'chink', 'tranny', 'asshole', 'bastard', 'motherfucker', 'pedo', 'pedophile'),
     'blocked_fragments', jsonb_build_array('fuck', 'cunt', 'nigger', 'nigga', 'faggot', 'whore', 'asshole', 'motherfuck', 'bitch', 'pedophil'))
 where key = 'moderation' and not (value ? 'blocked_words');

create or replace function private.collapse_repeats(p text) returns text
language sql immutable as $$ select regexp_replace(p, '(.)\1+', '\1', 'g') $$;

-- Validates and normalises a plot name; null/blank clears it.
create or replace function private.clean_plot_name(p_name text) returns text
language plpgsql stable as $$
declare
  v text; v_norm text; v_squash text; w text;
  v_mod jsonb := coalesce(private.cfg('moderation'), '{}'::jsonb);
begin
  if p_name is null then return null; end if;
  v := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
  if v = '' then return null; end if;
  if char_length(v) > 32 then raise exception 'invalid_plot_name' using errcode = 'P0001', detail = 'too_long'; end if;
  -- control, zero-width and bidi-override characters, markup and symbols used for spam
  if v ~ '[\x01-\x1f\x7f]' or v ~ '[<>{}\[\]\\|^`~=*$@]'
     or (current_setting('server_encoding') = 'UTF8' and exists (
           select 1 from unnest(array[8203, 8204, 8205, 8206, 8207, 8234, 8235, 8236, 8237, 8238,
                                      8288, 8289, 8290, 8291, 8292, 8293, 8294, 8295, 8296, 8297, 65279]) c
           where position(chr(c) in v) > 0)) then
    raise exception 'invalid_plot_name' using errcode = 'P0001', detail = 'characters';
  end if;
  if v ~* '(https?:|www\.|\.(com|net|org|io|gg|xyz|ru|co|me|tv|app)(\M|$)|discord)' then
    raise exception 'invalid_plot_name' using errcode = 'P0001', detail = 'links';
  end if;
  v_norm := regexp_replace(translate(lower(v), '0134578@$!', 'oieastbasi'), '[^a-z]+', ' ', 'g');
  v_squash := replace(v_norm, ' ', '');
  for w in select jsonb_array_elements_text(coalesce(v_mod -> 'blocked_words', '[]'::jsonb)) loop
    if (' ' || v_norm || ' ') like ('% ' || w || ' %')
       or (' ' || private.collapse_repeats(v_norm) || ' ') like ('% ' || private.collapse_repeats(w) || ' %') then
      raise exception 'invalid_plot_name' using errcode = 'P0001', detail = 'language';
    end if;
  end loop;
  for w in select jsonb_array_elements_text(coalesce(v_mod -> 'blocked_fragments', '[]'::jsonb)) loop
    if position(w in v_squash) > 0 or position(private.collapse_repeats(w) in private.collapse_repeats(v_squash)) > 0 then
      raise exception 'invalid_plot_name' using errcode = 'P0001', detail = 'language';
    end if;
  end loop;
  return v;
end $$;

create or replace function public.name_plot(p_gx int, p_gy int, p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_name text;
begin
  perform private.rate_limit('name_plot', 120, 3600);
  v_name := private.clean_plot_name(p_name);
  update public.world_plots set name = v_name, updated_at = now() where gx = p_gx and gy = p_gy and owner_id = v_uid;
  if not found then raise exception 'not_owner' using errcode = 'P0001'; end if;
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx, p_gy, p_gx, p_gy);
  return jsonb_build_object('gx', p_gx, 'gy', p_gy, 'name', v_name);
end $$;

create or replace function public.admin_clear_plot_name(p_gx int, p_gy int, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']); v_old text;
begin
  select name into v_old from public.world_plots where gx = p_gx and gy = p_gy for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.world_plots set name = null, updated_at = now() where gx = p_gx and gy = p_gy;
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx, p_gy, p_gx, p_gy);
  perform private.audit('plot.clear_name', 'plot', private.cell_key(p_gx, p_gy), jsonb_build_object('old', v_old, 'reason', p_reason));
  return jsonb_build_object('gx', p_gx, 'gy', p_gy, 'name', null);
end $$;

-- Claims take an optional name. The name is validated before anything changes.
drop function if exists public.claim_starter_plot(int, int);
create or replace function public.claim_starter_plot(p_gx int, p_gy int, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_res jsonb;
  v_bonus jsonb := coalesce(private.cfg('economy') -> 'starter_bonus', '{}'::jsonb);
  v_name text := private.clean_plot_name(p_name);
begin
  perform private.rate_limit('claim', 30, 3600);
  perform 1 from public.players where id = v_uid and not starter_plot_claimed for update;
  if not found then raise exception 'starter_already_claimed' using errcode = 'P0001'; end if;
  perform private.require_in_reach(v_uid, p_gx, p_gy);
  perform private.rent_settle(v_uid);
  v_res := private.take_plot(v_uid, p_gx, p_gy, 'starter', '{}'::jsonb);
  if v_name is not null then update public.world_plots set name = v_name where gx = p_gx and gy = p_gy; end if;
  update public.players set starter_plot_claimed = true where id = v_uid;
  perform private.grant(v_uid, v_bonus, 'starter_bonus', 'plot', private.cell_key(p_gx, p_gy), 'starter_bonus');
  return v_res || jsonb_build_object('name', v_name, 'bonus', v_bonus, 'achievements', private.evaluate_achievements(v_uid),
                                     'balances', private.balances(v_uid), 'rent', private.rent_json(v_uid));
end $$;

drop function if exists public.acquire_plot(int, int, text);
create or replace function public.acquire_plot(p_gx int, p_gy int, p_idempotency_key text, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_prev jsonb; v_cost jsonb; v_res jsonb; v_name text;
begin
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'acquire_plot');
  if v_prev is not null then return v_prev; end if;
  v_name := private.clean_plot_name(p_name);
  perform private.rate_limit('acquire', 120, 3600);
  if exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and (owner_id is not null or locked)) then
    raise exception 'plot_unavailable' using errcode = 'P0001';
  end if;
  if (select count(*) from public.world_plots where owner_id = v_uid) >= coalesce((private.cfg('limits') ->> 'max_plots_per_player')::int, 2500) then
    raise exception 'plot_limit_reached' using errcode = 'P0001';
  end if;
  perform private.require_in_reach(v_uid, p_gx, p_gy);
  v_cost := private.acquire_cost(v_uid, p_gx, p_gy);
  perform private.rent_settle(v_uid);
  perform private.ledger_apply(v_uid, 'ink', -(v_cost ->> 'ink')::bigint, 'acquire_plot', 'plot',
                               private.cell_key(p_gx, p_gy), p_idempotency_key);
  v_res := private.take_plot(v_uid, p_gx, p_gy, 'acquire', jsonb_build_object('ink', v_cost -> 'ink'));
  if v_name is not null then update public.world_plots set name = v_name where gx = p_gx and gy = p_gy; end if;
  perform private.grant(v_uid, jsonb_build_object('brush_points', 5), 'acquire_plot', 'plot', private.cell_key(p_gx, p_gy), p_idempotency_key);
  v_res := v_res || jsonb_build_object('name', v_name, 'cost', v_cost, 'balances', private.balances(v_uid), 'rent', private.rent_json(v_uid),
                                       'achievements', private.evaluate_achievements(v_uid));
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

-- plots_in_bbox rows: [gx, gy, type, level, is_mine, group_id, has_art, username, accent, rarity, name]
create or replace function public.plots_in_bbox(p_min_gx int, p_min_gy int, p_max_gx int, p_max_gy int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_res jsonb;
begin
  if p_max_gx < p_min_gx or p_max_gy < p_min_gy or p_max_gx - p_min_gx > 1024 or p_max_gy - p_min_gy > 1024 then
    raise exception 'bbox_too_large' using errcode = 'P0001';
  end if;
  p_min_gy := greatest(p_min_gy, 0);
  p_max_gy := least(p_max_gy, 65535);
  with ranges as (
    select greatest(p_min_gx, 0) as x0, least(p_max_gx, 65535) as x1 where p_max_gx >= 0 and p_min_gx <= 65535
    union all select p_min_gx + 65536, 65535 where p_min_gx < 0
    union all select 0, p_max_gx - 65536 where p_max_gx > 65535
  ), blocks as (
    select distinct by_, bx_
    from ranges r, generate_series(r.x0 >> 6, r.x1 >> 6) bx_, generate_series(p_min_gy >> 6, p_max_gy >> 6) by_
  )
  select coalesce(jsonb_agg(jsonb_build_array(p.gx, p.gy, p.plot_type, p.level, p.owner_id = v_uid, m.group_id,
                                               p.art_rev is not null, pr.username, pr.accent_color, p.rarity, p.name)), '[]'::jsonb)
    into v_res
  from blocks b
  join public.world_plots p on p.by = b.by_ and p.bx = b.bx_
  left join public.canvas_group_members m on m.gx = p.gx and m.gy = p.gy
  left join public.profiles pr on pr.id = p.owner_id
  where p.owner_id is not null
    and p.gy between p_min_gy and p_max_gy
    and exists (select 1 from ranges r where p.gx between r.x0 and r.x1);
  return v_res;
end $$;

create or replace function public.my_plots() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'gx', p.gx, 'gy', p.gy, 'plot_type', p.plot_type, 'rarity', p.rarity, 'level', p.level, 'claimed_at', p.claimed_at,
      'group_id', m.group_id, 'has_art', p.art_rev is not null, 'name', p.name,
      'usd_per_second', private.plot_rent_rate(p.rarity, p.level))
      order by p.claimed_at)
    from public.world_plots p
    left join public.canvas_group_members m on m.gx = p.gx and m.gy = p.gy
    where p.owner_id = v_uid), '[]'::jsonb);
end $$;

-- Everything the plot panel needs, in one round trip (now with the plot's name).
create or replace function public.plot_details(p_gx int, p_gy int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_plot public.world_plots%rowtype;
  v_type text;
  v_rarity text;
  v_group uuid;
  v_res jsonb;
  v_is_mine boolean := false;
  v_starter boolean := false;
  v_ex record;
  v_reach int := coalesce((private.cfg('explorer') ->> 'claim_reach')::int, 1);
  v_level int;
begin
  if p_gx not between 0 and 65535 or p_gy not between 0 and 65535 then
    raise exception 'invalid_plot' using errcode = 'P0001';
  end if;
  select * into v_plot from public.world_plots where gx = p_gx and gy = p_gy;
  v_type := coalesce(v_plot.plot_type, private.plot_type_for(p_gx, p_gy));
  v_rarity := coalesce(v_plot.rarity, private.plot_rarity_for(p_gx, p_gy));
  v_level := coalesce(v_plot.level, 1);
  v_is_mine := v_uid is not null and v_plot.owner_id = v_uid;
  if v_uid is not null then
    select not starter_plot_claimed into v_starter from public.players where id = v_uid;
  end if;
  select group_id into v_group from public.canvas_group_members where gx = p_gx and gy = p_gy;

  v_res := jsonb_build_object(
    'gx', p_gx, 'gy', p_gy,
    'center', jsonb_build_object('lng', private.lng_of(p_gx + 0.5), 'lat', private.lat_of(p_gy + 0.5)),
    'name', case when v_plot.owner_id is not null then v_plot.name end,
    'plot_type', v_type,
    'type_info', (select to_jsonb(t) from public.plot_types t where t.id = v_type),
    'rarity', v_rarity,
    'rarity_info', (select to_jsonb(r) from public.plot_rarities r where r.id = v_rarity),
    'rent', jsonb_build_object(
      'usd_per_second', private.plot_rent_rate(v_rarity, v_level),
      'boost_multiplier', coalesce((private.cfg('rent') -> 'boost' ->> 'multiplier')::numeric, 20)),
    'owned', v_plot.owner_id is not null,
    'is_mine', v_is_mine,
    'owner', case when v_plot.owner_id is not null then private.profile_json(v_plot.owner_id) end,
    'level', v_level,
    'claimed_at', v_plot.claimed_at,
    'locked', coalesce(v_plot.locked, false),
    'art', (select jsonb_build_object('publication_id', a.id, 'title', a.title, 'published_at', a.published_at,
                                      'plot_count', a.plot_count, 'artist', private.profile_json(a.owner_id),
                                      'appreciation_count', a.appreciation_count)
            from public.artwork_publications a where a.id = v_plot.art_publication_id),
    'neighbors', (
      select jsonb_agg(jsonb_build_object(
        'gx', n.gx, 'gy', n.gy, 'dir', n.dir,
        'plot_type', coalesce(w.plot_type, private.plot_type_for(n.gx, n.gy)),
        'rarity', coalesce(w.rarity, private.plot_rarity_for(n.gx, n.gy)),
        'owned', w.owner_id is not null,
        'is_mine', v_uid is not null and w.owner_id = v_uid,
        'owner_username', (select username from public.profiles where id = w.owner_id),
        'group_id', m.group_id,
        'same_group', v_group is not null and m.group_id = v_group) order by n.dir)
      from private.neighbors(p_gx, p_gy) n
      left join public.world_plots w on w.gx = n.gx and w.gy = n.gy
      left join public.canvas_group_members m on m.gx = n.gx and m.gy = n.gy)
  );

  -- reach from the viewer's own explorer (never reveals anyone else's position)
  if v_uid is not null then
    select * into v_ex from private.explorer_now(v_uid);
    if found then
      v_res := v_res || jsonb_build_object('reach', jsonb_build_object(
        'explorer', true, 'distance', private.cell_distance(v_ex.gx, v_ex.gy, p_gx, p_gy), 'max', v_reach,
        'in_reach', not private.flag('location_gated_claims') or private.cell_distance(v_ex.gx, v_ex.gy, p_gx, p_gy) <= v_reach));
    else
      v_res := v_res || jsonb_build_object('reach', jsonb_build_object(
        'explorer', false, 'distance', null, 'max', v_reach, 'in_reach', not private.flag('location_gated_claims')));
    end if;
  end if;

  if v_is_mine then
    v_res := v_res || jsonb_build_object(
      'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'plot_count', g.plot_count, 'project_id', g.project_id,
                                          'min_gx', g.min_gx, 'min_gy', g.min_gy, 'max_gx', g.max_gx, 'max_gy', g.max_gy)
                from public.canvas_groups g where g.id = v_group),
      'connections', (
        select coalesce(jsonb_agg(distinct jsonb_build_object('group_id', g.id, 'name', g.name, 'plot_count', g.plot_count)), '[]'::jsonb)
        from public.canvas_group_members me
        join private.neighbors(me.gx, me.gy) n on true
        join public.canvas_group_members m on m.gx = n.gx and m.gy = n.gy and m.group_id <> v_group
        join public.canvas_groups g on g.id = m.group_id and g.owner_id = v_uid and g.status = 'active'
        where me.group_id = v_group));
  elsif v_plot.owner_id is null then
    v_res := v_res || jsonb_build_object(
      'acquire', case when v_uid is not null and exists (select 1 from public.players where id = v_uid)
                      then private.acquire_cost(v_uid, p_gx, p_gy) || jsonb_build_object('starter_available', coalesce(v_starter, false))
                      else jsonb_build_object('starter_available', true) end,
      'available', not coalesce(v_plot.locked, false));
  end if;
  return v_res;
end $$;

-- ===== Players directory & land =================================================
-- Real, visible players only (no hidden, banned or blocked profiles). Never
-- includes anyone's location, activity times or balances.
create or replace function public.players_directory(p_query text default '', p_sort text default 'land', p_limit int default 30, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_q text := regexp_replace(lower(trim(coalesce(p_query, ''))), '[^a-z0-9_ ]', '', 'g');
  v_sort text := case when p_sort in ('land', 'art', 'loved', 'level', 'new', 'name') then p_sort else 'land' end;
  v_limit int := least(greatest(coalesce(p_limit, 30), 1), 60);
  v_off int := least(greatest(coalesce(p_offset, 0), 0), 100000);
  v_total int; v_rows jsonb;
begin
  with plots as (
    select p.owner_id, count(*) as n, max(r.sort) as best_sort
    from public.world_plots p join public.plot_rarities r on r.id = p.rarity
    where p.owner_id is not null group by p.owner_id
  ), arts as (
    select owner_id, count(*) as n, coalesce(sum(appreciation_count), 0) as loves
    from public.artwork_publications where status = 'published' group by owner_id
  ), base as (
    select pr.id, pr.username, pr.created_at, coalesce(pl2.n, 0) as plots, pl2.best_sort,
           coalesce(a.n, 0) as arts, coalesce(a.loves, 0) as loves, coalesce(b.amount, 0) as bp
    from public.profiles pr
    join public.players pl on pl.id = pr.id
    left join plots pl2 on pl2.owner_id = pr.id
    left join arts a on a.owner_id = pr.id
    left join public.resource_balances b on b.player_id = pr.id and b.resource = 'brush_points'
    where pl.status <> 'banned' and not pr.is_hidden
      and (v_uid is null or not exists (select 1 from public.player_blocks bl where bl.blocker_id = v_uid and bl.blocked_id = pr.id))
      and (v_q = '' or lower(pr.username) like '%' || v_q || '%' or lower(coalesce(pr.display_name, '')) like '%' || v_q || '%')
  ), ranked as (
    select base.*, row_number() over (order by
             case when v_sort = 'land' then plots end desc,
             case when v_sort = 'art' then arts end desc,
             case when v_sort = 'loved' then loves end desc,
             case when v_sort = 'level' then bp end desc,
             case when v_sort = 'new' then created_at end desc,
             case when v_sort = 'name' then lower(username) end asc,
             plots desc, arts desc, lower(username)) as rn
    from base
  )
  select (select count(*) from base)::int,
         coalesce((select jsonb_agg(jsonb_build_object(
             'profile', private.profile_json(x.id),
             'plots', x.plots, 'artworks', x.arts, 'appreciations', x.loves,
             'artist_level', private.artist_level(x.bp),
             'best_rarity', (select r.id from public.plot_rarities r where r.sort = x.best_sort order by r.id limit 1),
             'top_art', (select jsonb_build_object('id', a.id, 'title', a.title, 'thumb_path', a.thumb_path)
                         from public.artwork_publications a where a.owner_id = x.id and a.status = 'published'
                         order by a.appreciation_count desc, a.published_at desc limit 1)) order by x.rn)
           from (select * from ranked order by rn offset v_off limit v_limit) x), '[]'::jsonb)
    into v_total, v_rows;
  return jsonb_build_object('total', v_total, 'rows', v_rows, 'sort', v_sort);
end $$;

-- A player's land: every plot (public on the map anyway) and their canvases.
create or replace function public.player_land(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_p public.profiles%rowtype;
begin
  select * into v_p from public.profiles where lower(username) = lower(p_username);
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not (v_uid is not null and v_p.id = v_uid) and not private.has_role(v_uid, array['moderator', 'support'])
     and not private.visible_to(v_p.id, v_uid) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'player', private.profile_json(v_p.id),
    'total_plots', (select count(*) from public.world_plots where owner_id = v_p.id),
    'usd_per_second', (select coalesce(sum(private.plot_rent_rate(rarity, level)), 0) from public.world_plots where owner_id = v_p.id),
    -- [gx, gy, rarity, type, level, has_art, group_id, name]
    'plots', (select coalesce(jsonb_agg(jsonb_build_array(p.gx, p.gy, p.rarity, p.plot_type, p.level, p.art_rev is not null, m.group_id, p.name)
                                        order by p.claimed_at), '[]'::jsonb)
              from (select * from public.world_plots where owner_id = v_p.id order by claimed_at limit 2000) p
              left join public.canvas_group_members m on m.gx = p.gx and m.gy = p.gy),
    'canvases', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', g.id, 'name', g.name, 'plot_count', g.plot_count,
          'min_gx', g.min_gx, 'min_gy', g.min_gy, 'max_gx', g.max_gx, 'max_gy', g.max_gy,
          'art', (select private.artwork_card(a, v_uid) from public.artwork_publications a
                  where a.group_id = g.id and a.status = 'published' order by a.published_at desc limit 1))
          order by g.plot_count desc, g.created_at), '[]'::jsonb)
        from public.canvas_groups g where g.owner_id = v_p.id and g.status = 'active'));
end $$;

-- ===== Explorer: real GPS fixes, joystick tank ======================================

alter table public.explorers
  add column if not exists gps_lng double precision check (gps_lng between -180 and 180),
  add column if not exists gps_lat double precision check (gps_lat between -85.06 and 85.06),
  add column if not exists gps_at timestamptz,
  add column if not exists gps_accuracy_m real,
  add column if not exists joy_seconds real not null default 0 check (joy_seconds >= 0),
  add column if not exists joy_day timestamptz,
  add column if not exists joy_bucket_m real not null default 0,
  add column if not exists joy_at timestamptz;

update public.explorers set gps_lng = lng, gps_lat = lat, gps_at = fixed_at, gps_accuracy_m = accuracy_m
 where mode = 'gps' and gps_at is null;

update public.game_config
   set value = value || jsonb_build_object('joystick', jsonb_build_object(
         'enabled', true, 'speed_kmh', 40, 'tank_seconds', 600, 'daily_refill', true, 'burst_seconds', 4)),
       description = 'Location rules: plots are claimable within claim_reach plots of the explorer. GPS jumps faster than max_speed_kmh are refused (one re-anchor per jump cooldown). Without GPS the explorer travels at travel_speed_kmh. The joystick moves the explorer at joystick.speed_kmh from a tank of joystick.tank_seconds, refilled daily and by rewarded ads.'
 where key = 'explorer' and not (value ? 'joystick');

-- Straight Web Mercator line from (lng0, lat0) to (lng1, lat1), fraction f.
create or replace function private.mercator_lerp(lng0 float8, lat0 float8, lng1 float8, lat1 float8, f float8)
returns table (lng float8, lat float8)
language plpgsql immutable as $$
declare x0 float8; x1 float8; y0 float8; y1 float8; x float8; y float8;
begin
  x0 := (lng0 + 180) / 360; x1 := (lng1 + 180) / 360;
  if x1 - x0 > 0.5 then x1 := x1 - 1; elsif x0 - x1 > 0.5 then x1 := x1 + 1; end if;
  y0 := (1 - ln(tan(radians(lat0)) + 1 / cos(radians(lat0))) / pi()) / 2;
  y1 := (1 - ln(tan(radians(lat1)) + 1 / cos(radians(lat1))) / pi()) / 2;
  x := x0 + (x1 - x0) * f;
  y := y0 + (y1 - y0) * f;
  x := x - floor(x);
  lng := least(greatest(x * 360 - 180, -180), 180);
  lat := least(greatest(degrees(atan(sinh(pi() * (1 - 2 * y)))), -85.05), 85.05);
  return next;
end $$;

create or replace function private.joystick_json(e public.explorers) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'enabled', coalesce((j ->> 'enabled')::boolean, true),
    'seconds_left', round((case when coalesce((j ->> 'daily_refill')::boolean, true)
                                     and (e.joy_day is null or e.joy_day < private.day_start(now()))
                                then greatest(e.joy_seconds, coalesce((j ->> 'tank_seconds')::real, 600))
                                else e.joy_seconds end)::numeric, 2),
    'tank_seconds', coalesce((j ->> 'tank_seconds')::real, 600),
    'speed_kmh', coalesce((j ->> 'speed_kmh')::real, 40),
    'daily_refill', coalesce((j ->> 'daily_refill')::boolean, true),
    'next_refill_at', private.day_start(now()) + interval '1 day',
    'ads_enabled', private.flag('rewarded_ads'))
  from (select coalesce(private.cfg('explorer') -> 'joystick', '{}'::jsonb) as j) s
$$;

create or replace function private.explorer_json(p_uid uuid) returns jsonb
language plpgsql stable as $$
declare e public.explorers%rowtype; c record; v_cfg jsonb := private.cfg('explorer');
begin
  select * into e from public.explorers where player_id = p_uid;
  if not found then return null; end if;
  select * into c from private.explorer_now(p_uid);
  return jsonb_build_object(
    'mode', e.mode, 'lng', c.lng, 'lat', c.lat, 'gx', c.gx, 'gy', c.gy,
    'origin', jsonb_build_object('lng', e.lng, 'lat', e.lat),
    'fixed_at', e.fixed_at, 'accuracy_m', e.accuracy_m,
    'dest', case when e.dest_lng is not null then jsonb_build_object('lng', e.dest_lng, 'lat', e.dest_lat) end,
    'speed_mps', e.speed_mps, 'traveling', c.traveling, 'arrives_at', c.arrives_at,
    'jump_available_at', case when e.last_jump_at is null then null
                              else e.last_jump_at + make_interval(hours => coalesce((v_cfg ->> 'jump_cooldown_hours')::int, 24)) end,
    'reach', coalesce((v_cfg ->> 'claim_reach')::int, 1),
    'has_gps_fix', e.gps_at is not null,
    'joystick', private.joystick_json(e),
    'server_time', now());
end $$;

-- A GPS fix from the device, checked against the previous real fix at
-- explorer.max_speed_kmh (teleport protection). Joystick and tap travel don't
-- count, so a fix always brings the explorer back to the player. A far jump is
-- accepted once per jump cooldown (e.g. after a flight), otherwise ignored
-- ({accepted:false, wait_seconds}) and logged.
create or replace function public.report_position(p_lng float8, p_lat float8, p_accuracy_m float8 default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_cfg jsonb := private.cfg('explorer');
  e public.explorers%rowtype; v_dist float8; v_dt float8; v_max float8; v_tol float8; v_wait int;
  v_acc real := least(greatest(coalesce(p_accuracy_m, 50), 0), 5000)::real;
begin
  perform private.rate_limit('position', 1200, 3600);
  if p_lng is null or p_lat is null or p_lng not between -180 and 180 or p_lat not between -85.05 and 85.05 then
    raise exception 'invalid_position' using errcode = 'P0001';
  end if;
  select * into e from public.explorers where player_id = v_uid for update;
  if not found then
    insert into public.explorers (player_id, mode, lng, lat, fixed_at, accuracy_m, gps_lng, gps_lat, gps_at, gps_accuracy_m)
    values (v_uid, 'gps', p_lng, p_lat, now(), v_acc, p_lng, p_lat, now(), v_acc);
    return private.explorer_json(v_uid) || jsonb_build_object('accepted', true, 'placed', true);
  end if;
  if e.gps_at is null then
    -- first real fix for an explorer that was placed by hand: it moves to the player
    update public.explorers set mode = 'gps', lng = p_lng, lat = p_lat, fixed_at = now(), accuracy_m = v_acc,
           dest_lng = null, dest_lat = null, speed_mps = null,
           gps_lng = p_lng, gps_lat = p_lat, gps_at = now(), gps_accuracy_m = v_acc, updated_at = now()
     where player_id = v_uid;
    return private.explorer_json(v_uid) || jsonb_build_object('accepted', true, 'snapped', e.mode <> 'gps', 'first_fix', true);
  end if;
  v_dist := private.haversine_m(e.gps_lng, e.gps_lat, p_lng, p_lat);
  v_dt := greatest(extract(epoch from (now() - e.gps_at)), 1);
  v_max := coalesce((v_cfg ->> 'max_speed_kmh')::float8, 1000) / 3.6;
  v_tol := 1000 + v_acc + coalesce(e.gps_accuracy_m, 50);
  if v_dist > v_max * v_dt + v_tol then
    if e.last_jump_at is null or e.last_jump_at < now() - make_interval(hours => coalesce((v_cfg ->> 'jump_cooldown_hours')::int, 24)) then
      update public.explorers set mode = 'gps', lng = p_lng, lat = p_lat, fixed_at = now(), accuracy_m = v_acc,
             dest_lng = null, dest_lat = null, speed_mps = null, last_jump_at = now(),
             gps_lng = p_lng, gps_lat = p_lat, gps_at = now(), gps_accuracy_m = v_acc, updated_at = now()
       where player_id = v_uid;
      insert into private.security_events (player_id, kind, details)
      values (v_uid, 'gps_reanchor', jsonb_build_object('distance_m', round(v_dist::numeric), 'seconds', round(v_dt::numeric)));
      return private.explorer_json(v_uid) || jsonb_build_object('accepted', true, 'reanchored', true);
    end if;
    -- not an error (GPS glitches happen): keep the old position, log, and tell the client how long to wait
    v_wait := ceil((v_dist - v_tol) / v_max - v_dt)::int;
    insert into private.security_events (player_id, kind, details)
    values (v_uid, 'gps_jump_rejected', jsonb_build_object('distance_m', round(v_dist::numeric), 'seconds', round(v_dt::numeric)));
    return private.explorer_json(v_uid) || jsonb_build_object('accepted', false, 'rejected', 'position_jump', 'wait_seconds', v_wait);
  end if;
  update public.explorers set mode = 'gps', lng = p_lng, lat = p_lat, fixed_at = now(), accuracy_m = v_acc,
         dest_lng = null, dest_lat = null, speed_mps = null,
         gps_lng = p_lng, gps_lat = p_lat, gps_at = now(), gps_accuracy_m = v_acc, updated_at = now()
   where player_id = v_uid;
  return private.explorer_json(v_uid) || jsonb_build_object('accepted', true, 'snapped', e.mode <> 'gps');
end $$;

-- One joystick update: the client sends where its explorer is now. The server
-- lets it move at most joystick.speed_kmh (a token bucket of burst_seconds
-- absorbs network jitter) and charges the tank one second per second of
-- full-speed movement. Requests beyond that are clamped, never teleported.
create or replace function public.joystick_step(p_lng float8, p_lat float8) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player();
  j jsonb := coalesce(private.cfg('explorer') -> 'joystick', '{}'::jsonb);
  e public.explorers%rowtype; c record; t record;
  v_speed float8 := greatest(coalesce((j ->> 'speed_kmh')::float8, 40), 1) / 3.6;
  v_tank float8 := greatest(coalesce((j ->> 'tank_seconds')::float8, 600), 0);
  v_burst float8 := least(greatest(coalesce((j ->> 'burst_seconds')::float8, 4), 1), 30);
  v_day timestamptz := private.day_start(now());
  v_refill boolean; v_secs float8; v_bucket float8; v_dt float8; v_d float8; v_allow float8;
begin
  perform private.rate_limit('joystick', 9000, 3600);
  if p_lng is null or p_lat is null or p_lng not between -180 and 180 or p_lat not between -85.05 and 85.05 then
    raise exception 'invalid_position' using errcode = 'P0001';
  end if;
  if not coalesce((j ->> 'enabled')::boolean, true) then raise exception 'joystick_disabled' using errcode = 'P0001'; end if;
  select * into e from public.explorers where player_id = v_uid for update;
  if not found then raise exception 'explorer_required' using errcode = 'P0001'; end if;
  v_refill := coalesce((j ->> 'daily_refill')::boolean, true) and (e.joy_day is null or e.joy_day < v_day);
  v_secs := case when v_refill then greatest(e.joy_seconds, v_tank) else e.joy_seconds end;
  select * into c from private.explorer_now(v_uid);
  v_dt := case when e.joy_at is null then v_burst else greatest(extract(epoch from (now() - e.joy_at)), 0) end;
  v_bucket := least(v_speed * v_burst, coalesce(e.joy_bucket_m, 0) + v_dt * v_speed * 1.15);
  v_d := private.haversine_m(c.lng, c.lat, p_lng, p_lat);
  v_allow := greatest(least(v_d, v_bucket, v_secs * v_speed), 0);
  if v_allow < 0.01 then
    update public.explorers
       set joy_seconds = v_secs::real, joy_day = case when v_refill then v_day else e.joy_day end,
           joy_bucket_m = v_bucket::real, joy_at = now()
     where player_id = v_uid;
    return private.explorer_json(v_uid) || jsonb_build_object('moved_m', 0, 'clamped', v_d > 0.5, 'empty', v_secs <= 0.01);
  end if;
  select * into t from private.mercator_lerp(c.lng, c.lat, p_lng, p_lat, case when v_d > 0 then v_allow / v_d else 0 end);
  update public.explorers
     set mode = 'manual', lng = t.lng, lat = t.lat, fixed_at = now(), accuracy_m = null,
         dest_lng = null, dest_lat = null, speed_mps = null,
         joy_seconds = greatest(v_secs - v_allow / v_speed, 0)::real,
         joy_day = case when v_refill then v_day else e.joy_day end,
         joy_bucket_m = greatest(v_bucket - v_allow, 0)::real, joy_at = now(), updated_at = now()
   where player_id = v_uid;
  return private.explorer_json(v_uid)
      || jsonb_build_object('moved_m', round(v_allow::numeric, 2), 'clamped', v_allow < v_d - 0.5,
                            'empty', v_secs - v_allow / v_speed <= 0.01);
end $$;

-- Rewarded ads (not connected yet). An ad network's server-side verification
-- callback (an Edge Function holding the service key) calls this once per
-- verified view; transaction ids make it idempotent.
create table if not exists private.ad_rewards (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  reward text not null check (reward in ('joystick_refill')),
  network text not null,
  transaction_id text not null,
  created_at timestamptz not null default now(),
  unique (network, transaction_id)
);

create or replace function public.svc_ad_reward(p_player_id uuid, p_reward text, p_network text, p_transaction_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare j jsonb := coalesce(private.cfg('explorer') -> 'joystick', '{}'::jsonb); v_id bigint;
begin
  if not private.flag('rewarded_ads') then raise exception 'ads_disabled' using errcode = 'P0001'; end if;
  if p_reward is distinct from 'joystick_refill' then raise exception 'unknown_reward' using errcode = 'P0001'; end if;
  if coalesce(p_network, '') = '' or coalesce(p_transaction_id, '') = '' then raise exception 'invalid_receipt' using errcode = 'P0001'; end if;
  insert into private.ad_rewards (player_id, reward, network, transaction_id)
  values (p_player_id, p_reward, left(p_network, 40), left(p_transaction_id, 200))
  on conflict (network, transaction_id) do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  update public.explorers set joy_seconds = greatest(joy_seconds, coalesce((j ->> 'tank_seconds')::real, 600)), updated_at = now()
   where player_id = p_player_id;
  return jsonb_build_object('ok', true, 'duplicate', false);
end $$;

-- ===== Minigame earnings, tunable by the operator ================================

update public.game_config
   set value = jsonb_set(
         case when value ? 'ink_multiplier' then value else value || '{"ink_multiplier": 1}'::jsonb end,
         '{games}',
         coalesce((select jsonb_object_agg(k, case when v ? 'ink_multiplier' then v else v || '{"ink_multiplier": 1}'::jsonb end)
                   from jsonb_each(value -> 'games') g(k, v)), '{}'::jsonb), true)
 where key = 'minigames';

create or replace function public.svc_finish_minigame(p_session_id uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_s public.minigame_sessions%rowtype; v_cfg jsonb := private.cfg('minigames'); v_rw jsonb;
  v_elapsed numeric; v_flags text[]; v_valid boolean; v_passed boolean; v_score int; v_stars int;
  v_plot_level int; v_today int; v_mult numeric; v_ink_mult numeric; v_ink int := 0; v_pig int := 0; v_bp int := 0;
  v_held boolean := false; v_record jsonb; v_best_before int; v_rarity_mult numeric := 1; v_limit int; v_practice boolean := false;
begin
  select * into v_s from public.minigame_sessions where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0001'; end if;
  if v_s.status <> 'active' then raise exception 'session_closed' using errcode = 'P0001', detail = v_s.status; end if;
  if now() > v_s.expires_at + interval '1 minute' then
    update public.minigame_sessions set status = 'expired', finished_at = now() where id = p_session_id;
    return jsonb_build_object('status', 'expired', 'passed', false, 'score', 0);
  end if;
  v_rw := v_cfg -> 'rewards';
  v_elapsed := extract(epoch from (now() - v_s.started_at)) * 1000;
  select coalesce(array_agg(f), '{}') into v_flags from jsonb_array_elements_text(coalesce(p_result -> 'flags', '[]'::jsonb)) f;
  v_valid := coalesce((p_result ->> 'valid')::boolean, false);
  if coalesce((p_result ->> 'min_duration_ms')::numeric, 0) > v_elapsed + 2000 then
    v_valid := false;
    v_flags := array_append(v_flags, 'faster_than_server_clock');
  end if;
  v_passed := v_valid and coalesce((p_result ->> 'passed')::boolean, false);
  v_score := case when v_valid then greatest(0, least(coalesce((p_result ->> 'score')::int, 0), 100000)) else 0 end;
  v_stars := case when v_passed then greatest(0, least(coalesce((p_result ->> 'stars')::int, 0), 3)) else 0 end;

  select best_score into v_best_before from public.minigame_records where player_id = v_s.player_id and game = v_s.game;
  update public.minigame_sessions
     set status = case when v_valid then 'validated' else 'rejected' end,
         finished_at = now(), score = v_score, passed = v_passed, stars = v_stars,
         summary = p_result -> 'summary', flags = v_flags,
         review_status = case when v_valid and coalesce((p_result ->> 'suspicious')::boolean, false) then 'flagged' else 'none' end
   where id = p_session_id;

  insert into public.minigame_records (player_id, game, highest_level, best_score, total_score, plays, wins, last_played_at)
  values (v_s.player_id, v_s.game, case when v_passed then v_s.level else 0 end, v_score, v_score, 1,
          case when v_passed then 1 else 0 end, now())
  on conflict (player_id, game) do update set
    highest_level = greatest(public.minigame_records.highest_level, case when v_passed then v_s.level else 0 end),
    best_score = greatest(public.minigame_records.best_score, v_score),
    total_score = public.minigame_records.total_score + v_score,
    plays = public.minigame_records.plays + 1,
    wins = public.minigame_records.wins + case when v_passed then 1 else 0 end,
    last_played_at = now()
  returning jsonb_build_object('highest_level', highest_level, 'best_score', best_score, 'plays', plays, 'wins', wins) into v_record;

  if v_valid then
    -- Ink (the land currency) is earned ONLY here: wins pay base + level + score,
    -- scaled by the plot's level and rarity and by the operator's global and
    -- per-game multipliers, for the first N wins per game per day.
    select coalesce(wp.level, 1), coalesce(r.ink_reward_multiplier, 1) into v_plot_level, v_rarity_mult
    from public.world_plots wp left join public.plot_rarities r on r.id = wp.rarity
    where wp.gx = v_s.gx and wp.gy = v_s.gy and wp.owner_id = v_s.player_id;
    select count(*) into v_today from public.minigame_rewards mr join public.minigame_sessions ms on ms.id = mr.session_id
    where mr.player_id = v_s.player_id and ms.game = v_s.game and mr.ink > 0 and mr.created_at >= private.day_start(now());
    v_limit := coalesce((v_cfg ->> 'daily_rewarded_wins_per_game')::int, 6);
    v_mult := (1 + coalesce((v_cfg ->> 'plot_level_bonus')::numeric, 0.05) * (coalesce(v_plot_level, 1) - 1)) * coalesce(v_rarity_mult, 1);
    v_ink_mult := v_mult * greatest(coalesce((v_cfg ->> 'ink_multiplier')::numeric, 1), 0)
                         * greatest(coalesce((v_cfg -> 'games' -> v_s.game ->> 'ink_multiplier')::numeric, 1), 0);
    if v_passed and v_today < v_limit then
      v_ink := floor(((v_rw ->> 'base_ink')::numeric + (v_rw ->> 'ink_per_level')::numeric * v_s.level
                      + v_score / greatest((v_rw ->> 'score_ink_divisor')::numeric, 1)) * v_ink_mult);
      v_bp := floor(((v_rw ->> 'brush_points_base')::numeric + (v_rw ->> 'brush_points_per_star')::numeric * v_stars) * least(v_mult, 1.5));
      v_pig := case when v_stars >= 3 then floor((v_rw ->> 'pigments_on_three_stars')::numeric * least(v_mult, 1.5)) else 0 end;
    elsif v_passed then
      v_practice := true;
      v_bp := (v_rw ->> 'fail_brush_points')::int;
    else
      v_bp := (v_rw ->> 'fail_brush_points')::int;
    end if;
    v_held := coalesce((p_result ->> 'suspicious')::boolean, false);
    insert into public.minigame_rewards (session_id, player_id, ink, pigments, brush_points, multiplier, held)
    values (p_session_id, v_s.player_id, v_ink, v_pig, v_bp, round(v_ink_mult, 3), v_held);
    if v_held then
      insert into public.moderation_cases (kind, priority, session_id, subject_player_id, reason, details)
      values ('score_review', 2, p_session_id, v_s.player_id, 'suspicious_minigame_result',
              jsonb_build_object('flags', v_flags, 'score', v_score, 'game', v_s.game, 'level', v_s.level));
    else
      perform private.grant(v_s.player_id, jsonb_build_object('ink', v_ink, 'pigments', v_pig, 'brush_points', v_bp),
                            'minigame', 'minigame_session', p_session_id::text, 'minigame:' || p_session_id::text);
    end if;
  end if;

  return jsonb_build_object(
    'status', case when v_valid then 'validated' else 'rejected' end,
    'valid', v_valid, 'passed', v_passed, 'score', v_score, 'stars', v_stars, 'flags', to_jsonb(v_flags),
    'new_best', v_score > coalesce(v_best_before, 0),
    'rewards', jsonb_build_object('ink', v_ink, 'pigments', v_pig, 'brush_points', v_bp, 'held', v_held,
                                  'multiplier', round(coalesce(v_ink_mult, 0), 3), 'practice', v_practice,
                                  'rewarded_left', greatest(coalesce(v_limit, 0) - coalesce(v_today, 0) - case when v_ink > 0 then 1 else 0 end, 0),
                                  'resets_at', private.day_start(now()) + interval '1 day'),
    'record', v_record,
    'balances', private.balances(v_s.player_id),
    'achievements', private.evaluate_achievements(v_s.player_id));
end $$;

-- ===== Admin ==================================================================

create or replace function public.admin_config_set(p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); v_old jsonb; g record;
begin
  select value into v_old from public.game_config where key = p_key for update;
  if not found then raise exception 'unknown_config_key' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_value) is distinct from jsonb_typeof(v_old) then raise exception 'config_type_mismatch' using errcode = 'P0001'; end if;
  -- guard the keys every server function depends on
  if p_key = 'economy' and not (p_value ? 'acquire' and p_value ? 'upgrade' and p_value ? 'starter_bonus' and p_value ? 'publish_reward') then
    raise exception 'config_missing_required_keys' using errcode = 'P0001';
  end if;
  if p_key = 'economy' and ((p_value -> 'starter_bonus') ? 'ink' or (p_value -> 'publish_reward') ? 'ink') then
    raise exception 'ink_minigame_only' using errcode = 'P0001';
  end if;
  if p_key = 'economy' and coalesce((p_value -> 'acquire' ->> 'base_ink')::numeric, -1) not between 1 and 1000000 then
    raise exception 'invalid_economy_config' using errcode = 'P0001';
  end if;
  if p_key = 'rent' and (
       coalesce((p_value -> 'boost' ->> 'multiplier')::numeric, 0) not between 1 and 100
    or coalesce((p_value -> 'boost' ->> 'minutes_per_boost')::int, 0) not between 1 and 1440
    or coalesce((p_value -> 'boost' ->> 'max_stack_hours')::numeric, 0) not between 0.5 and 72
    or coalesce((p_value -> 'boost' ->> 'free_per_day')::int, -1) not between 0 and 96
    or coalesce((p_value -> 'boost' ->> 'reset_hour_utc')::int, -1) not between 0 and 23
    or coalesce((p_value ->> 'level_bonus')::numeric, -1) not between 0 and 1
    or coalesce((p_value ->> 'max_offline_days')::int, 0) not between 1 and 3650) then
    raise exception 'invalid_rent_config' using errcode = 'P0001';
  end if;
  if p_key = 'rent' then
    -- bank everyone's rent under the old multiplier/bonus before switching
    perform private.rent_settle(player_id) from public.rent_accounts;
  end if;
  if p_key = 'explorer' and (
       coalesce((p_value ->> 'claim_reach')::int, -1) not between 0 and 25
    or coalesce((p_value ->> 'max_speed_kmh')::numeric, 0) not between 10 and 5000
    or coalesce((p_value ->> 'travel_speed_kmh')::numeric, 0) not between 1 and 2000
    or coalesce((p_value ->> 'jump_cooldown_hours')::int, -1) not between 0 and 8760
    or (p_value ? 'joystick' and (
         coalesce((p_value -> 'joystick' ->> 'speed_kmh')::numeric, 0) not between 1 and 500
      or coalesce((p_value -> 'joystick' ->> 'tank_seconds')::numeric, -1) not between 0 and 86400
      or coalesce((p_value -> 'joystick' ->> 'burst_seconds')::numeric, 4) not between 1 and 30))) then
    raise exception 'invalid_explorer_config' using errcode = 'P0001';
  end if;
  if p_key = 'minigames' then
    if not (p_value ? 'rewards') or coalesce((p_value -> 'rewards' ->> 'base_ink')::numeric, -1) not between 0 and 100000
       or coalesce((p_value -> 'rewards' ->> 'ink_per_level')::numeric, -1) not between 0 and 10000
       or coalesce((p_value -> 'rewards' ->> 'score_ink_divisor')::numeric, 0) not between 1 and 1000000
       or coalesce((p_value ->> 'daily_rewarded_wins_per_game')::int, -1) not between 0 and 1000
       or coalesce((p_value ->> 'plot_level_bonus')::numeric, -1) not between 0 and 10
       or coalesce((p_value ->> 'ink_multiplier')::numeric, 1) not between 0 and 100 then
      raise exception 'invalid_minigame_config' using errcode = 'P0001';
    end if;
    for g in select k, v from jsonb_each(coalesce(p_value -> 'games', '{}'::jsonb)) x(k, v) loop
      if coalesce((g.v ->> 'ink_multiplier')::numeric, 1) not between 0 and 100 then
        raise exception 'invalid_minigame_config' using errcode = 'P0001';
      end if;
    end loop;
  end if;
  if p_key = 'moderation' and coalesce(p_value ->> 'mode', '') not in ('manual', 'auto', 'screened') then
    raise exception 'invalid_moderation_mode' using errcode = 'P0001';
  end if;
  if p_key = 'limits' and (coalesce((p_value ->> 'max_canvas_side')::int, 0) not between 1 and 32
                           or coalesce((p_value ->> 'max_canvas_plots')::int, 0) not between 1 and 1024) then
    raise exception 'invalid_limits' using errcode = 'P0001';
  end if;
  update public.game_config set value = p_value, updated_at = now(), updated_by = v_uid where key = p_key;
  perform private.audit('config.set', 'config', p_key, jsonb_build_object('old', v_old, 'new', p_value));
  return public.admin_config_get();
end $$;

-- local_dev_mode lets anyone grant themselves admin; it can never be switched on from the console.
create or replace function public.admin_set_flag(p_key text, p_enabled boolean, p_config jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(); v_flag public.feature_flags%rowtype;
begin
  select * into v_flag from public.feature_flags where key = p_key for update;
  if not found then raise exception 'unknown_flag' using errcode = 'P0001'; end if;
  if p_key = 'local_dev_mode' then raise exception 'flag_locked' using errcode = 'P0001'; end if;
  -- legally gated modules can never be enabled from the console; they require a
  -- reviewed migration that sets config.legal_signoff (see docs/COMPLIANCE.md).
  if p_enabled and coalesce((v_flag.config ->> 'legally_gated')::boolean, false)
     and coalesce(v_flag.config ->> 'legal_signoff', '') = '' then
    raise exception 'legal_signoff_required' using errcode = 'P0001';
  end if;
  update public.feature_flags set enabled = p_enabled, config = coalesce(p_config, config), updated_at = now(), updated_by = v_uid
  where key = p_key;
  perform private.audit('flag.set', 'flag', p_key, jsonb_build_object('enabled', p_enabled, 'config', p_config));
  return (select to_jsonb(f) from public.feature_flags f where f.key = p_key);
end $$;

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy', 'support']);
begin
  return jsonb_build_object(
    'roles', (select coalesce(jsonb_agg(role), '[]'::jsonb) from public.admin_roles where player_id = v_uid),
    'players_total', (select count(*) from public.players),
    'players_active_15m', (select count(*) from public.players where last_active_at > now() - interval '15 minutes'),
    'players_active_24h', (select count(*) from public.players where last_active_at > now() - interval '1 day'),
    'signups_24h', (select count(*) from public.players where created_at > now() - interval '1 day'),
    'plots_owned', (select count(*) from public.world_plots where owner_id is not null),
    'plots_claimed_24h', (select count(*) from public.plot_ownership where acquired_at > now() - interval '1 day'),
    'named_plots', (select count(*) from public.world_plots where owner_id is not null and name is not null),
    'groups_active', (select count(*) from public.canvas_groups where status = 'active'),
    'art_published_24h', (select count(*) from public.artwork_publications where published_at > now() - interval '1 day'),
    'pending_review', (select count(*) from public.artwork_publications where status = 'pending_review'),
    'publications', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) as n from public.artwork_publications group by status) s),
    'open_cases', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (
        select kind, count(*) as n from public.moderation_cases where status = 'open' group by kind) s),
    'jobs', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) as n from private.render_jobs group by status) s),
    'oldest_queued_seconds', (select coalesce(extract(epoch from now() - min(created_at)), 0)::int
                              from private.render_jobs where status = 'queued'),
    'client_errors_24h', (select count(*) from private.client_errors where created_at > now() - interval '1 day'),
    'minigame_sessions_24h', (select count(*) from public.minigame_sessions where started_at > now() - interval '1 day'),
    'minigame_wins_24h', (select count(*) from public.minigame_sessions where started_at > now() - interval '1 day' and passed),
    'flagged_sessions', (select count(*) from public.minigame_sessions where review_status = 'flagged'),
    'ink_issued_24h', (select coalesce(sum(delta), 0) from public.resource_ledger where resource = 'ink' and delta > 0 and created_at > now() - interval '1 day'),
    'ink_spent_24h', (select coalesce(-sum(delta), 0) from public.resource_ledger where resource = 'ink' and delta < 0 and created_at > now() - interval '1 day'),
    'gps_jumps_24h', (select count(*) from private.security_events where kind = 'gps_jump_rejected' and created_at > now() - interval '1 day'),
    'rent', jsonb_build_object(
      'settled_liability_usd', (select coalesce(sum(balance_usd + held_usd), 0) from public.rent_accounts),
      'lifetime_usd', (select coalesce(sum(lifetime_usd), 0) from public.rent_accounts),
      'paid_usd', (select coalesce(sum(paid_usd), 0) from public.rent_accounts),
      'rate_usd_per_second', (select coalesce(sum(r.usd_per_second * (1 + coalesce((private.cfg('rent') ->> 'level_bonus')::numeric, 0.01) * (p.level - 1))), 0)
                              from public.world_plots p join public.plot_rarities r on r.id = p.rarity where p.owner_id is not null),
      'boosted_players_now', (select count(*) from public.rent_accounts where boost_until > now())),
    'server_time', now());
end $$;

create or replace function public.admin_player_detail(p_player_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'support', 'economy']); e public.explorers%rowtype;
begin
  if not exists (select 1 from public.players where id = p_player_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into e from public.explorers where player_id = p_player_id;
  return jsonb_build_object(
    'player', (select to_jsonb(p) from public.players p where p.id = p_player_id),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_player_id),
    'email', (select email from auth.users where id = p_player_id),
    'balances', private.balances(p_player_id),
    'rent', private.rent_json(p_player_id),
    -- coarse cell only: support needs to see whether claims were near the explorer,
    -- not the player's precise location
    'explorer', (select jsonb_build_object('mode', x.mode, 'gx', x.gx >> 4 << 4, 'gy', x.gy >> 4 << 4, 'traveling', x.traveling)
                 from private.explorer_now(p_player_id) x),
    'joystick', case when e.player_id is not null then private.joystick_json(e) end,
    'roles', (select coalesce(jsonb_agg(role), '[]'::jsonb) from public.admin_roles where player_id = p_player_id),
    'plots', (select count(*) from public.world_plots where owner_id = p_player_id),
    'groups', (select count(*) from public.canvas_groups where owner_id = p_player_id and status = 'active'),
    'ledger', (select coalesce(jsonb_agg(to_jsonb(l) order by l.id desc), '[]'::jsonb) from (
                 select * from public.resource_ledger where player_id = p_player_id order by id desc limit 40) l),
    'publications', (select coalesce(jsonb_agg(private.publication_json(a) order by a.created_at desc), '[]'::jsonb)
                     from public.artwork_publications a where a.owner_id = p_player_id and a.status <> 'cancelled'),
    'sessions', (select coalesce(jsonb_agg(to_jsonb(s) - 'seed' order by s.started_at desc), '[]'::jsonb) from (
                   select * from public.minigame_sessions where player_id = p_player_id order by started_at desc limit 30) s),
    'security_events', (select coalesce(jsonb_agg(jsonb_build_object('kind', s.kind, 'details', s.details, 'created_at', s.created_at)
                                                   order by s.id desc), '[]'::jsonb) from (
                          select * from private.security_events where player_id = p_player_id order by id desc limit 30) s),
    'cases', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb) from public.moderation_cases c
              where c.subject_player_id = p_player_id or c.reporter_id = p_player_id));
end $$;

-- ===== Privileges for everything defined in this migration ==========================
revoke all on table private.owner_claim, private.ad_rewards from public;
do $$
declare f text;
begin
  foreach f in array array[
    'private.plot_name_reset()', 'private.collapse_repeats(text)', 'private.clean_plot_name(text)',
    'private.mercator_lerp(double precision, double precision, double precision, double precision, double precision)',
    'private.joystick_json(public.explorers)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array[
    'public.owner_status()', 'public.claim_owner(text)', 'public.name_plot(int, int, text)', 'public.admin_clear_plot_name(int, int, text)',
    'public.claim_starter_plot(int, int, text)', 'public.acquire_plot(int, int, text, text)',
    'public.plots_in_bbox(int, int, int, int)', 'public.my_plots()', 'public.plot_details(int, int)',
    'public.players_directory(text, text, int, int)', 'public.player_land(text)',
    'public.report_position(double precision, double precision, double precision)', 'public.joystick_step(double precision, double precision)',
    'public.svc_ad_reward(uuid, text, text, text)', 'public.svc_finish_minigame(uuid, jsonb)',
    'public.admin_config_set(text, jsonb)', 'public.admin_set_flag(text, boolean, jsonb)', 'public.admin_overview()',
    'public.admin_player_detail(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon, authenticated', f);
    if f like 'public.svc\_%' then
      execute format('grant execute on function %s to service_role', f);
    else
      execute format('grant execute on function %s to authenticated, service_role', f);
    end if;
  end loop;
  -- public reads (signed-out visitors can browse the world and its players)
  foreach f in array array[
    'public.owner_status()', 'public.plots_in_bbox(int, int, int, int)', 'public.plot_details(int, int)',
    'public.players_directory(text, text, int, int)', 'public.player_land(text)'] loop
    execute format('grant execute on function %s to anon', f);
  end loop;
end $$;
