-- Enchantments, part 10: every Trait does its own thing — none of them just pays more Ink.
--
-- Strength k = 1 / 2 / 3 (a Perfect Match, Graft or Chimera doubles; an Aberration triples).
--   🪿 Golden     k golden eggs a day on the partner's page: crack one for a free charge of its main action (a wish, a
--                 shot, a look, mana…; Ink where it has none) — 20% carry a Splice spark.
--   🦠 Spreading  each day it sends k spores to other players' plots near it (24 h). Their wins there pay them +10%
--                 and feed you 10% of the Ink.
--   🏺 Chaos      k mini-boxes a day: 70% one of its chores is done free, 30% a hiccup (its clock stops for an hour —
--                 Tempered and Foresight can dodge it).
--   📡 Giant      its plot stands giant every day (6 / 9 / 12 h): minigames ×1.5, visitors tip it.
--   🪞 Echo       k times a day its last action repeats by itself a minute later, as a mirror ghost (free). Where it
--                 can't repeat, the ghost pays its last reward again.
--   🌀 Linked     pick a second plot of yours on the map: it works from there too — the linked plot is tempered when
--                 it is, and the linked plot's minigames pay ×(1 + 0.2k).
--   👁️ Foresight  sees its bad luck coming and dodges 35 / 60 / 80% of it; shows its next egg / evil / card.
--   ⚡ Charged    every use builds static; at full (12 / 9 / 6) it arcs to up to 3k of your plots within 2 km:
--                 their minigames ×1.25 for an hour. A splice with it is still 3× as likely to turn Aberrant.
--   🧞 Wishing    keeps a charge where it spends charges (as before); anywhere else, once a day its next reward is
--                 wished: ×2.
--   ☀️ Radiant    (the Pocket Sun's) its plot carries a tiny sun and its timers run faster — see part 9.
--   🪄 Divining   (the Dowsing Rod's) tune it to one outcome of the partner's own luck (a Platinum egg, an
--                 Aberration, a strike that lands, The World); harder per draw, certain at full depth. Kinds without
--                 one divine a Splice spark from their rewards.
-- Seeking, Tempo, Tempered, Farsight, Folded, Strings, Fated and Inscribed stay as they were.

create table if not exists public.enchant_spores (
  id bigserial primary key,
  enchant_id uuid not null references public.enchantments (id) on delete cascade,
  owner_id uuid not null references public.players (id) on delete cascade,
  host_id uuid not null references public.players (id) on delete cascade,
  gx int not null, gy int not null,
  fed int not null default 0, ink int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null);
create index if not exists enchant_spores_plot on public.enchant_spores (gx, gy, expires_at);
create index if not exists enchant_spores_owner on public.enchant_spores (owner_id, expires_at);
create index if not exists enchant_spores_enchant on public.enchant_spores (enchant_id);
create index if not exists enchant_spores_host on public.enchant_spores (host_id);
alter table public.enchant_spores enable row level security;

create table if not exists public.enchant_echoes (
  id bigserial primary key,
  enchant_id uuid not null references public.enchantments (id) on delete cascade,
  action text not null, args jsonb not null default '{}'::jsonb,
  due_at timestamptz not null, done_at timestamptz, result jsonb);
create index if not exists enchant_echoes_due on public.enchant_echoes (due_at) where done_at is null;
create index if not exists enchant_echoes_enchant on public.enchant_echoes (enchant_id, due_at);
alter table public.enchant_echoes enable row level security;

-- ---- a free charge of a kind's main action (a golden egg, an echo) ---------------------------------------------------
create or replace function private.ench_refill(e public.enchantments, p_n int default 1) returns jsonb language plpgsql as $$
declare s jsonb := e.state; t timestamptz := private.ench_now(e); v_ep numeric := private.ench_ep(t); g jsonb; v_what text; v_rech numeric; h jsonb;
begin
  case e.kind
    when 'genie' then g := private.genie_eval(e, t); v_rech := private.ench_n('genie', 'recharge_h', 8) * 3600;
      s := s || jsonb_build_object('wishes', (g ->> 'wishes')::int + p_n, 'charge_at', v_ep - case when g ->> 'next_in' is null then 0 else v_rech - (g ->> 'next_in')::numeric end); v_what := 'a wish';
    when 'oracle' then g := private.oracle_eval(e, t); v_rech := private.ench_n('oracle', 'recharge_h', 24) * 3600;
      s := s || jsonb_build_object('charges', (g ->> 'charges')::int + p_n, 'charge_at', v_ep - case when g ->> 'next_in' is null then 0 else greatest(0, v_rech - (g ->> 'next_in')::numeric) end); v_what := 'a gaze';
    when 'spyglass' then g := private.spy_eval(e, t); s := s || jsonb_build_object('looks', (g ->> 'looks')::int + p_n, 'look_at', g -> 'look_at'); v_what := 'a look';
    when 'puppeteer' then g := private.pup_eval(e, t); s := s || jsonb_build_object('strings', (g ->> 'strings')::int + p_n, 'string_at', g -> 'string_at'); v_what := 'a string';
    when 'glyph' then g := private.glyph_eval(e, t); s := s || jsonb_build_object('mana', (g ->> 'mana')::int + 2 * p_n, 'mana_at', g -> 'mana_at'); v_what := 'mana';
    when 'origami' then g := private.ori_eval(e, t); s := s || jsonb_build_object('folds', (g ->> 'folds')::int + p_n, 'fold_at', g -> 'fold_at'); v_what := 'a fold';
    when 'sizeray' then g := private.ray_eval(e, t); v_rech := private.ench_n('sizeray', 'recharge_h', 8) * 3600;
      s := s || jsonb_build_object('shots', (g ->> 'shots')::int + p_n, 'shot_at', v_ep - case when g ->> 'next_in' is null then 0 else greatest(0, v_rech - (g ->> 'next_in')::numeric) end); v_what := 'a shot';
    when 'splice' then s := s || jsonb_build_object('bonus', least(6, coalesce((s ->> 'bonus')::int, 0) + p_n)); v_what := 'a spare Splice charge';
    when 'deck' then g := private.deck_eval(e, t); s := s || jsonb_build_object('day', g -> 'day', 'picked', greatest(0, (g ->> 'picked')::int - p_n)); v_what := 'a card';
    when 'goose' then s := s || jsonb_build_object('egg_at', coalesce((s ->> 'egg_at')::numeric, v_ep) - 7200 * p_n); v_what := '2 hours of egg';
    when 'wormhole' then s := s || jsonb_build_object('next_open_at', 0); v_what := 'an opening';
    when 'map' then s := s || jsonb_build_object('next_at', 0); v_what := 'a new map';
    when 'sun' then s := s || jsonb_build_object('lit', greatest(0, coalesce((s ->> 'lit')::int, 0) - p_n)); v_what := 'a sun';
    when 'shard' then s := s || jsonb_build_object('gazed_at', 0); v_what := 'a gaze';
    when 'clockwork' then g := private.clock_eval(e, t); s := s || jsonb_build_object('charge', least((g ->> 'cap')::numeric, (g ->> 'charge')::numeric + 30 * p_n), 'tick_at', v_ep); v_what := '30 wound minutes';
    when 'stormcoil' then s := s || jsonb_build_object('charge', least(100, coalesce((s ->> 'charge')::numeric, 0) + 30 * p_n)); v_what := '30% charge';
    when 'crucible' then s := s || jsonb_build_object('heat', coalesce((s ->> 'heat')::numeric, 0) + 20 * p_n); v_what := '20 Heat';
    when 'pandora' then s := s || jsonb_build_object('opened_on', null); v_what := 'an opening';
    when 'parasite' then h := s -> 'host';
      if jsonb_typeof(h) = 'object' then s := jsonb_set(s, '{host,at}', to_jsonb(coalesce((h ->> 'at')::numeric, v_ep) - 14400 * p_n)); v_what := '4 hours of feeding'; end if;
    when 'rod' then
      if jsonb_array_length(coalesce(s -> 'targets', '[]'::jsonb)) > 0 then
        s := jsonb_set(s, '{targets,0,depth}', to_jsonb(least(private.rod_need(e, s -> 'targets' -> 0 ->> 't', s -> 'targets' -> 0 ->> 'id') - 1,
               coalesce((s -> 'targets' -> 0 ->> 'depth')::int, 0) + ceil(0.05 * private.rod_need(e, s -> 'targets' -> 0 ->> 't', s -> 'targets' -> 0 ->> 'id'))::int)));
        v_what := 'depth';
      end if;
    else null;
  end case;
  if v_what is null then return null; end if;
  return jsonb_build_object('state', s, 'what', v_what);
end $$;

-- ---- 🪄 Divining: one outcome of the partner's own luck, harder per draw, certain at full depth ------------------------
create or replace function private.div_targets(p_kind text) returns jsonb language sql stable as $$
  select case p_kind
    when 'goose' then jsonb_build_array(jsonb_build_object('key', 'platinum', 'name', 'a Platinum egg', 'p', private.ench_n('goose', 'platinum', 0.03)))
    when 'splice' then jsonb_build_array(jsonb_build_object('key', 'aberration', 'name', 'an Aberration', 'p', private.ench_n('splice', 'aberration', 0.05)))
    when 'crucible' then jsonb_build_array(jsonb_build_object('key', 'strike', 'name', 'a strike that lands', 'p', 0.25))
    when 'deck' then jsonb_build_array(jsonb_build_object('key', 'world', 'name', 'The World', 'p', 0.5 / 21.5))
    else jsonb_build_array(jsonb_build_object('key', 'spark', 'name', 'a Splice spark (from its rewards)', 'p', 0.05))
  end
$$;
/** a draw of the partner's luck, divined: returns whether it lands */
create or replace function private.divine(p_id uuid, p_key text, p_natural boolean, p_p numeric) returns boolean language plpgsql as $$
declare e public.enchantments; k int; v_target text; v_need int; v_d int; v_res boolean;
begin
  k := private.ench_has_gene(p_id, 'divining');
  if k = 0 then return p_natural; end if;
  select * into e from public.enchantments where id = p_id;
  v_target := coalesce(e.stats ->> 'div_target', private.div_targets(e.kind) -> 0 ->> 'key');
  if v_target is distinct from p_key then return p_natural; end if;
  v_need := greatest(2, ceil(3 / (1 + 0.25 * (least(k, 3) - 1)) / greatest(coalesce(p_p, 0.05), 1e-6))::int);
  v_d := coalesce((e.stats ->> 'div_depth')::int, 0);
  if p_natural then
    if random() < 0.5 then v_res := true; v_d := 0; perform private.ench_stat(p_id, 'div_hits');
    else v_res := false; v_d := least(v_need - 1, v_d + greatest(1, ceil(v_need * 0.1)::int)); perform private.ench_stat(p_id, 'div_slips'); end if;
  else
    v_d := v_d + 1;
    if v_d >= v_need then v_res := true; v_d := 0; perform private.ench_stat(p_id, 'div_hits'); else v_res := false; end if;
  end if;
  update public.enchantments set stats = stats || jsonb_build_object('div_depth', v_d, 'div_need', v_need, 'div_key', p_key) where id = p_id;
  if v_res and not p_natural then perform private.ench_event(p_id, 'divined', jsonb_build_object('key', p_key, 'forced', true)); end if;
  if not v_res and p_natural then perform private.ench_event(p_id, 'divine_slip', jsonb_build_object('key', p_key, 'depth', v_d, 'need', v_need)); end if;
  return v_res;
end $$;

-- the goose's next egg, the splice's Aberration, the anvil's strike, the deck's World
select private.fn_patch('private.ench_act_goose(public.enchantments,text,jsonb,timestamptz)',
  $a$      r := jsonb_build_object('egg', g, 'pay', v_pay, 'streak', v_streak, 'gosling', v_gos is not null);$a$,
  $b$      -- 🪄 Divining: is the next egg Platinum? (the Oracle's fate for it, if it has one, stands)
      if private.ench_has_gene(e.id, 'divining') > 0 and not coalesce(s -> 'fate_plat', '{}'::jsonb) ? ((s ->> 'eggs')::text) then
        s := jsonb_set(s, '{fate_plat}', coalesce(s -> 'fate_plat', '{}'::jsonb) || jsonb_build_object((s ->> 'eggs')::text,
               private.divine(e.id, 'platinum', private.ench_hash(e.sigil, (s ->> 'eggs')::int, 999) < private.ench_n('goose', 'platinum', 0.03) * case when e.stars >= 1 then 2 else 1 end,
                              private.ench_n('goose', 'platinum', 0.03) * case when e.stars >= 1 then 2 else 1 end)));
      end if;
      r := jsonb_build_object('egg', g, 'pay', v_pay, 'streak', v_streak, 'gosling', v_gos is not null);$b$);
select private.fn_patch('private.ench_act_splice(public.enchantments,text,jsonb,timestamptz)',
  $a$if v_mode in ('swap', 'chimera') and random() < v_abp then$a$,
  $b$if v_mode in ('swap', 'chimera') and private.divine(e.id, 'aberration', random() < v_abp, v_abp) then$b$);
select private.fn_patch('private.ench_act_crucible(public.enchantments,text,jsonb,timestamptz)',
  $a$      v_ok := random() < v_p;$a$, $b$      v_ok := private.divine(e.id, 'strike', random() < v_p, v_p);$b$);
select private.fn_patch('private.ench_act_deck(public.enchantments,text,jsonb,timestamptz)',
  $a$      v_card := private.deck_pick(); v_up := random() >= private.ench_n('deck', 'reversed', 0.3); v_foil := random() < private.ench_n('deck', 'foil', 0.08);
      v_pend := jsonb_build_object('i', v_i,$a$,
  $b$      v_card := private.deck_pick(); v_up := random() >= private.ench_n('deck', 'reversed', 0.3); v_foil := random() < private.ench_n('deck', 'foil', 0.08);
      -- 🪄 Divining for The World
      if private.ench_has_gene(e.id, 'divining') > 0 then
        if private.divine(e.id, 'world', v_card = 'world', 0.5 / 21.5) then v_card := 'world';
        elsif v_card = 'world' then
          while v_card = 'world' loop v_card := private.deck_pick(); end loop;
        end if;
      end if;
      v_pend := jsonb_build_object('i', v_i,$b$);

-- ---- 🦠 Spreading: spores on neighbours' plots -----------------------------------------------------------------------
create or replace function private.trait_spores_run(p_id uuid) returns int language plpgsql as $$
declare x public.enchantments; k int; v_day text := private.today()::text; i int; w record; v_n int := 0;
begin
  select * into x from public.enchantments where id = p_id;
  if x.id is null or x.status <> 'active' or x.owner_id is null then return 0; end if;
  if coalesce(x.stats ->> 'spore_day', '') = v_day then return 0; end if;
  k := private.ench_has_gene(p_id, 'spread');
  if k = 0 then return 0; end if;
  update public.enchantments set stats = stats || jsonb_build_object('spore_day', v_day) where id = p_id;
  for w in select p.gx, p.gy, p.owner_id from public.world_plots p
            where p.gx between x.gx - 80 and x.gx + 80 and p.gy between x.gy - 80 and x.gy + 80
              and p.owner_id is not null and p.owner_id <> x.owner_id
              and not exists (select 1 from public.player_blocks b where (b.blocker_id = p.owner_id and b.blocked_id = x.owner_id) or (b.blocker_id = x.owner_id and b.blocked_id = p.owner_id))
              and not exists (select 1 from public.enchant_spores s where s.gx = p.gx and s.gy = p.gy and s.expires_at > now())
            order by random() limit least(k, 3) loop
    insert into public.enchant_spores (enchant_id, owner_id, host_id, gx, gy, expires_at) values (p_id, x.owner_id, w.owner_id, w.gx, w.gy, now() + interval '24 hours');
    perform private.notify(w.owner_id, 'enchant', x.owner_id, jsonb_build_object('sub', 'spore_landed', 'kind', x.kind, 'gx', w.gx, 'gy', w.gy));
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    perform private.ench_stat(p_id, 'spores', v_n);
    perform private.ench_event(p_id, 'spored', jsonb_build_object('n', v_n));
  end if;
  return v_n;
end $$;
/** a win on a spored plot: its host plays +10% (in the plot's multiplier), and the spore's owner is fed 10% of the Ink */
create or replace function private.spore_feed(p_host uuid, p_gx int, p_gy int, p_ink int) returns void language plpgsql as $$
declare s record; v_feed int;
begin
  if coalesce(p_ink, 0) <= 0 then return; end if;
  for s in update public.enchant_spores set fed = fed + 1, ink = ink + greatest(1, round(p_ink * 0.1))::int
            where id = (select id from public.enchant_spores where gx = p_gx and gy = p_gy and host_id = p_host and expires_at > now() order by id limit 1)
            returning * loop
    v_feed := greatest(1, round(p_ink * 0.1))::int;
    perform private.grant_ink_paced(s.owner_id, v_feed, 'enchantment', 'spore', s.enchant_id::text, null);
    perform private.ench_stat(s.enchant_id, 'spore_fed', v_feed);
  end loop;
end $$;
select private.fn_patch('public.svc_finish_minigame(uuid,jsonb)',
  $a$      if v_ink > 0 then perform private.referral_qualify(v_s.player_id, 'first_win'); end if;$a$,
  $b$      if v_ink > 0 then perform private.referral_qualify(v_s.player_id, 'first_win'); end if;
      -- 🦠 a spore on this plot is fed by the win
      if v_ink > 0 then perform private.spore_feed(v_s.player_id, v_s.gx, v_s.gy, v_ink); end if;$b$);

-- ---- 📡 Giant: its plot stands giant every day ------------------------------------------------------------------------
create or replace function private.trait_giant_run(p_id uuid) returns boolean language plpgsql as $$
declare x public.enchantments; k int; v_day text := private.today()::text;
begin
  select * into x from public.enchantments where id = p_id;
  if x.id is null or x.status <> 'active' or x.owner_id is null then return false; end if;
  if coalesce(x.stats ->> 'giant_day', '') = v_day then return false; end if;
  k := private.ench_has_gene(p_id, 'grow');
  if k = 0 then return false; end if;
  update public.enchantments set stats = stats || jsonb_build_object('giant_day', v_day) where id = p_id;
  if not exists (select 1 from public.world_plots where gx = x.gx and gy = x.gy and owner_id = x.owner_id) then return false; end if;
  -- (a size it already wears stands)
  if exists (select 1 from public.enchant_buffs where kind in ('plot_giant', 'plot_tiny') and gx = x.gx and gy = x.gy and expires_at > now()) then return false; end if;
  insert into public.enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, data, expires_at)
  values (x.owner_id, 'plot_giant', x.gx, x.gy, x.id, 1.5, jsonb_build_object('scale', 100, 'grade', 'TRAIT', 'tips', 0, 'trait', true),
          now() + make_interval(hours => 3 + 3 * least(k, 3)));
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', x.gx - 52, x.gy - 52, x.gx + 52, x.gy + 52);
  perform private.ench_stat(p_id, 'giant_days');
  perform private.ench_event(p_id, 'stood_giant', jsonb_build_object('h', 3 + 3 * least(k, 3)));
  return true;
end $$;

create or replace function private.trait_daily(p_id uuid) returns void language plpgsql as $$
begin
  update public.enchantments set stats = stats || jsonb_build_object('trait_tick_at', extract(epoch from now())) where id = p_id;
  perform private.trait_strings_run(p_id);
  perform private.trait_farsight_run(p_id);
  perform private.trait_spores_run(p_id);
  perform private.trait_giant_run(p_id);
end $$;
-- the heartbeat runs each Trait's work at most every 20 minutes per enchantment
select private.fn_patch('private.wonders_tick()',
  $a$       and coalesce(x.stats ->> 'trait_day', '') <> private.today()::text$a$,
  $b$       and coalesce((x.stats ->> 'trait_tick_at')::numeric, 0) < extract(epoch from now()) - 1200$b$);

-- ---- 🪞 Echo: the last action, again, a minute later -----------------------------------------------------------------
/** what can echo (repeat itself): the rest echo their last reward */
create or replace function private.echo_acts(p_kind text) returns text[] language sql immutable as $$
  select case p_kind when 'goose' then array['collect'] when 'genie' then array['wish'] when 'oracle' then array['gaze'] when 'spyglass' then array['look']
                     when 'glyph' then array['cast', 'study'] when 'deck' then array['flip'] when 'stormcoil' then array['crank'] when 'clockwork' then array['wind']
                     when 'sun' then array['stoke'] when 'pandora' then array['open'] else array[]::text[] end
$$;
/** after an action on an enchantment wearing Echo: a ghost is queued (k a day) */
create or replace function private.echo_queue(e public.enchantments, p_action text, a jsonb, v jsonb) returns boolean language plpgsql as $$
declare k int; v_day text := private.today()::text; v_n int;
begin
  if p_action in ('rename', 'separate') or p_action like 'trait_%' then return false; end if;
  k := private.ench_has_gene(e.id, 'echo');
  if k = 0 then return false; end if;
  if not (p_action = any(private.echo_acts(e.kind)) or coalesce((v -> 'result' -> 'pay' ->> 'paid')::int, 0) > 0) then return false; end if;
  v_n := case when e.stats ->> 'echo_day' = v_day then coalesce((e.stats ->> 'echo_n')::int, 0) else 0 end;
  if v_n >= least(k, 3) then return false; end if;
  if exists (select 1 from public.enchant_echoes where enchant_id = e.id and done_at is null) then return false; end if;
  insert into public.enchant_echoes (enchant_id, action, args, due_at)
  values (e.id, p_action, coalesce(a, '{}'::jsonb) || jsonb_build_object('_base', v -> 'result' -> 'pay' -> 'base'), now() + make_interval(secs => private.ench_n('shard', 'echo_s', 60)::double precision));
  update public.enchantments set stats = stats || jsonb_build_object('echo_day', v_day, 'echo_n', v_n + 1) where id = e.id;
  return true;
end $$;
/** a ghost of the last action: a free charge, then the action again (or its reward again) */
create or replace function private.echo_run(p_echo bigint) returns jsonb language plpgsql as $$
declare q public.enchant_echoes; x public.enchantments; t timestamptz; v jsonb; rf jsonb; a jsonb; v_res jsonb; v_cell int[];
begin
  select * into q from public.enchant_echoes where id = p_echo and done_at is null for update skip locked;
  if q.id is null then return null; end if;
  select * into x from public.enchantments where id = q.enchant_id for update;
  if x.id is null or x.status <> 'active' or x.owner_id is null then
    update public.enchant_echoes set done_at = now(), result = '{"faded": true}' where id = q.id; return null;
  end if;
  a := q.args - '_base';
  begin
    if q.action = any(private.echo_acts(x.kind)) then
      rf := private.ench_refill(x, 1);
      if rf is not null then update public.enchantments set state = rf -> 'state' where id = x.id; select * into x from public.enchantments where id = q.enchant_id; end if;
      t := private.ench_now(x);
      if x.kind = 'spyglass' then v_cell := private.free_cell_within(coalesce((a ->> 'gx')::int, x.gx), coalesce((a ->> 'gy')::int, x.gy), 400); a := a || jsonb_build_object('gx', v_cell[1], 'gy', v_cell[2]); end if;
      if x.kind = 'deck' then a := a || jsonb_build_object('i', (select i from generate_series(0, 4) i where not exists (select 1 from jsonb_array_elements(coalesce(x.state -> 'flipped', '[]'::jsonb)) f where (f ->> 'i')::int = i) order by i limit 1)); end if;
      v := case x.kind
        when 'goose' then private.ench_act_goose(x, q.action, a, t) when 'genie' then private.ench_act_genie(x, q.action, a, t)
        when 'oracle' then private.ench_act_oracle(x, q.action, a, t) when 'spyglass' then private.ench_act_spyglass(x, q.action, a, t)
        when 'glyph' then private.ench_act_glyph(x, q.action, a, t) when 'deck' then private.ench_act_deck(x, q.action, a, t)
        when 'stormcoil' then private.ench_act_stormcoil(x, q.action, a, t) when 'clockwork' then private.ench_act_clockwork(x, q.action, a, t)
        when 'sun' then private.ench_act_sun(x, q.action, a, t) when 'pandora' then private.ench_act_pandora(x, q.action, a, t) end;
      if v is not null then
        update public.enchantments set state = v -> 'state', updated_at = now() where id = x.id;
        if x.kind = 'deck' then
          select * into x from public.enchantments where id = q.enchant_id;
          v := private.ench_act_deck(x, 'accept', '{}'::jsonb, private.ench_now(x));
          update public.enchantments set state = v -> 'state', updated_at = now() where id = x.id;
        end if;
        v_res := jsonb_build_object('echoed', q.action, 'result', v -> 'result');
      end if;
    elsif coalesce((q.args ->> '_base')::numeric, 0) > 0 then
      v_res := jsonb_build_object('echoed', 'reward', 'pay', private.ench_pay(x.id, (q.args ->> '_base')::numeric, 'an echo of its last reward'));
    end if;
  exception when others then
    v_res := jsonb_build_object('faded', true, 'why', sqlerrm);
  end;
  update public.enchant_echoes set done_at = now(), result = coalesce(v_res, '{"faded": true}'::jsonb) where id = q.id;
  if v_res is not null and not v_res ? 'faded' then
    perform private.ench_stat(x.id, 'echoes_done');
    perform private.ench_event(x.id, 'echoed', jsonb_build_object('action', q.action, 'ink', coalesce(v_res -> 'pay' -> 'paid', v_res -> 'result' -> 'pay' -> 'paid')));
  else
    perform private.ench_event(x.id, 'echo_faded', jsonb_build_object('action', q.action));
  end if;
  return v_res;
end $$;

-- ---- ⚡ Charged: static from every use, an arc at full ----------------------------------------------------------------
create or replace function private.static_add(e public.enchantments) returns jsonb language plpgsql as $$
declare k int := private.ench_has_gene(e.id, 'charged'); v_full int; v_st int; w record; v_n int := 0;
begin
  if k = 0 then return null; end if;
  v_full := (array[12, 9, 6])[least(k, 3)];
  v_st := coalesce((e.stats ->> 'static')::int, 0) + 1;
  if v_st < v_full then
    update public.enchantments set stats = stats || jsonb_build_object('static', v_st, 'static_full', v_full) where id = e.id;
    return jsonb_build_object('static', v_st, 'full', v_full);
  end if;
  -- the arc: up to 3k of your plots within 2 km of its plot, ×1.25 for an hour
  for w in select p.gx, p.gy from public.world_plots p
            where p.owner_id = e.owner_id and p.gx between e.gx - 700 and e.gx + 700 and p.gy between e.gy - 700 and e.gy + 700
              and private.ench_cell_m(p.gx, p.gy, e.gx, e.gy) <= 2000
            order by private.ench_cell_m(p.gx, p.gy, e.gx, e.gy) limit 3 * least(k, 3) loop
    insert into public.enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, data, expires_at)
    values (e.owner_id, 'static', w.gx, w.gy, e.id, 1.25, '{}'::jsonb, now() + interval '1 hour');
    v_n := v_n + 1;
  end loop;
  update public.enchantments set stats = stats || jsonb_build_object('static', 0, 'static_full', v_full, 'arcs', coalesce((stats ->> 'arcs')::int, 0) + 1) where id = e.id;
  perform private.ench_event(e.id, 'arced', jsonb_build_object('plots', v_n));
  return jsonb_build_object('static', 0, 'full', v_full, 'arced', v_n);
end $$;

-- ---- the Traits' plot powers: spores, static, a Linked plot ----------------------------------------------------------
create or replace function private.trait_plot_mult(p_uid uuid, p_gx int, p_gy int) returns numeric language plpgsql stable as $$
declare m numeric := 1; r record;
begin
  if exists (select 1 from public.enchant_spores where gx = p_gx and gy = p_gy and host_id = p_uid and expires_at > now()) then m := m * 1.1; end if;
  if exists (select 1 from public.enchant_buffs where player_id = p_uid and kind = 'static' and gx = p_gx and gy = p_gy and expires_at > now()) then m := m * 1.25; end if;
  for r in select w.id, w.k from private.gene_wearers(p_uid, 'linked') w
            join public.enchantments e on e.id = w.id
           where (e.stats -> 'link' ->> 0)::int = p_gx and (e.stats -> 'link' ->> 1)::int = p_gy limit 1 loop
    m := m * (1 + 0.2 * least(r.k, 3));
  end loop;
  return m;
end $$;
-- a Linked plot is tempered when its enchantment's plot is
create or replace function private.trait_linked_tempered(p_gx int, p_gy int) returns boolean language sql stable as $$
  select exists (select 1 from public.enchantments e
                  where (e.stats -> 'link' ->> 0)::int = p_gx and (e.stats -> 'link' ->> 1)::int = p_gy and e.status = 'active'
                    and private.ench_has_gene(e.id, 'linked') > 0 and private.ench_has_gene(e.id, 'trick') > 0)
$$;

-- ---- the Trait actions on an enchantment's page ----------------------------------------------------------------------
create or replace function private.trait_egg(e public.enchantments) returns jsonb language plpgsql as $$
declare k int := private.ench_has_gene(e.id, 'golden'); v_day text := private.today()::text; v_n int; rf jsonb; v_pay jsonb; v_spark uuid;
begin
  if k = 0 then raise exception 'no_trait' using errcode = 'P0001'; end if;
  v_n := case when e.stats ->> 'egg_day' = v_day then coalesce((e.stats ->> 'egg_n')::int, 0) else 0 end;
  if v_n >= least(k, 3) then raise exception 'already_today' using errcode = 'P0001'; end if;
  update public.enchantments set stats = stats || jsonb_build_object('egg_day', v_day, 'egg_n', v_n + 1, 'gold_eggs', coalesce((stats ->> 'gold_eggs')::int, 0) + 1) where id = e.id;
  rf := private.ench_refill(e, 1);
  if rf is not null then update public.enchantments set state = rf -> 'state', updated_at = now() where id = e.id;
  else v_pay := private.ench_pay(e.id, 25 * least(k, 3), 'a golden egg'); end if;
  if random() < private.ench_n('splice', 'goose_spark', 0.2) then v_spark := private.splice_spark(e.owner_id, 'goose'); end if;
  perform private.ench_event(e.id, 'gold_egg', jsonb_build_object('what', rf ->> 'what', 'ink', v_pay -> 'paid', 'spark', v_spark is not null));
  return jsonb_build_object('cracked', true, 'what', coalesce(rf ->> 'what', (v_pay ->> 'paid') || ' Ink'), 'pay', v_pay, 'spark', v_spark is not null, 'left', least(k, 3) - v_n - 1);
end $$;
create or replace function private.trait_box(e public.enchantments) returns jsonb language plpgsql as $$
declare k int := private.ench_has_gene(e.id, 'chaos'); v_day text := private.today()::text; v_n int; r jsonb; rf jsonb;
begin
  if k = 0 then raise exception 'no_trait' using errcode = 'P0001'; end if;
  v_n := case when e.stats ->> 'box_day' = v_day then coalesce((e.stats ->> 'box_n')::int, 0) else 0 end;
  if v_n >= least(k, 3) then raise exception 'already_today' using errcode = 'P0001'; end if;
  update public.enchantments set stats = stats || jsonb_build_object('box_day', v_day, 'box_n', v_n + 1, 'boxes', coalesce((stats ->> 'boxes')::int, 0) + 1) where id = e.id;
  if random() < private.ench_n('pandora', 'chaos_good', 0.7) then
    r := private.trait_chore(e.id);
    if r is null then
      rf := private.ench_refill(e, 1);
      if rf is not null then update public.enchantments set state = rf -> 'state' where id = e.id; r := jsonb_build_object('label', 'gave it ' || (rf ->> 'what')); end if;
    end if;
    if r is null then r := jsonb_build_object('label', 'paid out', 'pay', private.ench_pay(e.id, 20 * least(k, 3), 'a chaos box')); end if;
    perform private.ench_event(e.id, 'chaos_box', jsonb_build_object('good', true, 'label', r ->> 'label'));
    return jsonb_build_object('good', true, 'label', r ->> 'label', 'pay', r -> 'pay', 'left', least(k, 3) - v_n - 1);
  end if;
  -- a hiccup: its clock stops for an hour (unless it sees it coming)
  if private.ench_dodge(e.id) then
    perform private.ench_event(e.id, 'chaos_box', jsonb_build_object('good', false, 'dodged', true));
    return jsonb_build_object('good', false, 'dodged', true, 'left', least(k, 3) - v_n - 1);
  end if;
  update public.enchantments set frozen_at = coalesce(case when frozen_at is not null and now() < frozen_until then frozen_at end, now()),
         frozen_until = greatest(coalesce(frozen_until, now()), now()) + interval '1 hour' where id = e.id;
  perform private.ench_event(e.id, 'chaos_box', jsonb_build_object('good', false, 'hiccup', true));
  return jsonb_build_object('good', false, 'hiccup', true, 'left', least(k, 3) - v_n - 1);
end $$;
create or replace function private.trait_link(e public.enchantments, a jsonb) returns jsonb language plpgsql as $$
declare v_gx int := (a ->> 'gx')::int; v_gy int := (a ->> 'gy')::int;
begin
  if private.ench_has_gene(e.id, 'linked') = 0 then raise exception 'no_trait' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.world_plots where gx = v_gx and gy = v_gy and owner_id = e.owner_id) then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
  if v_gx = e.gx and v_gy = e.gy then raise exception 'own_plot' using errcode = 'P0001'; end if;
  update public.enchantments set stats = stats || jsonb_build_object('link', jsonb_build_array(v_gx, v_gy)) where id = e.id;
  perform private.ench_event(e.id, 'linked_plot', jsonb_build_object('gx', v_gx, 'gy', v_gy));
  return jsonb_build_object('linked', jsonb_build_array(v_gx, v_gy));
end $$;
create or replace function private.trait_divine(e public.enchantments, a jsonb) returns jsonb language plpgsql as $$
begin
  if private.ench_has_gene(e.id, 'divining') = 0 then raise exception 'no_trait' using errcode = 'P0001'; end if;
  if not exists (select 1 from jsonb_array_elements(private.div_targets(e.kind)) x where x ->> 'key' = a ->> 'key') then raise exception 'bad_target' using errcode = 'P0001'; end if;
  update public.enchantments set stats = stats || jsonb_build_object('div_target', a ->> 'key', 'div_depth', case when stats ->> 'div_target' = a ->> 'key' then stats -> 'div_depth' else '0'::jsonb end) where id = e.id;
  return jsonb_build_object('target', a ->> 'key');
end $$;
create or replace function private.trait_act(e public.enchantments, p_action text, a jsonb) returns jsonb language plpgsql as $$
begin
  return case p_action
    when 'trait_fold' then private.trait_fold(e) when 'trait_rune' then private.trait_rune(e, a)
    when 'trait_egg' then private.trait_egg(e) when 'trait_box' then private.trait_box(e)
    when 'trait_link' then private.trait_link(e, a) when 'trait_divine' then private.trait_divine(e, a) end;
end $$;
select private.fn_patch('public.enchant_act(uuid,text,jsonb)',
  $a$  if p_action in ('trait_fold', 'trait_rune') then$a$, $b$  if p_action in ('trait_fold', 'trait_rune', 'trait_egg', 'trait_box', 'trait_link', 'trait_divine') then$b$);

-- after an action: Echo queues its ghost, Charged builds static
select private.fn_patch('public.enchant_act(uuid,text,jsonb)',
  $a$  select * into e from public.enchantments where id = p_id;
  if private.ench_titles(e) <> e.titles then$a$,
  $b$  select * into e from public.enchantments where id = p_id;
  if x.id is null then
    if private.echo_queue(e, p_action, a, v) then v := jsonb_set(v, '{result,echo}', 'true'::jsonb, true); end if;
    perform private.static_add(e);
    select * into e from public.enchantments where id = p_id;
  end if;
  if private.ench_titles(e) <> e.titles then$b$);

-- the ghosts come due on the heartbeat (and the moment the enchantment is next opened)
create or replace function private.trait_tick() returns void language plpgsql as $$
declare q record;
begin
  for q in select id from public.enchant_echoes where done_at is null and due_at <= now() order by due_at limit 500 loop
    perform private.echo_run(q.id);
  end loop;
  delete from public.enchant_spores where expires_at < now() - interval '3 days';
  delete from public.enchant_echoes where done_at < now() - interval '3 days';
end $$;
select private.fn_patch('private.ench_settle(uuid)',
  $a$  select * into e from public.enchantments where id = p_id;
  if e.kind = 'stormcoil' then perform private.storm_settle(p_id); end if;$a$,
  $b$  -- 🪞 an echo that's come due
  for s in select id from public.enchant_echoes where enchant_id = p_id and done_at is null and due_at <= now() loop
    perform private.echo_run(s.id);
  end loop;
  select * into e from public.enchantments where id = p_id;
  if e.kind = 'stormcoil' then perform private.storm_settle(p_id); end if;$b$);

-- ---- 👁️ Foresight: dodges as before; the next outcome shows -------------------------------------------------------------
-- 🔥 Tempered: a Linked plot of a tempered enchantment is tempered too
create or replace function private.trait_preview(e public.enchantments) returns jsonb language plpgsql stable as $$
declare t timestamptz := private.ench_now(e); g jsonb;
begin
  case e.kind
    when 'goose' then g := private.goose_eval(e, t); return jsonb_build_object('label', case when (g ->> 'platinum')::boolean then 'This egg is Platinum (×3)' else 'This egg is golden, not Platinum' end);
    when 'deck' then return jsonb_build_object('label', 'The next card it deals is drawn fresh — but its bad cards come reversed less (Foresight dodges)');
    when 'pandora' then return jsonb_build_object('label', 'Evils still inside: ' || coalesce((select string_agg(ev, ', ') from unnest(array['plague', 'greed', 'strife', 'envy', 'despair', 'toil', 'sorrow']) ev
                                                       where not coalesce(e.state -> 'evils', '[]'::jsonb) ? ev), 'none'));
    else return null;
  end case;
end $$;

-- ---- what each Trait is doing, for the page ----------------------------------------------------------------------------
create or replace function private.trait_view(e public.enchantments) returns jsonb language plpgsql stable as $$
declare v_day text := private.today()::text; k int; o jsonb := '{}'::jsonb; w jsonb;
begin
  k := private.ench_has_gene(e.id, 'folded');
  if k > 0 then
    w := private.ench_longest_wait(e);
    o := o || jsonb_build_object('fold', jsonb_build_object('k', k, 'left', k - case when e.stats ->> 'fold_day' = v_day then coalesce((e.stats ->> 'fold_n')::int, 0) else 0 end,
      'wait', w, 'saved', coalesce((e.stats ->> 'fold_saved')::numeric, 0)));
  end if;
  k := private.ench_has_gene(e.id, 'inscribed');
  if k > 0 then
    o := o || jsonb_build_object('rune', jsonb_build_object('k', k, 'glyph', private.rune_of(e.kind), 'name', private.glyph_def(private.rune_of(e.kind)) ->> 'name',
      'text', private.glyph_def(private.rune_of(e.kind)) ->> 'text', 'ready', coalesce(e.stats ->> 'rune_day', '') <> v_day, 'best', e.stats -> 'rune_best', 'runes', coalesce((e.stats ->> 'runes')::int, 0)));
  end if;
  k := private.ench_has_gene(e.id, 'strings');
  if k > 0 then
    o := o || jsonb_build_object('strings', jsonb_build_object('k', k, 'done', case when e.stats ->> 'strings_day' = v_day then coalesce((e.stats ->> 'strings_n')::int, 0) else 0 end,
      'last', e.stats -> 'strings_last', 'chores', coalesce((e.stats ->> 'chores')::int, 0), 'own', jsonb_array_length(private.trait_chores(e.kind)) > 0));
  end if;
  k := private.ench_has_gene(e.id, 'farsight');
  if k > 0 then
    o := o || jsonb_build_object('farsight', jsonb_build_object('k', k, 'reach', 1 + k, 'reaches', private.ench_reaches(e.kind), 'scouted', coalesce((e.stats ->> 'far_n')::int, 0),
      'last', e.stats -> 'far_last', 'today', coalesce(e.stats ->> 'far_day', '') = v_day));
  end if;
  k := private.ench_has_gene(e.id, 'trick');
  if k > 0 then o := o || jsonb_build_object('tempered', jsonb_build_object('k', k, 'dodged', coalesce((e.stats ->> 'dodged')::int, 0))); end if;
  k := private.ench_has_gene(e.id, 'fated');
  if k > 0 then o := o || jsonb_build_object('fated', jsonb_build_object('k', k, 'cards', coalesce((e.stats ->> 'fated_n')::int, 0), 'last', e.stats -> 'fated_last')); end if;
  k := private.ench_has_gene(e.id, 'golden');
  if k > 0 then o := o || jsonb_build_object('golden', jsonb_build_object('k', k, 'left', least(k, 3) - case when e.stats ->> 'egg_day' = v_day then coalesce((e.stats ->> 'egg_n')::int, 0) else 0 end,
      'cracked', coalesce((e.stats ->> 'gold_eggs')::int, 0), 'refills', private.ench_refill(e, 1) is not null)); end if;
  k := private.ench_has_gene(e.id, 'spread');
  if k > 0 then o := o || jsonb_build_object('spores', jsonb_build_object('k', k, 'sent', coalesce((e.stats ->> 'spores')::int, 0), 'fed', coalesce((e.stats ->> 'spore_fed')::int, 0),
      'live', (select coalesce(jsonb_agg(jsonb_build_object('gx', s.gx, 'gy', s.gy, 'host', pr.username, 'fed', s.fed, 'ink', s.ink, 'until', s.expires_at)), '[]'::jsonb)
                 from public.enchant_spores s left join public.profiles pr on pr.id = s.host_id where s.enchant_id = e.id and s.expires_at > now()))); end if;
  k := private.ench_has_gene(e.id, 'chaos');
  if k > 0 then o := o || jsonb_build_object('chaos', jsonb_build_object('k', k, 'left', least(k, 3) - case when e.stats ->> 'box_day' = v_day then coalesce((e.stats ->> 'box_n')::int, 0) else 0 end,
      'opened', coalesce((e.stats ->> 'boxes')::int, 0))); end if;
  k := private.ench_has_gene(e.id, 'grow');
  if k > 0 then o := o || jsonb_build_object('giant', jsonb_build_object('k', k, 'hours', 3 + 3 * least(k, 3), 'days', coalesce((e.stats ->> 'giant_days')::int, 0),
      'now', private.plot_size(e.gx, e.gy))); end if;
  k := private.ench_has_gene(e.id, 'echo');
  if k > 0 then o := o || jsonb_build_object('echo', jsonb_build_object('k', k, 'left', least(k, 3) - case when e.stats ->> 'echo_day' = v_day then coalesce((e.stats ->> 'echo_n')::int, 0) else 0 end,
      'done', coalesce((e.stats ->> 'echoes_done')::int, 0), 'acts', to_jsonb(private.echo_acts(e.kind)),
      'pending', (select jsonb_build_object('action', q.action, 'due_at', q.due_at) from public.enchant_echoes q where q.enchant_id = e.id and q.done_at is null limit 1))); end if;
  k := private.ench_has_gene(e.id, 'linked');
  if k > 0 then o := o || jsonb_build_object('linked', jsonb_build_object('k', k, 'plot', e.stats -> 'link', 'mult', 1 + 0.2 * least(k, 3))); end if;
  k := private.ench_has_gene(e.id, 'foresight');
  if k > 0 then o := o || jsonb_build_object('foresight', jsonb_build_object('k', k, 'dodge', (array[35, 60, 80])[least(k, 3)], 'dodged', coalesce((e.stats ->> 'dodged')::int, 0),
      'preview', private.trait_preview(e))); end if;
  k := private.ench_has_gene(e.id, 'charged');
  if k > 0 then o := o || jsonb_build_object('charged', jsonb_build_object('k', k, 'static', coalesce((e.stats ->> 'static')::int, 0), 'full', (array[12, 9, 6])[least(k, 3)],
      'arcs', coalesce((e.stats ->> 'arcs')::int, 0))); end if;
  k := private.ench_has_gene(e.id, 'wish');
  if k > 0 then o := o || jsonb_build_object('wishing', jsonb_build_object('k', k, 'keeps', e.kind in ('genie', 'sizeray', 'oracle'), 'ready', coalesce(e.stats ->> 'wish_day', '') <> v_day)); end if;
  k := private.ench_has_gene(e.id, 'radiant');
  if k > 0 then o := o || jsonb_build_object('radiant', jsonb_build_object('k', k, 'r_m', private.ench_n('sun', 'radiant_m', 40) * least(k, 3), 'um', 1 + 0.5 * least(k, 3), 'faster', 10 * least(k, 3))); end if;
  k := private.ench_has_gene(e.id, 'divining');
  if k > 0 then o := o || jsonb_build_object('divining', jsonb_build_object('k', k, 'targets', private.div_targets(e.kind),
      'target', coalesce(e.stats ->> 'div_target', private.div_targets(e.kind) -> 0 ->> 'key'), 'depth', coalesce((e.stats ->> 'div_depth')::int, 0),
      'need', coalesce((e.stats ->> 'div_need')::int, ceil(3 / (1 + 0.25 * (least(k, 3) - 1)) / greatest((private.div_targets(e.kind) -> 0 ->> 'p')::numeric, 1e-6))::int),
      'hits', coalesce((e.stats ->> 'div_hits')::int, 0))); end if;
  return o;
end $$;

-- ---- Ink: the Traits don't multiply it any more ----------------------------------------------------------------------
create or replace function private.ench_pay(p_id uuid, p_base numeric, p_what text) returns jsonb language plpgsql as $$
declare e public.enchantments; p jsonb; v numeric := greatest(coalesce(p_base, 0), 0); v_mods jsonb := '[]'::jsonb; v_paid int := 0; v_extra int := 0;
  k int; b record; v_echo boolean := false; v_x numeric; v_xp int := 1; v_ab text; v_lk jsonb;
  v_cell int[]; v_chests int := 0; v_open int; v_cap int := coalesce((private.ench_cfg() ->> 'seek_chest_cap')::int, 25);
  v_chest_ink int := coalesce((private.ench_cfg() ->> 'seek_chest_ink')::int, 50); v_gene text; v_card text; v_fx jsonb; v_day text := private.today()::text; v_spark uuid;
begin
  select * into e from public.enchantments where id = p_id;
  if e.owner_id is null or v <= 0 then return jsonb_build_object('paid', 0, 'base', 0, 'mods', '[]'::jsonb, 'chests', 0); end if;
  if private.earn_any_off() and private.earn_off(array['all', 'reason:enchantment', 'ref:enchantment', 'ench:' || e.kind]) then
    perform private.earn_note(private.earn_hit(array['all', 'reason:enchantment', 'ref:enchantment', 'ench:' || e.kind]), round(v)::bigint);
    return jsonb_build_object('paid', 0, 'base', 0, 'mods', '[]'::jsonb, 'chests', 0, 'paused', true);
  end if;
  if e.level > 1 then
    v := v * (1 + coalesce((private.ench_cfg() ->> 'level_bonus')::numeric, 0.06) * (e.level - 1));
    v_mods := v_mods || jsonb_build_object('label', 'Level ' || e.level, 'emoji', '⭐');
  end if;
  if coalesce(e.stars, 0) > 0 then
    v := v * (1 + 0.1 * e.stars);
    v_mods := v_mods || jsonb_build_object('label', repeat('★', e.stars) || ' +' || (10 * e.stars) || '%', 'emoji', '🌟');
  end if;
  for p in select * from jsonb_array_elements(private.ench_partners(p_id)) loop
    continue when private.earn_any_off() and private.earn_off(array['splice', 'splice.with:' || e.kind, 'splice.with:' || coalesce(p ->> 'kind', 'plot'),
      'splice:' || least(e.kind, coalesce(p ->> 'kind', 'plot')) || '+' || greatest(e.kind, coalesce(p ->> 'kind', 'plot'))]);
    k := least(greatest(coalesce((p ->> 'strength')::int, 1), 1), 3);
    v_gene := p ->> 'gene';
    case v_gene
      when 'seek' then
        if random() < 0.25 * k then
          select count(*) into v_open from public.seek_chests where player_id = e.owner_id and dug_at is null and expires_at > now();
          if v_open < v_cap then
            v_cell := coalesce(private.rx_lode_cell(e.owner_id), private.ench_free_cell(e.gx, e.gy, 2, 7));
            insert into public.seek_chests (player_id, enchant_id, source_id, finder_kind, gx, gy, ink)
            values (e.owner_id, e.id, case when p ->> 'id' is not null then (p ->> 'id')::uuid end, e.kind, v_cell[1], v_cell[2], v_chest_ink);
            v_chests := v_chests + 1;
            v_mods := v_mods || jsonb_build_object('label', 'Seeking: a chest buried by its plot — dig it up!', 'emoji', '🧰');
          else
            v_extra := v_extra + v_chest_ink;
            v_mods := v_mods || jsonb_build_object('label', 'Seeking: a chest +' || v_chest_ink || ' (paid now — ' || v_cap || ' are waiting)', 'emoji', '🧰');
          end if;
        end if;
      when 'fated' then
        -- 🃏 a card is drawn, and it comes true
        if coalesce(current_setting('landvas.fated', true), '') <> '1' and random() < (array[0.1, 0.18, 0.25])[k] then
          v_card := (select c ->> 'id' from jsonb_array_elements(private.deck_cards()) c where c ->> 'id' <> 'rebirth' order by random() * (c ->> 'w')::numeric desc limit 1);
          perform set_config('landvas.fated', '1', true);
          v_fx := private.deck_apply(e, v_card, true, false);
          perform set_config('landvas.fated', '', true);
          update public.enchantments set stats = stats || jsonb_build_object('fated_n', coalesce((stats ->> 'fated_n')::int, 0) + 1,
                   'fated_last', jsonb_build_object('card', v_card, 'name', private.deck_card(v_card) ->> 'name', 'fx', private.deck_fx_text(v_fx), 'at', now())) where id = p_id;
          v_mods := v_mods || jsonb_build_object('label', 'Fated: ' || (private.deck_card(v_card) ->> 'name') || ' came true — ' || private.deck_fx_text(v_fx), 'emoji', '🃏', 'card', v_card);
        end if;
      -- 🧞 Wishing keeps a charge where there are charges; anywhere else, once a day the next reward is wished (×2)
      when 'wish' then
        if e.kind not in ('genie', 'sizeray', 'oracle') and coalesce(e.stats ->> 'wish_day', '') <> v_day then
          v := v * 2; v_mods := v_mods || jsonb_build_object('label', 'Wished ×2 (once a day)', 'emoji', '🧞');
          update public.enchantments set stats = stats || jsonb_build_object('wish_day', v_day, 'wished', coalesce((stats ->> 'wished')::int, 0) + 1) where id = p_id;
        end if;
      -- 🪄 Divining, where it has no luck of its own: its rewards divine a Splice spark
      when 'divining' then
        if (private.div_targets(e.kind) -> 0 ->> 'key') = 'spark' and coalesce(e.stats ->> 'div_target', 'spark') = 'spark' then
          if private.divine(p_id, 'spark', random() < 0.05, 0.05) then
            v_spark := private.splice_spark(e.owner_id, 'divined');
            if v_spark is not null then v_mods := v_mods || jsonb_build_object('label', 'Divining: a Splice spark', 'emoji', '🪄'); end if;
          end if;
        end if;
      -- what a plot lends
      when 'inspired' then v := v * 1.2; v_mods := v_mods || jsonb_build_object('label', 'Inspired by your canvas +20%', 'emoji', '🎨');
      when 'wild' then v := v * 1.1; v_xp := v_xp + 1; v_mods := v_mods || jsonb_build_object('label', 'Wild +10% · double XP', 'emoji', '🐾');
      when 'fertile' then v := v * 1.25; v_mods := v_mods || jsonb_build_object('label', 'Fertile farm +25%', 'emoji', '🌾');
      when 'invested' then v_extra := v_extra + 10; v_mods := v_mods || jsonb_build_object('label', 'Invested +10', 'emoji', '💼');
      when 'streak' then
        if random() < 0.2 then v := v * 2; v_mods := v_mods || jsonb_build_object('label', 'Arcade streak ×2', 'emoji', '🕹️'); end if;
      when 'homely' then v := v * 1.15; v_mods := v_mods || jsonb_build_object('label', 'At home +15%', 'emoji', '🏡');
      -- (Golden, Giant, Chaos, Spreading, Echo, Linked, Foresight, Charged, Radiant, Tempo, Tempered, Farsight, Folded, Strings and
      --  Inscribed all work on something of their own — never on Ink)
      else null;
    end case;
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
  for b in delete from public.enchant_buffs where id = (select id from public.enchant_buffs where enchant_id = p_id and kind = 'next_reward' and expires_at > now() order by id limit 1) returning mult, data loop
    v := v * b.mult;
    v_mods := v_mods || case when b.data ->> 'by' = 'storm' then jsonb_build_object('label', 'Overcharged ×' || round(b.mult, 2), 'emoji', '⚡')
                             else jsonb_build_object('label', 'Size-rayed ×' || round(b.mult, 2), 'emoji', '📡') end;
  end loop;
  select exp(sum(ln(greatest(mult, 0.01)))) into v_x from public.enchant_buffs where player_id = e.owner_id and kind = 'glow' and expires_at > now();
  if v_x is not null and v_x <> 1 then v := v * v_x; v_mods := v_mods || jsonb_build_object('label', 'Glow ×' || round(v_x, 2), 'emoji', '✨'); end if;
  if private.cru_set(e.owner_id) then v := v * 1.05; v_mods := v_mods || jsonb_build_object('label', 'Smith’s Set +5%', 'emoji', '⚒️'); end if;
  if exists (select 1 from public.enchant_buffs where player_id = e.owner_id and kind = 'curse_plague' and expires_at > now()) then
    v := v * 0.7; v_mods := v_mods || jsonb_build_object('label', 'Plague ×0.7', 'emoji', '🦠');
  end if;
  v := round(v) + v_extra;
  if v_echo then v := v * 2; end if;
  v_paid := private.grant_ink_paced(e.owner_id, v::int, 'enchantment', 'enchantment', p_id::text, null);
  perform private.ench_stat(p_id, 'ink', v_paid);
  perform private.ench_xp(p_id, v_xp);
  perform private.ench_event(p_id, 'paid', jsonb_build_object('what', p_what, 'ink', v_paid, 'base', round(p_base), 'mods', v_mods, 'chests', v_chests));
  return jsonb_build_object('paid', v_paid, 'base', round(p_base), 'mods', v_mods, 'chests', v_chests);
end $$;

-- a plot spliced with an enchantment: its minigames wear the Trait (the new two, and no Endless or Patchwork)
select private.fn_patch('private.ench_minigame_mult__raw(uuid,integer,integer)',
  $a$when 'tempo' then 1.3 when 'linked' then 1.4 when 'foresight' then 1.2 when 'endless' then 1.1 when 'charged' then 1.25$a$,
  $b$when 'tempo' then 1.3 when 'linked' then 1.4 when 'foresight' then 1.2 when 'radiant' then 1.2 when 'divining' then case when random() < 0.15 then 2 else 1 end when 'charged' then 1.25$b$);

-- 🌀 a Linked plot is tempered too (the Leviathan, Parasites, pranks and scorches)
create or replace function private.cru_anchored(p_gx int, p_gy int) returns boolean language sql stable as $$
  select exists (select 1 from public.crucible_artifacts a where a.gx = p_gx and a.gy = p_gy and a.kind = 'anchor')
      or exists (select 1 from public.enchant_buffs b where b.kind = 'ward' and b.gx = p_gx and b.gy = p_gy and b.expires_at > now())
      or private.ench_tempered_at(p_gx, p_gy)
      or private.rx_frozen_at(p_gx, p_gy)
      or private.trait_linked_tempered(p_gx, p_gy)
$$;

revoke all on function private.ench_refill(public.enchantments, int) from public;
