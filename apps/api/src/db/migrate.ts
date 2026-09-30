import { initDb, runMigrations, closeDb } from './db.js';

async function main() {
  await initDb();
  await runMigrations();
  console.log('[db] migrations up to date');
  await closeDb();
}

main().catch((err) => {
  console.error('[db] migration failed:', err);
  process.exit(1);
});
