-- v0.18: five new creative ways to play and earn.
--  * Sketch of the Day — one word a day, 10 minutes to sketch it, the community votes, the top 10 are paid.
--  * Painting streaks — paint a little every day and the craft bonus grows (+5% a day, up to +50%).
--  * Draw & Guess — draw a word; other players race to guess it from the replay. Both earn.
--  * Duets — two players each paint half a picture without seeing the other half, then it's revealed.
--  * Stamps — collect a numbered, limited stamp of art you love; the artist earns most of the price.
-- Drawings are stored as strokes: [{c: colour 0-15, w: width, p: [x, y, t, …]}] in 0-1000 units,
-- t in ms from the start — small, and they replay as a time-lapse.
-- Settings live in game_config 'creative'.

insert into public.game_config (key, value, description) values ('creative', '{
  "sketch": {"enabled": true, "minutes": 10, "prizes": [100, 80, 65, 50, 40, 30, 25, 20, 15, 10], "votes_per_player": 20, "min_account_hours": 24},
  "streak": {"enabled": true, "min_minutes": 5, "step_pct": 5, "max_pct": 50},
  "doodle": {"enabled": true, "draw_seconds": 60, "guess_seconds": 60, "guesser_ink": 8, "drawer_ink": 4, "max_paid_guessers": 5, "daily_paid_guesses": 15, "daily_paid_drawings": 10, "min_account_hours": 24},
  "duet": {"enabled": true, "complete_ink": 8, "daily_paid": 5, "min_account_hours": 24, "open_hours": 48},
  "stamps": {"enabled": true, "price_ink": 10, "artist_pct": 80, "supply": 100, "daily_collects": 20, "artist_daily_cap": 500, "min_account_hours": 24}
}', 'Creative games: Sketch of the Day (prizes for the top-voted sketches), painting streaks (craft bonus per day in a row), Draw & Guess, Duets and collectible Stamps.')
on conflict (key) do nothing;

create or replace function private.creative(p_part text) returns jsonb
language sql stable as $$ select coalesce(private.cfg('creative') -> p_part, '{}'::jsonb) $$;

create or replace function private.check_creative_trg() returns trigger
language plpgsql as $$
declare v jsonb := new.value; x jsonb;
  n int;
begin
  if new.key <> 'creative' then return new; end if;
  if jsonb_typeof(v -> 'sketch' -> 'prizes') is distinct from 'array' or jsonb_array_length(v -> 'sketch' -> 'prizes') > 25
     or coalesce((v -> 'sketch' ->> 'minutes')::numeric, 0) not between 1 and 120
     or coalesce((v -> 'sketch' ->> 'votes_per_player')::int, 0) not between 1 and 200
     or coalesce((v -> 'streak' ->> 'min_minutes')::numeric, -1) not between 0 and 600
     or coalesce((v -> 'streak' ->> 'step_pct')::numeric, -1) not between 0 and 100
     or coalesce((v -> 'streak' ->> 'max_pct')::numeric, -1) not between 0 and 1000
     or coalesce((v -> 'doodle' ->> 'draw_seconds')::int, 0) not between 15 and 300
     or coalesce((v -> 'doodle' ->> 'guess_seconds')::int, 0) not between 15 and 300
     or coalesce((v -> 'doodle' ->> 'guesser_ink')::numeric, -1) not between 0 and 10000
     or coalesce((v -> 'doodle' ->> 'drawer_ink')::numeric, -1) not between 0 and 10000
     or coalesce((v -> 'doodle' ->> 'max_paid_guessers')::int, -1) not between 0 and 100
     or coalesce((v -> 'duet' ->> 'complete_ink')::numeric, -1) not between 0 and 10000
     or coalesce((v -> 'duet' ->> 'open_hours')::numeric, 0) not between 1 and 720
     or coalesce((v -> 'stamps' ->> 'price_ink')::numeric, -1) not between 0 and 100000
     or coalesce((v -> 'stamps' ->> 'artist_pct')::numeric, -1) not between 0 and 100
     or coalesce((v -> 'stamps' ->> 'supply')::int, 0) not between 1 and 100000 then
    raise exception 'invalid_creative_config' using errcode = 'P0001';
  end if;
  for x in select e from jsonb_array_elements(v -> 'sketch' -> 'prizes') e loop
    if jsonb_typeof(x) <> 'number' or x::numeric not between 0 and 1000000 then raise exception 'invalid_creative_config' using errcode = 'P0001'; end if;
  end loop;
  return new;
end $$;
drop trigger if exists game_config_creative_check on public.game_config;
create trigger game_config_creative_check before insert or update on public.game_config for each row execute function private.check_creative_trg();

alter table public.feed_events drop constraint if exists feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check
  check (kind in ('join', 'claim', 'publish', 'achievement', 'referral', 'level', 'minigame', 'pvp', 'challenge', 'featured', 'sketch', 'duet', 'stamp'));

-- a drawing as strokes: a non-empty array, bounded in size
create or replace function private.check_strokes(p jsonb, p_min int default 1) returns void
language plpgsql immutable as $$
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) < p_min or jsonb_array_length(p) > 3000 or octet_length(p::text) > 300000 then
    raise exception 'invalid_drawing' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p) s
             where jsonb_typeof(s) <> 'object' or jsonb_typeof(s -> 'p') <> 'array' or coalesce((s ->> 'c')::int, -1) not between 0 and 15
                or coalesce((s ->> 'w')::numeric, 0) not between 1 and 200) then
    raise exception 'invalid_drawing' using errcode = 'P0001';
  end if;
end $$;

-- ===== Painting streaks ===============================================================
create table if not exists public.painting_days (
  player_id uuid not null references public.players(id) on delete cascade,
  day timestamptz not null,
  effort_ms bigint not null default 0,
  primary key (player_id, day)
);
alter table public.painting_days enable row level security;
revoke all on public.painting_days from anon, authenticated;

