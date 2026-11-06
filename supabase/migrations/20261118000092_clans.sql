-- v0.6 Clans. Anyone can found one for 1,000 Ink: a name, a tag, an emblem and a colour. Players join (open
-- clans), ask to join (request clans) or are invited (invite-only clans); leaders and officers run it. Members get:
--   * clan chat, from anywhere;
--   * a clan hall: a shared live room (the house room system, keyed by the clan's id), decorated by the officers
--     with furniture the clan unlocks as it levels up, with the house party games;
--   * weekly goals: every Ink a member earns (realms, arcades, farms, party games…) and time spent together in the
--     hall fills them; finished goals give the clan XP and every member who helped a reward;
--   * levels: clan XP (one per Ink members earn) levels the clan up: more members, more goals, more furniture,
--     bigger rewards;
--   * clan vs clan: a weekly leaderboard (the week's Ink), season rewards for the top clans, and 24-hour head-to-head
--     battles one clan challenges another to.

insert into public.game_config (key, value, description) values ('clans', $cfg${
  "found_cost": 1000,
  "rejoin_hours": 12,
  "members": { "base": 20, "per_level": 2, "max": 60 },
  "level": { "base": 2000, "growth": 1.35, "max": 30 },
  "emblems": ["🛡️","🐉","🦊","🐺","🦁","🦅","🐙","🦄","🌟","🔥","⚡","🌙","🍄","💎","👑","🎨","🚀","🌊","🌵","🍀","🎃","🐝","🦖","🏰"],
  "colors": ["#FF5FA2","#7B5CFF","#22E3FF","#3DDC97","#FFB13D","#FF3D6E","#FFD23F","#4D7CFF","#B05CFF","#FF8A3D","#2BD4A4","#E9E4FF"],
  "goals_base": 3,
  "goals_more_at": [4, 8],
  "goal_reward": { "ink": 60, "xp": 400, "per_level": 0.05 },
  "goal_min_help": { "ink": 1, "secs": 60 },
  "goals": [
    { "k": "ink",      "cat": "ink",      "emoji": "💧", "label": "Earn Ink together",            "base": 1500, "per": 400 },
    { "k": "hall",     "cat": "hall",     "emoji": "🏰", "label": "Hang out in the clan hall",     "base": 1800, "per": 600, "unit": "min" },
    { "k": "realm",    "cat": "realm",    "emoji": "⛏️", "label": "Earn Ink in realms",            "base": 500,  "per": 150 },
    { "k": "party",    "cat": "party",    "emoji": "🎉", "label": "Win Ink in house party games",  "base": 300,  "per": 100 },
    { "k": "arcade",   "cat": "arcade",   "emoji": "🕹️", "label": "Earn Ink at arcades",           "base": 400,  "per": 120 },
    { "k": "farm",     "cat": "farm",     "emoji": "🌾", "label": "Earn Ink farming",              "base": 400,  "per": 120 },
    { "k": "business", "cat": "business", "emoji": "🍋", "label": "Earn Ink from businesses",      "base": 400,  "per": 120 },
    { "k": "games",    "cat": "games",    "emoji": "🎮", "label": "Win Ink in plot minigames",     "base": 400,  "per": 120 },
    { "k": "space",    "cat": "space",    "emoji": "🪐", "label": "Earn Ink in space",             "base": 300,  "per": 100 },
    { "k": "inkborn",  "cat": "inkborn",  "emoji": "🐾", "label": "Earn Ink with Inkborn",         "base": 300,  "per": 100 }
  ],
  "battle": { "hours": 24, "pending_hours": 24, "win_ink": 120, "lose_ink": 40, "win_xp": 1500, "lose_xp": 400 },
  "season": [ { "top": 1, "ink": 300 }, { "top": 3, "ink": 200 }, { "top": 10, "ink": 100 }, { "top": 25, "ink": 50 } ],
  "perks": [
    { "level": 1,  "emoji": "🏰", "text": "A clan hall, clan chat and 3 weekly goals" },
    { "level": 2,  "emoji": "🛋️", "text": "More hall furniture" },
    { "level": 4,  "emoji": "🎯", "text": "A 4th weekly goal" },
    { "level": 5,  "emoji": "✨", "text": "Fancy hall furniture" },
    { "level": 8,  "emoji": "🎯", "text": "A 5th weekly goal" },
    { "level": 10, "emoji": "👑", "text": "Everything for the hall" }
  ]
}$cfg$::jsonb, 'Clans: founding, members, levels, weekly goals, battles and seasons')
on conflict (key) do nothing;

-- ---- tables -------------------------------------------------------------------------------------------------------
create table if not exists public.clans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tag text not null,
  emblem text not null,
  color text not null,
  motto text,
  privacy text not null default 'open' check (privacy in ('open', 'request', 'invite')),
  leader_id uuid references public.players (id) on delete set null,
  xp bigint not null default 0,
  hall_name text,
  hall_style jsonb not null default '{}'::jsonb,
  hall_layout jsonb not null default '[]'::jsonb,
  wins int not null default 0,
  losses int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists clans_name_key on public.clans (lower(name));
create unique index if not exists clans_tag_key on public.clans (upper(tag));

create table if not exists public.clan_members (
  player_id uuid primary key references public.players (id) on delete cascade,
  clan_id uuid not null references public.clans (id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'officer', 'member')),
  joined_at timestamptz not null default now()
);
create index if not exists clan_members_clan_idx on public.clan_members (clan_id, joined_at);

/** when you last left (or were removed from) a clan: there's a wait before you join another */
create table if not exists public.clan_left (
  player_id uuid primary key references public.players (id) on delete cascade,
  clan_id uuid,
  left_at timestamptz not null default now()
);

/** invites (an officer asked a player) and requests (a player asked a clan) */
create table if not exists public.clan_asks (
  id bigserial primary key,
  clan_id uuid not null references public.clans (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null check (kind in ('invite', 'request')),
  by_id uuid references public.players (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (clan_id, player_id)
);
create index if not exists clan_asks_player_idx on public.clan_asks (player_id, created_at desc);

create table if not exists public.clan_chat (
  id bigserial primary key,
  clan_id uuid not null references public.clans (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists clan_chat_idx on public.clan_chat (clan_id, id desc);

/** what happened lately: joins, goals done, battles, level-ups */
create table if not exists public.clan_feed (
  id bigserial primary key,
  clan_id uuid not null references public.clans (id) on delete cascade,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists clan_feed_idx on public.clan_feed (clan_id, id desc);

/** a clan's week: its goals (picked when the week starts), progress on each, and its score (Ink earned) */
create table if not exists public.clan_weeks (
  clan_id uuid not null references public.clans (id) on delete cascade,
  week date not null,
  goals jsonb not null default '[]'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  score bigint not null default 0,
  primary key (clan_id, week)
);
create index if not exists clan_weeks_board_idx on public.clan_weeks (week, score desc);

/** what each member did for their clan each week */
create table if not exists public.clan_contrib (
  player_id uuid not null references public.players (id) on delete cascade,
  clan_id uuid not null references public.clans (id) on delete cascade,
  week date not null,
  ink bigint not null default 0,
  secs int not null default 0,
  primary key (player_id, clan_id, week)
);

create table if not exists public.clan_battles (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references public.clans (id) on delete cascade,
  b uuid not null references public.clans (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'live', 'done', 'declined', 'expired')),
  by_id uuid references public.players (id) on delete set null,
  created_at timestamptz not null default now(),
  starts_at timestamptz,
  ends_at timestamptz,
  a_score bigint not null default 0,
  b_score bigint not null default 0,
  winner uuid,
  check (a <> b)
);
create index if not exists clan_battles_a_idx on public.clan_battles (a, created_at desc);
create index if not exists clan_battles_b_idx on public.clan_battles (b, created_at desc);

create table if not exists public.clan_battle_contrib (
  battle_id uuid not null references public.clan_battles (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  clan_id uuid not null,
  ink bigint not null default 0,
  primary key (battle_id, player_id)
);

/** rewards collected: 'goal:<clan>:<week>:<n>', 'battle:<id>', 'season:<week>' */
create table if not exists public.clan_claims (
  player_id uuid not null references public.players (id) on delete cascade,
  key text not null,
  ink int not null default 0,
  created_at timestamptz not null default now(),
  primary key (player_id, key)
);

do $$
declare t text;
begin
  foreach t in array array['clans', 'clan_members', 'clan_left', 'clan_asks', 'clan_chat', 'clan_feed', 'clan_weeks', 'clan_contrib',
                           'clan_battles', 'clan_battle_contrib', 'clan_claims'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- the house room system (presence, party games, room chat) now also runs clan halls, keyed by the clan's id
alter table public.home_presence drop constraint if exists home_presence_host_id_fkey;
alter table public.home_games drop constraint if exists home_games_home_id_fkey;
alter table public.home_chat drop constraint if exists home_chat_home_id_fkey;

-- ---- helpers ------------------------------------------------------------------------------------------------------
create or replace function private.clan_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('clans'), '{}'::jsonb) $$;
create or replace function private.clan_week(p_at timestamptz default now()) returns date language sql stable as $$
  select date_trunc('week', p_at at time zone 'utc')::date
$$;
create or replace function private.clan_level(p_xp bigint) returns jsonb language plpgsql stable as $$
declare c jsonb := coalesce(private.clan_cfg() -> 'level', '{}'::jsonb); v_lv int := 1; v_need numeric; v_at numeric := 0;
  v_max int := coalesce((c ->> 'max')::int, 30); v_base numeric := coalesce((c ->> 'base')::numeric, 2000); v_g numeric := coalesce((c ->> 'growth')::numeric, 1.35);
begin
  loop
    v_need := round(v_base * power(v_g, v_lv - 1));
    exit when v_lv >= v_max or p_xp < v_at + v_need;
    v_at := v_at + v_need; v_lv := v_lv + 1;
  end loop;
  return jsonb_build_object('level', v_lv, 'xp', p_xp, 'into', p_xp - v_at, 'need', case when v_lv >= v_max then 0 else v_need end, 'max', v_lv >= v_max);
end $$;
create or replace function private.clan_lv(p_xp bigint) returns int language sql stable as $$ select (private.clan_level(p_xp) ->> 'level')::int $$;
create or replace function private.clan_cap(p_lv int) returns int language sql stable as $$
  select least(coalesce((c ->> 'max')::int, 60), coalesce((c ->> 'base')::int, 20) + coalesce((c ->> 'per_level')::int, 2) * (p_lv - 1))
  from (select private.clan_cfg() -> 'members' c) s
$$;
/** the clan level a piece of furniture needs for the hall: free pieces straight away, dearer pieces later */
create or replace function private.clan_item_level(p_item jsonb) returns int language sql immutable as $$
  select case
    when p_item is null then 99
    when coalesce((p_item -> 'price' ->> 'ink')::int, 0) = 0 and coalesce((p_item -> 'price' ->> 'tickets')::int, 0) = 0 then 1
    when coalesce((p_item -> 'price' ->> 'tickets')::int, 0) > 0 then least(10, 5 + (coalesce((p_item -> 'price' ->> 'tickets')::int, 0) / 40))
    else least(10, 2 + (coalesce((p_item -> 'price' ->> 'ink')::int, 0) / 150)) end
$$;
create or replace function private.clan_role(p_uid uuid, p_clan uuid) returns text language sql stable as $$
  select role from public.clan_members where player_id = p_uid and clan_id = p_clan
$$;
create or replace function private.clan_require(p_uid uuid, p_officer boolean default false) returns public.clan_members language plpgsql as $$
declare m public.clan_members%rowtype;
begin
  select * into m from public.clan_members where player_id = p_uid;
  if not found then raise exception 'not_in_clan' using errcode = 'P0001'; end if;
  if p_officer and m.role not in ('leader', 'officer') then raise exception 'clan_officers_only' using errcode = 'P0001'; end if;
  return m;
end $$;
create or replace function private.clan_feed_add(p_clan uuid, p_kind text, p_data jsonb) returns void language sql as $$
  insert into public.clan_feed (clan_id, kind, data) values (p_clan, p_kind, coalesce(p_data, '{}'::jsonb));
  delete from public.clan_feed where clan_id = p_clan and id < (select min(id) from (select id from public.clan_feed where clan_id = p_clan order by id desc limit 60) s);
$$;
/** which clan-goal category an Ink grant counts toward */
create or replace function private.clan_cat(p_reason text, p_ref_type text) returns text language sql immutable as $$
  select case
    when p_reason = 'minigame' and p_ref_type = 'home_game' then 'party'
    when p_reason = 'minigame' then 'games'
    when p_reason in ('realm', 'arcade', 'farm', 'business', 'space', 'inkborn') then p_reason
    else 'other' end
$$;

/** the clan's row for this week, made (with its goals) the first time it's needed. Locked for the caller. */
create or replace function private.clan_week_row(p_clan uuid) returns public.clan_weeks language plpgsql as $$
declare w public.clan_weeks%rowtype; c jsonb := private.clan_cfg(); v_week date := private.clan_week(); v_lv int; v_n int; v_members int;
  v_goals jsonb := '[]'::jsonb; g jsonb; v_more int;
begin
  select * into w from public.clan_weeks where clan_id = p_clan and week = v_week for update;
  if found then return w; end if;
  select private.clan_lv(xp) into v_lv from public.clans where id = p_clan;
  select count(*) into v_members from public.clan_members where clan_id = p_clan;
  select count(*) into v_more from jsonb_array_elements_text(coalesce(c -> 'goals_more_at', '[]'::jsonb)) x where v_lv >= x::int;
  v_n := coalesce((c ->> 'goals_base')::int, 3) + v_more;
  -- always "earn Ink together" and "hang out in the hall", then a different mix of the rest each week
  for g in
    select e from jsonb_array_elements(coalesce(c -> 'goals', '[]'::jsonb)) with ordinality t(e, n)
     order by case e ->> 'k' when 'ink' then 0 when 'hall' then 1 else 2 end, md5(p_clan::text || v_week::text || (e ->> 'k'))
     limit v_n
  loop
    v_goals := v_goals || jsonb_build_array(jsonb_build_object('k', g ->> 'k', 'cat', g ->> 'cat', 'emoji', g ->> 'emoji', 'label', g ->> 'label',
      'unit', coalesce(g ->> 'unit', 'ink'),
      'target', (g ->> 'base')::int + (g ->> 'per')::int * greatest(1, v_members)));
  end loop;
  insert into public.clan_weeks (clan_id, week, goals) values (p_clan, v_week, v_goals) on conflict do nothing;
  select * into w from public.clan_weeks where clan_id = p_clan and week = v_week for update;
  return w;
end $$;

/** a member did something for the clan: p_amount Ink earned in category p_cat (or, for 'hall', seconds hanging out) */
create or replace function private.clan_credit(p_player uuid, p_cat text, p_amount bigint) returns void language plpgsql as $$
declare m public.clan_members%rowtype; w public.clan_weeks%rowtype; g jsonb; i int; v_old numeric; v_new numeric; v_t numeric;
  v_ink boolean := p_cat <> 'hall'; c jsonb := private.clan_cfg(); v_lv0 int; v_lv1 int; v_xp bigint := 0; v_gxp int;
begin
  if p_amount is null or p_amount <= 0 then return; end if;
  select * into m from public.clan_members where player_id = p_player;
  if not found then return; end if;
  w := private.clan_week_row(m.clan_id);
  select private.clan_lv(xp) into v_lv0 from public.clans where id = m.clan_id;
  v_gxp := coalesce((c -> 'goal_reward' ->> 'xp')::int, 400);
  for i in 0 .. jsonb_array_length(w.goals) - 1 loop
    g := w.goals -> i;
    if (g ->> 'cat') = p_cat or ((g ->> 'cat') = 'ink' and v_ink) then
      v_old := coalesce((w.progress ->> i::text)::numeric, 0); v_new := v_old + p_amount; v_t := (g ->> 'target')::numeric;
      w.progress := jsonb_set(w.progress, array[i::text], to_jsonb(least(v_new, v_t * 10)));
      if v_old < v_t and v_new >= v_t then
        v_xp := v_xp + v_gxp;
        perform private.clan_feed_add(m.clan_id, 'goal', jsonb_build_object('label', g ->> 'label', 'emoji', g ->> 'emoji', 'by', p_player));
      end if;
    end if;
  end loop;
  if v_ink then v_xp := v_xp + p_amount; end if;
  update public.clan_weeks set progress = w.progress, score = score + case when v_ink then p_amount else 0 end where clan_id = w.clan_id and week = w.week;
  update public.clans set xp = xp + v_xp where id = m.clan_id returning private.clan_lv(xp) into v_lv1;
  if v_lv1 > v_lv0 then perform private.clan_feed_add(m.clan_id, 'level', jsonb_build_object('level', v_lv1)); end if;
  insert into public.clan_contrib (player_id, clan_id, week, ink, secs)
  values (p_player, m.clan_id, w.week, case when v_ink then p_amount else 0 end, case when v_ink then 0 else least(p_amount, 100000) end)
  on conflict (player_id, clan_id, week) do update set ink = clan_contrib.ink + excluded.ink, secs = clan_contrib.secs + excluded.secs;
  -- a battle on? the Ink counts there too
  if v_ink then
    for g in select to_jsonb(bx) from public.clan_battles bx where bx.status = 'live' and now() < bx.ends_at and m.clan_id in (bx.a, bx.b) loop
      update public.clan_battles set a_score = a_score + case when a = m.clan_id then p_amount else 0 end,
                                     b_score = b_score + case when b = m.clan_id then p_amount else 0 end
       where id = (g ->> 'id')::uuid;
      insert into public.clan_battle_contrib (battle_id, player_id, clan_id, ink) values ((g ->> 'id')::uuid, p_player, m.clan_id, p_amount)
      on conflict (battle_id, player_id) do update set ink = clan_battle_contrib.ink + excluded.ink;
    end loop;
  end if;
end $$;

/** close finished battles (and challenges nobody answered) for a clan */
create or replace function private.clan_settle(p_clan uuid) returns void language plpgsql as $$
declare bt public.clan_battles%rowtype; c jsonb := private.clan_cfg() -> 'battle'; v_w uuid; v_l uuid;
begin
  update public.clan_battles set status = 'expired'
   where status = 'pending' and p_clan in (a, b) and created_at < now() - make_interval(hours => coalesce((c ->> 'pending_hours')::int, 24));
  for bt in select * from public.clan_battles where status = 'live' and ends_at <= now() and p_clan in (a, b) for update skip locked loop
    v_w := case when bt.a_score > bt.b_score then bt.a when bt.b_score > bt.a_score then bt.b end;
    update public.clan_battles set status = 'done', winner = v_w where id = bt.id;
    if v_w is not null then
      v_l := case when v_w = bt.a then bt.b else bt.a end;
      update public.clans set wins = wins + 1, xp = xp + coalesce((c ->> 'win_xp')::int, 1500) where id = v_w;
      update public.clans set losses = losses + 1, xp = xp + coalesce((c ->> 'lose_xp')::int, 400) where id = v_l;
    else
      update public.clans set xp = xp + coalesce((c ->> 'lose_xp')::int, 400) where id in (bt.a, bt.b);
    end if;
    perform private.clan_feed_add(bt.a, 'battle_end', jsonb_build_object('battle', bt.id, 'won', v_w = bt.a, 'tie', v_w is null, 'vs', bt.b));
    perform private.clan_feed_add(bt.b, 'battle_end', jsonb_build_object('battle', bt.id, 'won', v_w = bt.b, 'tie', v_w is null, 'vs', bt.a));
  end loop;
end $$;

create or replace function private.clan_card(p_clan uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'tag', c.tag, 'emblem', c.emblem, 'color', c.color, 'motto', c.motto, 'privacy', c.privacy,
    'level', private.clan_lv(c.xp), 'xp', c.xp, 'wins', c.wins, 'losses', c.losses,
    'members', (select count(*) from public.clan_members where clan_id = c.id),
    'cap', private.clan_cap(private.clan_lv(c.xp)),
    'week_score', coalesce((select score from public.clan_weeks where clan_id = c.id and week = private.clan_week()), 0),
    'in_hall', (select count(*) from public.home_presence where host_id = c.id and seen_at > now() - interval '12 seconds'))
  from public.clans c where c.id = p_clan
$$;

create or replace function private.clan_battle_json(b public.clan_battles, p_clan uuid, p_uid uuid) returns jsonb language plpgsql stable as $$
declare v_us boolean := b.a = p_clan; c jsonb := private.clan_cfg() -> 'battle'; v_mine bigint; v_claim text;
begin
  select ink into v_mine from public.clan_battle_contrib where battle_id = b.id and player_id = p_uid and clan_id = p_clan;
  v_claim := case when b.status = 'done' and coalesce(v_mine, 0) > 0
                   and not exists (select 1 from public.clan_claims where player_id = p_uid and key = 'battle:' || b.id)
                  then 'battle:' || b.id end;
  return jsonb_build_object('id', b.id, 'status', b.status, 'challenger', v_us, 'by', b.by_id, 'created_at', b.created_at,
    'starts_at', b.starts_at, 'ends_at', b.ends_at,
    'us', case when v_us then b.a_score else b.b_score end, 'them', case when v_us then b.b_score else b.a_score end,
    'won', case when b.status = 'done' then (b.winner = p_clan) end, 'tie', b.status = 'done' and b.winner is null,
    'vs', private.clan_card(case when v_us then b.b else b.a end),
    'mine', coalesce(v_mine, 0), 'claim', v_claim,
    'claim_ink', case when b.winner = p_clan then coalesce((c ->> 'win_ink')::int, 120) else coalesce((c ->> 'lose_ink')::int, 40) end);
end $$;

/** season (weekly) rank of a clan for a week; null if it scored nothing */
create or replace function private.clan_rank(p_clan uuid, p_week date) returns int language sql stable as $$
  select r::int from (select clan_id, rank() over (order by score desc) r from public.clan_weeks where week = p_week and score > 0) s where clan_id = p_clan
$$;
create or replace function private.clan_season_ink(p_rank int) returns int language sql stable as $$
  select coalesce((select (e ->> 'ink')::int from jsonb_array_elements(private.clan_cfg() -> 'season') e
                    where p_rank is not null and p_rank <= (e ->> 'top')::int order by (e ->> 'top')::int limit 1), 0)
$$;

/** the goals of a week, with progress and what this player can collect */
create or replace function private.clan_goals_json(p_clan uuid, p_week date, p_uid uuid) returns jsonb language plpgsql stable as $$
declare w public.clan_weeks%rowtype; c jsonb := private.clan_cfg(); v_help boolean; ct public.clan_contrib%rowtype; v_out jsonb := '[]'::jsonb; i int; g jsonb;
  v_p numeric; v_key text; v_ink int; v_lv int;
begin
  select * into w from public.clan_weeks where clan_id = p_clan and week = p_week;
  if not found then return '[]'::jsonb; end if;
  select private.clan_lv(xp) into v_lv from public.clans where id = p_clan;
  select * into ct from public.clan_contrib where player_id = p_uid and clan_id = p_clan and week = p_week;
  v_help := coalesce(ct.ink, 0) >= coalesce((c -> 'goal_min_help' ->> 'ink')::int, 1) or coalesce(ct.secs, 0) >= coalesce((c -> 'goal_min_help' ->> 'secs')::int, 60);
  v_ink := round(coalesce((c -> 'goal_reward' ->> 'ink')::int, 60) * (1 + coalesce((c -> 'goal_reward' ->> 'per_level')::numeric, 0.05) * (v_lv - 1)));
  for i in 0 .. jsonb_array_length(w.goals) - 1 loop
    g := w.goals -> i; v_p := coalesce((w.progress ->> i::text)::numeric, 0);
    v_key := 'goal:' || p_clan || ':' || p_week || ':' || i;
    v_out := v_out || jsonb_build_array(g || jsonb_build_object('n', i, 'progress', least(v_p, (g ->> 'target')::numeric), 'done', v_p >= (g ->> 'target')::numeric,
      'reward', v_ink,
      'claimed', exists (select 1 from public.clan_claims where player_id = p_uid and key = v_key),
      'claim', case when v_p >= (g ->> 'target')::numeric and v_help and not exists (select 1 from public.clan_claims where player_id = p_uid and key = v_key) then v_key end));
  end loop;
  return v_out;
end $$;

-- ---- reading ------------------------------------------------------------------------------------------------------
/** your clan (or none), your invites, and what founding one takes */
create or replace function public.clan_home() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype; c jsonb := private.clan_cfg(); v_wait timestamptz;
begin
  select * into m from public.clan_members where player_id = v_uid;
  select left_at + make_interval(hours => coalesce((c ->> 'rejoin_hours')::int, 12)) into v_wait from public.clan_left where player_id = v_uid;
  return jsonb_build_object(
    'clan', case when m.clan_id is not null then private.clan_card(m.clan_id) || jsonb_build_object('role', m.role) end,
    'invites', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'clan', private.clan_card(a.clan_id), 'by', private.profile_json(a.by_id), 'created_at', a.created_at) order by a.created_at desc), '[]'::jsonb)
                from public.clan_asks a where a.player_id = v_uid and a.kind = 'invite'),
    'requests', (select coalesce(jsonb_agg(a.clan_id), '[]'::jsonb) from public.clan_asks a where a.player_id = v_uid and a.kind = 'request'),
    'rejoin_at', case when v_wait > now() then v_wait end,
    'cfg', jsonb_build_object('found_cost', coalesce((c ->> 'found_cost')::int, 1000), 'emblems', c -> 'emblems', 'colors', c -> 'colors', 'perks', c -> 'perks',
                              'season', c -> 'season', 'battle', c -> 'battle'));
end $$;

/** browse clans: search by name or tag, or the busiest this week */
create or replace function public.clan_list(p_q text default null, p_sort text default 'week') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  perform private.rate_limit('clan_list', 600, 3600);
  return (select coalesce(jsonb_agg(private.clan_card(s.id) order by s.o1 desc, s.o2 desc), '[]'::jsonb) from (
    select c.id, case p_sort when 'level' then c.xp when 'new' then extract(epoch from c.created_at)::bigint
                             else coalesce((select score from public.clan_weeks w where w.clan_id = c.id and w.week = private.clan_week()), 0) end o1,
           c.xp o2
      from public.clans c
     where v_q is null or c.name ilike '%' || replace(replace(v_q, '%', ''), '_', '\_') || '%' or upper(c.tag) = upper(v_q)
     order by 2 desc, 3 desc limit 50) s);
end $$;

/** the weekly leaderboard (this week or last), or the all-time one by level */
create or replace function public.clan_board(p_kind text default 'week') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_week date := private.clan_week() - case when p_kind = 'last' then 7 else 0 end;
  v_mine uuid := (select clan_id from public.clan_members where player_id = v_uid);
begin
  if p_kind = 'level' then
    return jsonb_build_object('kind', p_kind, 'rows', (select coalesce(jsonb_agg(private.clan_card(id) || jsonb_build_object('rank', r) order by r), '[]'::jsonb)
      from (select id, rank() over (order by xp desc, created_at) r from public.clans order by xp desc, created_at limit 50) s),
      'mine', case when v_mine is not null then (select count(*) + 1 from public.clans where xp > (select xp from public.clans where id = v_mine)) end);
  end if;
  return jsonb_build_object('kind', p_kind, 'week', v_week, 'ends_at', (v_week + 7)::timestamp at time zone 'utc',
    'rows', (select coalesce(jsonb_agg(private.clan_card(clan_id) || jsonb_build_object('rank', r, 'score', score, 'prize', private.clan_season_ink(r::int)) order by r), '[]'::jsonb)
      from (select clan_id, score, rank() over (order by score desc) r from public.clan_weeks where week = v_week and score > 0 order by score desc limit 50) s),
    'mine', case when v_mine is not null then private.clan_rank(v_mine, v_week) end);
end $$;

/** a clan's page: members see everything; others see the card, members and record */
create or replace function public.clan_get(p_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_id uuid; v_role text; cl public.clans%rowtype; v_week date := private.clan_week();
  v_out jsonb; v_last int; v_skey text;
begin
  v_id := coalesce(p_id, (select clan_id from public.clan_members where player_id = v_uid));
  if v_id is null then raise exception 'not_in_clan' using errcode = 'P0001'; end if;
  perform private.clan_settle(v_id);
  select * into cl from public.clans where id = v_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_role := private.clan_role(v_uid, v_id);
  v_out := private.clan_card(v_id) || jsonb_build_object(
    'role', v_role, 'leader', cl.leader_id, 'created_at', cl.created_at, 'level_info', private.clan_level(cl.xp),
    'members_list', (select coalesce(jsonb_agg(private.profile_json(m.player_id) || jsonb_build_object('role', m.role, 'joined_at', m.joined_at,
                       'explorer_style', (select explorer_style from public.profiles where id = m.player_id),
                       'week_ink', coalesce(ct.ink, 0), 'week_secs', coalesce(ct.secs, 0),
                       'in_hall', exists (select 1 from public.home_presence p where p.player_id = m.player_id and p.host_id = v_id and p.seen_at > now() - interval '12 seconds'))
                       order by case m.role when 'leader' then 0 when 'officer' then 1 else 2 end, coalesce(ct.ink, 0) desc, m.joined_at), '[]'::jsonb)
                     from public.clan_members m left join public.clan_contrib ct on ct.player_id = m.player_id and ct.clan_id = v_id and ct.week = v_week
                     where m.clan_id = v_id),
    'asked', exists (select 1 from public.clan_asks where clan_id = v_id and player_id = v_uid and kind = 'request'),
    'invited', (select id from public.clan_asks where clan_id = v_id and player_id = v_uid and kind = 'invite'),
    'season_rank', private.clan_rank(v_id, v_week),
    'recent_battles', (select coalesce(jsonb_agg(private.clan_battle_json(bx, v_id, v_uid) order by bx.created_at desc), '[]'::jsonb)
                       from public.clan_battles bx where bx.id in (select id from public.clan_battles where v_id in (a, b) and status in ('done', 'live') order by created_at desc limit 8)));
  if v_role is null then return v_out; end if;
  -- members only from here
  perform private.clan_week_row(v_id);
  v_last := private.clan_rank(v_id, v_week - 7);
  v_skey := 'season:' || (v_week - 7);
  return v_out || jsonb_build_object(
    'hall', jsonb_build_object('name', cl.hall_name, 'style', cl.hall_style, 'layout', cl.hall_layout),
    'week', v_week, 'week_ends', (v_week + 7)::timestamp at time zone 'utc',
    'goals', private.clan_goals_json(v_id, v_week, v_uid),
    'last_goals', (select coalesce(jsonb_agg(g), '[]'::jsonb) from jsonb_array_elements(private.clan_goals_json(v_id, v_week - 7, v_uid)) g where g ->> 'claim' is not null),
    'season', jsonb_build_object('rank', v_last, 'ink', private.clan_season_ink(v_last),
      'claim', case when private.clan_season_ink(v_last) > 0
                     and exists (select 1 from public.clan_contrib where player_id = v_uid and clan_id = v_id and week = v_week - 7 and ink > 0)
                     and not exists (select 1 from public.clan_claims where player_id = v_uid and key = v_skey) then v_skey end),
    'me', (select jsonb_build_object('week_ink', coalesce(ink, 0), 'week_secs', coalesce(secs, 0)) from (select 1) x
           left join public.clan_contrib on player_id = v_uid and clan_id = v_id and week = v_week),
    'battles', (select coalesce(jsonb_agg(private.clan_battle_json(bx, v_id, v_uid) order by bx.created_at desc), '[]'::jsonb)
                from public.clan_battles bx where bx.id in (select id from public.clan_battles where v_id in (a, b) and (status in ('pending', 'live') or (status = 'done' and ends_at > now() - interval '14 days'))
                      order by created_at desc limit 12)),
    'requests', case when v_role in ('leader', 'officer') then
                  (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'player', private.profile_json(a.player_id), 'created_at', a.created_at) order by a.created_at), '[]'::jsonb)
                   from public.clan_asks a where a.clan_id = v_id and a.kind = 'request') end,
    'invites_out', case when v_role in ('leader', 'officer') then
                  (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'player', private.profile_json(a.player_id), 'created_at', a.created_at) order by a.created_at), '[]'::jsonb)
                   from public.clan_asks a where a.clan_id = v_id and a.kind = 'invite') end,
    'feed', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'data', f.data, 'created_at', f.created_at,
                     'who', case when f.data ? 'by' then private.profile_json((f.data ->> 'by')::uuid) end,
                     'vs', case when f.data ? 'vs' then private.clan_card((f.data ->> 'vs')::uuid) end) order by f.id desc), '[]'::jsonb)
             from (select * from public.clan_feed where clan_id = v_id order by id desc limit 25) f),
    'catalog', private.home_cfg() - 'room_size' - 'stale_seconds',
    'unlocks', (select coalesce(jsonb_object_agg(key, private.clan_item_level(value)), '{}'::jsonb) from jsonb_each(coalesce(private.home_cfg() -> 'items', '{}'::jsonb))));
