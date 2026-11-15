-- Enchantments, part 8: the six newest as they were pitched.
--
--  Traits that do something of their own (no more "earns more Ink"):
--   🔭 Farsight   the partner reaches twice as far (×3, ×4 stronger) for anything it does on the map — Treasure Map
--                 pieces and digs, Wormhole ends, Puppeteer strings, Spyglass looks, Origami landings, a storm's strays,
--                 the Vortex glyph. A kind that reaches for nothing scouts instead: each day it hands you a private
--                 Spyglass reading of an unclaimed plot near it (2, 3 stronger).
--   🦢 Folded     once a day (twice, three times stronger) fold the partner's longest wait in half — with a tap. With
--                 nothing to wait for, the fold goes to whichever of your enchantments has the longest wait.
--   🔥 Tempered   the old Trickster: it dodges its bad luck — and its plot is tempered: the Leviathan can't trample it,
--                 Parasites can't latch on, pranks and storm scorches bounce off.
--   🎭 Strings    once a day (twice, three times) a puppet does one of the partner's chores for you: collects or polishes
--                 the egg, winds the key, lifts a notch, cranks the coil, tends the horseshoes, studies the Spellbook,
--                 turns a card, looks through the glass… With no chores of its own it does another enchantment's.
--   🃏 Fated      1 in 10 (18%, 25%) of the partner's rewards draws one of the 22 cards — and the card comes true.
--   ✍️ Inscribed  every kind has its own rune. Trace the partner's rune once a day: it casts that glyph's spell for
--                 free, as strong as you drew it (stronger still at ×2, ×3).
--  …and what else the pitch promised: the Spyglass's "something stirs", the Weak Spot, the Paper Shield, the Tangle and a
--  drawn Thunder Glyph against the Leviathan; a folded plot's drawing travels with it; puppet runs play the level the plot
--  is on and the Grand Show is a three-plot medley; the Fated Deck's reversed cards are bigger with a catch, the Wheel
--  is a free reroll, a Past–Present–Future spread chains at level 4 and a five-card Grand Spread comes weekly at level 8;
--  glyphs turn up in minigames, Leviathan loot, chests and rare plots; the Vortex pulls your buried chests in and the
--  Thunder glyph strikes the Leviathan; the Mirror Shard can reflect the Puppeteer; fair-play logs.

alter table public.leviathans add column if not exists weakspot_until timestamptz;
-- the pipeline can move a drawing's tile to a new cell (a plot unfolded somewhere new)
alter table private.render_jobs drop constraint if exists render_jobs_kind_check;
alter table private.render_jobs add constraint render_jobs_kind_check
  check (kind in ('process_publication', 'publish_publication', 'unpublish_publication', 'clear_cells', 'move_art'));

create table if not exists private.fairplay_log (
  id bigint generated always as identity primary key,
  player_id uuid not null,
  kind text not null,
  gx int, gy int,
  data jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists fairplay_log_player_idx on private.fairplay_log (player_id, at desc);
create index if not exists fairplay_log_kind_idx on private.fairplay_log (kind, at desc);
alter table private.fairplay_log enable row level security;

create or replace function private.fairplay(p_uid uuid, p_kind text, p_gx int, p_gy int, p_data jsonb default '{}'::jsonb) returns void language sql as $$
  insert into private.fairplay_log (player_id, kind, gx, gy, data) values (p_uid, p_kind, p_gx, p_gy, coalesce(p_data, '{}'::jsonb))
$$;

-- ---- 🔭 Farsight ------------------------------------------------------------------------------------------------------
-- how far it reaches: ×2 with the Trait, ×3 / ×4 stronger
create or replace function private.ench_reach(p_id uuid) returns numeric language sql stable as $$
  select 1 + private.ench_has_gene(p_id, 'farsight')::numeric
$$;
-- the kinds that reach for something on the map (the rest scout)
create or replace function private.ench_reaches(p_kind text) returns boolean language sql immutable as $$
  select p_kind in ('map', 'wormhole', 'puppeteer', 'spyglass', 'origami', 'stormcoil', 'glyph')
$$;

-- a scout's daily readings: private Spyglass readings of unclaimed plots near it (claim one within a day and it's that roll)
create or replace function private.trait_farsight_run(p_id uuid) returns jsonb language plpgsql as $$
declare x public.enchantments; k int; v_day text := private.today()::text; i int; c int[]; v_roll jsonb; v_id bigint; v_out jsonb := '[]'::jsonb;
begin
  select * into x from public.enchantments where id = p_id;
  if x.id is null or x.status <> 'active' or x.owner_id is null or private.ench_reaches(x.kind) then return null; end if;
  if coalesce(x.stats ->> 'far_day', '') = v_day then return null; end if;
  k := private.ench_has_gene(p_id, 'farsight');
  if k = 0 then return null; end if;
  update public.enchantments set stats = stats || jsonb_build_object('far_day', v_day) where id = p_id;
  for i in 1 .. k loop
    c := private.ench_free_cell(x.gx, x.gy, 4, 110);
    continue when exists (select 1 from public.world_plots w where w.gx = c[1] and w.gy = c[2] and (w.owner_id is not null or w.locked));
    continue when exists (select 1 from private.spy_sightings s where s.player_id = x.owner_id and s.gx = c[1] and s.gy = c[2] and s.used_at is null and s.refunded_at is null and s.expires_at > now());
    v_roll := private.spy_roll(c[1], c[2]);
    insert into private.spy_sightings (player_id, enchant_id, gx, gy, rarity, kind, hot, expires_at)
    values (x.owner_id, x.id, c[1], c[2], v_roll ->> 'rarity', v_roll ->> 'kind', private.in_hot_zone(c[1], c[2]), now() + interval '24 hours')
    returning id into v_id;
    perform private.fairplay(x.owner_id, 'spy_scout', c[1], c[2], jsonb_build_object('enchant', x.id, 'rarity', v_roll ->> 'rarity'));
    v_out := v_out || jsonb_build_object('id', v_id, 'gx', c[1], 'gy', c[2], 'rarity', v_roll ->> 'rarity');
  end loop;
  if jsonb_array_length(v_out) > 0 then
    update public.enchantments set stats = stats || jsonb_build_object('far_n', coalesce((stats ->> 'far_n')::int, 0) + jsonb_array_length(v_out), 'far_last', v_out) where id = p_id;
    perform private.ench_event(p_id, 'far_sighted', jsonb_build_object('n', jsonb_array_length(v_out), 'best', (select r ->> 'rarity' from jsonb_array_elements(v_out) r order by private.spy_rank(r ->> 'rarity') desc limit 1)));
    perform private.notify(x.owner_id, 'enchant', null, jsonb_build_object('sub', 'far_sighted', 'kind', x.kind, 'id', x.id, 'n', jsonb_array_length(v_out),
      'rarity', (select r ->> 'rarity' from jsonb_array_elements(v_out) r order by private.spy_rank(r ->> 'rarity') desc limit 1)));
  end if;
  return v_out;
end $$;

