import 'reflect-metadata';
import { carregarConfig } from '../src/infra/config';
import { criarPrisma } from '../src/infra/prisma';
import { relogioDoSistema } from '../src/infra/relogio';
import { semearPiorCaso } from '../src/infra/seed/pior-caso';

/** `corepack pnpm --filter @agenda/api db:seed:pior-caso`: idempotente, mexe só num dia futuro. */
const config = carregarConfig();
const prisma = criarPrisma({ url: config.databaseUrl, maxConexoes: 4 });
try {
  await semearPiorCaso(prisma, { agora: relogioDoSistema.agora(), log: console.log });
} finally {
  await prisma.$disconnect();
}
