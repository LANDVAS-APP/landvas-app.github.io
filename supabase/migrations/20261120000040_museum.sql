-- Estates & Domains, wave 1, step 2: the Museum (the Art Domain, 3×3).
-- The Gallery grows into a museum at night. Through the last room of the Permanent Collection (your gallery, now up to
-- 7 rooms) is the Rotunda under a glass dome of stars: the exhibition stands at its centre, Constellation (the old
-- Domain game) at its star rail, and off it the Loan Wing, where pieces borrowed from other artists hang.
--   * Walk into a painting: step inside any piece and walk round it as a pop-up diorama. Three sparks hide in each
--     one; finding a spark pays Renown to you and to the artist (once per spark per visitor).
--   * Loan Wing: ask another artist to lend you a published piece. They say yes or no; a loan runs 14 days. Admires on
--     a loaned piece pay its artist Renown too.
--   * Exhibition Night (the Domain power): once a week, put one piece on show. For 24 hours it turns as a hologram in
--     the Rotunda, the museum's recent visitors hear about it, and everyone who comes takes an exhibition stamp.
-- Renown stays a place currency: never Ink, never USD. The old Starlight Museum's renown (its realm wallet) moves over.

-- ---- settings -------------------------------------------------------------------------------------------------------
insert into public.game_config (key, value, description) values ('museum', jsonb_build_object(
  'enabled', true,
  'rooms_start', 5, 'rooms_max', 7, 'room_prices', jsonb_build_array(800, 1200),
  'loan_slots', 6, 'loan_days', 14, 'loan_request_days', 7, 'loan_open_max', 12,
  'loan_artist_admire_renown', 3, 'loan_artist_daily', 120,
  'secrets_per_piece', 3, 'secret_visitor_renown', 2, 'secret_artist_renown', 2, 'secret_visitor_daily', 30, 'secret_artist_daily', 120,
  'inside_min_seconds', 4,
  'exhibition_hours', 24, 'exhibition_every_days', 7, 'exhibition_notify_max', 50,
  'stamp_visitor_renown', 2, 'stamp_owner_renown', 3, 'stamp_owner_daily', 150
), 'The Museum (Art Domain): rooms, Loan Wing, sparks inside paintings, Exhibition Night. Renown only.')
on conflict (key) do nothing;

create or replace function private.mus_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('museum'), '{}'::jsonb) $$;

-- the Loan Wing's walls (w1, w2, …) hang beside the rooms' (r1l1 …)
alter table public.gallery_hangs drop constraint if exists gallery_hangs_slot_check;
alter table public.gallery_hangs add constraint gallery_hangs_slot_check check (slot ~ '^(r[1-9][lr][12]|w[1-9])$');

-- when you changed what you're doing in a place (stepping inside a painting counts from here)
alter table public.place_presence add column if not exists act_at timestamptz;
select private.fn_patch('public.place_live(text, real, real, text)',
  'act = excluded.act, joined_at',
  'act = excluded.act, act_at = case when v_new or place_presence.act is distinct from excluded.act then now() else place_presence.act_at end, joined_at');
select private.fn_patch('public.place_live(text, real, real, text)',
  'left(p_act, 32), now(), now() + private.presence_lease())',
  'left(p_act, 64), now(), now() + private.presence_lease(), now())');
select private.fn_patch('public.place_live(text, real, real, text)',
  'insert into public.place_presence (player_id, place, shard, x, z, act, joined_at, seen_at)',
  'insert into public.place_presence (player_id, place, shard, x, z, act, joined_at, seen_at, act_at)');
alter table public.place_presence add constraint place_presence_act_len check (act is null or length(act) <= 64) not valid;

-- ---- loans --------------------------------------------------------------------------------------------------------
create table if not exists public.museum_loans (
  id bigserial primary key,
  group_id uuid not null references public.canvas_groups (id) on delete cascade,
  publication_id uuid not null references public.artwork_publications (id) on delete cascade,
  artist_id uuid not null references public.players (id) on delete cascade,
  owner_id uuid not null references public.players (id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'active', 'declined', 'ended', 'expired')),
  note text check (note is null or length(note) <= 120),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  ends_at timestamptz
);
create index if not exists museum_loans_group_idx on public.museum_loans (group_id, status);
create index if not exists museum_loans_artist_idx on public.museum_loans (artist_id, status);
create index if not exists museum_loans_owner_idx on public.museum_loans (owner_id);
create index if not exists museum_loans_publication_idx on public.museum_loans (publication_id);
create unique index if not exists museum_loans_open on public.museum_loans (group_id, publication_id) where status in ('requested', 'active');
alter table public.museum_loans enable row level security;
revoke all on public.museum_loans from anon, authenticated;