-- ---- 🦢 Folded --------------------------------------------------------------------------------------------------------
-- an enchantment's longest wait right now, from its own view (seconds; null: nothing to wait for)
create or replace function private.ench_longest_wait(e public.enchantments) returns jsonb language plpgsql stable as $$
declare v jsonb; k text; x jsonb; v_best text; v_s numeric := 0;
begin
  if e.id is null or e.status <> 'active' or (e.frozen_at is not null and now() < e.frozen_until) then return null; end if;
  v := private.ench_kind_view(e, private.ench_now(e));
  if v is null or jsonb_typeof(v) <> 'object' then return null; end if;
  for k, x in select * from jsonb_each(v) loop
    if right(k, 3) = '_in' and k <> 'choose_in' and jsonb_typeof(x) = 'number' and (x #>> '{}')::numeric between 60 and 2592000 and (x #>> '{}')::numeric > v_s then
      v_best := k; v_s := (x #>> '{}')::numeric;
    end if;
  end loop;
  if v_best is null then return null; end if;
  return jsonb_build_object('key', v_best, 's', round(v_s));
end $$;

create or replace function private.trait_fold(e public.enchantments) returns jsonb language plpgsql as $$
declare k int := private.ench_has_gene(e.id, 'folded'); v_day text := private.today()::text; v_n int; w jsonb; x public.enchantments; o public.enchantments; ow jsonb; v_skip numeric;
begin
  if k = 0 then raise exception 'no_trait' using errcode = 'P0001'; end if;
  v_n := case when e.stats ->> 'fold_day' = v_day then coalesce((e.stats ->> 'fold_n')::int, 0) else 0 end;
  if v_n >= k then raise exception 'already_today' using errcode = 'P0001'; end if;
  x := e; w := private.ench_longest_wait(e);
  -- nothing to wait for: the fold goes to whichever of your enchantments waits longest
  if w is null then
    for o in select * from public.enchantments where owner_id = e.owner_id and status = 'active' and id <> e.id order by born_at limit 60 loop
      ow := private.ench_longest_wait(o);
      if ow is not null and (w is null or (ow ->> 's')::numeric > (w ->> 's')::numeric) then w := ow; x := o; end if;
    end loop;
  end if;
  if w is null then raise exception 'nothing_to_wait' using errcode = 'P0001'; end if;
  perform private.ench_settle(x.id);
  v_skip := round((w ->> 's')::numeric / 2);
  update public.enchantments set clock_skip = clock_skip + v_skip, updated_at = now() where id = x.id;
  update public.enchantments set stats = stats || jsonb_build_object('fold_day', v_day, 'fold_n', v_n + 1, 'folds_total', coalesce((stats ->> 'folds_total')::int, 0) + 1,
                                                                      'fold_saved', coalesce((stats ->> 'fold_saved')::numeric, 0) + v_skip) where id = e.id;
  perform private.ench_event(e.id, 'trait_fold', jsonb_build_object('s', v_skip, 'key', w ->> 'key', 'target_kind', case when x.id <> e.id then x.kind end));
  if x.id <> e.id then perform private.ench_event(x.id, 'folded_by', jsonb_build_object('s', v_skip, 'kind', e.kind)); end if;
  return jsonb_build_object('folded', v_skip, 'key', w ->> 'key', 'target', x.id, 'target_kind', x.kind, 'other', x.id <> e.id, 'left', k - v_n - 1);
end $$;

-- ---- 🎭 Strings ---------------------------------------------------------------------------------------------------------
-- each kind's chores, tried in order (the first that can be done is done)
create or replace function private.trait_chores(p_kind text) returns jsonb language sql immutable as $$
  select coalesce(('{
    "goose": [{"act": "collect", "label": "collected its golden egg"}, {"act": "chase", "label": "chased the fox off its egg"}, {"act": "polish", "label": "polished its egg"}],
    "clockwork": [{"act": "wind", "a": {"turns": 5}, "label": "wound its key five turns"}],
    "pandora": [{"act": "open", "a": {"notches": 1}, "label": "lifted the lid a notch"}],
    "parasite": [{"act": "harvest", "label": "harvested its feed"}],
    "stormcoil": [{"act": "crank", "a": {"turns": 3}, "label": "cranked its handle three turns"}],
    "oracle": [{"act": "gaze", "a": {"what": "roll"}, "label": "gazed at your next rolls"}],
    "crucible": [{"act": "tend", "label": "tended your horseshoes"}],
    "glyph": [{"act": "study", "label": "studied the Spellbook"}],
    "spyglass": [{"act": "look", "label": "looked through the glass at a spot nearby"}],
    "deck": [{"act": "flip", "a": {"i": 0}, "label": "turned a card"}, {"act": "flip", "a": {"i": 1}, "label": "turned a card"}, {"act": "flip", "a": {"i": 2}, "label": "turned a card"}]
  }'::jsonb) -> p_kind, '[]'::jsonb)
$$;

create or replace function private.trait_chore(p_id uuid) returns jsonb language plpgsql as $$
declare x public.enchantments; c jsonb; a jsonb; v jsonb; v2 jsonb; t timestamptz; cell int[];
begin
  select * into x from public.enchantments where id = p_id for update;
  if x.id is null or x.status <> 'active' or x.owner_id is null or (x.frozen_at is not null and now() < x.frozen_until) then return null; end if;
  t := private.ench_now(x);
  for c in select y from jsonb_array_elements(private.trait_chores(x.kind)) y loop
    a := coalesce(c -> 'a', '{}'::jsonb);
    if c ->> 'act' = 'look' then cell := private.ench_free_cell(x.gx, x.gy, 4, 90); a := jsonb_build_object('gx', cell[1], 'gy', cell[2]); end if;
    begin
      v := case x.kind
        when 'goose' then private.ench_act_goose(x, c ->> 'act', a, t) when 'clockwork' then private.ench_act_clockwork(x, c ->> 'act', a, t)
        when 'pandora' then private.ench_act_pandora(x, c ->> 'act', a, t) when 'parasite' then private.ench_act_parasite(x, c ->> 'act', a, t)
        when 'stormcoil' then private.ench_act_stormcoil(x, c ->> 'act', a, t) when 'oracle' then private.ench_act_oracle(x, c ->> 'act', a, t)
        when 'crucible' then private.ench_act_crucible(x, c ->> 'act', a, t) when 'glyph' then private.ench_act_glyph(x, c ->> 'act', a, t)
        when 'spyglass' then private.ench_act_spyglass(x, c ->> 'act', a, t) when 'deck' then private.ench_act_deck(x, c ->> 'act', a, t) end;
      if v is not null then
        update public.enchantments set state = v -> 'state', updated_at = now() where id = x.id;
        -- a turned card comes true
        if x.kind = 'deck' then
          select * into x from public.enchantments where id = p_id;
          v2 := private.ench_act_deck(x, 'accept', '{}'::jsonb, t);
          update public.enchantments set state = v2 -> 'state', updated_at = now() where id = x.id;
          v := jsonb_build_object('result', v2 -> 'result');
        end if;
        return jsonb_build_object('act', c ->> 'act', 'label', c ->> 'label', 'kind', x.kind, 'id', x.id, 'result', v -> 'result');
      end if;
    exception when others then
      -- (that chore can't be done right now: try the next)
      null;
    end;
  end loop;
  return null;
end $$;

create or replace function private.trait_strings_run(p_id uuid) returns jsonb language plpgsql as $$
declare x public.enchantments; k int; v_day text := private.today()::text; v_done int; r jsonb; o record;
begin
  select * into x from public.enchantments where id = p_id;
  if x.id is null or x.status <> 'active' or x.owner_id is null then return null; end if;
  v_done := case when x.stats ->> 'strings_day' = v_day then coalesce((x.stats ->> 'strings_n')::int, 0) else 0 end;
  if v_done >= 3 then return null; end if;
  k := private.ench_has_gene(p_id, 'strings');
  if k = 0 or v_done >= k then return null; end if;
  update public.enchantments set stats = stats || jsonb_build_object('strings_day', v_day, 'strings_n', v_done + 1) where id = p_id;
  r := private.trait_chore(p_id);
  -- no chore of its own (or none to do right now): a chore for one of your other enchantments
  if r is null then
    for o in select id from public.enchantments where owner_id = x.owner_id and status = 'active' and id <> p_id
               and jsonb_array_length(private.trait_chores(kind)) > 0 order by random() limit 8 loop
      r := private.trait_chore(o.id);
      exit when r is not null;
    end loop;
  end if;
  if r is not null then
    update public.enchantments set stats = stats || jsonb_build_object('strings_last', r - 'result' || jsonb_build_object('at', now()),
                                                                        'chores', coalesce((stats ->> 'chores')::int, 0) + 1) where id = p_id;
    perform private.ench_event(p_id, 'strings', jsonb_build_object('label', r ->> 'label', 'kind', r ->> 'kind', 'other', (r ->> 'id')::uuid <> p_id));
  end if;
  return r;
end $$;

-- the daily Traits that work by themselves (the heartbeat, private.wonders_tick, calls this every couple of minutes)
create or replace function private.trait_daily(p_id uuid) returns void language plpgsql as $$
begin
  perform private.trait_strings_run(p_id);
  perform private.trait_farsight_run(p_id);
end $$;

-- ---- ✍️ Inscribed -------------------------------------------------------------------------------------------------------
-- every kind's rune: a glyph from the Glyphcaster's book (traced on the partner's page)
create or replace function private.rune_of(p_kind text) returns text language sql immutable as $$
  select coalesce(('{"goose": "moon", "genie": "star", "map": "anchor", "parasite": "eye", "pandora": "wave", "splice": "key", "clockwork": "arrow",
    "sizeray": "triangle", "shard": "eye", "wormhole": "hourglass", "oracle": "moon", "ouroboros": "key", "homunculus": "eye", "stormcoil": "bolt",
    "spyglass": "star", "origami": "triangle", "crucible": "anchor", "puppeteer": "arrow", "deck": "star", "glyph": "wave", "cuckoo": "star"}'::jsonb) ->> p_kind, 'star')
$$;

-- a rune's spell, cast on the enchantment it's traced on (its own plot, its own waits)
create or replace function private.rune_cast(x public.enchantments, p_glyph text, p_pow numeric) returns jsonb language plpgsql as $$
declare d jsonb := private.glyph_def(p_glyph); f jsonb; v_out jsonb := '[]'::jsonb; v_n int; v_lk jsonb;
begin
  for f in select y from jsonb_array_elements(d -> 'fx') y loop
    case f ->> 't'
      when 'luck' then v_n := greatest(1, round((f ->> 'v')::numeric * p_pow))::int; v_lk := private.ench_give_luck(x.owner_id, v_n, 0); v_out := v_out || jsonb_build_object('t', 'luck', 'v', v_n);
      when 'eluck' then v_n := greatest(1, floor((f ->> 'v')::numeric * p_pow))::int; v_lk := private.ench_give_luck(x.owner_id, 0, v_n); v_out := v_out || jsonb_build_object('t', 'eluck', 'v', v_n);
      when 'ward' then
        insert into public.enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, data, expires_at)
        values (x.owner_id, 'ward', x.gx, x.gy, x.id, 1, jsonb_build_object('glyph', p_glyph, 'rune', true), now() + make_interval(mins => round((f ->> 'h')::numeric * 60 * p_pow)::int));
        v_out := v_out || jsonb_build_object('t', 'ward', 'gx', x.gx, 'gy', x.gy, 'min', round((f ->> 'h')::numeric * 60 * p_pow));
      when 'key' then
        perform private.ench_settle(x.id);
        update public.enchantments set clock_skip = clock_skip + round((f ->> 's')::numeric * p_pow) where id = x.id;
        v_out := v_out || jsonb_build_object('t', 'key', 'target', x.id, 's', round((f ->> 's')::numeric * p_pow));
      when 'xp' then
        perform private.ench_xp(x.id, greatest(1, round((f ->> 'v')::numeric * p_pow))::int);
        v_out := v_out || jsonb_build_object('t', 'xp', 'target', x.id, 'v', greatest(1, round((f ->> 'v')::numeric * p_pow)));
      when 'cleanse' then
        with dd as (delete from public.enchant_buffs where player_id = x.owner_id and kind like 'curse_%' returning 1) select count(*) into v_n from dd;
        v_out := v_out || jsonb_build_object('t', 'cleanse', 'v', v_n);
      when 'bolt' then
        insert into public.enchant_buffs (player_id, kind, enchant_id, mult, data, expires_at)
        values (x.owner_id, 'glyph_bolt', x.id, case when p_pow >= 1.2 then 3 else (f ->> 'm')::numeric end, jsonb_build_object('rune', true), now() + make_interval(mins => (f ->> 'min')::int));
        v_out := v_out || jsonb_build_object('t', 'bolt', 'm', case when p_pow >= 1.2 then 3 else (f ->> 'm')::numeric end, 'min', (f ->> 'min')::int);
      else null;
    end case;
  end loop;
  return v_out;
end $$;

create or replace function private.trait_rune(e public.enchantments, a jsonb) returns jsonb language plpgsql as $$
declare k int := private.ench_has_gene(e.id, 'inscribed'); v_day text := private.today()::text; v_acc numeric; v_pow numeric; v_glyph text := private.rune_of(e.kind); v_out jsonb;
begin
  if k = 0 then raise exception 'no_trait' using errcode = 'P0001'; end if;
  if e.stats ->> 'rune_day' = v_day then raise exception 'already_today' using errcode = 'P0001'; end if;
  v_acc := least(1, greatest(0, coalesce((a ->> 'accuracy')::numeric, 0)));
  -- a scrawl doesn't take: try again
  if v_acc < 0.35 then return jsonb_build_object('fizzled', true, 'glyph', v_glyph, 'accuracy', round(v_acc, 2)); end if;
  v_pow := (0.6 + 0.4 * v_acc) * (1 + 0.5 * (k - 1));
  v_out := private.rune_cast(e, v_glyph, v_pow);
  update public.enchantments set stats = stats || jsonb_build_object('rune_day', v_day, 'runes', coalesce((stats ->> 'runes')::int, 0) + 1,
                                                                      'rune_best', greatest(coalesce((stats ->> 'rune_best')::numeric, 0), round(v_acc, 2))) where id = e.id;
  perform private.ench_event(e.id, 'rune', jsonb_build_object('glyph', v_glyph, 'name', private.glyph_def(v_glyph) ->> 'name', 'accuracy', round(v_acc, 2), 'effects', v_out));
  return jsonb_build_object('glyph', v_glyph, 'name', private.glyph_def(v_glyph) ->> 'name', 'accuracy', round(v_acc, 2), 'power', round(v_pow, 2), 'effects', v_out);
end $$;

-- the generic Trait actions (on any enchantment wearing the Trait)
create or replace function private.trait_act(e public.enchantments, p_action text, a jsonb) returns jsonb language plpgsql as $$
begin
  return case p_action when 'trait_fold' then private.trait_fold(e) when 'trait_rune' then private.trait_rune(e, a) end;
end $$;

-- what the Traits it wears can do right now (for its page)
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
  return o;
end $$;

-- ---- 🔥 Tempered ------------------------------------------------------------------------------------------------------
-- an enchantment on this plot wears Tempered (a Crucible spliced with it)
create or replace function private.ench_tempered_at(p_gx int, p_gy int) returns boolean language sql stable as $$
  select exists (
    select 1 from public.enchantments x
      join public.enchant_splices s on (s.a = x.id or (s.b = x.id and s.mode <> 'graft')) and s.started_at <= now() and s.ends_at > now()
      join public.enchantments o on o.id = case when s.a = x.id then s.b else s.a end
     where x.gx = p_gx and x.gy = p_gy and x.status = 'active' and o.kind = 'crucible')
$$;

-- ---- 🃏 Fated: what a card did, in a few words -------------------------------------------------------------------------
create or replace function private.deck_fx_text(p_fx jsonb) returns text language sql immutable as $$
  select coalesce(string_agg(case f ->> 't'
      when 'ink' then '+' || coalesce(f ->> 'v', '0') || ' Ink'
      when 'luck' then case when (f ->> 'v')::int >= 0 then '+' else '' end || (f ->> 'v') || ' Luck'
      when 'eluck' then '+' || (f ->> 'v') || ' Enchanted Luck'
      when 'wins' then 'next ' || (f ->> 'u') || ' wins ×' || (f ->> 'm')
      when 'glow' then 'enchantments ×' || (f ->> 'm') || ' for ' || (f ->> 'h') || ' h'
      when 'lev' then 'Leviathan hits ×' || (f ->> 'm')
      when 'ticket' then case when coalesce((f ->> 'won')::boolean, true) then 'a ' || initcap(f ->> 'r') || '+ ticket' else 'no ticket' end
      when 'reroll' then (f ->> 'v') || ' free reroll' || case when (f ->> 'v')::int > 1 then 's' else '' end
      when 'rebirth' then 'a Rebirth'
      else null end, ', '), '')
  from jsonb_array_elements(coalesce(p_fx, '[]'::jsonb)) f
$$;

-- ---- 🐉 the Leviathan: a hit from outside the fight (the Thunder glyph) -------------------------------------------------
create or replace function private.lev_strike(p_uid uuid, p_dmg numeric, p_label text, p_emoji text, p_move text) returns jsonb language plpgsql as $$
declare l public.leviathans; v_before bigint; v_dmg bigint;
begin
  select * into l from public.leviathans where status in ('walking', 'enraged', 'fleeing') order by spawned_at desc limit 1 for update;
  if l.id is null then return null; end if;
  if private.lev_hidden(l) and not private.lev_spotted(l, p_uid) then return null; end if;
  insert into public.leviathan_players (lev_id, player_id, bombs, bombs_at) values (l.id, p_uid, private.lev_n('bombs_max', 60), now()) on conflict do nothing;
  v_before := l.hp;
  v_dmg := least(round(p_dmg * private.lev_mult(l) * private.lev_player_mult(p_uid))::bigint, l.hp);
  update public.leviathans set hp = hp - v_dmg where id = l.id returning * into l;
  update public.leviathan_players set dmg = dmg + v_dmg, hits = hits + 1 where lev_id = l.id and player_id = p_uid;
  insert into public.leviathan_hits (lev_id, player_id, move, label, emoji, dmg) values (l.id, p_uid, p_move, p_label, p_emoji, v_dmg);
  if l.hp <= 0 then perform private.lev_fall(l.id);
  elsif (v_before > l.hp_max * 0.5 and l.hp <= l.hp_max * 0.5) or (v_before > l.hp_max * 0.1 and l.hp <= l.hp_max * 0.1) then perform private.lev_phase(l.id);
  end if;
  return jsonb_build_object('dmg', v_dmg, 'fell', l.hp <= 0, 'gen', l.gen);
end $$;

-- the Glyphcaster's Thunder Glyph in the fight: drawn — how well it was drawn sets the damage
create or replace function public.leviathan_glyph(p_enchant uuid, p_accuracy numeric) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform set_config('landvas.lev_acc', least(1, greatest(0, coalesce(p_accuracy, 0)))::text, true);
  return public.leviathan_hit('enchant', 1, p_enchant);
end $$;
revoke all on function public.leviathan_glyph(uuid, numeric) from public;
grant execute on function public.leviathan_glyph(uuid, numeric) to authenticated;

-- ---- ✍️ glyphs turn up: in minigame runs, Leviathan loot, chests and rare plots -----------------------------------------
create or replace function private.glyph_drop(p_uid uuid, p_source text, p_chance numeric) returns text language plpgsql as $$
declare e public.enchantments; v_known jsonb; v_id text;
begin
  if p_uid is null or coalesce(p_chance, 0) <= 0 or random() >= p_chance then return null; end if;
  select * into e from public.enchantments where owner_id = p_uid and kind = 'glyph' and status = 'active' order by level desc, born_at limit 1 for update;
  if e.id is null then return null; end if;
  v_known := coalesce(e.state -> 'known', '["spiral", "star", "triangle"]'::jsonb);
  v_id := private.glyph_find(v_known, jsonb_array_length(v_known) >= 20 and random() < 0.5);
  if v_id is null then v_id := private.glyph_find(v_known, false); end if;
  if v_id is null then v_id := private.glyph_find(v_known, true); end if;
  if v_id is null then return null; end if;
  update public.enchantments set state = state || jsonb_build_object('known', v_known || to_jsonb(v_id)), updated_at = now() where id = e.id;
  perform private.ench_event(e.id, 'found', jsonb_build_object('glyph', v_id, 'name', private.glyph_def(v_id) ->> 'name', 'source', p_source));
  perform private.notify(p_uid, 'enchant', null, jsonb_build_object('sub', 'glyph_found', 'kind', 'glyph', 'id', e.id, 'glyph', v_id, 'name', private.glyph_def(v_id) ->> 'name', 'source', p_source));
  return v_id;
end $$;
-- ---- 🃏 Fated Deck: reversed cards are bigger, with a catch; the Wheel is a free reroll ------------------------------------
create or replace function private.deck_cards() returns jsonb language sql immutable as $$
  select '[
    {"id": "fool", "n": 0, "name": "The Fool", "w": 1, "up": [{"t": "ink", "v": 40}, {"t": "luck", "v": 5}], "rev": [{"t": "ink", "v": 110}, {"t": "luck", "v": -6}]},
    {"id": "magician", "n": 1, "name": "The Magician", "w": 1, "up": [{"t": "wins", "m": 2, "u": 3}], "rev": [{"t": "wins", "m": 3, "u": 3}, {"t": "glow", "m": 0.85, "h": 6}]},
    {"id": "priestess", "n": 2, "name": "The High Priestess", "w": 1, "up": [{"t": "eluck", "v": 1}], "rev": [{"t": "eluck", "v": 2}, {"t": "luck", "v": -10}]},
    {"id": "empress", "n": 3, "name": "The Empress", "w": 1, "up": [{"t": "glow", "m": 1.25, "h": 8}], "rev": [{"t": "glow", "m": 1.7, "h": 4}, {"t": "luck", "v": -8}]},
    {"id": "emperor", "n": 4, "name": "The Emperor", "w": 1, "up": [{"t": "ink", "v": 80}], "rev": [{"t": "ink", "v": 170}, {"t": "luck", "v": -8}]},
    {"id": "hierophant", "n": 5, "name": "The Hierophant", "w": 1, "up": [{"t": "luck", "v": 10}], "rev": [{"t": "luck", "v": 26}, {"t": "glow", "m": 0.85, "h": 4}]},
    {"id": "lovers", "n": 6, "name": "The Lovers", "w": 1, "up": [{"t": "ink", "v": 50}, {"t": "luck", "v": 5}], "rev": [{"t": "ink", "v": 130}, {"t": "luck", "v": -6}]},
    {"id": "chariot", "n": 7, "name": "The Chariot", "w": 1, "up": [{"t": "wins", "m": 1.5, "u": 6}], "rev": [{"t": "wins", "m": 2.5, "u": 3}, {"t": "glow", "m": 0.9, "h": 4}]},
    {"id": "strength", "n": 8, "name": "Strength", "w": 1, "up": [{"t": "lev", "m": 2, "h": 24}], "rev": [{"t": "lev", "m": 4, "h": 3}, {"t": "glow", "m": 0.9, "h": 4}]},
    {"id": "hermit", "n": 9, "name": "The Hermit", "w": 1, "up": [{"t": "luck", "v": 15}], "rev": [{"t": "luck", "v": 32}, {"t": "glow", "m": 0.85, "h": 6}]},
    {"id": "wheel", "n": 10, "name": "Wheel of Fortune", "w": 1, "up": [{"t": "reroll", "v": 1}], "rev": [{"t": "reroll", "v": 2}, {"t": "glow", "m": 0.85, "h": 4}]},
    {"id": "justice", "n": 11, "name": "Justice", "w": 1, "up": [{"t": "plots", "v": 10, "cap": 120}], "rev": [{"t": "plots", "v": 20, "cap": 240}, {"t": "luck", "v": -10}]},
    {"id": "hanged", "n": 12, "name": "The Hanged One", "w": 1, "up": [{"t": "glow", "m": 1.4, "h": 4}], "rev": [{"t": "glow", "m": 2, "h": 2}, {"t": "luck", "v": -8}]},
    {"id": "rebirth", "n": 13, "name": "Rebirth", "w": 1, "up": [{"t": "rebirth", "v": 1}], "rev": [{"t": "rebirth", "v": 2}, {"t": "glow", "m": 0.85, "h": 6}]},
    {"id": "temperance", "n": 14, "name": "Temperance", "w": 1, "up": [{"t": "wins", "m": 1.3, "u": 10}], "rev": [{"t": "wins", "m": 1.6, "u": 10}, {"t": "luck", "v": -8}]},
    {"id": "devil", "n": 15, "name": "The Devil", "w": 1, "up": [{"t": "glow", "m": 1.6, "h": 3}, {"t": "luck", "v": -10}], "rev": [{"t": "glow", "m": 2.2, "h": 3}, {"t": "luck", "v": -20}]},
    {"id": "tower", "n": 16, "name": "The Tower", "w": 1, "up": [{"t": "lev", "m": 3, "h": 24}], "rev": [{"t": "lev", "m": 5, "h": 2}, {"t": "glow", "m": 0.85, "h": 6}]},
    {"id": "star", "n": 17, "name": "The Star", "w": 1, "up": [{"t": "luck", "v": 15}], "rev": [{"t": "luck", "v": 30}, {"t": "eluck", "v": 1}, {"t": "glow", "m": 0.85, "h": 4}]},
    {"id": "moon", "n": 18, "name": "The Moon", "w": 1, "up": [{"t": "ticket", "r": "rare"}], "rev": [{"t": "ticket", "r": "epic"}, {"t": "luck", "v": -15}]},
    {"id": "sun", "n": 19, "name": "The Sun", "w": 1, "up": [{"t": "glow", "m": 1.25, "h": 24}], "rev": [{"t": "glow", "m": 1.5, "h": 24}, {"t": "luck", "v": -15}]},
    {"id": "judgement", "n": 20, "name": "Judgement", "w": 1, "up": [{"t": "ink", "v": 100}], "rev": [{"t": "ink", "v": 210}, {"t": "glow", "m": 0.8, "h": 6}]},
    {"id": "world", "n": 21, "name": "The World", "w": 0.5, "up": [{"t": "ticket", "r": "rare"}, {"t": "ink", "v": 60}], "rev": [{"t": "ticket", "r": "epic"}, {"t": "luck", "v": -20}, {"t": "glow", "m": 0.85, "h": 6}]}
  ]'::jsonb
$$;

-- a card comes true, at a strength (a gilded card ×1.5; a spread's chain ×1.25, ×1.5…)
create or replace function private.deck_apply_x(e public.enchantments, p_card text, p_up boolean, p_foil boolean, p_mult numeric) returns jsonb language plpgsql as $$
declare c jsonb := private.deck_card(p_card); x jsonb; v_out jsonb := '[]'::jsonb; v_pay jsonb; v_n int; v_lk jsonb; v_ok boolean;
  v_f numeric := (case when p_foil then 1.5 else 1 end) * greatest(coalesce(p_mult, 1), 0.1); v_m numeric; v_ppr int;
  -- a bonus grows with the strength; a catch doesn't
  v_name text := c ->> 'name' || case when p_up then '' else ' (reversed)' end;
begin
  for x in select y from jsonb_array_elements(c -> case when p_up then 'up' else 'rev' end) y loop
    v_m := (x ->> 'm')::numeric;
    if v_m > 1 then v_m := round(1 + (v_m - 1) * v_f, 2); end if;
    case x ->> 't'
      when 'ink' then
        v_pay := private.ench_pay(e.id, (x ->> 'v')::numeric * v_f, v_name);
        v_out := v_out || jsonb_build_object('t', 'ink', 'v', v_pay -> 'paid', 'pay', v_pay);
      when 'coin' then
        v_ok := random() < 0.5;
        if v_ok then v_pay := private.ench_pay(e.id, (x ->> 'v')::numeric * v_f, v_name || ': the coin came up'); end if;
        v_out := v_out || jsonb_build_object('t', 'coin', 'won', v_ok, 'v', coalesce(v_pay -> 'paid', '0'::jsonb), 'pay', v_pay);
      when 'plots' then
        select count(*) into v_n from public.world_plots where owner_id = e.owner_id;
        v_pay := private.ench_pay(e.id, least((x ->> 'cap')::numeric * v_f, v_n * (x ->> 'v')::numeric * v_f), v_name || ': ' || v_n || ' plots');
        v_out := v_out || jsonb_build_object('t', 'ink', 'v', v_pay -> 'paid', 'pay', v_pay);
      when 'luck' then
        if (x ->> 'v')::int >= 0 then v_n := ceil((x ->> 'v')::numeric * v_f)::int; v_lk := private.ench_give_luck(e.owner_id, v_n, 0);
        else
          v_n := (x ->> 'v')::int;
          insert into public.player_luck (player_id) values (e.owner_id) on conflict (player_id) do nothing;
          update public.player_luck set luck = greatest(0, luck + v_n), updated_at = now() where player_id = e.owner_id;
        end if;
        v_out := v_out || jsonb_build_object('t', 'luck', 'v', v_n);
      when 'coinluck' then
        v_ok := random() < 0.5;
        v_lk := private.ench_give_luck(e.owner_id, case when v_ok then (x ->> 'v')::int else (x ->> 'lo')::int end, 0);
        v_out := v_out || jsonb_build_object('t', 'luck', 'won', v_ok, 'v', case when v_ok then (x ->> 'v')::int else (x ->> 'lo')::int end);
      when 'eluck' then
        v_n := greatest(1, floor((x ->> 'v')::numeric * least(v_f, 2)))::int;
        v_lk := private.ench_give_luck(e.owner_id, 0, v_n);
        v_out := v_out || jsonb_build_object('t', 'eluck', 'v', v_n);
      when 'reroll' then
        -- Wheel of Fortune: free rerolls on your next plot roll (the Luck they cost, given and armed)
        v_ppr := greatest(1, coalesce((private.cfg('luck') ->> 'points_per_roll')::int, 20));
        v_n := least(5, (x ->> 'v')::int + case when v_f >= 1.5 then 1 else 0 end);
        v_lk := private.ench_give_luck(e.owner_id, v_n * v_ppr, 0);
        update public.player_luck set armed = least(greatest(coalesce(armed, 0), 0) + v_n, coalesce((private.cfg('luck') ->> 'max_rolls')::int, 6) - 1), updated_at = now() where player_id = e.owner_id;
        v_out := v_out || jsonb_build_object('t', 'reroll', 'v', v_n);
      when 'wins' then
        insert into public.enchant_buffs (player_id, kind, enchant_id, mult, uses, data, expires_at)
        values (e.owner_id, 'golden_hour', e.id, v_m, (x ->> 'u')::int, jsonb_build_object('by', 'deck', 'card', p_card), now() + interval '24 hours');
        v_out := v_out || jsonb_build_object('t', 'wins', 'm', v_m, 'u', (x ->> 'u')::int);
      when 'glow' then
        insert into public.enchant_buffs (player_id, kind, enchant_id, mult, data, expires_at)
        values (e.owner_id, 'glow', e.id, v_m, jsonb_build_object('by', 'deck', 'card', p_card, 'name', c ->> 'name'), now() + make_interval(hours => (x ->> 'h')::int));
        v_out := v_out || jsonb_build_object('t', 'glow', 'm', v_m, 'h', (x ->> 'h')::int);
      when 'lev' then
        insert into public.enchant_buffs (player_id, kind, enchant_id, mult, data, expires_at)
        values (e.owner_id, 'fate_tower', e.id, v_m, jsonb_build_object('card', p_card), now() + make_interval(hours => (x ->> 'h')::int));
        v_out := v_out || jsonb_build_object('t', 'lev', 'm', v_m, 'h', (x ->> 'h')::int);
      when 'ticket' then
        perform private.ench_ticket(e.owner_id, x ->> 'r', 'deck');
        v_out := v_out || jsonb_build_object('t', 'ticket', 'r', x ->> 'r');
      when 'cointicket' then
        v_ok := random() < (x ->> 'p')::numeric;
        if v_ok then perform private.ench_ticket(e.owner_id, x ->> 'r', 'deck');
        else v_pay := private.ench_pay(e.id, (x ->> 'lo')::numeric, v_name); end if;
        v_out := v_out || jsonb_build_object('t', 'ticket', 'r', x ->> 'r', 'won', v_ok, 'pay', v_pay);
      when 'rebirth' then
        update public.enchantments set state = state || jsonb_build_object('rebirth', coalesce((state ->> 'rebirth')::int, 0) + (x ->> 'v')::int) where id = e.id;
        v_out := v_out || jsonb_build_object('t', 'rebirth', 'v', (x ->> 'v')::int);
      else null;
    end case;
  end loop;
  return v_out;
end $$;

create or replace function private.deck_apply(e public.enchantments, p_card text, p_up boolean, p_foil boolean) returns jsonb language sql as $$
  select private.deck_apply_x(e, p_card, p_up, p_foil, 1)
$$;

-- level 4: the table is a Past–Present–Future spread (all three turn; each upright card that comes true strengthens the next)
-- level 8: once a week, the Grand Spread (five cards at once, chained ×1 → ×2)
create or replace function private.deck_eval(e public.enchantments, t timestamptz) returns jsonb language plpgsql stable as $$
declare s jsonb := e.state; v_day text := private.today()::text; v_new boolean := coalesce(s ->> 'day', '') <> v_day;
  v_spread boolean := e.level >= 4; v_week text := to_char(now(), 'IYYY-IW'); v_chain int := case when v_new then 0 else coalesce((s ->> 'chain')::int, 0) end;
begin
  return jsonb_build_object('day', v_day, 'cards', 3 + case when e.stars >= 1 then 1 else 0 end,
    'picks', case when v_spread then 3 else 1 end, 'picked', case when v_new then 0 else coalesce((s ->> 'picked')::int, 0) end,
    'flipped', case when v_new then '[]'::jsonb else coalesce(s -> 'flipped', '[]'::jsonb) end,
    'spread', v_spread, 'chain', v_chain, 'chain_mult', case when v_spread then 1 + 0.25 * least(v_chain, 2) else 1 end,
    'grand_ready', e.level >= 8 and coalesce(s ->> 'grand_week', '') <> v_week,
    'pending', case when jsonb_typeof(s -> 'pending') = 'object' then s -> 'pending' end,
    'hand', case when jsonb_typeof(s -> 'hand') = 'object' then s -> 'hand' end,
    'right_ready', e.stars >= 3 and coalesce(s ->> 'right_day', '') <> v_day,
    'rebirth', coalesce((s ->> 'rebirth')::int, 0), 'hold_ready', e.stars >= 2);
end $$;

-- a card into the collection (all 22: the Arcana is complete — an Epic+ ticket, and Fate-Weaver)
create or replace function private.deck_collect(e public.enchantments, p_card text, p_foil boolean) returns boolean language plpgsql as $$
declare v_cards jsonb; v_all boolean; v_new boolean;
begin
  select coalesce(stats -> 'cards', '{}'::jsonb) into v_cards from public.enchantments where id = e.id;
  v_new := coalesce((v_cards ->> p_card)::int, 0) = 0;
  v_cards := v_cards || jsonb_build_object(p_card, coalesce((v_cards ->> p_card)::int, 0) + 1);
  update public.enchantments set stats = stats || jsonb_build_object('cards', v_cards, 'draws', coalesce((stats ->> 'draws')::int, 0) + 1,
                                                                      'foils', coalesce((stats ->> 'foils')::int, 0) + case when p_foil then 1 else 0 end) where id = e.id;
  select count(*) = 22 into v_all from jsonb_object_keys(v_cards);
  if v_all and not coalesce((select (stats ->> 'complete')::boolean from public.enchantments where id = e.id), false) then
    perform private.ench_ticket(e.owner_id, 'epic', 'deck_complete');
    update public.enchantments set stats = stats || '{"complete": true}'::jsonb where id = e.id;
  end if;
  return v_new;
end $$;

create or replace function private.ench_act_deck(e public.enchantments, p_action text, a jsonb, t timestamptz) returns jsonb language plpgsql as $$
declare s jsonb := e.state; g jsonb := private.deck_eval(e, t); r jsonb; v_card text; v_up boolean; v_foil boolean; v_i int; v_eff jsonb; v_pend jsonb;
  v_left int; p public.world_plots; v_new boolean; v_mult numeric; v_chain int; v_cards jsonb := '[]'::jsonb; i int; v_pos text[] := array['Past', 'Present', 'Future'];
begin
  if coalesce(s ->> 'day', '') <> (g ->> 'day') then
    s := s || jsonb_build_object('day', g ->> 'day', 'picked', 0, 'flipped', '[]'::jsonb, 'chain', 0);
  end if;
  v_chain := coalesce((s ->> 'chain')::int, 0);
  case p_action
    when 'flip' then
      if jsonb_typeof(s -> 'pending') = 'object' then raise exception 'card_waiting' using errcode = 'P0001'; end if;
      v_i := (a ->> 'i')::int;
      if v_i is null or v_i < 0 or v_i >= (g ->> 'cards')::int then raise exception 'invalid_action' using errcode = 'P0001'; end if;
      if exists (select 1 from jsonb_array_elements(coalesce(s -> 'flipped', '[]'::jsonb)) f where (f ->> 'i')::int = v_i) then raise exception 'already_flipped' using errcode = 'P0001'; end if;
      v_left := (g ->> 'picks')::int - coalesce((s ->> 'picked')::int, 0);
      if v_left < 1 then raise exception 'already_today' using errcode = 'P0001'; end if;
      v_card := private.deck_pick(); v_up := random() >= private.ench_n('deck', 'reversed', 0.3); v_foil := random() < private.ench_n('deck', 'foil', 0.08);
      v_pend := jsonb_build_object('i', v_i, 'card', v_card, 'up', v_up, 'foil', v_foil,
                                   'pos', case when (g ->> 'spread')::boolean then v_pos[least(coalesce((s ->> 'picked')::int, 0) + 1, 3)] end);
      s := s || jsonb_build_object('pending', v_pend, 'picked', coalesce((s ->> 'picked')::int, 0) + 1,
                                   'flipped', coalesce(s -> 'flipped', '[]'::jsonb) || jsonb_build_array(v_pend));
      v_new := private.deck_collect(e, v_card, v_foil);
      perform private.ench_xp(e.id, 1);
      r := jsonb_build_object('card', private.deck_card(v_card), 'up', v_up, 'foil', v_foil, 'i', v_i, 'pos', v_pend -> 'pos',
                              'chain_mult', case when (g ->> 'spread')::boolean and v_up then 1 + 0.25 * least(v_chain, 2) else 1 end,
                              'complete', coalesce((select (stats ->> 'complete')::boolean from public.enchantments where id = e.id), false) and not coalesce((e.stats ->> 'complete')::boolean, false),
                              'new', v_new);
    when 'accept' then
      -- what the turned card does: now, held for later (★2), or turned upright first (★3, once a day)
      v_pend := s -> 'pending';
      if jsonb_typeof(v_pend) <> 'object' then raise exception 'no_card' using errcode = 'P0001'; end if;
      if coalesce((a ->> 'upright')::boolean, false) and not (v_pend ->> 'up')::boolean then
        if not (g ->> 'right_ready')::boolean then raise exception 'stars_locked' using errcode = 'P0001', detail = '3'; end if;
        v_pend := v_pend || '{"up": true, "righted": true}'::jsonb;
        s := s || jsonb_build_object('right_day', g ->> 'day');
      end if;
      if coalesce((a ->> 'hold')::boolean, false) then
        if e.stars < 2 then raise exception 'stars_locked' using errcode = 'P0001', detail = '2'; end if;
        if jsonb_typeof(s -> 'hand') = 'object' then raise exception 'hand_full' using errcode = 'P0001'; end if;
        s := s || jsonb_build_object('pending', null, 'hand', v_pend);
        r := jsonb_build_object('held', v_pend);
      else
        -- in a spread, each upright card that came true strengthens the next; a reversed one breaks the chain
        v_mult := case when (g ->> 'spread')::boolean and (v_pend ->> 'up')::boolean then 1 + 0.25 * least(v_chain, 2) else 1 end;
        update public.enchantments set state = s where id = e.id;
        v_eff := private.deck_apply_x(e, v_pend ->> 'card', (v_pend ->> 'up')::boolean, (v_pend ->> 'foil')::boolean, v_mult);
        s := (select state from public.enchantments where id = e.id) || jsonb_build_object('pending', null,
               'chain', case when (v_pend ->> 'up')::boolean then v_chain + 1 else 0 end);
        perform private.ench_event(e.id, 'fate', jsonb_build_object('card', v_pend ->> 'card', 'up', (v_pend ->> 'up')::boolean, 'foil', (v_pend ->> 'foil')::boolean, 'effects', v_eff, 'mult', v_mult, 'pos', v_pend -> 'pos'));
        r := jsonb_build_object('card', private.deck_card(v_pend ->> 'card'), 'up', (v_pend ->> 'up')::boolean, 'foil', (v_pend ->> 'foil')::boolean, 'effects', v_eff,
                                'mult', v_mult, 'pos', v_pend -> 'pos', 'chain', case when (v_pend ->> 'up')::boolean then v_chain + 1 else 0 end,
                                'righted', coalesce((v_pend ->> 'righted')::boolean, false), 'text', private.deck_fx_text(v_eff),
                                'pay', (select x -> 'pay' from jsonb_array_elements(v_eff) x where x ? 'pay' and x -> 'pay' is not null and x -> 'pay' <> 'null'::jsonb limit 1));
      end if;
    when 'play' then
      -- the held card
      v_pend := s -> 'hand';
      if jsonb_typeof(v_pend) <> 'object' then raise exception 'no_card' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('hand', null);
      update public.enchantments set state = s where id = e.id;
      v_eff := private.deck_apply(e, v_pend ->> 'card', (v_pend ->> 'up')::boolean, (v_pend ->> 'foil')::boolean);
      s := (select state from public.enchantments where id = e.id);
      perform private.ench_event(e.id, 'fate', jsonb_build_object('card', v_pend ->> 'card', 'up', (v_pend ->> 'up')::boolean, 'held', true, 'effects', v_eff));
      r := jsonb_build_object('card', private.deck_card(v_pend ->> 'card'), 'up', (v_pend ->> 'up')::boolean, 'foil', (v_pend ->> 'foil')::boolean, 'effects', v_eff,
                              'text', private.deck_fx_text(v_eff), 'pay', (select x -> 'pay' from jsonb_array_elements(v_eff) x where x -> 'pay' is not null and x -> 'pay' <> 'null'::jsonb limit 1));
    when 'grand' then
      -- level 8, once a week: the Grand Spread — five cards turn at once, chained ×1 → ×2 (a reversed card breaks the chain)
      if not (g ->> 'grand_ready')::boolean then
        if e.level < 8 then raise exception 'grand_locked' using errcode = 'P0001'; end if;
        raise exception 'already_week' using errcode = 'P0001';
      end if;
      s := s || jsonb_build_object('grand_week', to_char(now(), 'IYYY-IW'));
      update public.enchantments set state = s where id = e.id;
      v_chain := 0;
      for i in 1 .. 5 loop
        v_card := private.deck_pick(); v_up := random() >= private.ench_n('deck', 'reversed', 0.3); v_foil := random() < private.ench_n('deck', 'foil', 0.08);
        v_mult := case when v_up then 1 + 0.25 * v_chain else 1 end;
        v_new := private.deck_collect(e, v_card, v_foil);
        v_eff := private.deck_apply_x(e, v_card, v_up, v_foil, v_mult);
        v_cards := v_cards || jsonb_build_object('card', private.deck_card(v_card), 'up', v_up, 'foil', v_foil, 'mult', v_mult, 'effects', v_eff, 'text', private.deck_fx_text(v_eff), 'new', v_new);
        v_chain := case when v_up then v_chain + 1 else 0 end;
      end loop;
      s := (select state from public.enchantments where id = e.id);
      perform private.ench_xp(e.id, 3);
      perform private.ench_event(e.id, 'grand_spread', jsonb_build_object('cards', (select jsonb_agg(c -> 'card' ->> 'name') from jsonb_array_elements(v_cards) c)));
      r := jsonb_build_object('grand', v_cards);
    when 'rebirth' then
      -- Rebirth: one of your plots becomes another kind (its minigame changes)
      if coalesce((s ->> 'rebirth')::int, 0) < 1 then raise exception 'no_card' using errcode = 'P0001'; end if;
      select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int;
      if p.owner_id is distinct from e.owner_id or p.locked or p.rarity like 'crown%' then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
      if (a ->> 'type') is null or not exists (select 1 from public.plot_types where id = a ->> 'type' and weight > 0) or a ->> 'type' = p.plot_type then raise exception 'bad_type' using errcode = 'P0001'; end if;
      update public.world_plots set plot_type = a ->> 'type', updated_at = now() where gx = p.gx and gy = p.gy;
      insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p.gx, p.gy, p.gx, p.gy);
      s := s || jsonb_build_object('rebirth', (s ->> 'rebirth')::int - 1);
      perform private.ench_event(e.id, 'reborn', jsonb_build_object('gx', p.gx, 'gy', p.gy, 'from', p.plot_type, 'to', a ->> 'type'));
      r := jsonb_build_object('reborn', jsonb_build_object('gx', p.gx, 'gy', p.gy, 'from', p.plot_type, 'to', a ->> 'type'));
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $$;

-- ---- ✍️ Glyphcaster: every page has a hint; the Vortex pulls your chests in; Thunder strikes the Leviathan -----------------
create or replace function private.glyph_book() returns jsonb language sql immutable as $$
  select '[
    {"id": "spiral", "name": "Vortex", "cost": 1, "fx": [{"t": "pull", "m": 300}], "text": "Pulls in your buried chests within 300 m of you or your plots (25 Ink if there are none).", "start": true, "hint": "Round and round, inward."},
    {"id": "star", "name": "Wish", "cost": 1, "fx": [{"t": "luck", "v": 5}], "text": "+5 Luck.", "start": true, "hint": "Five points, one line."},
    {"id": "triangle", "name": "Ward", "cost": 2, "a": "plot", "fx": [{"t": "ward", "h": 3}], "text": "Shields a plot of yours from Parasites, pranks and tramples for 3 hours.", "start": true, "hint": "Three sides, closed."},
    {"id": "bolt", "name": "Thunder", "cost": 2, "fx": [{"t": "bolt", "m": 2, "min": 15}], "text": "Strikes the Leviathan if it’s out — and your hits on it do ×2 for 15 minutes (×3 drawn perfectly).", "hint": "Down, back, down — fast."},
    {"id": "leaf", "name": "Growth", "cost": 1, "a": "plot", "fx": [{"t": "leaf", "m": 1.3}], "text": "A plot’s next minigame win pays +30%.", "hint": "A stem and two halves."},
    {"id": "key", "name": "Unlock", "cost": 2, "a": "enchant", "fx": [{"t": "key", "s": 3600}], "text": "Cuts an hour off one of your enchantments’ waits.", "hint": "A ring, a shaft, a tooth."},
    {"id": "wave", "name": "Cleanse", "cost": 2, "fx": [{"t": "cleanse"}], "text": "Washes away every curse on you.", "hint": "The sea, rising and falling."},
    {"id": "eye", "name": "Insight", "cost": 1, "a": "enchant", "fx": [{"t": "xp", "v": 3}], "text": "Teaches one of your enchantments: +3 XP.", "hint": "An almond, and what’s inside."},
    {"id": "circle", "name": "Seal", "cost": 2, "fx": [{"t": "glow", "m": 1.2, "h": 2}], "text": "Your enchantments pay +20% for 2 hours.", "hint": "No corners at all."},
    {"id": "cross", "name": "Mend", "cost": 1, "fx": [{"t": "ink", "v": 15}, {"t": "luck", "v": 2}], "text": "15 Ink and 2 Luck.", "hint": "Two lines that meet."},
    {"id": "heart", "name": "Kindle", "cost": 2, "fx": [{"t": "wins", "m": 1.5, "u": 2}], "text": "Your next 2 minigame wins pay ×1.5.", "hint": "Two curves meet at a point."},
    {"id": "moon", "name": "Dream", "cost": 2, "fx": [{"t": "eluck", "v": 1}], "text": "+1 Enchanted Luck.", "hint": "A sliver of night."},
    {"id": "sun", "name": "Radiance", "cost": 3, "fx": [{"t": "glow", "m": 1.3, "h": 4}], "text": "Your enchantments pay +30% for 4 hours.", "hint": "A ring with rays."},
    {"id": "crown", "name": "Regal", "cost": 3, "fx": [{"t": "ink", "v": 90}], "text": "90 Ink.", "hint": "Three peaks on a band."},
    {"id": "arrow", "name": "Swift", "cost": 1, "a": "enchant", "fx": [{"t": "key", "s": 1800}], "text": "Cuts half an hour off one of your enchantments’ waits.", "hint": "A shaft with a point."},
    {"id": "hourglass", "name": "Linger", "cost": 2, "a": "plot", "fx": [{"t": "ward", "h": 8}], "text": "Shields a plot for 8 hours.", "hint": "Two triangles kiss."},
    {"id": "flame", "name": "Ignite", "cost": 2, "fx": [{"t": "wins", "m": 2, "u": 1}], "text": "Your next minigame win pays ×2.", "hint": "It flickers upward."},
    {"id": "anchor", "name": "Steady", "cost": 1, "fx": [{"t": "luck", "v": 8}], "text": "+8 Luck (drawn steady).", "hint": "It holds a ship."},
    {"id": "infinity", "name": "Endless", "cost": 3, "fx": [{"t": "wins", "m": 1.25, "u": 8}], "text": "Your next 8 minigame wins pay ×1.25.", "hint": "A loop that never ends."},
    {"id": "twin", "name": "Double Vortex", "cost": 2, "fx": [{"t": "pull", "m": 600}], "text": "Pulls in your buried chests within 600 m (60 Ink if there are none).", "hint": "Two spirals, joined."},
    {"id": "rune", "name": "Elder Rune", "cost": 4, "secret": true, "fx": [{"t": "ticket", "r": "rare"}], "text": "A Rare-or-better roll ticket.", "hint": "Secret · it shows itself to a Spellwright (20 found)."},
    {"id": "phoenix", "name": "Rebirth Sigil", "cost": 4, "secret": true, "fx": [{"t": "eluck", "v": 3}], "text": "+3 Enchanted Luck.", "hint": "Secret · born from ash, to a Spellwright."},
    {"id": "void", "name": "The Void", "cost": 3, "secret": true, "fx": [{"t": "glow", "m": 1.5, "h": 2}], "text": "Your enchantments pay +50% for 2 hours.", "hint": "Secret · nothing, drawn perfectly."},
    {"id": "omega", "name": "Omega", "cost": 5, "secret": true, "fx": [{"t": "ticket", "r": "epic"}], "text": "An Epic-or-better roll ticket.", "hint": "Secret · the last letter, last of all."}
  ]'::jsonb
$$;

-- ---- 🎭 Puppeteer: the plot's own level; the Grand Show is a three-plot medley; a Mirror Shard can pull strings too -------
create or replace function public.puppet_start(p_id uuid, p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); e public.enchantments; x public.enchantments; p public.world_plots; g jsonb; v_why text; v_game text; v_game_cfg jsonb;
  v_highest int; v_max int; v_rounds int; v_seed bigint; v_expires timestamptz; v_id uuid; v_cfg jsonb := private.cfg('minigames'); v_grand boolean := false;
  v_md jsonb; v_free boolean := false; v_patch jsonb := '{}'::jsonb; v_day text := private.today()::text;
begin
  perform private.rate_limit('minigame_start', 180, 3600);
  select * into e from public.enchantments where id = p_id for update;
  if e.id is null or e.owner_id is distinct from v_uid or e.status <> 'active' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  x := e;
  if e.kind = 'shard' then x := private.ench_reflected(e, private.ench_now(e)); end if;
  if x.id is null or x.kind <> 'puppeteer' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  g := private.pup_eval(x, private.ench_now(e));
  select * into p from public.world_plots where gx = p_gx and gy = p_gy;
  v_why := private.pup_why_not(x, p);
  if v_why is not null then raise exception '%', v_why using errcode = 'P0001'; end if;
  -- ★3 Grand Show: once a day a three-plot medley — three runs on three plots, each ×3, no strings used
  v_md := g -> 'medley';
  if v_md is not null and jsonb_typeof(v_md) = 'object' and not ((v_md -> 'plots') @> jsonb_build_array(jsonb_build_array(p_gx, p_gy))) then
    v_grand := true; v_free := true;
    v_patch := jsonb_build_object('medley', v_md || jsonb_build_object('left', (v_md ->> 'left')::int - 1, 'plots', coalesce(v_md -> 'plots', '[]'::jsonb) || jsonb_build_array(jsonb_build_array(p_gx, p_gy))));
  elsif (g ->> 'grand_ready')::boolean then
    v_grand := true; v_free := true;
    v_patch := jsonb_build_object('grand_day', v_day, 'medley', jsonb_build_object('day', v_day, 'left', 2, 'plots', jsonb_build_array(jsonb_build_array(p_gx, p_gy))));
  end if;
  if not v_free and (g ->> 'strings')::int < 1 then raise exception 'no_strings' using errcode = 'P0001'; end if;
  select minigame into v_game from public.plot_types where id = p.plot_type;
  v_game_cfg := coalesce(v_cfg -> 'games' -> v_game, '{}'::jsonb);
  if not coalesce((v_game_cfg ->> 'enabled')::boolean, false) then raise exception 'minigame_unavailable' using errcode = 'P0001'; end if;
  -- the level their plot is on (the owner's climb there); puppet runs never move it
  select coalesce(max(highest_level), 0) into v_highest from public.plot_game_progress where gx = p_gx and gy = p_gy and player_id = p.owner_id;
  v_max := greatest(1, least(coalesce((v_game_cfg ->> 'max_level')::int, (v_cfg ->> 'max_level')::int, 60), 500));
  v_highest := least(v_highest, v_max - 1);
  v_rounds := greatest(1, least(coalesce((v_game_cfg ->> 'rounds')::int, 5), 10));
  update public.minigame_sessions set status = 'abandoned', finished_at = now() where player_id = v_uid and game = v_game and status = 'active';
  v_seed := floor(random() * 2147483646)::bigint + 1;
  v_expires := now() + make_interval(mins => coalesce((v_cfg ->> 'session_minutes')::int, 20) + v_rounds * 2);
  insert into public.minigame_sessions (player_id, game, level, seed, gx, gy, expires_at, rounds, puppet_id)
  values (v_uid, v_game, v_highest + 1, v_seed, p_gx, p_gy, v_expires, v_rounds, e.id)
  returning id into v_id;
  if v_grand then
    insert into public.enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, uses, data, expires_at)
    values (v_uid, 'grand_show', p_gx, p_gy, e.id, 3, 1, jsonb_build_object('session', v_id, 'medley', true), v_expires + interval '5 minutes');
  end if;
  if not v_free then v_patch := v_patch || jsonb_build_object('strings', (g ->> 'strings')::int - 1, 'string_at', (g ->> 'string_at')::numeric); end if;
  if e.kind = 'shard' then
    update public.enchantments set state = jsonb_set(state, '{r}', coalesce(state -> 'r', '{}'::jsonb) || v_patch), updated_at = now() where id = e.id;
  else
    update public.enchantments set state = state || v_patch, updated_at = now() where id = e.id;
  end if;
  perform private.ench_event(e.id, 'strung', jsonb_build_object('gx', p_gx, 'gy', p_gy, 'game', v_game, 'owner', (select username from public.profiles where id = p.owner_id), 'grand', v_grand));
  return jsonb_build_object('session_id', v_id, 'game', v_game, 'level', v_highest + 1, 'seed', v_seed, 'rounds', v_rounds,
                            'plot_level', p.level, 'plot_highest_level', v_highest, 'max_level', v_max,
                            'started_at', now(), 'expires_at', v_expires, 'server_time', now(),
                            'puppet', jsonb_build_object('id', e.id, 'owner', private.profile_json(p.owner_id), 'rarity', p.rarity, 'name', p.name, 'grand', v_grand,
                                                         'medley_left', case when v_grand then coalesce((v_patch -> 'medley' ->> 'left')::int, 0) end));
end $$;

-- ---- 🔥 Crucible: past Mythic — an Ultra, then a Crown (very, very hard) ------------------------------------------------
-- the crown a plot could become: its city's, else its state's, else its country's (each only while nobody holds it)
create or replace function private.crown_free_at(p_gx int, p_gy int) returns text language plpgsql stable as $$
declare c jsonb := private.city_at(p_gx, p_gy);
begin
  if c is null then return null; end if;
  if not private.crown_held(c ->> 'id') then return 'crown'; end if;
  if c ->> 'state' is not null and not private.crown_state_held(c ->> 'country', c ->> 'state') then return 'crown_state'; end if;
  if c ->> 'country' is not null and not private.crown_country_held(c ->> 'country') then return 'crown_country'; end if;
  return null;
end $$;

-- the next step up: the normal ladder to Mythic, then "an Ultra", then "a Crown"
create or replace function private.cru_next(p_rarity text, p_steps integer) returns text language sql stable as $$
  select case
    when array_position(private.cru_ladder(), p_rarity) is not null then
      case when array_position(private.cru_ladder(), p_rarity) + p_steps <= 6 then (private.cru_ladder())[array_position(private.cru_ladder(), p_rarity) + p_steps] else 'ultra' end
    when exists (select 1 from public.plot_rarities r where r.id = p_rarity and r.ppm > 0) then 'crown'
  end
$$;
create or replace function private.cru_need(p_to text) returns numeric language sql stable as $$
  select case p_to when 'uncommon' then private.ench_n('crucible', 'need_uncommon', 10) when 'rare' then private.ench_n('crucible', 'need_rare', 25)
                   when 'epic' then private.ench_n('crucible', 'need_epic', 60) when 'legendary' then private.ench_n('crucible', 'need_legendary', 160)
                   when 'mythic' then private.ench_n('crucible', 'need_mythic', 500)
                   when 'ultra' then private.ench_n('crucible', 'need_ultra', 4000) when 'crown' then private.ench_n('crucible', 'need_crown', 30000) else 1e9 end
$$;
-- the chance a strike lands: rises with Heat (a little at a time), capped — far lower caps past Mythic
create or replace function private.cru_chance(p_heat numeric, p_to text, p_pump numeric, p_fury boolean) returns numeric language sql stable as $$
  with c as (select case p_to when 'ultra' then private.ench_n('crucible', 'cap_ultra', 0.25) when 'crown' then private.ench_n('crucible', 'cap_crown', 0.06)
                              else private.ench_n('crucible', 'cap', 0.85) end cap)
  select round(least(case when p_fury then (case when p_to in ('ultra', 'crown') then c.cap * 1.35 else 0.95 end) else c.cap end,
                     c.cap * (1 - exp(-greatest(0, p_heat) * (1 + 0.1 * least(1, greatest(0, coalesce(p_pump, 0)))) / private.cru_need(p_to)))
                     * case when p_fury then 1.35 else 1 end)::numeric, 4)
    from c
$$;
create or replace function private.cru_why_not_strike(p_uid uuid, p public.world_plots) returns text language plpgsql stable as $$
begin
  if p.owner_id is distinct from p_uid then return 'not_your_plot'; end if;
  if p.locked then return 'plot_locked'; end if;
  if p.folded_at is not null then return 'plot_folded'; end if;
  if p.rarity like 'crown%' then return 'top_tier'; end if;
  if p.rarity = 'enchanted' or private.cru_next(p.rarity, 1) is null then return 'cannot_forge'; end if;
  if private.cru_next(p.rarity, 1) = 'crown' and private.crown_free_at(p.gx, p.gy) is null then return 'crowns_taken'; end if;
  return null;
end $$;

-- ---- 🔭 Spyglass: a reading can show an Ultra — and, very rarely, a Crown (while the cell's crown is free) -------------
create or replace function private.spy_rank(p_rarity text) returns numeric language sql stable as $$
  select case when p_rarity = 'enchanted' then 4.5 when p_rarity like 'crown%' then 5000
              else coalesce((select case when ppm > 0 then 7 + 1000.0 / greatest(ppm, 1) else sort end from public.plot_rarities where id = p_rarity), 0) end
$$;
CREATE OR REPLACE FUNCTION private.ench_pay(p_id uuid, p_base numeric, p_what text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare e public.enchantments; p jsonb; v numeric := greatest(coalesce(p_base, 0), 0); v_mods jsonb := '[]'::jsonb; v_paid int := 0; v_extra int := 0;
  k int; b record; v_echo boolean := false; v_gift int; v_to uuid; v_x numeric; v_spread numeric := 0; v_xp int := 1; v_ab text; v_lk jsonb;
  v_cell int[]; v_chests int := 0; v_open int; v_cap int := coalesce((private.ench_cfg() ->> 'seek_chest_cap')::int, 25);
  v_chest_ink int := coalesce((private.ench_cfg() ->> 'seek_chest_ink')::int, 50); v_gene text; v_card text; v_fx jsonb;
begin
  select * into e from public.enchantments where id = p_id;
  if e.owner_id is null or v <= 0 then return jsonb_build_object('paid', 0, 'base', 0, 'mods', '[]'::jsonb, 'chests', 0); end if;
  if e.level > 1 then
    v := v * (1 + coalesce((private.ench_cfg() ->> 'level_bonus')::numeric, 0.06) * (e.level - 1));
    v_mods := v_mods || jsonb_build_object('label', 'Level ' || e.level, 'emoji', '⭐');
  end if;
  if coalesce(e.stars, 0) > 0 then
    v := v * (1 + 0.1 * e.stars);
    v_mods := v_mods || jsonb_build_object('label', repeat('★', e.stars) || ' +' || (10 * e.stars) || '%', 'emoji', '🌟');
  end if;
  for p in select * from jsonb_array_elements(private.ench_partners(p_id)) loop
    k := least(greatest(coalesce((p ->> 'strength')::int, 1), 1), 3);
    v_gene := p ->> 'gene';
    -- 🧫 Patchwork: this reward borrows a Trait from one of the Homunculus's parts
    if v_gene = 'patchwork' then
      v_gene := private.homu_borrow((p ->> 'id')::uuid);
      v_mods := v_mods || jsonb_build_object('label', 'Patchwork borrowed ' || coalesce(
        (select private.ench_info(kk) ->> 'gene_name' from unnest(private.ench_kinds()) kk where private.ench_info(kk) ->> 'gene' = v_gene limit 1), 'a stitch'), 'emoji', '🧫');
    end if;
    case v_gene
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
      when 'endless' then v := v * (1 + 0.1 * k); v_mods := v_mods || jsonb_build_object('label', 'Endless +' || (10 * k) || '%', 'emoji', '🐍');
      when 'charged' then v := v * (1 + 0.25 * k); v_mods := v_mods || jsonb_build_object('label', 'Charged +' || (25 * k) || '%', 'emoji', '⚡');
      -- (Farsight, Folded, Strings and Inscribed work on the map, on its clock, on its chores and through its rune — not on Ink)
      when 'farsight' then null;
      when 'folded' then null;
      when 'strings' then null;
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
      when 'inscribed' then null;
      -- (Tempo shows its worth on clocks; borrowed by Patchwork it pays a little)
      when 'tempo' then
        if (p ->> 'gene') = 'patchwork' then v := v * 1.15; v_mods := v_mods || jsonb_build_object('label', 'Tempo +15%', 'emoji', '⚙️'); end if;
      -- Wishing keeps a charge where there are charges; anywhere else it pays
      when 'wish' then
        if e.kind not in ('genie', 'sizeray', 'oracle') then
          v := v * (1 + 0.25 * k); v_mods := v_mods || jsonb_build_object('label', 'Wishing +' || (25 * k) || '%', 'emoji', '🧞');
        end if;
      -- Trickster dodges bad luck where there is bad luck; anywhere else it pays
      -- (Tempered dodges bad luck where there is bad luck, and tempers its plot — never Ink)
      when 'trick' then null;
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
  -- a grown reward (Size Ray) or an overcharge (a Storm Coil's bolt) is used up here
  for b in delete from public.enchant_buffs where id = (select id from public.enchant_buffs where enchant_id = p_id and kind = 'next_reward' and expires_at > now() order by id limit 1) returning mult, data loop
    v := v * b.mult;
    v_mods := v_mods || case when b.data ->> 'by' = 'storm' then jsonb_build_object('label', 'Overcharged ×' || round(b.mult, 2), 'emoji', '⚡')
                             else jsonb_build_object('label', 'Size-rayed ×' || round(b.mult, 2), 'emoji', '📡') end;
  end loop;
  -- ✨ a glow (a card, a glyph): your enchantments pay more for a while
  select exp(sum(ln(greatest(mult, 0.01)))) into v_x from public.enchant_buffs where player_id = e.owner_id and kind = 'glow' and expires_at > now();
  if v_x is not null and v_x <> 1 then v := v * v_x; v_mods := v_mods || jsonb_build_object('label', 'Glow ×' || round(v_x, 2), 'emoji', '✨'); end if;
  -- ⚒️ a full set of the Crucible's artifacts
  if private.cru_set(e.owner_id) then v := v * 1.05; v_mods := v_mods || jsonb_build_object('label', 'Smith’s Set +5%', 'emoji', '⚒️'); end if;
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
end $function$;

CREATE OR REPLACE FUNCTION private.ench_dodge(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare k int;
begin
  k := private.ench_has_gene(p_id, 'trick');
  if k > 0 and random() < (array[0.5, 0.75, 0.9])[k] then perform private.ench_stat(p_id, 'dodged'); return true; end if;
  k := private.ench_has_gene(p_id, 'foresight');
  if k > 0 and random() < (array[0.35, 0.6, 0.8])[k] then return true; end if;
  return false;
end $function$;

CREATE OR REPLACE FUNCTION private.ench_settle(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare e public.enchantments; s record; v_c uuid;
begin
  for v_c in select distinct (sp.data ->> 'coil_by')::uuid from public.enchant_splices sp where (sp.a = p_id or sp.b = p_id) and sp.data ? 'coil_by' and not sp.folded loop
    perform private.ouro_settle(v_c);
  end loop;
  select * into e from public.enchantments where id = p_id;
  if e.kind = 'ouroboros' then perform private.ouro_settle(p_id); end if;
  if e.kind = 'stormcoil' then perform private.storm_settle(p_id); end if;
  perform private.endless_renew(p_id);
  select * into e from public.enchantments where id = p_id;
  if e.frozen_at is not null and now() >= e.frozen_until then
    update public.enchantments set clock_skip = clock_skip - extract(epoch from frozen_until - frozen_at), frozen_at = null, frozen_until = null where id = p_id;
  end if;
  for s in select sp.*, ea.kind ka, eb.kind kb from public.enchant_splices sp join public.enchantments ea on ea.id = sp.a left join public.enchantments eb on eb.id = sp.b
            where not sp.folded and sp.ends_at <= now() and (sp.a = p_id or sp.b = p_id) for update of sp loop
    -- the Tempo a finished splice gave, kept for good
    if s.kb = 'clockwork' then
      update public.enchantments set clock_skip = clock_skip + (private.splice_strength(s.mode, s.data, s.ka, s.kb) + 1) * extract(epoch from s.ends_at - s.started_at) where id = s.a;
    end if;
    if s.ka = 'clockwork' and s.b is not null and s.mode <> 'graft' then
      update public.enchantments set clock_skip = clock_skip + (private.splice_strength(s.mode, s.data, s.kb, s.ka) + 1) * extract(epoch from s.ends_at - s.started_at) where id = s.b;
    end if;
    update public.enchant_splices set folded = true where id = s.id;
  end loop;
  -- 🦢 Folded
  -- (Strings and Farsight do their daily work on the heartbeat: private.wonders_tick)
end $function$;

CREATE OR REPLACE FUNCTION public.enchant_act(p_id uuid, p_action text, p_args jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := private.require_active_player(); e public.enchantments; t timestamptz; x public.enchantments; v jsonb; a jsonb := coalesce(p_args, '{}'::jsonb); sp record;
  v_kind text; v_spark uuid;
begin
  perform private.rate_limit('enchant_act', 1500, 3600);
  select * into e from public.enchantments where id = p_id for update;
  if e.id is null or e.owner_id is distinct from v_uid or e.status <> 'active' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform private.ench_settle(e.id);
  select * into e from public.enchantments where id = p_id;
  t := private.ench_now(e);
  if p_action = 'rename' then
    update public.enchantments set nickname = nullif(left(trim(coalesce(a ->> 'name', '')), 24), ''), updated_at = now() where id = e.id;
    perform private.ench_event(e.id, 'named', jsonb_build_object('name', nullif(left(trim(coalesce(a ->> 'name', '')), 24), '')));
    return private.ench_view(e.id);
  end if;
  -- any enchantment can step out of a splice early (yours, or one a friend spliced you into)
  if p_action = 'separate' then
    for sp in select * from public.enchant_splices zs where (zs.a = e.id or zs.b = e.id) and zs.ends_at > now() loop
      update public.enchant_splices zs set ends_at = now() where zs.grp is not distinct from sp.grp and (sp.grp is not null or zs.id = sp.id) and zs.ends_at > now();
      if sp.mode = 'graft' then update public.enchantments set frozen_until = least(frozen_until, now()) where id = sp.b and frozen_until > now(); end if;
    end loop;
    if not found then raise exception 'no_splice' using errcode = 'P0001'; end if;
    perform private.ench_settle(e.id);
    return private.ench_view(e.id) || jsonb_build_object('result', jsonb_build_object('separated', true), 'balances', private.balances(v_uid));
  end if;
  -- a Trait it wears: fold its wait (Folded), trace its rune (Inscribed)
  if p_action in ('trait_fold', 'trait_rune') then
    v := private.trait_act(e, p_action, a);
    return private.ench_view(e.id) || jsonb_build_object('result', v, 'balances', private.balances(v_uid));
  end if;
  x := private.ench_reflected(e, t);
  if x.id is not null and p_action not in ('gaze', 'step', 'release') then
    v_kind := x.kind;
    v := case x.kind
      when 'goose' then private.ench_act_goose(x, p_action, a, t) when 'genie' then private.ench_act_genie(x, p_action, a, t) when 'map' then private.ench_act_map(x, p_action, a, t)
      when 'parasite' then private.ench_act_parasite(x, p_action, a, t) when 'spyglass' then private.ench_act_spyglass(x, p_action, a, t) when 'deck' then private.ench_act_deck(x, p_action, a, t) when 'glyph' then private.ench_act_glyph(x, p_action, a, t) when 'pandora' then private.ench_act_pandora(x, p_action, a, t)
      when 'clockwork' then private.ench_act_clockwork(x, p_action, a, t) when 'sizeray' then private.ench_act_sizeray(x, p_action, a, t) end;
    if v is null then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    update public.enchantments set state = state || jsonb_build_object('r', v -> 'state'), updated_at = now() where id = e.id;
  else
    v_kind := e.kind;
    v := case e.kind
      when 'goose' then private.ench_act_goose(e, p_action, a, t) when 'genie' then private.ench_act_genie(e, p_action, a, t) when 'map' then private.ench_act_map(e, p_action, a, t)
      when 'parasite' then private.ench_act_parasite(e, p_action, a, t) when 'cuckoo' then private.ench_act_egg(e, p_action, a, t) when 'pandora' then private.ench_act_pandora(e, p_action, a, t)
      when 'splice' then private.ench_act_splice(e, p_action, a, t) when 'clockwork' then private.ench_act_clockwork(e, p_action, a, t)
      when 'sizeray' then private.ench_act_sizeray(e, p_action, a, t) when 'shard' then private.ench_act_shard(e, p_action, a, t)
      when 'wormhole' then private.ench_act_wormhole(e, p_action, a, t) when 'oracle' then private.ench_act_oracle(e, p_action, a, t)
      when 'ouroboros' then private.ench_act_ouroboros(e, p_action, a, t) when 'homunculus' then private.ench_act_homunculus(e, p_action, a, t)
      when 'stormcoil' then private.ench_act_stormcoil(e, p_action, a, t)
      when 'spyglass' then private.ench_act_spyglass(e, p_action, a, t) when 'origami' then private.ench_act_origami(e, p_action, a, t)
      when 'crucible' then private.ench_act_crucible(e, p_action, a, t)
      when 'puppeteer' then private.ench_act_puppeteer(e, p_action, a, t) when 'deck' then private.ench_act_deck(e, p_action, a, t)
      when 'glyph' then private.ench_act_glyph(e, p_action, a, t) end;
    -- (an act can rewrite other rows of this enchantment's state — the Oracle fixes a goose's eggs — so only keys the act returns are replaced)
    update public.enchantments set state = v -> 'state', updated_at = now() where id = e.id;
  end if;
  -- 🪿 a golden egg sometimes carries a spark for your Splice (a Platinum egg always does)
  if v_kind = 'goose' and p_action = 'collect' and v -> 'result' ? 'egg' then
    if coalesce((v -> 'result' -> 'egg' ->> 'platinum')::boolean, false) or random() < private.ench_n('splice', 'goose_spark', 0.2) then
      v_spark := private.splice_spark(v_uid, 'goose');
      if v_spark is not null then v := jsonb_set(v, '{result,spark}', 'true'::jsonb); end if;
    end if;
  end if;
  select * into e from public.enchantments where id = p_id;
  if private.ench_titles(e) <> e.titles then
    perform private.ench_event(e.id, 'title', jsonb_build_object('titles', to_jsonb(array(select unnest(private.ench_titles(e)) except select unnest(e.titles)))));
    update public.enchantments set titles = private.ench_titles(e) where id = e.id;
  end if;
  return private.ench_view(e.id) || jsonb_build_object('result', v -> 'result', 'balances', private.balances(v_uid));
end $function$;

CREATE OR REPLACE FUNCTION private.ench_view(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
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
    'view', v_kind, 'traits', private.trait_view(e), 'reflected', v_refl, 'reflect_kind', x.kind, 'updated_at', e.updated_at, 'chests', v_chests,
    'attention', coalesce(v_refl ->> 'attention', v_kind ->> 'attention',
                          case when jsonb_array_length(v_chests) = 1 then 'A buried chest is waiting — dig it up'
                               when jsonb_array_length(v_chests) > 1 then jsonb_array_length(v_chests) || ' buried chests are waiting — dig them up' end),
    'server_time', now()) || private.ench_star_view(e);
end $function$;

CREATE OR REPLACE FUNCTION private.wonders_tick()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare r record;
begin
  for r in select id from public.enchantments where kind = 'ouroboros' and jsonb_typeof(state -> 'coil') = 'object' limit 2000 loop
    perform private.ouro_settle(r.id);
  end loop;
  for r in select id from public.enchantments where kind = 'stormcoil' and jsonb_typeof(state -> 'storm') = 'object' and not coalesce((state -> 'storm' ->> 'settled')::boolean, false)
             and (state -> 'storm' ->> 'until')::numeric + 3 < extract(epoch from now()) limit 500 loop
    perform private.storm_settle(r.id);
  end loop;
  for r in
    select x.id from public.enchantments x
     where x.status = 'active' and x.id in (
             select s.a from public.enchant_splices s join public.enchantments o on o.id = s.b
              where s.started_at <= now() and s.ends_at > now() and o.kind in ('puppeteer', 'spyglass')
             union
             select s.b from public.enchant_splices s join public.enchantments o on o.id = s.a
              where s.b is not null and s.mode <> 'graft' and s.started_at <= now() and s.ends_at > now() and o.kind in ('puppeteer', 'spyglass'))
       and (coalesce(x.stats ->> 'strings_day', '') <> private.today()::text or coalesce(x.stats ->> 'far_day', '') <> private.today()::text)
     limit 3000 loop
    perform private.trait_daily(r.id);
  end loop;
  perform private.endless_renew(null);
end $function$;

CREATE OR REPLACE FUNCTION private.ench_act_map(e enchantments, p_action text, a jsonb, t timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); r jsonb; v_hosts jsonb; v_p jsonb; v_i int; v_d double precision; v_cell int[]; v_pay jsonb;
  v_reach numeric := (case when e.stars >= 1 then 400 else private.ench_n('map', 'reach_m', 150) end) * private.ench_reach(e.id);
  v_dig numeric := (case when e.stars >= 1 then 250 else private.ench_n('map', 'dig_m', 90) end) * private.ench_reach(e.id); v_found int; v_tk uuid; v_tk2 uuid; v_ink numeric; k int;
  x public.enchantments; v jsonb;
begin
  case p_action
    when 'draw' then
      if jsonb_array_length(coalesce(s -> 'pieces', '[]'::jsonb)) > 0 then raise exception 'map_active' using errcode = 'P0001'; end if;
      if coalesce((s ->> 'next_at')::numeric, 0) > v_now then raise exception 'too_soon' using errcode = 'P0001'; end if;
      v_hosts := private.ench_hosts(e.owner_id, e.gx, e.gy, 4, private.ench_n('map', 'radius', 700)::int);
      v_p := '[]'::jsonb;
      for k in 0 .. 3 loop
        if k < jsonb_array_length(v_hosts) then
          v_p := v_p || jsonb_build_array((v_hosts -> k) || jsonb_build_object('wild', false));
        else
          -- not enough players nearby: buried in the wild
          v_cell := private.ench_free_cell(e.gx, e.gy, 80, 500);
          v_p := v_p || jsonb_build_array(jsonb_build_object('gx', v_cell[1], 'gy', v_cell[2], 'wild', true));
        end if;
      end loop;
      select jsonb_agg(pc || jsonb_build_object('m', round(private.ench_cell_m(e.gx, e.gy, (pc ->> 'gx')::int, (pc ->> 'gy')::int)),
                                               'bearing', private.ench_bearing(e.gx, e.gy, (pc ->> 'gx')::int, (pc ->> 'gy')::int), 'found_at', null))
        into v_p from jsonb_array_elements(v_p) pc;
      s := s || jsonb_build_object('pieces', v_p, 'x', null, 'dug', 0, 'drawn_at', v_now, 'redrawn', false);
      perform private.ench_event(e.id, 'map', jsonb_build_object('drawn', true));
      r := jsonb_build_object('drawn', true);
    when 'redraw' then
      if jsonb_array_length(coalesce(s -> 'pieces', '[]'::jsonb)) = 0 or coalesce((s ->> 'redrawn')::boolean, false)
         or exists (select 1 from jsonb_array_elements(s -> 'pieces') p where p ->> 'found_at' is not null) then raise exception 'cannot_redraw' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('pieces', '[]'::jsonb, 'next_at', 0);
      x := e; x.state := s;
      v := private.ench_act_map(x, 'draw', a, t);
      s := (v -> 'state') || jsonb_build_object('redrawn', true);
      r := v -> 'result';
    when 'collect' then
      v_i := (a ->> 'i')::int;
      v_p := s -> 'pieces' -> v_i;
      if v_p is null or v_p ->> 'found_at' is not null then raise exception 'not_found' using errcode = 'P0001'; end if;
      v_d := private.ench_dist_m(e.owner_id, (v_p ->> 'gx')::int, (v_p ->> 'gy')::int);
      if (v_d is null or v_d > v_reach) and private.ench_has_gene(e.id, 'linked') = 0 then raise exception 'too_far' using errcode = 'P0001', detail = coalesce(round(v_d)::text, ''); end if;
      s := jsonb_set(s, array['pieces', v_i::text, 'found_at'], to_jsonb(v_now));
      perform private.ench_stat(e.id, 'pieces');
      if not coalesce((v_p ->> 'wild')::boolean, false) and (v_p ->> 'owner') is not null then
        perform private.grant_ink_paced((v_p ->> 'owner')::uuid, 3, 'enchantment', 'treasure_tip', e.id::text, null);
        perform private.notify((v_p ->> 'owner')::uuid, 'enchant', e.owner_id, jsonb_build_object('sub', 'treasure_piece', 'kind', 'map', 'ink', 3, 'gx', v_p -> 'gx', 'gy', v_p -> 'gy'));
      end if;
      select count(*) into v_found from jsonb_array_elements(s -> 'pieces') p where p ->> 'found_at' is not null;
      if v_found = 4 then
        v_cell := private.ench_free_cell(e.gx, e.gy, 60, 300);
        s := s || jsonb_build_object('x', jsonb_build_object('gx', v_cell[1], 'gy', v_cell[2], 'm', round(private.ench_cell_m(e.gx, e.gy, v_cell[1], v_cell[2])),
                                                             'bearing', private.ench_bearing(e.gx, e.gy, v_cell[1], v_cell[2])));
      end if;
      perform private.ench_event(e.id, 'piece', jsonb_build_object('n', v_found));
      perform private.ench_xp(e.id, 1);
      r := jsonb_build_object('found', v_found, 'x', s -> 'x');
    when 'dig' then
      if s -> 'x' is null or jsonb_typeof(s -> 'x') <> 'object' then raise exception 'no_x' using errcode = 'P0001'; end if;
      v_d := private.ench_dist_m(e.owner_id, (s -> 'x' ->> 'gx')::int, (s -> 'x' ->> 'gy')::int);
      if v_d is null or v_d > v_dig then raise exception 'too_far' using errcode = 'P0001', detail = coalesce(round(v_d)::text, ''); end if;
      if extract(epoch from clock_timestamp()) - coalesce((s ->> 'last_dig')::numeric, 0) < 0.35 then raise exception 'too_fast' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('dug', coalesce((s ->> 'dug')::int, 0) + 1, 'last_dig', extract(epoch from clock_timestamp()));
      if (s ->> 'dug')::int < 5 then
        r := jsonb_build_object('dug', (s ->> 'dug')::int);
      else
        v_ink := 120 + floor(random() * 201);
        v_pay := private.ench_pay(e.id, v_ink, 'treasure chest');
        perform private.glyph_drop(e.owner_id, 'treasure', 0.25);
        if e.stars >= 3 or random() < private.ench_n('map', 'epic_ticket', 0.18) then v_tk := private.ench_ticket(e.owner_id, 'epic', 'treasure'); end if;
        if random() < private.ench_n('map', 'legendary_ticket', 0.05) * (case when e.stars >= 3 then 3 else 1 end) then v_tk2 := private.ench_ticket(e.owner_id, 'legendary', 'treasure'); end if;
        perform private.ench_stat(e.id, 'maps');
        perform private.ench_event(e.id, 'chest', jsonb_build_object('ink', v_pay -> 'paid', 'epic', v_tk is not null, 'legendary', v_tk2 is not null));
        if v_tk2 is not null then insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'treasure', 'kind', 'map', 'serial', e.serial, 'ticket', 'legendary')); end if;
        s := s || jsonb_build_object('pieces', '[]'::jsonb, 'x', null, 'dug', 0, 'next_at', v_now + private.ench_n('map', 'cooldown_h', 10) * 3600 * case when e.stars >= 2 then 0.5 else 1 end, 'maps', coalesce((s ->> 'maps')::int, 0) + 1);
        r := jsonb_build_object('dug', 5, 'chest', true, 'pay', v_pay, 'ticket', case when v_tk2 is not null then 'legendary' when v_tk is not null then 'epic' end);
      end if;
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $function$;

CREATE OR REPLACE FUNCTION private.ench_act_wormhole(e enchantments, p_action text, a jsonb, t timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); v_real numeric := extract(epoch from clock_timestamp()); r jsonb; v_el numeric; v_score numeric; v_hrs numeric;
  v_km numeric; v_km3 numeric; v_max numeric; v_d jsonb; v_k int; v_pay jsonb; v_lk jsonb; v_to uuid; v_open jsonb := s -> 'open';
begin
  case p_action
    when 'trace' then
      s := s || jsonb_build_object('trace_at', v_real);
      r := jsonb_build_object('tracing', true);
    when 'open' then
      if jsonb_typeof(v_open) = 'object' and (v_open ->> 'until')::numeric > v_real then raise exception 'already_open' using errcode = 'P0001'; end if;
      if coalesce((s ->> 'next_open_at')::numeric, 0) > v_real then raise exception 'too_soon' using errcode = 'P0001'; end if;
      if not exists (select 1 from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int and owner_id = e.owner_id)
         or ((a ->> 'gx')::int = e.gx and (a ->> 'gy')::int = e.gy) then raise exception 'bad_target' using errcode = 'P0001'; end if;
      v_km := private.ench_cell_m(e.gx, e.gy, (a ->> 'gx')::int, (a ->> 'gy')::int) / 1000;
      v_max := (case when e.level >= 5 then 40100 else private.ench_n('wormhole', 'reach_km', 160.9) end) * private.ench_reach(e.id);
      if v_km > v_max then raise exception 'too_far' using errcode = 'P0001', detail = round(v_max)::text; end if;
      if a ? 'gx3' then
        if e.level < 10 and e.stars < 3 then raise exception 'oracle_locked' using errcode = 'P0001', detail = '10'; end if;
        if not exists (select 1 from public.world_plots where gx = (a ->> 'gx3')::int and gy = (a ->> 'gy3')::int and owner_id = e.owner_id)
           or ((a ->> 'gx3')::int = e.gx and (a ->> 'gy3')::int = e.gy) or ((a ->> 'gx3')::int = (a ->> 'gx')::int and (a ->> 'gy3')::int = (a ->> 'gy')::int) then
          raise exception 'bad_target' using errcode = 'P0001'; end if;
        v_km3 := private.ench_cell_m(e.gx, e.gy, (a ->> 'gx3')::int, (a ->> 'gy3')::int) / 1000;
      end if;
      -- the spiral: the server times the trace (quicker is steadier), the hand's smoothness does the rest
      v_el := v_real - coalesce((s ->> 'trace_at')::numeric, 0);
      -- (a minute to finish it: careful hands get there too, they just open a less steady wormhole)
      if v_el > 60 or v_el < 0.3 then raise exception 'trace_first' using errcode = 'P0001'; end if;
      v_score := 0.5 * least(1, greatest(0, (6 - v_el) / 5)) + 0.5 * least(1, greatest(0, coalesce((a ->> 'smooth')::numeric, 0.5)));
      v_hrs := round(6 + 12 * v_score + case when e.stars >= 2 then 6 else 0 end, 1);
      v_open := jsonb_build_object('gx2', (a ->> 'gx')::int, 'gy2', (a ->> 'gy')::int, 'km', round(v_km, 1), 'from', v_real, 'from_c', v_now, 'until', v_real + v_hrs * 3600,
                                   'stability', round(v_score * 100), 'hours', v_hrs, 'caught', '[]'::jsonb);
      if a ? 'gx3' then v_open := v_open || jsonb_build_object('gx3', (a ->> 'gx3')::int, 'gy3', (a ->> 'gy3')::int, 'km3', round(v_km3, 1)); end if;
      s := s || jsonb_build_object('open', v_open, 'next_open_at', v_real + private.ench_n('wormhole', 'recharge_h', 24) * 3600 * case when e.stars >= 1 then 2.0 / 3 else 1 end, 'trace_at', null);
      perform private.ench_stat(e.id, 'opens');
      update public.enchantments set stats = stats || jsonb_build_object('far_km', greatest(coalesce((stats ->> 'far_km')::numeric, 0), round(greatest(v_km, coalesce(v_km3, 0))))) where id = e.id;
      perform private.ench_xp(e.id, 2);
      perform private.ench_event(e.id, 'opened', jsonb_build_object('km', round(v_km), 'hours', v_hrs, 'stability', round(v_score * 100)));
      insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', e.gx, e.gy, e.gx, e.gy);
      r := jsonb_build_object('open', v_open, 'hours', v_hrs, 'stability', round(v_score * 100));
    when 'close' then
      if jsonb_typeof(v_open) <> 'object' or (v_open ->> 'until')::numeric <= v_real then raise exception 'not_open' using errcode = 'P0001'; end if;
      s := jsonb_set(s, '{open,until}', to_jsonb(v_real));
      r := jsonb_build_object('closed', true);
    when 'catch' then
      if jsonb_typeof(v_open) <> 'object' or (v_open ->> 'until')::numeric <= v_real then raise exception 'not_open' using errcode = 'P0001'; end if;
      v_k := (a ->> 'k')::int;
      v_d := private.wormhole_drop(e.sigil, (v_open ->> 'from_c')::numeric, coalesce(v_k, 0));
      if v_k is null or v_k < 1 or v_now < (v_d ->> 'at')::numeric or v_now > (v_d ->> 'at')::numeric + 300 then raise exception 'nothing_there' using errcode = 'P0001'; end if;
      if coalesce(v_open -> 'caught', '[]'::jsonb) @> to_jsonb(v_k) then raise exception 'already_caught' using errcode = 'P0001'; end if;
      case v_d ->> 'type'
        when 'chest' then v_pay := private.ench_pay(e.id, (20 + round(private.ench_hash(e.sigil, v_k, 77) * 40)) * case when e.stars >= 3 then 2 else 1 end, 'a chest out of the wormhole');
        when 'star' then v_lk := private.ench_give_luck(e.owner_id, 5, 0);
        when 'fox' then v_pay := private.ench_pay(e.id, 15, 'chased a fox back through');
        else
          v_pay := private.ench_pay(e.id, 10, 'spores out of the wormhole');
          select id into v_to from public.players where id <> e.owner_id and status = 'active' and last_active_at > now() - interval '7 days' order by random() limit 1;
          if v_to is not null then
            perform private.grant_ink_paced(v_to, 5, 'enchantment', 'enchantment', e.id::text, null);
            perform private.notify(v_to, 'enchant', e.owner_id, jsonb_build_object('sub', 'spore', 'ink', 5, 'kind', 'wormhole'));
          end if;
      end case;
      s := jsonb_set(s, '{open,caught}', coalesce(v_open -> 'caught', '[]'::jsonb) || to_jsonb(v_k));
      perform private.ench_stat(e.id, 'catches');
      perform private.ench_event(e.id, 'caught', jsonb_build_object('type', v_d ->> 'type'));
      r := jsonb_build_object('caught', v_d ->> 'type', 'pay', v_pay, 'luck', case when v_lk is not null then 5 end);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $function$;

CREATE OR REPLACE FUNCTION private.pup_eval(e enchantments, t timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t);
  v_max int := 2 + case when e.level >= 5 then 1 else 0 end + case when e.level >= 10 then 1 else 0 end;
  v_per numeric := private.ench_n('puppeteer', 'recharge_m', 60) * 60 * case when e.stars >= 1 then 0.5 else 1 end;
  v_n int := coalesce((s ->> 'strings')::int, v_max); v_at numeric := coalesce((s ->> 'string_at')::numeric, v_now); v_gain int;
begin
  if v_n < v_max then
    v_gain := floor(greatest(0, v_now - v_at) / v_per)::int;
    if v_gain > 0 then v_n := least(v_max, v_n + v_gain); v_at := v_at + v_gain * v_per; end if;
  end if;
  if v_n >= v_max then v_n := least(v_n, v_max); v_at := v_now; end if;
  return jsonb_build_object('strings', v_n, 'max', v_max, 'string_at', v_at, 'recharge_s', round(v_per),
    'next_in', case when v_n < v_max then greatest(0, round(v_at + v_per - v_now)) end,
    'range_m', case when e.stars >= 2 then null else private.ench_n('puppeteer', 'range_m', 5000) * private.ench_reach(e.id) end,
    'grand_ready', e.stars >= 3 and coalesce(s ->> 'grand_day', '') <> private.today()::text,
    'medley', case when s -> 'medley' ->> 'day' = private.today()::text and coalesce((s -> 'medley' ->> 'left')::int, 0) > 0 then s -> 'medley' end);
end $function$;

CREATE OR REPLACE FUNCTION private.spy_eval(e enchantments, t timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); v_max int := 3 + case when e.stars >= 1 then 1 else 0 end;
  v_per numeric := private.ench_n('spyglass', 'recharge_h', 8) * 3600 * case when e.stars >= 1 then 0.75 else 1 end;
  v_n int := coalesce((s ->> 'looks')::int, v_max); v_at numeric := coalesce((s ->> 'look_at')::numeric, v_now); v_gain int;
begin
  if v_n < v_max then
    v_gain := floor(greatest(0, v_now - v_at) / v_per)::int;
    if v_gain > 0 then v_n := least(v_max, v_n + v_gain); v_at := v_at + v_gain * v_per; end if;
  end if;
  if v_n >= v_max then v_n := least(v_n, v_max); v_at := v_now; end if;
  return jsonb_build_object('looks', v_n, 'max', v_max, 'look_at', v_at, 'recharge_s', round(v_per),
    'next_in', case when v_n < v_max then greatest(0, round(v_at + v_per - v_now)) end,
    'range_m', private.ench_n('spyglass', 'range_m', 1000) * case when e.stars >= 2 then 3 else 1 end * private.ench_reach(e.id),
    'keep_h', private.ench_n('spyglass', 'keep_h', 24));
end $function$;

CREATE OR REPLACE FUNCTION private.ori_can_land(p_uid uuid, e enchantments, p_gx integer, p_gy integer)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
declare w public.world_plots; c record; v_reach int := coalesce((private.cfg('explorer') ->> 'claim_reach')::int, 1);
begin
  if p_gx is null or p_gy is null or p_gx not between 0 and 4194303 or p_gy not between 0 and 4194303 then return 'invalid_plot'; end if;
  select * into w from public.world_plots where gx = p_gx and gy = p_gy;
  if w.owner_id is not null or coalesce(w.locked, false) then return 'plot_taken'; end if;
  if exists (select 1 from public.enchantments where gx = p_gx and gy = p_gy and status <> 'gone') then return 'plot_taken'; end if;
  if not private.flag('location_gated_claims') then return null; end if;
  select * into c from private.explorer_now(p_uid);
  if not found or c.gx is null then return 'explorer_required'; end if;
  if private.cell_distance(c.gx, c.gy, p_gx, p_gy) <= v_reach * private.ench_reach(e.id) then return null; end if;
  if e.stars >= 2 and private.ench_cell_m(c.gx, c.gy, p_gx, p_gy) <= private.ench_n('origami', 'far_m', 50000) * private.ench_reach(e.id) then return null; end if;
  return 'out_of_reach';
end $function$;

CREATE OR REPLACE FUNCTION private.ench_act_stormcoil(e enchantments, p_action text, a jsonb, t timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare s jsonb := e.state; g jsonb := private.storm_eval(e); r jsonb; v_day text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD'); v_n int; st jsonb;
  v_targets jsonb; v_mine jsonb; v_stray jsonb; v_bolts jsonb := '[]'::jsonb; i int; v_t numeric; v_len numeric; v_kind text; tg jsonb; v_mi int := 0; v_i int; bolt jsonb;
  v_el numeric; v_out jsonb; v_ink numeric := 0; v_at numeric;
begin
  case p_action
    when 'crank' then
      v_n := least(greatest(coalesce((a ->> 'turns')::int, 0), 0), 10);
      if v_n < 1 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
      if (g ->> 'charge')::numeric >= 100 then raise exception 'charged' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('charge', least(100, (g ->> 'charge')::numeric + v_n * (g ->> 'per_turn')::numeric));
      perform private.ench_stat(e.id, 'cranks', v_n);
      r := jsonb_build_object('cranked', v_n, 'charge', s -> 'charge');
    when 'storm' then
      if (g ->> 'charge')::numeric < 100 then raise exception 'not_charged' using errcode = 'P0001'; end if;
      if (g ->> 'storms_left')::int < 1 then raise exception 'too_soon' using errcode = 'P0001'; end if;
      if g -> 'storm' is not null and jsonb_typeof(g -> 'storm') = 'object' then raise exception 'storm_active' using errcode = 'P0001'; end if;
      -- what the lightning goes for: your spliced enchantments, your plots near the coil, and (now and then) a neighbour's plot
      select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'gx', q.gx, 'gy', q.gy, 'kind', q.kind)), '[]'::jsonb) into v_targets from (
        select distinct m.id, m.gx, m.gy, m.kind from public.enchant_splices sp join public.enchantments m on m.id = sp.a or (m.id = sp.b and sp.mode <> 'graft')
         where m.owner_id = e.owner_id and m.status = 'active' and sp.ends_at > now() + interval '5 minutes' and not sp.folded limit 8) q;
      select coalesce(jsonb_agg(jsonb_build_array(q.gx, q.gy)), '[]'::jsonb) into v_mine from (
        select w.gx, w.gy from public.world_plots w where w.owner_id = e.owner_id order by abs(w.gx - e.gx) + abs(w.gy - e.gy) limit 30) q;
      if jsonb_array_length(v_mine) = 0 then v_mine := jsonb_build_array(jsonb_build_array(e.gx, e.gy)); end if;
      select coalesce(jsonb_agg(jsonb_build_object('gx', q.gx, 'gy', q.gy, 'owner', q.owner_id)), '[]'::jsonb) into v_stray from (
        select w.gx, w.gy, w.owner_id from public.world_plots w where w.owner_id is not null and w.owner_id <> e.owner_id
           and w.gx between e.gx - 80 * private.ench_reach(e.id)::int and e.gx + 80 * private.ench_reach(e.id)::int and w.gy between e.gy - 80 * private.ench_reach(e.id)::int and e.gy + 80 * private.ench_reach(e.id)::int order by random() limit 12) q;
      v_n := private.ench_n('stormcoil', 'bolts', 18)::int; v_len := private.ench_n('stormcoil', 'secs', 180);
      for i in 0 .. v_n - 1 loop
        v_t := round((6 + i * (v_len - 20) / v_n + random() * 4)::numeric, 2);
        v_kind := case when jsonb_array_length(v_targets) > 0 and (i % 3 = 1 or random() < 0.15) then 'mutate'
                       when jsonb_array_length(v_stray) > 0 and random() < 0.18 then 'stray' else 'ink' end;
        if v_kind = 'mutate' then
          tg := v_targets -> (v_mi % jsonb_array_length(v_targets)); v_mi := v_mi + 1;
          bolt := jsonb_build_object('i', i, 't', v_t, 'kind', 'mutate', 'gx', tg -> 'gx', 'gy', tg -> 'gy', 'target', tg -> 'id', 'tkind', tg -> 'kind');
        elsif v_kind = 'stray' then
          tg := v_stray -> floor(random() * jsonb_array_length(v_stray))::int;
          bolt := jsonb_build_object('i', i, 't', v_t, 'kind', 'stray', 'gx', tg -> 'gx', 'gy', tg -> 'gy', 'owner', tg -> 'owner');
        else
          tg := v_mine -> floor(random() * jsonb_array_length(v_mine))::int;
          bolt := jsonb_build_object('i', i, 't', v_t, 'kind', 'ink', 'gx', tg -> 0, 'gy', tg -> 1);
        end if;
        v_bolts := v_bolts || jsonb_build_array(bolt);
      end loop;
      v_at := extract(epoch from clock_timestamp());
      st := jsonb_build_object('n', coalesce((e.stats ->> 'storms')::int, 0) + 1, 'at', v_at, 'until', v_at + v_len, 'bolts', v_bolts, 'caught', '{}'::jsonb, 'ink', 0, 'mut', '[]'::jsonb);
      s := s || jsonb_build_object('charge', 0, 'storm', st, 'storm_day', v_day,
                                   'storms_today', case when s ->> 'storm_day' = v_day then coalesce((s ->> 'storms_today')::int, 0) else 0 end + 1);
      perform private.ench_stat(e.id, 'storms'); perform private.ench_xp(e.id, 2);
      perform private.ench_event(e.id, 'storm', jsonb_build_object('bolts', v_n, 'hybrids', jsonb_array_length(v_targets)));
      insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'storm', 'kind', 'stormcoil', 'hybrids', jsonb_array_length(v_targets)));
      r := jsonb_build_object('storm', st, 'server_now', extract(epoch from clock_timestamp()));
    when 'catch' then
      st := s -> 'storm';
      if jsonb_typeof(st) is distinct from 'object' or coalesce((st ->> 'settled')::boolean, false) then raise exception 'no_storm' using errcode = 'P0001'; end if;
      v_i := (a ->> 'i')::int; bolt := st -> 'bolts' -> v_i;
      if v_i is null or bolt is null then raise exception 'bad_target' using errcode = 'P0001'; end if;
      if coalesce(st -> 'caught', '{}'::jsonb) ? v_i::text then raise exception 'already_caught' using errcode = 'P0001'; end if;
      -- a bolt can be caught while it gathers (1.6 s before it lands) and just after it strikes
      v_el := extract(epoch from clock_timestamp()) - (st ->> 'at')::numeric;
      if v_el < (bolt ->> 't')::numeric - 1.6 or v_el > (bolt ->> 't')::numeric + 0.8 then raise exception 'missed' using errcode = 'P0001'; end if;
      st := jsonb_set(st, array['caught', v_i::text], to_jsonb(e.owner_id::text));
      if bolt ->> 'kind' = 'mutate' then
        v_out := private.storm_mutate(e.owner_id, (bolt ->> 'target')::uuid);
        if v_out ->> 'what' = 'ink' then v_ink := 12; else v_ink := 6; end if;
        if v_out ->> 'what' = 'aberration' then perform private.ench_stat(e.id, 'aberrations'); end if;
        st := st || jsonb_build_object('mut', coalesce(st -> 'mut', '[]'::jsonb) || jsonb_build_array(v_out || jsonb_build_object('kind', bolt -> 'tkind')));
      else
        v_ink := case when bolt ->> 'kind' = 'stray' then 8 else 12 end;
        v_out := jsonb_build_object('what', 'ink');
      end if;
      if e.stars >= 2 then v_ink := v_ink * 2; end if;
      st := st || jsonb_build_object('ink', coalesce((st ->> 'ink')::numeric, 0) + v_ink);
      s := s || jsonb_build_object('storm', st);
      perform private.ench_stat(e.id, 'bolts');
      r := v_out || jsonb_build_object('i', v_i, 'ink', v_ink, 'bolt', bolt);
    when 'end' then
      -- (the storm settles when it's over — this just hands back what it came to)
      if jsonb_typeof(s -> 'storm') = 'object' and not coalesce((s -> 'storm' ->> 'settled')::boolean, false) then raise exception 'too_soon' using errcode = 'P0001'; end if;
      r := jsonb_build_object('ended', true, 'last', s -> 'last', 'pay', s -> 'last' -> 'pay');
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $function$;

CREATE OR REPLACE FUNCTION private.cru_anchored(p_gx integer, p_gy integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (select 1 from public.crucible_artifacts a where a.gx = p_gx and a.gy = p_gy and a.kind = 'anchor')
      or exists (select 1 from public.enchant_buffs b where b.kind = 'ward' and b.gx = p_gx and b.gy = p_gy and b.expires_at > now())
      or private.ench_tempered_at(p_gx, p_gy)
$function$;

create or replace function private.lev_safe(p_uid uuid, p_gx int, p_gy int) returns boolean language sql stable as $$
  select exists (select 1 from public.enchant_buffs b where b.player_id = p_uid and b.kind = 'paper_shield' and b.expires_at > now())
      or private.cru_anchored(p_gx, p_gy)
$$;

CREATE OR REPLACE FUNCTION private.leviathan_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare l public.leviathans; p jsonb; v_from numeric; v_to numeric; v_step numeric := 1.5; k numeric; v_pt jsonb; v_r numeric := private.lev_n('trample_km', 1.2);
  v_cm numeric; v_dc int; v_c int[]; v_new int := 0; v_n int; g record; v_dmg bigint; f numeric; i int; a jsonb; b jsonb; v_acc numeric; v_seg numeric; x record;
begin
  if not pg_try_advisory_xact_lock(hashtext('landvas_leviathan_tick')) then return jsonb_build_object('busy', true); end if;
  select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1 for update;
  if l.id is null then
    if coalesce((private.lev_cfg() ->> 'enabled')::boolean, true) and now() >= private.lev_next_at() then
      l := private.lev_spawn(null);
      return jsonb_build_object('spawned', l.id);
    end if;
    return jsonb_build_object('idle', true);
  end if;
  if l.status = 'warning' then
    if now() < l.rise_at then update public.leviathans set last_tick = now() where id = l.id; return jsonb_build_object('warning', true); end if;
    update public.leviathans set status = 'walking', roar_at = now() where id = l.id returning * into l;
    perform private.lev_feed(null, jsonb_build_object('sub', 'risen', 'where', l.origin, 'gen', l.gen));
  end if;
  -- a rampage that has run its course: back to its pace (it carries on the same way)
  if l.rampage_until is not null and l.rampage_until <= now() then
    l := private.lev_set_speed(l.id, coalesce((l.data ->> 'cruise_kmh')::numeric, private.lev_base(l)));
    update public.leviathans set rampage_until = null, data = data - 'cruise_kmh' where id = l.id returning * into l;
  end if;
  -- its own powers, every few hours: it shrinks to a speck, or vanishes from the map
  if coalesce((private.lev_cfg() ->> 'powers_auto')::boolean, true) and l.status in ('walking', 'enraged') then
    if l.data ->> 'next_power_at' is null then
      update public.leviathans set data = data || jsonb_build_object('next_power_at', now() + make_interval(secs => (random() * private.lev_n('power_every_h', 3) * 3600)::double precision))
       where id = l.id returning * into l;
    elsif (l.data ->> 'next_power_at')::timestamptz <= now() and not private.lev_tiny(l) and not private.lev_hidden(l) then
      l := private.lev_power(l.id, case when random() < 0.55 then 'tiny' else 'hidden' end, private.lev_n('power_min', 25));
      update public.leviathans set data = data || jsonb_build_object('next_power_at', now() + make_interval(secs => ((0.7 + random() * 0.6) * private.lev_n('power_every_h', 3) * 3600)::double precision))
       where id = l.id returning * into l;
    end if;
  end if;
  p := private.lev_pos(l, now());
  -- trample the plots along the way since the last beat (a sample every 1.5 km, up to 200 a beat)
  v_from := l.trampled_km; v_to := (p ->> 'km')::numeric;
  if v_to > v_from + 0.2 then
    k := v_from; i := 0;
    while k <= v_to and i < 200 loop
      -- the point k km along the current leg
      v_acc := 0; v_pt := null;
      for x in select o - 1 j from generate_series(1, jsonb_array_length(l.path) - 1) o loop
        a := l.path -> x.j; b := l.path -> (x.j + 1); v_seg := private.lev_km(a, b);
        if v_acc + v_seg >= k then f := case when v_seg > 0 then (k - v_acc) / v_seg else 0 end;
          v_pt := jsonb_build_array((a ->> 0)::numeric + ((b ->> 0)::numeric - (a ->> 0)::numeric) * f, (a ->> 1)::numeric + ((b ->> 1)::numeric - (a ->> 1)::numeric) * f); exit; end if;
        v_acc := v_acc + v_seg;
      end loop;
      exit when v_pt is null;
      v_cm := 40075016.7 / 4194304 * cos(radians((v_pt ->> 1)::float8));
      v_dc := ceil(v_r * (case when private.lev_tiny(l) then 0.3 else 1 end) * 1000 / greatest(v_cm, 0.5))::int;
      v_c := private.lev_cell((v_pt ->> 0)::float8, (v_pt ->> 1)::float8);
      with ins as (
        insert into public.leviathan_trampled (lev_id, gx, gy, owner_id, until)
        select l.id, w.gx, w.gy, w.owner_id, now() + make_interval(hours => private.lev_n('trample_hours', 2)::int)
          from public.world_plots w
         where w.owner_id is not null and w.folded_at is null and not private.lev_safe(w.owner_id, w.gx, w.gy) and w.gx between v_c[1] - v_dc and v_c[1] + v_dc and w.gy between v_c[2] - v_dc and v_c[2] + v_dc
           and ((w.gx - v_c[1]) ^ 2 + (w.gy - v_c[2]) ^ 2) <= v_dc ^ 2
         limit 400
        on conflict (lev_id, gx, gy) do nothing returning owner_id)
      select count(*) into v_n from ins;
      v_new := v_new + v_n;
      k := k + v_step; i := i + 1;
    end loop;
    if v_new > 0 then
      for x in select distinct t.owner_id from public.leviathan_trampled t where t.lev_id = l.id and t.at > now() - interval '5 seconds'
                and not exists (select 1 from public.player_notifications n where n.player_id = t.owner_id and n.kind = 'leviathan' and n.data ->> 'sub' = 'trampled' and n.data ->> 'gen' = l.gen::text) loop
        perform private.notify(x.owner_id, 'leviathan', null, jsonb_build_object('sub', 'trampled', 'gen', l.gen, 'place', private.lev_place((p ->> 'lng')::float8, (p ->> 'lat')::float8)));
      end loop;
    end if;
    update public.leviathans set trampled_km = least(v_to, k) where id = l.id;
  end if;
  -- a giant plot in its way stops it (once each), and lands a blow
  for g in select b.gx, b.gy, b.player_id, pr.username from public.enchant_buffs b join public.profiles pr on pr.id = b.player_id
            where b.kind = 'plot_giant' and b.expires_at > now() and not l.blocked @> jsonb_build_array(jsonb_build_array(b.gx, b.gy))
              and not coalesce((b.data ->> 'prank')::boolean, false) -- (a prank giant is only for show: it can't stop a Leviathan)
              and private.haversine_m((p ->> 'lng')::float8, (p ->> 'lat')::float8, private.lng_of(b.gx + 0.5), private.lat_of(b.gy + 0.5)) < private.lev_n('block_km', 3) * 1000
            limit 3 loop
    v_dmg := greatest(2000, round(l.hp_max * 0.02));
    perform private.lev_pause(l.id, private.lev_n('block_min', 20) * 60);
    update public.leviathans set blocked = blocked || jsonb_build_array(jsonb_build_array(g.gx, g.gy)), hp = greatest(1, hp - v_dmg) where id = l.id;
    insert into public.leviathan_players (lev_id, player_id, dmg, hits) values (l.id, g.player_id, v_dmg, 1)
    on conflict (lev_id, player_id) do update set dmg = public.leviathan_players.dmg + v_dmg, hits = public.leviathan_players.hits + 1;
    insert into public.leviathan_hits (lev_id, player_id, move, label, emoji, dmg) values (l.id, g.player_id, 'giant', 'a giant plot stood in its way', '📡', v_dmg);
    perform private.notify(g.player_id, 'leviathan', null, jsonb_build_object('sub', 'blocked', 'gen', l.gen, 'dmg', v_dmg));
  end loop;
  select * into l from public.leviathans where id = l.id;
  p := private.lev_pos(l, now());
  -- the ink trail (a point every few km)
  if jsonb_array_length(l.trail) = 0 or private.lev_km(l.trail -> (jsonb_array_length(l.trail) - 1), jsonb_build_array(p -> 'lng', p -> 'lat')) > 3 then
    update public.leviathans set trail = case when jsonb_array_length(trail) >= 600 then (trail - 0) else trail end || jsonb_build_array(jsonb_build_array(p -> 'lng', p -> 'lat')) where id = l.id;
  end if;
  update public.leviathans set place = private.lev_place((p ->> 'lng')::float8, (p ->> 'lat')::float8), last_tick = now() where id = l.id;
  -- the end of the road is the sea
  if (p ->> 'done')::boolean then
    if private.lev_road_end(l.id) then return jsonb_build_object('roamed', l.id); end if;
    perform private.lev_escape(l.id); return jsonb_build_object('escaped', l.id);
  end if;
  return jsonb_build_object('tick', l.id, 'pos', p, 'trampled', v_new);
end $function$;

CREATE OR REPLACE FUNCTION private.storm_settle(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare e public.enchantments; st jsonb; b jsonb; v_sc int := 0; v_pay jsonb; v_caught int;
begin
  select * into e from public.enchantments where id = p_id and kind = 'stormcoil' for update;
  st := e.state -> 'storm';
  if e.id is null or jsonb_typeof(st) is distinct from 'object' or coalesce((st ->> 'settled')::boolean, false) or extract(epoch from now()) < (st ->> 'until')::numeric + 3 then return; end if;
  for b in select x from jsonb_array_elements(st -> 'bolts') x loop
    if b ->> 'kind' = 'ink' and not coalesce(st -> 'caught', '{}'::jsonb) ? (b ->> 'i') and e.stars < 3 and random() < private.ench_n('stormcoil', 'scorch', 0.3) and not private.ench_dodge(e.id) and not private.cru_anchored((b ->> 'gx')::int, (b ->> 'gy')::int)
       and not exists (select 1 from public.enchant_buffs where kind = 'scorch' and gx = (b ->> 'gx')::int and gy = (b ->> 'gy')::int and expires_at > now()) then
      insert into public.enchant_buffs (player_id, kind, gx, gy, mult, data, expires_at) values (e.owner_id, 'scorch', (b ->> 'gx')::int, (b ->> 'gy')::int, 0.8, '{}'::jsonb, now() + interval '1 hour');
      v_sc := v_sc + 1;
    end if;
  end loop;
  select count(*)::int into v_caught from jsonb_object_keys(coalesce(st -> 'caught', '{}'::jsonb)) k;
  if e.owner_id is not null and e.status = 'active' and coalesce((st ->> 'ink')::numeric, 0) > 0 then v_pay := private.ench_pay(e.id, (st ->> 'ink')::numeric, 'the storm'); end if;
  st := st || jsonb_build_object('settled', true);
  update public.enchantments set state = state || jsonb_build_object('storm', st, 'last', jsonb_build_object('caught', v_caught, 'of', jsonb_array_length(st -> 'bolts'),
      'scorched', v_sc, 'ink', coalesce((v_pay ->> 'paid')::int, 0), 'pay', v_pay, 'mut', coalesce(st -> 'mut', '[]'::jsonb), 'at', st -> 'until')), updated_at = now() where id = e.id;
  perform private.ench_event(e.id, 'storm_end', jsonb_build_object('caught', v_caught, 'of', jsonb_array_length(st -> 'bolts'), 'scorched', v_sc, 'ink', coalesce((v_pay ->> 'paid')::int, 0)));
  perform private.ench_xp(e.id, 2);
end $function$;

CREATE OR REPLACE FUNCTION private.spy_json(p_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object('id', s.id, 'gx', s.gx, 'gy', s.gy, 'rarity', s.rarity, 'kind', case when s.used_at is not null then s.kind end, 'stirs', s.rarity = 'enchanted', 'scout', (select x.kind from public.enchantments x where x.id = s.enchant_id and x.kind <> 'spyglass'), 'hot', s.hot, 'second', s.second,
           'at', s.created_at, 'expires_at', s.expires_at, 'expires_in', greatest(0, round(extract(epoch from s.expires_at - now()))),
           'used', s.used_at is not null, 'refunded', s.refunded_at is not null, 'expired', s.used_at is null and s.refunded_at is null and s.expires_at <= now())
    from private.spy_sightings s where s.id = p_id
$function$;

CREATE OR REPLACE FUNCTION private.spy_claimed(p_uid uuid, p_gx integer, p_gy integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare v record; x public.enchantments; g jsonb;
begin
  for v in update private.spy_sightings set refunded_at = now()
            where gx = p_gx and gy = p_gy and player_id <> p_uid and used_at is null and refunded_at is null and expires_at > now()
        returning player_id, enchant_id loop
    select * into x from public.enchantments where id = v.enchant_id and kind = 'spyglass' and status = 'active' for update;
    if x.id is not null then
      g := private.spy_eval(x, private.ench_now(x));
      update public.enchantments set state = state || jsonb_build_object('looks', least((g ->> 'max')::int, (g ->> 'looks')::int + 1), 'look_at', (g ->> 'look_at')::numeric)
       where id = x.id;
      perform private.notify(v.player_id, 'enchant', p_uid, jsonb_build_object('sub', 'spy_refund', 'kind', 'spyglass', 'gx', p_gx, 'gy', p_gy));
    end if;
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION private.spy_take(p_uid uuid, p_gx integer, p_gy integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v private.spy_sightings;
begin
  select * into v from private.spy_sightings where player_id = p_uid and gx = p_gx and gy = p_gy and used_at is null and refunded_at is null and expires_at > now()
   order by id desc limit 1 for update;
  if v.id is null then return null; end if;
  update private.spy_sightings set used_at = now() where id = v.id;
  perform private.fairplay(p_uid, 'spy_claim', p_gx, p_gy, jsonb_build_object('rarity', v.rarity, 'enchant', v.enchant_id, 'sighting', v.id));
  return jsonb_build_object('id', v.id, 'rarity', v.rarity, 'kind', v.kind, 'enchant_id', v.enchant_id);
end $function$;

CREATE OR REPLACE FUNCTION private.ench_act_spyglass(e enchantments, p_action text, a jsonb, t timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare s jsonb := e.state; g jsonb := private.spy_eval(e, t); r jsonb; v_gx int; v_gy int; v_roll jsonb; v_id bigint; w public.world_plots;
  v_sg private.spy_sightings; v_day text := private.today()::text; v_better boolean;
begin
  case p_action
    when 'look' then
      v_gx := (a ->> 'gx')::int; v_gy := (a ->> 'gy')::int;
      if v_gx is null or v_gy is null or v_gx not between 0 and 4194303 or v_gy not between 0 and 4194303 then raise exception 'invalid_plot' using errcode = 'P0001'; end if;
      if (g ->> 'looks')::int < 1 then raise exception 'no_looks' using errcode = 'P0001'; end if;
      select * into w from public.world_plots where gx = v_gx and gy = v_gy;
      if w.owner_id is not null or coalesce(w.locked, false) then raise exception 'plot_taken' using errcode = 'P0001'; end if;
      if exists (select 1 from private.spy_sightings where player_id = e.owner_id and gx = v_gx and gy = v_gy and used_at is null and refunded_at is null and expires_at > now()) then
        raise exception 'already_sighted' using errcode = 'P0001';
      end if;
      if not private.spy_in_range(e.owner_id, v_gx, v_gy, (g ->> 'range_m')::numeric) then raise exception 'out_of_range' using errcode = 'P0001'; end if;
      v_roll := private.spy_roll(v_gx, v_gy);
      insert into private.spy_sightings (player_id, enchant_id, gx, gy, rarity, kind, hot, expires_at)
      values (e.owner_id, e.id, v_gx, v_gy, v_roll ->> 'rarity', v_roll ->> 'kind', private.in_hot_zone(v_gx, v_gy),
              now() + make_interval(hours => (g ->> 'keep_h')::int))
      returning id into v_id;
      s := s || jsonb_build_object('looks', (g ->> 'looks')::int - 1, 'look_at', (g ->> 'look_at')::numeric);
      perform private.ench_stat(e.id, 'looks');
      perform private.fairplay(e.owner_id, 'spy_look', v_gx, v_gy, jsonb_build_object('enchant', e.id, 'rarity', v_roll ->> 'rarity'));
      if private.spy_rank(v_roll ->> 'rarity') >= 5 then perform private.ench_stat(e.id, 'grand'); end if;
      perform private.ench_xp(e.id, 1);
      perform private.ench_event(e.id, 'sighted', jsonb_build_object('rarity', v_roll ->> 'rarity', 'kind', v_roll ->> 'kind', 'gx', v_gx, 'gy', v_gy));
      r := jsonb_build_object('sighting', private.spy_json(v_id));
    when 'second' then
      -- ★3 Second Sight: a second reading of a sighted plot, and keep the better one
      if e.stars < 3 then raise exception 'stars_locked' using errcode = 'P0001', detail = '3'; end if;
      if s ->> 'second_day' = v_day then raise exception 'already_today' using errcode = 'P0001'; end if;
      select * into v_sg from private.spy_sightings where id = (a ->> 'id')::bigint and player_id = e.owner_id
         and used_at is null and refunded_at is null and expires_at > now() for update;
      if v_sg.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
      if v_sg.second then raise exception 'already_second' using errcode = 'P0001'; end if;
      v_roll := private.spy_roll(v_sg.gx, v_sg.gy);
      v_better := private.spy_rank(v_roll ->> 'rarity') > private.spy_rank(v_sg.rarity);
      update private.spy_sightings set second = true,
        rarity = case when v_better then v_roll ->> 'rarity' else rarity end, kind = case when v_better then v_roll ->> 'kind' else kind end
       where id = v_sg.id;
      s := s || jsonb_build_object('second_day', v_day);
      perform private.ench_event(e.id, 'second_sight', jsonb_build_object('was', v_sg.rarity, 'drew', v_roll ->> 'rarity', 'better', v_better));
      r := jsonb_build_object('sighting', private.spy_json(v_sg.id), 'drew', v_roll, 'was', v_sg.rarity, 'better', v_better);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $function$;

-- the Studio project on a moved canvas: its tiles are keyed by the new cell
create or replace function private.ori_move_project(p_project uuid, p_ax int, p_ay int, p_bx int, p_by int) returns void language plpgsql as $$
declare pr public.artwork_projects; v public.artwork_versions; v_from text := private.cell_key(p_ax, p_ay); v_to text := private.cell_key(p_bx, p_by); v_man jsonb; v_id uuid;
begin
  select * into pr from public.artwork_projects where id = p_project for update;
  if pr.id is null or pr.current_version_id is null then return; end if;
  select * into v from public.artwork_versions where id = pr.current_version_id;
  if v.id is null then return; end if;
  v_man := v.manifest;
  if jsonb_typeof(v.manifest -> 'layers') = 'array' then
    v_man := jsonb_set(v.manifest, '{layers}', coalesce((
      select jsonb_agg(case when jsonb_typeof(l -> 'tiles') = 'object'
                            then jsonb_set(l, '{tiles}', coalesce((select jsonb_object_agg(case when tk = v_from then v_to else tk end, tv) from jsonb_each(l -> 'tiles') tt(tk, tv)), '{}'::jsonb))
                            else l end order by ord)
        from jsonb_array_elements(v.manifest -> 'layers') with ordinality x(l, ord)), '[]'::jsonb));
  end if;
  insert into public.artwork_versions (project_id, owner_id, version_no, parent_version_id, kind, manifest, cells, layer_count, tile_count, note)
  values (pr.id, pr.owner_id, (select coalesce(max(version_no), 0) + 1 from public.artwork_versions where project_id = pr.id), v.id, 'save', v_man,
          jsonb_build_array(jsonb_build_array(p_bx, p_by)), v.layer_count, v.tile_count, 'Unfolded somewhere new by an Origami Pocket')
  returning id into v_id;
  update public.artwork_projects set current_version_id = v_id, version_count = version_count + 1, updated_at = now() where id = pr.id;
end $$;

-- the pipeline moved a drawing's tile to its new cell
create or replace function public.svc_art_moved(p_to jsonb, p_rev bigint, p_publication_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_gx int := (p_to ->> 0)::int; v_gy int := (p_to ->> 1)::int;
begin
  update public.world_plots set art_rev = p_rev, updated_at = now() where gx = v_gx and gy = v_gy and art_publication_id = p_publication_id;
  if found and p_rev is not null then
    insert into public.plot_art_history (gx, gy, publication_id, rev) values (v_gx, v_gy, p_publication_id, p_rev);
  end if;
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy, publication_id) values ('art', v_gx, v_gy, v_gx, v_gy, p_publication_id);
end $$;
revoke all on function public.svc_art_moved(jsonb, bigint, uuid) from public;
grant execute on function public.svc_art_moved(jsonb, bigint, uuid) to service_role;

CREATE OR REPLACE FUNCTION private.ori_move(e enchantments, p world_plots, p_gx integer, p_gy integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare w public.world_plots; v_y text; v_yt text; g public.canvas_groups; v_km numeric; v_ench uuid; v_moved boolean := false;
begin
  if p.rarity = 'enchanted' and exists (select 1 from public.enchantments where gx = p_gx and gy = p_gy) then raise exception 'plot_taken' using errcode = 'P0001'; end if;
  perform private.rent_settle(e.owner_id);
  select * into w from public.world_plots where gx = p_gx and gy = p_gy for update;
  -- what the old cell takes on: the new cell's own roll (a released row keeps its own)
  if w.gx is not null then v_y := w.rarity; v_yt := w.plot_type;
  else v_y := private.cell_ladder_rarity(p_gx, p_gy); v_yt := private.plot_type_for(p_gx, p_gy); end if;
  if v_y like 'crown%' or v_y = 'enchanted' then v_y := private.cell_ladder_rarity(p_gx, p_gy); end if;
  -- a living fold carries its enchantment along
  if p.rarity = 'enchanted' then
    select id into v_ench from public.enchantments where gx = p.gx and gy = p.gy and status <> 'gone';
    update public.enchant_buffs set gx = p_gx, gy = p_gy where gx = p.gx and gy = p.gy and enchant_id = v_ench;
    update public.enchantments set gx = p_gx, gy = p_gy, updated_at = now() where id = v_ench;
  end if;
  -- the new cell
  if w.gx is not null then
    update public.world_plots set owner_id = e.owner_id, claimed_at = p.claimed_at, level = p.level, plot_type = p.plot_type, rarity = p.rarity,
           art_publication_id = null, art_rev = null, folded_at = null, folded_by = null, updated_at = now()
     where gx = p_gx and gy = p_gy;
  else
    insert into public.world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at, level)
    values (p_gx, p_gy, p.plot_type, p.rarity, e.owner_id, p.claimed_at, p.level);
  end if;
  update public.world_plots set shiny = p.shiny, name = p.name where gx = p_gx and gy = p_gy;
  -- what belongs to it comes too
  delete from public.plot_game_progress where gx = p_gx and gy = p_gy;
  update public.plot_game_progress set gx = p_gx, gy = p_gy where gx = p.gx and gy = p.gy;
  delete from public.crucible_inlays where gx = p_gx and gy = p_gy;
  delete from public.crucible_monuments where gx = p_gx and gy = p_gy;
  update public.crucible_inlays set gx = p_gx, gy = p_gy where gx = p.gx and gy = p.gy;
  update public.crucible_monuments set gx = p_gx, gy = p_gy, updated_at = now() where gx = p.gx and gy = p.gy;
  update public.crucible_artifacts set gx = p_gx, gy = p_gy where gx = p.gx and gy = p.gy;
  -- the old cell goes back to the world
  select gr.* into g from public.canvas_group_members m join public.canvas_groups gr on gr.id = m.group_id where m.gx = p.gx and m.gy = p.gy for update of gr;
  if g.id is not null and g.plot_count <= 1 and g.status = 'active' then
    -- its drawing comes too: the canvas (and the Studio project on it) moves to the new cell, and the published tile follows
    v_moved := true;
    delete from public.canvas_group_members where gx = p_gx and gy = p_gy and group_id <> g.id;
    update public.canvas_group_members set gx = p_gx, gy = p_gy where group_id = g.id;
    update public.canvas_groups set min_gx = p_gx, max_gx = p_gx, min_gy = p_gy, max_gy = p_gy, updated_at = now() where id = g.id;
    if g.project_id is not null then perform private.ori_move_project(g.project_id, p.gx, p.gy, p_gx, p_gy); end if;
    if p.art_publication_id is not null then
      update public.world_plots set art_publication_id = p.art_publication_id, art_rev = null where gx = p_gx and gy = p_gy;
      if p.art_rev is not null then
        perform private.enqueue_job('move_art', jsonb_build_object('from', jsonb_build_array(p.gx, p.gy), 'to', jsonb_build_array(p_gx, p_gy), 'rev', p.art_rev, 'publication_id', p.art_publication_id));
      end if;
    end if;
  elsif g.id is not null then
    delete from public.canvas_group_members where group_id = g.id;
    update public.canvas_groups set status = 'dissolved', plot_count = 0, updated_at = now() where id = g.id;
    if g.project_id is not null then update public.artwork_projects set status = 'archived', updated_at = now() where id = g.project_id; end if;
  end if;
  update public.world_plots set owner_id = null, claimed_at = null, level = 1, art_publication_id = null, art_rev = null, rarity = v_y, plot_type = coalesce(v_yt, plot_type),
         folded_at = null, folded_by = null, updated_at = now()
   where gx = p.gx and gy = p.gy;
  update public.plot_ownership set released_at = now(), release_reason = 'folded away (Origami Pocket)' where gx = p.gx and gy = p.gy and released_at is null;
  insert into public.plot_ownership (gx, gy, player_id, method, cost) values (p_gx, p_gy, e.owner_id, 'unfold', jsonb_build_object('from', jsonb_build_array(p.gx, p.gy)));
  if not v_moved then perform private.create_group_with_cells(e.owner_id, jsonb_build_array(jsonb_build_array(p_gx, p_gy)), private.empty_manifest(), null, 'initial'); end if;
  insert into public.plot_art_history (gx, gy, publication_id, rev) values (p.gx, p.gy, null, null);
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p.gx, p.gy, p.gx, p.gy), ('ownership', p_gx, p_gy, p_gx, p_gy);
  perform private.enqueue_job('clear_cells', jsonb_build_object('cells', jsonb_build_array(jsonb_build_array(p.gx, p.gy))));
  perform private.spy_claimed(e.owner_id, p_gx, p_gy);
  -- a fresh crease: its minigames pay more for a day
  insert into public.enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, data, expires_at)
  values (e.owner_id, 'crease', p_gx, p_gy, e.id, 1.25, jsonb_build_object('from', jsonb_build_array(p.gx, p.gy)), now() + interval '24 hours');
  v_km := round((private.ench_cell_m(p.gx, p.gy, p_gx, p_gy) / 1000)::numeric, 1);
  perform private.fairplay(e.owner_id, 'unfold', p_gx, p_gy, jsonb_build_object('from', jsonb_build_array(p.gx, p.gy), 'rarity', p.rarity, 'left', v_y, 'km', v_km));
  return jsonb_build_object('from', jsonb_build_array(p.gx, p.gy), 'to', jsonb_build_array(p_gx, p_gy), 'km', v_km, 'rarity', p.rarity, 'left', v_y, 'enchant', v_ench, 'drawing', v_moved and p.art_publication_id is not null);
end $function$;

CREATE OR REPLACE FUNCTION private.ori_plot_json(p world_plots)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object('gx', p.gx, 'gy', p.gy, 'rarity', p.rarity, 'plot_type', p.plot_type, 'name', p.name, 'shiny', p.shiny, 'level', p.level,
           'folded_at', p.folded_at, 'art', p.art_publication_id is not null, 'art_path', (select a.thumb_path from public.artwork_publications a where a.id = p.art_publication_id),
           'kind', (select x.kind from public.enchantments x where x.gx = p.gx and x.gy = p.gy and x.status = 'active' and p.rarity = 'enchanted'))
$function$;

CREATE OR REPLACE FUNCTION private.ench_act_origami(e enchantments, p_action text, a jsonb, t timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare s jsonb := e.state; g jsonb := private.ori_eval(e, t); r jsonb; p public.world_plots; v_why text; v_mv jsonb; v_pay jsonb; sp record;
begin
  case p_action
    when 'fold' then
      if (g ->> 'folds')::int < 1 then raise exception 'no_folds' using errcode = 'P0001'; end if;
      if (g ->> 'pocket')::int >= (g ->> 'pocket_max')::int then raise exception 'pocket_full' using errcode = 'P0001'; end if;
      select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int for update;
      if p.gx is null then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
      v_why := private.ori_why_not(e, p);
      if v_why is not null then raise exception '%', v_why using errcode = 'P0001'; end if;
      -- what was stuck to it falls off: a Parasite, a size, a scorch; a splice into it ends
      for sp in select id from public.enchantments x where x.kind = 'parasite' and x.status = 'active' and (x.state -> 'host' ->> 'gx')::int = p.gx and (x.state -> 'host' ->> 'gy')::int = p.gy loop
        update public.enchantments set state = state || jsonb_build_object('host', null, 'rest_until', private.ench_ep(now()) + 3600) where id = sp.id;
      end loop;
      delete from public.enchant_buffs where gx = p.gx and gy = p.gy and kind in ('plot_giant', 'plot_tiny', 'scorch', 'crease');
      update public.enchant_splices set ends_at = now() where mode = 'plot' and plot_gx = p.gx and plot_gy = p.gy and ends_at > now();
      update public.world_plots set folded_at = now(), folded_by = e.id, updated_at = now() where gx = p.gx and gy = p.gy;
      insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p.gx, p.gy, p.gx, p.gy);
      s := s || jsonb_build_object('folds', (g ->> 'folds')::int - 1, 'fold_at', (g ->> 'fold_at')::numeric);
      perform private.ench_stat(e.id, 'folds');
      perform private.fairplay(e.owner_id, 'fold', p.gx, p.gy, jsonb_build_object('enchant', e.id, 'rarity', p.rarity));
      perform private.ench_xp(e.id, 1);
      perform private.ench_event(e.id, 'folded', jsonb_build_object('gx', p.gx, 'gy', p.gy, 'rarity', p.rarity, 'name', p.name));
      select * into p from public.world_plots where gx = p.gx and gy = p.gy;
      r := jsonb_build_object('folded', private.ori_plot_json(p));
    when 'unfold' then
      select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int and folded_by = e.id and owner_id = e.owner_id for update;
      if p.gx is null then raise exception 'not_folded' using errcode = 'P0001'; end if;
      v_why := private.ori_can_land(e.owner_id, e, (a ->> 'to_gx')::int, (a ->> 'to_gy')::int);
      if v_why is not null then raise exception '%', v_why using errcode = 'P0001'; end if;
      perform pg_advisory_xact_lock(hashtext('cell:' || (a ->> 'to_gx') || ':' || (a ->> 'to_gy')));
      v_mv := private.ori_move(e, p, (a ->> 'to_gx')::int, (a ->> 'to_gy')::int);
      v_pay := private.ench_pay(e.id, 20 + least(40, floor((v_mv ->> 'km')::numeric)), 'unfolded a plot ' || (v_mv ->> 'km') || ' km away');
      perform private.ench_stat(e.id, 'unfolds');
      update public.enchantments set stats = stats || jsonb_build_object('far_km', greatest(coalesce((stats ->> 'far_km')::numeric, 0), (v_mv ->> 'km')::numeric)) where id = e.id;
      perform private.ench_event(e.id, 'unfolded', v_mv || jsonb_build_object('ink', v_pay -> 'paid'));
      insert into public.feed_events (kind, player_id, data)
      values ('enchant', e.owner_id, jsonb_build_object('sub', 'unfolded', 'kind', 'origami', 'rarity', p.rarity, 'km', v_mv -> 'km'));
      select * into p from public.world_plots where gx = (a ->> 'to_gx')::int and gy = (a ->> 'to_gy')::int;
      r := v_mv || jsonb_build_object('pay', v_pay, 'plot', private.ori_plot_json(p));
    when 'smooth' then
      -- unfold it right where it was (no charge back)
      select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int and folded_by = e.id and owner_id = e.owner_id for update;
      if p.gx is null then raise exception 'not_folded' using errcode = 'P0001'; end if;
      update public.world_plots set folded_at = null, folded_by = null, updated_at = now() where gx = p.gx and gy = p.gy;
      insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p.gx, p.gy, p.gx, p.gy);
      perform private.ench_event(e.id, 'smoothed', jsonb_build_object('gx', p.gx, 'gy', p.gy));
      r := jsonb_build_object('smoothed', jsonb_build_array(p.gx, p.gy));
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $function$;

CREATE OR REPLACE FUNCTION private.ench_act_crucible(e enchantments, p_action text, a jsonb, t timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare s jsonb := e.state; r jsonb; p public.world_plots; g public.canvas_groups; c jsonb; v_why text; v_heat numeric := coalesce((e.state ->> 'heat')::numeric, 0);
  v_n int := 0; v_h numeric; v_gain numeric := 0; v_metal jsonb := '{}'::jsonb; v_m text; v_cnt int; v_to text; v_from text; v_p numeric; v_ok boolean;
  v_rune text; v_free boolean := false; v_keep numeric; v_type text; v_week text := to_char(now(), 'IYYY-IW'); v_master boolean := false; v_pay jsonb;
  art public.crucible_artifacts; art2 public.crucible_artifacts; v_pts int; v_mon public.crucible_monuments; v_name text; v_lk jsonb; v_day text := private.today()::text;
  v_mult numeric := case when e.stars >= 1 then 1.25 else 1 end; k text; v numeric;
begin
  case p_action
    when 'melt' then
      -- one plot or many ({cells: [[gx, gy], …]}), no daily limit
      if jsonb_typeof(a -> 'cells') <> 'array' or jsonb_array_length(a -> 'cells') = 0 then raise exception 'invalid_plot' using errcode = 'P0001'; end if;
      if jsonb_array_length(a -> 'cells') > 25 then raise exception 'too_many' using errcode = 'P0001'; end if;
      perform private.rent_settle(e.owner_id);
      for c in select x from jsonb_array_elements(a -> 'cells') x loop
        select * into p from public.world_plots where gx = (c ->> 0)::int and gy = (c ->> 1)::int for update;
        if p.gx is null then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
        v_why := private.cru_why_not_melt(e.owner_id, p);
        if v_why is not null then raise exception '%', v_why using errcode = 'P0001'; end if;
        select count(*) into v_cnt from public.world_plots where owner_id = e.owner_id;
        if v_cnt <= 1 then raise exception 'last_plot' using errcode = 'P0001'; end if;
        select gr.* into g from public.canvas_group_members m join public.canvas_groups gr on gr.id = m.group_id where m.gx = p.gx and m.gy = p.gy for update of gr;
        if g.id is not null then
          delete from public.canvas_group_members where group_id = g.id;
          update public.canvas_groups set status = 'dissolved', plot_count = 0, updated_at = now() where id = g.id;
          if g.project_id is not null then update public.artwork_projects set status = 'archived', updated_at = now() where id = g.project_id; end if;
        end if;
        -- back to the world at the cell's own roll (a plot Luck lifted can't be handed on)
        update public.world_plots set owner_id = null, claimed_at = null, level = 1, art_publication_id = null, art_rev = null,
               rarity = private.plot_rarity_for(p.gx, p.gy), plot_type = private.plot_type_for(p.gx, p.gy), updated_at = now()
         where gx = p.gx and gy = p.gy;
        update public.plot_ownership set released_at = now(), release_reason = 'melted in the Crucible' where gx = p.gx and gy = p.gy and released_at is null;
        perform private.fairplay(e.owner_id, 'melt', p.gx, p.gy, jsonb_build_object('enchant', e.id, 'rarity', p.rarity, 'shiny', p.shiny));
        insert into public.plot_art_history (gx, gy, publication_id, rev) values (p.gx, p.gy, null, null);
        insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p.gx, p.gy, p.gx, p.gy);
        perform private.enqueue_job('clear_cells', jsonb_build_object('cells', jsonb_build_array(jsonb_build_array(p.gx, p.gy))));
        v_h := round(private.cru_heat_of(p.rarity, p.shiny) * v_mult, 2);
        v_gain := v_gain + v_h;
        v_m := private.cru_metal(p.rarity);
        v_metal := v_metal || jsonb_build_object(v_m, coalesce((v_metal ->> v_m)::int, 0) + case when coalesce((select ppm from public.plot_rarities where id = p.rarity), 0) > 0 then 3 else 1 end);
        v_n := v_n + 1;
      end loop;
      s := s || jsonb_build_object('heat', round(v_heat + v_gain, 2));
      for k, v in select key, value::numeric from jsonb_each_text(v_metal) loop
        s := jsonb_set(s, '{metal}', coalesce(s -> 'metal', '{}'::jsonb) || jsonb_build_object(k, coalesce((s -> 'metal' ->> k)::numeric, 0) + v));
      end loop;
      perform private.ench_stat(e.id, 'melts', v_n);
      perform private.ench_xp(e.id, v_n);
      perform private.ench_event(e.id, 'melted', jsonb_build_object('n', v_n, 'heat', v_gain, 'metal', v_metal));
      r := jsonb_build_object('melted', v_n, 'heat_gained', v_gain, 'metal_gained', v_metal, 'heat', round(v_heat + v_gain, 2));
    when 'strike' then
      if v_heat <= 0 then raise exception 'no_heat' using errcode = 'P0001'; end if;
      select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int for update;
      if p.gx is null then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
      v_why := private.cru_why_not_strike(e.owner_id, p);
      if v_why is not null then raise exception '%', v_why using errcode = 'P0001'; end if;
      v_rune := nullif(a ->> 'rune', '');
      if v_rune is not null then
        if v_rune not in ('steady', 'fury', 'kind') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
        if e.stars >= 2 then v_free := true;
        elsif coalesce((s -> 'runes' ->> v_rune)::int, 0) < 1 then raise exception 'no_rune' using errcode = 'P0001';
        else s := jsonb_set(s, '{runes}', coalesce(s -> 'runes', '{}'::jsonb) || jsonb_build_object(v_rune, (s -> 'runes' ->> v_rune)::int - 1)); end if;
        if v_rune = 'kind' then
          v_type := a ->> 'type';
          if v_type is null or not exists (select 1 from public.plot_types where id = v_type and weight > 0) then raise exception 'bad_type' using errcode = 'P0001'; end if;
        end if;
      end if;
      v_from := p.rarity; v_to := private.cru_next(p.rarity, 1);
      v_p := private.cru_chance(v_heat, v_to, (a ->> 'pump')::numeric, v_rune = 'fury');
      v_ok := random() < v_p;
      if v_ok then
        v_master := e.stars >= 3 and coalesce(s ->> 'master_week', '') <> v_week and private.cru_next(p.rarity, 2) = any(private.cru_ladder());
        if v_master then v_to := private.cru_next(p.rarity, 2); s := s || jsonb_build_object('master_week', v_week); end if;
        if v_to = 'ultra' then
          v_to := (select r.id from public.plot_rarities r where r.ppm > 0 order by -ln(1 - random()) / r.ppm limit 1);
        elsif v_to = 'crown' then
          perform pg_advisory_xact_lock(hashtext('crown_forge:' || coalesce(private.city_at(p.gx, p.gy) ->> 'id', '')));
          v_to := private.crown_free_at(p.gx, p.gy);
          if v_to is null then raise exception 'crowns_taken' using errcode = 'P0001'; end if;
        end if;
        perform private.rent_settle(e.owner_id);
        update public.world_plots set rarity = v_to, plot_type = coalesce(v_type, plot_type), updated_at = now() where gx = p.gx and gy = p.gy;
        insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p.gx, p.gy, p.gx, p.gy);
        s := s || jsonb_build_object('heat', 0);
        perform private.ench_stat(e.id, 'wins');
        v_pay := private.ench_pay(e.id, 30 * private.ench_rarity_factor(v_to), 'forged a plot to ' || v_to);
        insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'forged', 'kind', 'crucible', 'from', v_from, 'to', v_to));
      else
        v_keep := case when v_rune = 'fury' then 0 when v_rune = 'steady' then 0.75 else 0.5 end;
        s := s || jsonb_build_object('heat', round(v_heat * v_keep, 2));
      end if;
      perform private.ench_stat(e.id, 'strikes');
      perform private.ench_xp(e.id, 2);
      perform private.ench_event(e.id, 'struck', jsonb_build_object('from', v_from, 'to', case when v_ok then v_to end, 'chance', v_p, 'ok', v_ok, 'rune', v_rune, 'heat', v_heat, 'master', v_master));
      r := jsonb_build_object('ok', v_ok, 'from', v_from, 'to', case when v_ok then v_to else private.cru_next(v_from, 1) end, 'chance', v_p, 'roll_heat', v_heat,
                              'heat', (s ->> 'heat')::numeric, 'kept', case when v_ok then null else v_keep end, 'rune', v_rune, 'free_rune', v_free, 'masterwork', v_master,
                              'pay', v_pay, 'gx', p.gx, 'gy', p.gy);
    when 'rune' then
      v_rune := a ->> 'rune';
      if v_rune not in ('steady', 'fury', 'kind') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
      s := private.cru_spend(s, private.cru_recipes() -> 'runes' -> v_rune);
      s := jsonb_set(s, '{runes}', coalesce(s -> 'runes', '{}'::jsonb) || jsonb_build_object(v_rune, coalesce((s -> 'runes' ->> v_rune)::int, 0) + 1));
      perform private.ench_event(e.id, 'rune', jsonb_build_object('rune', v_rune));
      r := jsonb_build_object('rune', v_rune);
    when 'forge' then
      -- an artifact from metal
      v_m := a ->> 'artifact';
      if v_m not in ('horseshoe', 'bell', 'lantern', 'anchor') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
      if (select count(*) from public.crucible_artifacts where player_id = e.owner_id) >= 30 then raise exception 'too_many' using errcode = 'P0001'; end if;
      s := private.cru_spend(s, private.cru_recipes() -> 'artifacts' -> v_m);
      insert into public.crucible_artifacts (player_id, kind) values (e.owner_id, v_m) returning * into art;
      perform private.ench_stat(e.id, 'artifacts');
      perform private.ench_event(e.id, 'artifact', jsonb_build_object('artifact', v_m));
      r := jsonb_build_object('artifact', private.cru_artifact_json(art));
    when 'fuse' then
      -- two of the same, the same level: one a level higher
      select * into art from public.crucible_artifacts where id = (a ->> 'a')::bigint and player_id = e.owner_id for update;
      select * into art2 from public.crucible_artifacts where id = (a ->> 'b')::bigint and player_id = e.owner_id for update;
      if art.id is null or art2.id is null or art.id = art2.id or art.kind <> art2.kind or art.level <> art2.level then raise exception 'bad_target' using errcode = 'P0001'; end if;
      if art.level >= 5 then raise exception 'max_level' using errcode = 'P0001'; end if;
      delete from public.crucible_artifacts where id = art2.id;
      update public.crucible_artifacts set level = level + 1 where id = art.id returning * into art;
      perform private.ench_event(e.id, 'fused', jsonb_build_object('artifact', art.kind, 'level', art.level));
      r := jsonb_build_object('artifact', private.cru_artifact_json(art));
    when 'mount' then
      select * into art from public.crucible_artifacts where id = (a ->> 'id')::bigint and player_id = e.owner_id for update;
      if art.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
      if art.kind in ('horseshoe', 'bell') then
        -- carried, three at most
        if not art.carried and (select count(*) from public.crucible_artifacts where player_id = e.owner_id and carried) >= 3 then raise exception 'hands_full' using errcode = 'P0001'; end if;
        update public.crucible_artifacts set carried = not carried, gx = null, gy = null where id = art.id returning * into art;
      else
        if a ? 'gx' then
          select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int;
          if p.owner_id is distinct from e.owner_id then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
          if exists (select 1 from public.crucible_artifacts where gx = p.gx and gy = p.gy and id <> art.id) then raise exception 'plot_has_artifact' using errcode = 'P0001'; end if;
          update public.crucible_artifacts set gx = p.gx, gy = p.gy, carried = false where id = art.id returning * into art;
        else
          update public.crucible_artifacts set gx = null, gy = null where id = art.id returning * into art;
        end if;
      end if;
      r := jsonb_build_object('artifact', private.cru_artifact_json(art));
    when 'tend' then
      -- the horseshoes you carry bring Luck once a day
      if s ->> 'tend_day' = v_day then raise exception 'already_today' using errcode = 'P0001'; end if;
      select coalesce(sum(1 + level), 0) into v_cnt from public.crucible_artifacts where player_id = e.owner_id and kind = 'horseshoe' and carried;
      if v_cnt = 0 then raise exception 'no_horseshoe' using errcode = 'P0001'; end if;
      v_lk := private.ench_give_luck(e.owner_id, v_cnt, 0);
      s := s || jsonb_build_object('tend_day', v_day);
      perform private.ench_event(e.id, 'tended', jsonb_build_object('luck', v_cnt));
      r := jsonb_build_object('luck', v_cnt, 'given', v_lk);
    when 'inlay' then
      v_m := a ->> 'metal';
      if v_m not in ('iron', 'copper', 'silver', 'gold', 'platinum', 'starsteel') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
      select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int;
      if p.owner_id is distinct from e.owner_id then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
      s := private.cru_spend(s, jsonb_build_object(v_m, (private.cru_recipes() ->> 'inlay')::int));
      insert into public.crucible_inlays (gx, gy, player_id, metal) values (p.gx, p.gy, e.owner_id, v_m)
      on conflict (gx, gy) do update set metal = excluded.metal, player_id = excluded.player_id, created_at = now();
      perform private.ench_event(e.id, 'inlaid', jsonb_build_object('metal', v_m, 'gx', p.gx, 'gy', p.gy));
      r := jsonb_build_object('inlay', jsonb_build_object('gx', p.gx, 'gy', p.gy, 'metal', v_m));
    when 'monument' then
      select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int;
      if p.owner_id is distinct from e.owner_id then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
      if not exists (select 1 from public.crucible_monuments where gx = p.gx and gy = p.gy)
         and (select count(*) from public.crucible_monuments where player_id = e.owner_id) >= 10 then raise exception 'too_many' using errcode = 'P0001'; end if;
      if jsonb_typeof(a -> 'metal') <> 'object' then raise exception 'invalid_action' using errcode = 'P0001'; end if;
      v_pts := 0;
      for k, v in select key, value::numeric from jsonb_each_text(a -> 'metal') loop
        if v < 0 or v <> floor(v) or not (private.cru_recipes() -> 'points' ? k) then raise exception 'invalid_action' using errcode = 'P0001'; end if;
        v_pts := v_pts + (v * (private.cru_recipes() -> 'points' ->> k)::int)::int;
      end loop;
      if v_pts <= 0 then raise exception 'invalid_action' using errcode = 'P0001'; end if;
      s := private.cru_spend(s, a -> 'metal');
      v_name := private.clean_plot_name(a ->> 'name');
      insert into public.crucible_monuments (gx, gy, player_id, name, points, tier) values (p.gx, p.gy, e.owner_id, v_name, v_pts, private.cru_tier(v_pts))
      on conflict (gx, gy) do update set points = public.crucible_monuments.points + excluded.points, name = coalesce(excluded.name, public.crucible_monuments.name),
                                         tier = private.cru_tier(public.crucible_monuments.points + excluded.points), updated_at = now()
      returning * into v_mon;
      update public.enchantments set stats = stats || jsonb_build_object('monument_tier', greatest(coalesce((stats ->> 'monument_tier')::int, 0), v_mon.tier)) where id = e.id;
      perform private.ench_event(e.id, 'monument', jsonb_build_object('gx', p.gx, 'gy', p.gy, 'points', v_mon.points, 'tier', v_mon.tier, 'name', v_mon.name));
      r := jsonb_build_object('monument', jsonb_build_object('gx', v_mon.gx, 'gy', v_mon.gy, 'points', v_mon.points, 'tier', v_mon.tier, 'name', v_mon.name));
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $function$;

CREATE OR REPLACE FUNCTION public.svc_finish_minigame(p_session_id uuid, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_s public.minigame_sessions%rowtype; v_cfg jsonb := private.cfg('minigames'); v_rw jsonb;
  v_elapsed numeric; v_flags text[]; v_valid boolean; v_passed boolean; v_score int; v_stars int;
  v_plot_level int; v_today int; v_mult numeric; v_ink_mult numeric; v_ink int := 0; v_pig int := 0; v_bp int := 0;
  v_held boolean := false; v_record jsonb; v_best_before int; v_rarity_mult numeric := 1; v_limit int; v_practice boolean := false;
  v_game jsonb; v_plot_record jsonb; v_cleared int := 0; v_total int := 1; v_per_round numeric; v_boost numeric := 1; v_table jsonb; v_bonus numeric := 0; v_mask jsonb; v_unlimited boolean;
  v_quality jsonb; v_bonus_res jsonb := jsonb_build_object('ink', 0, 'hits', '[]'::jsonb); v_perf numeric := 0; v_breakdown jsonb;
begin
  select * into v_s from public.minigame_sessions where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0001'; end if;
  if v_s.status <> 'active' then raise exception 'session_closed' using errcode = 'P0001', detail = v_s.status; end if;
  if now() > v_s.expires_at + interval '1 minute' then
    update public.minigame_sessions set status = 'expired', finished_at = now() where id = p_session_id;
    return jsonb_build_object('status', 'expired', 'passed', false, 'score', 0);
  end if;
  v_rw := v_cfg -> 'rewards';
  v_game := coalesce(v_cfg -> 'games' -> v_s.game, '{}'::jsonb);
  v_elapsed := extract(epoch from (now() - v_s.started_at)) * 1000;
  select coalesce(array_agg(f), '{}') into v_flags from jsonb_array_elements_text(coalesce(p_result -> 'flags', '[]'::jsonb)) f;
  v_valid := coalesce((p_result ->> 'valid')::boolean, false);
  if coalesce((p_result ->> 'min_duration_ms')::numeric, 0) > v_elapsed + 2000 then
    v_valid := false;
    v_flags := array_append(v_flags, 'faster_than_server_clock');
  end if;
  v_passed := v_valid and coalesce((p_result ->> 'passed')::boolean, false);
  v_score := case when v_valid then greatest(0, least(coalesce((p_result ->> 'score')::int, 0), 100000)) else 0 end;
  v_stars := case when v_passed then greatest(0, least(coalesce((p_result ->> 'stars')::int, 0), 3)) else 0 end;
  -- each cleared round pays its share of the level's Ink; clearing them all beats the level
  v_total := greatest(coalesce((p_result ->> 'rounds_total')::int, v_s.rounds, 1), 1);
  v_cleared := case when v_valid then least(greatest(coalesce((p_result ->> 'rounds_passed')::int, case when v_passed then v_total else 0 end), 0), v_total) else 0 end;
  -- a level is only beaten (and only pays Ink) when every round is cleared
  if v_passed and v_cleared < v_total then v_passed := false; v_stars := 0; end if;

  -- how well each round went (0-100), for bonus rules and the operator's stats
  v_quality := case when v_valid and jsonb_typeof(p_result -> 'rounds_quality') = 'array' then p_result -> 'rounds_quality' else '[]'::jsonb end;

  select best_score into v_best_before from public.minigame_records where player_id = v_s.player_id and game = v_s.game;
  update public.minigame_sessions
     set status = case when v_valid then 'validated' else 'rejected' end,
         finished_at = now(), score = v_score, passed = v_passed, stars = v_stars,
         summary = p_result -> 'summary', flags = v_flags, quality = v_quality,
         play_ms = case when v_valid then least(greatest(coalesce((p_result ->> 'min_duration_ms')::numeric, 0), 0), v_elapsed + 2000)::int end,
         review_status = case when v_valid and coalesce((p_result ->> 'suspicious')::boolean, false) then 'flagged' else 'none' end
   where id = p_session_id;

  insert into public.minigame_records (player_id, game, highest_level, best_score, total_score, plays, wins, last_played_at)
  values (v_s.player_id, v_s.game, case when v_passed then v_s.level else 0 end, v_score, v_score, 1,
          case when v_passed then 1 else 0 end, now())
  on conflict (player_id, game) do update set
    highest_level = greatest(public.minigame_records.highest_level, case when v_passed then v_s.level else 0 end),
    best_score = greatest(public.minigame_records.best_score, v_score),
    total_score = public.minigame_records.total_score + v_score,
    plays = public.minigame_records.plays + 1,
    wins = public.minigame_records.wins + case when v_passed then 1 else 0 end,
    last_played_at = now()
  returning jsonb_build_object('highest_level', highest_level, 'best_score', best_score, 'plays', plays, 'wins', wins) into v_record;

  -- every plot keeps its own level progress for its game (a new owner starts fresh)
  if v_s.gx is not null and v_s.puppet_id is null then
    insert into public.plot_game_progress (gx, gy, player_id, game, highest_level, best_score, plays, wins, updated_at)
    values (v_s.gx, v_s.gy, v_s.player_id, v_s.game, case when v_passed then v_s.level else 0 end, v_score, 1, case when v_passed then 1 else 0 end, now())
    on conflict (gx, gy, player_id) do update set
      game = excluded.game,
      highest_level = greatest(public.plot_game_progress.highest_level, excluded.highest_level),
      best_score = greatest(public.plot_game_progress.best_score, excluded.best_score),
      plays = public.plot_game_progress.plays + 1,
      wins = public.plot_game_progress.wins + excluded.wins,
      updated_at = now()
    returning jsonb_build_object('highest_level', highest_level, 'best_score', best_score, 'plays', plays, 'wins', wins) into v_plot_record;
  end if;

  if v_valid then
    select coalesce(wp.level, 1), coalesce(r.ink_reward_multiplier, 1) into v_plot_level, v_rarity_mult
    from public.world_plots wp left join public.plot_rarities r on r.id = wp.rarity
    where wp.gx = v_s.gx and wp.gy = v_s.gy and wp.owner_id = v_s.player_id;
    select count(*) into v_today from public.minigame_rewards mr join public.minigame_sessions ms on ms.id = mr.session_id
    where mr.player_id = v_s.player_id and ms.game = v_s.game and mr.ink > 0 and mr.created_at >= private.day_start(now());
    -- the operator can switch the daily cap on paid runs off entirely
    v_unlimited := private.ink_uncapped() or not coalesce((v_cfg ->> 'limit_paid_runs')::boolean, true);
    v_limit := case when v_unlimited then 2147483647 else coalesce((v_cfg ->> 'daily_rewarded_wins_per_game')::int, 6) end;
    v_mult := (1 + coalesce((v_game ->> 'plot_level_bonus')::numeric, (v_cfg ->> 'plot_level_bonus')::numeric, 0.05) * (coalesce(v_plot_level, 1) - 1)) * coalesce(v_rarity_mult, 1);
    -- a live boost on this game multiplies its Ink until it ends
    if v_game ? 'boost' and coalesce((v_game -> 'boost' ->> 'multiplier')::numeric, 1) > 1
       and (v_game -> 'boost' ->> 'ends_at' is null or (v_game -> 'boost' ->> 'ends_at')::timestamptz > now()) then
      v_boost := least((v_game -> 'boost' ->> 'multiplier')::numeric, 50);
    end if;
    v_ink_mult := v_mult * greatest(coalesce((v_cfg ->> 'ink_multiplier')::numeric, 1), 0)
                         * greatest(coalesce((v_cfg -> 'games' -> v_s.game ->> 'ink_multiplier')::numeric, 1), 0) * v_boost;
    -- level_ink[level] pays once, for completing the level (every round cleared);
    -- round_ink[round] pays for each round cleared, by its position (round 1, round 2, …)
    v_table := v_game -> 'level_ink';
    v_per_round := case when jsonb_typeof(v_table) = 'array' and jsonb_array_length(v_table) > 0
      then (v_table ->> (least(v_s.level, jsonb_array_length(v_table)) - 1))::numeric else 0 end;  -- (level-complete Ink)
    if v_passed and v_today < v_limit then
      v_mask := p_result -> 'rounds_mask';
      if jsonb_typeof(v_game -> 'round_ink') = 'array' then
        select coalesce(sum(coalesce((v_game -> 'round_ink' ->> (k - 1))::numeric, 0)), 0) into v_bonus
        from generate_series(1, v_total) k
        where case when jsonb_typeof(v_mask) = 'array' then coalesce((v_mask ->> (k - 1))::boolean, false) else k <= v_cleared end;
      end if;
      -- performance bonuses: tiers per round, every round above X%, N rounds above X%, average above X%
      v_bonus_res := private.bonus_ink(v_game -> 'bonuses', v_quality, v_mask, v_total, v_passed);
      v_perf := greatest(coalesce((v_bonus_res ->> 'ink')::numeric, 0), 0);
      v_ink := floor((greatest(coalesce(v_per_round, 0), 0) + greatest(v_bonus, 0) + v_perf) * v_ink_mult);
      -- hidden pacing: what's shown is what's paid
      v_ink := floor(v_ink * private.ench_minigame_mult(v_s.player_id, v_s.gx, v_s.gy))::int;
      v_ink := private.ink_pace(v_s.player_id, v_ink, 'minigame');
      if v_passed then
        v_bp := floor(((v_rw ->> 'brush_points_base')::numeric + (v_rw ->> 'brush_points_per_star')::numeric * v_stars) * least(v_mult, 1.5));
        v_pig := case when v_stars >= 3 then floor((v_rw ->> 'pigments_on_three_stars')::numeric * least(v_mult, 1.5)) else 0 end;
      else
        v_bp := (v_rw ->> 'fail_brush_points')::int;
      end if;
    elsif v_passed then
      v_practice := true;
      v_bp := (v_rw ->> 'fail_brush_points')::int;
    else
      v_bp := (v_rw ->> 'fail_brush_points')::int;
    end if;
    v_held := coalesce((p_result ->> 'suspicious')::boolean, false);
    if v_ink > 0 and private.ink_pace_factor() < 1 then
      v_ink_mult := v_ink_mult * private.ink_pace_factor();
    end if;
    v_breakdown := jsonb_build_object(
      'level_ink', case when v_passed and v_cleared > 0 and not v_practice then floor(greatest(coalesce(v_per_round, 0), 0) * v_ink_mult) else 0 end,
      'round_ink', case when v_practice or not v_passed then 0 else floor(greatest(v_bonus, 0) * v_ink_mult) end,
      'bonus_ink', case when v_practice or not v_passed then 0 else floor(v_perf * v_ink_mult) end,
      'bonuses', case when v_practice or not v_passed then '[]'::jsonb else coalesce(v_bonus_res -> 'hits', '[]'::jsonb) end,
      'multiplier', round(coalesce(v_ink_mult, 0), 3), 'rarity', coalesce(v_rarity_mult, 1), 'plot_level', coalesce(v_plot_level, 1), 'boost', v_boost,
      'capped', v_practice, 'rounds_cleared', v_cleared, 'rounds', v_total);
    insert into public.minigame_rewards (session_id, player_id, ink, pigments, brush_points, multiplier, held, breakdown)
    values (p_session_id, v_s.player_id, v_ink, v_pig, v_bp, round(v_ink_mult, 3), v_held, v_breakdown);
    if v_held then
      insert into public.moderation_cases (kind, priority, session_id, subject_player_id, reason, details)
      values ('score_review', 2, p_session_id, v_s.player_id, 'suspicious_minigame_result',
              jsonb_build_object('flags', v_flags, 'score', v_score, 'game', v_s.game, 'level', v_s.level));
    else
      perform set_config('landvas.ink_paced', '1', true);
      perform private.grant(v_s.player_id, jsonb_build_object('ink', v_ink, 'pigments', v_pig, 'brush_points', v_bp),
                            'minigame', 'minigame_session', p_session_id::text, 'minigame:' || p_session_id::text);
      perform set_config('landvas.ink_paced', '', true);
      if v_ink > 0 then perform private.referral_qualify(v_s.player_id, 'first_win'); end if;
      -- the live feed: a cleared level (at most one minigame event per player every few minutes)
      if v_passed and not exists (select 1 from public.feed_events f where f.player_id = v_s.player_id and f.kind = 'minigame'
                                  and f.created_at > now() - interval '3 minutes') then
        insert into public.feed_events (kind, player_id, data)
        values ('minigame', v_s.player_id, jsonb_build_object('game', v_s.game, 'level', v_s.level, 'stars', v_stars));
      end if;
    end if;
  end if;

  -- 🎭 a puppet run: the owner is tipped, the Puppeteer paid
  if v_s.puppet_id is not null and v_valid then perform private.puppet_done(v_s.id, v_ink, v_passed, v_score); end if;
  -- ✍️ a glyph can turn up in a won run
  if v_valid and v_passed then perform private.glyph_drop(v_s.player_id, 'minigame', 0.05); end if;
  return jsonb_build_object(
    'status', case when v_valid then 'validated' else 'rejected' end,
    'valid', v_valid, 'passed', v_passed, 'score', v_score, 'stars', v_stars, 'flags', to_jsonb(v_flags),
    'new_best', v_score > coalesce(v_best_before, 0),
    'rewards', jsonb_build_object('ink', v_ink, 'pigments', v_pig, 'brush_points', v_bp, 'held', v_held,
                                  'multiplier', round(coalesce(v_ink_mult, 0), 3), 'practice', v_practice,
                                  'rounds_cleared', v_cleared, 'rounds', v_total, 'level_ink', case when v_passed then floor(coalesce(v_per_round, 0) * v_ink_mult) else 0 end, 'boost', v_boost,
                                  'rewarded_left', case when v_unlimited then null else greatest(coalesce(v_limit, 0) - coalesce(v_today, 0) - case when v_ink > 0 then 1 else 0 end, 0) end,
                                  'unlimited', coalesce(v_unlimited, false), 'round_ink', case when v_ink > 0 then floor(v_bonus * coalesce(v_ink_mult, 1)) else 0 end,
                                  'bonus_ink', case when v_ink > 0 then floor(v_perf * coalesce(v_ink_mult, 1)) else 0 end, 'bonuses', case when v_ink > 0 then coalesce(v_bonus_res -> 'hits', '[]'::jsonb) else '[]'::jsonb end,
                                  'quality', v_quality,
                                  'resets_at', private.day_start(now()) + interval '1 day'),
    'record', v_record,
    'plot_record', v_plot_record,
    'balances', private.balances(v_s.player_id),
    'achievements', private.evaluate_achievements(v_s.player_id));
end $function$;

CREATE OR REPLACE FUNCTION private.ench_act_shard(e enchantments, p_action text, a jsonb, t timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare s jsonb := e.state; v_now numeric := private.ench_ep(t); r jsonb; v_o jsonb; v_pick jsonb; v_cracks int; v_lk jsonb; v_shat boolean := false;
begin
  case p_action
    when 'gaze' then
      if coalesce((s -> 'reflect' ->> 'until')::numeric, 0) > v_now then raise exception 'reflecting' using errcode = 'P0001'; end if;
      if coalesce((s ->> 'gazed_at')::numeric, 0) + private.ench_n('shard', 'cooldown_h', 20) * 3600 * (case when e.stars >= 2 then 0.6 else 1 end) > v_now and jsonb_array_length(coalesce(s -> 'options', '[]'::jsonb)) = 0 then
        raise exception 'too_soon' using errcode = 'P0001'; end if;
      if jsonb_array_length(coalesce(s -> 'options', '[]'::jsonb)) = 0 then
        -- three other players' enchantments (one per kind), else dreams of kinds
        select coalesce(jsonb_agg(o.j), '[]'::jsonb) into v_o from (
          select jsonb_build_object('kind', x.kind, 'id', x.id, 'serial', x.serial, 'owner', x.owner_id, 'owner_name', pr.username, 'level', x.level) j
            from (select distinct on (kind) * from public.enchantments where status = 'active' and owner_id is not null and owner_id <> e.owner_id
                   and kind not in ('splice', 'shard', 'wormhole', 'oracle', 'ouroboros', 'homunculus', 'stormcoil', 'origami', 'crucible', 'cuckoo') order by kind, random()) x join public.profiles pr on pr.id = x.owner_id
           order by random() limit 3) o;
        while jsonb_array_length(v_o) < 3 loop
          v_o := v_o || jsonb_build_array(jsonb_build_object('kind', (array['goose', 'genie', 'map', 'parasite', 'spyglass', 'pandora', 'clockwork', 'sizeray'])[1 + floor(random() * 8)::int], 'dream', true));
        end loop;
        s := s || jsonb_build_object('options', v_o, 'gazed_at', v_now);
      end if;
      r := jsonb_build_object('options', s -> 'options');
    when 'step' then
      v_pick := s -> 'options' -> ((a ->> 'i')::int);
      if v_pick is null then raise exception 'not_found' using errcode = 'P0001'; end if;
      v_cracks := coalesce((s ->> 'cracks')::int, 0) + 1;
      s := s || jsonb_build_object('reflect', v_pick || jsonb_build_object('until', v_now + private.ench_n('shard', 'hours', 24) * 3600 * case when e.stars >= 1 then 1.5 else 1 end, 'from', v_now),
                                   'r', private.ench_init(v_pick ->> 'kind', t), 'options', '[]'::jsonb, 'cracks', v_cracks);
      if v_pick ->> 'owner' is not null then
        perform private.grant_ink_paced((v_pick ->> 'owner')::uuid, 3, 'enchantment', 'mirror_tip', e.id::text, null);
        perform private.notify((v_pick ->> 'owner')::uuid, 'enchant', e.owner_id, jsonb_build_object('sub', 'mirror_seen', 'kind', v_pick ->> 'kind', 'ink', 3));
      end if;
      perform private.ench_stat(e.id, 'reflections');
      perform private.ench_xp(e.id, 1);
      perform private.ench_event(e.id, 'reflect', jsonb_build_object('kind', v_pick ->> 'kind', 'owner', v_pick ->> 'owner_name'));
      if v_cracks >= 7 then
        v_shat := true; v_lk := private.ench_give_luck(e.owner_id, 20, 1);
        s := s || jsonb_build_object('cracks', 0);
        perform private.ench_stat(e.id, 'shatters');
        perform private.ench_event(e.id, 'shatter', '{}'::jsonb);
        insert into public.feed_events (kind, player_id, data) values ('enchant', e.owner_id, jsonb_build_object('sub', 'shatter', 'kind', 'shard', 'serial', e.serial));
      end if;
      r := jsonb_build_object('reflect', s -> 'reflect', 'shattered', v_shat);
    when 'release' then
      if coalesce((s -> 'reflect' ->> 'until')::numeric, 0) <= v_now then raise exception 'not_reflecting' using errcode = 'P0001'; end if;
      s := s || jsonb_build_object('reflect', null, 'r', null);
      r := jsonb_build_object('released', true);
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  return jsonb_build_object('state', s, 'result', r);
end $function$;

CREATE OR REPLACE FUNCTION private.ench_titles(e enchantments)
 RETURNS text[]
 LANGUAGE sql
 STABLE
AS $function$
  select array_remove(array[
    case when e.level >= 5 then 'Awakened' end, case when e.level >= 10 then 'Ascended' end,
    case when e.stars >= 1 then 'Starlit' end, case when e.stars >= 2 then 'Starforged' end, case when e.stars >= 3 then 'Supernova' end,
    case when e.kind = 'goose' and coalesce((e.stats ->> 'foxes')::int, 0) >= 10 then 'Fox-Bane' end,
    case when e.kind = 'goose' and coalesce((e.stats ->> 'eggs')::int, 0) >= 25 then 'Golden Hen' end,
    case when e.kind = 'goose' and coalesce((e.stats ->> 'best_streak')::int, 0) >= 7 then 'Unbroken' end,
    case when e.kind = 'goose' and coalesce((e.stats ->> 'platinum')::int, 0) >= 1 then 'Platinum' end,
    case when e.kind = 'genie' and coalesce((e.stats ->> 'forbidden')::int, 0) >= 1 then 'Forbidden' end,
    case when e.kind = 'genie' and coalesce((e.stats ->> 'wishes')::int, 0) >= 30 then 'Wishmaster' end,
    case when e.kind = 'genie' and coalesce((e.stats ->> 'freed')::int, 0) >= 1 then 'Liberator' end,
    case when e.kind = 'map' and coalesce((e.stats ->> 'maps')::int, 0) >= 5 then 'Cartographer' end,
    case when e.kind = 'map' and coalesce((e.stats ->> 'pieces')::int, 0) >= 40 then 'Pathfinder' end,
    case when e.kind = 'parasite' and coalesce((e.state ->> 'stage')::int, 0) >= 2 then 'Symbiote' end,
    case when e.kind = 'parasite' and coalesce((e.stats ->> 'feeds')::int, 0) >= 25 then 'Devourer' end,
    case when e.kind = 'pandora' and coalesce((e.stats ->> 'hope')::int, 0) >= 1 then 'Hope-Bringer' end,
    case when e.kind = 'splice' and coalesce((e.stats ->> 'splices')::int, 0) >= 10 then 'Mad Scientist' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'codex', '[]'::jsonb)) >= 36 then 'Chimera Codex' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'codex', '[]'::jsonb)) >= 55 then 'Grand Codex' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'codex', '[]'::jsonb)) >= private.ench_hybrid_count() then 'Codex Complete' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'aberrations', '[]'::jsonb)) >= 1 then 'Aberrant' end,
    case when e.kind = 'splice' and jsonb_array_length(coalesce(e.state -> 'trinities', '[]'::jsonb)) >= 3 then 'Trinitarian' end,
    case when e.kind = 'clockwork' and coalesce((e.stats ->> 'winds')::int, 0) >= 100 then 'Timekeeper' end,
    case when e.kind = 'clockwork' and coalesce((e.stats ->> 'freezes')::int, 0) >= 10 then 'Stopwatch' end,
    case when e.kind = 'sizeray' and coalesce((e.stats ->> 'perfects')::int, 0) >= 10 then 'Sharpshooter' end,
    case when e.kind = 'sizeray' and coalesce((e.stats ->> 'fired')::int, 0) >= 50 then 'Big Bang' end,
    case when e.kind = 'sizeray' and coalesce((e.stats ->> 'grown')::int, 0) >= 10 then 'Colossus' end,
    case when e.kind = 'sizeray' and coalesce((e.stats ->> 'shrunk')::int, 0) >= 10 then 'Ant-Maker' end,
    case when e.kind = 'sizeray' and coalesce((e.stats ->> 'pranks')::int, 0) >= 10 then 'Prankster' end,
    case when e.kind = 'shard' and coalesce((e.stats ->> 'shatters')::int, 0) >= 1 then 'Seven Years' end,
    case when e.kind = 'shard' and coalesce((e.stats ->> 'reflections')::int, 0) >= 20 then 'Many Faces' end,
    case when e.kind = 'wormhole' and coalesce((e.stats ->> 'opens')::int, 0) >= 5 then 'Gatekeeper' end,
    case when e.kind = 'wormhole' and coalesce((e.stats ->> 'far_km')::numeric, 0) >= 1000 then 'Worldwalker' end,
    case when e.kind = 'wormhole' and e.level >= 10 then 'Constellation' end,
    case when e.kind = 'oracle' and coalesce((e.stats ->> 'fulfilled')::int, 0) >= 10 then 'Seer' end,
    case when e.kind = 'oracle' and coalesce((e.stats ->> 'rewrites')::int, 0) >= 10 then 'Fate-Weaver' end,
    case when e.kind = 'ouroboros' and coalesce((e.stats ->> 'circles')::int, 0) >= 1 then 'Eternal' end,
    case when e.kind = 'ouroboros' and coalesce((e.stats ->> 'clean')::int, 0) >= 10 then 'Tail-Catcher' end,
    case when e.kind = 'ouroboros' and coalesce((e.stats ->> 'bites')::int, 0) >= 3 then 'Snakeskin' end,
    case when e.kind = 'homunculus' and coalesce((e.stats ->> 'wakes')::int, 0) >= 1 then 'Alchemist' end,
    case when e.kind = 'homunculus' and coalesce((e.stats ->> 'hearts')::int, 0) >= 3 then 'Generations' end,
    case when e.kind = 'homunculus' and coalesce((e.stats ->> 'max_parts')::int, 0) >= 7 then 'Many Limbs' end,
    case when e.kind = 'stormcoil' and coalesce((e.stats ->> 'storms')::int, 0) >= 10 then 'Stormcaller' end,
    case when e.kind = 'stormcoil' and coalesce((e.stats ->> 'bolts')::int, 0) >= 50 then 'Lightning Hands' end,
    case when e.kind = 'stormcoil' and coalesce((e.stats ->> 'aberrations')::int, 0) >= 1 then 'Galvanist' end,
    case when e.kind = 'spyglass' and coalesce((e.stats ->> 'looks')::int, 0) >= 50 then 'Eagle-Eye' end,
    case when e.kind = 'spyglass' and coalesce((e.stats ->> 'claimed')::int, 0) >= 10 then 'Prospector' end,
    case when e.kind = 'spyglass' and coalesce((e.stats ->> 'grand')::int, 0) >= 1 then 'Far-Seer' end,
    case when e.kind = 'origami' and coalesce((e.stats ->> 'unfolds')::int, 0) >= 10 then 'Paper Crane' end,
    case when e.kind = 'origami' and coalesce((e.stats ->> 'unfolds')::int, 0) >= 100 then 'Thousand Cranes' end,
    case when e.kind = 'origami' and coalesce((e.stats ->> 'far_km')::numeric, 0) >= 100 then 'Far-Folder' end,
    case when e.kind = 'crucible' and coalesce((e.stats ->> 'melts')::int, 0) >= 25 then 'Smelter' end,
    case when e.kind = 'crucible' and coalesce((e.stats ->> 'wins')::int, 0) >= 5 then 'Forgemaster' end,
    case when e.kind = 'crucible' and coalesce((e.stats ->> 'monument_tier')::int, 0) >= 3 then 'Monument Maker' end,
    case when e.kind = 'puppeteer' and coalesce((e.stats ->> 'shows')::int, 0) >= 10 then 'Marionettist' end,
    case when e.kind = 'puppeteer' and coalesce((e.stats ->> 'wins')::int, 0) >= 50 then 'Grand Puppeteer' end,
    case when e.kind = 'puppeteer' and (select count(*) from jsonb_object_keys(coalesce(e.stats -> 'repertoire', '{}'::jsonb))) >= greatest(6, (select count(distinct t.minigame) from public.plot_types t where t.minigame is not null and t.weight > 0)) then 'Repertoire' end,
    case when e.kind = 'deck' and coalesce((e.stats ->> 'draws')::int, 0) >= 30 then 'Card Sharp' end,
    case when e.kind = 'deck' and coalesce((e.stats ->> 'foils')::int, 0) >= 3 then 'Gilded Hand' end,
    case when e.kind = 'deck' and coalesce((e.stats ->> 'complete')::boolean, false) then 'Fate-Weaver' end,
    case when e.kind = 'glyph' and coalesce((e.stats ->> 'casts')::int, 0) >= 25 then 'Scribe' end,
    case when e.kind = 'glyph' and jsonb_array_length(coalesce(e.state -> 'known', '[]'::jsonb)) >= 20 then 'Spellwright' end,
    case when e.kind = 'glyph' and coalesce(e.state -> 'known', '[]'::jsonb) ?| array['rune', 'phoenix', 'void', 'omega'] then 'Keeper of Secrets' end], null)
