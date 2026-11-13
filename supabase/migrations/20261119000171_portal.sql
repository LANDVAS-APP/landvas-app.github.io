-- LANDVAS portal: admin.landvas.app (staff) and my.landvas.app (players).
-- ---------------------------------------------------------------------------------------------------------------
-- The portal is a separate website (portal/ in the repo). It is never part of the game or the mobile apps; it talks
-- to the same database through these functions (and the existing admin_* / my_* ones).
--
--  1. Two-step sign-in for staff: game_config 'portal'.require_mfa. When it's on, every admin function
--     (private.require_admin) needs a session verified with an authenticator app (JWT aal2).
--  2. Staff reads: who-am-I, daily series (cached per finished day), player table, player 360, economy, map, audit.
--  3. Owner only: a data explorer over every table (browse, filter, view, edit, insert, delete — every write audited
--     with the row before and after), a read-only SQL console, and the portal's own settings.
--  4. Players: their own summary, daily series, full Ink/USD ledgers, every plot with its live rate, plot detail,
--     and an "all my data" explorer over every table that holds their rows (internal anti-cheat fields left out).
-- ---------------------------------------------------------------------------------------------------------------

insert into public.game_config (key, value, description) values
  ('portal', jsonb_build_object('require_mfa', false),
   'Admin portal (admin.landvas.app). require_mfa: every staff action needs a sign-in verified with an authenticator app.')
on conflict (key) do nothing;

