-- Primordials can only be rolled. Fusing three ultras into a random Primordial is closed, every Primordial that was
-- made that way is given back as ultras the player picks themselves, and Primordial rent comes down a long way while
-- staying a tier above the everyday ultras.
--
-- 1. ultra_fuse with three plots refuses ('primordials_roll_only'); two-ultra Fusions are unchanged.
-- 2. Every Primordial made by a triple fusion that its fuser still holds becomes a refund:
--    · straight away, the plot turns back into the ultra it was before the fusion (its first ultra) — so the Primordial's
--      rent and powers stop now — and the player gets an alert;
--    · the player then picks any 3 ultras (not Crowns; Singularity and Genesis are left out by default —
--      game_config rarity_powers.refund_exclude): the plot becomes the first, and the next two plots they claim roll the
--      other two (granted rolls, the same delivery as event prizes).
--    A Primordial its fuser no longer holds isn't refunded (it's listed for staff).
-- 3. Primordial rent: 8e-7 → 1e-7 $/s (about $0.26 a month a plot): still several times any everyday ultra, an eighth
--    of what it was. Their ×6 Ink multiplier and their powers are unchanged.

update public.game_config set value = value || jsonb_build_object(
    'triple_fusion', false,
    'refund_exclude', coalesce(value -> 'refund_exclude', '["singularity", "genesis"]'::jsonb))
where key = 'rarity_powers';

-- ---- 1. no more triple fusions --------------------------------------------------------------------------------
select private.fn_patch('public.ultra_fuse(jsonb)', '    v_to := private.rx_pick_primordial(null);',
  '    -- Primordials can only be rolled (Nov 2026): three ultras no longer fuse into one
    raise exception ''primordials_roll_only'' using errcode = ''P0001'';');

-- the recipe book says so
select private.fn_patch('public.fusion_book()', '''per_day'', coalesce((private.rx_cfg() ->> ''fuse_per_day'')::int, 10));',
  '''per_day'', coalesce((private.rx_cfg() ->> ''fuse_per_day'')::int, 10), ''triple'', false,
    ''refunds'', public.primordial_refunds_mine());');

-- ---- 2. the refunds ---------------------------------------------------------------------------------------------
create table if not exists public.primordial_refunds (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  gx int not null, gy int not null,
  primordial text not null,            -- what the fusion made
  fused_from jsonb not null,           -- the three ultras that went in
  fused_at timestamptz,
  status text not null default 'open' check (status in ('open', 'chosen', 'void')),
  reverted_to text,                    -- what the plot became straight away (its first ultra)
  picks text[],                        -- the three ultras the player chose
  grants bigint[],                     -- the granted rolls for picks 2 and 3
  note text,
  created_at timestamptz not null default now(), chosen_at timestamptz);
create unique index if not exists primordial_refunds_cell on public.primordial_refunds (player_id, gx, gy, fused_at);
alter table public.primordial_refunds enable row level security;

/** the ultras a refund can be picked from */
create or replace function private.refund_choices() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'emoji', r.emoji, 'color', r.color, 'glow', r.glow, 'ability', r.ability,
                                               'usd_per_second', r.usd_per_second, 'ink_mult', r.ink_reward_multiplier, 'ppm', r.ppm) order by r.sort), '[]'::jsonb)
  from public.plot_rarities r
  where r.tier = 'ultra' and r.id not like 'crown%' and coalesce(r.ppm, 0) > 0
    and not (coalesce(private.rx_cfg() -> 'refund_exclude', '[]'::jsonb) ? r.id)
$$;

create or replace function public.primordial_refunds_mine() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'gx', f.gx, 'gy', f.gy, 'primordial', f.primordial, 'fused_from', f.fused_from, 'fused_at', f.fused_at,
                                               'status', f.status, 'reverted_to', f.reverted_to, 'picks', to_jsonb(f.picks), 'chosen_at', f.chosen_at) order by f.id), '[]'::jsonb)
  from public.primordial_refunds f where f.player_id = auth.uid() and f.status in ('open', 'chosen')
$$;

/** what's waiting for me: open refunds and what I can pick from */
create or replace function public.primordial_refund_status() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('open', '[]'::jsonb, 'choices', '[]'::jsonb); end if;
  return jsonb_build_object(
    'open', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'gx', f.gx, 'gy', f.gy, 'primordial', f.primordial, 'fused_from', f.fused_from,
                                                          'fused_at', f.fused_at, 'reverted_to', f.reverted_to, 'name', w.name) order by f.id)
                       from public.primordial_refunds f left join public.world_plots w on w.gx = f.gx and w.gy = f.gy
                      where f.player_id = v_uid and f.status = 'open'), '[]'::jsonb),
    'choices', private.refund_choices());
end $$;

