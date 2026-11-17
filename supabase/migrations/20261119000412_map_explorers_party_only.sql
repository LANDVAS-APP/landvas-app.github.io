-- Other players' explorers show on the map (and can be found on it) only for someone in the same party. Everything
-- else stays as it was: never anyone on GPS, never near their real spot or heading home, only while online, only if
-- they show their explorer, never across a block.
select private.fn_patch('private.findable_json(uuid,uuid)',
  $a$  if not coalesce((c ->> 'enabled')::boolean, true) or p_player = p_viewer then return null; end if;$a$,
  $b$  if not coalesce((c ->> 'enabled')::boolean, true) or p_player = p_viewer then return null; end if;
  -- only your party: strangers' explorers never show
  if private.my_group(p_viewer) is null or private.my_group(p_player) is distinct from private.my_group(p_viewer) then return null; end if;$b$);
