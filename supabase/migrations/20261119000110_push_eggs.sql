-- v0.7.4 A new egg from a playdate is pushed to its owner's phone, instead of the eggs panel asking every 30 seconds.
-- (Hatching countdowns already run on the phone; only new eggs needed the check.)
create or replace function private.push_egg_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.push_player(new.owner_id, 'eggs');
  return null;
end $$;
drop trigger if exists inkborn_eggs_push on public.inkborn_eggs;
create trigger inkborn_eggs_push after insert on public.inkborn_eggs for each row execute function private.push_egg_trg();
