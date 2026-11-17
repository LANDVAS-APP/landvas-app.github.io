-- A Mirror Shard reflecting a ☀️ Pocket Sun couldn't throw it: the app held every mirrored sun's buttons, so the
-- reflection ran out unused. The app is fixed (a mirrored sun is thrown anywhere near your explorer, and stokes,
-- flares and switches like a real one; the server always ran it). Here, once: every sun reflection that never lit is
-- given back.
--   · still reflecting that sun → the reflection starts over, a full length for each one wasted (at most three)
--   · the reflection is over, nothing else in the glass → a fresh sun reflection, the same way
--   · reflecting something else now → a sun waits among the shard's reflections, to step into whenever they like
-- (Cracks stay: every reflection's crack is progress toward the shatter's Luck, not a cost.) The owner is told.
do $$
declare
  r record; e public.enchantments; v_now numeric; v_len numeric; v_hours numeric; v_reflecting text; v_case text;
begin
  for r in
    with refl as (
      select ev.id, ev.enchant_id, ev.created_at, ev.data ->> 'kind' kind,
             lead(ev.created_at) over (partition by ev.enchant_id order by ev.created_at, ev.id) next_at
        from public.enchant_events ev where ev.kind = 'reflect'
    )
    select f.enchant_id, count(*)::int n, max(f.created_at) last_at
      from refl f
      join public.enchantments x on x.id = f.enchant_id and x.kind = 'shard' and x.status = 'active' and x.owner_id is not null
     where f.kind = 'sun'
       and not exists (select 1 from public.enchant_events i where i.enchant_id = f.enchant_id and i.kind = 'ignited'
                        and i.created_at >= f.created_at and (f.next_at is null or i.created_at < f.next_at))
       and not exists (select 1 from public.enchant_events d where d.enchant_id = f.enchant_id and d.kind = 'mirror_sun_back')
     group by f.enchant_id
  loop
    select * into e from public.enchantments where id = r.enchant_id for update;
    v_now := private.ench_ep(private.ench_now(e));
    -- a reflection's full length (as a step gives it), once for each wasted one, three at most
    v_len := private.ench_n('shard', 'hours', 24) * 3600 * case when e.stars >= 5 then 2 when e.stars >= 1 then 1.5 else 1 end;
    v_hours := round(v_len * least(r.n, 3) / 3600);
    v_reflecting := case when coalesce((e.state -> 'reflect' ->> 'until')::numeric, 0) > v_now then e.state -> 'reflect' ->> 'kind' end;
    if v_reflecting = 'sun' then
      v_case := 'extended';
      update public.enchantments
         set state = jsonb_set(jsonb_set(state, '{reflect,until}', to_jsonb(round(v_now + v_len * least(r.n, 3)))), '{reflect,from}', to_jsonb(round(v_now))),
             updated_at = now()
       where id = e.id;
    elsif v_reflecting is null then
      v_case := 'extended';
      update public.enchantments
         set state = state || jsonb_build_object(
               'reflect', jsonb_build_object('kind', 'sun', 'dream', true, 'given', true, 'from', round(v_now), 'until', round(v_now + v_len * least(r.n, 3))),
               'r', private.ench_init('sun', now())),
             updated_at = now()
       where id = e.id;
    else
      v_case := 'waiting';
      update public.enchantments
         set state = state || jsonb_build_object('options', jsonb_build_array(jsonb_build_object('kind', 'sun', 'dream', true, 'given', true))),
             updated_at = now()
       where id = e.id;
    end if;
    perform private.ench_event(e.id, 'mirror_sun_back', jsonb_build_object('wasted', r.n, 'case', v_case, 'hours', v_hours));
    perform private.notify(e.owner_id, 'enchant', null, jsonb_build_object('sub', 'mirror_sun_back', 'id', e.id, 'kind', 'shard',
      'extended', v_case = 'extended', 'hours', v_hours, 'wasted', r.n));
  end loop;
end $$;
