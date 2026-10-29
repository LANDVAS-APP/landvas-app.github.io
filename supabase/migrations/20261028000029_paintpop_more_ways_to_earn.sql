-- v0.15: Paint Pop replaces PatternShift, and more ways to earn Ink:
-- a daily wheel, room check-ins, Inspire (appreciating art pays its artist), weekly themed
-- challenges, a craft bonus for rich artwork, and Ink for staff Featured picks.

-- ===== 1. Paint Pop replaces PatternShift on Mosaic plots ==========================
do $$
declare c record;
begin
  for c in select conname, conrelid::regclass as tbl from pg_constraint
           where contype = 'c' and conrelid in ('public.plot_types'::regclass, 'public.minigame_sessions'::regclass)
             and pg_get_constraintdef(oid) like '%patternshift%' loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;
update public.minigame_sessions set status = 'expired', finished_at = now() where game = 'patternshift' and status = 'active';
update public.plot_types set minigame = 'paintpop', minigame_name = 'Paint Pop', tagline = 'Pop the paint. Fill the picture.' where id = 'mosaic';
alter table public.plot_types add constraint plot_types_minigame_check
  check (minigame in ('tracecraft', 'colorburst', 'paintpop', 'lightlines', 'memorymural', 'sculptor', 'rollermural', 'mirrorline'));
alter table public.minigame_sessions add constraint minigame_sessions_game_check
  check (game in ('tracecraft', 'colorburst', 'patternshift', 'paintpop', 'lightlines', 'memorymural', 'sculptor', 'hueflow', 'rollermural', 'mirrorline'));
-- a new game: every Mosaic plot starts it at level 1
update public.plot_game_progress set game = 'paintpop', highest_level = 0, best_score = 0, updated_at = now() where game = 'patternshift';
update public.game_config
   set value = jsonb_set(value, '{games}', ((value -> 'games') - 'patternshift')
         || jsonb_build_object('paintpop', (coalesce(value -> 'games' -> 'patternshift', '{"enabled": true}'::jsonb) - 'boost')
                                            || '{"rounds": 3, "round_ink": [0, 0, 0]}'::jsonb), true)
 where key = 'minigames' and value -> 'games' ? 'patternshift';
update public.achievements set metric = 'paintpop', description = 'Clear Paint Pop level 10.' where metric = 'patternshift';

-- ===== 2. New sources of Ink ======================================================
create or replace function private.grant(p_player uuid, p_reward jsonb, p_reason text, p_ref_type text, p_ref_id text, p_idem text)
returns void language plpgsql as $$
declare r record;
begin
  for r in select key, value::bigint as amount from jsonb_each_text(coalesce(p_reward, '{}'::jsonb)) loop
    if r.key in ('ink', 'pigments', 'brush_points', 'gallery_tokens') and r.amount > 0 then
      if r.key = 'ink' and p_reason not in ('minigame', 'referral', 'referral_welcome', 'usd_conversion', 'duel_win', 'duel_refund', 'pvp',
                                            'wheel', 'room_visit', 'room_host', 'inspire', 'inspire_given', 'challenge', 'craft', 'featured') then
        raise exception 'ink_minigame_only' using errcode = 'P0001', detail = p_reason;
      end if;
      perform private.ledger_apply(p_player, r.key, r.amount, p_reason, p_ref_type, p_ref_id, p_idem);
    end if;
  end loop;
end $$;

insert into public.game_config (key, value, description) values ('earn', '{
  "wheel": {"enabled": true, "spins_per_day": 1, "slices": [
    {"label": "5 Ink", "kind": "ink", "amount": 5, "weight": 30, "color": "#34C3FF"},
    {"label": "10 Ink", "kind": "ink", "amount": 10, "weight": 20, "color": "#7B5CFF"},
    {"label": "10 Pigments", "kind": "pigments", "amount": 10, "weight": 15, "color": "#FF4FD8"},
    {"label": "Rent boost 30 min", "kind": "boost", "amount": 30, "weight": 12, "color": "#FFB23F"},
    {"label": "25 Ink", "kind": "ink", "amount": 25, "weight": 8, "color": "#3DDC97"},
    {"label": "Joystick refill", "kind": "joystick", "amount": 1, "weight": 8, "color": "#22E3FF"},
    {"label": "50 XP", "kind": "brush_points", "amount": 50, "weight": 6, "color": "#FFE14D"},
    {"label": "Jackpot 100 Ink", "kind": "ink", "amount": 100, "weight": 1, "color": "#FF4D6D"}]},
  "rooms": {"enabled": true, "visitor_ink": 2, "visitor_daily": 5, "host_ink": 2, "host_daily": 10, "min_account_hours": 24, "stay_seconds": 10},
  "inspire": {"enabled": true, "artist_ink": 2, "artist_daily_cap": 40, "giver_ink": 1, "giver_daily": 5, "min_account_hours": 24},
  "craft": {"enabled": true, "tiers": [{"min": 40, "ink": 5}, {"min": 60, "ink": 12}, {"min": 80, "ink": 25}], "plot_bonus_pct": 20, "max_bonus_plots": 8, "daily_cap": 100},
  "featured": {"ink": 25},
  "challenges": {"enabled": true, "votes_per_player": 3, "min_account_hours": 24}
}', 'More ways to earn Ink: the daily wheel, room check-ins, Inspire, the craft bonus, Featured picks and weekly challenges. Each has caps and needs accounts at least min_account_hours old, so extra accounts can''t farm it.')
on conflict (key) do nothing;

