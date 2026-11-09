import 'reflect-metadata';
import { carregarConfig } from './infra/config';
import { criarDependencias } from './infra/composicao';
import { criarAplicacao } from './infra/http';
import { iniciarJobDeLembretes } from './infra/jobs';
import { criarPrisma } from './infra/prisma';

async function iniciar(): Promise<void> {
  const config = carregarConfig();
  const prisma = criarPrisma({ url: config.databaseUrl, maxConexoes: 10 });
  const deps = criarDependencias(prisma, { smtp: config.smtp });
  const app = await criarAplicacao(deps, {
    producao: config.producao,
    webOrigin: config.webOrigin,
  });
  // RN-24: lembretes a cada minuto (LEMBRETES_ATIVOS=false desliga).
  const pararLembretes = config.lembretesAtivos ? iniciarJobDeLembretes(deps) : () => undefined;
  app.enableShutdownHooks();
  await app.listen(config.porta);
  console.log(`API em http://localhost:${config.porta} (docs em /docs)`);
  const encerrar = async () => {
    pararLembretes();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => void encerrar());
  process.once('SIGTERM', () => void encerrar());
}

void iniciar();