$function$;

CREATE OR REPLACE FUNCTION private.lev_move(p_kind text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (('{"goose": ["Egg Bomb", 1.0, 1.0, null], "genie": ["Wish of Ruin", 0.4, 2.4, null], "map": ["Buried Cannon", 1.1, 1.1, null],
            "parasite": ["Leech", 1.0, 1.0, null], "pandora": ["Unleash an Evil", 0.5, 2.0, null],
            "splice": ["Chimera Strike", 1.3, 1.3, null], "clockwork": ["Freeze Time", 0.4, 0.4, "freeze"], "sizeray": ["Shrink Ray", 0.4, 0.4, "shrink"],
            "shard": ["Reflect the Roar", 1.2, 1.2, null], "wormhole": ["Pull Through", 0.6, 0.6, "pull"], "oracle": ["Foretell the Weak Spot", 0.4, 0.4, "foretell"],
            "ouroboros": ["Constrict", 0.8, 1.6, null], "homunculus": ["Patchwork Punch", 0.5, 2.0, null], "stormcoil": ["Lightning Strike", 1.0, 1.8, null],
            "spyglass": ["Weak Spot", 0.4, 0.4, "weakspot"], "origami": ["Paper Shield", 0.6, 0.6, "shield"], "crucible": ["Molten Pour", 1.1, 2.1, null],
            "puppeteer": ["Tangle", 0.5, 0.5, "tangle"], "deck": ["The Tower", 1.0, 5.0, null], "glyph": ["Thunder Glyph", 0.6, 2.6, "glyph"]}'::jsonb) -> p_kind)
$function$;

CREATE OR REPLACE FUNCTION private.lev_mult(l leviathans)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  select (case when l.shrunk_until > now() then 1.5 else 1 end) * (case when l.foretold_until > now() then 1.25 else 1 end) * (case when l.weakspot_until > now() then 2 else 1 end)
$function$;

CREATE OR REPLACE FUNCTION public.leviathan_hit(p_move text, p_n integer DEFAULT 1, p_enchant uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := private.require_active_player(); l public.leviathans; lp public.leviathan_players; v_bank numeric; v_n int; v_dmg bigint := 0; i int; e public.enchantments;
  m jsonb; v_lab text; v_emoji text := '💣'; v_cd numeric := private.lev_n('move_cd_h', 3) * 3600; v_eff text; v_before bigint; v_name text; v_p jsonb; v_missed int := 0;
  v_miss numeric := private.lev_n('tiny_miss', 0.5);
begin
  perform private.rate_limit('leviathan_hit', 1500, 3600);
  select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1 for update;
  if l.id is null then raise exception 'no_leviathan' using errcode = 'P0001'; end if;
  if l.status = 'warning' then raise exception 'not_risen' using errcode = 'P0001'; end if;
  insert into public.leviathan_players (lev_id, player_id, bombs, bombs_at) values (l.id, v_uid, private.lev_n('bombs_max', 60), now()) on conflict do nothing;
  select * into lp from public.leviathan_players where lev_id = l.id and player_id = v_uid for update;
  -- hidden: only those who've found it can hit it (the Oracle Eye can reveal it to everyone)
  if private.lev_hidden(l) and not private.lev_spotted(l, v_uid)
     and not (p_move = 'enchant' and exists (select 1 from public.enchantments x where x.id = p_enchant and x.owner_id = v_uid and x.kind = 'oracle')) then
    raise exception 'lev_hidden' using errcode = 'P0001';
  end if;
  if p_move = 'bomb' then
    v_bank := least(private.lev_n('bombs_max', 60), lp.bombs + extract(epoch from now() - lp.bombs_at) / greatest(private.lev_n('bomb_regen_s', 60), 1));
    v_n := least(greatest(coalesce(p_n, 1), 1), 10, floor(v_bank)::int);
    if v_n < 1 then raise exception 'no_bombs' using errcode = 'P0001'; end if;
    for i in 1 .. v_n loop
      -- a tiny Leviathan is hard to hit
      if private.lev_tiny(l) and random() < v_miss then v_missed := v_missed + 1;
      else v_dmg := v_dmg + 80 + floor(random() * 41)::int; end if;
    end loop;
    v_dmg := round(v_dmg * private.lev_mult(l) * private.lev_player_mult(v_uid));
    update public.leviathan_players set bombs = v_bank - v_n, bombs_at = now() where lev_id = l.id and player_id = v_uid;
    v_lab := case when v_n = 1 then 'an ink bomb' else v_n || ' ink bombs' end || case when v_missed > 0 then ' (' || v_missed || ' missed — it’s tiny)' else '' end;
  elsif p_move = 'enchant' then
    select * into e from public.enchantments where id = p_enchant and owner_id = v_uid and status = 'active';
    if e.id is null then raise exception 'bad_target' using errcode = 'P0001'; end if;
    if coalesce((lp.moves ->> e.id::text)::numeric, 0) + v_cd > extract(epoch from now()) then raise exception 'too_soon' using errcode = 'P0001'; end if;
    m := private.lev_move(e.kind);
    if m is null then raise exception 'hatch_first' using errcode = 'P0001'; end if;
    v_dmg := round((2500 + 400 * e.level) * ((m ->> 1)::numeric + (case when m ->> 3 = 'glyph' then coalesce(nullif(current_setting('landvas.lev_acc', true), '')::numeric, 0) else random() end) * ((m ->> 2)::numeric - (m ->> 1)::numeric)) * private.lev_mult(l) * private.lev_player_mult(v_uid));
    v_eff := m ->> 3;
    case v_eff
      when 'freeze' then perform private.lev_pause(l.id, 600);
      when 'decoy' then perform private.lev_pause(l.id, 300);
      when 'pull' then perform private.lev_pause(l.id, 300);
      -- 🔭 Weak Spot: everyone's hits do ×2 for 10 seconds
      when 'weakspot' then update public.leviathans set weakspot_until = greatest(coalesce(weakspot_until, now()), now()) + interval '10 seconds' where id = l.id;
      -- 🦢 Paper Shield: your plots fold out of its path (no trampling them for 6 hours)
      when 'shield' then
        insert into public.enchant_buffs (player_id, kind, enchant_id, mult, data, expires_at) values (v_uid, 'paper_shield', e.id, 1, '{}'::jsonb, now() + interval '6 hours');
        perform private.lev_pause(l.id, 120);
      -- 🎭 Tangle: the strings hold it back
      when 'tangle' then perform private.lev_pause(l.id, 600);
      when 'shrink' then
        if private.lev_tiny(l) then
          -- a tiny Leviathan: the Size Ray blows it back up to its size (and it can be hit again)
          update public.leviathans set tiny_until = null where id = l.id; v_eff := 'grow';
        else update public.leviathans set shrunk_until = greatest(coalesce(shrunk_until, now()), now()) + interval '10 minutes' where id = l.id; end if;
      when 'foretell' then
        update public.leviathans set foretold_until = greatest(coalesce(foretold_until, now()), now()) + interval '10 minutes' where id = l.id;
        if private.lev_hidden(l) then update public.leviathans set hidden_until = null where id = l.id; v_eff := 'reveal'; end if;
      else null;
    end case;
    update public.leviathan_players set moves = moves || jsonb_build_object(e.id::text, extract(epoch from now())) where lev_id = l.id and player_id = v_uid;
    v_p := private.ench_partner(e.id);
    v_name := coalesce(v_p ->> 'hybrid', e.nickname, (private.ench_info(e.kind) ->> 'name'));
    v_lab := v_name || ' · ' || (m ->> 0) || case v_eff when 'reveal' then ' — and showed everyone where it hides' when 'grow' then ' — and blew it back up to size' when 'weakspot' then ' — everyone hits ×2 for 10 s!' when 'shield' then ' — their plots folded out of its path' when 'tangle' then ' — tangled in the strings' when 'glyph' then ' (drawn ' || round(coalesce(nullif(current_setting('landvas.lev_acc', true), '')::numeric, 0) * 100) || '%)' else '' end;
    v_emoji := private.ench_info(e.kind) ->> 'emoji';
    perform private.ench_xp(e.id, 1);
    perform private.ench_event(e.id, 'leviathan', jsonb_build_object('move', m ->> 0, 'dmg', v_dmg));
  else raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  select * into l from public.leviathans where id = l.id for update;
  v_before := l.hp;
  v_dmg := least(v_dmg, l.hp);
  update public.leviathans set hp = hp - v_dmg where id = l.id returning * into l;
  update public.leviathan_players set dmg = dmg + v_dmg, hits = hits + case when v_dmg > 0 then 1 else 0 end where lev_id = l.id and player_id = v_uid;
  if v_dmg > 0 or p_move = 'enchant' then
    insert into public.leviathan_hits (lev_id, player_id, move, label, emoji, dmg) values (l.id, v_uid, p_move, v_lab, v_emoji, v_dmg);
  end if;
  -- (the feed keeps its last 400 hits)
  if random() < 0.02 then delete from public.leviathan_hits where lev_id = l.id and id < (select id from public.leviathan_hits where lev_id = l.id order by id desc offset 400 limit 1); end if;
  if l.hp <= 0 then perform private.lev_fall(l.id);
  elsif (v_before > l.hp_max * 0.5 and l.hp <= l.hp_max * 0.5) or (v_before > l.hp_max * 0.1 and l.hp <= l.hp_max * 0.1) then perform private.lev_phase(l.id);
  end if;
  return jsonb_build_object('dmg', v_dmg, 'effect', v_eff, 'label', v_lab, 'fell', l.hp <= 0, 'missed', v_missed) || public.leviathan_state(false);
end $function$;

CREATE OR REPLACE FUNCTION private.lev_state(p_uid uuid, p_reveal boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare v_uid uuid := p_uid; l public.leviathans; v_last public.leviathans; lp public.leviathan_players; v_me jsonb; v_moves jsonb; v_bank numeric;
  v_hide boolean := false; v_pos jsonb; v_haze jsonb; v_lev jsonb;
begin
  select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1;
  select * into v_last from public.leviathans where status in ('fallen', 'escaped') order by ended_at desc nulls last limit 1;
  if v_uid is not null and l.id is not null then
    select * into lp from public.leviathan_players where lev_id = l.id and player_id = v_uid;
    v_bank := least(private.lev_n('bombs_max', 60), coalesce(lp.bombs, private.lev_n('bombs_max', 60)) + case when lp.lev_id is null then 0 else extract(epoch from now() - lp.bombs_at) / greatest(private.lev_n('bomb_regen_s', 60), 1) end);
    select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'serial', e.serial, 'level', e.level, 'sigil', e.sigil,
             'name', coalesce(private.ench_partner(e.id) ->> 'hybrid', e.nickname, (private.ench_info(e.kind) ->> 'name') || ' #' || e.serial),
             'move', private.lev_move(e.kind) ->> 0, 'effect', private.lev_move(e.kind) ->> 3,
             'dmg', round((2500 + 400 * e.level) * ((private.lev_move(e.kind) ->> 1)::numeric + (private.lev_move(e.kind) ->> 2)::numeric) / 2),
             'ready_in', greatest(0, round(coalesce((lp.moves ->> e.id::text)::numeric, 0) + private.lev_n('move_cd_h', 3) * 3600 - extract(epoch from now()))))
             order by e.born_at), '[]'::jsonb)
      into v_moves from public.enchantments e where e.owner_id = v_uid and e.status = 'active';
    v_me := jsonb_build_object('dmg', coalesce(lp.dmg, 0), 'hits', coalesce(lp.hits, 0), 'bombs', floor(v_bank), 'bombs_max', private.lev_n('bombs_max', 60),
      'bomb_regen_s', private.lev_n('bomb_regen_s', 60), 'next_bomb_in', case when v_bank < private.lev_n('bombs_max', 60) then round((1 - (v_bank - floor(v_bank))) * private.lev_n('bomb_regen_s', 60)) end,
      'moves', v_moves,
      'rank', case when coalesce(lp.dmg, 0) > 0 then (select count(*) + 1 from public.leviathan_players x where x.lev_id = l.id and x.dmg > lp.dmg) end,
      'trampled', (select count(*) from public.leviathan_trampled t where t.lev_id = l.id and t.owner_id = v_uid and t.until > now() and t.scrubbed_at is null),
      'spotted', coalesce(lp.spotted_at > now() - interval '15 minutes', false));
  end if;
  if l.id is not null then
    v_pos := private.lev_pos(l, now());
    v_hide := private.lev_hidden(l) and l.status <> 'warning' and not p_reveal and not (v_uid is not null and private.lev_spotted(l, v_uid));
    if v_hide then v_haze := private.lev_haze(l, v_pos); end if;
    v_lev := jsonb_build_object('id', l.id, 'gen', l.gen, 'status', l.status, 'strength', l.strength, 'hp', l.hp, 'hp_max', l.hp_max,
             'path', case when v_hide then null else l.path end, 'path_km', l.path_km, 'speed_kmh', l.speed_kmh, 'base_kmh', private.lev_base(l),
             'walk_s', l.walk_s, 'walk_at', l.walk_at, 'pause_until', l.pause_until,
             'rise_at', l.rise_at, 'spawned_at', l.spawned_at, 'origin', l.origin, 'exit_sea', l.exit_sea,
             'place', case when v_hide then v_haze ->> 'place' else l.place end,
             'trail', case when v_hide then coalesce((select jsonb_agg(t order by i) from jsonb_array_elements(l.trail) with ordinality x(t, i) where i <= coalesce(l.hidden_trail, 0)), '[]'::jsonb) else l.trail end,
             'shrunk_until', l.shrunk_until, 'foretold_until', l.foretold_until, 'weakspot_until', case when l.weakspot_until > now() then l.weakspot_until end, 'roar_at', l.roar_at,
             'target', case when v_hide then null else l.data -> 'target' end, 'targets', case when v_hide then null else l.data -> 'targets' end, 'cities', l.data -> 'cities',
             'tiny_until', case when private.lev_tiny(l) then l.tiny_until end, 'hidden_until', case when private.lev_hidden(l) then l.hidden_until end,
             'rampage_until', case when l.rampage_until > now() then l.rampage_until end,
             'hidden', v_hide, 'haze', v_haze,
             'roam', coalesce((l.data ->> 'roam')::boolean, (private.lev_cfg() ->> 'roam')::boolean, true), 'retreat', coalesce((l.data ->> 'retreat')::boolean, false),
             'pos', case when v_hide then v_haze || jsonb_build_object('km', 0, 'seg', 0, 'heading', 0, 'done', false, 'paused', false, 'haze', true) else v_pos end,
             'fighters', (select count(*) from public.leviathan_players where lev_id = l.id and dmg > 0));
    if p_reveal then v_lev := v_lev || jsonb_build_object('next_power_at', l.data -> 'next_power_at', 'cruise_kmh', l.data -> 'cruise_kmh', 'true_place', l.place); end if;
  end if;
  return jsonb_build_object(
    'server_time', now(),
    'lev', v_lev,
    'feed', case when l.id is not null then coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'name', pr.username, 'label', h.label, 'emoji', h.emoji, 'dmg', h.dmg, 'at', h.created_at, 'move', h.move) order by h.id desc)
             from (select * from public.leviathan_hits where lev_id = l.id order by id desc limit 25) h left join public.profiles pr on pr.id = h.player_id), '[]'::jsonb) end,
    'top', case when l.id is not null then coalesce((select jsonb_agg(jsonb_build_object('player', private.profile_json(x.player_id), 'dmg', x.dmg, 'me', x.player_id = v_uid) order by x.dmg desc)
             from (select * from public.leviathan_players where lev_id = l.id and dmg > 0 order by dmg desc limit 10) x), '[]'::jsonb) end,
    'me', v_me,
    'last', case when v_last.id is not null then jsonb_build_object('id', v_last.id, 'gen', v_last.gen, 'status', v_last.status, 'ended_at', v_last.ended_at, 'place', v_last.place,
             'hp', v_last.hp, 'hp_max', v_last.hp_max, 'strength', v_last.strength, 'exit_sea', v_last.exit_sea,
             'fighters', (select count(*) from public.leviathan_players where lev_id = v_last.id and dmg > 0),
             'top', (select jsonb_agg(jsonb_build_object('player', private.profile_json(x.player_id), 'dmg', x.dmg) order by x.dmg desc)
                      from (select * from public.leviathan_players where lev_id = v_last.id and dmg > 0 order by dmg desc limit 3) x),
             'loot', (select jsonb_build_object('loot', loot, 'seen', loot_seen, 'dmg', dmg) from public.leviathan_players where lev_id = v_last.id and player_id = v_uid)) end,
    'next_at', case when l.id is null and coalesce((private.lev_cfg() ->> 'enabled')::boolean, true) then private.lev_next_at() end,
    'bones', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'gen', b.gen, 'lng', b.lng, 'lat', b.lat, 'at', b.fallen_at, 'place', b.place, 'players', b.players, 'top', b.top_name) order by b.id)
             from (select * from public.leviathan_bones order by id desc limit 100) b), '[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION private.lev_loot(l leviathans, p_fell boolean)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare v_tot numeric; v_pool numeric := l.hp_max / greatest(private.lev_n('loot_pool_div', 100), 1); p record; v_ink int; v_paid int; v_top int; v_loot jsonb; v_lk jsonb; v_tk uuid; v_n int;