create or replace function private.check_earn_config_trg() returns trigger
language plpgsql as $$
declare v jsonb := new.value; s jsonb; t jsonb; w numeric := 0;
begin
  if new.key <> 'earn' then return new; end if;
  if jsonb_typeof(v -> 'wheel' -> 'slices') is distinct from 'array' or jsonb_array_length(v -> 'wheel' -> 'slices') not between 2 and 16
     or coalesce((v -> 'wheel' ->> 'spins_per_day')::int, -1) not between 0 and 50 then
    raise exception 'invalid_earn_config' using errcode = 'P0001', detail = 'wheel';
  end if;
  for s in select e from jsonb_array_elements(v -> 'wheel' -> 'slices') e loop
    if coalesce(s ->> 'kind', '') not in ('ink', 'pigments', 'brush_points', 'gallery_tokens', 'boost', 'joystick')
       or coalesce((s ->> 'amount')::numeric, -1) not between 0 and 100000 or coalesce((s ->> 'weight')::numeric, -1) not between 0 and 100000
       or char_length(coalesce(s ->> 'label', '')) not between 1 and 40 then
      raise exception 'invalid_earn_config' using errcode = 'P0001', detail = 'wheel slice';
    end if;
    w := w + (s ->> 'weight')::numeric;
  end loop;
  if w <= 0 then raise exception 'invalid_earn_config' using errcode = 'P0001', detail = 'wheel weights'; end if;
  if coalesce((v -> 'rooms' ->> 'visitor_ink')::numeric, -1) not between 0 and 10000 or coalesce((v -> 'rooms' ->> 'host_ink')::numeric, -1) not between 0 and 10000
     or coalesce((v -> 'rooms' ->> 'visitor_daily')::int, -1) not between 0 and 1000 or coalesce((v -> 'rooms' ->> 'host_daily')::int, -1) not between 0 and 1000
     or coalesce((v -> 'rooms' ->> 'stay_seconds')::int, -1) not between 0 and 600 or coalesce((v -> 'rooms' ->> 'min_account_hours')::numeric, -1) not between 0 and 8760
     or coalesce((v -> 'inspire' ->> 'artist_ink')::numeric, -1) not between 0 and 10000 or coalesce((v -> 'inspire' ->> 'artist_daily_cap')::numeric, -1) not between 0 and 1000000
     or coalesce((v -> 'inspire' ->> 'giver_ink')::numeric, -1) not between 0 and 10000 or coalesce((v -> 'inspire' ->> 'giver_daily')::int, -1) not between 0 and 1000
     or coalesce((v -> 'inspire' ->> 'min_account_hours')::numeric, -1) not between 0 and 8760
     or jsonb_typeof(v -> 'craft' -> 'tiers') is distinct from 'array' or jsonb_array_length(v -> 'craft' -> 'tiers') > 10
     or coalesce((v -> 'craft' ->> 'plot_bonus_pct')::numeric, -1) not between 0 and 1000 or coalesce((v -> 'craft' ->> 'max_bonus_plots')::int, -1) not between 0 and 1024
     or coalesce((v -> 'craft' ->> 'daily_cap')::numeric, -1) not between 0 and 1000000
     or coalesce((v -> 'featured' ->> 'ink')::numeric, -1) not between 0 and 1000000
     or coalesce((v -> 'challenges' ->> 'votes_per_player')::int, 0) not between 1 and 50 or coalesce((v -> 'challenges' ->> 'min_account_hours')::numeric, -1) not between 0 and 8760 then
    raise exception 'invalid_earn_config' using errcode = 'P0001';
  end if;
  for t in select e from jsonb_array_elements(v -> 'craft' -> 'tiers') e loop
    if coalesce((t ->> 'min')::numeric, -1) not between 0 and 100 or coalesce((t ->> 'ink')::numeric, -1) not between 0 and 100000 then
      raise exception 'invalid_earn_config' using errcode = 'P0001', detail = 'craft tier';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists game_config_earn_check on public.game_config;
create trigger game_config_earn_check before insert or update on public.game_config for each row execute function private.check_earn_config_trg();

create or replace function private.earn(p_part text) returns jsonb
language sql stable as $$ select coalesce(private.cfg('earn') -> p_part, '{}'::jsonb) $$;

-- is this account old enough for a reward that extra accounts could farm?
create or replace function private.old_enough(p_player uuid, p_hours numeric) returns boolean
language sql stable as $$
  select coalesce((select created_at <= now() - make_interval(secs => coalesce(p_hours, 24) * 3600) from public.players where id = p_player), false)
$$;

alter table public.feed_events drop constraint if exists feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check
  check (kind in ('join', 'claim', 'publish', 'achievement', 'referral', 'level', 'minigame', 'pvp', 'challenge', 'featured'));

-- ===== 3. The daily wheel ==========================================================
create table if not exists public.wheel_spins (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  slice int not null,
  prize jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists wheel_spins_player on public.wheel_spins (player_id, created_at desc);
alter table public.wheel_spins enable row level security;
revoke all on public.wheel_spins from anon, authenticated;

create or replace function private.wheel_left(p_player uuid) returns int
language sql stable as $$
  select greatest(coalesce((private.earn('wheel') ->> 'spins_per_day')::int, 1)
                  - (select count(*)::int from public.wheel_spins where player_id = p_player and created_at >= private.day_start(now())), 0)
$$;

create or replace function public.wheel_status() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); w jsonb := private.earn('wheel'); v_total numeric;
begin
  select sum(greatest(coalesce((s ->> 'weight')::numeric, 0), 0)) into v_total from jsonb_array_elements(coalesce(w -> 'slices', '[]'::jsonb)) s;
  return jsonb_build_object(
    'enabled', coalesce((w ->> 'enabled')::boolean, false),
    -- the odds are shown to players
    'slices', (select coalesce(jsonb_agg(jsonb_build_object('label', s ->> 'label', 'kind', s ->> 'kind', 'amount', (s ->> 'amount')::numeric, 'color', s ->> 'color',
                                                            'chance', round(100 * greatest(coalesce((s ->> 'weight')::numeric, 0), 0) / nullif(v_total, 0), 2)) order by n), '[]'::jsonb)
               from jsonb_array_elements(coalesce(w -> 'slices', '[]'::jsonb)) with ordinality t(s, n)),
    'spins_left', case when v_uid is null then 0 else private.wheel_left(v_uid) end,
    'last', (select jsonb_build_object('slice', slice, 'prize', prize, 'at', created_at) from public.wheel_spins where player_id = v_uid order by id desc limit 1),
    'resets_at', private.day_start(now()) + interval '1 day');
end $$;

create or replace function public.wheel_spin(p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); w jsonb := private.earn('wheel'); v_prev jsonb; v_total numeric; v_roll numeric; v_acc numeric := 0;
  v_slice jsonb; v_idx int := 0; s jsonb; n int; v_kind text; v_amt int; v_res jsonb; v_id bigint; e public.explorers%rowtype; a public.rent_accounts%rowtype; v_new timestamptz;
