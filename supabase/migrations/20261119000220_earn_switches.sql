-- Earning switches: the owner can stop any way of earning, live, from admin.landvas.app → Live control → Earning
-- switches. Nothing errors and nothing reloads: the game keeps playing exactly as before, it just pays nothing there
-- while the switch is off (Ink, pigments and brush points; for rent switches, that rent extra or multiplier).
--
-- A switch is a key. Every payout carries the keys that describe it, and if any of them is switched off it pays 0:
--   all                         every Ink payout in the game
--   reason:<reason>             a whole source (minigame, arcade, enchantment, farm, realm, space, referral, …)
--   ref:<ref type>              a kind of payout inside a source (e.g. ref:rarity_power = ultra & Primordial powers)
--   plotkind:<kind>             a plot type (arcade, boardwalk, farm, business, mine, sky, diner, dungeon, …)
--   arcade.game:<game>          one arcade cabinet or carnival booth   arcade.mirror · arcade.secret:<id>
--   arcade.match · arcade.daily · arcade.tickets (tickets too, not just Ink)
--   minigame:<game>             one plot minigame
--   ench:<kind>                 one enchantment (Golden Goose, Genie, …)
--   splice · splice.with:<kind> · splice:<a>+<b>   all splice bonuses, any splice with one kind, one exact pair
--   mult:rarity · mult:rarity:<id> · mult:plot_level · mult:boost · mult:enchant · mult:arcade_hot   multipliers (→ ×1)
--   rent.extra:landlord · rent.extra:abilities · rent.extra:daily · rent.extra:crown · rent.mult:abilities   rent
-- Switched-off payouts are counted (how many, how much) so the owner sees what's being held back.

-- ---- a small helper: patch a function's current definition (fails loudly if the snippet isn't there) -------------
create or replace function private.fn_patch(p_fn text, p_from text, p_to text, p_all boolean default false) returns void language plpgsql as $$
declare d text; n text; i int;
begin
  d := pg_get_functiondef(p_fn::regprocedure);
  i := position(p_from in d);
  if i = 0 then raise exception 'fn_patch: % — snippet not found: %', p_fn, left(p_from, 120); end if;
  n := case when p_all then replace(d, p_from, p_to) else overlay(d placing p_to from i for length(p_from)) end;
  execute n;
end $$;
revoke all on function private.fn_patch(text, text, text, boolean) from public;

-- ---- the switches -----------------------------------------------------------------------------------------------
create table if not exists private.earn_switches (
  key text primary key check (key ~ '^[a-z0-9_.:+\-]+$' and length(key) between 3 and 80),
  note text,
  set_by uuid references public.players (id) on delete set null,
  set_at timestamptz not null default now());
create index if not exists earn_switches_by on private.earn_switches (set_by) where set_by is not null;

create table if not exists private.earn_blocked (
  key text not null, day date not null default current_date, n int not null default 0, amount bigint not null default 0,
  last_at timestamptz not null default now(), primary key (key, day));

create or replace function private.earn_any_off() returns boolean language sql stable as $$
  select exists (select 1 from private.earn_switches)
$$;

create or replace function private.earn_off(p_keys text[]) returns boolean language sql stable as $$
  select exists (select 1 from private.earn_switches where key = any (p_keys))
$$;

/** the first switched-off key among these (null when none) */
create or replace function private.earn_hit(p_keys text[]) returns text language sql stable as $$
  select key from private.earn_switches where key = any (p_keys) order by key limit 1
$$;

create or replace function private.is_uuid(p text) returns boolean language sql immutable as $$
  select coalesce(p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false)
$$;

/** every key that describes a payout (only looked up when at least one switch is off) */
create or replace function private.earn_keys(p_reason text, p_ref_type text, p_ref_id text) returns text[] language plpgsql stable security definer set search_path = public, pg_temp as $$
declare k text[] := array['all', 'reason:' || coalesce(p_reason, '')]; v_ctx text := coalesce(current_setting('landvas.earn_ctx', true), '');
  v_id text; v_game text; v_kind text; v_arc uuid;