-- days in a row (ending today, or yesterday if today isn't done yet) with enough verified painting
create or replace function private.paint_streak(p_player uuid) returns int
language plpgsql stable as $$
declare v_min bigint := floor(coalesce((private.creative('streak') ->> 'min_minutes')::numeric, 5) * 60000);
  v_day timestamptz := private.day_start(now()); n int := 0;
begin
  if not exists (select 1 from public.painting_days where player_id = p_player and day = v_day and effort_ms >= v_min) then
    v_day := v_day - interval '1 day';
  end if;
  while exists (select 1 from public.painting_days where player_id = p_player and day = v_day and effort_ms >= v_min) and n < 1000 loop
    n := n + 1;
    v_day := v_day - interval '1 day';
  end loop;
  return n;
end $$;

-- the craft-bonus boost from the streak: step_pct for every day after the first, up to max_pct
create or replace function private.streak_pct(p_player uuid) returns numeric
language sql stable as $$
  select case when not coalesce((s ->> 'enabled')::boolean, false) then 0
              else least(coalesce((s ->> 'max_pct')::numeric, 50), greatest(private.paint_streak(p_player) - 1, 0) * coalesce((s ->> 'step_pct')::numeric, 5)) end
  from (select private.creative('streak') s) x
$$;

create or replace function public.my_streak() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s jsonb := private.creative('streak'); v_days int; v_today boolean;
begin
  v_days := private.paint_streak(v_uid);
  v_today := exists (select 1 from public.painting_days where player_id = v_uid and day = private.day_start(now())
                      and effort_ms >= floor(coalesce((s ->> 'min_minutes')::numeric, 5) * 60000));
  return jsonb_build_object('enabled', coalesce((s ->> 'enabled')::boolean, false), 'days', v_days, 'today', v_today,
    'bonus_pct', private.streak_pct(v_uid), 'step_pct', coalesce((s ->> 'step_pct')::numeric, 5), 'max_pct', coalesce((s ->> 'max_pct')::numeric, 50),
    'resets_at', private.day_start(now()) + interval '1 day');
end $$;

-- ===== Sketch of the Day ==============================================================
create table if not exists public.sketches (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  day timestamptz not null,
  word text not null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  strokes jsonb,
  votes int not null default 0,
  place int,
  prize int not null default 0,
  unique (player_id, day)
);
create index if not exists sketches_day on public.sketches (day, votes desc) where submitted_at is not null;
alter table public.sketches enable row level security;
revoke all on public.sketches from anon, authenticated;
create table if not exists public.sketch_votes (
  sketch_id uuid not null references public.sketches(id) on delete cascade,
  voter_id uuid not null references public.players(id) on delete cascade,
  day timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (sketch_id, voter_id)
);
alter table public.sketch_votes enable row level security;
revoke all on public.sketch_votes from anon, authenticated;
create table if not exists public.sketch_days (day timestamptz primary key, paid_at timestamptz);
alter table public.sketch_days enable row level security;
revoke all on public.sketch_days from anon, authenticated;

create or replace function private.sketch_word(p_day timestamptz) returns text
language sql immutable as $$
  select (array['lighthouse','dragon','teacup','volcano','jellyfish','robot','cactus','castle','octopus','rainbow','snail','rocket','pizza','owl',
    'mermaid','treehouse','penguin','umbrella','tornado','guitar','sunflower','submarine','fox','island','ghost','whale','dinosaur','balloon',
    'mushroom','spaceship','waterfall','crown','bicycle','cupcake','wizard','turtle','windmill','comet','sloth','lantern','bee','camera',
    'unicorn','bridge','coral reef','pirate ship','snowman','campfire','hedgehog','dragonfly','moon','train','flamingo','cloud city',
    'sandcastle','koala','bonsai','monster','astronaut','frog','tea party','haunted house','ice cream','parrot','desert','hot air balloon',
    'butterfly','lion','garden','storm','chameleon','planet','mountain','raccoon','skateboard','robot dog','vending machine','treasure chest',
    'firefly','jungle','zebra','city at night','sushi','bat','phoenix','deer','fishbowl','music','time machine','tiny house','yeti','sunset'])[
    1 + (floor(extract(epoch from p_day) / 86400)::bigint % 90)::int]
$$;

-- pay the top sketches of every finished day (once)
create or replace function private.sketch_sweep() returns void
language plpgsql as $$
declare d record; s record; k int; v_prizes jsonb := coalesce(private.creative('sketch') -> 'prizes', '[]'::jsonb); v_p int;
begin
  for d in select distinct x.day from public.sketches x where x.day < private.day_start(now()) and x.submitted_at is not null
             and not exists (select 1 from public.sketch_days sd where sd.day = x.day and sd.paid_at is not null) loop
    insert into public.sketch_days (day) values (d.day) on conflict do nothing;
    perform 1 from public.sketch_days where day = d.day and paid_at is null for update skip locked;
    if not found then continue; end if;
    k := 0;
    for s in select * from public.sketches where day = d.day and submitted_at is not null and votes > 0 order by votes desc, submitted_at limit jsonb_array_length(v_prizes) loop
      k := k + 1;
      v_p := greatest(coalesce((v_prizes ->> (k - 1))::int, 0), 0);
      update public.sketches set place = k, prize = v_p where id = s.id;
      if v_p > 0 then perform private.grant(s.player_id, jsonb_build_object('ink', v_p), 'sketch', 'sketch', s.id::text, 'sketch:' || s.id); end if;
      if k <= 3 then insert into public.feed_events (kind, player_id, data) values ('sketch', s.player_id, jsonb_build_object('word', s.word, 'place', k)); end if;
    end loop;
    update public.sketch_days set paid_at = now() where day = d.day;
  end loop;
end $$;

create or replace function private.sketch_json(s public.sketches, p_viewer uuid, p_reveal boolean) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', s.id, 'word', s.word, 'strokes', s.strokes, 'votes', case when p_reveal or s.player_id = p_viewer then s.votes end,
    'place', s.place, 'prize', s.prize, 'mine', s.player_id = p_viewer,
    'voted', exists (select 1 from public.sketch_votes v where v.sketch_id = s.id and v.voter_id = p_viewer),
    'artist', case when p_reveal or s.player_id = p_viewer then private.profile_json(s.player_id) end)
