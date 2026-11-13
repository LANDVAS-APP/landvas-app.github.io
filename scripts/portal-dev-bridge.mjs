// Dev only: lets the portal run against a local PostgreSQL that has the LANDVAS migrations
// (for example the one the SQL tests use), with no Supabase project.
//   DATABASE_URL=postgres://postgres:postgres@localhost:54329/landvas node scripts/portal-dev-bridge.mjs
//   then start the portal with VITE_PORTAL_DEV_API=http://localhost:8790
// Every call runs as the signed-in player, exactly like PostgREST: request.jwt.claims + role authenticated.
// Never deploy this: it trusts whoever calls it.
import http from 'node:http';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:54329/landvas', max: 4 });
const port = Number(process.env.PORT || 8790);

// argument types per function, so arrays reach array parameters as arrays and everything else as JSON
const sigs = new Map();
async function argTypes(fn) {
  if (!sigs.has(fn)) {
    const r = await pool.query(`select unnest(proargnames) as name, unnest(proargtypes::regtype[]::text[]) as type from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`, [fn]);
    sigs.set(fn, Object.fromEntries(r.rows.map((x) => [x.name, x.type])));
  }
  return sigs.get(fn);
}

async function rpc(uid, aal, fn, args) {
  if (!/^[a-z_][a-z0-9_]*$/.test(fn)) throw Object.assign(new Error('invalid_function'), {});
  const types = await argTypes(fn);
  const c = await pool.connect();
  try {
    const keys = Object.keys(args || {}).filter((k) => args[k] !== undefined);
    await c.query('begin');
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid || '', role: uid ? 'authenticated' : 'anon', aal: aal || 'aal1' })]);
    await c.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
    const r = await c.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`,
      keys.map((k) => (Array.isArray(args[k]) && String(types[k] ?? '').endsWith('[]') ? args[k] : args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
    await c.query('commit');
    return r.rows[0]?.r ?? null;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') return res.end();
  const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  try {
    if (req.url === '/users') {
      const r = await pool.query(`select u.id, u.email, p.username from auth.users u left join public.profiles p on p.id = u.id order by p.username nulls last`);
      return send(200, r.rows);
    }
    if (req.url === '/rpc' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const { uid, aal, fn, args } = JSON.parse(body || '{}');
      return send(200, { data: await rpc(uid, aal, fn, args) });
    }
    send(404, { error: 'not found' });
  } catch (e) {
    send(200, { error: { message: e.message, detail: e.detail ?? null } });
  }
}).listen(port, () => console.log(`portal dev bridge on http://localhost:${port}`));