begin
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'wheel_spin');
  if v_prev is not null then return v_prev; end if;
  if not coalesce((w ->> 'enabled')::boolean, false) then raise exception 'wheel_disabled' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('wheel:' || v_uid::text));
  if private.wheel_left(v_uid) <= 0 then raise exception 'wheel_used' using errcode = 'P0001', detail = (private.day_start(now()) + interval '1 day')::text; end if;
  select sum(greatest(coalesce((x ->> 'weight')::numeric, 0), 0)) into v_total from jsonb_array_elements(w -> 'slices') x;
  v_roll := random() * v_total;
  for s, n in select x, k from jsonb_array_elements(w -> 'slices') with ordinality t(x, k) loop
    v_acc := v_acc + greatest(coalesce((s ->> 'weight')::numeric, 0), 0);
    if v_slice is null and v_roll < v_acc then v_slice := s; v_idx := n - 1; end if;
  end loop;
  if v_slice is null then v_idx := jsonb_array_length(w -> 'slices') - 1; v_slice := w -> 'slices' -> v_idx; end if;
  v_kind := v_slice ->> 'kind';
  v_amt := greatest(floor(coalesce((v_slice ->> 'amount')::numeric, 0)), 0);
  insert into public.wheel_spins (player_id, slice, prize) values (v_uid, v_idx, v_slice - 'weight') returning id into v_id;
  if v_kind in ('ink', 'pigments', 'brush_points', 'gallery_tokens') then
    perform private.grant(v_uid, jsonb_build_object(v_kind, v_amt), 'wheel', 'wheel_spin', v_id::text, 'wheel:' || v_id);
  elsif v_kind = 'boost' and v_amt > 0 then
    perform private.rent_settle(v_uid);
    select * into a from public.rent_accounts where player_id = v_uid for update;
    v_new := greatest(coalesce(a.boost_until, now()), now()) + make_interval(mins => v_amt);
    update public.rent_accounts set boost_until = v_new, updated_at = now() where player_id = v_uid;
    insert into public.boost_activations (player_id, source, minutes, boost_until) values (v_uid, 'event', v_amt, v_new);
  elsif v_kind = 'joystick' then
    update public.explorers set joy_seconds = coalesce(((private.cfg('explorer') -> 'joystick') ->> 'tank_seconds')::real, 60),
                                joy_day = private.day_start(now()), updated_at = now()
     where player_id = v_uid;
  end if;
  v_res := jsonb_build_object('slice', v_idx, 'prize', v_slice - 'weight', 'spins_left', private.wheel_left(v_uid), 'balances', private.balances(v_uid),
                              'resets_at', private.day_start(now()) + interval '1 day');
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

-- ===== 4. Room check-ins ===========================================================
-- Visitors earn for each different room they check into a day; hosts earn per unique visitor.
create table if not exists public.room_visits (
  host_id uuid not null references public.players(id) on delete cascade,
  visitor_id uuid not null references public.players(id) on delete cascade,
  entered_at timestamptz not null default now(),
  primary key (host_id, visitor_id)
);
create table if not exists public.room_checkins (
  host_id uuid not null references public.players(id) on delete cascade,
  visitor_id uuid not null references public.players(id) on delete cascade,
  day date not null,
  visitor_ink int not null default 0,
  host_ink int not null default 0,
  created_at timestamptz not null default now(),
  primary key (host_id, visitor_id, day)
);
create index if not exists room_checkins_visitor on public.room_checkins (visitor_id, created_at desc);
create index if not exists room_checkins_host on public.room_checkins (host_id, created_at desc);
alter table public.room_visits enable row level security;
alter table public.room_checkins enable row level security;
revoke all on public.room_visits, public.room_checkins from anon, authenticated;

create or replace function private.room_host(p_username text, p_viewer uuid) returns uuid
language plpgsql stable as $$
declare v_host uuid;
begin
  select id into v_host from public.profiles where lower(username) = lower(btrim(coalesce(p_username, '')));
  if v_host is null or not private.visible_to(v_host, p_viewer) or not exists (select 1 from public.world_plots where owner_id = v_host) then
    raise exception 'room_not_found' using errcode = 'P0001';
  end if;
  return v_host;
end $$;

create or replace function private.room_status(p_host uuid, p_visitor uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'enabled', coalesce((r ->> 'enabled')::boolean, false),
    'own', p_host = p_visitor,
    'checked_in', exists (select 1 from public.room_checkins c where c.host_id = p_host and c.visitor_id = p_visitor and c.day = (private.day_start(now()) at time zone 'UTC')::date),
    'visitor_ink', coalesce((r ->> 'visitor_ink')::int, 0), 'host_ink', coalesce((r ->> 'host_ink')::int, 0),
    'stay_seconds', coalesce((r ->> 'stay_seconds')::int, 10),
    'paid_today', (select count(*) from public.room_checkins c where c.visitor_id = p_visitor and c.visitor_ink > 0 and c.created_at >= private.day_start(now())),
    'visitor_daily', coalesce((r ->> 'visitor_daily')::int, 5),
    'old_enough', private.old_enough(p_visitor, coalesce((r ->> 'min_account_hours')::numeric, 24)),
    'visitors_today', (select count(*) from public.room_checkins c where c.host_id = p_host and c.created_at >= private.day_start(now())),
    'resets_at', private.day_start(now()) + interval '1 day')
  from (select private.earn('rooms') r) x
$$;

-- you walk into someone's room: the stay clock starts
create or replace function public.room_enter(p_username text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_host uuid;
begin
  perform private.rate_limit('room_enter', 240, 3600);
  v_host := private.room_host(p_username, v_uid);
  if v_host <> v_uid then
    insert into public.room_visits (host_id, visitor_id) values (v_host, v_uid)
    on conflict (host_id, visitor_id) do update set entered_at = case when public.room_visits.entered_at < now() - interval '30 minutes' then now() else public.room_visits.entered_at end;
  end if;
  return private.room_status(v_host, v_uid);
end $$;

create or replace function public.room_checkin(p_username text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); r jsonb := private.earn('rooms'); v_host uuid; v_day date := (private.day_start(now()) at time zone 'UTC')::date;
  v_vis int := 0; v_hst int := 0; v_entered timestamptz;
begin
  perform private.rate_limit('room_checkin', 60, 3600);
  if not coalesce((r ->> 'enabled')::boolean, false) then raise exception 'rooms_disabled' using errcode = 'P0001'; end if;
  v_host := private.room_host(p_username, v_uid);
  if v_host = v_uid then raise exception 'own_room' using errcode = 'P0001'; end if;
  select entered_at into v_entered from public.room_visits where host_id = v_host and visitor_id = v_uid;
  if v_entered is null or v_entered > now() - make_interval(secs => coalesce((r ->> 'stay_seconds')::int, 10)) then
    raise exception 'look_around_first' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.room_checkins where host_id = v_host and visitor_id = v_uid and day = v_day) then
    raise exception 'already_checked_in' using errcode = 'P0001';
  end if;
  -- only accounts old enough (and owning land) count, so extra accounts can't farm check-ins
  if private.old_enough(v_uid, coalesce((r ->> 'min_account_hours')::numeric, 24)) and exists (select 1 from public.world_plots where owner_id = v_uid) then
    if (select count(*) from public.room_checkins where visitor_id = v_uid and visitor_ink > 0 and created_at >= private.day_start(now())) < coalesce((r ->> 'visitor_daily')::int, 5) then
      v_vis := greatest(coalesce((r ->> 'visitor_ink')::int, 0), 0);
    end if;
    if (select count(*) from public.room_checkins where host_id = v_host and host_ink > 0 and created_at >= private.day_start(now())) < coalesce((r ->> 'host_daily')::int, 10) then
      v_hst := greatest(coalesce((r ->> 'host_ink')::int, 0), 0);
    end if;
  end if;
  insert into public.room_checkins (host_id, visitor_id, day, visitor_ink, host_ink) values (v_host, v_uid, v_day, v_vis, v_hst);
  if v_vis > 0 then perform private.grant(v_uid, jsonb_build_object('ink', v_vis), 'room_visit', 'room', v_host::text, 'room:' || v_host || ':' || v_uid || ':' || v_day || ':v'); end if;
  if v_hst > 0 then perform private.grant(v_host, jsonb_build_object('ink', v_hst), 'room_host', 'room', v_uid::text, 'room:' || v_host || ':' || v_uid || ':' || v_day || ':h'); end if;
  return private.room_status(v_host, v_uid) || jsonb_build_object('earned', v_vis, 'host_earned', v_hst, 'balances', private.balances(v_uid));