$$;

create or replace function public.sketch_today() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); c jsonb := private.creative('sketch'); v_day timestamptz := private.day_start(now()); me public.sketches%rowtype;
begin
  perform private.sketch_sweep();
  select * into me from public.sketches where player_id = v_uid and day = v_day;
  return jsonb_build_object(
    'enabled', coalesce((c ->> 'enabled')::boolean, false), 'word', private.sketch_word(v_day), 'day', v_day,
    'ends_at', v_day + interval '1 day', 'minutes', coalesce((c ->> 'minutes')::numeric, 10), 'prizes', coalesce(c -> 'prizes', '[]'::jsonb),
    'votes_per_player', coalesce((c ->> 'votes_per_player')::int, 20),
    'votes_left', greatest(coalesce((c ->> 'votes_per_player')::int, 20) - (select count(*) from public.sketch_votes where voter_id = v_uid and day = v_day), 0),
    'mine', case when me.id is null then null else jsonb_build_object('id', me.id, 'started_at', me.started_at, 'submitted', me.submitted_at is not null,
              'deadline', me.started_at + make_interval(secs => coalesce((c ->> 'minutes')::numeric, 10) * 60), 'strokes', me.strokes, 'votes', me.votes) end,
    'entries', (select coalesce(jsonb_agg(private.sketch_json(s, v_uid, false) order by md5(s.id::text || coalesce(v_uid::text, ''))), '[]'::jsonb)
                from (select * from public.sketches where day = v_day and submitted_at is not null order by submitted_at desc limit 60) s),
    'yesterday', (select coalesce(jsonb_agg(private.sketch_json(s, v_uid, true) order by s.place), '[]'::jsonb)
                  from public.sketches s where s.day = v_day - interval '1 day' and s.place is not null),
    'yesterday_word', private.sketch_word(v_day - interval '1 day'),
    'server_time', now());
end $$;

create or replace function public.sketch_start() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_day timestamptz := private.day_start(now());
begin
  if not coalesce((private.creative('sketch') ->> 'enabled')::boolean, false) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  insert into public.sketches (player_id, day, word) values (v_uid, v_day, private.sketch_word(v_day)) on conflict (player_id, day) do nothing;
  return public.sketch_today();
end $$;

