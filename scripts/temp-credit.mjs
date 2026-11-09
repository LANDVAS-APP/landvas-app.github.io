// Fresh Start Event credit (Nov 2026 outage): reads what each player earned on the temporary event server and
// loads it into the main server's private.temp_credits (earned + 10%), then pays everyone who already has an account.
// Anyone else is paid when they sign up with the same email (see migration 20261119000111_fresh_start_credit.sql).
//
// Runs as a step of the deploy workflow, after the database migrations (the access token lives in GitHub secrets).
// Once the credits are loaded it does nothing on later deploys (so it no longer needs the temporary server), unless
// FORCE=1. Safe to run again anyway: an email already loaded is never changed, and each is paid once. Prints totals
// only — never an email (Actions logs on this repo are public).
//   TEMP_REF, MAIN_REF, SUPABASE_ACCESS_TOKEN   required
//   DRY_RUN=1                                   read and total everything, write nothing
//   FORCE=1                                     load again even though it's been loaded (new emails only)
const token = process.env.SUPABASE_ACCESS_TOKEN;
const TEMP = process.env.TEMP_REF, MAIN = process.env.MAIN_REF;
const DRY = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const BONUS = 1.10;
if (!token || !TEMP || !MAIN) { console.error('SUPABASE_ACCESS_TOKEN, TEMP_REF and MAIN_REF are required'); process.exit(1); }
if (TEMP === MAIN) { console.error('TEMP_REF and MAIN_REF are the same project'); process.exit(1); }

async function query(ref, sql, tries = 5) {
  for (let i = 1; ; i++) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (res.ok) return JSON.parse(text);
    if (i >= tries || res.status < 500) throw new Error(`HTTP ${res.status} (${ref === TEMP ? 'temp' : 'main'}): ${text.slice(0, 500)}`);
    await new Promise((r) => setTimeout(r, i * 10_000));
  }
}

// 0. already done?
const [done] = await query(MAIN, `select count(*)::int as n, count(*) filter (where credited_at is null)::int as waiting from private.temp_credits`);
if (done.n > 0 && process.env.FORCE !== '1') {
  console.log(`Fresh Start credit already loaded (${done.n} players, ${done.waiting} still to sign up) — nothing to do`);
  process.exit(0);
}

// 1. what each temp-server account earned in Ink (everything that came in, except the sign-up bonus)
const rows = await query(TEMP, `
  select lower(btrim(u.email)) as email, sum(l.delta)::bigint as earned
    from public.resource_ledger l join auth.users u on u.id = l.player_id
   where l.resource = 'ink' and l.delta > 0 and l.reason not like 'starter_bonus%' and u.email is not null and btrim(u.email) <> ''
   group by 1 having sum(l.delta) > 0`);
const credits = rows.map((r) => ({ email: r.email, earned: Number(r.earned), ink: Math.ceil(Number(r.earned) * BONUS) }));
const sum = (k) => credits.reduce((a, c) => a + c[k], 0);
console.log(`temp server: ${credits.length} players earned ${sum('earned')} Ink → ${sum('ink')} Ink with the 10% bonus`);

// 2. which of them already have a main-server account (counted on the main server; nothing printed per person)
const payload = JSON.stringify(credits);
const tag = `c${Math.random().toString(36).slice(2, 10)}`;
const list = `(select x->>'email' as email, (x->>'earned')::bigint as earned, (x->>'ink')::bigint as ink from jsonb_array_elements($${tag}$${payload}$${tag}$::jsonb) x)`;
const [m] = await query(MAIN, `
  select count(*) filter (where p.id is not null)::int as have_account, coalesce(sum(c.ink) filter (where p.id is not null), 0)::bigint as ink_now,
         count(*) filter (where p.id is null)::int as waiting, coalesce(sum(c.ink) filter (where p.id is null), 0)::bigint as ink_waiting
    from ${list} c left join auth.users u on lower(btrim(u.email)) = c.email left join public.players p on p.id = u.id`);
console.log(`main server: ${m.have_account} have an account (${m.ink_now} Ink to pay now); ${m.waiting} will get theirs on sign-up (${m.ink_waiting} Ink)`);
if (DRY) { console.log('dry run: nothing written'); process.exit(0); }

// 3. load (an email already there is left exactly as it was) and pay everyone with an account
const [ins] = await query(MAIN, `with i as (insert into private.temp_credits (email, earned, ink) select email, earned, ink from ${list} c
                                   on conflict (email) do nothing returning 1) select count(*)::int as loaded from i`);
console.log(`loaded ${ins.loaded} new credits`);
const [res] = await query(MAIN, `select private.temp_credit_apply_all() as r`);
console.log('paid:', JSON.stringify(res.r));
