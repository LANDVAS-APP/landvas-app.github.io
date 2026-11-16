-- Invite cards: how a player's invite link looks — the preview chats show for it, and the page a friend lands on.
--
-- A player picks a theme (one of eight), an emoji, a headline and a short message, and what to show off: their plots
-- (how many, the rarest), one of their published artworks, or nothing. The app draws the preview picture from that
-- (invite-cards/<uid>/<hash>.png) and the page at landvas.app/i/CODE shows the same card, live, to anyone — signed out
-- too. Words go through the same filter as chat (no links, no blocked words: refused, not masked).
-- Chats read a link's preview from the page's <head>, which the site builds at each deploy for every saved card
-- (scripts/prerender-share.mjs); the deploy then marks those codes built, and the app shares landvas.app/i/CODE once
-- its page exists (landvas.app/?ref=CODE until then — it opens the same landing page).

create table if not exists public.invite_cards (
  player_id uuid primary key references public.players (id) on delete cascade,
  theme text not null default 'aurora',
  emoji text,
  headline text check (headline is null or char_length(headline) between 1 and 60),
  message text check (message is null or char_length(message) between 1 and 180),
  showcase text not null default 'plots' check (showcase in ('plots', 'art', 'none')),
  art_id uuid references public.artwork_publications (id) on delete set null,
  image_path text,
  page_codes text[] not null default '{}',   -- codes whose landvas.app/i/CODE page the site has built
  page_at timestamptz,
  updated_at timestamptz not null default now());
create index if not exists invite_cards_art on public.invite_cards (art_id) where art_id is not null;
alter table public.invite_cards enable row level security;
revoke all on public.invite_cards from anon, authenticated;

create or replace function private.invite_themes() returns text[] language sql immutable as $$
  select array['aurora', 'sunset', 'ocean', 'forest', 'crown', 'midnight', 'candy', 'paper']
$$;
create or replace function private.invite_emojis() returns text[] language sql immutable as $$
  select array['🎨', '🗺️', '👑', '🔥', '🌈', '🚀', '🍀', '✨', '💎', '🎮', '🏰', '🐉']
$$;

/** a headline or message: tidy, no links, nothing the chat filter would mask (refused, not masked); blank → null */
create or replace function private.invite_text(p text, p_max int) returns text language plpgsql stable as $$
declare v text := regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g');
begin
  if v = '' then return null; end if;
  if char_length(v) > p_max then raise exception 'invite_card_too_long' using errcode = 'P0001'; end if;
  if v ~ '[\x01-\x1f\x7f<>{}\\]' or (current_setting('server_encoding') = 'UTF8' and exists (
       select 1 from unnest(array[8203, 8204, 8205, 8206, 8207, 8234, 8235, 8236, 8237, 8238, 8288, 8289, 8290, 8291, 8292, 8293,
                                  8294, 8295, 8296, 8297, 65279]) c where position(chr(c) in v) > 0)) then
    raise exception 'invite_card_text' using errcode = 'P0001';
  end if;
  if v ~* '(https?:|www\.|\.(com|net|org|io|gg|xyz|ru|co|me|tv|app|ly)(\M|/|$)|discord\.)' then
    raise exception 'invite_card_links' using errcode = 'P0001';
  end if;
  if private.chat_clean(v) <> v then raise exception 'invite_card_language' using errcode = 'P0001'; end if;
  return v;
end $$;

/** a player's card, with what it shows off (public: only public things) */
create or replace function private.invite_card_json(p_uid uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'saved', c.player_id is not null,
    'theme', coalesce(c.theme, 'aurora'), 'emoji', c.emoji, 'headline', c.headline, 'message', c.message,
    'showcase', coalesce(c.showcase, 'plots'),
    'art', (select jsonb_build_object('id', a.id, 'title', a.title, 'preview_path', a.preview_path, 'thumb_path', a.thumb_path, 'plot_count', a.plot_count)
              from public.artwork_publications a where a.id = c.art_id and a.owner_id = p_uid and a.status = 'published'),
    'stats', jsonb_build_object(
      'plots', (select count(*) from public.world_plots w where w.owner_id = p_uid),
      'best', (select jsonb_build_object('id', r.id, 'name', r.name, 'color', r.color) from public.world_plots w join public.plot_rarities r on r.id = w.rarity
                where w.owner_id = p_uid order by r.sort desc limit 1),
      'art', (select count(*) from public.artwork_publications a where a.owner_id = p_uid and a.status = 'published'),
      'crew', (select count(*) from public.referrals f where f.referrer_id = p_uid and f.status = 'rewarded')),
    'image_path', c.image_path, 'page_codes', coalesce(to_jsonb(c.page_codes), '[]'::jsonb), 'updated_at', c.updated_at)
  from (select p_uid id) x left join public.invite_cards c on c.player_id = x.id
$$;

-- ---- the player's own card ----------------------------------------------------------------------------------------
create or replace function public.my_invite_card() returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return private.invite_card_json(v_uid) || jsonb_build_object(
    'themes', to_jsonb(private.invite_themes()), 'emojis', to_jsonb(private.invite_emojis()),
    'arts', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'thumb_path', a.thumb_path, 'preview_path', a.preview_path) order by a.created_at desc), '[]'::jsonb)
               from (select * from public.artwork_publications where owner_id = v_uid and status = 'published' order by created_at desc limit 40) a));
end $$;