end $$;

-- ===== 5. Inspire: appreciating art pays its artist ================================
create table if not exists public.inspire_rewards (
  publication_id uuid not null references public.artwork_publications(id) on delete cascade,
  giver_id uuid not null references public.players(id) on delete cascade,
  artist_id uuid not null references public.players(id) on delete cascade,
  artist_ink int not null default 0,
  giver_ink int not null default 0,
  created_at timestamptz not null default now(),
  primary key (publication_id, giver_id)
);
create index if not exists inspire_rewards_artist on public.inspire_rewards (artist_id, created_at desc);
create index if not exists inspire_rewards_giver on public.inspire_rewards (giver_id, created_at desc);
alter table public.inspire_rewards enable row level security;
revoke all on public.inspire_rewards from anon, authenticated;

create or replace function public.appreciate(p_publication_id uuid, p_on boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_pub public.artwork_publications%rowtype; v_count int; v_new boolean := false;
  c jsonb := private.earn('inspire'); v_art int := 0; v_give int := 0;
begin
  perform private.rate_limit('appreciate', 120, 3600);
  perform private.rate_limit('appreciate_daily', 600, 86400);
  select * into v_pub from public.artwork_publications where id = p_publication_id for update;
  if not found or v_pub.status <> 'published' or not private.visible_to(v_pub.owner_id, v_uid) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_pub.owner_id = v_uid then raise exception 'cannot_appreciate_own' using errcode = 'P0001'; end if;
  if (select count(*) from public.world_plots where owner_id = v_uid) < coalesce((private.cfg('limits') ->> 'min_plots_to_react')::int, 1) then
    raise exception 'claim_a_plot_first' using errcode = 'P0001';
  end if;
  if p_on then
    insert into public.gallery_reactions (publication_id, player_id) values (p_publication_id, v_uid) on conflict do nothing;
    if found then update public.artwork_publications set appreciation_count = appreciation_count + 1 where id = p_publication_id; end if;
    -- the first time an account inspires a piece, the artist earns (and so do you, a few times a day)
    if coalesce((c ->> 'enabled')::boolean, false) and private.old_enough(v_uid, coalesce((c ->> 'min_account_hours')::numeric, 24))
       and not exists (select 1 from public.inspire_rewards where publication_id = p_publication_id and giver_id = v_uid) then
      if coalesce((select sum(artist_ink) from public.inspire_rewards where artist_id = v_pub.owner_id and created_at >= private.day_start(now())), 0)
           + coalesce((c ->> 'artist_ink')::int, 0) <= coalesce((c ->> 'artist_daily_cap')::int, 40) then
        v_art := greatest(coalesce((c ->> 'artist_ink')::int, 0), 0);
      end if;
      if (select count(*) from public.inspire_rewards where giver_id = v_uid and giver_ink > 0 and created_at >= private.day_start(now())) < coalesce((c ->> 'giver_daily')::int, 5) then
        v_give := greatest(coalesce((c ->> 'giver_ink')::int, 0), 0);
      end if;
      insert into public.inspire_rewards (publication_id, giver_id, artist_id, artist_ink, giver_ink) values (p_publication_id, v_uid, v_pub.owner_id, v_art, v_give);
      if v_art > 0 then perform private.grant(v_pub.owner_id, jsonb_build_object('ink', v_art), 'inspire', 'publication', p_publication_id::text, 'inspire:' || p_publication_id || ':' || v_uid); end if;
      if v_give > 0 then perform private.grant(v_uid, jsonb_build_object('ink', v_give), 'inspire_given', 'publication', p_publication_id::text, 'inspired:' || p_publication_id || ':' || v_uid); end if;
      v_new := true;
    end if;
  else
    delete from public.gallery_reactions where publication_id = p_publication_id and player_id = v_uid;
    if found then update public.artwork_publications set appreciation_count = greatest(appreciation_count - 1, 0) where id = p_publication_id; end if;
  end if;
  select appreciation_count into v_count from public.artwork_publications where id = p_publication_id;
  perform private.evaluate_achievements(v_pub.owner_id);
  return jsonb_build_object('appreciated', p_on, 'appreciation_count', v_count, 'artist_ink', v_art, 'earned', v_give, 'first', v_new,
                            'balances', private.balances(v_uid), 'achievements', private.evaluate_achievements(v_uid));
end $$;

-- ===== 6. The craft bonus ==========================================================
-- The art pipeline reads each published artwork (palette, shading, detail, coverage, with
-- noise filtered out) and records a 0-100 craft score. When the art goes live, its canvas
-- earns the best craft tier it has reached — paid once per tier, so republishing only
-- pays when the art gets better. Bigger murals earn more.
alter table public.artwork_publications add column if not exists craft jsonb;
alter table public.artwork_publications add column if not exists craft_score int;
create table if not exists public.craft_rewards (
  group_id uuid primary key references public.canvas_groups(id) on delete cascade,
  owner_id uuid not null references public.players(id) on delete cascade,
  best_score int not null default 0,
  paid_ink int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.craft_rewards enable row level security;
revoke all on public.craft_rewards from anon, authenticated;

create or replace function public.svc_record_craft(p_publication_id uuid, p_craft jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_score int := least(greatest(coalesce((p_craft ->> 'score')::int, 0), 0), 100);
begin
  update public.artwork_publications set craft = p_craft - 'score' || jsonb_build_object('score', v_score), craft_score = v_score where id = p_publication_id;
  -- already live (staff art goes straight through): pay now
  perform private.craft_pay(p_publication_id);
  return jsonb_build_object('craft_score', v_score);
end $$;

create or replace function private.craft_pay(p_publication_id uuid) returns void
language plpgsql as $$
declare
  p public.artwork_publications%rowtype; c jsonb := private.earn('craft'); v_tier numeric; v_target int; v_prev public.craft_rewards%rowtype; v_pay int; v_today numeric;
begin
  select * into p from public.artwork_publications where id = p_publication_id;
  if not found or p.status <> 'published' or p.craft_score is null or not coalesce((c ->> 'enabled')::boolean, false) then return; end if;
  if p.craft ? 'paid' then return; end if;
  select max(greatest(coalesce((t ->> 'ink')::numeric, 0), 0)) into v_tier from jsonb_array_elements(coalesce(c -> 'tiers', '[]'::jsonb)) t
   where p.craft_score >= coalesce((t ->> 'min')::numeric, 101);
  v_target := floor(coalesce(v_tier, 0) * (1 + coalesce((c ->> 'plot_bonus_pct')::numeric, 20) / 100
                     * least(greatest(p.plot_count - 1, 0), coalesce((c ->> 'max_bonus_plots')::int, 8))));
  select * into v_prev from public.craft_rewards where group_id = p.group_id for update;
  v_pay := greatest(v_target - coalesce(v_prev.paid_ink, 0), 0);
  select coalesce(sum(delta), 0) into v_today from public.resource_ledger where player_id = p.owner_id and resource = 'ink' and reason = 'craft' and created_at >= private.day_start(now());
  v_pay := least(v_pay, greatest(coalesce((c ->> 'daily_cap')::numeric, 100) - v_today, 0))::int;
  insert into public.craft_rewards (group_id, owner_id, best_score, paid_ink) values (p.group_id, p.owner_id, p.craft_score, v_pay)
  on conflict (group_id) do update set best_score = greatest(public.craft_rewards.best_score, excluded.best_score),
                                       paid_ink = public.craft_rewards.paid_ink + v_pay, updated_at = now();
  update public.artwork_publications set craft = craft || jsonb_build_object('paid', v_pay, 'tier_ink', v_target) where id = p.id;
  if v_pay > 0 then perform private.grant(p.owner_id, jsonb_build_object('ink', v_pay), 'craft', 'publication', p.id::text, 'craft:' || p.id); end if;
end $$;

create or replace function private.craft_publish_trg() returns trigger
language plpgsql as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then perform private.craft_pay(new.id); end if;
  return null;
end $$;
drop trigger if exists artwork_publications_craft on public.artwork_publications;
create trigger artwork_publications_craft after update of status on public.artwork_publications
  for each row execute function private.craft_publish_trg();

-- ===== 7. Featured picks pay their artist ==========================================
create or replace function public.admin_feature(p_publication_id uuid, p_section text, p_on boolean, p_note text default null,
                                                p_criteria text default null, p_ends_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']); v_owner uuid; v_title text; v_ink int := 0; v_first boolean;
begin
  if p_on then
    select owner_id, title into v_owner, v_title from public.artwork_publications where id = p_publication_id and status = 'published';
    if v_owner is null then raise exception 'not_published' using errcode = 'P0001'; end if;
    v_first := not exists (select 1 from public.featured_artwork where publication_id = p_publication_id)
           and not exists (select 1 from public.resource_ledger where reason = 'featured' and ref_id = p_publication_id::text);
    insert into public.featured_artwork (publication_id, section, note, criteria, featured_by, ends_at)
    values (p_publication_id, p_section, p_note, p_criteria, v_uid, p_ends_at)
    on conflict (publication_id, section) do update set note = excluded.note, criteria = excluded.criteria,
      ends_at = excluded.ends_at, featured_by = v_uid, starts_at = now();
    -- the first feature of a piece pays its artist (once, however many sections it's in)
    if v_first then
      v_ink := greatest(coalesce((private.earn('featured') ->> 'ink')::int, 0), 0);
      if v_ink > 0 then perform private.grant(v_owner, jsonb_build_object('ink', v_ink), 'featured', 'publication', p_publication_id::text, 'featured:' || p_publication_id); end if;
      insert into public.feed_events (kind, player_id, data) values ('featured', v_owner, jsonb_build_object('publication_id', p_publication_id, 'title', v_title));
    end if;
  else
    delete from public.featured_artwork where publication_id = p_publication_id and section = p_section;
  end if;
  perform private.audit(case when p_on then 'gallery.feature' else 'gallery.unfeature' end, 'publication', p_publication_id::text,
                        jsonb_build_object('section', p_section, 'note', p_note, 'criteria', p_criteria, 'ink', v_ink));
  return jsonb_build_object('ok', true, 'ink', v_ink);
end $$;

-- ===== 8. Weekly themed challenges =================================================
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 60),
  theme text not null default '' check (char_length(theme) <= 400),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  prizes int[] not null default '{100, 50, 25}',
  entry_ink int not null default 0 check (entry_ink between 0 and 10000),
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  created_by uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.challenge_entries (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  publication_id uuid not null references public.artwork_publications(id) on delete cascade,
  owner_id uuid not null references public.players(id) on delete cascade,
  votes int not null default 0,
  place int,
  prize int not null default 0,
  entry_paid int not null default 0,
  created_at timestamptz not null default now(),
  primary key (challenge_id, owner_id),
  unique (challenge_id, publication_id)
);
create table if not exists public.challenge_votes (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  voter_id uuid not null references public.players(id) on delete cascade,
  publication_id uuid not null references public.artwork_publications(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (challenge_id, voter_id, publication_id)
);
alter table public.challenges enable row level security;
alter table public.challenge_entries enable row level security;
alter table public.challenge_votes enable row level security;
revoke all on public.challenges, public.challenge_entries, public.challenge_votes from anon, authenticated;

-- Close finished challenges: the most-voted entries win their prizes (a tie goes to the earlier entry).
create or replace function private.challenge_sweep() returns void
language plpgsql as $$
declare ch public.challenges%rowtype; e record; k int;
begin
  for ch in select * from public.challenges where status = 'open' and ends_at <= now() for update skip locked loop
    k := 0;
    for e in select ce.* from public.challenge_entries ce join public.artwork_publications a on a.id = ce.publication_id and a.status = 'published'
             where ce.challenge_id = ch.id and ce.votes > 0 order by ce.votes desc, ce.created_at limit coalesce(array_length(ch.prizes, 1), 0) loop
      k := k + 1;
      update public.challenge_entries set place = k, prize = coalesce(ch.prizes[k], 0) where challenge_id = ch.id and owner_id = e.owner_id;
      if coalesce(ch.prizes[k], 0) > 0 then
        perform private.grant(e.owner_id, jsonb_build_object('ink', ch.prizes[k]), 'challenge', 'challenge', ch.id::text, 'challenge:' || ch.id || ':' || k);
      end if;
      insert into public.feed_events (kind, player_id, data)
      values ('challenge', e.owner_id, jsonb_build_object('challenge_id', ch.id, 'title', ch.title, 'place', k, 'publication_id', e.publication_id));
    end loop;
    update public.challenges set status = 'done' where id = ch.id;
  end loop;
end $$;

create or replace function private.challenge_json(ch public.challenges, p_viewer uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', ch.id, 'title', ch.title, 'theme', ch.theme, 'starts_at', ch.starts_at, 'ends_at', ch.ends_at, 'prizes', to_jsonb(ch.prizes),
    'entry_ink', ch.entry_ink, 'status', case when ch.status = 'open' and ch.starts_at > now() then 'upcoming' else ch.status end,
    'entries', (select coalesce(jsonb_agg(jsonb_build_object('card', private.artwork_card(a, p_viewer), 'votes', ce.votes, 'place', ce.place, 'prize', ce.prize,
                                                             'voted', p_viewer is not null and exists (select 1 from public.challenge_votes v where v.challenge_id = ch.id and v.voter_id = p_viewer and v.publication_id = ce.publication_id),
                                                             'mine', ce.owner_id = p_viewer)
                                          order by ce.place nulls last, ce.votes desc, ce.created_at), '[]'::jsonb)
                from public.challenge_entries ce join public.artwork_publications a on a.id = ce.publication_id
                where ce.challenge_id = ch.id and a.status = 'published' and private.visible_to(a.owner_id, p_viewer)),
    'my_votes_left', case when p_viewer is null then 0 else greatest(coalesce((private.earn('challenges') ->> 'votes_per_player')::int, 3)
                     - (select count(*)::int from public.challenge_votes v where v.challenge_id = ch.id and v.voter_id = p_viewer), 0) end,
    'my_entry', (select publication_id from public.challenge_entries where challenge_id = ch.id and owner_id = p_viewer))
$$;

create or replace function public.challenges_current() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  perform private.challenge_sweep();
  return jsonb_build_object(
    'enabled', coalesce((private.earn('challenges') ->> 'enabled')::boolean, false),
    'votes_per_player', coalesce((private.earn('challenges') ->> 'votes_per_player')::int, 3),
    'active', (select coalesce(jsonb_agg(private.challenge_json(c, v_uid) order by c.ends_at), '[]'::jsonb)
               from public.challenges c where c.status = 'open' and c.starts_at <= now() and c.ends_at > now()),
    'upcoming', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'theme', c.theme, 'starts_at', c.starts_at, 'ends_at', c.ends_at, 'prizes', to_jsonb(c.prizes)) order by c.starts_at), '[]'::jsonb)
                 from public.challenges c where c.status = 'open' and c.starts_at > now()),
    'past', (select coalesce(jsonb_agg(private.challenge_json(c, v_uid) order by c.ends_at desc), '[]'::jsonb)
             from (select * from public.challenges where status = 'done' order by ends_at desc limit 4) c));
end $$;

create or replace function public.challenge_enter(p_challenge_id uuid, p_publication_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); ch public.challenges%rowtype; a public.artwork_publications%rowtype; v_pay int := 0; v_had boolean;
begin
  perform private.challenge_sweep();
  select * into ch from public.challenges where id = p_challenge_id;
  if not found or ch.status <> 'open' or ch.starts_at > now() or ch.ends_at <= now() then raise exception 'challenge_closed' using errcode = 'P0001'; end if;
  select * into a from public.artwork_publications where id = p_publication_id;
  if not found or a.owner_id <> v_uid or a.status <> 'published' then raise exception 'not_your_artwork' using errcode = 'P0001'; end if;
  -- art made for the theme: published after the challenge started
  if coalesce(a.published_at, a.created_at) < ch.starts_at then raise exception 'made_before_challenge' using errcode = 'P0001'; end if;
  select exists (select 1 from public.challenge_entries where challenge_id = ch.id and owner_id = v_uid) into v_had;
  if v_had then
    -- swapping your entry for a new piece resets its votes
    delete from public.challenge_votes where challenge_id = ch.id and publication_id = (select publication_id from public.challenge_entries where challenge_id = ch.id and owner_id = v_uid);
    update public.challenge_entries set publication_id = p_publication_id, votes = 0, created_at = now() where challenge_id = ch.id and owner_id = v_uid;
  else
    if ch.entry_ink > 0 and private.old_enough(v_uid, coalesce((private.earn('challenges') ->> 'min_account_hours')::numeric, 24)) then v_pay := ch.entry_ink; end if;
    insert into public.challenge_entries (challenge_id, publication_id, owner_id, entry_paid) values (ch.id, p_publication_id, v_uid, v_pay);
    if v_pay > 0 then perform private.grant(v_uid, jsonb_build_object('ink', v_pay), 'challenge', 'challenge', ch.id::text, 'challenge:' || ch.id || ':entry:' || v_uid); end if;
  end if;
  return private.challenge_json(ch, v_uid) || jsonb_build_object('earned', v_pay, 'balances', private.balances(v_uid));
end $$;

create or replace function public.challenge_vote(p_challenge_id uuid, p_publication_id uuid, p_on boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); ch public.challenges%rowtype; e public.challenge_entries%rowtype; cfg jsonb := private.earn('challenges');
begin
  perform private.rate_limit('challenge_vote', 120, 3600);
  perform private.challenge_sweep();
  select * into ch from public.challenges where id = p_challenge_id;
  if not found or ch.status <> 'open' or ch.starts_at > now() or ch.ends_at <= now() then raise exception 'challenge_closed' using errcode = 'P0001'; end if;
  select * into e from public.challenge_entries where challenge_id = ch.id and publication_id = p_publication_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if e.owner_id = v_uid then raise exception 'cannot_vote_own' using errcode = 'P0001'; end if;
  if p_on then
    -- only established accounts with land vote, so extra accounts can't stuff the ballot
    if not private.old_enough(v_uid, coalesce((cfg ->> 'min_account_hours')::numeric, 24)) or not exists (select 1 from public.world_plots where owner_id = v_uid) then
      raise exception 'account_too_new_to_vote' using errcode = 'P0001';
    end if;
    if (select count(*) from public.challenge_votes where challenge_id = ch.id and voter_id = v_uid) >= coalesce((cfg ->> 'votes_per_player')::int, 3) then
      raise exception 'out_of_votes' using errcode = 'P0001';
    end if;
    insert into public.challenge_votes (challenge_id, voter_id, publication_id) values (ch.id, v_uid, p_publication_id) on conflict do nothing;
    if found then update public.challenge_entries set votes = votes + 1 where challenge_id = ch.id and publication_id = p_publication_id; end if;
  else
    delete from public.challenge_votes where challenge_id = ch.id and voter_id = v_uid and publication_id = p_publication_id;
    if found then update public.challenge_entries set votes = greatest(votes - 1, 0) where challenge_id = ch.id and publication_id = p_publication_id; end if;
  end if;
  return private.challenge_json(ch, v_uid);
end $$;

create or replace function public.admin_challenges() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']);
begin
  perform private.challenge_sweep();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'theme', c.theme, 'starts_at', c.starts_at, 'ends_at', c.ends_at,
            'prizes', to_jsonb(c.prizes), 'entry_ink', c.entry_ink, 'status', c.status,
            'entries', (select count(*) from public.challenge_entries e where e.challenge_id = c.id),
            'votes', (select count(*) from public.challenge_votes v where v.challenge_id = c.id),
            'leaders', (select coalesce(jsonb_agg(jsonb_build_object('title', a.title, 'artist', private.profile_json(e.owner_id), 'votes', e.votes, 'place', e.place, 'publication_id', a.id) order by e.place nulls last, e.votes desc), '[]'::jsonb)
                        from (select * from public.challenge_entries where challenge_id = c.id order by place nulls last, votes desc limit 10) e
                        join public.artwork_publications a on a.id = e.publication_id)) order by c.starts_at desc), '[]'::jsonb)
          from (select * from public.challenges order by starts_at desc limit 30) c);
