// PipelineDb over node-postgres. The worker connects with a role that may
// execute public.svc_* (service_role or the database owner).
import pg from 'pg';
import type { PipelineDb } from '../src/server/pipeline';

export function pgDb(pool: pg.Pool): PipelineDb & { withPyramidLock<T>(fn: () => Promise<T>): Promise<T> } {
  return {
    async call(fn, args = {}) {
      if (!/^[a-z_][a-z0-9_]*$/.test(fn)) throw new Error('bad function name');
      const keys = Object.keys(args);
      for (const k of keys) if (!/^p_[a-z0-9_]+$/.test(k)) throw new Error('bad argument name');
      const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
      const values = keys.map((k) => {
        const v = args[k];
        return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
      });
      const r = await pool.query(sql, values);
      return r.rows[0]?.r;
    },
    async withPyramidLock(fn) {
      const client = await pool.connect();
      try {
        await client.query(`select pg_advisory_lock(hashtext('landvas:pyramid'))`);
        return await fn();
      } finally {
        await client.query(`select pg_advisory_unlock(hashtext('landvas:pyramid'))`).catch(() => {});
        client.release();
      }
    },
  };
}
