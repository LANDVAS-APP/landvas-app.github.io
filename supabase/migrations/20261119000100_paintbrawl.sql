-- v0.7 🎨 Paintbrawl: a card battler on its own plot type, the Paintbrawl Arena. Collect painted creature cards, build a
-- deck, and battle other players live on a 3D board of four terrain lanes (or a practice bot). Packs, crafting with
-- dust, gold foils, three deck slots, ranked trophies and a leaderboard.
--
-- The rules engine is TypeScript (src/shared/brawl), run by the `brawl` Edge Function for every move: the database
-- keeps each match's full state privately and a separate redacted view for each player (their opponent's hand and
-- both decks hidden). The svc_brawl_* functions are for that Edge Function only (service role).

insert into public.plot_kinds (id, name, description, sort) values
  ('brawl', 'Paintbrawl Arena', 'Collect painted creature cards and battle other players live on a 3D board.', 10)
on conflict (id) do nothing;

-- the arena joins the realm family (levels, wallet, daily bonus, Ink cap, doors at home)
update public.game_config set value = jsonb_set(value, '{kinds,brawl}', $k${
  "name": "Paintbrawl Arena", "emoji": "🎨", "color": "#FF4FD8", "currency": "shards",
  "resources": { "shards": { "name": "Shards", "emoji": "💠", "currency": true } },
  "zones": [ { "id": "arena", "name": "The Arena", "level": 1, "blurb": "Four lanes, two players, one winner." } ],
  "producers": {}, "upgrades": {}, "recipes": {}, "finds": {}, "games": {}
}$k$::jsonb)
 where key = 'realms' and not (value -> 'kinds' ? 'brawl');

insert into public.game_config (key, value, description) values ('brawl', $cfg${
  "pack_cost": 120, "pack_size": 5, "foil_chance": 0.05,
  "weights": { "common": 70, "rare": 22, "epic": 7, "legendary": 1 },
  "dust": { "common": 5, "rare": 20, "epic": 100, "legendary": 400 },
  "craft": { "common": 40, "rare": 100, "epic": 400, "legendary": 1600 },
  "max_copies": { "common": 2, "rare": 2, "epic": 2, "legendary": 1 },
  "deck_size": 20, "turn_seconds": 75,
  "reward": { "win": 50, "loss": 15, "draw": 25, "bot_win": 25, "bot_loss": 5, "bot_full_per_day": 6, "bot_after": 6, "first_win_pack": true },
  "xp": { "win": 40, "loss": 15, "bot": 10 },
  "ink": { "win": 4, "bot_win": 1 },
  "ranks": [ ["Bronze", 0, "🥉"], ["Silver", 200, "🥈"], ["Gold", 500, "🥇"], ["Platinum", 900, "💎"], ["Diamond", 1400, "🔷"], ["Legend", 2000, "👑"] ],
  "terrains": ["meadow", "ember", "frost", "bog", "sugar", "neon"],
  "cards": {"sproutling":"common","thornhare":"common","mossback":"rare","blossomstag":"rare","oakheart":"legendary","bloomwell":"common","rejuvenate":"common","cinderpup":"common","lavaling":"common","blazefox":"rare","pyredrake":"epic","volcanotitan":"legendary","kindleshrine":"common","fireburst":"common","snowpip":"common","icicleram":"common","glacierowl":"rare","frostmaw":"epic","aurorawyrm":"legendary","hoarfrost":"common","deepfreeze":"common","sporemite":"common","mudslug":"common","fungalshaman":"rare","swamplurker":"epic","rotqueen":"legendary","mirecauldron":"common","toxiccloud":"rare","gumdropimp":"common","jellyfright":"common","taffytwister":"rare","candiedknight":"epic","sugarcolossus":"legendary","sprinklefountain":"rare","sweettooth":"common","voltbug":"common","circuitcat":"common","laserlynx":"rare","mechamantis":"epic","gridoverlord":"legendary","teslacoil":"rare","overcharge":"common","pebblegolem":"common","wanderingbard":"common","mimicchest":"epic","terraform":"rare","secondwind":"epic","luckycoin":"common","eruption":"legendary","avalanche":"epic","overgrowth":"epic","bogrise":"epic","cyclone":"epic","thunderstorm":"epic","blackhole":"legendary","earthquake":"rare","tidalwave":"epic","eclipse":"rare","meteors":"legendary","smolderpeak":"epic","beanstalk":"rare","mirrorlake":"rare","toadstoolhut":"epic","gumballmachine":"rare","stormspire":"epic","riftgate":"legendary"},
  "starters": [{"name":"Wildfire","terrains":["meadow","ember","meadow","ember"],"cards":["sproutling","sproutling","thornhare","thornhare","bloomwell","rejuvenate","cinderpup","cinderpup","lavaling","lavaling","kindleshrine","kindleshrine","fireburst","fireburst","blossomstag","blazefox","eruption","smolderpeak","wanderingbard","earthquake"]},{"name":"Sugar Frost","terrains":["frost","sugar","frost","sugar"],"cards":["snowpip","snowpip","icicleram","icicleram","hoarfrost","deepfreeze","deepfreeze","gumdropimp","gumdropimp","jellyfright","jellyfright","sweettooth","glacierowl","taffytwister","avalanche","wanderingbard","wanderingbard","cyclone","gumballmachine","mirrorlake"]}]
}$cfg$::jsonb, 'Paintbrawl: packs, dust, rewards, ranks, the card list (rarities) and starter decks')
on conflict (key) do nothing;

