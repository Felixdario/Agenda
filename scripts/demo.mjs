/**
 * `corepack pnpm demo`: do clone limpo ao demo no ar (com `docker compose up -d` já rodado).
 * 1. cria o .env a partir do .env.example, se ele não existir;
 * 2. aplica as migrations (`migrate deploy`) e roda o seed demo;
 * 3. sobe a API e o web juntos;
 * 4. imprime as URLs e as contas demo quando o web responde.
 * Sem dependência nova: só Node e o pnpm do corepack.
 */
import { execSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const pnpm = 'corepack pnpm';

function passo(titulo, comando) {
  console.log(`\n▸ ${titulo}`);
  execSync(comando, { cwd: raiz, stdio: 'inherit' });
}

if (!existsSync(`${raiz}.env`)) {
  copyFileSync(`${raiz}.env.example`, `${raiz}.env`);
  console.log('▸ .env criado a partir do .env.example');
}

try {
  passo('Migrations (prisma migrate deploy)', `${pnpm} --filter @agenda/api db:migrate`);
} catch {
  console.error(
    '\nNão consegui falar com o Postgres. O Docker está de pé? Rode `docker compose up -d` e espere o serviço postgres ficar healthy.',
  );
  process.exit(1);
}
passo('Seed demo (Navalha & Café)', `${pnpm} --filter @agenda/api db:seed`);

console.log('\n▸ Subindo a API (:3333) e o web (:3000)…\n');
const servidores = spawn(`${pnpm} -r --parallel --filter @agenda/api --filter @agenda/web dev`, {
  cwd: raiz,
  stdio: 'inherit',
  shell: true,
});
const encerrar = () => {
  servidores.kill('SIGINT');
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
servidores.on('exit', (codigo) => process.exit(codigo ?? 0));

async function respondendo(url) {
  try {
    const r = await fetch(url);
    return r.status < 500;
  } catch {
    return false;
  }
}

for (let i = 0; i < 180; i++) {
  if (
    (await respondendo('http://localhost:3333/health')) &&
    (await respondendo('http://localhost:3000/'))
  ) {
    console.log(`
┌──────────────────────────────────────────────────────────────────┐
  Pontual no ar
  Web (cliente):   http://localhost:3000/b/navalha-e-cafe
  Web (painel):    http://localhost:3000/entrar
  API e Swagger:   http://localhost:3333/docs
  E-mails:         http://localhost:8025 (Mailpit)

  Contas demo (senha demo1234):
    dono@agenda.dev          painel completo
    profissional@agenda.dev  painel do Rafael Moura
    cliente@agenda.dev       reservas e "meus agendamentos"

  Ctrl+C encerra a API e o web.
└──────────────────────────────────────────────────────────────────┘
`);
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