-- ---- time-range indexes (the portal's daily charts) -----------------------------------------------------------
create index if not exists resource_ledger_created_idx on public.resource_ledger (created_at);
create index if not exists rent_ledger_created_idx on public.rent_ledger (created_at);
create index if not exists minigame_sessions_started_idx on public.minigame_sessions (started_at);
create index if not exists plot_ownership_acquired_idx on public.plot_ownership (acquired_at);
create index if not exists plot_ownership_released_idx on public.plot_ownership (released_at) where released_at is not null;
create index if not exists players_created_idx on public.players (created_at);

-- ---- 1. helpers -------------------------------------------------------------------------------------------------

/** the assurance level of this request's sign-in: aal2 = verified with a second factor */
create or replace function private.portal_aal() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal', 'aal1')
$$;

/** staff functions: unchanged, plus the optional two-step sign-in requirement */
create or replace function private.require_admin(p_roles text[] default '{}'::text[]) returns uuid
language plpgsql as $$
declare v_uid uuid := private.uid();
begin
  if not private.has_role(v_uid, p_roles) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if coalesce((private.cfg('portal') ->> 'require_mfa')::boolean, false) and private.portal_aal() <> 'aal2' then
    raise exception 'mfa_required' using errcode = 'P0001';
  end if;
  return v_uid;
end $$;

/** the owner only (not admins or other staff) */
create or replace function private.portal_owner() returns uuid
language plpgsql as $$
declare v_uid uuid := private.require_admin('{}');
begin
  if not exists (select 1 from public.admin_roles where player_id = v_uid and role = 'owner') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  return v_uid;
end $$;

/** a big value in a list becomes a short preview: {"__clip": <length>, "preview": "..."} */
create or replace function private.portal_clip(v jsonb, n int default 400) returns jsonb
language sql immutable as $$
  select case
    when v is null then null
    when length(v::text) <= n then v
    else jsonb_build_object('__clip', length(v::text), 'preview',
      left(case jsonb_typeof(v) when 'string' then v #>> '{}' else v::text end, n))
  end
$$;

/** tables whose values are never shown (keys and secrets); rows are listed with everything but the key redacted */
create or replace function private.portal_sensitive(p_rel regclass) returns boolean
language sql stable as $$
  select p_rel in (select to_regclass(x) from unnest(array['private.secrets', 'private.integrity_secret', 'private.owner_claim']) x where to_regclass(x) is not null)
$$;

/** a table the explorer may open (public or private schema), or an error */
create or replace function private.portal_rel(p_schema text, p_table text) returns regclass
language plpgsql stable as $$
declare v regclass;
begin
  if p_schema not in ('public', 'private') then raise exception 'unknown_table' using errcode = 'P0001'; end if;
  select c.oid::regclass into v from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = p_schema and c.relname = p_table and c.relkind in ('r', 'p', 'v', 'm');
  if v is null then raise exception 'unknown_table' using errcode = 'P0001'; end if;
  return v;
end $$;

/** primary-key columns of a table, in key order */
create or replace function private.portal_pk(p_rel regclass) returns text[]
language sql stable as $$
  select coalesce(array_agg(a.attname::text order by k.ord), '{}')
  from pg_index i
  cross join lateral unnest(i.indkey::int2[]) with ordinality k(attnum, ord)
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where i.indrelid = p_rel and i.indisprimary
$$;

/** the SQL type of a column (from the catalog, never from the caller), or null */
create or replace function private.portal_coltype(p_rel regclass, p_col text) returns text
language sql stable as $$
  select format_type(a.atttypid, a.atttypmod) from pg_attribute a
  where a.attrelid = p_rel and a.attname = p_col and a.attnum > 0 and not a.attisdropped
$$;

/** a JSON value as an SQL expression of a column's type */
create or replace function private.portal_value(p_rel regclass, p_col text, v jsonb) returns text
language plpgsql stable as $$
declare t text := private.portal_coltype(p_rel, p_col);
begin
  if t is null then raise exception 'unknown_column' using errcode = 'P0001', detail = p_col; end if;
  if v is null or jsonb_typeof(v) = 'null' then return 'null'; end if;
  if t in ('jsonb', 'json') then return format('%L::%s', v::text, t); end if;
  if t like '%[]' and jsonb_typeof(v) = 'array' then
    return format('coalesce((select array_agg(x) from jsonb_array_elements_text(%L::jsonb) x), ''{}'')::%s', v::text, t);
  end if;
  return format('%L::%s', v #>> '{}', t);
end $$;

/** WHERE clause matching one row by its primary key values ({"col": value, ...}) */
create or replace function private.portal_pk_where(p_rel regclass, p_pk jsonb) returns text
language plpgsql stable as $$
declare v_pk text[] := private.portal_pk(p_rel); c text; w text := '';
begin
  if coalesce(array_length(v_pk, 1), 0) = 0 then raise exception 'no_primary_key' using errcode = 'P0001'; end if;
  foreach c in array v_pk loop
    if p_pk is null or not (p_pk ? c) then raise exception 'primary_key_required' using errcode = 'P0001', detail = c; end if;
    w := w || case when w = '' then '' else ' and ' end || format('%I = %s', c, private.portal_value(p_rel, c, p_pk -> c));
  end loop;
  return w;
end $$;

/** filters from the explorer: [{"col": "...", "op": "eq|neq|gt|gte|lt|lte|like|null|notnull|in", "value": ...}] */
create or replace function private.portal_where(p_rel regclass, p_filters jsonb) returns text
language plpgsql stable as $$
declare f jsonb; c text; t text; op text; w text := 'true'; v jsonb;
begin
  for f in select * from jsonb_array_elements(case when jsonb_typeof(p_filters) = 'array' then p_filters else '[]'::jsonb end) loop
    c := f ->> 'col'; op := coalesce(f ->> 'op', 'eq'); v := f -> 'value';
    t := private.portal_coltype(p_rel, c);
    if t is null then raise exception 'unknown_column' using errcode = 'P0001', detail = c; end if;
    w := w || ' and ' || case op
      when 'eq' then format('%I = %s', c, private.portal_value(p_rel, c, v))
      when 'neq' then format('%I is distinct from %s', c, private.portal_value(p_rel, c, v))
      when 'gt' then format('%I > %s', c, private.portal_value(p_rel, c, v))
      when 'gte' then format('%I >= %s', c, private.portal_value(p_rel, c, v))
      when 'lt' then format('%I < %s', c, private.portal_value(p_rel, c, v))
      when 'lte' then format('%I <= %s', c, private.portal_value(p_rel, c, v))
      when 'like' then format('%I::text ilike %L', c, '%' || replace(replace(coalesce(v #>> '{}', ''), '%', '\%'), '_', '\_') || '%')
      when 'null' then format('%I is null', c)
      when 'notnull' then format('%I is not null', c)
      when 'in' then format('%I::text = any(%L::text[])', c,
        (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(case when jsonb_typeof(v) = 'array' then v else jsonb_build_array(v) end) x))
      else null end;
    if w is null then raise exception 'unknown_operator' using errcode = 'P0001', detail = op; end if;
  end loop;
  return w;
end $$;

-- ---- 2. staff: who am I, daily series, players, player 360, economy, map, audit --------------------------------

/** anyone signed in: whether they're staff, which roles, and whether this sign-in passed two-step verification */
create or replace function public.portal_whoami() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid(); v_roles text[];
begin
  select coalesce(array_agg(role order by role), '{}') into v_roles from public.admin_roles where player_id = v_uid;
  return jsonb_build_object(
    'user_id', v_uid,
    'username', (select username from public.profiles where id = v_uid),
    'onboarded', exists (select 1 from public.players where id = v_uid),
    'roles', to_jsonb(v_roles),
    'staff', cardinality(v_roles) > 0,
    'owner', 'owner' = any(v_roles),
    'aal', private.portal_aal(),
    'require_mfa', coalesce((private.cfg('portal') ->> 'require_mfa')::boolean, false),
    'server_time', now());
end $$;

/** one day's numbers, for everyone (p_player null) or one player */
create or replace function private.portal_day(p_tz text, p_day date, p_player uuid default null) returns jsonb
language plpgsql stable as $$
declare v_from timestamptz := (p_day::timestamp) at time zone p_tz; v_to timestamptz := ((p_day + 1)::timestamp) at time zone p_tz;
  v_res jsonb; v_ink_reasons jsonb; v_usd jsonb; v jsonb;
begin
  select coalesce(jsonb_object_agg(resource, jsonb_build_object('in', i, 'out', o, 'n', n)), '{}') into v_res from (
    select resource, coalesce(sum(delta) filter (where delta > 0), 0) i, coalesce(-sum(delta) filter (where delta < 0), 0) o, count(*) n
    from public.resource_ledger where created_at >= v_from and created_at < v_to and (p_player is null or player_id = p_player) group by resource) r;
  select coalesce(jsonb_object_agg(reason, d), '{}') into v_ink_reasons from (
    select reason, sum(delta) d from public.resource_ledger
    where resource = 'ink' and created_at >= v_from and created_at < v_to and (p_player is null or player_id = p_player) group by reason) r;
  select coalesce(jsonb_object_agg(kind, s), '{}') into v_usd from (
    select kind, sum(amount_usd) s from public.rent_ledger
    where created_at >= v_from and created_at < v_to and (p_player is null or player_id = p_player) group by kind) k;
  v := jsonb_build_object(
    'res', v_res,
    'ink_in', coalesce((v_res -> 'ink' ->> 'in')::numeric, 0),
    'ink_out', coalesce((v_res -> 'ink' ->> 'out')::numeric, 0),
    'ink_reasons', v_ink_reasons,
    'usd', v_usd,
    'usd_rent', coalesce((v_usd ->> 'rent')::numeric, 0),
    'plots', (select count(*) from public.plot_ownership where acquired_at >= v_from and acquired_at < v_to and (p_player is null or player_id = p_player)),
    'plots_by', (select coalesce(jsonb_object_agg(method, n), '{}') from (select method, count(*) n from public.plot_ownership
                  where acquired_at >= v_from and acquired_at < v_to and (p_player is null or player_id = p_player) group by method) m),
    'released', (select count(*) from public.plot_ownership where released_at >= v_from and released_at < v_to and (p_player is null or player_id = p_player)),
    'sessions', (select count(*) from public.minigame_sessions where started_at >= v_from and started_at < v_to and (p_player is null or player_id = p_player)),
    'wins', (select count(*) from public.minigame_sessions where started_at >= v_from and started_at < v_to and passed and (p_player is null or player_id = p_player)),
    'cashouts', (select count(*) from public.cashout_requests where created_at >= v_from and created_at < v_to and (p_player is null or player_id = p_player)),
    'cashout_usd', (select coalesce(sum(amount_usd), 0) from public.cashout_requests where created_at >= v_from and created_at < v_to and (p_player is null or player_id = p_player)));
  if p_player is null then
    v := v || jsonb_build_object(
      'signups', (select count(*) from public.players where created_at >= v_from and created_at < v_to),
      'active', (select count(*) from (
          select player_id from public.resource_ledger where created_at >= v_from and created_at < v_to
          union select player_id from public.minigame_sessions where started_at >= v_from and started_at < v_to) a),
      'earners', (select count(distinct player_id) from public.resource_ledger where resource = 'ink' and delta > 0 and created_at >= v_from and created_at < v_to));
  end if;
  return v;
end $$;

-- finished days never change: the portal computes each once
create table if not exists private.portal_days (
  tz text not null,
  day date not null,
  stats jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (tz, day)
);
alter table private.portal_days enable row level security;
revoke all on private.portal_days from public, anon, authenticated;

create or replace function private.portal_series(p_player uuid, p_days int, p_tz text) returns jsonb
language plpgsql as $$
declare v_tz text := case when p_tz is not null and private.valid_tz(p_tz) then p_tz else 'America/Denver' end;
  v_today date := (now() at time zone v_tz)::date; d date; v jsonb; v_out jsonb := '[]'::jsonb;
  n int := least(greatest(coalesce(p_days, 30), 1), case when p_player is null then 365 else 730 end);
begin
  for d in select generate_series(v_today - (n - 1), v_today, interval '1 day')::date loop
    v := null;
    if p_player is null and d < v_today then
      select stats into v from private.portal_days where tz = v_tz and day = d;
    end if;
    if v is null then
      v := private.portal_day(v_tz, d, p_player);
      if p_player is null and d < v_today then
        insert into private.portal_days (tz, day, stats) values (v_tz, d, v)
        on conflict (tz, day) do update set stats = excluded.stats, computed_at = now();
      end if;
    end if;
    v_out := v_out || jsonb_build_array(v || jsonb_build_object('day', d));
  end loop;
  return v_out;
end $$;

create or replace function public.portal_admin_series(p_days int default 30, p_tz text default 'America/Denver') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy', 'support', 'payouts']);
begin
  return jsonb_build_object('tz', p_tz, 'days', private.portal_series(null, p_days, p_tz));
end $$;

/** the player table: search, filter, sort, page */
create or replace function public.portal_admin_players(p_q text default null, p_status text default null, p_role text default null,
  p_sort text default 'last_active_at', p_desc boolean default true, p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy', 'support', 'payouts']);
  v_sort text := case when p_sort in ('username', 'created_at', 'last_active_at', 'plots', 'ink', 'pigments', 'xp', 'usd', 'lifetime_usd', 'strikes', 'streak', 'status') then p_sort else 'last_active_at' end;
  v_q text := nullif(trim(coalesce(p_q, '')), ''); v_rows jsonb; v_total bigint;
begin
  with base as (
    select p.id, pr.username, pr.display_name, u.email, p.status, p.strikes, p.created_at, p.last_active_at, p.suspended_until, p.chat_muted_until,
      pr.avatar_seed, pr.avatar_style, pr.accent_color, pr.avatar_path, pr.is_hidden,
      coalesce(w.plots, 0) plots,
      coalesce(b.ink, 0) ink, coalesce(b.pigments, 0) pigments, coalesce(b.xp, 0) xp, coalesce(b.tokens, 0) tokens,
      coalesce(ra.balance_usd, 0) + coalesce(ra.held_usd, 0) usd, coalesce(ra.lifetime_usd, 0) lifetime_usd, coalesce(ra.paid_usd, 0) paid_usd,
      coalesce(ds.streak, 0) streak,
      (select coalesce(array_agg(role order by role), '{}') from public.admin_roles r where r.player_id = p.id) roles
    from public.players p
    join public.profiles pr on pr.id = p.id
    left join auth.users u on u.id = p.id
    left join (select owner_id, count(*) plots from public.world_plots where owner_id is not null group by owner_id) w on w.owner_id = p.id
    left join (select player_id, max(amount) filter (where resource = 'ink') ink, max(amount) filter (where resource = 'pigments') pigments,
                 max(amount) filter (where resource = 'brush_points') xp, max(amount) filter (where resource = 'gallery_tokens') tokens
               from public.resource_balances group by player_id) b on b.player_id = p.id
    left join public.rent_accounts ra on ra.player_id = p.id
    left join public.daily_streaks ds on ds.player_id = p.id
  ), f as (
    select * from base
    where (v_q is null or username ilike '%' || v_q || '%' or display_name ilike '%' || v_q || '%' or email ilike '%' || v_q || '%' or id::text = v_q)
      and (p_status is null or status = p_status)
      and (p_role is null or (p_role = 'staff' and cardinality(roles) > 0) or p_role = any(roles))
  )
  select (select count(*) from f),
    (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (
      select * from f order by
        case when not p_desc then case v_sort when 'username' then username when 'status' then status end end asc nulls last,
        case when p_desc then case v_sort when 'username' then username when 'status' then status end end desc nulls last,
        case when not p_desc then case v_sort when 'created_at' then extract(epoch from created_at) when 'last_active_at' then extract(epoch from last_active_at)
          when 'plots' then plots when 'ink' then ink when 'pigments' then pigments when 'xp' then xp when 'usd' then usd when 'lifetime_usd' then lifetime_usd
          when 'strikes' then strikes when 'streak' then streak end end asc nulls last,
        case when p_desc then case v_sort when 'created_at' then extract(epoch from created_at) when 'last_active_at' then extract(epoch from last_active_at)
          when 'plots' then plots when 'ink' then ink when 'pigments' then pigments when 'xp' then xp when 'usd' then usd when 'lifetime_usd' then lifetime_usd
          when 'strikes' then strikes when 'streak' then streak end end desc nulls last,
        id
      limit least(greatest(coalesce(p_limit, 50), 1), 500) offset greatest(coalesce(p_offset, 0), 0)) x)
  into v_total, v_rows;
  return jsonb_build_object('total', v_total, 'rows', v_rows,
    'statuses', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from public.players group by status) s));
end $$;

/** every (schema, table, column) that points at a player: a uuid column with a foreign key to players/profiles/users,
 *  or one named player_id / owner_id */
create or replace function private.portal_player_cols(p_public_only boolean) returns table (sch text, tbl text, col text)
language sql stable as $$
  select distinct n.nspname::text, c.relname::text, a.attname::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where c.relkind in ('r', 'p') and n.nspname in ('public', 'private') and (not p_public_only or n.nspname = 'public')
    and a.atttypid = 'uuid'::regtype
    and (exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'f' and array_length(k.conkey, 1) = 1 and k.conkey[1] = a.attnum
                   and k.confrelid in ('public.players'::regclass, 'public.profiles'::regclass, 'auth.users'::regclass))
         or a.attname in ('player_id', 'owner_id'))
    and (not p_public_only or (a.attname not in ('actor_id', 'reviewer_id', 'granted_by', 'updated_by', 'first_owner')
                               and not (c.relname = any(array['admin_roles', 'audit_logs', 'integrity_actions', 'moderation_cases']))))
$$;

/** every table that holds rows about a player, and how many (capped at 10 000 per table) */
create or replace function private.portal_player_tables(p_player uuid, p_public_only boolean) returns jsonb
language plpgsql as $$
declare r record; n bigint; v_out jsonb := '[]'::jsonb;
begin
  for r in select * from private.portal_player_cols(p_public_only) order by 1, 2, 3 loop
    execute format('select count(*) from (select 1 from %I.%I where %I = $1 limit 10000) x', r.sch, r.tbl, r.col) into n using p_player;
    v_out := v_out || jsonb_build_array(jsonb_build_object('schema', r.sch, 'table', r.tbl, 'column', r.col, 'rows', n));
  end loop;
  return v_out;
end $$;

/** everything about one player in one place */
create or replace function public.portal_admin_player(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy', 'support', 'payouts']); u jsonb;
begin
  if not exists (select 1 from public.players where id = p_player) then raise exception 'unknown_player' using errcode = 'P0001'; end if;
  select to_jsonb(x) into u from auth.users x where x.id = p_player;
  return jsonb_build_object(
    'auth', jsonb_build_object('email', u ->> 'email', 'phone', u ->> 'phone', 'created_at', u -> 'created_at', 'last_sign_in_at', u -> 'last_sign_in_at',
      'email_confirmed_at', u -> 'email_confirmed_at', 'confirmed_at', u -> 'confirmed_at', 'updated_at', u -> 'updated_at', 'banned_until', u -> 'banned_until',
      'is_anonymous', u -> 'is_anonymous', 'providers', u -> 'raw_app_meta_data' -> 'providers', 'app_meta', u -> 'raw_app_meta_data', 'user_meta', u -> 'raw_user_meta_data'),
    'player', (select to_jsonb(p) - 'push_token' from public.players p where p.id = p_player),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_player),
    'roles', (select coalesce(jsonb_agg(jsonb_build_object('role', role, 'granted_at', granted_at, 'granted_by', granted_by) order by role), '[]') from public.admin_roles where player_id = p_player),
    'balances', private.balances(p_player),
    'rent', private.rent_json(p_player),
    'streak', (select to_jsonb(s) - 'player_id' from public.daily_streaks s where s.player_id = p_player),
    'activity', (select to_jsonb(a) - 'player_id' from public.player_activity a where a.player_id = p_player),
    'explorer', (select to_jsonb(e) - 'player_id' from public.explorers e where e.player_id = p_player),
    'clan', (select jsonb_build_object('id', c.id, 'name', c.name, 'tag', c.tag, 'role', m.role, 'joined_at', m.joined_at)
             from public.clan_members m join public.clans c on c.id = m.clan_id where m.player_id = p_player),
    'referred_by', (select jsonb_build_object('username', pr.username, 'id', r.referrer_id, 'code', r.code, 'status', r.status, 'at', r.created_at)
                    from public.referrals r join public.profiles pr on pr.id = r.referrer_id where r.referee_id = p_player),
    'invited', (select count(*) from public.referrals where referrer_id = p_player),
    'counts', jsonb_build_object(
      'plots', (select count(*) from public.world_plots where owner_id = p_player),
      'plots_ever', (select count(*) from public.plot_ownership where player_id = p_player),
      'groups', (select count(*) from public.canvas_groups where owner_id = p_player and status = 'active'),
      'enchantments', (select count(*) from public.enchantments where owner_id = p_player),
      'inkborn', (select count(*) from public.inkborn where owner_id = p_player),
      'achievements', (select count(*) from public.player_achievements where player_id = p_player),
      'sessions', (select count(*) from public.minigame_sessions where player_id = p_player),
      'wins', (select count(*) from public.minigame_sessions where player_id = p_player and passed),
      'friends', (select count(*) from public.friendships where (requester_id = p_player or addressee_id = p_player) and status = 'accepted'),
      'publications', (select count(*) from public.artwork_publications where owner_id = p_player),
      'tickets', (select count(*) from public.support_tickets where player_id = p_player),
      'cashouts', (select count(*) from public.cashout_requests where player_id = p_player)),
    'rarities', (select coalesce(jsonb_object_agg(rarity, n), '{}') from (select rarity, count(*) n from public.world_plots where owner_id = p_player group by rarity) r),
    'plot_types', (select coalesce(jsonb_object_agg(plot_type, n), '{}') from (select plot_type, count(*) n from public.world_plots where owner_id = p_player group by plot_type) r),
    'ledger_totals', (select coalesce(jsonb_agg(jsonb_build_object('resource', resource, 'reason', reason, 'in', i, 'out', o, 'n', n) order by resource, i + o desc), '[]') from (
        select resource, reason, coalesce(sum(delta) filter (where delta > 0), 0) i, coalesce(-sum(delta) filter (where delta < 0), 0) o, count(*) n
        from public.resource_ledger where player_id = p_player group by resource, reason) t),
    'rent_totals', (select coalesce(jsonb_object_agg(kind, jsonb_build_object('usd', s, 'n', n)), '{}') from (
        select kind, sum(amount_usd) s, count(*) n from public.rent_ledger where player_id = p_player group by kind) t),
    'cashouts', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]') from public.cashout_requests c where c.player_id = p_player),
    'pacing', (select coalesce(jsonb_agg(to_jsonb(x) - 'player_id' order by x.day desc), '[]') from (select * from private.ink_pacing where player_id = p_player order by day desc limit 14) x),
    'audit', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'details', a.details, 'created_at', a.created_at,
                'actor', (select username from public.profiles where id = a.actor_id)) order by a.id desc), '[]')
              from (select * from public.audit_logs where (target_type = 'player' and target_id = p_player::text) or actor_id = p_player order by id desc limit 100) a));
end $$;

/** the player's rows in every table (counts) — loaded on its own, it touches every table */
create or replace function public.portal_admin_player_tables(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy', 'support', 'payouts']);
begin
  return private.portal_player_tables(p_player, false);
end $$;

/** one player's daily numbers */
create or replace function public.portal_admin_player_series(p_player uuid, p_days int default 30, p_tz text default 'America/Denver') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy', 'support', 'payouts']);
begin
  return private.portal_series(p_player, p_days, p_tz);
end $$;

/** a page of any player's ledger (Ink & co. or USD), newest first */
create or replace function public.portal_admin_ledger(p_player uuid default null, p_kind text default 'resource', p_resource text default null, p_reason text default null,
  p_before bigint default null, p_limit int default 100) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy', 'support', 'payouts']); n int := least(greatest(coalesce(p_limit, 100), 1), 500); v jsonb;
begin
  if p_kind = 'usd' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id desc), '[]') into v from (
      select l.*, pr.username from public.rent_ledger l join public.profiles pr on pr.id = l.player_id
      where (p_player is null or l.player_id = p_player) and (p_reason is null or l.kind = p_reason) and (p_before is null or l.id < p_before)
      order by l.id desc limit n) x;
  else
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id desc), '[]') into v from (
      select l.*, pr.username, (select username from public.profiles where id = l.actor_id) actor from public.resource_ledger l join public.profiles pr on pr.id = l.player_id
      where (p_player is null or l.player_id = p_player) and (p_resource is null or l.resource = p_resource) and (p_reason is null or l.reason = p_reason)
        and (p_before is null or l.id < p_before)
      order by l.id desc limit n) x;
  end if;
  return jsonb_build_object('rows', v, 'next', case when jsonb_array_length(v) = n then (v -> (n - 1) ->> 'id')::bigint end);