create or replace function public.invite_card_set(p_theme text, p_emoji text, p_headline text, p_message text, p_showcase text, p_art_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_head text; v_msg text;
begin
  perform private.rate_limit('invite_card', 40, 3600);
  if not coalesce((private.cfg('referrals') -> 'cards' ->> 'enabled')::boolean, true) then raise exception 'invite_cards_off' using errcode = 'P0001'; end if;
  if p_theme is null or not (p_theme = any (private.invite_themes())) then raise exception 'invite_card_theme' using errcode = 'P0001'; end if;
  if p_emoji is not null and not (p_emoji = any (private.invite_emojis())) then raise exception 'invite_card_text' using errcode = 'P0001'; end if;
  if coalesce(p_showcase, '') not in ('plots', 'art', 'none') then raise exception 'invite_card_showcase' using errcode = 'P0001'; end if;
  if p_showcase = 'art' and not exists (select 1 from public.artwork_publications where id = p_art_id and owner_id = v_uid and status = 'published') then
    raise exception 'invite_card_art' using errcode = 'P0001';
  end if;
  perform private.ensure_referral_code(v_uid);   -- (so the site can build the card's link page)
  v_head := private.invite_text(p_headline, 60);
  v_msg := private.invite_text(p_message, 180);
  insert into public.invite_cards (player_id, theme, emoji, headline, message, showcase, art_id, updated_at)
  values (v_uid, p_theme, p_emoji, v_head, v_msg, p_showcase, case when p_showcase = 'art' then p_art_id end, now())
  on conflict (player_id) do update set theme = excluded.theme, emoji = excluded.emoji, headline = excluded.headline, message = excluded.message,
    showcase = excluded.showcase, art_id = excluded.art_id, updated_at = now();
  return public.my_invite_card();
end $$;

/** the preview picture the app drew for the card (a path in the player's own folder of invite-cards) */
create or replace function public.invite_card_image(p_path text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.rate_limit('invite_card_image', 40, 3600);
  if p_path is not null and p_path !~ ('^' || v_uid::text || '/[0-9a-f]{16,64}\.(png|jpg|webp)$') then raise exception 'invite_card_image' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.invite_cards where player_id = v_uid) then raise exception 'invite_card_image' using errcode = 'P0001'; end if;
  update public.invite_cards set image_path = p_path where player_id = v_uid;
  return public.my_invite_card();
end $$;

-- ---- what a friend sees (anyone, signed out too) --------------------------------------------------------------------
/** the landing page for an invite code: who invited you, their card, and what you get. Nothing for a code that
 *  doesn't exist or a player who can't play. */
create or replace function public.invite_card(p_code text) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_code text := upper(btrim(coalesce(p_code, ''))); v_uid uuid; c jsonb := coalesce(private.cfg('referrals'), '{}'::jsonb);
begin
  if v_code !~ '^[A-Z0-9_]{3,20}$' then return null; end if;
  select player_id into v_uid from public.referral_codes where code = v_code;
  if v_uid is null then select id into v_uid from public.profiles where upper(username) = v_code; end if;   -- (a username works as a code)
  if v_uid is null or not exists (select 1 from public.players where id = v_uid and status = 'active') then return null; end if;
  return jsonb_build_object(
    'code', v_code,
    'player', (select jsonb_build_object('username', p.username, 'display_name', p.display_name, 'avatar_seed', p.avatar_seed, 'avatar_style', p.avatar_style,
                                         'accent_color', p.accent_color, 'avatar_path', p.avatar_path, 'explorer_style', p.explorer_style)
                 from public.profiles p where p.id = v_uid),
    'card', private.invite_card_json(v_uid) - 'page_codes' - 'updated_at',
    'enabled', coalesce((c ->> 'enabled')::boolean, true),
    'referee_reward_ink', coalesce((c ->> 'referee_reward_ink')::int, 0),
    'is_me', coalesce(v_uid = auth.uid(), false));
end $$;
revoke all on function public.invite_card(text) from public;
grant execute on function public.invite_card(text) to anon, authenticated;

-- ---- link pages (the site builds one per saved card at each deploy) --------------------------------------------------
/** every saved card's codes and words, for the build (public things only: players chose to show these) */
create or replace function public.invite_cards_for_pages() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'codes', (select jsonb_agg(code order by kind desc) from public.referral_codes k where k.player_id = c.player_id),
    'username', p.username, 'display_name', p.display_name, 'emoji', c.emoji, 'headline', c.headline, 'message', c.message,
    'image_path', c.image_path,
    'art_path', (select coalesce(a.preview_path, a.thumb_path) from public.artwork_publications a where a.id = c.art_id and a.owner_id = c.player_id and a.status = 'published'))), '[]'::jsonb)
  from (select * from public.invite_cards order by updated_at desc limit 20000) c
  join public.players pl on pl.id = c.player_id and pl.status = 'active'
  join public.profiles p on p.id = c.player_id
$$;
revoke all on function public.invite_cards_for_pages() from public;
grant execute on function public.invite_cards_for_pages() to anon, authenticated;

/** after a deploy: these codes have their own page now (the app starts sharing landvas.app/i/CODE for them) */
create or replace function private.invite_pages_built(p_codes text[]) returns int language sql as $$
  with k as (select player_id, array_agg(code) codes from public.referral_codes where code = any (p_codes) group by player_id),
  u as (update public.invite_cards c set page_codes = k.codes, page_at = now() from k where c.player_id = k.player_id returning 1)
  select count(*)::int from u
$$;

revoke all on function private.invite_themes(), private.invite_emojis(), private.invite_text(text, int), private.invite_card_json(uuid),
  private.invite_pages_built(text[]) from public, anon, authenticated;
revoke all on function public.my_invite_card(), public.invite_card_set(text, text, text, text, text, uuid), public.invite_card_image(text) from public, anon;
grant execute on function public.my_invite_card(), public.invite_card_set(text, text, text, text, text, uuid), public.invite_card_image(text) to authenticated;
