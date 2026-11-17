-- Invite cards' switch (Admin → Social → Invite rewards → "Invite cards", game_config 'referrals' → cards.enabled):
-- off, nobody can change their card, every invite page shows the plain LANDVAS card again, and the next deploy builds
-- no custom link previews. On again, saved cards come back as they were.
create or replace function private.invite_cards_on() returns boolean language sql stable as $$
  select coalesce((private.cfg('referrals') -> 'cards' ->> 'enabled')::boolean, true)
$$;

select private.fn_patch('private.invite_card_json(uuid)',
  'from (select p_uid id) x left join public.invite_cards c on c.player_id = x.id',
  'from (select p_uid id) x left join public.invite_cards c on c.player_id = x.id and private.invite_cards_on()');

select private.fn_patch('public.my_invite_card()',
  $a$'themes', to_jsonb(private.invite_themes()),$a$,
  $b$'enabled', private.invite_cards_on(), 'themes', to_jsonb(private.invite_themes()),$b$);

select private.fn_patch('public.invite_cards_for_pages()',
  'from (select * from public.invite_cards order by updated_at desc limit 20000) c',
  'from (select * from public.invite_cards where private.invite_cards_on() order by updated_at desc limit 20000) c');

revoke all on function private.invite_cards_on() from public, anon, authenticated;