end $$;

/** the economy at a glance: flows by reason, money owed, what's in circulation, who's on top */
create or replace function public.portal_admin_economy(p_days int default 30) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy', 'payouts']); v_from timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
begin
  return jsonb_build_object(
    'since', v_from,
    'flows', (select coalesce(jsonb_agg(jsonb_build_object('resource', resource, 'reason', reason, 'in', i, 'out', o, 'n', n, 'players', pl) order by resource, i + o desc), '[]') from (
        select resource, reason, coalesce(sum(delta) filter (where delta > 0), 0) i, coalesce(-sum(delta) filter (where delta < 0), 0) o, count(*) n, count(distinct player_id) pl
        from public.resource_ledger where created_at >= v_from group by resource, reason) t),
    'usd_flows', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'usd', s, 'n', n, 'players', pl) order by kind), '[]') from (
        select kind, sum(amount_usd) s, count(*) n, count(distinct player_id) pl from public.rent_ledger where created_at >= v_from group by kind) t),
    'circulation', (select coalesce(jsonb_object_agg(resource, jsonb_build_object('total', s, 'holders', h, 'max', m)), '{}') from (
        select resource, sum(amount) s, count(*) filter (where amount > 0) h, max(amount) m from public.resource_balances group by resource) t),
    'usd', (select jsonb_build_object('balance', coalesce(sum(balance_usd), 0), 'held', coalesce(sum(held_usd), 0), 'lifetime', coalesce(sum(lifetime_usd), 0),
              'paid', coalesce(sum(paid_usd), 0), 'accounts', count(*), 'boosted_now', count(*) filter (where boost_until > now())) from public.rent_accounts),
    'world_rate_usd_per_second', (select coalesce(sum(private.plot_rate(p, r.usd_per_second)), 0) from public.world_plots p join public.plot_rarities r on r.id = p.rarity where p.owner_id is not null),
    'rarities', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'color', r.color, 'sort', r.sort, 'weight', r.weight, 'ppm', r.ppm,
                   'usd_per_second', r.usd_per_second, 'owned', coalesce(w.n, 0), 'shiny', coalesce(w.shiny, 0), 'owners', coalesce(w.owners, 0)) order by r.sort), '[]')
                 from public.plot_rarities r left join (select rarity, count(*) n, count(*) filter (where shiny) shiny, count(distinct owner_id) owners
                   from public.world_plots where owner_id is not null group by rarity) w on w.rarity = r.id),
    'plot_types', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color_primary, 'owned', coalesce(w.n, 0)) order by t.sort), '[]')
                   from public.plot_types t left join (select plot_type, count(*) n from public.world_plots where owner_id is not null group by plot_type) w on w.plot_type = t.id),
    'kinds', (select coalesce(jsonb_object_agg(kind, n), '{}') from (select kind, sum(plot_count) n from public.canvas_groups where status = 'active' group by kind) k),
    'enchantments', (select coalesce(jsonb_object_agg(kind, n), '{}') from (select kind, count(*) n from public.enchantments group by kind) k),
    'cashouts', (select coalesce(jsonb_object_agg(status, jsonb_build_object('n', n, 'usd', s)), '{}') from (select status, count(*) n, sum(amount_usd) s from public.cashout_requests group by status) c),
    'top_ink', (select coalesce(jsonb_agg(jsonb_build_object('id', b.player_id, 'username', pr.username, 'value', b.amount) order by b.amount desc), '[]') from (
        select player_id, amount from public.resource_balances where resource = 'ink' order by amount desc limit 15) b join public.profiles pr on pr.id = b.player_id),
    'top_earned', (select coalesce(jsonb_agg(jsonb_build_object('id', t.player_id, 'username', pr.username, 'value', t.s) order by t.s desc), '[]') from (
        select player_id, sum(delta) s from public.resource_ledger where resource = 'ink' and delta > 0 and created_at >= v_from group by player_id order by s desc limit 15) t
        join public.profiles pr on pr.id = t.player_id),
    'top_usd', (select coalesce(jsonb_agg(jsonb_build_object('id', a.player_id, 'username', pr.username, 'value', a.v) order by a.v desc), '[]') from (
        select player_id, balance_usd + held_usd v from public.rent_accounts order by balance_usd + held_usd desc limit 15) a join public.profiles pr on pr.id = a.player_id),
    'top_plots', (select coalesce(jsonb_agg(jsonb_build_object('id', w.owner_id, 'username', pr.username, 'value', w.n) order by w.n desc), '[]') from (
        select owner_id, count(*) n from public.world_plots where owner_id is not null group by owner_id order by n desc limit 15) w join public.profiles pr on pr.id = w.owner_id),
    'pacing_today', (select jsonb_build_object('players', count(*), 'earned', coalesce(sum(earned), 0), 'paid', coalesce(sum(paid), 0),
                       'slowed', count(*) filter (where factor < 0.999)) from private.ink_pacing where day = private.day_start(now())));
