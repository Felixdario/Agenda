import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Papel } from '@agenda/shared';
import type { DependenciasApp } from '../../src/application';
import { criarDependencias } from '../../src/infra/composicao';
import { NotificadorEmMemoria } from '../../src/infra/email';
import { criarAplicacao } from '../../src/infra/http';
import { type PrismaClient, criarPrisma } from '../../src/infra/prisma';
import { PERFIL_TESTE, criarHasherArgon2 } from '../../src/infra/seguranca';
import { AGORA, FUSO, RelogioDeTeste } from './apoio';
import { urlDeTeste } from './banco';

export const WEB_ORIGIN = 'http://localhost:3000';
export const SENHA = 'senha-de-teste';

export interface ApiDeTeste {
  prisma: PrismaClient;
  relogio: RelogioDeTeste;
  notificador: NotificadorEmMemoria;
  erros: unknown[];
  deps: DependenciasApp;
  app: INestApplication;
  url: string;
  http(): ReturnType<typeof request>;
  limpar(): Promise<void>;
  fechar(): Promise<void>;
}

/** App Nest completa contra agenda_test, com relógio fixo, e-mail em memória e argon2 barato. */
export async function criarApi(maxConexoes = 30): Promise<ApiDeTeste> {
  const prisma = criarPrisma({ url: urlDeTeste(), maxConexoes });
  const relogio = new RelogioDeTeste();
  const notificador = new NotificadorEmMemoria();
  const erros: unknown[] = [];
  const deps = criarDependencias(prisma, {
    relogio,
    notificador,
    hasher: criarHasherArgon2(PERFIL_TESTE),
    registro: { erro: (mensagem, erro) => erros.push({ mensagem, erro }) },
  });
  const app = await criarAplicacao(deps, { producao: false, webOrigin: WEB_ORIGIN, logger: false });
  await app.listen(0, '127.0.0.1');
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  return {
    prisma,
    relogio,
    notificador,
    erros,
    deps,
    app,
    url,
    http: () => request(url),
    async limpar() {
      relogio.instante = AGORA;
      notificador.enviados.length = 0;
      notificador.falharProximos = 0;
      erros.length = 0;
      await prisma.$executeRawUnsafe(
        `TRUNCATE "Sessao", "ChaveIdempotencia", "HistoricoStatus", "Agendamento", "Bloqueio", "Excecao",
                  "JornadaIntervalo", "ProfissionalServico", "Cliente", "Usuario", "Servico", "Profissional",
                  "Estabelecimento" RESTART IDENTITY CASCADE`,
      );
    },
    async fechar() {
      await app.close();
      await prisma.$disconnect();
    },
  };
}

const JORNADA = [1, 2, 3, 4, 5].flatMap((dia) => [
  { diaSemana: dia, inicio: '09:00', fim: '12:00' },
  { diaSemana: dia, inicio: '13:00', fim: '18:00' },
]);

export interface Estab {
  id: string;
  slug: string;
  servicoId: string;
  /** Serviço que nenhum profissional executa. */
  servicoOrfaoId: string;
  profissionalIds: [string, string];
}

/** Estabelecimento em SP com 2 profissionais (seg–sex 09–12, 13–18) e um serviço de 30 min. */
export async function criarEstab(
  prisma: PrismaClient,
  slug: string,
  opcoes: { confirmacaoAutomatica?: boolean } = {},
): Promise<Estab> {
  const e = await prisma.estabelecimento.create({
    data: {
      slug,
      nome: `Estab ${slug}`,
      fuso: FUSO,
      confirmacaoAutomatica: opcoes.confirmacaoAutomatica ?? true,
    },
  });
  const s = await prisma.servico.create({
    data: { estabelecimentoId: e.id, nome: 'Corte', duracaoMin: 30, precoCentavos: 5000 },
  });
  const orfao = await prisma.servico.create({
    data: {
      estabelecimentoId: e.id,
      nome: 'Sem profissional',
      duracaoMin: 30,
      precoCentavos: 1000,
    },
  });
  const ps: string[] = [];
  for (let i = 0; i < 2; i++) {
    const p = await prisma.profissional.create({
      data: {
        estabelecimentoId: e.id,
        nome: `Prof ${i + 1} ${slug}`,
        criadoEm: new Date(Date.UTC(2026, 0, 1 + i)),
        servicos: { create: { servicoId: s.id } },
        jornada: { createMany: { data: JORNADA } },
      },
    });
    ps.push(p.id);
  }
  return {
    id: e.id,
    slug,
    servicoId: s.id,
    servicoOrfaoId: orfao.id,
    profissionalIds: ps as [string, string],
  };
}

/** Cria o usuário direto no banco (hash barato) e devolve o token de uma sessão via POST /auth/login. */
export async function usuarioComSessao(
  api: ApiDeTeste,
  dados: {
    email: string;
    papel: Papel;
    estabelecimentoId?: string;
    profissionalId?: string;
    nome?: string;
  },
): Promise<{ id: string; token: string; auth: string }> {
  const u = await api.prisma.usuario.create({
    data: {
      email: dados.email,
      nome: dados.nome ?? dados.email.split('@')[0]!,
      papel: dados.papel,
      senhaHash: await api.deps.hasher.hash(SENHA),
      estabelecimentoId: dados.estabelecimentoId ?? null,
      profissionalId: dados.profissionalId ?? null,
    },
  });
  const r = await api.http().post('/auth/login').send({ email: dados.email, senha: SENHA });
  if (r.status !== 200) throw new Error(`login falhou: ${r.status} ${JSON.stringify(r.body)}`);
  return { id: u.id, token: r.body.token as string, auth: `Bearer ${r.body.token as string}` };
}