create or replace function public.sketch_submit(p_strokes jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_day timestamptz := private.day_start(now()); me public.sketches%rowtype;
  v_min numeric := coalesce((private.creative('sketch') ->> 'minutes')::numeric, 10);
begin
  select * into me from public.sketches where player_id = v_uid and day = v_day for update;
  if not found then raise exception 'sketch_not_started' using errcode = 'P0001'; end if;
  if me.submitted_at is not null then raise exception 'sketch_already_submitted' using errcode = 'P0001'; end if;
  if now() > me.started_at + make_interval(secs => v_min * 60 + 45) then raise exception 'sketch_time_up' using errcode = 'P0001'; end if;
  perform private.check_strokes(p_strokes, 3);
  update public.sketches set strokes = p_strokes, submitted_at = now() where id = me.id;
  return public.sketch_today();
end $$;

create or replace function public.sketch_vote(p_sketch_id uuid, p_on boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.creative('sketch'); s public.sketches%rowtype; v_day timestamptz := private.day_start(now());
begin
  select * into s from public.sketches where id = p_sketch_id for update;
  if not found or s.submitted_at is null or s.day <> v_day then raise exception 'voting_closed' using errcode = 'P0001'; end if;
  if s.player_id = v_uid then raise exception 'own_sketch' using errcode = 'P0001'; end if;
  if p_on then
    if not private.old_enough(v_uid, coalesce((c ->> 'min_account_hours')::numeric, 24)) then raise exception 'account_too_new' using errcode = 'P0001'; end if;
    if (select count(*) from public.sketch_votes where voter_id = v_uid and day = v_day) >= coalesce((c ->> 'votes_per_player')::int, 20) then
      raise exception 'no_votes_left' using errcode = 'P0001';
    end if;
    insert into public.sketch_votes (sketch_id, voter_id, day) values (s.id, v_uid, v_day) on conflict do nothing;
  else
    delete from public.sketch_votes where sketch_id = s.id and voter_id = v_uid;
  end if;
  update public.sketches set votes = (select count(*) from public.sketch_votes where sketch_id = s.id) where id = s.id;
  return public.sketch_today();
end $$;

-- ===== shared functions updated for the new games (grant reasons, referral share, streak in craft, painting days)
create or replace function private.referral_share(p_player uuid, p_amount bigint, p_reason text) returns void
language plpgsql as $$
declare
  s jsonb := coalesce(private.cfg('referrals') -> 'share', '{}'::jsonb); r public.referrals%rowtype;
  v_cap int; v_owed int; v_pay int;
begin
  if p_amount <= 0 or not coalesce((s ->> 'enabled')::boolean, false) then return; end if;
  -- only Ink the player earned by playing counts (not referral payouts, refunds or rent conversion)
  if p_reason in ('referral', 'referral_welcome', 'referral_share', 'usd_conversion', 'duel_refund', 'stamp_sale') then return; end if;
  select * into r from public.referrals where referee_id = p_player and status <> 'void' for update;
  if not found then return; end if;
  v_cap := coalesce((s ->> 'cap_ink')::int, 1000);
  if r.share_ink >= v_cap then return; end if;
  if exists (select 1 from public.players where id = r.referrer_id and status = 'banned') then return; end if;
  r.share_acc := r.share_acc + p_amount * coalesce((s ->> 'pct')::numeric, 10) / 100;
  v_owed := least(floor(r.share_acc)::int, v_cap);
  v_pay := greatest(v_owed - r.share_ink, 0);
  update public.referrals set share_acc = r.share_acc, share_ink = share_ink + v_pay where referee_id = p_player;
  if v_pay > 0 then
    perform private.ledger_apply(r.referrer_id, 'ink', v_pay, 'referral_share', 'player', p_player::text, null);
  end if;
end $$;

create or replace function private.grant(p_player uuid, p_reward jsonb, p_reason text, p_ref_type text, p_ref_id text, p_idem text)
returns void language plpgsql as $$
declare r record;
begin
  for r in select key, value::bigint as amount from jsonb_each_text(coalesce(p_reward, '{}'::jsonb)) loop
    if r.key in ('ink', 'pigments', 'brush_points', 'gallery_tokens') and r.amount > 0 then
      if r.key = 'ink' and p_reason not in ('minigame', 'referral', 'referral_welcome', 'usd_conversion', 'duel_win', 'duel_refund', 'pvp',
                                            'wheel', 'room_visit', 'room_host', 'inspire', 'inspire_given', 'challenge', 'craft', 'featured',
                                            'sketch', 'doodle', 'duet', 'stamp_sale') then
        raise exception 'ink_minigame_only' using errcode = 'P0001', detail = p_reason;
      end if;
      perform private.ledger_apply(p_player, r.key, r.amount, p_reason, p_ref_type, p_ref_id, p_idem);
      if r.key = 'ink' then perform private.referral_share(p_player, r.amount, p_reason); end if;
    end if;
  end loop;
end $$;

create or replace function private.craft_pay(p_publication_id uuid) returns void
language plpgsql as $$
declare
  p public.artwork_publications%rowtype; c jsonb := private.earn('craft'); v_tier numeric; v_target int; v_prev public.craft_rewards%rowtype;
  v_pay int; v_today numeric; v_sim numeric; v_factor numeric; v_streak numeric;
begin
  select * into p from public.artwork_publications where id = p_publication_id;
  if not found or p.status <> 'published' or p.craft_score is null or not coalesce((c ->> 'enabled')::boolean, false) then return; end if;
  if p.craft ? 'paid' then return; end if;
  select max(greatest(coalesce((t ->> 'ink')::numeric, 0), 0)) into v_tier from jsonb_array_elements(coalesce(c -> 'tiers', '[]'::jsonb)) t
   where p.craft_score >= coalesce((t ->> 'min')::numeric, 101);
  v_sim := coalesce((p.craft -> 'similar' ->> 'sim')::numeric, 0);
  v_factor := private.originality_factor(v_sim);
  -- art with an uploaded image placed in it earns imported_factor of the bonus (none by default)
  if coalesce((select (v.manifest ->> 'imported')::boolean from public.artwork_versions v where v.id = p.version_id), false) then
    v_factor := least(v_factor, coalesce((c ->> 'imported_factor')::numeric, 0));
    update public.artwork_publications set craft = craft || '{"imported": true}'::jsonb where id = p.id;
  end if;
  -- painting streak: every day in a row you paint adds to the bonus
  v_streak := private.streak_pct(p.owner_id);
  v_target := floor(coalesce(v_tier, 0) * v_factor * (1 + v_streak / 100) * (1 + coalesce((c ->> 'plot_bonus_pct')::numeric, 20) / 100
                     * least(greatest(p.plot_count - 1, 0), coalesce((c ->> 'max_bonus_plots')::int, 8))));
  select * into v_prev from public.craft_rewards where group_id = p.group_id for update;
  v_pay := greatest(v_target - coalesce(v_prev.paid_ink, 0), 0);
  select coalesce(sum(delta), 0) into v_today from public.resource_ledger where player_id = p.owner_id and resource = 'ink' and reason = 'craft' and created_at >= private.day_start(now());
  v_pay := least(v_pay, greatest(coalesce((c ->> 'daily_cap')::numeric, 100) - v_today, 0))::int;
  insert into public.craft_rewards (group_id, owner_id, best_score, paid_ink) values (p.group_id, p.owner_id, p.craft_score, v_pay)
  on conflict (group_id) do update set best_score = greatest(public.craft_rewards.best_score, excluded.best_score),
                                       paid_ink = public.craft_rewards.paid_ink + v_pay, updated_at = now();
  update public.artwork_publications set craft = craft || jsonb_build_object('paid', v_pay, 'tier_ink', v_target, 'originality', round(v_factor * 100), 'streak_pct', v_streak)
   where id = p.id;
  if v_pay > 0 then perform private.grant(p.owner_id, jsonb_build_object('ink', v_pay), 'craft', 'publication', p.id::text, 'craft:' || p.id); end if;
end $$;

create or replace function private.version_effort_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare pv public.artwork_versions%rowtype; v_rep bigint; v_prev bigint; v_delta bigint := 0; v_base bigint := 0;
begin
  if new.parent_version_id is not null then
    select * into pv from public.artwork_versions where id = new.parent_version_id;
  end if;
  if pv.id is not null then
    v_base := private.version_effort_of(pv.id);
    if new.kind = 'save' then
      v_rep := coalesce((new.manifest ->> 'active_ms')::bigint, 0);
      v_prev := coalesce((pv.manifest ->> 'active_ms')::bigint, 0);
      v_delta := case when v_rep >= v_prev then v_rep - v_prev else v_rep end;
      v_delta := greatest(least(v_delta, floor(extract(epoch from (now() - pv.created_at)) * 1000)::bigint, 300000), 0);
    end if;
  end if;
  if v_delta > 0 then
    insert into public.painting_days (player_id, day, effort_ms) values (new.owner_id, private.day_start(now()), v_delta)
    on conflict (player_id, day) do update set effort_ms = public.painting_days.effort_ms + excluded.effort_ms;
  end if;
  insert into private.version_effort (version_id, effort_ms) values (new.id, v_base + v_delta)
  on conflict (version_id) do update set effort_ms = excluded.effort_ms;
  return new;
end $$;
-- ===== Draw & Guess ===================================================================
create table if not exists public.doodles (
  id uuid primary key default gen_random_uuid(),
  drawer_id uuid not null references public.players(id) on delete cascade,
  choices text[] not null,
  word text,
  strokes jsonb,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  guesses int not null default 0,
  solved int not null default 0,
  paid_guessers int not null default 0,
  drawer_ink int not null default 0
);
create index if not exists doodles_open on public.doodles (submitted_at) where submitted_at is not null;
alter table public.doodles enable row level security;
revoke all on public.doodles from anon, authenticated;
create table if not exists public.doodle_guesses (
  doodle_id uuid not null references public.doodles(id) on delete cascade,
  guesser_id uuid not null references public.players(id) on delete cascade,
  started_at timestamptz not null default now(),
  tries int not null default 0,
  solved_ms int,
  done boolean not null default false,
  ink int not null default 0,
  primary key (doodle_id, guesser_id)
);
create index if not exists doodle_guesses_guesser on public.doodle_guesses (guesser_id, started_at desc);
alter table public.doodle_guesses enable row level security;
revoke all on public.doodle_guesses from anon, authenticated;

create or replace function private.doodle_words() returns text[]
language sql immutable as $$
  select array['apple','banana','cat','dog','house','tree','sun','moon','star','fish','bird','car','boat','plane','train','rocket','flower','heart',
    'cloud','rain','snowman','pizza','cake','ice cream','hat','shoe','glasses','umbrella','guitar','drum','book','clock','key','lamp','chair','bed',
    'cup','spoon','fork','bridge','castle','tent','fire','mountain','island','volcano','rainbow','snake','spider','butterfly','bee','frog','turtle',
    'whale','octopus','crab','shark','penguin','owl','elephant','giraffe','lion','monkey','rabbit','mouse','pig','cow','horse','duck','robot',
    'ghost','crown','sword','shield','dragon','unicorn','mermaid','alien','planet','camera','phone','computer','headphones','balloon','kite','ball',
    'ladder','door','window','candle','bell','anchor','lighthouse','cactus','mushroom','carrot','cherry','grapes','lemon','watermelon','donut',
    'cookie','burger','hot dog','sandwich','egg','bicycle','skateboard','sailboat','tractor','bus','helicopter','compass','map','treasure','pirate',
    'wizard','witch','king','queen','baby','tooth','eye','hand','foot','nose','ear','smile','snowflake','tornado','lightning','wave','beach',
    'igloo','pyramid','windmill','fountain','scarf','sock','tie','dress','magnet','battery','bulb','paintbrush','pencil','scissors','envelope']
$$;

-- what counts as the same word: letters only, a trailing s ignored
create or replace function private.doodle_norm(p text) returns text
language sql immutable as $$ select regexp_replace(regexp_replace(lower(coalesce(p, '')), '[^a-z]', '', 'g'), 's$', '') $$;

create or replace function public.doodle_draw_start() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); w text[] := private.doodle_words(); v_choices text[]; d public.doodles%rowtype;
begin
  if not coalesce((private.creative('doodle') ->> 'enabled')::boolean, false) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  perform private.rate_limit('doodle_draw', 40, 3600);
  select array_agg(x) into v_choices from (select x from unnest(w) x order by random() limit 3) t;
  insert into public.doodles (drawer_id, choices) values (v_uid, v_choices) returning * into d;
  return jsonb_build_object('doodle_id', d.id, 'choices', d.choices, 'draw_seconds', coalesce((private.creative('doodle') ->> 'draw_seconds')::int, 60), 'server_time', now());
end $$;

create or replace function public.doodle_draw_submit(p_doodle_id uuid, p_choice int, p_strokes jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); d public.doodles%rowtype; v_secs int := coalesce((private.creative('doodle') ->> 'draw_seconds')::int, 60);
begin
  select * into d from public.doodles where id = p_doodle_id for update;
  if not found or d.drawer_id <> v_uid then raise exception 'not_found' using errcode = 'P0001'; end if;
  if d.submitted_at is not null then raise exception 'already_submitted' using errcode = 'P0001'; end if;
  if now() > d.started_at + make_interval(secs => v_secs + 60) then raise exception 'time_up' using errcode = 'P0001'; end if;
  if p_choice is null or p_choice not between 1 and array_length(d.choices, 1) then raise exception 'invalid_choice' using errcode = 'P0001'; end if;
  perform private.check_strokes(p_strokes, 3);
  update public.doodles set word = d.choices[p_choice], strokes = p_strokes, submitted_at = now() where id = d.id;
  return jsonb_build_object('ok', true, 'word', d.choices[p_choice]);
end $$;

create or replace function public.doodle_guess_start() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); d public.doodles%rowtype; g public.doodle_guesses%rowtype;
begin
  if not coalesce((private.creative('doodle') ->> 'enabled')::boolean, false) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  -- an unfinished guess carries on
  select * into g from public.doodle_guesses where guesser_id = v_uid and not done order by started_at desc limit 1;
  if found then select * into d from public.doodles where id = g.doodle_id;
  else
    perform private.rate_limit('doodle_guess', 120, 3600);
    select * into d from public.doodles x
     where x.submitted_at is not null and x.drawer_id <> v_uid and x.submitted_at > now() - interval '30 days'
       and not exists (select 1 from public.doodle_guesses y where y.doodle_id = x.id and y.guesser_id = v_uid)
     order by x.guesses, random() limit 1;
    if not found then raise exception 'no_doodles_yet' using errcode = 'P0001'; end if;
    insert into public.doodle_guesses (doodle_id, guesser_id) values (d.id, v_uid) returning * into g;
    update public.doodles set guesses = guesses + 1 where id = d.id;
  end if;
  return jsonb_build_object('doodle_id', d.id, 'strokes', d.strokes, 'letters', char_length(d.word), 'shape', regexp_replace(d.word, '[a-z]', '_', 'g'),
    'tries', g.tries, 'started_at', g.started_at, 'guess_seconds', coalesce((private.creative('doodle') ->> 'guess_seconds')::int, 60), 'server_time', now());