end $$;

/** every owned plot, compactly, for the admin world map (optionally one player's) */
create or replace function public.portal_admin_map(p_player uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy', 'support', 'payouts']);
begin
  return (with w as (
    select gx, gy, rarity, plot_type, owner_id, shiny, locked, name from public.world_plots
    where owner_id is not null and (p_player is null or owner_id = p_player) limit 300000
  ), o as (select distinct owner_id from w), oi as (select owner_id, (row_number() over (order by owner_id)) - 1 i from o)
  select jsonb_build_object(
    'owners', (select coalesce(jsonb_agg(jsonb_build_array(oi.owner_id, pr.username) order by oi.i), '[]') from oi join public.profiles pr on pr.id = oi.owner_id),
    'plots', (select coalesce(jsonb_agg(jsonb_build_array(w.gx, w.gy, w.rarity, oi.i, case when w.shiny then 1 else 0 end, w.plot_type, case when w.locked then 1 else 0 end, w.name)), '[]')
              from w join oi on oi.owner_id = w.owner_id)));
end $$;

/** the audit log: search, filter, page backwards by id */
create or replace function public.portal_admin_audit(p_q text default null, p_action text default null, p_actor uuid default null, p_target text default null,
  p_before bigint default null, p_limit int default 100) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin('{}'); n int := least(greatest(coalesce(p_limit, 100), 1), 500); v jsonb; v_q text := nullif(trim(coalesce(p_q, '')), '');
begin
  select coalesce(jsonb_agg(x order by (x ->> 'id')::bigint desc), '[]') into v from (
    select to_jsonb(a) || jsonb_build_object('actor', pr.username,
      'target_name', case when a.target_type = 'player' then (select username from public.profiles where id::text = a.target_id) end) x
    from public.audit_logs a left join public.profiles pr on pr.id = a.actor_id
    where (p_before is null or a.id < p_before) and (p_action is null or a.action = p_action or a.action like p_action || '.%')
      and (p_actor is null or a.actor_id = p_actor) and (p_target is null or a.target_id = p_target)
      and (v_q is null or a.action ilike '%' || v_q || '%' or a.target_id ilike '%' || v_q || '%' or a.details::text ilike '%' || v_q || '%')
    order by a.id desc limit n) t;
  return jsonb_build_object('rows', v, 'next', case when jsonb_array_length(v) = n then (v -> (n - 1) ->> 'id')::bigint end,
    'actions', (select coalesce(jsonb_agg(action order by action), '[]') from (select distinct action from (select action from public.audit_logs order by id desc limit 20000) r) d));
end $$;

/** usernames for a list of ids (the explorer shows names next to ids) */
create or replace function public.portal_admin_names(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator', 'economy', 'support', 'payouts']);
begin
  return (select coalesce(jsonb_object_agg(id, username), '{}') from public.profiles where id = any(p_ids[1:1000]));
end $$;

-- ---- 3. owner: data explorer, SQL console, portal settings ------------------------------------------------------

/** every table and view in the public and private schemas, with its columns, key, size and links */
create or replace function public.portal_admin_tables() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.portal_owner();
begin
  return (select coalesce(jsonb_agg(t order by t ->> 'schema' desc, t ->> 'name'), '[]') from (
    select jsonb_build_object(
      'schema', n.nspname, 'name', c.relname, 'kind', c.relkind,
      'rows', greatest(coalesce(s.n_live_tup, c.reltuples::bigint, 0), 0),
      'bytes', pg_total_relation_size(c.oid),
      'comment', obj_description(c.oid, 'pg_class'),
      'rls', c.relrowsecurity,
      'sensitive', private.portal_sensitive(c.oid::regclass),
      'pk', to_jsonb(private.portal_pk(c.oid::regclass)),
      'columns', (select coalesce(jsonb_agg(jsonb_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'nullable', not a.attnotnull,
                    'default', pg_get_expr(d.adbin, d.adrelid), 'generated', a.attgenerated <> '' or a.attidentity <> '',
                    'comment', col_description(c.oid, a.attnum)) order by a.attnum), '[]')
                  from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                  where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
      'fks', (select coalesce(jsonb_object_agg(a.attname, jsonb_build_object('schema', fn.nspname, 'table', fc.relname, 'column', fa.attname)), '{}')
              from pg_constraint k
              join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
              join pg_class fc on fc.oid = k.confrelid join pg_namespace fn on fn.oid = fc.relnamespace
              join pg_attribute fa on fa.attrelid = k.confrelid and fa.attnum = k.confkey[1]
              where k.conrelid = c.oid and k.contype = 'f' and array_length(k.conkey, 1) = 1),
      'player_cols', (select coalesce(jsonb_agg(distinct a.attname), '[]') from pg_attribute a
                      where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.atttypid = 'uuid'::regtype
                        and (a.attname in ('player_id', 'owner_id') or exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'f'
                               and array_length(k.conkey, 1) = 1 and k.conkey[1] = a.attnum and k.confrelid in ('public.players'::regclass, 'public.profiles'::regclass, 'auth.users'::regclass))))
    ) t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p', 'v', 'm')) x);
end $$;

/** a page of rows from any table: filtered, sorted; big values come back as previews */
create or replace function public.portal_admin_rows(p_schema text, p_table text, p_filters jsonb default '[]', p_sort text default null, p_desc boolean default true,
  p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.portal_owner(); v_rel regclass := private.portal_rel(p_schema, p_table);
  v_where text := private.portal_where(v_rel, p_filters); v_pk text[] := private.portal_pk(v_rel); v_order text; v_rows jsonb; v_total bigint; v_est bigint; v_exact boolean := true;
  v_sens boolean := private.portal_sensitive(v_rel); n int := least(greatest(coalesce(p_limit, 50), 1), 500);
begin
  if p_sort is not null then
    if private.portal_coltype(v_rel, p_sort) is null then raise exception 'unknown_column' using errcode = 'P0001', detail = p_sort; end if;
    v_order := format('%I %s nulls last', p_sort, case when p_desc then 'desc' else 'asc' end);
  elsif cardinality(v_pk) > 0 then
    v_order := (select string_agg(format('%I %s', c, case when p_desc then 'desc' else 'asc' end), ', ') from unnest(v_pk) c);
  else
    v_order := '1';
  end if;
  execute format('select coalesce(jsonb_agg(r), ''[]'') from (select (select jsonb_object_agg(e.key, %s) from jsonb_each(to_jsonb(t)) e) r from (select * from %s where %s order by %s limit %s offset %s) t) q',
    case when v_sens then format('case when e.key = any(%L::text[]) then e.value else ''"•••"''::jsonb end', v_pk) else 'private.portal_clip(e.value)' end,
    v_rel, v_where, v_order, n, greatest(coalesce(p_offset, 0), 0)) into v_rows;
  select greatest(coalesce(s.n_live_tup, c.reltuples::bigint, 0), 0) into v_est from pg_class c left join pg_stat_user_tables s on s.relid = c.oid where c.oid = v_rel;
  if v_where = 'true' and v_est > 200000 then
    v_total := v_est; v_exact := false;
  else
    execute format('select count(*) from %s where %s', v_rel, v_where) into v_total;
  end if;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'exact', v_exact, 'pk', to_jsonb(v_pk), 'sensitive', v_sens);
end $$;

/** one whole row (nothing clipped) */
create or replace function public.portal_admin_row(p_schema text, p_table text, p_pk jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.portal_owner(); v_rel regclass := private.portal_rel(p_schema, p_table); v jsonb;
begin
  execute format('select to_jsonb(t) from %s t where %s', v_rel, private.portal_pk_where(v_rel, p_pk)) into v;
  if v is null then raise exception 'row_not_found' using errcode = 'P0001'; end if;
  if private.portal_sensitive(v_rel) then
    v := (select jsonb_object_agg(e.key, case when e.key = any(private.portal_pk(v_rel)) then e.value else '"•••"'::jsonb end) from jsonb_each(v) e);
  end if;
  return v;
end $$;

/** tables the explorer never writes to: the audit trail itself and the server's secrets */
create or replace function private.portal_writable(p_rel regclass) returns void
language plpgsql stable as $$
begin
  if p_rel = 'public.audit_logs'::regclass or private.portal_sensitive(p_rel)
     or (select relkind from pg_class where oid = p_rel) not in ('r', 'p') then
    raise exception 'read_only_table' using errcode = 'P0001';
  end if;
end $$;

/** change one row; the row before and after goes into the audit log */
create or replace function public.portal_admin_row_update(p_schema text, p_table text, p_pk jsonb, p_patch jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.portal_owner(); v_rel regclass := private.portal_rel(p_schema, p_table); v_w text; v_set text := ''; k text; v_before jsonb; v_after jsonb; n int;
begin
  perform private.portal_writable(v_rel);
  if p_reason is null or char_length(trim(p_reason)) < 4 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then raise exception 'nothing_to_change' using errcode = 'P0001'; end if;
  v_w := private.portal_pk_where(v_rel, p_pk);
  for k in select jsonb_object_keys(p_patch) loop
    if exists (select 1 from pg_attribute a where a.attrelid = v_rel and a.attname = k and (a.attgenerated <> '' or a.attidentity = 'a')) then
      raise exception 'column_not_editable' using errcode = 'P0001', detail = k;
    end if;
    v_set := v_set || case when v_set = '' then '' else ', ' end || format('%I = %s', k, private.portal_value(v_rel, k, p_patch -> k));
  end loop;
  execute format('select to_jsonb(t) from %s t where %s for update', v_rel, v_w) into v_before;
  if v_before is null then raise exception 'row_not_found' using errcode = 'P0001'; end if;
  execute format('update %s t set %s where %s returning to_jsonb(t)', v_rel, v_set, v_w) into v_after;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'row_not_found' using errcode = 'P0001'; end if;
  perform private.audit('portal.row_update', p_schema || '.' || p_table, p_pk::text, jsonb_build_object('reason', p_reason, 'patch', p_patch,
    'before', (select coalesce(jsonb_object_agg(e.key, e.value), '{}') from jsonb_each(v_before) e where p_patch ? e.key),
    'after', (select coalesce(jsonb_object_agg(e.key, e.value), '{}') from jsonb_each(v_after) e where p_patch ? e.key)));
  return v_after;
end $$;

/** add a row */
create or replace function public.portal_admin_row_insert(p_schema text, p_table text, p_row jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.portal_owner(); v_rel regclass := private.portal_rel(p_schema, p_table); v_cols text := ''; v_vals text := ''; k text; v_after jsonb;
begin
  perform private.portal_writable(v_rel);
  if p_reason is null or char_length(trim(p_reason)) < 4 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if p_row is null or jsonb_typeof(p_row) <> 'object' then raise exception 'nothing_to_change' using errcode = 'P0001'; end if;
  for k in select jsonb_object_keys(p_row) loop
    v_cols := v_cols || case when v_cols = '' then '' else ', ' end || format('%I', k);
    v_vals := v_vals || case when v_vals = '' then '' else ', ' end || private.portal_value(v_rel, k, p_row -> k);
  end loop;
  if v_cols = '' then
    execute format('insert into %s as t default values returning to_jsonb(t)', v_rel) into v_after;
  else
    execute format('insert into %s as t (%s) values (%s) returning to_jsonb(t)', v_rel, v_cols, v_vals) into v_after;
  end if;
  perform private.audit('portal.row_insert', p_schema || '.' || p_table, null, jsonb_build_object('reason', p_reason, 'row', v_after));
  return v_after;
end $$;

/** delete one row (anything that hangs off it by a cascading key goes too); the whole row is kept in the audit log */
create or replace function public.portal_admin_row_delete(p_schema text, p_table text, p_pk jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.portal_owner(); v_rel regclass := private.portal_rel(p_schema, p_table); v_w text; v_before jsonb;
begin
  perform private.portal_writable(v_rel);
  if p_reason is null or char_length(trim(p_reason)) < 4 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  v_w := private.portal_pk_where(v_rel, p_pk);
  execute format('delete from %s t where %s returning to_jsonb(t)', v_rel, v_w) into v_before;
  if v_before is null then raise exception 'row_not_found' using errcode = 'P0001'; end if;
  perform private.audit('portal.row_delete', p_schema || '.' || p_table, p_pk::text, jsonb_build_object('reason', p_reason, 'row', v_before));
  return jsonb_build_object('deleted', true, 'row', v_before);
end $$;

/** a read-only SQL query (the transaction is switched to read-only before it runs; first 1 000 rows) */
create or replace function public.portal_admin_sql(p_query text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.portal_owner(); v_q text := trim(coalesce(p_query, '')); v_json json; v_t0 timestamptz; v_cols jsonb; v_rows jsonb; n int;
begin
  v_q := regexp_replace(v_q, ';\s*$', '');
  if v_q = '' then raise exception 'empty_query' using errcode = 'P0001'; end if;
  if v_q !~* '^\s*(\(|select\M|with\M|values\M|table\M)' then
    return jsonb_build_object('error', 'Only queries that read data run here (SELECT, WITH, VALUES or TABLE). Change data with the data explorer or the admin tools, so every change is recorded.', 'state', 'read-only', 'ms', 0);
  end if;
  perform private.audit('portal.sql', 'sql', null, jsonb_build_object('query', left(v_q, 4000)));
  perform set_config('transaction_read_only', 'on', true);
  v_t0 := clock_timestamp();
  begin
    execute format('select json_agg(q) from (select * from (%s) q0 limit 1001) q', v_q) into v_json;
  exception when others then
    return jsonb_build_object('error', sqlerrm, 'state', sqlstate, 'ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end;
  n := coalesce(json_array_length(v_json), 0);
  if n > 0 then
    select coalesce(jsonb_agg(k), '[]') into v_cols from json_object_keys(v_json -> 0) k;
    select coalesce(jsonb_agg((select coalesce(jsonb_agg(private.portal_clip(e.value::jsonb, 4000)), '[]') from json_each(r) e) order by i), '[]') into v_rows
    from json_array_elements(v_json) with ordinality x(r, i) where i <= 1000;
  end if;
  return jsonb_build_object('columns', coalesce(v_cols, '[]'), 'rows', coalesce(v_rows, '[]'), 'count', least(n, 1000), 'truncated', n > 1000,
    'ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
end $$;

/** the portal's own settings (two-step sign-in for staff) */
create or replace function public.portal_admin_set_mfa(p_on boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.portal_owner();
begin
  -- turning it on needs a verified sign-in right now, so nobody locks themselves out
  if p_on and private.portal_aal() <> 'aal2' then raise exception 'mfa_required' using errcode = 'P0001'; end if;
  update public.game_config set value = coalesce(value, '{}'::jsonb) || jsonb_build_object('require_mfa', p_on), updated_at = now(), updated_by = v_uid where key = 'portal';
  perform private.audit('portal.require_mfa', 'config', 'portal', jsonb_build_object('on', p_on));
  return public.portal_whoami();
end $$;

-- ---- 4. players: their own data ---------------------------------------------------------------------------------

create or replace function private.portal_me() returns uuid
language plpgsql as $$
declare v uuid := private.uid();
begin
  if not exists (select 1 from public.players where id = v) then raise exception 'onboarding_required' using errcode = 'P0001'; end if;
  return v;
end $$;

/** columns players never get back from the portal (anti-cheat internals, other people's bookkeeping) */
create or replace function private.portal_hidden_cols() returns text[]
language sql immutable as $$
  select array['flags', 'quality', 'review_status', 'risk_flags', 'reviewer_id', 'idempotency_key', 'actor_id', 'push_token', 'seed', 'granted_by', 'updated_by']
$$;

/** tables players never browse (staff, moderation and anti-cheat records) */
create or replace function private.portal_hidden_tables() returns text[]
language sql immutable as $$
  select array['admin_roles', 'audit_logs', 'integrity_actions', 'moderation_cases']
$$;

/** my summary: profile, balances, live USD, counts, lifetime totals, ranks */
create or replace function public.portal_me_summary() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.portal_me(); v_plots bigint; v_life numeric;
begin
  select count(*) into v_plots from public.world_plots where owner_id = v_uid;
  select coalesce(lifetime_usd, 0) into v_life from public.rent_accounts where player_id = v_uid;
  return jsonb_build_object(
    'user_id', v_uid,
    'email', (select email from auth.users where id = v_uid),
    'player', (select to_jsonb(p) - 'push_token' - 'id' from public.players p where p.id = v_uid),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'roles', (select coalesce(jsonb_agg(role order by role), '[]') from public.admin_roles where player_id = v_uid),
    'balances', private.balances(v_uid),
    'rent', private.rent_json(v_uid),
    'rent_mult', private.rent_mult(v_uid),
    'streak', (select to_jsonb(s) - 'player_id' from public.daily_streaks s where s.player_id = v_uid),
    'clan', (select jsonb_build_object('id', c.id, 'name', c.name, 'tag', c.tag, 'emblem', c.emblem, 'color', c.color, 'role', m.role, 'joined_at', m.joined_at,
               'members', (select count(*) from public.clan_members where clan_id = c.id))
             from public.clan_members m join public.clans c on c.id = m.clan_id where m.player_id = v_uid),
    'counts', jsonb_build_object(
      'plots', v_plots,
      'plots_ever', (select count(*) from public.plot_ownership where player_id = v_uid),
      'shiny', (select count(*) from public.world_plots where owner_id = v_uid and shiny),
      'named', (select count(*) from public.world_plots where owner_id = v_uid and name is not null),
      'groups', (select count(*) from public.canvas_groups where owner_id = v_uid and status = 'active'),
      'enchantments', (select count(*) from public.enchantments where owner_id = v_uid),
      'inkborn', (select count(*) from public.inkborn where owner_id = v_uid),
      'achievements', (select count(*) from public.player_achievements where player_id = v_uid),
      'achievements_total', (select count(*) from public.achievements where is_active),
      'sessions', (select count(*) from public.minigame_sessions where player_id = v_uid),
      'wins', (select count(*) from public.minigame_sessions where player_id = v_uid and passed),
      'friends', (select count(*) from public.friendships where (requester_id = v_uid or addressee_id = v_uid) and status = 'accepted'),
      'invited', (select count(*) from public.referrals where referrer_id = v_uid),
      'publications', (select count(*) from public.artwork_publications where owner_id = v_uid and status = 'published'),
      'cities', (select count(distinct city_id) from public.world_plots where owner_id = v_uid and city_id is not null),
      'countries', (select count(distinct c.country) from public.world_plots w join public.world_cities c on c.id = w.city_id where w.owner_id = v_uid)),
    'rarities', (select coalesce(jsonb_object_agg(rarity, n), '{}') from (select rarity, count(*) n from public.world_plots where owner_id = v_uid group by rarity) r),
    'plot_types', (select coalesce(jsonb_object_agg(plot_type, n), '{}') from (select plot_type, count(*) n from public.world_plots where owner_id = v_uid group by plot_type) r),
    'kinds', (select coalesce(jsonb_object_agg(kind, n), '{}') from (select kind, sum(plot_count) n from public.canvas_groups where owner_id = v_uid and status = 'active' group by kind) r),
    'lifetime', (select coalesce(jsonb_object_agg(resource, jsonb_build_object('in', i, 'out', o, 'n', n)), '{}') from (
        select resource, coalesce(sum(delta) filter (where delta > 0), 0) i, coalesce(-sum(delta) filter (where delta < 0), 0) o, count(*) n
        from public.resource_ledger where player_id = v_uid group by resource) t),
    'first_plot_at', (select min(acquired_at) from public.plot_ownership where player_id = v_uid),
    'rank', jsonb_build_object(
      'players', (select count(*) from public.players where status = 'active'),
      'plots', (select count(*) + 1 from (select owner_id from public.world_plots where owner_id is not null group by owner_id having count(*) > v_plots) x),
      'usd', (select count(*) + 1 from public.rent_accounts where lifetime_usd > v_life)),
    'server_time', now());
end $$;

create or replace function public.portal_me_series(p_days int default 30, p_tz text default 'UTC') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.portal_me();
begin
  return private.portal_series(v_uid, p_days, p_tz);
end $$;

/** my Ink / pigments / XP / tokens ledger: filter by resource, reason and time; page back by id */
create or replace function public.portal_me_ledger(p_resource text default null, p_reason text default null, p_from timestamptz default null, p_to timestamptz default null,
  p_before bigint default null, p_limit int default 100) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.portal_me(); n int := least(greatest(coalesce(p_limit, 100), 1), 500); v jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'resource', resource, 'delta', delta, 'balance_after', balance_after, 'reason', reason,
           'ref_type', ref_type, 'ref_id', ref_id, 'staff', actor_id is not null and actor_id <> v_uid, 'created_at', created_at) order by id desc), '[]') into v
  from (select * from public.resource_ledger where player_id = v_uid and (p_resource is null or resource = p_resource) and (p_reason is null or reason = p_reason)
          and (p_from is null or created_at >= p_from) and (p_to is null or created_at < p_to) and (p_before is null or id < p_before)
        order by id desc limit n) x;
  return jsonb_build_object('rows', v, 'next', case when jsonb_array_length(v) = n then (v -> (n - 1) ->> 'id')::bigint end,
    'reasons', (select coalesce(jsonb_agg(jsonb_build_object('resource', resource, 'reason', reason, 'in', i, 'out', o, 'n', c) order by resource, i + o desc), '[]') from (
        select resource, reason, coalesce(sum(delta) filter (where delta > 0), 0) i, coalesce(-sum(delta) filter (where delta < 0), 0) o, count(*) c
        from public.resource_ledger where player_id = v_uid and (p_from is null or created_at >= p_from) and (p_to is null or created_at < p_to) group by resource, reason) t));
end $$;

/** my USD ledger (rent, cash-out holds and payouts, adjustments, conversions) */
create or replace function public.portal_me_rent(p_kind text default null, p_before bigint default null, p_limit int default 100) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.portal_me(); n int := least(greatest(coalesce(p_limit, 100), 1), 500); v jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'amount_usd', amount_usd, 'balance_after', balance_after, 'seconds', seconds,
           'boosted_seconds', boosted_seconds, 'rate_usd_per_second', rate_usd_per_second, 'staff', actor_id is not null and actor_id <> v_uid, 'created_at', created_at) order by id desc), '[]') into v
  from (select * from public.rent_ledger where player_id = v_uid and (p_kind is null or kind = p_kind) and (p_before is null or id < p_before) order by player_id, id desc limit n) x;
  return jsonb_build_object('rows', v, 'next', case when jsonb_array_length(v) = n then (v -> (n - 1) ->> 'id')::bigint end,
    'totals', (select coalesce(jsonb_object_agg(kind, jsonb_build_object('usd', s, 'n', c)), '{}') from (select kind, sum(amount_usd) s, count(*) c from public.rent_ledger where player_id = v_uid group by kind) t));
end $$;

/** every plot I own, with its live USD rate, place, group, enchantment, progress and how I got it */
create or replace function public.portal_me_plots() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.portal_me(); v_mult numeric := private.rent_mult(v_uid);
begin
  return jsonb_build_object('mult', v_mult, 'plots', (select coalesce(jsonb_agg(jsonb_build_object(
      'gx', p.gx, 'gy', p.gy, 'rarity', p.rarity, 'plot_type', p.plot_type, 'level', p.level, 'name', p.name, 'shiny', p.shiny, 'locked', p.locked,
      'claimed_at', p.claimed_at, 'painted', p.art_publication_id is not null, 'art_publication_id', p.art_publication_id,
      'rate', private.plot_rate(p, r.usd_per_second) * v_mult, 'base_rate', r.usd_per_second,
      'city', c.name, 'state', c.state, 'country', c.country, 'country_name', c.country_name,
      'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'kind', g.kind, 'plots', g.plot_count) from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id
                where m.gx = p.gx and m.gy = p.gy and g.status = 'active'),
      'enchantment', (select jsonb_build_object('id', e.id, 'kind', e.kind, 'nickname', e.nickname, 'level', e.level, 'serial', e.serial, 'status', e.status)
                      from public.enchantments e where e.gx = p.gx and e.gy = p.gy and e.owner_id = v_uid),
      'progress', (select jsonb_build_object('game', g.game, 'level', g.highest_level, 'best', g.best_score, 'plays', g.plays, 'wins', g.wins, 'at', g.updated_at)
                   from public.plot_game_progress g where g.gx = p.gx and g.gy = p.gy and g.player_id = v_uid),
      'acquired', (select jsonb_build_object('method', o.method, 'cost', o.cost, 'at', o.acquired_at) from public.plot_ownership o
                   where o.gx = p.gx and o.gy = p.gy and o.player_id = v_uid and o.released_at is null order by o.acquired_at desc limit 1)
    ) order by p.claimed_at desc nulls last), '[]')
    from public.world_plots p join public.plot_rarities r on r.id = p.rarity left join public.world_cities c on c.id = p.city_id
    where p.owner_id = v_uid));
end $$;

/** one of my plots in full: its history with me, every game I played on it, its art over time */
create or replace function public.portal_me_plot(p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.portal_me(); p public.world_plots;
begin
  select * into p from public.world_plots where gx = p_gx and gy = p_gy;
  if p.gx is null or (p.owner_id is distinct from v_uid and not exists (select 1 from public.plot_ownership where gx = p_gx and gy = p_gy and player_id = v_uid)) then
    raise exception 'not_your_plot' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'plot', to_jsonb(p) - 'owner_id' || jsonb_build_object('mine', p.owner_id = v_uid),
    'rarity', (select to_jsonb(r) from public.plot_rarities r where r.id = p.rarity),
    'type', (select to_jsonb(t) from public.plot_types t where t.id = p.plot_type),
    'rate', case when p.owner_id = v_uid then (select private.plot_rate(p, r.usd_per_second) * private.rent_mult(v_uid) from public.plot_rarities r where r.id = p.rarity) end,
    'city', (select to_jsonb(c) from public.world_cities c where c.id = p.city_id),
    'region', (select to_jsonb(c) from public.world_cities c where c.id = p.region_city_id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('method', o.method, 'cost', o.cost, 'acquired_at', o.acquired_at, 'released_at', o.released_at, 'release_reason', o.release_reason)
                  order by o.acquired_at desc), '[]') from public.plot_ownership o where o.gx = p_gx and o.gy = p_gy and o.player_id = v_uid),
    'owners_before', (select count(distinct player_id) from public.plot_ownership o where o.gx = p_gx and o.gy = p_gy and o.player_id <> v_uid),
    'progress', (select to_jsonb(g) - 'player_id' from public.plot_game_progress g where g.gx = p_gx and g.gy = p_gy and g.player_id = v_uid),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'game', s.game, 'level', s.level, 'status', s.status, 'passed', s.passed, 'score', s.score,
                   'stars', s.stars, 'rounds', s.rounds, 'play_ms', s.play_ms, 'started_at', s.started_at, 'finished_at', s.finished_at) order by s.started_at desc), '[]')
                 from (select * from public.minigame_sessions where player_id = v_uid and gx = p_gx and gy = p_gy order by started_at desc limit 200) s),
    'art', (select coalesce(jsonb_agg(jsonb_build_object('publication_id', h.publication_id, 'rev', h.rev, 'set_at', h.set_at, 'title', ap.title,
              'preview_path', ap.preview_path, 'mine', ap.owner_id = v_uid) order by h.id desc), '[]')
            from (select * from public.plot_art_history where gx = p_gx and gy = p_gy order by id desc limit 50) h left join public.artwork_publications ap on ap.id = h.publication_id),
    'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'kind', g.kind, 'plots', g.plot_count, 'created_at', g.created_at)
              from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id where m.gx = p_gx and m.gy = p_gy and g.status = 'active' and g.owner_id = v_uid),
    'enchantment', (select to_jsonb(e) - 'owner_id' - 'first_owner' from public.enchantments e where e.gx = p_gx and e.gy = p_gy and e.owner_id = v_uid));