begin
  if p_ref_type is not null then k := k || ('ref:' || p_ref_type); end if;
  if v_ctx <> '' then k := k || string_to_array(v_ctx, ','); end if;
  -- the plot types a source belongs to
  k := k || case p_reason when 'farm' then array['plotkind:farm'] when 'business' then array['plotkind:business']
                          when 'travel' then array['plotkind:train', 'plotkind:plane'] else '{}'::text[] end;
  begin
    if p_reason = 'arcade' then
      if p_ref_type = 'arcade_mirror' then
        k := k || array['arcade.mirror'];
        v_id := regexp_replace(coalesce(p_ref_id, ''), '^arcade_mirror:', '');
        if private.is_uuid(v_id) then select game into v_game from public.arcade_mirror_plays where id = v_id::uuid; end if;
        if v_game is not null then k := k || ('arcade.game:' || v_game); end if;
      elsif p_ref_type = 'arcade_secret' then
        v_id := regexp_replace(coalesce(p_ref_id, ''), '^arcade_secret:', '');
        if private.is_uuid(v_id) then select 'arcade.secret:' || secret into v_kind from public.arcade_secret_plays where id = v_id::uuid; end if;
        k := k || coalesce(v_kind, 'arcade.secret');
      elsif p_ref_id like 'arcade:%' then
        v_id := substr(p_ref_id, 8);
        if private.is_uuid(v_id) then select game, arcade_id into v_game, v_arc from public.arcade_plays where id = v_id::uuid; end if;
        if v_game is not null then k := k || ('arcade.game:' || v_game); end if;
      elsif p_ref_id like 'arcade-match:%' then
        k := k || array['arcade.match'];
        v_id := substr(p_ref_id, 14);
        if private.is_uuid(v_id) then select game, arcade_id into v_game, v_arc from public.arcade_matches where id = v_id::uuid; end if;
        if v_game is not null then k := k || ('arcade.game:' || v_game); end if;
      elsif p_ref_id = 'daily' then
        k := k || array['arcade.daily'];
      end if;
      if v_arc is not null then
        select 'plotkind:' || g.kind into v_kind from public.arcades a join public.canvas_groups g on g.id = a.group_id where a.id = v_arc;
      end if;
      k := k || coalesce(v_kind, 'plotkind:arcade');
    elsif p_reason = 'minigame' and p_ref_type = 'minigame_session' and private.is_uuid(p_ref_id) then
      select game into v_game from public.minigame_sessions where id = p_ref_id::uuid;
      if v_game is not null then k := k || ('minigame:' || v_game); end if;
    elsif p_reason = 'minigame' and p_ref_type = 'home_game' then
      k := k || array['minigame:home', 'plotkind:home'];
    elsif p_reason = 'enchantment' and private.is_uuid(p_ref_id) then
      select kind into v_kind from public.enchantments where id = p_ref_id::uuid;
      if v_kind is null and p_ref_type = 'seek_chest' then select finder_kind into v_kind from public.seek_chests where id::text = p_ref_id; end if;
      if v_kind is not null then k := k || ('ench:' || v_kind); end if;
    end if;
  exception when others then null; -- a key lookup never stops a payout from being judged
  end;
  return k;
end $$;

/** count what a switch held back */
create or replace function private.earn_note(p_key text, p_amount bigint) returns void language sql security definer set search_path = public, pg_temp as $$
  insert into private.earn_blocked (key, day, n, amount) values (p_key, current_date, 1, greatest(coalesce(p_amount, 0), 0))
  on conflict (key, day) do update set n = private.earn_blocked.n + 1, amount = private.earn_blocked.amount + excluded.amount, last_at = now()
$$;

/** is this payout switched off? (counts it when it is) */
create or replace function private.earn_stopped(p_reason text, p_ref_type text, p_ref_id text, p_amount bigint default 0) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_hit text;
begin
  if not private.earn_any_off() then return false; end if;
  v_hit := private.earn_hit(private.earn_keys(p_reason, p_ref_type, p_ref_id));
  if v_hit is null then return false; end if;
  perform private.earn_note(v_hit, p_amount);
  return true;
