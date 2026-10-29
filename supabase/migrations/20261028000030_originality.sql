-- v0.16: new ideas pay, repeats don't. The art pipeline fingerprints every published piece
-- (its shapes and colours) and compares it with the artist's other canvases and recent art
-- by others. A near-copy — moved, resized, mirrored, recoloured or barely touched up —
-- earns only a small share of the craft bonus and can't be entered in a challenge.
--   earn.craft.originality = [{"sim": 0.92, "factor": 0.05}, {"sim": 0.85, "factor": 0.25}, {"sim": 0.75, "factor": 0.6}]
-- (the first band the similarity reaches sets the share of the bonus that's paid).
-- Reworking the same canvas isn't a repeat: the craft tiers already pay only for improvement.

alter table public.artwork_publications add column if not exists fingerprint text;

-- drafts remember when an uploaded image was placed into the art (imported art earns no craft bonus;
-- the editor's trace guide is the way to use a reference)
create or replace function private.manifest_normalize(p_manifest jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object('layers', (
    select jsonb_agg(jsonb_build_object(
      'id', l.v ->> 'id',
      'name', l.v ->> 'name',
      'opacity', coalesce((l.v ->> 'opacity')::numeric, 1),
      'visible', coalesce((l.v ->> 'visible')::boolean, true),
      'tiles', coalesce(l.v -> 'tiles', '{}'::jsonb)) order by l.i)
    from jsonb_array_elements(p_manifest -> 'layers') with ordinality l(v, i)))
  || case when coalesce((p_manifest ->> 'imported')::boolean, false) then '{"imported": true}'::jsonb else '{}'::jsonb end
$$;

update public.game_config
   set value = jsonb_set(value, '{craft,imported_factor}', coalesce(value -> 'craft' -> 'imported_factor', '0'::jsonb), true)
 where key = 'earn';
update public.game_config
   set value = jsonb_set(value, '{craft,originality}', coalesce(value -> 'craft' -> 'originality',
                 '[{"sim": 0.92, "factor": 0.05}, {"sim": 0.85, "factor": 0.25}, {"sim": 0.75, "factor": 0.6}]'::jsonb), true)
 where key = 'earn';

create or replace function private.check_originality_trg() returns trigger
language plpgsql as $$
declare b jsonb;
begin
  if new.key <> 'earn' then return new; end if;
  if coalesce((new.value -> 'craft' ->> 'imported_factor')::numeric, 0) not between 0 and 1 then
    raise exception 'invalid_earn_config' using errcode = 'P0001', detail = 'imported_factor';
  end if;
  if not (new.value -> 'craft' ? 'originality') then return new; end if;
  if jsonb_typeof(new.value -> 'craft' -> 'originality') <> 'array' or jsonb_array_length(new.value -> 'craft' -> 'originality') > 8 then
    raise exception 'invalid_earn_config' using errcode = 'P0001', detail = 'originality';
  end if;
  for b in select e from jsonb_array_elements(new.value -> 'craft' -> 'originality') e loop
    if coalesce((b ->> 'sim')::numeric, -1) not between 0 and 1 or coalesce((b ->> 'factor')::numeric, -1) not between 0 and 1 then
      raise exception 'invalid_earn_config' using errcode = 'P0001', detail = 'originality band';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists game_config_originality_check on public.game_config;
create trigger game_config_originality_check before insert or update on public.game_config for each row execute function private.check_originality_trg();

-- what the pipeline compares a new piece with: the artist's other canvases, and recent art by others
create or replace function public.svc_art_fingerprints(p_publication_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with me as (select owner_id, group_id from public.artwork_publications where id = p_publication_id)
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    (select jsonb_build_object('id', a.id, 'title', a.title, 'fp', a.fingerprint, 'own', true) x
       from public.artwork_publications a, me
      where a.owner_id = me.owner_id and a.group_id <> me.group_id and a.id <> p_publication_id and a.fingerprint is not null
        and a.status in ('published', 'superseded', 'approved', 'pending_review')
      order by a.created_at desc limit 300)
    union all
    (select jsonb_build_object('id', a.id, 'title', a.title, 'fp', a.fingerprint, 'own', false)
       from public.artwork_publications a, me
      where a.owner_id <> me.owner_id and a.status = 'published' and a.fingerprint is not null
      order by a.published_at desc nulls last limit 300)) t
$$;

-- your own pieces, so the publish screen can warn about a repeat before you publish
create or replace function public.my_art_fingerprints() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'fp', a.fingerprint, 'group_id', a.group_id, 'own', true) order by a.created_at desc), '[]'::jsonb)
  from (select * from public.artwork_publications
        where owner_id = auth.uid() and fingerprint is not null and status in ('published', 'superseded', 'approved', 'pending_review')
        order by created_at desc limit 200) a