begin
  select coalesce(sum(dmg), 0), count(*) into v_tot, v_n from public.leviathan_players where lev_id = l.id and dmg > 0;
  v_top := greatest(1, ceil(v_n * 0.1)::int);
  for p in select lp.*, row_number() over (order by lp.dmg desc) rk from public.leviathan_players lp where lp.lev_id = l.id and lp.dmg > 0 loop
    v_tk := null;
    if p_fell then
      v_ink := least(private.lev_n('loot_cap', 1500), private.lev_n('loot_base', 25) + round(v_pool * p.dmg / greatest(v_tot, 1)))::int;
      v_loot := jsonb_build_object('fell', true, 'rank', p.rk, 'share', round(p.dmg * 100.0 / greatest(v_tot, 1), 2));
      if p.dmg >= v_tot * 0.01 then v_lk := private.ench_give_luck(p.player_id, 0, 1); v_loot := v_loot || jsonb_build_object('enchant', 1); end if;
      if p.dmg >= v_tot * 0.01 and private.glyph_drop(p.player_id, 'leviathan', 0.35) is not null then v_loot := v_loot || jsonb_build_object('glyph', true); end if;
      if p.rk = 1 then v_tk := private.ench_ticket(p.player_id, 'legendary', 'leviathan'); v_loot := v_loot || jsonb_build_object('ticket', 'legendary');
      elsif p.rk <= v_top then v_tk := private.ench_ticket(p.player_id, 'epic', 'leviathan'); v_loot := v_loot || jsonb_build_object('ticket', 'epic'); end if;
    else
      v_ink := 10;
      v_loot := jsonb_build_object('fell', false, 'rank', p.rk, 'share', round(p.dmg * 100.0 / greatest(v_tot, 1), 2));
    end if;
    v_paid := private.grant_ink_paced(p.player_id, v_ink, 'leviathan', 'leviathan', l.id::text, 'lev:' || l.id || ':' || p.player_id);
    v_loot := v_loot || jsonb_build_object('ink', v_paid);
    update public.leviathan_players set loot = v_loot where lev_id = l.id and player_id = p.player_id;
    perform private.notify(p.player_id, 'leviathan', null, jsonb_build_object('sub', case when p_fell then 'fallen' else 'escaped' end, 'gen', l.gen) || v_loot);
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.seek_chest_dig(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := private.require_active_player(); c public.seek_chests; v_paid int;
begin
  perform private.rate_limit('seek_chest_dig', 400, 3600);
  select * into c from public.seek_chests where id = p_id for update;
  if c.id is null or c.player_id <> v_uid or c.dug_at is not null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if c.expires_at <= now() then raise exception 'chest_gone' using errcode = 'P0001'; end if;
  v_paid := private.grant_ink_paced(v_uid, c.ink, 'enchantment', 'seek_chest', c.id::text, null);
  update public.seek_chests set dug_at = now(), paid = v_paid where id = c.id;
  perform private.glyph_drop(v_uid, 'chest', 0.12);
  if c.enchant_id is not null then
    perform private.ench_stat(c.enchant_id, 'chests');
    perform private.ench_event(c.enchant_id, 'seek_chest', jsonb_build_object('ink', v_paid));
  end if;
  if c.source_id is not null and c.source_id is distinct from c.enchant_id then perform private.ench_stat(c.source_id, 'lent_chests'); end if;
  return jsonb_build_object('ink', v_paid, 'gx', c.gx, 'gy', c.gy, 'kind', c.finder_kind, 'chests', private.seek_chest_list(v_uid), 'balances', private.balances(v_uid));
end $function$;

CREATE OR REPLACE FUNCTION private.take_plot(p_uid uuid, p_gx integer, p_gy integer, p_method text, p_cost jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v_type text; v_rarity text; v_group uuid; v_lucky text; v_grant private.granted_rolls; v_base text; v_lg text; v_granted boolean := false; v_gt text; v_ench text; v_ench_row public.enchantments; v_fate jsonb; v_sight jsonb;
begin
  if p_gx is null or p_gy is null or p_gx not between 0 and 4194303 or p_gy not between 0 and 4194303 then
    raise exception 'invalid_plot' using errcode = 'P0001';
  end if;
  v_type := private.plot_type_for(p_gx, p_gy);
  v_rarity := private.plot_rarity_for(p_gx, p_gy);
  v_base := coalesce((select rarity from public.world_plots where gx = p_gx and gy = p_gy and owner_id is null), v_rarity);
  perform set_config('landvas.luck_grant', '', true);
  -- an event roll for this claim, if one is due: it is the claim's own roll
  if p_method in ('acquire', 'starter', 'purchase') then
    v_grant := private.take_granted_roll(p_uid, p_gx, p_gy);
    if v_grant.id is not null then v_rarity := v_grant.rarity; v_base := v_grant.rarity; end if;
  end if;
  -- 🔭 a Spyglass sighting: the reading you saw is this claim's roll (never over a Crown or a sleeping enchantment)
  if p_method in ('acquire', 'starter', 'purchase') and v_grant.id is null and v_base not like 'crown%'
     and not exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and rarity = 'enchanted') then
    v_sight := private.spy_take(p_uid, p_gx, p_gy);
    if v_sight is not null then
      if v_sight ->> 'rarity' = 'enchanted' then v_ench := v_sight ->> 'kind'; v_rarity := 'enchanted'; v_base := 'enchanted';
      else v_rarity := v_sight ->> 'rarity'; v_base := v_rarity; end if;
    end if;
  end if;
  -- the Oracle's prophecy, if one is waiting
  if p_method in ('acquire', 'starter', 'purchase') and v_grant.id is null and v_base not like 'crown%' and v_sight is null
     and not exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and rarity = 'enchanted') then
    v_fate := private.oracle_take(p_uid, 'roll');
    if v_fate is not null and v_fate ->> 'rarity' <> 'enchanted' then v_rarity := v_fate ->> 'rarity'; v_base := v_rarity; end if;
  end if;
  -- 2% of rolls are Enchanted (never an event roll, never a Crown, never a plot that already holds a sleeping one)
  if p_method in ('acquire', 'starter', 'purchase') and v_grant.id is null and v_base not like 'crown%'
     and not exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and rarity = 'enchanted')
     and (v_fate is null or v_fate ->> 'rarity' = 'enchanted') and v_sight is null then
    v_ench := case when v_fate is not null then v_fate ->> 'kind' else private.ench_roll(p_uid) end;
    if v_ench is not null then v_rarity := 'enchanted'; v_base := 'enchanted'; end if;
  end if;
  if p_method in ('acquire', 'starter') and v_base <> 'enchanted' then
    perform set_config('landvas.base_type', coalesce(v_grant.plot_type, (select plot_type from public.world_plots where gx = p_gx and gy = p_gy and owner_id is null), v_type), true);
    v_lucky := private.luck_roll(p_uid, p_gx, p_gy, v_base);
    if v_lucky is distinct from v_base then v_rarity := v_lucky; else v_lucky := null; end if;
  end if;
  v_lg := nullif(current_setting('landvas.luck_grant', true), '');
  v_granted := (v_grant.id is not null and v_rarity = v_grant.rarity) or (v_lg is not null and split_part(v_lg, ':', 1) = v_rarity);
  if v_granted then
    v_gt := case when v_grant.id is not null and v_rarity = v_grant.rarity then v_grant.plot_type else nullif(split_part(v_lg, ':', 3), '') end;
    if v_gt is not null then v_type := v_gt; end if;
  end if;
  -- event rolls are posted on the live feed like any other claim
  perform set_config('landvas.quiet_claim', '', true);
  if v_rarity = 'crown_country' then
    perform pg_advisory_xact_lock(hashtext('crown_country:' || coalesce(private.city_at(p_gx, p_gy) ->> 'country', '')));
    if private.city_at(p_gx, p_gy) is null or private.crown_country_held(private.city_at(p_gx, p_gy) ->> 'country') then v_rarity := 'mythic'; end if;
  elsif v_rarity = 'crown_state' then
    perform pg_advisory_xact_lock(hashtext('crown_state:' || coalesce(private.city_at(p_gx, p_gy) ->> 'country', '') || '/' || coalesce(private.city_at(p_gx, p_gy) ->> 'state', '')));
    if private.city_at(p_gx, p_gy) ->> 'state' is null or private.crown_state_held(private.city_at(p_gx, p_gy) ->> 'country', private.city_at(p_gx, p_gy) ->> 'state') then v_rarity := 'mythic'; end if;
  end if;
  if v_rarity = 'crown' then
    perform pg_advisory_xact_lock(hashtext('crown:' || coalesce(private.city_at(p_gx, p_gy) ->> 'id', '')));
    if private.city_at(p_gx, p_gy) is null or private.crown_held(private.city_at(p_gx, p_gy) ->> 'id') then v_rarity := 'mythic'; end if;
  end if;
  insert into public.world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at)
  values (p_gx, p_gy, v_type, v_rarity, p_uid, now())
  on conflict (gx, gy) do nothing;
  if not found then
    update public.world_plots
       set owner_id = p_uid, claimed_at = now(), level = 1, plot_type = coalesce(v_gt, plot_type), rarity = case when v_granted or v_lucky is not null or v_grant.id is not null or v_ench is not null or v_fate is not null or v_sight is not null then v_rarity else rarity end,
           art_publication_id = null, art_rev = null, updated_at = now()
     where gx = p_gx and gy = p_gy and owner_id is null and not locked
    returning plot_type, rarity into v_type, v_rarity;
    if not found then
      raise exception 'plot_unavailable' using errcode = 'P0001';
    end if;
  end if;
  if v_granted and ((v_grant.id is not null and v_grant.shiny and v_rarity = v_grant.rarity) or (v_lg like '%:t' and split_part(v_lg, ':', 1) = v_rarity)) then update public.world_plots set shiny = true where gx = p_gx and gy = p_gy; end if;
  if p_method in ('acquire', 'starter') then
    update public.world_plots p set plot_type = coalesce(l.types ->> l.best, p.plot_type), shiny = coalesce((l.shinies ->> l.best)::boolean, p.shiny)
      from public.luck_choices l
     where p.gx = p_gx and p.gy = p_gy and l.player_id = p_uid and l.gx = p_gx and l.gy = p_gy and l.picked is null and l.created_at = now() and l.types is not null
    returning p.plot_type into v_type;
    v_type := coalesce(v_type, (select plot_type from public.world_plots where gx = p_gx and gy = p_gy));
  end if;
  insert into public.plot_ownership (gx, gy, player_id, method, cost)
  values (p_gx, p_gy, p_uid, p_method, coalesce(p_cost, '{}'::jsonb));
  perform private.spy_claimed(p_uid, p_gx, p_gy);
  if v_ench is not null then v_ench_row := private.ench_create(v_ench, p_uid, p_gx, p_gy); end if;
  if v_sight is not null then perform private.spy_paid(v_sight, p_uid); end if;
  -- ✍️ a rare plot can hide a glyph
  if (select sort from public.plot_rarities where id = v_rarity) >= (select sort from public.plot_rarities where id = 'rare') and v_rarity not like 'crown%' then
    perform private.glyph_drop(p_uid, 'plot', case when v_rarity = 'rare' then 0.08 else 0.15 end);
  end if;
  v_group := private.create_group_with_cells(p_uid, jsonb_build_array(jsonb_build_array(p_gx, p_gy)),
                                             private.empty_manifest(), null, 'initial');
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx, p_gy, p_gx, p_gy);
  return jsonb_build_object('lucky', v_lucky is not null, 'choices', (select options from public.luck_choices where player_id = p_uid and gx = p_gx and gy = p_gy and picked is null and created_at > now() - interval '1 minute'),
    'choice_types', (select types from public.luck_choices where player_id = p_uid and gx = p_gx and gy = p_gy and picked is null and created_at > now() - interval '1 minute'),
    'choice_shiny', (select shinies from public.luck_choices where player_id = p_uid and gx = p_gx and gy = p_gy and picked is null and created_at > now() - interval '1 minute'), 'gx', p_gx, 'gy', p_gy, 'plot_type', v_type, 'rarity', v_rarity, 'group_id', v_group, 'foretold', v_fate is not null, 'sighted', v_sight is not null, 'enchant', private.ench_brief((select id from public.enchantments where gx = p_gx and gy = p_gy and status = 'active' and v_rarity = 'enchanted')),
                            'usd_per_second', (select private.plot_rate(p, r.usd_per_second) from public.world_plots p join public.plot_rarities r on r.id = p.rarity where p.gx = p_gx and p.gy = p_gy),
                            'shiny', (select shiny from public.world_plots where gx = p_gx and gy = p_gy), 'hot_zone', private.in_hot_zone(p_gx, p_gy),
                            'rarity_info', (select to_jsonb(r) from public.plot_rarities r where r.id = v_rarity),
                            'type_info', (select to_jsonb(t) from public.plot_types t where t.id = v_type));
