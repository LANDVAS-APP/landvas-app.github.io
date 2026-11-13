// Starts one real PostgreSQL server (embedded-postgres) for the whole test run.
// Each SQL test file creates its own database from the migrations.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';

let pg: EmbeddedPostgres | null = null;

// embedded-postgres registers an exit hook (async-exit-hook) that ends the process with process.exit(0) on
// 'beforeExit' — which threw away vitest's failure code: a run with failing tests still exited 0, so CI's test step
// could never fail. An explicit exit 0 now keeps a failure code that's already been set.
const exit = process.exit.bind(process);
process.exit = ((code?: number | string | null) => exit(code || process.exitCode || 0)) as typeof process.exit;

export async function setup() {
  const root = path.resolve('.pgtmp');
  fs.mkdirSync(root, { recursive: true });
  fs.chmodSync(root, 0o777);
  const dataDir = path.join(root, `data-${process.pid}`);
  fs.rmSync(dataDir, { recursive: true, force: true });
  const port = 55000 + (process.pid % 1000);
  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  process.env.LANDVAS_TEST_PG = JSON.stringify({ host: 'localhost', port, user: 'postgres', password: 'postgres' });
}

export async function teardown() {
  if (pg) await pg.stop();
}
