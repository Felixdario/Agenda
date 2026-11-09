/**
 * Banco próprio dos testes E2E (`agenda_e2e`): cria se não existir, aplica as migrations
 * (`migrate deploy`) e roda o seed demo. Nunca usa `migrate reset`. Chamado pelo webServer da API
 * no playwright.config.ts, antes de a API subir, a cada execução.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../../../', import.meta.url));
const urlE2e = process.env.DATABASE_URL;
if (urlE2e === undefined || !/\/agenda_e2e(\?|$)/.test(urlE2e)) {
  throw new Error(`DATABASE_URL precisa apontar para o banco agenda_e2e (recebido: ${urlE2e})`);
}

// O driver pg é dependência da API; resolvido a partir do package.json dela.
const requireDaApi = createRequire(new URL('../../api/package.json', import.meta.url));
const { Client } = requireDaApi('pg');

const admin = new Client({ connectionString: urlE2e.replace(/\/agenda_e2e(\?.*)?$/, '/postgres') });
await admin.connect();
const existe = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'agenda_e2e'");
if (existe.rowCount === 0) {
  await admin.query('CREATE DATABASE agenda_e2e');
  console.log('[e2e] banco agenda_e2e criado');
}
await admin.end();

const executar = (comando) =>
  execSync(comando, { cwd: raiz, stdio: 'inherit', env: { ...process.env, DATABASE_URL: urlE2e } });
executar('corepack pnpm --filter @agenda/api db:migrate');
executar('corepack pnpm --filter @agenda/api db:seed');
console.log('[e2e] banco pronto (migrate deploy + seed)');