end $function$;

CREATE OR REPLACE FUNCTION private.ench_view_deck(e enchantments, t timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare g jsonb := private.deck_eval(e, t); v_left int := (g ->> 'picks')::int - (g ->> 'picked')::int;
begin
  return g || jsonb_build_object('deck', private.deck_cards(), 'collection', coalesce(e.stats -> 'cards', '{}'::jsonb),
    'draws', coalesce((e.stats ->> 'draws')::int, 0), 'foils', coalesce((e.stats ->> 'foils')::int, 0), 'complete', coalesce((e.stats ->> 'complete')::boolean, false),
    'reversed_pct', private.ench_n('deck', 'reversed', 0.3),
    'glows', coalesce((select jsonb_agg(jsonb_build_object('kind', b.kind, 'mult', b.mult, 'until', b.expires_at, 'card', b.data ->> 'card', 'uses', b.uses))
                         from public.enchant_buffs b where b.enchant_id = e.id and b.expires_at > now() and (b.uses is null or b.uses > 0)), '[]'::jsonb),
    'types', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'minigame', minigame_name) order by sort), '[]'::jsonb) from public.plot_types where weight > 0),
    'attention', case when jsonb_typeof(e.state -> 'pending') = 'object' then 'A card is waiting for you'
                      when v_left > 0 then 'The cards are dealt — turn one over'
                      when (g ->> 'rebirth')::int > 0 then 'Rebirth is in your hand'
                      when (g ->> 'grand_ready')::boolean then 'The Grand Spread is ready this week' end);