end $$;

-- ---- founding, joining, leaving -----------------------------------------------------------------------------------
create or replace function private.clan_can_join(p_uid uuid) returns void language plpgsql as $$
declare v_at timestamptz;
begin
  if exists (select 1 from public.clan_members where player_id = p_uid) then raise exception 'already_in_clan' using errcode = 'P0001'; end if;
  select left_at + make_interval(hours => coalesce((private.clan_cfg() ->> 'rejoin_hours')::int, 12)) into v_at from public.clan_left where player_id = p_uid;
  if v_at > now() then raise exception 'clan_rejoin_wait' using errcode = 'P0001', detail = v_at::text; end if;
end $$;

create or replace function private.clan_add(p_uid uuid, p_clan uuid, p_role text default 'member') returns void language plpgsql as $$
declare v_n int; v_cap int;
begin
  perform 1 from public.clans where id = p_clan for update;
  select count(*) into v_n from public.clan_members where clan_id = p_clan;
  select private.clan_cap(private.clan_lv(xp)) into v_cap from public.clans where id = p_clan;
  if v_n >= v_cap then raise exception 'clan_full' using errcode = 'P0001'; end if;
  insert into public.clan_members (player_id, clan_id, role) values (p_uid, p_clan, p_role);
  delete from public.clan_asks where player_id = p_uid;
  perform private.clan_feed_add(p_clan, 'join', jsonb_build_object('by', p_uid));
