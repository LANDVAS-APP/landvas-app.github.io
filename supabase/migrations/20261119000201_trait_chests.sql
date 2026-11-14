-- Splice Traits you can see and use.
--
-- 🗺️ Seeking used to add "+50, a buried chest" to a reward without there being any chest to find. Now it really buries
--    one: a chest next to the plot of the enchantment that earned the reward, on your map and in your Grimoire, that you
--    dig up with a tap (no walking). Chests keep for 7 days; with 25 already waiting, a new one is paid out at once.
-- 🧞 Wishing keeps a charge where there are charges (the Genie's wishes, the Size Ray's shots, and now the Oracle's
--    gazes). Anywhere else it used to do nothing: there it now adds Ink (+25% a strength).
-- 🪺 Trickster dodges bad luck where there is bad luck (foxes, the Forbidden Wish's twist, a thrown-out egg, Pandora's
--    curses). Anywhere else it used to do nothing: there it now adds Ink (+20% a strength).
-- ⚙️ The Clockwork and 👁️ the Oracle never paid Ink, so a Trait that boosts Ink did nothing on them. Now the Clockwork
--    chimes when you wind the day's last turn (30–50 Ink) and the Oracle is paid when a card you gazed at comes true (8 Ink
--    each), and their Traits work on that.
-- Every payout's chronicle line now also keeps its base, so the Grimoire can show what the Traits added.

-- ---- buried chests -------------------------------------------------------------------------------------------------------
create table if not exists public.seek_chests (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  enchant_id uuid references public.enchantments (id) on delete set null,   -- the enchantment whose reward found it
  source_id uuid references public.enchantments (id) on delete set null,    -- the Treasure Map that lent it Seeking
  finder_kind text not null,
  gx int not null, gy int not null,
  ink int not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  dug_at timestamptz,
  paid int);
create index if not exists seek_chests_open on public.seek_chests (player_id, expires_at) where dug_at is null;
create index if not exists seek_chests_where on public.seek_chests (gx, gy) where dug_at is null;
create index if not exists seek_chests_enchant on public.seek_chests (enchant_id);
create index if not exists seek_chests_source on public.seek_chests (source_id);
alter table public.seek_chests enable row level security;
revoke all on public.seek_chests from anon, authenticated;

/** a player's chests still in the ground (all of them, or those one enchantment found or lent the Trait for) */
create or replace function private.seek_chest_list(p_uid uuid, p_enchant uuid default null) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'gx', c.gx, 'gy', c.gy, 'ink', c.ink, 'kind', c.finder_kind,
           'finder', c.enchant_id, 'serial', e.serial, 'nickname', e.nickname, 'source', c.source_id,
           'at', c.created_at, 'expires_at', c.expires_at) order by c.id), '[]'::jsonb)
  from public.seek_chests c left join public.enchantments e on e.id = c.enchant_id
  where c.player_id = p_uid and c.dug_at is null and c.expires_at > now()
    and (p_enchant is null or c.enchant_id = p_enchant or c.source_id = p_enchant)
$$;

create or replace function public.seek_chests() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return private.seek_chest_list(v_uid);
end $$;