end $function$;

CREATE OR REPLACE FUNCTION private.glyph_apply(e enchantments, p_g jsonb, p_pow numeric, a jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare x jsonb; v_out jsonb := '[]'::jsonb; v_pay jsonb; v_lk jsonb; p public.world_plots; o public.enchantments; v_n int; v_m numeric; v_cells int; cx record; ch record; v_paid int; v_sum int := 0; v_lv jsonb;
begin
  for x in select y from jsonb_array_elements(p_g -> 'fx') y loop
    case x ->> 't'
      when 'ink' then
        v_pay := private.ench_pay(e.id, (x ->> 'v')::numeric * p_pow, 'cast ' || (p_g ->> 'name'));
        v_out := v_out || jsonb_build_object('t', 'ink', 'v', v_pay -> 'paid', 'pay', v_pay);
      when 'luck' then
        v_n := greatest(1, round((x ->> 'v')::numeric * p_pow))::int;
        v_lk := private.ench_give_luck(e.owner_id, v_n, 0);
        v_out := v_out || jsonb_build_object('t', 'luck', 'v', v_n);
      when 'eluck' then
        v_lk := private.ench_give_luck(e.owner_id, 0, (x ->> 'v')::int);
        v_out := v_out || jsonb_build_object('t', 'eluck', 'v', (x ->> 'v')::int);
      when 'ward' then
        select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int;
        if p.owner_id is distinct from e.owner_id then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
        insert into public.enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, data, expires_at)
        values (e.owner_id, 'ward', p.gx, p.gy, e.id, 1, jsonb_build_object('glyph', p_g ->> 'id'), now() + make_interval(mins => round((x ->> 'h')::numeric * 60 * p_pow)::int));
        v_out := v_out || jsonb_build_object('t', 'ward', 'gx', p.gx, 'gy', p.gy, 'min', round((x ->> 'h')::numeric * 60 * p_pow));
      when 'leaf' then
        select * into p from public.world_plots where gx = (a ->> 'gx')::int and gy = (a ->> 'gy')::int;
        if p.owner_id is distinct from e.owner_id then raise exception 'not_your_plot' using errcode = 'P0001'; end if;
        insert into public.enchant_buffs (player_id, kind, gx, gy, enchant_id, mult, uses, data, expires_at)
        values (e.owner_id, 'glyph_leaf', p.gx, p.gy, e.id, 1 + ((x ->> 'm')::numeric - 1) * p_pow, 1, '{}'::jsonb, now() + interval '24 hours');
        v_out := v_out || jsonb_build_object('t', 'leaf', 'gx', p.gx, 'gy', p.gy, 'm', round(1 + ((x ->> 'm')::numeric - 1) * p_pow, 2));
      when 'pull' then
        -- your buried chests within reach of you or your plots, pulled in (a Farsight partner reaches further)
        v_n := 0; v_m := (x ->> 'm')::numeric * p_pow * private.ench_reach(e.id); v_cells := ceil(v_m / 3)::int + 1;
        select * into cx from private.explorer_now(e.owner_id);
        for ch in select c2.* from public.seek_chests c2
                   where c2.player_id = e.owner_id and c2.dug_at is null and c2.expires_at > now()
                     and ((cx.gx is not null and private.ench_cell_m(cx.gx, cx.gy, c2.gx, c2.gy) <= v_m)
                          or exists (select 1 from public.world_plots w where w.owner_id = e.owner_id and w.gx between c2.gx - v_cells and c2.gx + v_cells
                                       and w.gy between c2.gy - v_cells and c2.gy + v_cells and private.ench_cell_m(w.gx, w.gy, c2.gx, c2.gy) <= v_m))
                   order by c2.id limit 10 for update loop
          v_paid := private.grant_ink_paced(e.owner_id, ch.ink, 'enchantment', 'seek_chest', ch.id::text, null);
          update public.seek_chests set dug_at = now(), paid = v_paid where id = ch.id;
          v_n := coalesce(v_n, 0) + 1; v_sum := v_sum + coalesce(v_paid, 0);
        end loop;
        if coalesce(v_n, 0) = 0 then
          v_pay := private.ench_pay(e.id, (case when (x ->> 'm')::numeric >= 600 then 60 else 25 end) * p_pow, 'cast ' || (p_g ->> 'name'));
          v_out := v_out || jsonb_build_object('t', 'ink', 'v', v_pay -> 'paid', 'pay', v_pay);
        else v_out := v_out || jsonb_build_object('t', 'pull', 'n', v_n, 'ink', v_sum, 'm', round(v_m)); end if;
      when 'bolt' then
        -- the Leviathan is out: the bolt strikes it now
        v_lv := private.lev_strike(e.owner_id, (1500 + 200 * e.level) * p_pow, 'Thunder glyph', '✍️', 'glyph');
        if v_lv is not null then v_out := v_out || jsonb_build_object('t', 'strike', 'dmg', v_lv -> 'dmg', 'fell', v_lv -> 'fell'); end if;
        insert into public.enchant_buffs (player_id, kind, enchant_id, mult, data, expires_at)
        values (e.owner_id, 'glyph_bolt', e.id, case when p_pow >= 0.999 then 3 else (x ->> 'm')::numeric end, '{}'::jsonb, now() + make_interval(mins => (x ->> 'min')::int));
        v_out := v_out || jsonb_build_object('t', 'bolt', 'm', case when p_pow >= 0.999 then 3 else (x ->> 'm')::numeric end, 'min', (x ->> 'min')::int);
      when 'key' then
        select * into o from public.enchantments where id = (a ->> 'target')::uuid and owner_id = e.owner_id and status = 'active';
        if o.id is null or o.id = e.id then raise exception 'bad_target' using errcode = 'P0001'; end if;
        update public.enchantments set clock_skip = clock_skip + round((x ->> 's')::numeric * p_pow) where id = o.id;
        v_out := v_out || jsonb_build_object('t', 'key', 'target', o.id, 's', round((x ->> 's')::numeric * p_pow));
      when 'xp' then
        select * into o from public.enchantments where id = (a ->> 'target')::uuid and owner_id = e.owner_id and status = 'active';
        if o.id is null then raise exception 'bad_target' using errcode = 'P0001'; end if;
        perform private.ench_xp(o.id, greatest(1, round((x ->> 'v')::numeric * p_pow))::int);
        v_out := v_out || jsonb_build_object('t', 'xp', 'target', o.id, 'v', greatest(1, round((x ->> 'v')::numeric * p_pow)));
      when 'glow' then
        insert into public.enchant_buffs (player_id, kind, enchant_id, mult, data, expires_at)
        values (e.owner_id, 'glow', e.id, 1 + ((x ->> 'm')::numeric - 1) * p_pow, jsonb_build_object('by', 'glyph', 'name', p_g ->> 'name'), now() + make_interval(hours => (x ->> 'h')::int));
        v_out := v_out || jsonb_build_object('t', 'glow', 'm', round(1 + ((x ->> 'm')::numeric - 1) * p_pow, 2), 'h', (x ->> 'h')::int);
      when 'wins' then
        insert into public.enchant_buffs (player_id, kind, enchant_id, mult, uses, data, expires_at)
        values (e.owner_id, 'golden_hour', e.id, 1 + ((x ->> 'm')::numeric - 1) * p_pow, (x ->> 'u')::int, jsonb_build_object('by', 'glyph'), now() + interval '24 hours');
        v_out := v_out || jsonb_build_object('t', 'wins', 'm', round(1 + ((x ->> 'm')::numeric - 1) * p_pow, 2), 'u', (x ->> 'u')::int);
      when 'cleanse' then
        with d as (delete from public.enchant_buffs where player_id = e.owner_id and kind like 'curse_%' returning 1) select count(*) into v_n from d;
        v_out := v_out || jsonb_build_object('t', 'cleanse', 'v', v_n);
      when 'ticket' then
        perform private.ench_ticket(e.owner_id, x ->> 'r', 'glyph');
        v_out := v_out || jsonb_build_object('t', 'ticket', 'r', x ->> 'r');
      else null;
    end case;
  end loop;
  return v_out;