end $$;

create or replace function public.admin_challenge_save(p_id uuid, p_title text, p_theme text, p_starts_at timestamptz, p_ends_at timestamptz, p_prizes jsonb, p_entry_ink int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']); v_id uuid; v_prizes int[];
begin
  if jsonb_typeof(p_prizes) is distinct from 'array' or jsonb_array_length(p_prizes) > 10
     or exists (select 1 from jsonb_array_elements(p_prizes) x where jsonb_typeof(x) <> 'number' or x::numeric < 0 or x::numeric > 1000000) then
    raise exception 'invalid_challenge' using errcode = 'P0001';
  end if;
  v_prizes := array(select floor(x::numeric)::int from jsonb_array_elements(p_prizes) x);
  if p_id is null then
    insert into public.challenges (title, theme, starts_at, ends_at, prizes, entry_ink, created_by)
    values (btrim(p_title), coalesce(btrim(p_theme), ''), p_starts_at, p_ends_at, v_prizes, coalesce(p_entry_ink, 0), v_uid) returning id into v_id;
  else
    update public.challenges set title = btrim(p_title), theme = coalesce(btrim(p_theme), ''), starts_at = p_starts_at, ends_at = p_ends_at,
           prizes = v_prizes, entry_ink = coalesce(p_entry_ink, 0)
     where id = p_id and status = 'open' returning id into v_id;
    if v_id is null then raise exception 'challenge_closed' using errcode = 'P0001'; end if;
  end if;
  perform private.audit('challenge.save', 'challenge', v_id::text, jsonb_build_object('title', p_title, 'prizes', p_prizes));
  return public.admin_challenges();
end $$;

create or replace function public.admin_challenge_cancel(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']);
begin
  update public.challenges set status = 'cancelled' where id = p_id and status = 'open';
  perform private.audit('challenge.cancel', 'challenge', p_id::text, '{}'::jsonb);
  return public.admin_challenges();
end $$;

-- the craft score and Featured badge travel with every artwork card
create or replace function private.artwork_card(p_pub public.artwork_publications, p_viewer uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p_pub.id, 'title', p_pub.title, 'plot_count', p_pub.plot_count, 'published_at', p_pub.published_at,
    'thumb_path', p_pub.thumb_path, 'preview_path', p_pub.preview_path,
    'preview_width', p_pub.preview_width, 'preview_height', p_pub.preview_height,
    'appreciation_count', p_pub.appreciation_count, 'status', p_pub.status,
    'craft_score', p_pub.craft_score,
    'featured', exists (select 1 from public.featured_artwork f where f.publication_id = p_pub.id and (f.ends_at is null or f.ends_at > now())),
    'artist', private.profile_json(p_pub.owner_id),
    'appreciated', p_viewer is not null and exists (
      select 1 from public.gallery_reactions r where r.publication_id = p_pub.id and r.player_id = p_viewer))
  || case when p_viewer = p_pub.owner_id then jsonb_build_object('craft', p_pub.craft) else '{}'::jsonb end
  || case when private.can_see_location(p_pub.owner_id, p_viewer) then jsonb_build_object(
       'center_lng', p_pub.center_lng, 'center_lat', p_pub.center_lat,
       'min_gx', p_pub.min_gx, 'min_gy', p_pub.min_gy, 'max_gx', p_pub.max_gx, 'max_gy', p_pub.max_gy)
     else '{}'::jsonb end
$$;

-- ===== 9. Everything you can earn today, in one place ===============================
create or replace function public.earn_overview() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); e jsonb := private.cfg('earn');
begin
  perform private.challenge_sweep();
  return jsonb_build_object(
    'wheel', jsonb_build_object('enabled', coalesce((e -> 'wheel' ->> 'enabled')::boolean, false), 'spins_left', private.wheel_left(v_uid)),
    'rooms', jsonb_build_object('enabled', coalesce((e -> 'rooms' ->> 'enabled')::boolean, false),
                                'visitor_ink', e -> 'rooms' -> 'visitor_ink', 'host_ink', e -> 'rooms' -> 'host_ink',
                                'paid_today', (select count(*) from public.room_checkins where visitor_id = v_uid and visitor_ink > 0 and created_at >= private.day_start(now())),
                                'visitor_daily', e -> 'rooms' -> 'visitor_daily',
                                'host_today', (select coalesce(sum(host_ink), 0) from public.room_checkins where host_id = v_uid and created_at >= private.day_start(now()))),
    'inspire', jsonb_build_object('enabled', coalesce((e -> 'inspire' ->> 'enabled')::boolean, false),
                                  'artist_ink', e -> 'inspire' -> 'artist_ink', 'giver_ink', e -> 'inspire' -> 'giver_ink', 'giver_daily', e -> 'inspire' -> 'giver_daily',
                                  'given_today', (select count(*) from public.inspire_rewards where giver_id = v_uid and giver_ink > 0 and created_at >= private.day_start(now())),
                                  'earned_today', (select coalesce(sum(artist_ink), 0) from public.inspire_rewards where artist_id = v_uid and created_at >= private.day_start(now()))),
    'craft', jsonb_build_object('enabled', coalesce((e -> 'craft' ->> 'enabled')::boolean, false), 'tiers', e -> 'craft' -> 'tiers',
                                'plot_bonus_pct', e -> 'craft' -> 'plot_bonus_pct',
                                'best', (select max(craft_score) from public.artwork_publications where owner_id = v_uid and status = 'published')),
    'featured_ink', e -> 'featured' -> 'ink',
    'challenges', (select count(*) from public.challenges where status = 'open' and starts_at <= now() and ends_at > now()),
    'old_enough', private.old_enough(v_uid, 24),
    'resets_at', private.day_start(now()) + interval '1 day');
end $$;

-- ===== 10. Permissions ==============================================================
do $$
declare f text;
begin
  foreach f in array array[
    'private.check_earn_config_trg()', 'private.earn(text)', 'private.old_enough(uuid, numeric)', 'private.wheel_left(uuid)',
    'private.room_host(text, uuid)', 'private.room_status(uuid, uuid)', 'private.craft_pay(uuid)', 'private.craft_publish_trg()',
    'private.challenge_sweep()', 'private.challenge_json(public.challenges, uuid)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array[
    'public.wheel_spin(text)', 'public.room_enter(text)', 'public.room_checkin(text)', 'public.appreciate(uuid, boolean)',
    'public.challenge_enter(uuid, uuid)', 'public.challenge_vote(uuid, uuid, boolean)', 'public.earn_overview()',
    'public.admin_challenges()', 'public.admin_challenge_save(uuid, text, text, timestamptz, timestamptz, jsonb, int)', 'public.admin_challenge_cancel(uuid)',
    'public.admin_feature(uuid, text, boolean, text, text, timestamptz)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array['public.wheel_status()', 'public.challenges_current()'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
  execute 'revoke all on function public.svc_record_craft(uuid, jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.svc_record_craft(uuid, jsonb) to service_role';
end $$;

-- ===== 11. Badges know about Paint Pop and the new ways to shine ======================
create or replace function private.achievement_metrics(p_uid uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'plots', (select count(*) from public.world_plots where owner_id = p_uid),
    'regions', (select count(distinct ((gx >> 13) * 8 + (gy >> 13))) from public.world_plots where owner_id = p_uid),
    'saved_tiles', (select coalesce(max(tile_count), 0) from public.artwork_versions where owner_id = p_uid and kind = 'save'),
    'publications', (select count(*) from public.artwork_publications where owner_id = p_uid and status in ('published', 'superseded')),
    'largest_publication', (select coalesce(max(plot_count), 0) from public.artwork_publications where owner_id = p_uid and status in ('published', 'superseded')),
    'max_colors', (select coalesce(max(color_count), 0) from public.artwork_publications where owner_id = p_uid and status in ('published', 'superseded')),
    'largest_group', (select coalesce(max(plot_count), 0) from public.canvas_groups where owner_id = p_uid and status = 'active'),
    'tracecraft', (select coalesce(max(highest_level), 0) from public.minigame_records where player_id = p_uid and game = 'tracecraft'),
    'colorburst', (select coalesce(max(highest_level), 0) from public.minigame_records where player_id = p_uid and game = 'colorburst'),
    'patternshift', (select coalesce(max(highest_level), 0) from public.minigame_records where player_id = p_uid and game = 'patternshift'),
    'paintpop', (select coalesce(max(highest_level), 0) from public.minigame_records where player_id = p_uid and game = 'paintpop'),
    'craft_best', (select coalesce(max(craft_score), 0) from public.artwork_publications where owner_id = p_uid and status in ('published', 'superseded')),
    'challenge_wins', (select count(*) from public.challenge_entries where owner_id = p_uid and place between 1 and 3),
    'rooms_visited', (select count(distinct host_id) from public.room_checkins where visitor_id = p_uid),
    'lightlines', (select coalesce(max(highest_level), 0) from public.minigame_records where player_id = p_uid and game = 'lightlines'),
    'minigame_wins', (select coalesce(sum(wins), 0) from public.minigame_records where player_id = p_uid),
    'appreciations_received', (select coalesce(sum(appreciation_count), 0) from public.artwork_publications where owner_id = p_uid),
    'appreciations_given', (select count(*) from public.gallery_reactions where player_id = p_uid),
    'upgrades', (select coalesce(sum(level - 1), 0) from public.world_plots where owner_id = p_uid),
    'rare_plots', (select count(*) from public.world_plots where owner_id = p_uid and rarity in ('epic', 'legendary', 'mythic')),
    'legendary_plots', (select count(*) from public.world_plots where owner_id = p_uid and rarity in ('legendary', 'mythic')),
    'mythic_plots', (select count(*) from public.world_plots where owner_id = p_uid and rarity = 'mythic'),
    'boosts', (select count(*) from public.boost_activations where player_id = p_uid))
$$;
insert into public.achievements (key, name, description, icon, category, metric, threshold, reward, sort) values
  ('craftsman', 'Craftsman', 'Publish art with a craft score of 80 or more.', 'sparkles', 'creation', 'craft_best', 80, '{"pigments": 15, "gallery_tokens": 2}', 40),
  ('challenge_podium', 'On the Podium', 'Finish in the top 3 of a weekly challenge.', 'trophy', 'community', 'challenge_wins', 1, '{"pigments": 20, "gallery_tokens": 3}', 41),
  ('house_guest', 'House Guest', 'Check into 10 different players’ rooms.', 'globe', 'exploration', 'rooms_visited', 10, '{"pigments": 10}', 42)
on conflict (key) do nothing;