end $$;

create or replace function private.clan_text(p_v text, p_min int, p_max int, p_err text) returns text language plpgsql stable as $$
declare v text := nullif(btrim(regexp_replace(coalesce(p_v, ''), '\s+', ' ', 'g')), '');
begin
  if v is null then if p_min = 0 then return null; end if; raise exception '%', p_err using errcode = 'P0001'; end if;
  if char_length(v) < p_min or char_length(v) > p_max then raise exception '%', p_err using errcode = 'P0001'; end if;
  begin v := private.chat_clean(v); exception when others then raise exception '%', p_err using errcode = 'P0001'; end;
  if position('*' in v) > 0 then raise exception '%', p_err using errcode = 'P0001'; end if;
  return v;
end $$;

create or replace function public.clan_found(p_name text, p_tag text, p_emblem text, p_color text, p_motto text default null, p_privacy text default 'open') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.clan_cfg(); v_name text; v_tag text; v_motto text; v_id uuid;
  v_cost int := coalesce((c ->> 'found_cost')::int, 1000);
begin
  perform private.rate_limit('clan_found', 10, 3600);
  perform pg_advisory_xact_lock(hashtext('clan-player:' || v_uid));
  perform private.clan_can_join(v_uid);
  v_name := private.clan_text(p_name, 3, 24, 'invalid_clan_name');
  v_tag := upper(btrim(coalesce(p_tag, '')));
  if v_tag !~ '^[A-Z0-9]{2,5}$' then raise exception 'invalid_clan_tag' using errcode = 'P0001'; end if;
  perform private.clan_text(v_tag, 2, 5, 'invalid_clan_tag');
  v_motto := private.clan_text(p_motto, 0, 80, 'invalid_clan_motto');
  if not (coalesce(c -> 'emblems', '[]'::jsonb) ? coalesce(p_emblem, '')) then raise exception 'invalid_clan_emblem' using errcode = 'P0001'; end if;
  if not (coalesce(c -> 'colors', '[]'::jsonb) ? upper(coalesce(p_color, ''))) and not (coalesce(c -> 'colors', '[]'::jsonb) ? coalesce(p_color, '')) then raise exception 'invalid_clan_color' using errcode = 'P0001'; end if;
  if p_privacy not in ('open', 'request', 'invite') then raise exception 'invalid_privacy' using errcode = 'P0001'; end if;
  if exists (select 1 from public.clans where lower(name) = lower(v_name)) then raise exception 'clan_name_taken' using errcode = 'P0001'; end if;
  if exists (select 1 from public.clans where upper(tag) = v_tag) then raise exception 'clan_tag_taken' using errcode = 'P0001'; end if;
  v_id := gen_random_uuid();
  perform private.charge(v_uid, jsonb_build_object('ink', v_cost), 'clan_found', 'clan', v_id::text, 'clan-found:' || v_id);
  insert into public.clans (id, name, tag, emblem, color, motto, privacy, leader_id) values (v_id, v_name, v_tag, p_emblem, p_color, v_motto, p_privacy, v_uid);
  insert into public.clan_members (player_id, clan_id, role) values (v_uid, v_id, 'leader');
  delete from public.clan_asks where player_id = v_uid;
  perform private.clan_feed_add(v_id, 'founded', jsonb_build_object('by', v_uid));
  return public.clan_get(v_id);