end $function$;

CREATE OR REPLACE FUNCTION private.ench_view_crucible(e enchantments, t timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare s jsonb := e.state; v_heat numeric := coalesce((s ->> 'heat')::numeric, 0); v_melt jsonb; v_strike jsonb; v_arts jsonb; v_in jsonb; v_mon jsonb; v_ch jsonb := '{}'::jsonb; k text;
begin
  foreach k in array array['uncommon', 'rare', 'epic', 'legendary', 'mythic', 'ultra', 'crown'] loop
    v_ch := v_ch || jsonb_build_object(k, private.cru_chance(v_heat, k, 0, false));
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('gx', p.gx, 'gy', p.gy, 'rarity', p.rarity, 'plot_type', p.plot_type, 'name', p.name, 'shiny', p.shiny,
                                               'heat', private.cru_heat_of(p.rarity, p.shiny) * case when e.stars >= 1 then 1.25 else 1 end, 'metal', private.cru_metal(p.rarity))
                            order by (select sort from public.plot_rarities r where r.id = p.rarity), p.claimed_at), '[]'::jsonb)
    into v_melt from (select * from public.world_plots p where p.owner_id = e.owner_id and private.cru_why_not_melt(e.owner_id, p) is null limit 200) p;
  select coalesce(jsonb_agg(jsonb_build_object('gx', p.gx, 'gy', p.gy, 'rarity', p.rarity, 'plot_type', p.plot_type, 'name', p.name, 'shiny', p.shiny,
                                               'to', private.cru_next(p.rarity, 1), 'chance', private.cru_chance(v_heat, private.cru_next(p.rarity, 1), 0, false))
                            order by (select sort from public.plot_rarities r where r.id = p.rarity) desc, p.claimed_at), '[]'::jsonb)
    into v_strike from (select * from public.world_plots p where p.owner_id = e.owner_id and private.cru_why_not_strike(e.owner_id, p) is null limit 200) p;
  select coalesce(jsonb_agg(private.cru_artifact_json(x) order by x.kind, x.level desc, x.id), '[]'::jsonb) into v_arts from public.crucible_artifacts x where x.player_id = e.owner_id;
  select coalesce(jsonb_agg(jsonb_build_object('gx', i.gx, 'gy', i.gy, 'metal', i.metal)), '[]'::jsonb) into v_in from public.crucible_inlays i where i.player_id = e.owner_id;
  select coalesce(jsonb_agg(jsonb_build_object('gx', m.gx, 'gy', m.gy, 'name', m.name, 'points', m.points, 'tier', m.tier) order by m.points desc), '[]'::jsonb) into v_mon
    from public.crucible_monuments m where m.player_id = e.owner_id;
  return jsonb_build_object('heat', v_heat, 'metal', coalesce(s -> 'metal', '{}'::jsonb), 'runes', coalesce(s -> 'runes', '{}'::jsonb), 'chances', v_ch,
    'need', jsonb_build_object('uncommon', private.cru_need('uncommon'), 'rare', private.cru_need('rare'), 'epic', private.cru_need('epic'),
                               'legendary', private.cru_need('legendary'), 'mythic', private.cru_need('mythic'), 'ultra', private.cru_need('ultra'), 'crown', private.cru_need('crown')),
    'cap', private.ench_n('crucible', 'cap', 0.85), 'caps', jsonb_build_object('ultra', private.ench_n('crucible', 'cap_ultra', 0.25), 'crown', private.ench_n('crucible', 'cap_crown', 0.06)), 'meltable', v_melt, 'strikeable', v_strike, 'artifacts', v_arts, 'inlays', v_in, 'monuments', v_mon,
    'recipes', private.cru_recipes(), 'heat_mult', case when e.stars >= 1 then 1.25 else 1 end, 'free_rune', e.stars >= 2,
    'master_ready', e.stars >= 3 and coalesce(s ->> 'master_week', '') <> to_char(now(), 'IYYY-IW'),
    'tend_ready', coalesce(s ->> 'tend_day', '') <> private.today()::text and exists (select 1 from public.crucible_artifacts where player_id = e.owner_id and kind = 'horseshoe' and carried),
    'set', private.cru_set(e.owner_id), 'melts', coalesce((e.stats ->> 'melts')::int, 0), 'wins', coalesce((e.stats ->> 'wins')::int, 0),
    'strikes', coalesce((e.stats ->> 'strikes')::int, 0), 'melt_min_h', private.ench_n('crucible', 'melt_min_h', 24),
    'types', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'minigame', minigame_name) order by sort), '[]'::jsonb) from public.plot_types where weight > 0),
    'attention', case when coalesce(s ->> 'tend_day', '') <> private.today()::text and exists (select 1 from public.crucible_artifacts where player_id = e.owner_id and kind = 'horseshoe' and carried)
                      then 'Your horseshoes have Luck for you' when v_heat > 0 then 'The Heart is hot — strike a plot' end);
