-- "How strong is this gene?" without building the partner list. ench_has_gene is asked by ~25 enchantment helpers
-- (dodges, reaches, wearers, eggs, boxes, the act handlers…); each ask built the enchantment's whole partner list —
-- names, hybrids, friends' profiles — just to read two numbers from it. It now reads the same live splices directly,
-- with the same rules as private.ench_partners (which rows count, which gene, how strong) and none of the dressing.
-- PL/pgSQL so its plan is kept (see "Keeping the database light" in CLAUDE.md).
--
-- Keep the two in step: tests/sql/525-genes-from-splices.test.ts checks this against the partner list for every
-- enchantment and gene, so a change to ench_partners' rules that isn't made here too shows up there.
create or replace function private.ench_has_gene(p_id uuid, p_gene text)
returns integer
language plpgsql stable as $$
#variable_conflict use_column
begin
  return (
    select coalesce(max(private.splice_strength(s.mode, s.data, me.kind, o.kind)), 0)
      from public.enchant_splices s
      join public.enchantments me on me.id = p_id
      left join public.enchantments o on o.id = case when s.a = p_id then s.b else s.a end
     where (s.a = p_id or (s.b = p_id and s.mode <> 'graft')) and s.started_at <= now() and s.ends_at > now()
       and (o.id is not null or s.b is null)
       and (case when o.id is not null then private.ench_info(o.kind) ->> 'gene' else private.plot_trait(s.data ->> 'plot_kind') end) = p_gene);
end $$;