/** dig one up: a tap, from anywhere */
create or replace function public.seek_chest_dig(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c public.seek_chests; v_paid int;
begin
  perform private.rate_limit('seek_chest_dig', 400, 3600);
  select * into c from public.seek_chests where id = p_id for update;
  if c.id is null or c.player_id <> v_uid or c.dug_at is not null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if c.expires_at <= now() then raise exception 'chest_gone' using errcode = 'P0001'; end if;
  v_paid := private.grant_ink_paced(v_uid, c.ink, 'enchantment', 'seek_chest', c.id::text, null);
  update public.seek_chests set dug_at = now(), paid = v_paid where id = c.id;
  if c.enchant_id is not null then
    perform private.ench_stat(c.enchant_id, 'chests');
    perform private.ench_event(c.enchant_id, 'seek_chest', jsonb_build_object('ink', v_paid));
  end if;
  if c.source_id is not null and c.source_id is distinct from c.enchant_id then perform private.ench_stat(c.source_id, 'lent_chests'); end if;
  return jsonb_build_object('ink', v_paid, 'gx', c.gx, 'gy', c.gy, 'kind', c.finder_kind, 'chests', private.seek_chest_list(v_uid), 'balances', private.balances(v_uid));
end $$;

revoke all on function public.seek_chests() from public, anon;
revoke all on function public.seek_chest_dig(bigint) from public, anon;
grant execute on function public.seek_chests() to authenticated;
grant execute on function public.seek_chest_dig(bigint) to authenticated;

-- ---- traits: what every partner lends a reward ---------------------------------------------------------------------------
-- (as 20261119000192, with Seeking burying real chests, Wishing and Trickster paying where they have nothing else to do,
--  and the base kept on the chronicle line)
create or replace function private.ench_pay(p_id uuid, p_base numeric, p_what text) returns jsonb language plpgsql as $$
declare e public.enchantments; p jsonb; v numeric := greatest(coalesce(p_base, 0), 0); v_mods jsonb := '[]'::jsonb; v_paid int := 0; v_extra int := 0;
  k int; b record; v_echo boolean := false; v_gift int; v_to uuid; v_x numeric; v_spread numeric := 0; v_xp int := 1; v_ab text; v_lk jsonb;
  v_cell int[]; v_chests int := 0; v_open int; v_cap int := coalesce((private.ench_cfg() ->> 'seek_chest_cap')::int, 25);
  v_chest_ink int := coalesce((private.ench_cfg() ->> 'seek_chest_ink')::int, 50);
begin
  select * into e from public.enchantments where id = p_id;
  if e.owner_id is null or v <= 0 then return jsonb_build_object('paid', 0, 'base', 0, 'mods', '[]'::jsonb, 'chests', 0); end if;
  if e.level > 1 then
    v := v * (1 + coalesce((private.ench_cfg() ->> 'level_bonus')::numeric, 0.06) * (e.level - 1));
    v_mods := v_mods || jsonb_build_object('label', 'Level ' || e.level, 'emoji', '⭐');
  end if;
  for p in select * from jsonb_array_elements(private.ench_partners(p_id)) loop
    k := least(greatest(coalesce((p ->> 'strength')::int, 1), 1), 3);
    case p ->> 'gene'
      when 'golden' then v := v * (1 + 0.5 * k); v_mods := v_mods || jsonb_build_object('label', 'Golden ×' || (1 + 0.5 * k)::text, 'emoji', '🪿');
      when 'grow' then v := v * (1 + k); v_mods := v_mods || jsonb_build_object('label', 'Giant ×' || (1 + k)::text, 'emoji', '📡');
      when 'chaos' then
        v_x := (array[0.5, 0.75, 1.0])[k] + random() * (array[2.0, 2.75, 3.0])[k];
        v := v * v_x; v_mods := v_mods || jsonb_build_object('label', 'Chaos ×' || round(v_x, 2), 'emoji', '🏺');
      when 'seek' then
        if random() < 0.25 * k then
          select count(*) into v_open from public.seek_chests where player_id = e.owner_id and dug_at is null and expires_at > now();
          if v_open < v_cap then
            -- a real chest, buried right by its plot: dig it up from the Grimoire or the map
            v_cell := private.ench_free_cell(e.gx, e.gy, 2, 7);
            insert into public.seek_chests (player_id, enchant_id, source_id, finder_kind, gx, gy, ink)
            values (e.owner_id, e.id, case when p ->> 'id' is not null then (p ->> 'id')::uuid end, e.kind, v_cell[1], v_cell[2], v_chest_ink);
            v_chests := v_chests + 1;
            v_mods := v_mods || jsonb_build_object('label', 'Seeking: a chest buried by its plot — dig it up!', 'emoji', '🧰');
          else
            v_extra := v_extra + v_chest_ink;
            v_mods := v_mods || jsonb_build_object('label', 'Seeking: a chest +' || v_chest_ink || ' (paid now — ' || v_cap || ' are waiting)', 'emoji', '🧰');
          end if;
        end if;
      when 'spread' then
        v := v * (1 + 0.15 * k); v_spread := greatest(v_spread, 0.1 * k);
        v_mods := v_mods || jsonb_build_object('label', 'Spreading +' || (15 * k) || '%', 'emoji', '🦠');
      when 'echo' then
        if random() < (array[0.35, 0.6, 0.8])[k] then v_echo := true; v_mods := v_mods || jsonb_build_object('label', 'Echo! Paid twice', 'emoji', '🪞'); end if;
      when 'linked' then v := v * (1 + 0.4 * k); v_mods := v_mods || jsonb_build_object('label', 'Linked: a second plot +' || (40 * k) || '%', 'emoji', '🌀');
      when 'foresight' then v := v * (1 + 0.2 * k); v_mods := v_mods || jsonb_build_object('label', 'Foresight +' || (20 * k) || '%', 'emoji', '👁️');
      -- Wishing keeps a charge where there are charges; anywhere else it pays
      when 'wish' then
        if e.kind not in ('genie', 'sizeray', 'oracle') then
          v := v * (1 + 0.25 * k); v_mods := v_mods || jsonb_build_object('label', 'Wishing +' || (25 * k) || '%', 'emoji', '🧞');
        end if;
      -- Trickster dodges bad luck where there is bad luck; anywhere else it pays
      when 'trick' then
        if e.kind not in ('goose', 'genie', 'cuckoo', 'pandora') then
          v := v * (1 + 0.2 * k); v_mods := v_mods || jsonb_build_object('label', 'Trickster +' || (20 * k) || '%', 'emoji', '🪺');
        end if;
      -- what a plot lends
      when 'inspired' then v := v * 1.2; v_mods := v_mods || jsonb_build_object('label', 'Inspired by your canvas +20%', 'emoji', '🎨');
      when 'wild' then v := v * 1.1; v_xp := v_xp + 1; v_mods := v_mods || jsonb_build_object('label', 'Wild +10% · double XP', 'emoji', '🐾');
      when 'fertile' then v := v * 1.25; v_mods := v_mods || jsonb_build_object('label', 'Fertile farm +25%', 'emoji', '🌾');
      when 'invested' then v_extra := v_extra + 10; v_mods := v_mods || jsonb_build_object('label', 'Invested +10', 'emoji', '💼');
      when 'streak' then
        if random() < 0.2 then v := v * 2; v_mods := v_mods || jsonb_build_object('label', 'Arcade streak ×2', 'emoji', '🕹️'); end if;
      when 'homely' then v := v * 1.15; v_mods := v_mods || jsonb_build_object('label', 'At home +15%', 'emoji', '🏡');
      else null;
    end case;
    -- an Aberration's secret
    v_ab := p ->> 'aberration';
    if v_ab is not null then
      case v_ab
        when 'The Hollow King' then v_xp := v_xp + 2; v_mods := v_mods || jsonb_build_object('label', 'The Hollow King: triple XP', 'emoji', '👑');
        when 'Glitchwing' then if random() < 0.1 then v_lk := private.ench_give_luck(e.owner_id, 0, 1); v_mods := v_mods || jsonb_build_object('label', 'Glitchwing: +1 Enchanted Luck', 'emoji', '🦋'); end if;
        when 'Many-Mouth' then v_lk := private.ench_give_luck(e.owner_id, 3, 0); v_mods := v_mods || jsonb_build_object('label', 'Many-Mouth: +3 Luck', 'emoji', '👄');
        when 'The Unwritten' then v_extra := v_extra + 25; v_mods := v_mods || jsonb_build_object('label', 'The Unwritten +25', 'emoji', '📜');
        when 'Starspawn' then if random() < 0.2 then v_echo := true; v_mods := v_mods || jsonb_build_object('label', 'Starspawn: paid twice', 'emoji', '🌟'); end if;
        when 'Ninefold' then v := v * 1.5; v_mods := v_mods || jsonb_build_object('label', 'Ninefold ×1.5', 'emoji', '🐍');
        else null;
      end case;
    end if;
  end loop;
  -- a grown reward (Size Ray) is used up here
  for b in delete from public.enchant_buffs where id = (select id from public.enchant_buffs where enchant_id = p_id and kind = 'next_reward' and expires_at > now() order by id limit 1) returning mult loop
    v := v * b.mult; v_mods := v_mods || jsonb_build_object('label', 'Size-rayed ×' || round(b.mult, 2), 'emoji', '📡');
  end loop;
  -- Pandora's Plague
  if exists (select 1 from public.enchant_buffs where player_id = e.owner_id and kind = 'curse_plague' and expires_at > now()) then
    v := v * 0.7; v_mods := v_mods || jsonb_build_object('label', 'Plague ×0.7', 'emoji', '🦠');
  end if;
  v := round(v) + v_extra;
  if v_echo then v := v * 2; end if;
  v_paid := private.grant_ink_paced(e.owner_id, v::int, 'enchantment', 'enchantment', p_id::text, null);
  -- Spreading: a spore of it lands on a random player
  if v_spread > 0 and v_paid > 0 then
    v_gift := greatest(1, round(v_paid * v_spread))::int;
    select id into v_to from public.players where id <> e.owner_id and status = 'active' and last_active_at > now() - interval '7 days' order by random() limit 1;
    if v_to is not null then
      perform private.grant_ink_paced(v_to, v_gift, 'enchantment', 'enchantment', p_id::text, null);
      perform private.notify(v_to, 'enchant', e.owner_id, jsonb_build_object('sub', 'spore', 'ink', v_gift, 'kind', e.kind));
    end if;
  end if;
  perform private.ench_stat(p_id, 'ink', v_paid);
  perform private.ench_xp(p_id, v_xp);
  perform private.ench_event(p_id, 'paid', jsonb_build_object('what', p_what, 'ink', v_paid, 'base', round(p_base), 'mods', v_mods, 'chests', v_chests));
  return jsonb_build_object('paid', v_paid, 'base', round(p_base), 'mods', v_mods, 'chests', v_chests);
end $$;

-- ---- the Clockwork chimes, the Oracle is paid, the Oracle's gazes can be wished back ---------------------------------------
do $$
declare d text; n text;
begin
  -- ⚙️ the last turn of the day: the clock chimes and pays
  d := pg_get_functiondef('private.ench_act_clockwork(public.enchantments,text,jsonb,timestamp with time zone)'::regprocedure);
  n := replace(d, $a$v_n int; v_m numeric; v_h numeric;$a$, $a$v_n int; v_m numeric; v_h numeric; v_pay jsonb;$a$);
  n := replace(n, $a$      r := jsonb_build_object('wound', v_n, 'charge', s -> 'charge');$a$,
                  $a$      -- the day's last turn: the clock chimes, and pays (so a Trait it wears has Ink to work on)
      if v_n >= (g ->> 'turns_left')::int then
        v_pay := private.ench_pay(e.id, (private.ench_n('clockwork', 'chime_ink', 30) + floor(random() * 21))::numeric, 'the clock chimes');
        perform private.ench_event(e.id, 'chime', '{}'::jsonb);
      end if;
      r := jsonb_build_object('wound', v_n, 'charge', s -> 'charge', 'chimed', v_pay is not null, 'pay', v_pay);$a$);
  if position('the clock chimes' in n) = 0 or position('v_pay jsonb;' in n) = 0 then raise exception 'trait chests: clockwork anchors not found'; end if;
  execute n;
  -- 👁️ a prophecy the Eye saw comes true: the Eye is paid
  d := pg_get_functiondef('private.oracle_take(uuid,text)'::regprocedure);
  n := replace(d, $a$    perform private.ench_stat(f.oracle_id, 'fulfilled');$a$,
                  $a$    -- (a card you gazed at; a prophecy sealed for a friend pays you both its own 10 Ink below)
    if f.sealed_by is null then perform private.ench_pay(f.oracle_id, private.ench_n('oracle', 'fulfilled_ink', 8)::numeric, 'a prophecy came true'); end if;
    perform private.ench_stat(f.oracle_id, 'fulfilled');$a$);
  if n = d then raise exception 'trait chests: oracle_take anchor not found'; end if;
  execute n;
  -- 🧞 Wishing keeps the Oracle's gaze too
  d := pg_get_functiondef('private.ench_act_oracle(public.enchantments,text,jsonb,timestamp with time zone)'::regprocedure);
  n := replace(d, $a$      s := s || jsonb_build_object('charges', v_c - 1, 'gazes', coalesce((s ->> 'gazes')::int, 0) + 1);$a$,
                  $a$      s := s || jsonb_build_object('charges', case when private.ench_keep_charge(e.id) then v_c else v_c - 1 end, 'gazes', coalesce((s ->> 'gazes')::int, 0) + 1);$a$);
  if n = d then raise exception 'trait chests: oracle gaze anchor not found'; end if;
  execute n;
  -- 🗺️ your buried chests on the map
  d := pg_get_functiondef('public.enchant_map(integer,integer,integer,integer)'::regprocedure);
  n := replace(d, $a$    'wormholes', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'mine', e.owner_id = v_uid, 'owner_name', pr.username, 'until', (e.state -> 'open' ->> 'until')::numeric,$a$,
                  $a$    'chests', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'gx', c.gx, 'gy', c.gy, 'ink', c.ink, 'kind', c.finder_kind))
                       from public.seek_chests c where v_uid is not null and c.player_id = v_uid and c.dug_at is null and c.expires_at > now()
                        and c.gx between p_min_gx - 8 and p_max_gx + 8 and c.gy between p_min_gy - 8 and p_max_gy + 8 limit 60), '[]'::jsonb),
    'wormholes', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'mine', e.owner_id = v_uid, 'owner_name', pr.username, 'until', (e.state -> 'open' ->> 'until')::numeric,$a$);
  if n = d then raise exception 'trait chests: enchant_map anchor not found'; end if;
  execute n;
