// Read-only health check for Inkborn sanctuaries (run by .github/workflows/diag.yml).
// Prints counts only — never player names, emails or locations.
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) return [{ error: `HTTP ${res.status}: ${text.slice(0, 400)}` }];
  try { return JSON.parse(text); } catch { return [{ text: text.slice(0, 400) }]; }
}
const out = (title, rows) => console.log(`::warning title=${title}::${JSON.stringify(rows).replace(/\r?\n/g, ' ').replace(/%/g, '%25').slice(0, 3500)}`);
out('inkborn_homes', await query(`select (habitat_id is not null) housed, count(*) n, count(distinct owner_id) owners from public.inkborn group by 1`));
out('habitats_by_kind', await query(`select h.kind, g.kind gkind, g.status, count(*) n, count(*) filter (where exists (select 1 from public.inkborn c where c.habitat_id = h.id)) with_creatures
  from public.habitats h left join public.canvas_groups g on g.id = h.group_id group by 1, 2, 3 order by 4 desc`));
out('directory_candidates', await query(`select count(*) n, count(*) filter (where pr.is_hidden) hidden, count(*) filter (where pl.status = 'banned') banned, count(distinct h.owner_id) owners
  from public.habitats h join public.players pl on pl.id = h.owner_id join public.profiles pr on pr.id = h.owner_id
  left join public.canvas_groups g on g.id = h.group_id
  where exists (select 1 from public.inkborn c where c.habitat_id = h.id) and (h.kind = 'starter' or (g.kind = 'habitat' and g.status = 'active'))`));
out('directory_function', await query(`select p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('sanctuary_directory', 'inkborn_set_companion')`));
out('player_status', await query(`select status, count(*) from public.players group by 1`));
out('migrations_latest', await query(`select name, applied_at from landvas_meta.migrations order by applied_at desc limit 4`));
