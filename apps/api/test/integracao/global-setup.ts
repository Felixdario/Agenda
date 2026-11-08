import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { BANCO_DE_TESTE, urlAdmin, urlDeTeste } from './banco';

const raizApi = resolve(import.meta.dirname, '../..');

/** Cria `agenda_test` se preciso e aplica as migrations com `prisma migrate deploy` (nunca reset). */
export default async function setup(): Promise<void> {
  const admin = new pg.Client({ connectionString: urlAdmin() });
  await admin.connect();
  try {
    const existe = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      BANCO_DE_TESTE,
    ]);
    if (existe.rowCount === 0) await admin.query(`CREATE DATABASE ${BANCO_DE_TESTE}`);
  } finally {
    await admin.end();
  }

  execFileSync(
    process.execPath,
    [join(raizApi, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'],
    {
      cwd: raizApi,
      env: { ...process.env, DATABASE_URL: urlDeTeste(), PRISMA_HIDE_UPDATE_MESSAGE: '1' },
      stdio: 'pipe',
    },
  );
}