/** pick the three ultras: the plot becomes the first, the next two claims roll the other two */
create or replace function public.primordial_refund_choose(p_id bigint, p_picks text[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); f public.primordial_refunds; w public.world_plots; v_n int; v_g1 bigint; v_g2 bigint; v_ok jsonb := private.refund_choices();
begin
  select * into f from public.primordial_refunds where id = p_id and player_id = v_uid for update;
  if not found or f.status <> 'open' then raise exception 'not_found' using errcode = 'P0001'; end if;
  if coalesce(array_length(p_picks, 1), 0) <> 3 then raise exception 'pick_three' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(p_picks) x where not exists (select 1 from jsonb_array_elements(v_ok) c where c ->> 'id' = x)) then
    raise exception 'not_a_choice' using errcode = 'P0001';
  end if;
  -- the first: the plot itself (if it's still theirs; otherwise it comes on a claim too)
  select * into w from public.world_plots where gx = f.gx and gy = f.gy for update;
  perform private.rent_settle(v_uid);
  if w.owner_id = v_uid then
    perform private.rx_set_rarity(v_uid, f.gx, f.gy, p_picks[1], 'refund');
    perform private.rx_sync(f.gx, f.gy);
  else
    v_n := private.roll_count(v_uid);
    insert into private.granted_rolls (player_id, rarity, at_roll, note, created_by) values (v_uid, p_picks[1], v_n + 1, 'Primordial refund #' || f.id, null);
  end if;
  -- the other two: the next claims
  v_n := private.roll_count(v_uid);
  insert into private.granted_rolls (player_id, rarity, at_roll, note) values (v_uid, p_picks[2], v_n + 1, 'Primordial refund #' || f.id) returning id into v_g1;
  insert into private.granted_rolls (player_id, rarity, at_roll, note) values (v_uid, p_picks[3], v_n + 2, 'Primordial refund #' || f.id) returning id into v_g2;
  update public.primordial_refunds set status = 'chosen', picks = p_picks, grants = array[v_g1, v_g2], chosen_at = now() where id = f.id;
  perform private.audit('primordial.refund_chosen', 'player', v_uid::text, jsonb_build_object('refund', f.id, 'picks', to_jsonb(p_picks), 'gx', f.gx, 'gy', f.gy));
  return jsonb_build_object('ok', true, 'picks', to_jsonb(p_picks), 'plot', jsonb_build_array(f.gx, f.gy), 'on_plot', w.owner_id = v_uid,
                            'status', public.primordial_refund_status(), 'rent', private.rent_json(v_uid));
end $$;

/** staff: every refund, open or done, and the fused Primordials that weren't refunded */
create or replace function public.admin_primordial_refunds() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'player', private.profile_json(f.player_id), 'gx', f.gx, 'gy', f.gy, 'primordial', f.primordial,
                     'fused_from', f.fused_from, 'fused_at', f.fused_at, 'status', f.status, 'reverted_to', f.reverted_to, 'picks', to_jsonb(f.picks),
                     'note', f.note, 'chosen_at', f.chosen_at) order by f.id desc) from public.primordial_refunds f), '[]'::jsonb);
end $$;

revoke all on function public.primordial_refunds_mine() from public, anon;
revoke all on function public.primordial_refund_status() from public, anon;
revoke all on function public.primordial_refund_choose(bigint, text[]) from public, anon;
revoke all on function public.admin_primordial_refunds() from public, anon;
grant execute on function public.primordial_refunds_mine() to authenticated;
grant execute on function public.primordial_refund_status() to authenticated;
grant execute on function public.primordial_refund_choose(bigint, text[]) to authenticated;
grant execute on function public.admin_primordial_refunds() to authenticated;

-- every Primordial a triple fusion made: open a refund, and turn the plot back into its first ultra now
create or replace function private.primordial_refunds_open() returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare e record; w public.world_plots; v_back text; v_id bigint; v_n int := 0;
begin
  -- (run outside any request, e.g. by the migration: no caller)
  perform set_config('request.jwt.claims', coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}'), true);
  for e in select l.player_id, l.gx, l.gy, l.at, l.data from private.fairplay_log l
            where l.kind = 'rx_fuse' and jsonb_typeof(l.data -> 'from') = 'array' and jsonb_array_length(l.data -> 'from') = 3
            order by l.at loop
    continue when exists (select 1 from public.primordial_refunds where player_id = e.player_id and gx = e.gx and gy = e.gy and fused_at = e.at);
    select * into w from public.world_plots where gx = e.gx and gy = e.gy for update;
    v_back := e.data -> 'from' ->> 0;
    if w.owner_id is distinct from e.player_id or not exists (select 1 from public.plot_rarities r where r.id = w.rarity and r.tier = 'primordial') then
      insert into public.primordial_refunds (player_id, gx, gy, primordial, fused_from, fused_at, status, note)
      values (e.player_id, e.gx, e.gy, coalesce(e.data ->> 'to', '?'), e.data -> 'from', e.at, 'void',
              case when w.owner_id is distinct from e.player_id then 'no longer theirs' else 'no longer a Primordial (now ' || coalesce(w.rarity, '?') || ')' end);
      continue;
    end if;
    perform private.rent_settle(e.player_id);
    perform private.rx_set_rarity(e.player_id, e.gx, e.gy, v_back, 'refund');
    perform private.rx_sync(e.gx, e.gy);
    insert into public.primordial_refunds (player_id, gx, gy, primordial, fused_from, fused_at, reverted_to)
    values (e.player_id, e.gx, e.gy, w.rarity, e.data -> 'from', e.at, v_back) returning id into v_id;
    perform private.notify(e.player_id, 'power', null, jsonb_build_object('sub', 'refund', 'rarity', w.rarity, 'gx', e.gx, 'gy', e.gy, 'refund', v_id));
    perform private.audit('primordial.refund_opened', 'player', e.player_id::text, jsonb_build_object('refund', v_id, 'primordial', w.rarity, 'gx', e.gx, 'gy', e.gy, 'back_to', v_back));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function private.primordial_refunds_open() from public;
select private.primordial_refunds_open();

-- ---- 3. Primordial rent ----------------------------------------------------------------------------------------
update public.plot_rarities set usd_per_second = 0.0000001 where tier = 'primordial' and usd_per_second > 0.0000001;
