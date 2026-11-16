-- Enchantments, seen as they really run:
--  * every enchantment's clock says how fast it's running right now ('rate'): 1 normally, faster while a Clockwork is
--    spliced into it (Tempo: ×3 for a swap, ×4 for a chimera…) and on a tiny plot (+1), 0 while frozen. The game ticks
--    its timers at that speed, so a Clockwork Goose's egg visibly grows ×3 as fast instead of jumping on the next look.
--  * the Golden Goose says how its egg grows (the curve's time constant and the biggest egg), so the egg can swell live.

/** how many seconds this enchantment's clock moves per real second, right now */
create or replace function private.ench_rate(p_id uuid) returns numeric language sql stable as $$
  select case
    when exists (select 1 from public.enchantments e where e.id = p_id and e.frozen_at is not null and now() < e.frozen_until) then 0
    else 1
      -- Tempo from every Clockwork spliced in right now
      + coalesce((select sum(private.splice_strength(s.mode, s.data, me.kind, o.kind) + 1)
                    from public.enchant_splices s join public.enchantments me on me.id = p_id
                    join public.enchantments o on o.id = case when s.a = p_id then s.b else s.a end
                   where not s.folded and (s.a = p_id or (s.b = p_id and s.mode <> 'graft')) and o.kind = 'clockwork'
                     and s.started_at <= now() and s.ends_at > now()), 0)
      -- small things live fast
      + case when exists (select 1 from public.enchantments me join public.enchant_buffs b on b.kind = 'plot_tiny' and b.gx = me.gx and b.gy = me.gy
                           where me.id = p_id and b.created_at <= now() and b.expires_at > now() and not coalesce((b.data ->> 'prank')::boolean, false))
             then 1 else 0 end
  end
$$;
revoke all on function private.ench_rate(uuid) from public, anon, authenticated;

/** when the fastest clock boost on it ends (the Clockwork splice, or the tiny plot) */
create or replace function private.ench_rate_until(p_id uuid) returns timestamptz language sql stable as $$
  select greatest(
    (select max(s.ends_at) from public.enchant_splices s join public.enchantments o on o.id = case when s.a = p_id then s.b else s.a end
      where not s.folded and (s.a = p_id or (s.b = p_id and s.mode <> 'graft')) and o.kind = 'clockwork' and s.started_at <= now() and s.ends_at > now()),
    (select max(b.expires_at) from public.enchantments me join public.enchant_buffs b on b.kind = 'plot_tiny' and b.gx = me.gx and b.gy = me.gy
      where me.id = p_id and b.created_at <= now() and b.expires_at > now() and not coalesce((b.data ->> 'prank')::boolean, false)))
$$;
revoke all on function private.ench_rate_until(uuid) from public, anon, authenticated;

do $$
declare d text; n text;
  a text := $a$'frozen_until', case when e.frozen_at is not null and now() < e.frozen_until then e.frozen_until end),$a$;
begin
  d := pg_get_functiondef('private.ench_view(uuid)'::regprocedure);
  n := replace(d, a, $b$'frozen_until', case when e.frozen_at is not null and now() < e.frozen_until then e.frozen_until end,
                                'rate', private.ench_rate(e.id), 'rate_until', private.ench_rate_until(e.id)),$b$);
  if n = d then raise exception 'tempo_live: ench_view anchor not found'; end if;
  execute n;
end $$;

-- the egg's curve, for growing it live
create or replace function private.ench_view_goose(e public.enchantments, t timestamptz) returns jsonb language sql stable as $$
  select g || jsonb_build_object(
      'attention', case when g ->> 'lurking' is not null then 'A fox is at the egg!' when (g ->> 'grow')::numeric >= 85 then 'The egg is huge — collect it' end,
      'tau_h', private.ench_n('goose', 'tau_h', 6), 'max', private.ench_n('goose', 'max', 140), 'min', 6)
  from (select private.goose_eval(e, t) g) x
$$;