-- ---- sparks inside paintings --------------------------------------------------------------------------------------
create table if not exists public.museum_secrets (
  publication_id uuid not null references public.artwork_publications (id) on delete cascade,
  visitor_id uuid not null references public.players (id) on delete cascade,
  n smallint not null check (n between 1 and 9),
  group_id uuid not null references public.canvas_groups (id) on delete cascade,
  artist_id uuid not null references public.players (id) on delete cascade,
  day date not null,
  visitor_renown int not null default 0,
  artist_renown int not null default 0,
  created_at timestamptz not null default now(),
  primary key (publication_id, visitor_id, n)
);
create index if not exists museum_secrets_visitor_idx on public.museum_secrets (visitor_id, day);
create index if not exists museum_secrets_artist_idx on public.museum_secrets (artist_id, day);
create index if not exists museum_secrets_group_idx on public.museum_secrets (group_id);
alter table public.museum_secrets enable row level security;
revoke all on public.museum_secrets from anon, authenticated;

-- ---- Exhibition Night -----------------------------------------------------------------------------------------------
create table if not exists public.museum_exhibitions (
  group_id uuid not null references public.canvas_groups (id) on delete cascade,
  no int not null,
  publication_id uuid not null references public.artwork_publications (id) on delete cascade,
  owner_id uuid not null references public.players (id) on delete cascade,
  opened_at timestamptz not null default now(),
  closes_at timestamptz not null,
  stamps int not null default 0,
  primary key (group_id, no)
);
create index if not exists museum_exhibitions_publication_idx on public.museum_exhibitions (publication_id);
create index if not exists museum_exhibitions_owner_idx on public.museum_exhibitions (owner_id);
alter table public.museum_exhibitions enable row level security;
revoke all on public.museum_exhibitions from anon, authenticated;

create table if not exists public.museum_stamps (
  player_id uuid not null references public.players (id) on delete cascade,
  group_id uuid not null,
  no int not null,
  owner_id uuid not null references public.players (id) on delete cascade,
  day date not null,
  visitor_renown int not null default 0,
  owner_renown int not null default 0,
  created_at timestamptz not null default now(),
  primary key (player_id, group_id, no),
  foreign key (group_id, no) references public.museum_exhibitions (group_id, no) on delete cascade
);
create index if not exists museum_stamps_exhibition_idx on public.museum_stamps (group_id, no);
create index if not exists museum_stamps_owner_idx on public.museum_stamps (owner_id, day);
alter table public.museum_stamps enable row level security;
revoke all on public.museum_stamps from anon, authenticated;

-- museum alerts (loan asked, loan answered, an exhibition opened)
alter table public.player_notifications drop constraint if exists player_notifications_kind_check;
alter table public.player_notifications add constraint player_notifications_kind_check check (kind in (
  'stamp', 'visit', 'checkin', 'inspire', 'sketch_vote', 'note', 'potd', 'duet', 'doodle',
  'friend_request', 'friend_accept', 'sanctuary_visit', 'playdate', 'warp', 'base_visit', 'neighbor', 'core', 'ultra_set', 'enchant', 'leviathan', 'power',
  'party_invite', 'party_join', 'chat_reply', 'meet_wave', 'star', 'gallery'));

-- ---- helpers --------------------------------------------------------------------------------------------------------
/** is this piece on loan to this museum right now */
create or replace function private.museum_on_loan(p_group uuid, p_publication uuid) returns boolean language plpgsql stable as $$
#variable_conflict use_column
begin
  return exists (select 1 from public.museum_loans where group_id = p_group and publication_id = p_publication and status = 'active' and ends_at > now());
end $$;