end $$;

create or replace function public.doodle_guess(p_doodle_id uuid, p_guess text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.creative('doodle'); d public.doodles%rowtype; g public.doodle_guesses%rowtype;
  v_secs int := coalesce((c ->> 'guess_seconds')::int, 60); v_ms int; v_ok boolean; v_ink int := 0; v_dink int := 0; v_old boolean;
begin
  select * into g from public.doodle_guesses where doodle_id = p_doodle_id and guesser_id = v_uid for update;
  if not found or g.done then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into d from public.doodles where id = p_doodle_id for update;
  v_ms := floor(extract(epoch from (now() - g.started_at)) * 1000);
  if v_ms > (v_secs + 3) * 1000 or g.tries >= 8 then
    update public.doodle_guesses set done = true where doodle_id = d.id and guesser_id = v_uid;
    return jsonb_build_object('correct', false, 'over', true, 'word', d.word, 'ink', 0);
  end if;
  v_ok := private.doodle_norm(p_guess) = private.doodle_norm(d.word) and char_length(private.doodle_norm(p_guess)) > 0;
  update public.doodle_guesses set tries = tries + 1 where doodle_id = d.id and guesser_id = v_uid;
  if not v_ok then
    if g.tries + 1 >= 8 then update public.doodle_guesses set done = true where doodle_id = d.id and guesser_id = v_uid; end if;
    return jsonb_build_object('correct', false, 'over', g.tries + 1 >= 8, 'tries_left', 8 - g.tries - 1, 'word', case when g.tries + 1 >= 8 then d.word end, 'ink', 0);
  end if;
  v_old := private.old_enough(v_uid, coalesce((c ->> 'min_account_hours')::numeric, 24));
  -- the guesser: the faster, the more (at least a quarter); the drawer: for each of the first guessers
  if v_old and (select count(*) from public.doodle_guesses where guesser_id = v_uid and ink > 0 and started_at >= private.day_start(now())) < coalesce((c ->> 'daily_paid_guesses')::int, 15) then
    v_ink := greatest(1, round(coalesce((c ->> 'guesser_ink')::numeric, 8) * greatest(0.25, 1 - v_ms / (v_secs * 1000.0))))::int;
  end if;
  if v_ink > 0 and d.paid_guessers < coalesce((c ->> 'max_paid_guessers')::int, 5)
     and (select count(*) from public.doodles where drawer_id = d.drawer_id and drawer_ink > 0 and submitted_at >= private.day_start(now()) and id <> d.id)
         < coalesce((c ->> 'daily_paid_drawings')::int, 10)
     and private.old_enough(d.drawer_id, coalesce((c ->> 'min_account_hours')::numeric, 24)) then
    v_dink := coalesce((c ->> 'drawer_ink')::int, 4);
  end if;
  update public.doodle_guesses set done = true, solved_ms = v_ms, ink = v_ink where doodle_id = d.id and guesser_id = v_uid;
  update public.doodles set solved = solved + 1, paid_guessers = paid_guessers + case when v_dink > 0 then 1 else 0 end, drawer_ink = drawer_ink + v_dink where id = d.id;
  if v_ink > 0 then perform private.grant(v_uid, jsonb_build_object('ink', v_ink), 'doodle', 'doodle', d.id::text, 'doodle-guess:' || d.id || ':' || v_uid); end if;
  if v_dink > 0 then perform private.grant(d.drawer_id, jsonb_build_object('ink', v_dink), 'doodle', 'doodle', d.id::text, 'doodle-draw:' || d.id || ':' || v_uid); end if;
  return jsonb_build_object('correct', true, 'over', true, 'word', d.word, 'ms', v_ms, 'ink', v_ink, 'drawer_paid', v_dink > 0, 'balances', private.balances(v_uid));
end $$;

create or replace function public.doodle_mine() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.creative('doodle');
begin
  return jsonb_build_object(
    'enabled', coalesce((c ->> 'enabled')::boolean, false), 'guesser_ink', c -> 'guesser_ink', 'drawer_ink', c -> 'drawer_ink',
    'draw_seconds', c -> 'draw_seconds', 'guess_seconds', c -> 'guess_seconds',
    'open', (select count(*) from public.doodles x where x.submitted_at is not null and x.drawer_id <> v_uid and x.submitted_at > now() - interval '30 days'
             and not exists (select 1 from public.doodle_guesses y where y.doodle_id = x.id and y.guesser_id = v_uid)),
    'drawings', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'word', d.word, 'strokes', d.strokes, 'guesses', d.guesses, 'solved', d.solved,
                   'ink', d.drawer_ink, 'created_at', d.submitted_at) order by d.submitted_at desc), '[]'::jsonb)
                 from (select * from public.doodles where drawer_id = v_uid and submitted_at is not null order by submitted_at desc limit 12) d),
    'stats', (select jsonb_build_object('guessed', count(*) filter (where solved_ms is not null), 'tried', count(*), 'ink', coalesce(sum(ink), 0))
              from public.doodle_guesses where guesser_id = v_uid));