end $function$;

CREATE OR REPLACE FUNCTION private.spy_roll(p_gx integer, p_gy integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v_hot boolean := private.in_hot_zone(p_gx, p_gy); c jsonb := private.ench_cfg();
  v_um numeric := case when v_hot then coalesce((private.cfg('hot_zones') ->> 'ultra_mult')::numeric, 5) else 1 end;
  v_u numeric := random() * 1000000; v_acc numeric := 0; r record; v_total int; v_a text; v_b text;
begin
  -- a Crown, once in a great while (only while that cell's crown is free)
  if random() * 1000000 < private.ench_n('spyglass', 'crown_ppm', 40) * (case when v_hot then 3 else 1 end) then
    v_a := private.crown_free_at(p_gx, p_gy);
    if v_a is not null then return jsonb_build_object('rarity', v_a); end if;
  end if;
  if coalesce((c ->> 'enabled')::boolean, true) and random() * 100 < coalesce((c ->> 'base_pct')::numeric, 2) then
    return jsonb_build_object('rarity', 'enchanted', 'kind', private.ench_pick_kind());
  end if;
  for r in select id, ppm from public.plot_rarities where ppm > 0 and id not like 'crown%' order by ppm, sort loop
    v_acc := v_acc + r.ppm * v_um;
    if v_u < v_acc then return jsonb_build_object('rarity', r.id); end if;
  end loop;
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  if v_total = 0 then return jsonb_build_object('rarity', 'common'); end if;
  v_a := private.rarity_pick(floor(random() * v_total)::int);
  if v_hot then
    v_b := private.rarity_pick(floor(random() * v_total)::int);
    if (select sort from public.plot_rarities where id = v_b) > (select sort from public.plot_rarities where id = v_a) then v_a := v_b; end if;
  end if;
  return jsonb_build_object('rarity', v_a);
end $function$;

-- ---- data ---------------------------------------------------------------------------------------------------------------
-- the Fated Deck's collection title has its name from the pitch
update public.enchantments set titles = array_replace(titles, 'Arcana Complete', 'Fate-Weaver') where 'Arcana Complete' = any(titles);
-- (the old daily clock fold is a tap now)
create or replace function private.ori_folded_clock(p_id uuid) returns void language sql as $$ select $$;

do $$
begin
  execute 'revoke all on function public.puppet_start(uuid, integer, integer) from public';
  execute 'grant execute on function public.puppet_start(uuid, integer, integer) to authenticated';
end $$;
