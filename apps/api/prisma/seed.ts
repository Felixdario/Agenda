import 'reflect-metadata';
import { carregarConfig } from '../src/infra/config';
import { criarPrisma } from '../src/infra/prisma';
import { relogioDoSistema } from '../src/infra/relogio';
import { CONTAS_DEMO, SENHA_DEMO, semearDemo } from '../src/infra/seed/demo';
import { criarHasherArgon2 } from '../src/infra/seguranca';

/** `corepack pnpm --filter @agenda/api db:seed`: idempotente (refaz só o estabelecimento demo). */
const config = carregarConfig();
const prisma = criarPrisma({ url: config.databaseUrl, maxConexoes: 4 });
try {
  await semearDemo(prisma, {
    agora: relogioDoSistema.agora(),
    hasher: criarHasherArgon2(),
    log: console.log,
  });
  console.log(`Contas (senha "${SENHA_DEMO}"): ${Object.values(CONTAS_DEMO).join(', ')}`);
} finally {
  await prisma.$disconnect();
}
