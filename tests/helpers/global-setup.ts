// Starts one real PostgreSQL server (embedded-postgres) for the whole test run.
// Each SQL test file creates its own database from the migrations.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';

let pg: EmbeddedPostgres | null = null;

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