end $$;

-- ===== Duets ==========================================================================
create table if not exists public.duets (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  top_id uuid not null references public.players(id) on delete cascade,
  bottom_id uuid references public.players(id) on delete set null,
  top_strokes jsonb,
  bottom_strokes jsonb,
  status text not null default 'top' check (status in ('top', 'waiting', 'bottom', 'done', 'expired')),
  created_at timestamptz not null default now(),
  top_done_at timestamptz,
  bottom_started_at timestamptz,
  done_at timestamptz,
  ink int not null default 0
);
create index if not exists duets_waiting on public.duets (top_done_at) where status = 'waiting';
alter table public.duets enable row level security;
revoke all on public.duets from anon, authenticated;

create or replace function private.duet_prompt() returns text
language sql volatile as $$
  select (array['a creature','a robot','a monster','a superhero','a wizard','an alien','a knight','a mermaid','a dancer','a scarecrow',
    'a dragon','a pirate','a chef','an astronaut','a ghost','a dinosaur','a fairy','a cowboy','a vampire','a tree spirit'])[1 + floor(random() * 20)::int]
$$;

create or replace function private.duet_json(d public.duets, p_viewer uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', d.id, 'prompt', d.prompt, 'status', d.status, 'created_at', d.created_at, 'done_at', d.done_at,
    'half', case when d.top_id = p_viewer then 'top' when d.bottom_id = p_viewer then 'bottom' end, 'ink', d.ink,
    'top', case when d.status = 'done' or d.top_id = p_viewer then d.top_strokes end,
    'bottom', case when d.status = 'done' or d.bottom_id = p_viewer then d.bottom_strokes end,
    -- the bottom painter sees only the top half's bottom edge (where to join up)
    'edge', case when d.bottom_id = p_viewer and d.status = 'bottom' then d.top_strokes end,
    'partner', case when d.status = 'done' then private.profile_json(case when d.top_id = p_viewer then d.bottom_id else d.top_id end) end)
