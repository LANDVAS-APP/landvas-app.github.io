-- v0.33.1 Fix: the hosted API runs functions declared STABLE or IMMUTABLE in a read-only
-- transaction, but private.require_active_player() records the player's last activity (a write) —
-- so every such function failed in production (the planet map, meteor showers, the sanctuary
-- directory, the Inkborn economy panel and more), while the tests, which don't use read-only
-- transactions, passed. Make every public function that checks the player VOLATILE.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.provolatile in ('s', 'i') and p.prosrc like '%require_active_player%'
  loop
    execute format('alter function %s volatile', r.sig);
  end loop;
end $$;