/** the museum group (Art Domain), or not found */
create or replace function private.museum_group(p_group uuid) returns public.canvas_groups language plpgsql stable security definer set search_path = public, pg_temp as $$
declare g public.canvas_groups%rowtype;
begin
  select * into g from public.canvas_groups where id = p_group;
  if not found or g.owner_id is null or g.kind <> 'museum' then raise exception 'not_found' using errcode = 'P0001'; end if;
  return g;
end $$;

/** loans that ran out, requests nobody answered: tidy (whenever anyone opens the museum) */
create or replace function private.museum_settle(p_group uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c jsonb := private.mus_cfg(); r record;
begin
  update public.museum_loans set status = 'expired', decided_at = now()
   where group_id = p_group and status = 'requested' and requested_at < now() - make_interval(days => coalesce((c ->> 'loan_request_days')::int, 7));
  for r in update public.museum_loans set status = 'ended', decided_at = now()
            where group_id = p_group and status = 'active' and ends_at <= now() returning publication_id loop
    delete from public.gallery_hangs where group_id = p_group and publication_id = r.publication_id and slot like 'w%';
  end loop;
end $$;

/** a loan as either side sees it */
create or replace function private.museum_loan_json(l public.museum_loans) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return jsonb_build_object('id', l.id, 'status', l.status, 'note', l.note, 'requested_at', l.requested_at, 'ends_at', l.ends_at,
    'group_id', l.group_id, 'piece', private.gal_piece(l.publication_id),
    'artist', private.profile_json(l.artist_id), 'owner', private.profile_json(l.owner_id),
    'slot', (select slot from public.gallery_hangs where group_id = l.group_id and publication_id = l.publication_id and slot like 'w%' limit 1));
end $$;

/** the museum's part of art_place */
create or replace function private.museum_json(p_group uuid, p_uid uuid, p_mine boolean) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c jsonb := private.mus_cfg(); e public.museum_exhibitions%rowtype; v_last timestamptz;
begin
  select * into e from public.museum_exhibitions where group_id = p_group order by no desc limit 1;
  select max(opened_at) into v_last from public.museum_exhibitions where group_id = p_group;
  return jsonb_build_object(
    'loans', (select coalesce(jsonb_agg(private.museum_loan_json(l) order by l.decided_at), '[]'::jsonb) from public.museum_loans l
               where l.group_id = p_group and l.status = 'active' and l.ends_at > now()),
    'requests', case when p_mine then (select coalesce(jsonb_agg(private.museum_loan_json(l) order by l.requested_at desc), '[]'::jsonb) from public.museum_loans l
               where l.group_id = p_group and l.status = 'requested') end,
    'exhibition', case when e.no is not null and e.closes_at > now() then jsonb_build_object('no', e.no, 'piece', private.gal_piece(e.publication_id),
                    'opened_at', e.opened_at, 'closes_at', e.closes_at, 'stamps', e.stamps,
                    'stamped', exists (select 1 from public.museum_stamps s where s.player_id = p_uid and s.group_id = p_group and s.no = e.no)) end,
    'next_exhibition_at', case when p_mine and v_last is not null then v_last + make_interval(days => coalesce((c ->> 'exhibition_every_days')::int, 7)) end,
    'exhibitions', (select count(*) from public.museum_exhibitions where group_id = p_group),
    'found', (select coalesce(jsonb_object_agg(x.publication_id, x.ns), '{}'::jsonb) from (
                select s.publication_id, jsonb_agg(s.n order by s.n) ns from public.museum_secrets s
                 where s.visitor_id = p_uid and s.publication_id in (select publication_id from public.gallery_hangs where group_id = p_group)
                 group by s.publication_id) x),
    'my_stamps', (select count(*) from public.museum_stamps where player_id = p_uid),
    'cfg', jsonb_build_object('loan_slots', c -> 'loan_slots', 'loan_days', c -> 'loan_days', 'secrets_per_piece', c -> 'secrets_per_piece',
                              'secret_visitor_renown', c -> 'secret_visitor_renown', 'exhibition_hours', c -> 'exhibition_hours',
                              'exhibition_every_days', c -> 'exhibition_every_days', 'stamp_visitor_renown', c -> 'stamp_visitor_renown',
                              'rooms_max', c -> 'rooms_max', 'room_prices', c -> 'room_prices', 'rooms_start', c -> 'rooms_start'));
end $$;

-- ---- the Gallery's functions learn the Museum -------------------------------------------------------------------------
-- a museum starts bigger (and an Estate grown into one gets its extra rooms)
select private.fn_patch('private.gal_hall(uuid)',
  'values (p_group, g.owner_id, greatest(1, least(9, coalesce((private.gal_cfg() ->> ''rooms_start'')::int, 3))))',
  'values (p_group, g.owner_id, greatest(1, least(9, coalesce(case when g.kind = ''museum'' then (private.mus_cfg() ->> ''rooms_start'')::int end, (private.gal_cfg() ->> ''rooms_start'')::int, 3))))');
select private.fn_patch('private.gal_hall(uuid)',
  '  return h;
end',
  '  if g.kind = ''museum'' and h.rooms < coalesce((private.mus_cfg() ->> ''rooms_start'')::int, 5) then
    update public.gallery_halls set rooms = least(9, coalesce((private.mus_cfg() ->> ''rooms_start'')::int, 5)), updated_at = now() where group_id = p_group returning * into h;
  end if;
  return h;
end');

-- rooms past the museum's start are priced by the museum
select private.fn_patch('public.gallery_add_room(uuid)',
  'h := private.gal_owner(p_group);',
  'h := private.gal_owner(p_group);
  if (select kind from public.canvas_groups where id = p_group) = ''museum'' then
    c := c || jsonb_build_object(''rooms_max'', private.mus_cfg() -> ''rooms_max'', ''room_prices'', private.mus_cfg() -> ''room_prices'', ''rooms_start'', private.mus_cfg() -> ''rooms_start'');
  end if;');

-- your own work hangs in the rooms; a piece on loan to you hangs in the Loan Wing
select private.fn_patch('public.gallery_hang(uuid, text, uuid, text, text, integer, integer, text, text)',
  'if p_slot !~ ''^r[1-9][lr][12]$'' or substring(p_slot from 2 for 1)::int > h.rooms then raise exception ''bad_slot'' using errcode = ''P0001''; end if;',
  'if p_slot ~ ''^w[1-9]$'' then
    if (select kind from public.canvas_groups where id = p_group) <> ''museum'' or substring(p_slot from 2)::int > coalesce((private.mus_cfg() ->> ''loan_slots'')::int, 6) then
      raise exception ''bad_slot'' using errcode = ''P0001'';
    end if;
    if not private.museum_on_loan(p_group, p_publication) then raise exception ''not_on_loan'' using errcode = ''P0001''; end if;
  elsif p_slot !~ ''^r[1-9][lr][12]$'' or substring(p_slot from 2 for 1)::int > h.rooms then raise exception ''bad_slot'' using errcode = ''P0001'';
  end if;');
select private.fn_patch('public.gallery_hang(uuid, text, uuid, text, text, integer, integer, text, text)',
  'if not found or a.owner_id <> v_uid or a.status',
  'if not found or (a.owner_id <> v_uid) <> (p_slot like ''w%'') or a.status');

-- the show is your own work: the Loan Wing isn't scored
select private.fn_patch('private.gallery_score(uuid)',
  'substring(slot from 2 for 1)::int <= coalesce(h.rooms, 3)',
  'slot like ''r%'' and substring(slot from 2 for 1)::int <= coalesce(h.rooms, 3)', true);

-- admiring a borrowed piece pays its artist too (same rules: an account old enough, with land; a daily limit)
select private.fn_patch('public.gallery_admire(uuid, uuid)',
  'if v_v > 0 then perform private.renown_add(v_uid, v_v, ''admire'', p_publication::text); end if;',
  'if v_v > 0 then perform private.renown_add(v_uid, v_v, ''admire'', p_publication::text); end if;
  if v_ok and private.museum_on_loan(p_group, p_publication) then perform private.museum_pay_artist(p_publication, ''loan_admired''); end if;');

/** an artist is paid for their piece hanging on loan (within the day's limit) */
create or replace function private.museum_pay_artist(p_publication uuid, p_reason text) returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare c jsonb := private.mus_cfg(); v_artist uuid; v_amt int := coalesce((c ->> 'loan_artist_admire_renown')::int, 3); v_today numeric;
begin
  select owner_id into v_artist from public.artwork_publications where id = p_publication;
  if v_artist is null or v_amt <= 0 then return 0; end if;
  select coalesce(sum(delta), 0) into v_today from public.renown_ledger where player_id = v_artist and reason = p_reason and created_at >= private.day_start(now());
  if v_today + v_amt > coalesce((c ->> 'loan_artist_daily')::int, 120) then return 0; end if;
  perform private.renown_add(v_artist, v_amt, p_reason, p_publication::text);
  return v_amt;
end $$;

-- art_place: the museum tier, its part, its old renown moves over
select private.fn_patch('public.art_place(uuid)',
  '''tier'', case when v_kind in (''atelier'', ''museum'') then ''gallery'' else ''studio'' end,',
  '''tier'', case v_kind when ''museum'' then ''museum'' when ''atelier'' then ''gallery'' else ''studio'' end,');
select private.fn_patch('public.art_place(uuid)',
  '      -- the first Gallery comes with a little Renown to start (once per player)',
  '      -- so does the old Starlight Museum''s (its realm wallet''s renown)
      select coalesce((wallet ->> ''renown'')::numeric, 0) into v_acclaim from public.realm_players where player_id = v_uid and kind = ''museum'';
      if coalesce(v_acclaim, 0) >= 1 then
        update public.realm_players set wallet = jsonb_set(wallet, ''{renown}'', to_jsonb(v_acclaim - floor(v_acclaim))) where player_id = v_uid and kind = ''museum'';
        perform private.renown_add(v_uid, floor(v_acclaim)::bigint, ''acclaim'', ''museum'');
      end if;
      -- the first Gallery comes with a little Renown to start (once per player)');
select private.fn_patch('public.art_place(uuid)',
  '    perform private.gallery_settle(p_group);',
  '    perform private.gallery_settle(p_group);
    if v_kind = ''museum'' then perform private.museum_settle(p_group); end if;');
select private.fn_patch('public.art_place(uuid)',
  '  if v_mine then
    out := out || jsonb_build_object(''works''',
  '  if v_kind = ''museum'' then out := out || jsonb_build_object(''museum'', private.museum_json(p_group, v_uid, v_mine)); end if;
  if v_mine then
    out := out || jsonb_build_object(''works''');

-- ---- loans ----------------------------------------------------------------------------------------------------------
/** a player's published pieces, for asking to borrow one (by username) */
create or replace function public.museum_find_pieces(p_group uuid, p_username text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g record; v_artist uuid;
begin
  perform private.rate_limit('museum_find', 240, 3600);
  g := private.museum_group(p_group);
  if g.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  select id into v_artist from public.profiles where lower(username) = lower(btrim(coalesce(p_username, ''))) limit 1;
  if v_artist is null or not private.visible_to(v_artist, v_uid) then raise exception 'no_such_player' using errcode = 'P0001'; end if;
  if v_artist = v_uid then raise exception 'own_art' using errcode = 'P0001'; end if;
  return jsonb_build_object('artist', private.profile_json(v_artist), 'pieces', (
    select coalesce(jsonb_agg(private.gal_piece(a.id) || jsonb_build_object(
             'loan', (select l.status from public.museum_loans l where l.group_id = p_group and l.publication_id = a.id and l.status in ('requested', 'active') limit 1))
           order by a.published_at desc nulls last), '[]'::jsonb)
      from (select * from public.artwork_publications where owner_id = v_artist and status = 'published' and coalesce(preview_path, thumb_path) is not null
             order by published_at desc nulls last limit 30) a));
end $$;

create or replace function public.museum_loan_request(p_group uuid, p_publication uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g record; a record; c jsonb := private.mus_cfg(); v_id bigint;
begin
  perform private.rate_limit('museum_loan', 60, 3600);
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'gallery_closed' using errcode = 'P0001'; end if;
  g := private.museum_group(p_group);
  if g.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform private.museum_settle(p_group);
  select id, owner_id, title, status, coalesce(preview_path, thumb_path) as img into a from public.artwork_publications where id = p_publication;
  if not found or a.status <> 'published' or a.img is null or not private.visible_to(a.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if a.owner_id = v_uid then raise exception 'own_art' using errcode = 'P0001'; end if;
  if exists (select 1 from public.museum_loans where group_id = p_group and publication_id = p_publication and status in ('requested', 'active')) then
    raise exception 'already_asked' using errcode = 'P0001';
  end if;
  if (select count(*) from public.museum_loans where group_id = p_group and status in ('requested', 'active')) >= coalesce((c ->> 'loan_open_max')::int, 12) then
    raise exception 'too_many_loans' using errcode = 'P0001';
  end if;
  insert into public.museum_loans (group_id, publication_id, artist_id, owner_id, note)
  values (p_group, p_publication, a.owner_id, v_uid, nullif(left(btrim(coalesce(p_note, '')), 120), '')) returning id into v_id;
  perform private.notify(a.owner_id, 'gallery', v_uid, jsonb_build_object('sub', 'loan_request', 'loan_id', v_id, 'title', a.title, 'publication_id', p_publication));
  return public.art_place(p_group);
end $$;

/** the loans of your art: what's asked of you, and what's out on loan */
create or replace function public.museum_loans() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.rate_limit('museum_loans', 600, 3600);
  update public.museum_loans set status = 'expired', decided_at = now()
   where artist_id = v_uid and status = 'requested' and requested_at < now() - make_interval(days => coalesce((private.mus_cfg() ->> 'loan_request_days')::int, 7));
  return jsonb_build_object(
    'asked', (select coalesce(jsonb_agg(private.museum_loan_json(l) order by l.requested_at desc), '[]'::jsonb) from public.museum_loans l
               where l.artist_id = v_uid and l.status = 'requested'),
    'out', (select coalesce(jsonb_agg(private.museum_loan_json(l) order by l.ends_at), '[]'::jsonb) from public.museum_loans l
               where l.artist_id = v_uid and l.status = 'active' and l.ends_at > now()));
end $$;

create or replace function public.museum_loan_answer(p_loan bigint, p_yes boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); l public.museum_loans%rowtype;
begin
  perform private.rate_limit('museum_loan', 60, 3600);
  select * into l from public.museum_loans where id = p_loan for update;
  if not found or l.artist_id <> v_uid then raise exception 'not_found' using errcode = 'P0001'; end if;
  if l.status <> 'requested' then raise exception 'loan_decided' using errcode = 'P0001'; end if;
  if p_yes then
    if not exists (select 1 from public.artwork_publications where id = l.publication_id and status = 'published') then raise exception 'not_found' using errcode = 'P0001'; end if;
    update public.museum_loans set status = 'active', decided_at = now(), ends_at = now() + make_interval(days => coalesce((private.mus_cfg() ->> 'loan_days')::int, 14))
     where id = p_loan;
  else
    update public.museum_loans set status = 'declined', decided_at = now() where id = p_loan;
  end if;
  perform private.notify(l.owner_id, 'gallery', v_uid, jsonb_build_object('sub', case when p_yes then 'loan_yes' else 'loan_no' end, 'loan_id', l.id,
    'group_id', l.group_id, 'title', (select title from public.artwork_publications where id = l.publication_id)));
  return public.museum_loans();
end $$;

/** either side ends a loan early (the piece comes down) */
create or replace function public.museum_loan_end(p_loan bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); l public.museum_loans%rowtype;
begin
  perform private.rate_limit('museum_loan', 60, 3600);
  select * into l from public.museum_loans where id = p_loan for update;
  if not found or v_uid not in (l.artist_id, l.owner_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if l.status not in ('requested', 'active') then raise exception 'loan_decided' using errcode = 'P0001'; end if;
  update public.museum_loans set status = 'ended', decided_at = now() where id = p_loan;
  delete from public.gallery_hangs where group_id = l.group_id and publication_id = l.publication_id and slot like 'w%';
  return jsonb_build_object('ok', true);
end $$;

-- ---- sparks inside paintings ----------------------------------------------------------------------------------------
/** you found spark n inside a painting hanging in this museum. You must be inside it (your place says so, for a few
    seconds at least) and in the museum's room. Pays you and the artist (once per spark per visitor, daily limits;
    accounts old enough, with land; nobody is paid for their own painting). */
create or replace function public.museum_secret(p_group uuid, p_publication uuid, p_n int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); g record; c jsonb := private.mus_cfg(); v_artist uuid; p public.place_presence%rowtype;
  v_day date := (private.day_start(now()) at time zone 'UTC')::date; v_v int := 0; v_a int := 0; v_ok boolean;
begin
  perform private.rate_limit('museum_secret', 300, 3600);
  g := private.museum_group(p_group);
  if not private.visible_to(g.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_n is null or p_n < 1 or p_n > coalesce((c ->> 'secrets_per_piece')::int, 3) then raise exception 'bad_secret' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.gallery_hangs where group_id = p_group and publication_id = p_publication) then raise exception 'not_hung' using errcode = 'P0001'; end if;
  select * into p from public.place_presence where player_id = v_uid;
  if not found or p.place <> 'gallery:' || p_group or p.seen_at <= now() - make_interval(secs => coalesce((private.cfg('places') ->> 'stale_seconds')::int, 12))
     or p.act is distinct from 'inside:' || p_publication or coalesce(p.act_at, now()) > now() - make_interval(secs => coalesce((c ->> 'inside_min_seconds')::int, 4)) then
    raise exception 'not_inside' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.museum_secrets where publication_id = p_publication and visitor_id = v_uid and n = p_n) then raise exception 'already_found' using errcode = 'P0001'; end if;
  select owner_id into v_artist from public.artwork_publications where id = p_publication;
  v_ok := private.old_enough(v_uid, coalesce((private.gal_cfg() ->> 'admire_min_account_hours')::numeric, 24)) and exists (select 1 from public.world_plots where owner_id = v_uid);
  if v_ok and v_artist <> v_uid then
    if (select coalesce(sum(visitor_renown), 0) from public.museum_secrets where visitor_id = v_uid and day = v_day) < coalesce((c ->> 'secret_visitor_daily')::int, 30) then
      v_v := coalesce((c ->> 'secret_visitor_renown')::int, 2);
    end if;
    if (select coalesce(sum(artist_renown), 0) from public.museum_secrets where artist_id = v_artist and day = v_day) < coalesce((c ->> 'secret_artist_daily')::int, 120) then
      v_a := coalesce((c ->> 'secret_artist_renown')::int, 2);
    end if;
  end if;
  insert into public.museum_secrets (publication_id, visitor_id, n, group_id, artist_id, day, visitor_renown, artist_renown)
  values (p_publication, v_uid, p_n, p_group, v_artist, v_day, v_v, v_a);
  insert into public.player_renown (player_id) values (v_uid) on conflict (player_id) do nothing;
  if v_v > 0 then perform private.renown_add(v_uid, v_v, 'spark', p_publication::text); end if;
  if v_a > 0 then perform private.renown_add(v_artist, v_a, 'spark_found', p_publication::text); end if;
  return jsonb_build_object('renown', v_v, 'artist_renown', v_a,
    'found', (select jsonb_agg(n order by n) from public.museum_secrets where publication_id = p_publication and visitor_id = v_uid),
    'me', (select renown from public.player_renown where player_id = v_uid));
end $$;

-- ---- Exhibition Night -------------------------------------------------------------------------------------------------
create or replace function public.museum_exhibition_open(p_group uuid, p_publication uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g record; c jsonb := private.mus_cfg(); v_last timestamptz; v_no int; v_title text; r record; v_n int := 0;
begin
  perform private.rate_limit('museum_exhibition', 30, 3600);
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'gallery_closed' using errcode = 'P0001'; end if;
  g := private.museum_group(p_group);
  if g.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('museum-exhibition:' || p_group));
  if not exists (select 1 from public.gallery_hangs where group_id = p_group and publication_id = p_publication) then raise exception 'not_hung' using errcode = 'P0001'; end if;
  select max(opened_at), coalesce(max(no), 0) into v_last, v_no from public.museum_exhibitions where group_id = p_group;
  if v_last is not null and v_last > now() - make_interval(days => coalesce((c ->> 'exhibition_every_days')::int, 7)) then
    raise exception 'exhibition_soon' using errcode = 'P0001';
  end if;
  insert into public.museum_exhibitions (group_id, no, publication_id, owner_id, closes_at)
  values (p_group, v_no + 1, p_publication, v_uid, now() + make_interval(hours => coalesce((c ->> 'exhibition_hours')::int, 24)));
  select title into v_title from public.artwork_publications where id = p_publication;
  -- the museum's recent visitors hear about it
  for r in select distinct a.visitor_id from public.gallery_admires a
            where a.group_id = p_group and a.created_at > now() - interval '30 days' and a.visitor_id <> v_uid
            limit coalesce((c ->> 'exhibition_notify_max')::int, 50) loop
    perform private.notify(r.visitor_id, 'gallery', v_uid, jsonb_build_object('sub', 'exhibition', 'group_id', p_group, 'title', v_title, 'no', v_no + 1));
    v_n := v_n + 1;
  end loop;
  return public.art_place(p_group) || jsonb_build_object('told', v_n);
end $$;

/** a visitor at the exhibition takes its stamp (once per exhibition): Renown for them and for the museum */
create or replace function public.museum_stamp(p_group uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); g record; c jsonb := private.mus_cfg(); e public.museum_exhibitions%rowtype;
  v_day date := (private.day_start(now()) at time zone 'UTC')::date; v_v int := 0; v_o int := 0; v_ok boolean;
begin
  perform private.rate_limit('museum_stamp', 120, 3600);
  g := private.museum_group(p_group);
  if g.owner_id = v_uid then raise exception 'own_gallery' using errcode = 'P0001'; end if;
  if not private.visible_to(g.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into e from public.museum_exhibitions where group_id = p_group and closes_at > now() order by no desc limit 1;
  if not found then raise exception 'no_exhibition' using errcode = 'P0001'; end if;
  if private.place_room(v_uid, 'gallery:' || p_group) is null then raise exception 'not_in_place' using errcode = 'P0001'; end if;
  if exists (select 1 from public.museum_stamps where player_id = v_uid and group_id = p_group and no = e.no) then raise exception 'already_stamped' using errcode = 'P0001'; end if;
  v_ok := private.old_enough(v_uid, coalesce((private.gal_cfg() ->> 'admire_min_account_hours')::numeric, 24)) and exists (select 1 from public.world_plots where owner_id = v_uid);
  if v_ok then
    v_v := coalesce((c ->> 'stamp_visitor_renown')::int, 2);
    if (select coalesce(sum(owner_renown), 0) from public.museum_stamps where owner_id = g.owner_id and day = v_day) < coalesce((c ->> 'stamp_owner_daily')::int, 150) then
      v_o := coalesce((c ->> 'stamp_owner_renown')::int, 3);
    end if;
  end if;
  insert into public.museum_stamps (player_id, group_id, no, owner_id, day, visitor_renown, owner_renown) values (v_uid, p_group, e.no, g.owner_id, v_day, v_v, v_o);
  update public.museum_exhibitions set stamps = stamps + 1 where group_id = p_group and no = e.no;
  insert into public.player_renown (player_id) values (v_uid) on conflict (player_id) do nothing;
  if v_v > 0 then perform private.renown_add(v_uid, v_v, 'stamp', p_group::text); end if;
  if v_o > 0 then perform private.renown_add(g.owner_id, v_o, 'stamped', p_group::text); end if;
  return jsonb_build_object('renown', v_v, 'no', e.no, 'stamps', e.stamps + 1,
    'my_stamps', (select count(*) from public.museum_stamps where player_id = v_uid),
    'me', (select renown from public.player_renown where player_id = v_uid));
end $$;

-- ---- grants ---------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['private.mus_cfg()', 'private.museum_on_loan(uuid, uuid)', 'private.museum_group(uuid)', 'private.museum_settle(uuid)',
    'private.museum_loan_json(public.museum_loans)', 'private.museum_json(uuid, uuid, boolean)', 'private.museum_pay_artist(uuid, text)'] loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
  end loop;
  foreach f in array array['public.museum_find_pieces(uuid, text)', 'public.museum_loan_request(uuid, uuid, text)', 'public.museum_loans()',
    'public.museum_loan_answer(bigint, boolean)', 'public.museum_loan_end(bigint)', 'public.museum_secret(uuid, uuid, integer)',
    'public.museum_exhibition_open(uuid, uuid)', 'public.museum_stamp(uuid)'] loop
    execute 'revoke all on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated';
  end loop;
end $$;
