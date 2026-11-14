-- Fix: sacrificing an unhatched egg at the Altar of Luck gave the egg back.
-- The 3-eggs-a-day cap (private.eggs_today) counted the rows still in inkborn_eggs, and luck_sacrifice_egg deletes the
-- row. Each sacrifice freed that day's egg slot again, so playdate -> egg -> sacrifice -> playdate ... had no end and
-- gave unlimited Luck. From now on every egg laid is written to a log the altar never touches, and the cap counts that
-- log. An egg you sacrificed still counts as one of your eggs for the day.

create table if not exists private.egg_lays (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.players (id) on delete cascade,
  laid_at timestamptz not null default now()
);
create index if not exists egg_lays_owner_idx on private.egg_lays (owner_id, laid_at desc);
revoke all on private.egg_lays from anon, authenticated;

create or replace function private.egg_lay_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into private.egg_lays (owner_id, laid_at) values (new.owner_id, new.laid_at);
  -- only today matters for the cap: keep a couple of days per keeper
  delete from private.egg_lays where owner_id = new.owner_id and laid_at < now() - interval '3 days';
  return null;
end $$;
drop trigger if exists inkborn_eggs_lay_log on public.inkborn_eggs;
create trigger inkborn_eggs_lay_log after insert on public.inkborn_eggs for each row execute function private.egg_lay_trg();

-- what's already been laid lately, plus the eggs already sacrificed (the altar posted each one to the feed), so nobody
-- who looped today gets fresh slots back when this goes live
insert into private.egg_lays (owner_id, laid_at)
select owner_id, laid_at from public.inkborn_eggs where laid_at >= now() - interval '3 days';
insert into private.egg_lays (owner_id, laid_at)
select player_id, created_at from public.feed_events
 where kind = 'luck' and data ->> 'sub' = 'sacrifice' and data ->> 'what' = 'egg' and created_at >= now() - interval '3 days'
   and player_id in (select id from public.players);

/** How many eggs this player has been given today (as the one who asked or the one who hosted), sacrificed ones included. */
create or replace function private.eggs_today(p_uid uuid) returns int language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from private.egg_lays where owner_id = p_uid and laid_at >= private.day_start(now())
$$;