$$;

create or replace function public.duet_start() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.creative('duet'); d public.duets%rowtype;
begin
  if not coalesce((c ->> 'enabled')::boolean, false) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  update public.duets set status = 'expired' where status in ('top', 'waiting', 'bottom') and created_at < now() - make_interval(secs => coalesce((c ->> 'open_hours')::numeric, 48) * 3600);
  -- carry on with one you're painting
  select * into d from public.duets where ((top_id = v_uid and status = 'top') or (bottom_id = v_uid and status = 'bottom')) order by created_at desc limit 1;
  if found then return private.duet_json(d, v_uid); end if;
  perform private.rate_limit('duet_start', 30, 3600);
  select * into d from public.duets where status = 'waiting' and top_id <> v_uid order by top_done_at limit 1 for update skip locked;
  if found then
    update public.duets set status = 'bottom', bottom_id = v_uid, bottom_started_at = now() where id = d.id returning * into d;
  else
    insert into public.duets (prompt, top_id) values (private.duet_prompt(), v_uid) returning * into d;
  end if;
  return private.duet_json(d, v_uid);
end $$;

create or replace function public.duet_submit(p_duet_id uuid, p_strokes jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.creative('duet'); d public.duets%rowtype; v_ink int := coalesce((c ->> 'complete_ink')::int, 8); p uuid;
begin
  select * into d from public.duets where id = p_duet_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.check_strokes(p_strokes, 2);
  if d.status = 'top' and d.top_id = v_uid then
    update public.duets set top_strokes = p_strokes, status = 'waiting', top_done_at = now() where id = d.id returning * into d;
  elsif d.status = 'bottom' and d.bottom_id = v_uid then
    update public.duets set bottom_strokes = p_strokes, status = 'done', done_at = now(), ink = v_ink where id = d.id returning * into d;
    foreach p in array array[d.top_id, d.bottom_id] loop
      if v_ink > 0 and private.old_enough(p, coalesce((c ->> 'min_account_hours')::numeric, 24))
         and (select count(*) from public.duets x where (x.top_id = p or x.bottom_id = p) and x.status = 'done' and x.done_at >= private.day_start(now()) and x.id <> d.id)
             < coalesce((c ->> 'daily_paid')::int, 5) then
        perform private.grant(p, jsonb_build_object('ink', v_ink), 'duet', 'duet', d.id::text, 'duet:' || d.id || ':' || p);
      end if;
    end loop;
    insert into public.feed_events (kind, player_id, data) values ('duet', v_uid, jsonb_build_object('duet_id', d.id, 'prompt', d.prompt));
  else
    raise exception 'not_your_turn' using errcode = 'P0001';
  end if;
  return private.duet_json(d, v_uid);
end $$;

create or replace function public.duets_mine() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.creative('duet');
begin
  return jsonb_build_object('enabled', coalesce((c ->> 'enabled')::boolean, false), 'complete_ink', c -> 'complete_ink',
    'waiting', (select count(*) from public.duets where status = 'waiting' and top_id <> v_uid),
    'duets', (select coalesce(jsonb_agg(private.duet_json(d, v_uid) order by d.created_at desc), '[]'::jsonb)
              from (select * from public.duets where top_id = v_uid or bottom_id = v_uid order by created_at desc limit 30) d));
end $$;

-- a finished duet anyone can open from a shared link (no locations, just the two painters)
create or replace function public.duet_public(p_duet_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when d.status = 'done' then jsonb_build_object('id', d.id, 'prompt', d.prompt, 'top', d.top_strokes, 'bottom', d.bottom_strokes, 'done_at', d.done_at,
    'painters', jsonb_build_array(private.profile_json(d.top_id), private.profile_json(d.bottom_id))) end
  from public.duets d where d.id = p_duet_id
$$;

create or replace function public.duets_recent(p_limit int default 24) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(public.duet_public(d.id) order by d.done_at desc), '[]'::jsonb)
  from (select id, done_at from public.duets where status = 'done' order by done_at desc limit least(greatest(coalesce(p_limit, 24), 1), 60)) d
$$;

-- ===== Stamps =========================================================================
create table if not exists public.stamps (
  publication_id uuid not null references public.artwork_publications(id) on delete cascade,
  collector_id uuid not null references public.players(id) on delete cascade,
  serial int not null,
  price int not null,
  artist_ink int not null default 0,
  created_at timestamptz not null default now(),
  primary key (publication_id, collector_id),
  unique (publication_id, serial)
);
create index if not exists stamps_collector on public.stamps (collector_id, created_at desc);
alter table public.stamps enable row level security;
revoke all on public.stamps from anon, authenticated;

create or replace function public.stamp_info(p_publication_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('enabled', coalesce((s ->> 'enabled')::boolean, false), 'price', coalesce((s ->> 'price_ink')::int, 10),
    'supply', coalesce((s ->> 'supply')::int, 100), 'artist_pct', coalesce((s ->> 'artist_pct')::numeric, 80),
    'collected', (select count(*) from public.stamps where publication_id = p_publication_id),
    'mine', (select serial from public.stamps where publication_id = p_publication_id and collector_id = auth.uid()),
    'recent', (select coalesce(jsonb_agg(private.profile_json(x.collector_id) order by x.created_at desc), '[]'::jsonb)
               from (select * from public.stamps where publication_id = p_publication_id order by created_at desc limit 8) x))
  from (select private.creative('stamps') s) c
$$;

create or replace function public.stamp_collect(p_publication_id uuid, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s jsonb := private.creative('stamps'); a public.artwork_publications%rowtype;
  v_prev jsonb; v_price int := coalesce((s ->> 'price_ink')::int, 10); v_serial int; v_art int; v_today numeric; v_res jsonb;
begin
  if not coalesce((s ->> 'enabled')::boolean, false) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'stamp_collect');
  if v_prev is not null then return v_prev; end if;
  select * into a from public.artwork_publications where id = p_publication_id for update;
  if not found or a.status <> 'published' then raise exception 'not_found' using errcode = 'P0001'; end if;
  if a.owner_id = v_uid then raise exception 'own_artwork' using errcode = 'P0001'; end if;
  if exists (select 1 from public.stamps where publication_id = a.id and collector_id = v_uid) then raise exception 'already_collected' using errcode = 'P0001'; end if;
  if not private.old_enough(v_uid, coalesce((s ->> 'min_account_hours')::numeric, 24)) then raise exception 'account_too_new' using errcode = 'P0001'; end if;
  if (select count(*) from public.stamps where collector_id = v_uid and created_at >= private.day_start(now())) >= coalesce((s ->> 'daily_collects')::int, 20) then
    raise exception 'daily_limit' using errcode = 'P0001';
  end if;
  select coalesce(max(serial), 0) + 1 into v_serial from public.stamps where publication_id = a.id;
  if v_serial > coalesce((s ->> 'supply')::int, 100) then raise exception 'sold_out' using errcode = 'P0001'; end if;
  if v_price > 0 then perform private.charge(v_uid, jsonb_build_object('ink', v_price), 'stamp', 'publication', a.id::text, 'stamp-buy:' || a.id || ':' || v_uid); end if;
  -- the artist gets their share, up to a daily cap
  select coalesce(sum(delta), 0) into v_today from public.resource_ledger
   where player_id = a.owner_id and resource = 'ink' and reason = 'stamp_sale' and created_at >= private.day_start(now());
  v_art := least(floor(v_price * coalesce((s ->> 'artist_pct')::numeric, 80) / 100), greatest(coalesce((s ->> 'artist_daily_cap')::numeric, 500) - v_today, 0))::int;
  insert into public.stamps (publication_id, collector_id, serial, price, artist_ink) values (a.id, v_uid, v_serial, v_price, v_art);
  if v_art > 0 then perform private.grant(a.owner_id, jsonb_build_object('ink', v_art), 'stamp_sale', 'publication', a.id::text, 'stamp-sale:' || a.id || ':' || v_uid); end if;
  insert into public.feed_events (kind, player_id, data) values ('stamp', v_uid, jsonb_build_object('publication_id', a.id, 'title', a.title, 'serial', v_serial));
  v_res := public.stamp_info(a.id) || jsonb_build_object('serial', v_serial, 'balances', private.balances(v_uid));
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

create or replace function public.stamp_book(p_username text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(private.artwork_card(a, auth.uid()) || jsonb_build_object('serial', st.serial, 'collected_at', st.created_at) order by st.created_at desc), '[]'::jsonb)
  from public.profiles pr
  join public.stamps st on st.collector_id = pr.id
  join public.artwork_publications a on a.id = st.publication_id and a.status = 'published'
  where lower(pr.username) = lower(p_username) and private.visible_to(pr.id, auth.uid())
$$;

do $$
declare f text;
begin
  foreach f in array array['private.creative(text)', 'private.check_creative_trg()', 'private.check_strokes(jsonb, int)', 'private.paint_streak(uuid)',
    'private.streak_pct(uuid)', 'private.sketch_word(timestamptz)', 'private.sketch_sweep()', 'private.sketch_json(public.sketches, uuid, boolean)',
    'private.doodle_words()', 'private.doodle_norm(text)', 'private.duet_prompt()', 'private.duet_json(public.duets, uuid)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.my_streak()', 'public.sketch_start()', 'public.sketch_submit(jsonb)', 'public.sketch_vote(uuid, boolean)',
    'public.doodle_draw_start()', 'public.doodle_draw_submit(uuid, int, jsonb)', 'public.doodle_guess_start()', 'public.doodle_guess(uuid, text)',
    'public.doodle_mine()', 'public.duet_start()', 'public.duet_submit(uuid, jsonb)', 'public.duets_mine()', 'public.stamp_collect(uuid, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array['public.sketch_today()', 'public.duet_public(uuid)', 'public.duets_recent(int)', 'public.stamp_info(uuid)', 'public.stamp_book(text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
end $$;