create table if not exists public.brawl_players (
  player_id uuid primary key references public.players (id) on delete cascade,
  cards jsonb not null default '{}'::jsonb,     -- card -> how many
  foils jsonb not null default '{}'::jsonb,     -- card -> how many gold foils
  dust int not null default 0,
  decks jsonb not null default '[]'::jsonb,     -- up to 3: {name, cards[], terrains[]}
  deck_slot int not null default 0,
  trophies int not null default 0,
  best int not null default 0,
  wins int not null default 0, losses int not null default 0, draws int not null default 0, streak int not null default 0,
  bot_wins int not null default 0, packs int not null default 0,
  day date, wins_today int not null default 0, bot_wins_today int not null default 0, first_win_day date, free_pack_day date,
  created_at timestamptz not null default now()
);
create table if not exists public.brawl_queue (
  player_id uuid primary key references public.players (id) on delete cascade,
  trophies int not null default 0,
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
create table if not exists public.brawl_matches (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references public.players (id) on delete cascade,
  b uuid references public.players (id) on delete cascade,
  bot boolean not null default false,
  bot_name text, bot_skill numeric,
  state jsonb not null, view_a jsonb not null, view_b jsonb,
  v int not null default 0,
  status text not null default 'live' check (status in ('live', 'over')),
  winner smallint, reason text,
  deadline timestamptz,
  rewards jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists brawl_matches_a on public.brawl_matches (a, created_at desc);
create index if not exists brawl_matches_b on public.brawl_matches (b, created_at desc);
create index if not exists brawl_matches_live on public.brawl_matches (status) where status = 'live';
alter table public.brawl_players enable row level security;
alter table public.brawl_queue enable row level security;
alter table public.brawl_matches enable row level security;
revoke all on public.brawl_players, public.brawl_queue, public.brawl_matches from anon, authenticated;

-- ---- helpers ------------------------------------------------------------------------------------------------------------
create or replace function private.rbr_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('brawl'), '{}'::jsonb) $$;
/** A player's card data (made with both starter decks the first time). */
create or replace function private.rbr_player(p_uid uuid) returns public.brawl_players language plpgsql as $$
declare b public.brawl_players%rowtype; c jsonb := private.rbr_cfg(); v_cards jsonb := '{}'::jsonb; d jsonb; x text;
begin
  select * into b from public.brawl_players where player_id = p_uid for update;
  if found then
    if b.day is distinct from current_date then update public.brawl_players set day = current_date, wins_today = 0, bot_wins_today = 0 where player_id = p_uid returning * into b; end if;
    return b;
  end if;
  for d in select jsonb_array_elements(c -> 'starters') loop
    for x in select jsonb_array_elements_text(d -> 'cards') loop v_cards := jsonb_set(v_cards, array[x], to_jsonb(coalesce((v_cards ->> x)::int, 0) + 1)); end loop;
  end loop;
  -- the starter collection: enough copies for both starter decks
  insert into public.brawl_players (player_id, cards, decks, day) values (p_uid, v_cards, c -> 'starters', current_date) on conflict (player_id) do nothing;
  select * into b from public.brawl_players where player_id = p_uid for update;
  return b;
end $$;
create or replace function private.rbr_rank(p_trophies int) returns jsonb language sql stable as $$
  select coalesce((select jsonb_build_object('name', r ->> 0, 'min', (r ->> 1)::int, 'emoji', r ->> 2) from jsonb_array_elements(private.rbr_cfg() -> 'ranks') r
                    where (r ->> 1)::int <= p_trophies order by (r ->> 1)::int desc limit 1), '{"name":"Bronze","min":0,"emoji":"🥉"}'::jsonb)
$$;
/** Is this deck legal for this player? Returns the reason it isn't, or null. */
create or replace function private.rbr_deck_problem(b public.brawl_players, p_deck jsonb) returns text language plpgsql stable as $$
declare c jsonb := private.rbr_cfg(); e record; v_r text;
begin
  if p_deck is null or jsonb_typeof(p_deck -> 'cards') <> 'array' or jsonb_array_length(p_deck -> 'cards') <> (c ->> 'deck_size')::int then return 'deck_size'; end if;
  if jsonb_typeof(p_deck -> 'terrains') <> 'array' or jsonb_array_length(p_deck -> 'terrains') <> 4
     or exists (select 1 from jsonb_array_elements_text(p_deck -> 'terrains') t where not (c -> 'terrains') ? t) then return 'deck_terrains'; end if;
  for e in select x id, count(*) n from jsonb_array_elements_text(p_deck -> 'cards') x group by x loop
    v_r := c -> 'cards' ->> e.id;
    if v_r is null then return 'deck_unknown_card'; end if;
    if e.n > (c -> 'max_copies' ->> v_r)::int then return 'deck_copies'; end if;
    if e.n > coalesce((b.cards ->> e.id)::int, 0) then return 'deck_not_owned'; end if;
  end loop;
  return null;
end $$;
create or replace function private.rbr_me(p_uid uuid) returns jsonb language plpgsql as $$
declare bp public.brawl_players%rowtype := private.rbr_player(p_uid); v_live uuid; q public.brawl_queue%rowtype;
begin
  select id into v_live from public.brawl_matches where status = 'live' and (a = p_uid or b = p_uid) order by created_at desc limit 1;
  select * into q from public.brawl_queue where player_id = p_uid;
  return jsonb_build_object('cards', bp.cards, 'foils', bp.foils, 'dust', bp.dust, 'decks', bp.decks, 'deck_slot', bp.deck_slot,
    'trophies', bp.trophies, 'best', bp.best, 'rank', private.rbr_rank(bp.trophies), 'wins', bp.wins, 'losses', bp.losses, 'draws', bp.draws, 'streak', bp.streak,
    'bot_wins', bp.bot_wins, 'packs', bp.packs, 'wins_today', bp.wins_today, 'bot_wins_today', bp.bot_wins_today,
    'first_win_ready', bp.first_win_day is distinct from current_date, 'free_pack_ready', bp.free_pack_day is distinct from current_date,
    'shards', coalesce((select (wallet ->> 'shards')::numeric from public.realm_players where player_id = p_uid and kind = 'brawl'), 0),
    'live', v_live, 'queued', q.player_id is not null, 'queued_since', q.joined_at, 'cfg', private.rbr_cfg() - 'starters', 'server_time', now());
end $$;
create or replace function private.rbr_need_arena(p_uid uuid) returns void language plpgsql as $$
begin
  if not exists (select 1 from public.realms r join public.canvas_groups g on g.id = r.group_id and g.status = 'active' and g.kind = 'brawl' where r.owner_id = p_uid and r.kind = 'brawl') then
    raise exception 'brawl_no_arena' using errcode = 'P0001';
  end if;
end $$;
create or replace function private.rbr_profile(p_uid uuid) returns jsonb language sql stable as $$
  select private.profile_json(p_uid) || jsonb_build_object('trophies', coalesce(b.trophies, 0), 'rank', private.rbr_rank(coalesce(b.trophies, 0)))
  from (select 1) one left join public.brawl_players b on b.player_id = p_uid
$$;

-- ---- the player side --------------------------------------------------------------------------------------------------
create or replace function public.brawl_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.realms%rowtype;
begin
  select * into r from public.realms where id = p_id;
  if not found or r.kind <> 'brawl' then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.rlm_player(v_uid, 'brawl');
  return public.realm_get(p_id) || jsonb_build_object('brawl', private.rbr_me(v_uid));
end $$;

create or replace function public.brawl_deck_save(p_slot int, p_name text, p_cards jsonb, p_terrains jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); b public.brawl_players%rowtype; v_deck jsonb; v_why text; v_decks jsonb;
begin
  perform private.rate_limit('brawl_deck', 300, 3600);
  b := private.rbr_player(v_uid);
  if p_slot is null or p_slot < 0 or p_slot > 2 then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  v_deck := jsonb_build_object('name', left(coalesce(nullif(btrim(p_name), ''), 'Deck ' || (p_slot + 1)), 24), 'cards', p_cards, 'terrains', p_terrains);
  v_why := private.rbr_deck_problem(b, v_deck);
  if v_why is not null then raise exception '%', v_why using errcode = 'P0001'; end if;
  v_decks := b.decks;
  while jsonb_array_length(v_decks) <= p_slot loop v_decks := v_decks || 'null'::jsonb; end loop;
  v_decks := jsonb_set(v_decks, array[p_slot::text], v_deck);
  update public.brawl_players set decks = v_decks, deck_slot = p_slot where player_id = v_uid;
  return private.rbr_me(v_uid);
end $$;

create or replace function public.brawl_deck_use(p_slot int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); b public.brawl_players%rowtype := private.rbr_player(v_uid);
begin
  if p_slot is null or p_slot < 0 or p_slot >= jsonb_array_length(b.decks) or b.decks -> p_slot = 'null'::jsonb then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  update public.brawl_players set deck_slot = p_slot where player_id = v_uid;
  return private.rbr_me(v_uid);
end $$;

/** Open packs: 5 cards each, at least one rare or better; now and then a gold foil. The first pack each day is free. */
create or replace function public.brawl_pack_open(p_free boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); b public.brawl_players%rowtype := private.rbr_player(v_uid); c jsonb := private.rbr_cfg();
  v_out jsonb := '[]'::jsonb; i int; v_roll numeric; v_r text; v_id text; v_foil boolean; v_tot numeric; v_acc numeric; w record; v_best text := 'common';
  v_cards jsonb := b.cards; v_foils jsonb := b.foils;
begin
  perform private.rate_limit('brawl_pack', 200, 3600);
  perform private.rbr_need_arena(v_uid);
  if p_free then
    if b.free_pack_day = current_date then raise exception 'already_claimed' using errcode = 'P0001'; end if;
    update public.brawl_players set free_pack_day = current_date where player_id = v_uid;
  else
    perform private.rlm_player(v_uid, 'brawl');
    if not private.jcovers((select wallet from public.realm_players where player_id = v_uid and kind = 'brawl'), jsonb_build_object('shards', (c ->> 'pack_cost')::int)) then raise exception 'not_enough' using errcode = 'P0001'; end if;
    update public.realm_players set wallet = private.jadd(wallet, jsonb_build_object('shards', (c ->> 'pack_cost')::int), -1) where player_id = v_uid and kind = 'brawl';
  end if;
  select sum(value::numeric) into v_tot from jsonb_each_text(c -> 'weights');
  for i in 1 .. (c ->> 'pack_size')::int loop
    -- the last card is at least rare if the pack hasn't had one yet
    v_roll := random() * v_tot; v_acc := 0; v_r := 'common';
    for w in select key, value::numeric v from jsonb_each_text(c -> 'weights') order by value::numeric desc loop
      v_acc := v_acc + w.v; if v_roll < v_acc then v_r := w.key; exit; end if;
    end loop;
    if i = (c ->> 'pack_size')::int and v_best = 'common' and v_r = 'common' then v_r := 'rare'; end if;
    if v_r <> 'common' and (v_best = 'common' or (v_best = 'rare' and v_r in ('epic', 'legendary')) or (v_best = 'epic' and v_r = 'legendary')) then v_best := v_r; end if;
    select key into v_id from jsonb_each_text(c -> 'cards') where value = v_r order by random() limit 1;
    v_foil := random() < (c ->> 'foil_chance')::numeric;
    v_out := v_out || jsonb_build_object('id', v_id, 'rarity', v_r, 'foil', v_foil, 'new', coalesce((v_cards ->> v_id)::int, 0) = 0);
    v_cards := jsonb_set(v_cards, array[v_id], to_jsonb(coalesce((v_cards ->> v_id)::int, 0) + 1));
    if v_foil then v_foils := jsonb_set(v_foils, array[v_id], to_jsonb(coalesce((v_foils ->> v_id)::int, 0) + 1)); end if;
  end loop;
  update public.brawl_players set cards = v_cards, foils = v_foils, packs = packs + 1 where player_id = v_uid;
  return jsonb_build_object('cards', v_out, 'me', private.rbr_me(v_uid));
end $$;

/** Craft a card with dust, or turn a spare copy into dust (copies a deck needs can't be dusted). */
create or replace function public.brawl_craft(p_card text, p_dust boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); b public.brawl_players%rowtype := private.rbr_player(v_uid); c jsonb := private.rbr_cfg(); v_r text := c -> 'cards' ->> p_card; v_have int; v_need int := 0; d jsonb;
begin
  perform private.rate_limit('brawl_craft', 300, 3600);
  if v_r is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_have := coalesce((b.cards ->> p_card)::int, 0);
  if p_dust then
    for d in select jsonb_array_elements(b.decks) loop
      if d <> 'null'::jsonb then v_need := greatest(v_need, (select count(*) from jsonb_array_elements_text(d -> 'cards') x where x = p_card)::int); end if;
    end loop;
    if v_have <= v_need then raise exception 'brawl_card_in_deck' using errcode = 'P0001'; end if;
    update public.brawl_players set cards = jsonb_set(cards, array[p_card], to_jsonb(v_have - 1)), dust = dust + (c -> 'dust' ->> v_r)::int where player_id = v_uid;
  else
    if v_have >= (c -> 'max_copies' ->> v_r)::int then raise exception 'maxed' using errcode = 'P0001'; end if;
    if b.dust < (c -> 'craft' ->> v_r)::int then raise exception 'not_enough' using errcode = 'P0001'; end if;
    update public.brawl_players set cards = jsonb_set(cards, array[p_card], to_jsonb(v_have + 1)), dust = dust - (c -> 'craft' ->> v_r)::int where player_id = v_uid;
  end if;
  return private.rbr_me(v_uid);
end $$;

create or replace function public.brawl_queue_leave() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  delete from public.brawl_queue where player_id = v_uid;
  return private.rbr_me(v_uid);
end $$;

/** My view of a match (only mine: the other player's hand stays hidden), and who I'm playing. */
create or replace function public.brawl_view(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.brawl_matches%rowtype; v_side int;
begin
  perform private.rate_limit('brawl_view', 6000, 3600);
  select * into m from public.brawl_matches where id = p_match;
  if not found or (m.a <> v_uid and m.b is distinct from v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_side := case when m.a = v_uid then 0 else 1 end;
  return jsonb_build_object('id', m.id, 'side', v_side, 'view', case when v_side = 0 then m.view_a else m.view_b end, 'v', m.v, 'status', m.status,
    'winner', m.winner, 'reason', m.reason, 'deadline', m.deadline, 'server_time', now(), 'bot', m.bot,
    'rewards', case when m.rewards is null then null else m.rewards -> (case when v_side = 0 then 'a' else 'b' end) end,
    'players', jsonb_build_array(private.rbr_profile(m.a),
      case when m.bot then jsonb_build_object('id', null, 'username', m.bot_name, 'bot', true, 'trophies', 0, 'rank', private.rbr_rank(0)) else private.rbr_profile(m.b) end));
end $$;

create or replace function public.brawl_leaderboard() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return jsonb_build_object('top', coalesce((select jsonb_agg(private.rbr_profile(b.player_id) || jsonb_build_object('wins', b.wins, 'losses', b.losses) order by b.trophies desc, b.wins desc)
      from (select * from public.brawl_players where wins + losses > 0 order by trophies desc, wins desc limit 50) b), '[]'::jsonb),
    'me', private.rbr_profile(v_uid), 'place', (select count(*) + 1 from public.brawl_players x where x.trophies > coalesce((select trophies from public.brawl_players where player_id = v_uid), 0)));
end $$;

create or replace function public.brawl_history() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return coalesce((select jsonb_agg(x order by (x ->> 'at') desc) from (
    select jsonb_build_object('id', m.id, 'at', m.created_at, 'bot', m.bot, 'status', m.status, 'reason', m.reason,
      'won', m.winner = case when m.a = v_uid then 0 else 1 end, 'draw', m.winner = -1,
      'opponent', case when m.bot then jsonb_build_object('username', m.bot_name, 'bot', true) else private.rbr_profile(case when m.a = v_uid then m.b else m.a end) end,
      'trophies', m.rewards -> (case when m.a = v_uid then 'a' else 'b' end) -> 'trophies') x
    from public.brawl_matches m where (m.a = v_uid or m.b = v_uid) order by m.created_at desc limit 15) t), '[]'::jsonb);
end $$;

-- ---- for the Edge Function (service role) -----------------------------------------------------------------------------
/** Join (or stay in) the queue; pairs you with someone waiting near your trophies (the window widens as you wait). */
create or replace function public.svc_brawl_enqueue(p_uid uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare bp public.brawl_players%rowtype; v_live uuid; v_deck jsonb; v_why text; q public.brawl_queue%rowtype; o public.brawl_queue%rowtype; ob public.brawl_players%rowtype; v_window int;
begin
  select id into v_live from public.brawl_matches where status = 'live' and (a = p_uid or b = p_uid) limit 1;
  if v_live is not null then delete from public.brawl_queue where player_id = p_uid; return jsonb_build_object('match', v_live); end if;
  perform private.rbr_need_arena(p_uid);
  bp := private.rbr_player(p_uid);
  v_deck := bp.decks -> bp.deck_slot; v_why := private.rbr_deck_problem(bp, v_deck);
  if v_why is not null then raise exception '%', v_why using errcode = 'P0001'; end if;
  insert into public.brawl_queue (player_id, trophies) values (p_uid, bp.trophies)
    on conflict (player_id) do update set seen_at = now(), trophies = excluded.trophies returning * into q;
  v_window := 150 + floor(extract(epoch from now() - q.joined_at))::int * 15;
  select * into o from public.brawl_queue where player_id <> p_uid and seen_at > now() - interval '12 seconds' and abs(trophies - bp.trophies) <= v_window
    order by abs(trophies - bp.trophies), joined_at limit 1 for update skip locked;
  if not found then return jsonb_build_object('waiting', true, 'waited', floor(extract(epoch from now() - q.joined_at))); end if;
  ob := private.rbr_player(o.player_id);
  if private.rbr_deck_problem(ob, ob.decks -> ob.deck_slot) is not null then delete from public.brawl_queue where player_id = o.player_id; return jsonb_build_object('waiting', true, 'waited', 0); end if;
  delete from public.brawl_queue where player_id in (p_uid, o.player_id);
  return jsonb_build_object('pair', o.player_id,
    'a', jsonb_build_object('id', p_uid, 'name', (select username from public.profiles where id = p_uid), 'deck', v_deck -> 'cards', 'terrains', v_deck -> 'terrains'),
    'b', jsonb_build_object('id', o.player_id, 'name', (select username from public.profiles where id = o.player_id), 'deck', ob.decks -> ob.deck_slot -> 'cards', 'terrains', ob.decks -> ob.deck_slot -> 'terrains'));
end $$;

/** A practice match against a bot: your deck, your trophies (the bot gets tougher as you climb). */
create or replace function public.svc_brawl_bot(p_uid uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare bp public.brawl_players%rowtype; v_live uuid; v_deck jsonb; v_why text;
begin
  select id into v_live from public.brawl_matches where status = 'live' and (a = p_uid or b = p_uid) limit 1;
  if v_live is not null then return jsonb_build_object('match', v_live); end if;
  perform private.rbr_need_arena(p_uid);
  bp := private.rbr_player(p_uid);
  v_deck := bp.decks -> bp.deck_slot; v_why := private.rbr_deck_problem(bp, v_deck);
  if v_why is not null then raise exception '%', v_why using errcode = 'P0001'; end if;
  delete from public.brawl_queue where player_id = p_uid;
  return jsonb_build_object('a', jsonb_build_object('id', p_uid, 'name', (select username from public.profiles where id = p_uid), 'deck', v_deck -> 'cards', 'terrains', v_deck -> 'terrains'),
    'trophies', bp.trophies, 'bot_wins', bp.bot_wins);
end $$;

create or replace function public.svc_brawl_create(p_a uuid, p_b uuid, p_bot boolean, p_bot_name text, p_bot_skill numeric, p_state jsonb, p_view_a jsonb, p_view_b jsonb, p_deadline timestamptz) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  insert into public.brawl_matches (a, b, bot, bot_name, bot_skill, state, view_a, view_b, v, deadline)
    values (p_a, p_b, p_bot, p_bot_name, p_bot_skill, p_state, p_view_a, p_view_b, coalesce((p_state ->> 'v')::int, 0), p_deadline) returning id into v_id;
  return v_id;
end $$;

create or replace function public.svc_brawl_load(p_match uuid, p_uid uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.brawl_matches%rowtype;
begin
  select * into m from public.brawl_matches where id = p_match;
  if not found or (m.a <> p_uid and m.b is distinct from p_uid) then return null; end if;
  return jsonb_build_object('state', m.state, 'v', m.v, 'side', case when m.a = p_uid then 0 else 1 end, 'bot', m.bot, 'bot_skill', m.bot_skill, 'status', m.status,
    'deadline', m.deadline, 'expired', m.deadline is not null and m.deadline < now() - interval '2 seconds');
end $$;

/** Save the match after a move (only if nobody else moved first); on the last move, hand out the rewards. */
create or replace function public.svc_brawl_save(p_match uuid, p_v int, p_state jsonb, p_view_a jsonb, p_view_b jsonb, p_deadline timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.brawl_matches%rowtype; v_over boolean := coalesce((p_state ->> 'over')::boolean, false);
begin
  select * into m from public.brawl_matches where id = p_match for update;
  if not found or m.status <> 'live' or m.v <> p_v then return jsonb_build_object('ok', false); end if;
  update public.brawl_matches set state = p_state, view_a = p_view_a, view_b = p_view_b, v = (p_state ->> 'v')::int, deadline = case when v_over then null else p_deadline end,
    status = case when v_over then 'over' else 'live' end, winner = case when v_over then (p_state ->> 'winner')::smallint end, reason = p_state ->> 'reason', updated_at = now()
   where id = p_match;
  if v_over then return jsonb_build_object('ok', true, 'rewards', private.rbr_finish(p_match)); end if;
  return jsonb_build_object('ok', true);
end $$;

/** Rewards: shards, trophies (more for beating a stronger player), realm XP, a little Ink, a free pack for the first win of the day. */
create or replace function private.rbr_finish(p_match uuid) returns jsonb language plpgsql as $$
declare m public.brawl_matches%rowtype; c jsonb := private.rbr_cfg(); rw jsonb := c -> 'reward'; out jsonb := '{}'::jsonb; side int; v_uid uuid; v_opp uuid;
  b public.brawl_players%rowtype; ob public.brawl_players%rowtype; v_res text; v_sh int; v_tr int := 0; v_ink int := 0; v_pack boolean; v_realm uuid; v_lv int; v_xp int;
begin
  select * into m from public.brawl_matches where id = p_match for update;
  if m.rewards is not null then return m.rewards; end if;
  -- a Card Lab match is only a test: no shards, trophies, XP, Ink or packs
  if coalesce((m.state ->> 'lab')::boolean, false) then
    out := jsonb_build_object('a', jsonb_build_object('result', case when m.winner = -1 then 'draw' when m.winner = 0 then 'win' else 'loss' end, 'shards', 0, 'trophies', 0, 'ink', 0, 'pack', false, 'level_up', null, 'lab', true,
      'total', (select trophies from public.brawl_players where player_id = m.a)));
    update public.brawl_matches set rewards = out where id = m.id;
    return out;
  end if;
  for side in 0 .. 1 loop
    v_uid := case when side = 0 then m.a else m.b end;
    if v_uid is null then continue; end if;
    v_opp := case when side = 0 then m.b else m.a end;
    b := private.rbr_player(v_uid);
    v_res := case when m.winner = -1 then 'draw' when m.winner = side then 'win' else 'loss' end;
    v_pack := false; v_tr := 0; v_ink := 0;
    if m.bot then
      v_sh := case v_res when 'win' then case when b.bot_wins_today < (rw ->> 'bot_full_per_day')::int then (rw ->> 'bot_win')::int else (rw ->> 'bot_after')::int end
                         when 'draw' then (rw ->> 'bot_loss')::int else (rw ->> 'bot_loss')::int end;
      if v_res = 'win' then v_ink := (c -> 'ink' ->> 'bot_win')::int; end if;
      v_xp := (c -> 'xp' ->> 'bot')::int;
    else
      ob := private.rbr_player(v_opp);
      v_sh := (rw ->> v_res)::int;
      v_tr := case v_res when 'win' then greatest(10, least(40, 25 + (ob.trophies - b.trophies) / 40))
                         when 'loss' then -greatest(8, least(30, 18 - (ob.trophies - b.trophies) / 40)) else 0 end;
      if v_res = 'win' then v_ink := (c -> 'ink' ->> 'win')::int; end if;
      v_xp := (c -> 'xp' ->> case when v_res = 'win' then 'win' else 'loss' end)::int;
    end if;
    -- the first win of the day (real or practice) gives a free pack
    if v_res = 'win' and b.first_win_day is distinct from current_date then v_pack := true; end if;
    update public.brawl_players set
      trophies = greatest(0, trophies + v_tr), best = greatest(best, trophies + v_tr),
      wins = wins + case when v_res = 'win' and not m.bot then 1 else 0 end, losses = losses + case when v_res = 'loss' and not m.bot then 1 else 0 end,
      draws = draws + case when v_res = 'draw' and not m.bot then 1 else 0 end,
      streak = case when m.bot then streak when v_res = 'win' then streak + 1 else 0 end,
      bot_wins = bot_wins + case when m.bot and v_res = 'win' then 1 else 0 end, bot_wins_today = bot_wins_today + case when m.bot and v_res = 'win' then 1 else 0 end,
      wins_today = wins_today + case when v_res = 'win' then 1 else 0 end,
      first_win_day = case when v_pack then current_date else first_win_day end,
      free_pack_day = case when v_pack then null else free_pack_day end
     where player_id = v_uid;
    perform private.rlm_player(v_uid, 'brawl');
    update public.realm_players set wallet = private.jadd(wallet, jsonb_build_object('shards', v_sh)), lifetime = private.jadd(lifetime, jsonb_build_object('shards', v_sh)) where player_id = v_uid and kind = 'brawl';
    select id into v_realm from public.realms where owner_id = v_uid and kind = 'brawl' order by created_at limit 1;
    v_lv := null;
    if v_realm is not null then
      v_lv := private.rlm_xp(v_realm, v_xp::bigint);
      if v_ink > 0 then v_ink := private.rlm_pay(v_uid, 'brawl', v_ink, v_realm::text, 'brawl:' || m.id || ':' || side); end if;
    else v_ink := 0; end if;
    out := out || jsonb_build_object(case when side = 0 then 'a' else 'b' end, jsonb_build_object('result', v_res, 'shards', v_sh, 'trophies', v_tr, 'ink', v_ink, 'pack', v_pack, 'level_up', v_lv,
      'total', (select trophies from public.brawl_players where player_id = v_uid)));
  end loop;
  update public.brawl_matches set rewards = out where id = m.id;
  return out;
end $$;

-- ---- the arena is a plot type: add it everywhere the realm types are listed ---------------------------------------------
do $$
declare f text; d text; n text;
begin
  foreach f in array array['public.set_group_kind(uuid,text)', 'private.home_places(uuid,uuid,text)', 'public.home_doors(jsonb)', 'private.no_art_on_habitat_trg()'] loop
    d := pg_get_functiondef(f::regprocedure);
    n := replace(replace(d, '''dungeon'')', '''dungeon'', ''brawl'')'), '''dungeon'']', '''dungeon'', ''brawl'']');
    if n = d then raise exception 'paintbrawl: no plot-type list found in %', f; end if;
    execute n;
  end loop;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text sig, n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'private' and p.proname like 'rbr\_%') or (n.nspname = 'public' and (p.proname like 'brawl\_%' or p.proname like 'svc\_brawl\_%')) loop
    execute format('revoke all on function %s from public', f.sig);
    if f.nspname = 'public' then
      execute format('revoke all on function %s from anon', f.sig);
      if f.proname like 'svc\_%' then execute format('revoke all on function %s from authenticated', f.sig); execute format('grant execute on function %s to service_role', f.sig);
      else execute format('grant execute on function %s to authenticated, service_role', f.sig); end if;
    end if;
  end loop;
end $$;