end $$;

-- ---- an enchantment's page: its chests, and a nudge to dig them up ------------------------------------------------------------
create or replace function private.ench_view(p_id uuid) returns jsonb language plpgsql stable as $$
declare e public.enchantments; t timestamptz; x public.enchantments; v_kind jsonb; v_refl jsonb; v_chests jsonb;
begin
  select * into e from public.enchantments where id = p_id;
  if e.id is null then return null; end if;
  t := private.ench_now(e);
  v_kind := private.ench_kind_view(e, t);
  x := private.ench_reflected(e, t);
  if x.id is not null then v_refl := private.ench_kind_view(x, t); end if;
  v_chests := case when e.owner_id is not null then private.seek_chest_list(e.owner_id, e.id) else '[]'::jsonb end;
  return private.ench_brief(e.id) || jsonb_build_object(
    'status', e.status, 'xp', e.xp, 'xp_next', 4 * power(e.level, 2), 'xp_prev', 4 * power(e.level - 1, 2), 'stats', e.stats,
    'owner', private.profile_json(e.owner_id), 'first_owner', private.profile_json(e.first_owner),
    'clock', jsonb_build_object('now', t, 'skip_s', round(e.clock_skip + private.ench_tempo(e.id)),
                                'frozen_until', case when e.frozen_at is not null and now() < e.frozen_until then e.frozen_until end),
    'partner', private.ench_partner(e.id), 'partners', private.ench_partners(e.id), 'size', private.plot_size(e.gx, e.gy),
    'view', v_kind, 'reflected', v_refl, 'reflect_kind', x.kind, 'updated_at', e.updated_at, 'chests', v_chests,
    'attention', coalesce(v_refl ->> 'attention', v_kind ->> 'attention',
                          case when jsonb_array_length(v_chests) = 1 then 'A buried chest is waiting — dig it up'
                               when jsonb_array_length(v_chests) > 1 then jsonb_array_length(v_chests) || ' buried chests are waiting — dig them up' end),
    'server_time', now());
end $$;