end $$;

/** every table with my rows in it, and how many */
create or replace function public.portal_me_tables() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.portal_me();
begin
  return (select coalesce(jsonb_agg(t), '[]') from jsonb_array_elements(private.portal_player_tables(v_uid, true)) t where (t ->> 'rows')::bigint > 0);
end $$;

/** a page of my rows from one table (internal columns left out) */
create or replace function public.portal_me_rows(p_table text, p_column text, p_limit int default 100, p_offset int default 0, p_full boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.portal_me(); v_rel regclass; v_pk text[]; v_order text; v_rows jsonb; v_total bigint; n int := least(greatest(coalesce(p_limit, 100), 1), 1000);
begin
  if p_table = any(private.portal_hidden_tables()) or p_column = any(private.portal_hidden_cols()) or p_column in ('first_owner') then raise exception 'unknown_table' using errcode = 'P0001'; end if;
  v_rel := private.portal_rel('public', p_table);
  if not exists (select 1 from private.portal_player_cols(true) c where c.tbl = p_table and c.col = p_column) then
    raise exception 'unknown_table' using errcode = 'P0001';
  end if;
  v_pk := private.portal_pk(v_rel);
  v_order := case when cardinality(v_pk) > 0 then (select string_agg(format('%I desc', c), ', ') from unnest(v_pk) c) else '1' end;
  if private.portal_coltype(v_rel, 'created_at') is not null then v_order := 'created_at desc, ' || v_order; end if;
  execute format('select coalesce(jsonb_agg(r), ''[]'') from (select (select jsonb_object_agg(e.key, case when $2 then e.value else private.portal_clip(e.value, 2000) end) from jsonb_each(to_jsonb(t)) e
      where not (e.key = any(private.portal_hidden_cols()))) r from (select * from %s where %I = $1 order by %s limit %s offset %s) t) q',
    v_rel, p_column, v_order, n, greatest(coalesce(p_offset, 0), 0)) into v_rows using v_uid, coalesce(p_full, false);
  execute format('select count(*) from %s where %I = $1', v_rel, p_column) into v_total using v_uid;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

-- ---- privileges -------------------------------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'portal\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and (p.proname like 'portal\_%' or p.proname = 'require_admin')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