end $$;

-- ---- every payout checks its switches -------------------------------------------------------------------------
-- grant: a switched-off payout pays nothing (no error), whatever the resource; Crowns get their own reason
select private.fn_patch('private.grant(uuid,jsonb,text,text,text,text)',
  'declare r record; v_amt bigint;
begin',
  'declare r record; v_amt bigint;
begin
  -- an earning switch is off for this payout: it pays nothing (and the game carries on)
  if private.earn_any_off() and (select coalesce(sum(greatest(value::bigint, 0)), 0) > 0 from jsonb_each_text(coalesce(p_reward, ''{}''::jsonb)) where key in (''ink'', ''pigments'', ''brush_points'', ''gallery_tokens''))
     and private.earn_stopped(p_reason, p_ref_type, p_ref_id, coalesce((p_reward ->> ''ink'')::bigint, 0)) then
    return;
  end if;');
select private.fn_patch('private.grant(uuid,jsonb,text,text,text,text)', '''group_game'', ''enchantment'', ''leviathan'')', '''group_game'', ''enchantment'', ''leviathan'', ''crown'')');

-- grant_ink_paced reports what it really paid, so a switched-off payout shows +0 everywhere
select private.fn_patch('private.grant_ink_paced(uuid,integer,text,text,text,text)',
  '  v := private.ink_pace(p_uid, p_amount, p_reason);',
  '  if coalesce(p_amount, 0) > 0 and private.earn_stopped(p_reason, p_ref_type, p_ref_id, p_amount) then return 0; end if;
  v := private.ink_pace(p_uid, p_amount, p_reason);');

-- an invite's share of what the invited player earns
select private.fn_patch('private.referral_share(uuid,bigint,text)',
  '  if p_amount <= 0 or not coalesce((s ->> ''enabled'')::boolean, false) then return; end if;',
  '  if p_amount <= 0 or not coalesce((s ->> ''enabled'')::boolean, false) then return; end if;
  if private.earn_any_off() and private.earn_off(array[''all'', ''reason:referral_share'', ''reason:referral'']) then perform private.earn_note(''reason:referral_share'', 0); return; end if;');

-- realms: which realm paid
select private.fn_patch('private.rlm_pay(uuid,text,integer,text,text)',
  '    v_pay := private.grant_ink_paced(p_uid, v_pay, ''realm'', ''realm'', p_ref, p_idem);',
  '    perform set_config(''landvas.earn_ctx'', ''plotkind:'' || p_kind, true);
    v_pay := private.grant_ink_paced(p_uid, v_pay, ''realm'', ''realm'', p_ref, p_idem);
    perform set_config(''landvas.earn_ctx'', '''', true);');

-- plot minigames: the rarity / plot level / live boost multipliers, and the game itself (so the result shows +0)
select private.fn_patch('public.svc_finish_minigame(uuid,jsonb)',
  '    v_mult := (1 + coalesce((v_game ->> ''plot_level_bonus'')::numeric',
  '    if private.earn_any_off() then
      if private.earn_off(array[''mult:rarity'', ''mult:rarity:'' || coalesce((select rarity from public.world_plots where gx = v_s.gx and gy = v_s.gy), '''')]) then v_rarity_mult := 1; end if;
      if private.earn_off(array[''mult:plot_level'']) then v_plot_level := 1; end if;
    end if;
    v_mult := (1 + coalesce((v_game ->> ''plot_level_bonus'')::numeric');
select private.fn_patch('public.svc_finish_minigame(uuid,jsonb)',
  '    v_ink_mult := v_mult * greatest(',
  '    if private.earn_any_off() and private.earn_off(array[''mult:boost'']) then v_boost := 1; end if;
    v_ink_mult := v_mult * greatest(');
select private.fn_patch('public.svc_finish_minigame(uuid,jsonb)',
  '      v_ink := private.ink_pace(v_s.player_id, v_ink, ''minigame'');',
  '      if v_ink > 0 and private.earn_stopped(''minigame'', ''minigame_session'', p_session_id::text, v_ink) then v_ink := 0; end if;
      v_ink := private.ink_pace(v_s.player_id, v_ink, ''minigame'');');

-- enchantments: one kind off pays nothing; a splice off leaves out that splice's bonus
select private.fn_patch('private.ench_pay(uuid,numeric,text)',
  '  if e.owner_id is null or v <= 0 then return jsonb_build_object(''paid'', 0, ''base'', 0, ''mods'', ''[]''::jsonb, ''chests'', 0); end if;',
  '  if e.owner_id is null or v <= 0 then return jsonb_build_object(''paid'', 0, ''base'', 0, ''mods'', ''[]''::jsonb, ''chests'', 0); end if;
  if private.earn_any_off() and private.earn_off(array[''all'', ''reason:enchantment'', ''ref:enchantment'', ''ench:'' || e.kind]) then
    perform private.earn_note(private.earn_hit(array[''all'', ''reason:enchantment'', ''ref:enchantment'', ''ench:'' || e.kind]), round(v)::bigint);
    return jsonb_build_object(''paid'', 0, ''base'', 0, ''mods'', ''[]''::jsonb, ''chests'', 0, ''paused'', true);
  end if;');
select private.fn_patch('private.ench_pay(uuid,numeric,text)',
  '  for p in select * from jsonb_array_elements(private.ench_partners(p_id)) loop',
  '  for p in select * from jsonb_array_elements(private.ench_partners(p_id)) loop
    continue when private.earn_any_off() and private.earn_off(array[''splice'', ''splice.with:'' || e.kind, ''splice.with:'' || coalesce(p ->> ''kind'', ''plot''),
      ''splice:'' || least(e.kind, coalesce(p ->> ''kind'', ''plot'')) || ''+'' || greatest(e.kind, coalesce(p ->> ''kind'', ''plot''))]);');

-- multipliers and rent extras: wrap the function (same volatility), keep the original under __raw.
-- ('all' stops Ink; rent has its own switches, so the rent wrappers don't listen to 'all')
do $wrap$
declare w record; v_vol text;
begin
  for w in select * from (values
    ('ench_minigame_mult', 'p_uid uuid, p_gx integer, p_gy integer', 'p_uid, p_gx, p_gy', array['mult:enchant'], '1'),
    ('rent_mult',          'p_uid uuid',                              'p_uid',             array['rent.mult:abilities'], '1'),
    ('landlord_extra',     'p_uid uuid, p_settled_at timestamp with time zone', 'p_uid, p_settled_at', array['rent.extra:landlord'], '0'),
    ('ability_extra',      'p_uid uuid, p_settled_at timestamp with time zone', 'p_uid, p_settled_at', array['rent.extra:abilities'], '0'),
    ('daily_extra',        'p_uid uuid, p_from timestamp with time zone, p_to timestamp with time zone', 'p_uid, p_from, p_to', array['rent.extra:daily'], '0')
  ) as t(fn, args, call, keys, off_value) loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = w.fn || '__raw') then
      execute format('alter function private.%I(%s) rename to %I', w.fn, w.args, w.fn || '__raw');
    end if;
    select case p.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end into v_vol
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = w.fn || '__raw';
    if v_vol = 'immutable' then v_vol := 'stable'; end if;
    execute format($f$create or replace function private.%I(%s) returns numeric language sql %s as $b$
      select case when private.earn_any_off() and private.earn_off(%L::text[]) then %s::numeric else private.%I(%s) end
    $b$ $f$, w.fn, w.args, v_vol, w.keys, w.off_value, w.fn || '__raw', w.call);
  end loop;
end $wrap$;

-- ---- what the owner sees and switches ---------------------------------------------------------------------------
/** every switch, grouped, with what each earned in the last 24 h and what's been held back */
create or replace function public.admin_earn_switches() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); v_reasons jsonb; v_refs jsonb; arc jsonb := private.cfg('arcade');
begin
  -- what each source and kind of payout earned in the last day
  select coalesce(jsonb_object_agg(reason, ink), '{}'::jsonb) into v_reasons from (
    select reason, sum(delta)::bigint ink from public.resource_ledger
     where resource = 'ink' and delta > 0 and created_at > now() - interval '24 hours' group by reason) z;
  select coalesce(jsonb_object_agg(ref_type, ink), '{}'::jsonb) into v_refs from (
    select ref_type, sum(delta)::bigint ink from public.resource_ledger
     where resource = 'ink' and delta > 0 and created_at > now() - interval '24 hours' and ref_type is not null group by ref_type) z;
  return jsonb_build_object(
    'off', coalesce((select jsonb_agg(jsonb_build_object('key', s.key, 'note', s.note, 'at', s.set_at, 'by', pr.username) order by s.set_at desc)
                       from private.earn_switches s left join public.profiles pr on pr.id = s.set_by), '[]'::jsonb),
    'held', coalesce((select jsonb_object_agg(key, jsonb_build_object('n', n, 'amount', amount, 'last_at', last_at)) from (
                        select key, sum(n)::int n, sum(amount)::bigint amount, max(last_at) last_at from private.earn_blocked
                         where day > current_date - 7 group by key) b), '{}'::jsonb),
    'reasons', v_reasons, 'refs', v_refs,
    'arcade_games', coalesce((select jsonb_agg(jsonb_build_object('id', k, 'name', g ->> 'name', 'emoji', g ->> 'emoji', 'where', 'Arcade') order by (g ->> 'order')::int)
                                from jsonb_each(arc -> 'games') e(k, g)), '[]'::jsonb)
                    || coalesce((select jsonb_agg(jsonb_build_object('id', k, 'name', g ->> 'name', 'emoji', g ->> 'emoji', 'where', 'Carnival') order by (g ->> 'order')::int)
                                from jsonb_each(arc -> 'carnival' -> 'games') e(k, g)), '[]'::jsonb),
    'secrets', coalesce((select jsonb_agg(id order by id) from private.arcade_secrets), '[]'::jsonb),
    'minigames', coalesce((select jsonb_agg(jsonb_build_object('id', k, 'name', coalesce(g ->> 'name', initcap(k)))) from jsonb_each(private.cfg('minigames') -> 'games') e(k, g)), '[]'::jsonb),
    'enchantments', coalesce((select jsonb_agg(jsonb_build_object('id', k, 'name', private.ench_info(k) ->> 'name', 'emoji', private.ench_info(k) ->> 'emoji')) from unnest(private.ench_kinds()) k), '[]'::jsonb),
    'plot_kinds', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by sort) from public.plot_kinds), '[]'::jsonb),
    'rarities', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'tier', tier, 'mult', ink_reward_multiplier) order by sort) from public.plot_rarities where ink_reward_multiplier > 1), '[]'::jsonb));
end $$;

/** switch one off (p_off = true) or back on */
create or replace function public.admin_earn_switch(p_key text, p_off boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); v_key text := lower(btrim(coalesce(p_key, '')));
begin
  if v_key !~ '^[a-z0-9_.:+\-]+$' or length(v_key) not between 3 and 80 then raise exception 'invalid_key' using errcode = 'P0001'; end if;
  if p_off then
    insert into private.earn_switches (key, note, set_by) values (v_key, nullif(btrim(coalesce(p_note, '')), ''), v_uid)
    on conflict (key) do update set note = excluded.note, set_by = excluded.set_by, set_at = now();
  else
    delete from private.earn_switches where key = v_key;
  end if;
  perform private.audit(case when p_off then 'earn.switch_off' else 'earn.switch_on' end, 'earn_switch', v_key, jsonb_build_object('note', p_note));
  return public.admin_earn_switches();
end $$;

revoke all on function public.admin_earn_switches() from public, anon;
revoke all on function public.admin_earn_switch(text, boolean, text) from public, anon;
grant execute on function public.admin_earn_switches() to authenticated;
grant execute on function public.admin_earn_switch(text, boolean, text) to authenticated;