end $$;

create or replace function public.clan_edit(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype; c jsonb := private.clan_cfg();
begin
  perform private.rate_limit('clan_edit', 120, 3600);
  m := private.clan_require(v_uid, true);
  if p_patch ? 'emblem' then
    if not (coalesce(c -> 'emblems', '[]'::jsonb) ? (p_patch ->> 'emblem')) then raise exception 'invalid_clan_emblem' using errcode = 'P0001'; end if;
    update public.clans set emblem = p_patch ->> 'emblem' where id = m.clan_id;
  end if;
  if p_patch ? 'color' then
    if not (coalesce(c -> 'colors', '[]'::jsonb) ? (p_patch ->> 'color')) then raise exception 'invalid_clan_color' using errcode = 'P0001'; end if;
    update public.clans set color = p_patch ->> 'color' where id = m.clan_id;
  end if;
  if p_patch ? 'motto' then update public.clans set motto = private.clan_text(p_patch ->> 'motto', 0, 80, 'invalid_clan_motto') where id = m.clan_id; end if;
  if p_patch ? 'privacy' then
    if m.role <> 'leader' then raise exception 'clan_leader_only' using errcode = 'P0001'; end if;
    if (p_patch ->> 'privacy') not in ('open', 'request', 'invite') then raise exception 'invalid_privacy' using errcode = 'P0001'; end if;
    update public.clans set privacy = p_patch ->> 'privacy' where id = m.clan_id;
  end if;
  return public.clan_get(m.clan_id);
end $$;

/** join an open clan; ask to join a request clan; accept an invite you've had from any clan */
create or replace function public.clan_join(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); cl public.clans%rowtype;
begin
  perform private.rate_limit('clan_join', 60, 3600);
  perform pg_advisory_xact_lock(hashtext('clan-player:' || v_uid));
  select * into cl from public.clans where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.clan_can_join(v_uid);
  if exists (select 1 from public.clan_asks where clan_id = p_id and player_id = v_uid and kind = 'invite') or cl.privacy = 'open' then
    perform private.clan_add(v_uid, p_id);
    return jsonb_build_object('joined', true, 'clan', public.clan_get(p_id));
  end if;
  if cl.privacy = 'invite' then raise exception 'clan_invite_only' using errcode = 'P0001'; end if;
  if (select count(*) from public.clan_asks where player_id = v_uid and kind = 'request') >= 5 then raise exception 'too_many_requests' using errcode = 'P0001'; end if;
  insert into public.clan_asks (clan_id, player_id, kind, by_id) values (p_id, v_uid, 'request', v_uid) on conflict (clan_id, player_id) do nothing;
  return jsonb_build_object('joined', false, 'asked', true);
end $$;

create or replace function public.clan_invite(p_username text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype; v_to uuid;
begin
  perform private.rate_limit('clan_invite', 60, 3600);
  m := private.clan_require(v_uid, true);
  select id into v_to from public.profiles where lower(username) = lower(btrim(coalesce(p_username, ''), ' @'));
  if v_to is null or not private.visible_to(v_to, v_uid) or exists (select 1 from public.player_blocks where blocker_id = v_to and blocked_id = v_uid) then
    raise exception 'player_not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.clan_members where player_id = v_to) then raise exception 'already_in_clan' using errcode = 'P0001'; end if;
  insert into public.clan_asks (clan_id, player_id, kind, by_id) values (m.clan_id, v_to, 'invite', v_uid)
  on conflict (clan_id, player_id) do update set kind = 'invite', by_id = excluded.by_id, created_at = now();
  return jsonb_build_object('invited', private.profile_json(v_to));
end $$;

/** an officer answers a request to join, or a player answers an invite (yes = join) */
create or replace function public.clan_answer(p_ask bigint, p_yes boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); a public.clan_asks%rowtype;
begin
  perform private.rate_limit('clan_answer', 240, 3600);
  select * into a from public.clan_asks where id = p_ask;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if a.kind = 'invite' then
    if a.player_id <> v_uid then raise exception 'not_found' using errcode = 'P0001'; end if;
    if not p_yes then delete from public.clan_asks where id = a.id; return jsonb_build_object('joined', false); end if;
    return public.clan_join(a.clan_id);
  end if;
  -- a request: officers of that clan decide (officers can also take back an invite they sent the same way)
  if private.clan_role(v_uid, a.clan_id) not in ('leader', 'officer') or private.clan_role(v_uid, a.clan_id) is null then raise exception 'clan_officers_only' using errcode = 'P0001'; end if;
  delete from public.clan_asks where id = a.id;
  if p_yes then
    perform pg_advisory_xact_lock(hashtext('clan-player:' || a.player_id));
    perform private.clan_can_join(a.player_id);
    perform private.clan_add(a.player_id, a.clan_id);
  end if;
  return public.clan_get(a.clan_id);
end $$;

/** officers can take back an invite */
create or replace function public.clan_uninvite(p_ask bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype;
begin
  m := private.clan_require(v_uid, true);
  delete from public.clan_asks where id = p_ask and clan_id = m.clan_id and kind = 'invite';
  return public.clan_get(m.clan_id);
end $$;

create or replace function private.clan_remove(p_uid uuid, p_clan uuid, p_kind text, p_by uuid) returns void language plpgsql as $$
begin
  delete from public.clan_members where player_id = p_uid and clan_id = p_clan;
  insert into public.clan_left (player_id, clan_id, left_at) values (p_uid, p_clan, now())
  on conflict (player_id) do update set clan_id = excluded.clan_id, left_at = now();
  perform private.clan_feed_add(p_clan, p_kind, jsonb_build_object('by', p_uid, 'who', p_by));
end $$;

/** leave your clan. A leader hands over to the longest-serving officer (or member) first; the last one out closes it */
create or replace function public.clan_leave() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype; v_next uuid;
begin
  perform private.rate_limit('clan_leave', 30, 3600);
  m := private.clan_require(v_uid);
  perform 1 from public.clans where id = m.clan_id for update;
  if m.role = 'leader' then
    select player_id into v_next from public.clan_members where clan_id = m.clan_id and player_id <> v_uid
     order by case role when 'officer' then 0 else 1 end, joined_at limit 1;
    if v_next is null then
      delete from public.clans where id = m.clan_id;
      insert into public.clan_left (player_id, clan_id, left_at) values (v_uid, m.clan_id, now() - interval '100 years')
      on conflict (player_id) do update set clan_id = excluded.clan_id, left_at = excluded.left_at;
      return jsonb_build_object('closed', true);
    end if;
    update public.clan_members set role = 'leader' where player_id = v_next;
    update public.clans set leader_id = v_next where id = m.clan_id;
    perform private.clan_feed_add(m.clan_id, 'leader', jsonb_build_object('by', v_next));
  end if;
  perform private.clan_remove(v_uid, m.clan_id, 'left', v_uid);
  return jsonb_build_object('closed', false);
end $$;

create or replace function public.clan_kick(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype; t public.clan_members%rowtype;
begin
  perform private.rate_limit('clan_kick', 60, 3600);
  m := private.clan_require(v_uid, true);
  select * into t from public.clan_members where player_id = p_player and clan_id = m.clan_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if t.role = 'leader' or (t.role = 'officer' and m.role <> 'leader') or t.player_id = v_uid then raise exception 'clan_cant_kick' using errcode = 'P0001'; end if;
  perform private.clan_remove(p_player, m.clan_id, 'kicked', v_uid);
  return public.clan_get(m.clan_id);
end $$;

/** the leader makes officers, makes them members again, or hands the clan to someone ('leader') */
create or replace function public.clan_set_role(p_player uuid, p_role text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype;
begin
  perform private.rate_limit('clan_role', 60, 3600);
  m := private.clan_require(v_uid, true);
  if m.role <> 'leader' then raise exception 'clan_leader_only' using errcode = 'P0001'; end if;
  if p_role not in ('leader', 'officer', 'member') or p_player = v_uid then raise exception 'invalid_role' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.clan_members where player_id = p_player and clan_id = m.clan_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_role = 'leader' then
    update public.clan_members set role = 'officer' where player_id = v_uid;
    update public.clans set leader_id = p_player where id = m.clan_id;
    perform private.clan_feed_add(m.clan_id, 'leader', jsonb_build_object('by', p_player));
  elsif p_role = 'officer' then
    perform private.clan_feed_add(m.clan_id, 'officer', jsonb_build_object('by', p_player));
  end if;
  update public.clan_members set role = p_role where player_id = p_player;
  return public.clan_get(m.clan_id);
end $$;

-- ---- clan chat ----------------------------------------------------------------------------------------------------
create or replace function private.clan_chat_json(m public.clan_chat) returns jsonb language sql stable as $$
  select jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at, 'player', private.profile_json(m.player_id))
$$;

create or replace function public.clan_chat_send(p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype; v_muted timestamptz; v_body text; r public.clan_chat%rowtype;
begin
  if not private.flag('global_chat') then raise exception 'chat_disabled' using errcode = 'P0001'; end if;
  m := private.clan_require(v_uid);
  select chat_muted_until into v_muted from public.players where id = v_uid;
  if v_muted is not null and v_muted > now() then raise exception 'chat_muted' using errcode = 'P0001', detail = v_muted::text; end if;
  perform private.rate_limit('clan_chat_burst', 1, 1);
  perform private.rate_limit('clan_chat', 20, 60);
  perform private.rate_limit('clan_chat_hour', 400, 3600);
  v_body := private.chat_clean(p_body);
  if char_length(v_body) > 200 then raise exception 'chat_too_long' using errcode = 'P0001'; end if;
  insert into public.clan_chat (clan_id, player_id, body) values (m.clan_id, v_uid, v_body) returning * into r;
  delete from public.clan_chat where clan_id = m.clan_id and created_at < now() - interval '14 days';
  return private.clan_chat_json(r);
end $$;

create or replace function public.clan_chat_list(p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype;
begin
  perform private.rate_limit('clan_chat_list', 3000, 3600);
  select * into m from public.clan_members where player_id = v_uid;
  if not found then return jsonb_build_object('items', '[]'::jsonb); end if;
  return jsonb_build_object('items', (select coalesce(jsonb_agg(private.clan_chat_json(c) order by c.id), '[]'::jsonb)
    from (select * from public.clan_chat c where c.clan_id = m.clan_id and c.id > coalesce(p_after, 0)
           and private.visible_to(c.player_id, v_uid) order by c.id desc limit 50) c));
end $$;

-- ---- the hall -----------------------------------------------------------------------------------------------------
create or replace function public.clan_hall_save(p_name text, p_style jsonb, p_layout jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype; c jsonb := private.home_cfg(); v_lv int; e jsonb; v_n int;
  v_layout jsonb; v_name text;
begin
  perform private.rate_limit('clan_hall_save', 240, 3600);
  m := private.clan_require(v_uid, true);
  select private.clan_lv(xp) into v_lv from public.clans where id = m.clan_id;
  -- the same checks as a home's (positions, rotations, colours, how many), but pieces come from the clan's level, not purchases:
  -- check against an empty inventory with every priced piece passed as free, then check levels here
  if p_layout is null or jsonb_typeof(p_layout) <> 'array' then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_layout) > coalesce((c ->> 'max_items')::int, 90) then raise exception 'too_many_items' using errcode = 'P0001'; end if;
  for e in select jsonb_build_object('k', x ->> 'i', 'n', count(*)) from jsonb_array_elements(p_layout) x group by x ->> 'i' loop
    if private.clan_item_level(c -> 'items' -> (e ->> 'k')) > v_lv then raise exception 'clan_item_locked' using errcode = 'P0001', detail = e ->> 'k'; end if;
    v_n := (e ->> 'n')::int;
    if v_n > coalesce((c ->> 'free_each')::int, 6) then raise exception 'too_many_items' using errcode = 'P0001'; end if;
  end loop;
  v_layout := private.home_check_layout(null, (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(p_layout) x
                                               where (c -> 'items' -> (x ->> 'i') -> 'price') = '{}'::jsonb));
  -- priced pieces: same position rules, checked one at a time against a free stand-in
  for e in select x from jsonb_array_elements(p_layout) x where (c -> 'items' -> (x ->> 'i') -> 'price') <> '{}'::jsonb loop
    perform private.home_check_layout(null, jsonb_build_array(e || jsonb_build_object('i', (select key from jsonb_each(c -> 'items') where value -> 'price' = '{}'::jsonb
               and (coalesce(value ->> 'mount', '') = 'wall') = (coalesce(c -> 'items' -> (e ->> 'i') ->> 'mount', '') = 'wall') order by key limit 1))));
    v_layout := v_layout || jsonb_build_array(jsonb_build_object('i', e ->> 'i', 'x', round((e ->> 'x')::numeric, 2), 'z', round((e ->> 'z')::numeric, 2), 'r', coalesce((e ->> 'r')::int, 0))
                 || case when jsonb_typeof(e -> 'c') = 'number' then jsonb_build_object('c', (e ->> 'c')::int) else '{}'::jsonb end);
  end loop;
  v_name := private.clan_text(p_name, 0, 32, 'invalid_name');
  update public.clans set hall_name = v_name, hall_style = private.home_check_style(p_style), hall_layout = v_layout where id = m.clan_id;
  return public.clan_get(m.clan_id);
end $$;

-- ---- rewards ------------------------------------------------------------------------------------------------------
create or replace function public.clan_claim(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype; v_parts text[] := string_to_array(coalesce(p_key, ''), ':');
  v_ink int := 0; g jsonb; bt public.clan_battles%rowtype; v_week date;
begin
  perform private.rate_limit('clan_claim', 240, 3600);
  m := private.clan_require(v_uid);
  perform pg_advisory_xact_lock(hashtext('clan-claim:' || v_uid));
  if exists (select 1 from public.clan_claims where player_id = v_uid and key = p_key) then raise exception 'already_claimed' using errcode = 'P0001'; end if;
  if v_parts[1] = 'goal' and array_length(v_parts, 1) = 4 then
    if v_parts[2] <> m.clan_id::text then raise exception 'not_found' using errcode = 'P0001'; end if;
    v_week := v_parts[3]::date;
    if v_week < private.clan_week() - 7 then raise exception 'claim_expired' using errcode = 'P0001'; end if;
    select e into g from jsonb_array_elements(private.clan_goals_json(m.clan_id, v_week, v_uid)) e where (e ->> 'n') = v_parts[4];
    if g is null or g ->> 'claim' is null then raise exception 'nothing_to_claim' using errcode = 'P0001'; end if;
    v_ink := (g ->> 'reward')::int;
  elsif v_parts[1] = 'battle' and array_length(v_parts, 1) = 2 then
    select * into bt from public.clan_battles where id = v_parts[2]::uuid;
    if not found or bt.status <> 'done' or m.clan_id not in (bt.a, bt.b) then raise exception 'nothing_to_claim' using errcode = 'P0001'; end if;
    g := private.clan_battle_json(bt, m.clan_id, v_uid);
    if g ->> 'claim' is null then raise exception 'nothing_to_claim' using errcode = 'P0001'; end if;
    v_ink := (g ->> 'claim_ink')::int;
  elsif v_parts[1] = 'season' and array_length(v_parts, 1) = 2 then
    v_week := v_parts[2]::date;
    if v_week <> private.clan_week() - 7 then raise exception 'claim_expired' using errcode = 'P0001'; end if;
    if not exists (select 1 from public.clan_contrib where player_id = v_uid and clan_id = m.clan_id and week = v_week and ink > 0) then raise exception 'nothing_to_claim' using errcode = 'P0001'; end if;
    v_ink := private.clan_season_ink(private.clan_rank(m.clan_id, v_week));
    if v_ink <= 0 then raise exception 'nothing_to_claim' using errcode = 'P0001'; end if;
  else
    raise exception 'nothing_to_claim' using errcode = 'P0001';
  end if;
  insert into public.clan_claims (player_id, key, ink) values (v_uid, p_key, v_ink);
  perform private.grant(v_uid, jsonb_build_object('ink', v_ink), 'clan', 'clan', m.clan_id::text, 'clan-claim:' || v_uid || ':' || p_key);
  return jsonb_build_object('ink', v_ink, 'key', p_key);
end $$;

-- ---- clan vs clan -------------------------------------------------------------------------------------------------
create or replace function public.clan_challenge(p_clan uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype;
begin
  perform private.rate_limit('clan_challenge', 30, 3600);
  m := private.clan_require(v_uid, true);
  if p_clan = m.clan_id or not exists (select 1 from public.clans where id = p_clan) then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.clan_settle(m.clan_id); perform private.clan_settle(p_clan);
  perform pg_advisory_xact_lock(hashtext('clan-battle:' || least(m.clan_id::text, p_clan::text) || greatest(m.clan_id::text, p_clan::text)));
  if exists (select 1 from public.clan_battles where status = 'live' and (m.clan_id in (a, b) or p_clan in (a, b))) then raise exception 'clan_in_battle' using errcode = 'P0001'; end if;
  if exists (select 1 from public.clan_battles where status = 'pending' and ((a = m.clan_id and b = p_clan) or (a = p_clan and b = m.clan_id))) then raise exception 'already_challenged' using errcode = 'P0001'; end if;
  if (select count(*) from public.clan_battles where status = 'pending' and a = m.clan_id) >= 3 then raise exception 'too_many_challenges' using errcode = 'P0001'; end if;
  insert into public.clan_battles (a, b, by_id) values (m.clan_id, p_clan, v_uid);
  perform private.clan_feed_add(p_clan, 'challenged', jsonb_build_object('vs', m.clan_id));
  return public.clan_get(m.clan_id);
end $$;

/** the challenged clan's officers say yes (the battle starts now, for a day) or no; the challengers can call it off */
create or replace function public.clan_battle_answer(p_battle uuid, p_yes boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype; bt public.clan_battles%rowtype; c jsonb := private.clan_cfg() -> 'battle';
begin
  perform private.rate_limit('clan_battle_answer', 60, 3600);
  m := private.clan_require(v_uid, true);
  perform private.clan_settle(m.clan_id);
  select * into bt from public.clan_battles where id = p_battle for update;
  if not found or bt.status <> 'pending' or m.clan_id not in (bt.a, bt.b) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if bt.a = m.clan_id then
    if p_yes then raise exception 'not_found' using errcode = 'P0001'; end if;
    update public.clan_battles set status = 'declined' where id = bt.id;
    return public.clan_get(m.clan_id);
  end if;
  if not p_yes then update public.clan_battles set status = 'declined' where id = bt.id; return public.clan_get(m.clan_id); end if;
  perform private.clan_settle(bt.a);
  if exists (select 1 from public.clan_battles where status = 'live' and (bt.a in (a, b) or bt.b in (a, b))) then raise exception 'clan_in_battle' using errcode = 'P0001'; end if;
  update public.clan_battles set status = 'live', starts_at = now(), ends_at = now() + make_interval(hours => coalesce((c ->> 'hours')::int, 24)) where id = bt.id;
  -- any other challenges to or from either clan lapse
  update public.clan_battles set status = 'expired' where status = 'pending' and id <> bt.id and (bt.a in (a, b) or bt.b in (a, b));
  perform private.clan_feed_add(bt.a, 'battle_start', jsonb_build_object('vs', bt.b, 'battle', bt.id));
  perform private.clan_feed_add(bt.b, 'battle_start', jsonb_build_object('vs', bt.a, 'battle', bt.id));
  return public.clan_get(m.clan_id);
end $$;

-- ---- hooks into the rest of the game ------------------------------------------------------------------------------
-- every Ink a member earns playing counts for their clan (not referral shares, ad rewards, refunds or clan rewards)
create or replace function private.grant(p_player uuid, p_reward jsonb, p_reason text, p_ref_type text, p_ref_id text, p_idem text)
returns void language plpgsql as $$
declare r record;
begin
  for r in select key, value::bigint as amount from jsonb_each_text(coalesce(p_reward, '{}'::jsonb)) loop
    if r.key in ('ink', 'pigments', 'brush_points', 'gallery_tokens') and r.amount > 0 then
      if r.key = 'ink' and p_reason not in ('minigame', 'referral', 'referral_welcome', 'usd_conversion', 'duel_win', 'duel_refund', 'pvp',
                                            'wheel', 'room_visit', 'room_host', 'inspire', 'inspire_given', 'challenge', 'craft', 'featured',
                                            'sketch', 'doodle', 'duet', 'stamp_sale', 'inkborn', 'ad_reward', 'space', 'farm', 'business', 'arcade', 'realm', 'clan') then
        raise exception 'ink_minigame_only' using errcode = 'P0001', detail = p_reason;
      end if;
      perform private.ledger_apply(p_player, r.key, r.amount, p_reason, p_ref_type, p_ref_id, p_idem);
      if r.key = 'ink' and p_reason <> 'ad_reward' then perform private.referral_share(p_player, r.amount, p_reason); end if;
      if r.key = 'ink' and p_reason not in ('clan', 'ad_reward', 'referral', 'referral_welcome', 'usd_conversion', 'duel_refund') then
        perform private.clan_credit(p_player, private.clan_cat(p_reason, p_ref_type), r.amount);
      end if;
    end if;
  end loop;
end $$;

/** may this player be in this room? a home (theirs to show) or a clan hall (members only) */
create or replace function private.room_ok(p_room uuid, p_uid uuid) returns boolean language sql stable as $$
  select (exists (select 1 from public.profiles where id = p_room) and private.visible_to(p_room, p_uid))
      or exists (select 1 from public.clan_members where clan_id = p_room and player_id = p_uid)
$$;

create or replace function public.home_live(p_host uuid, p_x real default null, p_z real default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); c jsonb := private.home_cfg();
  v_max int := coalesce((c ->> 'room_size')::int, 10);
  v_stale interval := make_interval(secs => coalesce((c ->> 'stale_seconds')::int, 12));
  me public.home_presence%rowtype; v_shard int; v_new boolean := false; v_clan boolean;
begin
  perform private.rate_limit('home_live', 9000, 3600);
  if not private.room_ok(p_host, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_clan := exists (select 1 from public.clans where id = p_host);
  -- a clan hall holds more of you at once
  if v_clan then v_max := greatest(v_max, 16); end if;
  perform pg_advisory_xact_lock(hashtext('home-live:' || p_host));
  select * into me from public.home_presence where player_id = v_uid;
  if found and me.host_id = p_host and me.seen_at > now() - v_stale then
    v_shard := me.shard;
    -- time spent together in the clan hall counts toward the clan's goals
    if v_clan then perform private.clan_credit(v_uid, 'hall', least(10, greatest(0, floor(extract(epoch from now() - me.seen_at))))::bigint); end if;
  else
    v_new := true;
    if v_uid = p_host then v_shard := 0;
    else
      select shard into v_shard from public.home_presence
       where host_id = p_host and seen_at > now() - v_stale and player_id <> v_uid
       group by shard having count(*) < v_max order by bool_or(player_id = p_host) desc, count(*) desc, shard limit 1;
      if v_shard is null then
        select coalesce(min(n), 0) into v_shard from generate_series(0, 10000) n
         where not exists (select 1 from public.home_presence where host_id = p_host and shard = n and seen_at > now() - v_stale and player_id <> v_uid);
      end if;
    end if;
  end if;
  insert into public.home_presence (player_id, host_id, shard, x, z, joined_at, seen_at)
  values (v_uid, p_host, v_shard, greatest(-7, least(7, coalesce(p_x, 0))), greatest(-6, least(6, coalesce(p_z, 4.6))), now(), now())
  on conflict (player_id) do update set host_id = excluded.host_id, shard = excluded.shard,
    x = coalesce(p_x, case when v_new then excluded.x else home_presence.x end), z = coalesce(p_z, case when v_new then excluded.z else home_presence.z end),
    joined_at = case when v_new then now() else home_presence.joined_at end, seen_at = now();
  return jsonb_build_object('shard', v_shard, 'joined', v_new, 'room_size', v_max, 'channel', 'home:' || p_host || ':' || v_shard,
    'members', (select coalesce(jsonb_agg(private.profile_json(p.player_id) || jsonb_build_object('x', p.x, 'z', p.z,
                  'explorer_style', (select explorer_style from public.profiles where id = p.player_id)) order by p.joined_at), '[]'::jsonb)
                from public.home_presence p
                where p.host_id = p_host and p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid and private.visible_to(p.player_id, v_uid)),
    'in_home', (select count(*) from public.home_presence where host_id = p_host and seen_at > now() - v_stale))
    || private.hg_room(v_uid, p_host, v_shard);
end $$;

-- ---- permissions --------------------------------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text sig, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'private' and (p.proname like 'clan\_%' or p.proname = 'room_ok'))
               or (n.nspname = 'public' and p.proname like 'clan\_%') loop
    execute format('revoke all on function %s from public', f.sig);
    if f.nspname = 'public' then
      execute format('revoke all on function %s from anon', f.sig);
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;