$$;

create or replace function public.svc_record_craft(p_publication_id uuid, p_craft jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_score int := least(greatest(coalesce((p_craft ->> 'score')::int, 0), 0), 100);
begin
  update public.artwork_publications
     set craft = (p_craft - 'score' - 'fingerprint') || jsonb_build_object('score', v_score),
         craft_score = v_score,
         fingerprint = coalesce(nullif(p_craft ->> 'fingerprint', ''), fingerprint)
   where id = p_publication_id;
  -- already live (staff art goes straight through): pay now
  perform private.craft_pay(p_publication_id);
  return jsonb_build_object('craft_score', v_score);
end $$;

-- the share of the bonus a piece earns, from how much it repeats earlier art
create or replace function private.originality_factor(p_sim numeric) returns numeric
language sql stable as $$
  select coalesce((select (b ->> 'factor')::numeric from jsonb_array_elements(coalesce(private.earn('craft') -> 'originality', '[]'::jsonb)) b
                   where coalesce(p_sim, 0) >= (b ->> 'sim')::numeric order by (b ->> 'sim')::numeric desc limit 1), 1)
$$;

create or replace function private.craft_pay(p_publication_id uuid) returns void
language plpgsql as $$
declare
  p public.artwork_publications%rowtype; c jsonb := private.earn('craft'); v_tier numeric; v_target int; v_prev public.craft_rewards%rowtype;
  v_pay int; v_today numeric; v_sim numeric; v_factor numeric;
begin
  select * into p from public.artwork_publications where id = p_publication_id;
  if not found or p.status <> 'published' or p.craft_score is null or not coalesce((c ->> 'enabled')::boolean, false) then return; end if;
  if p.craft ? 'paid' then return; end if;
  select max(greatest(coalesce((t ->> 'ink')::numeric, 0), 0)) into v_tier from jsonb_array_elements(coalesce(c -> 'tiers', '[]'::jsonb)) t
   where p.craft_score >= coalesce((t ->> 'min')::numeric, 101);
  v_sim := coalesce((p.craft -> 'similar' ->> 'sim')::numeric, 0);
  v_factor := private.originality_factor(v_sim);
  -- art with an uploaded image placed in it earns imported_factor of the bonus (none by default)
  if coalesce((select (v.manifest ->> 'imported')::boolean from public.artwork_versions v where v.id = p.version_id), false) then
    v_factor := least(v_factor, coalesce((c ->> 'imported_factor')::numeric, 0));
    update public.artwork_publications set craft = craft || '{"imported": true}'::jsonb where id = p.id;
  end if;
  v_target := floor(coalesce(v_tier, 0) * v_factor * (1 + coalesce((c ->> 'plot_bonus_pct')::numeric, 20) / 100
                     * least(greatest(p.plot_count - 1, 0), coalesce((c ->> 'max_bonus_plots')::int, 8))));
  select * into v_prev from public.craft_rewards where group_id = p.group_id for update;
  v_pay := greatest(v_target - coalesce(v_prev.paid_ink, 0), 0);
  select coalesce(sum(delta), 0) into v_today from public.resource_ledger where player_id = p.owner_id and resource = 'ink' and reason = 'craft' and created_at >= private.day_start(now());
  v_pay := least(v_pay, greatest(coalesce((c ->> 'daily_cap')::numeric, 100) - v_today, 0))::int;
  insert into public.craft_rewards (group_id, owner_id, best_score, paid_ink) values (p.group_id, p.owner_id, p.craft_score, v_pay)
  on conflict (group_id) do update set best_score = greatest(public.craft_rewards.best_score, excluded.best_score),
                                       paid_ink = public.craft_rewards.paid_ink + v_pay, updated_at = now();
  update public.artwork_publications set craft = craft || jsonb_build_object('paid', v_pay, 'tier_ink', v_target, 'originality', round(v_factor * 100))
   where id = p.id;
  if v_pay > 0 then perform private.grant(p.owner_id, jsonb_build_object('ink', v_pay), 'craft', 'publication', p.id::text, 'craft:' || p.id); end if;
end $$;

-- challenges want new work: a near-copy of something you published before the challenge can't enter
create or replace function public.challenge_enter(p_challenge_id uuid, p_publication_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); ch public.challenges%rowtype; a public.artwork_publications%rowtype; v_pay int := 0; v_had boolean; v_sim numeric;
begin
  perform private.challenge_sweep();
  select * into ch from public.challenges where id = p_challenge_id;
  if not found or ch.status <> 'open' or ch.starts_at > now() or ch.ends_at <= now() then raise exception 'challenge_closed' using errcode = 'P0001'; end if;
  select * into a from public.artwork_publications where id = p_publication_id;
  if not found or a.owner_id <> v_uid or a.status <> 'published' then raise exception 'not_your_artwork' using errcode = 'P0001'; end if;
  if coalesce(a.published_at, a.created_at) < ch.starts_at then raise exception 'made_before_challenge' using errcode = 'P0001'; end if;
  v_sim := coalesce((a.craft -> 'similar' ->> 'sim')::numeric, 0);
  if v_sim >= 0.85 then raise exception 'too_similar' using errcode = 'P0001', detail = coalesce(a.craft -> 'similar' ->> 'title', ''); end if;
  select exists (select 1 from public.challenge_entries where challenge_id = ch.id and owner_id = v_uid) into v_had;
  if v_had then
    delete from public.challenge_votes where challenge_id = ch.id and publication_id = (select publication_id from public.challenge_entries where challenge_id = ch.id and owner_id = v_uid);
    update public.challenge_entries set publication_id = p_publication_id, votes = 0, created_at = now() where challenge_id = ch.id and owner_id = v_uid;
  else
    if ch.entry_ink > 0 and private.old_enough(v_uid, coalesce((private.earn('challenges') ->> 'min_account_hours')::numeric, 24)) then v_pay := ch.entry_ink; end if;
    insert into public.challenge_entries (challenge_id, publication_id, owner_id, entry_paid) values (ch.id, p_publication_id, v_uid, v_pay);
    if v_pay > 0 then perform private.grant(v_uid, jsonb_build_object('ink', v_pay), 'challenge', 'challenge', ch.id::text, 'challenge:' || ch.id || ':entry:' || v_uid); end if;
  end if;
  return private.challenge_json(ch, v_uid) || jsonb_build_object('earned', v_pay, 'balances', private.balances(v_uid));
end $$;

do $$
begin
  execute 'revoke all on function private.check_originality_trg() from public';
  execute 'revoke all on function private.originality_factor(numeric) from public';
  execute 'revoke all on function public.svc_art_fingerprints(uuid) from public, anon, authenticated';
  execute 'grant execute on function public.svc_art_fingerprints(uuid) to service_role';
  execute 'revoke all on function public.my_art_fingerprints() from public, anon';
  execute 'grant execute on function public.my_art_fingerprints() to authenticated, service_role';
  execute 'revoke all on function public.challenge_enter(uuid, uuid) from public, anon';
  execute 'grant execute on function public.challenge_enter(uuid, uuid) to authenticated, service_role';
end $$;
