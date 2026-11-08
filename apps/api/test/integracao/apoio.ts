import { DateTime } from 'luxon';
import pg from 'pg';
import type { Dependencias, RepositorioAgenda, UnidadeDeTrabalho } from '../../src/application';
import { type PrismaClient, criarPrisma, UnidadeDeTrabalhoPrisma } from '../../src/infra/prisma';
import { urlDeTeste } from './banco';

export const FUSO = 'America/Sao_Paulo';
export const em = (iso: string) => DateTime.fromISO(iso, { zone: FUSO }).toMillis();
/** Domingo 2026-03-01 08:00 em São Paulo. */
export const AGORA = em('2026-03-01T08:00');
/** Segunda 2026-03-02 10:00. */
export const SEGUNDA_10H = em('2026-03-02T10:00');

const TABELAS = [
  'ChaveIdempotencia',
  'HistoricoStatus',
  'Agendamento',
  'Bloqueio',
  'Excecao',
  'JornadaIntervalo',
  'ProfissionalServico',
  'Cliente',
  'Usuario',
  'Servico',
  'Profissional',
  'Estabelecimento',
];

export class RelogioDeTeste {
  constructor(public instante: number = AGORA) {}
  agora = () => this.instante;
}

export interface Ambiente {
  prisma: PrismaClient;
  uow: UnidadeDeTrabalho;
  relogio: RelogioDeTeste;
  deps: Dependencias;
  limpar(): Promise<void>;
  fechar(): Promise<void>;
}

/** Pool com conexões suficientes para 20+ transações simultâneas de verdade. */
export function criarAmbiente(maxConexoes = 30): Ambiente {
  const prisma = criarPrisma({ url: urlDeTeste(), maxConexoes });
  const uow = new UnidadeDeTrabalhoPrisma(prisma, { maxWaitMs: 30_000, timeoutMs: 60_000 });
  const relogio = new RelogioDeTeste();
  return {
    prisma,
    uow,
    relogio,
    deps: { uow, relogio },
    async limpar() {
      relogio.instante = AGORA;
      await prisma.$executeRawUnsafe(
        `TRUNCATE ${TABELAS.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
      );
    },
    fechar: () => prisma.$disconnect(),
  };
}

export const pgCliente = () => new pg.Client({ connectionString: urlDeTeste() });

const JORNADA_SEMANA = [1, 2, 3, 4, 5].flatMap((dia) => [
  { diaSemana: dia, inicio: '09:00', fim: '12:00' },
  { diaSemana: dia, inicio: '13:00', fim: '18:00' },
]);

export interface Cenario {
  estabelecimentoId: string;
  donoUsuarioId: string;
  servicoId: string;
  profissionalIds: string[];
  clientes: { clienteId: string; usuarioId: string }[];
}

let sequencia = 0;

/** Estabelecimento em SP, um serviço, N profissionais (seg–sex 09–12, 13–18) e M clientes. */
export async function semear(
  prisma: PrismaClient,
  opcoes: {
    profissionais?: number;
    clientes?: number;
    confirmacaoAutomatica?: boolean;
    servico?: { duracaoMin?: number; preparoMin?: number; limpezaMin?: number };
  } = {},
): Promise<Cenario> {
  const n = ++sequencia;
  const estab = await prisma.estabelecimento.create({
    data: {
      slug: `barbearia-${n}`,
      nome: 'Barbearia',
      fuso: FUSO,
      confirmacaoAutomatica: opcoes.confirmacaoAutomatica ?? true,
    },
  });
  // senhaHash fictício: a fase 3 terá argon2 com perfil barato em teste.
  const dono = await prisma.usuario.create({
    data: { email: `dono-${n}@teste`, senhaHash: 'x', papel: 'DONO', estabelecimentoId: estab.id },
  });
  const servico = await prisma.servico.create({
    data: {
      estabelecimentoId: estab.id,
      nome: 'Corte',
      duracaoMin: opcoes.servico?.duracaoMin ?? 30,
      preparoMin: opcoes.servico?.preparoMin ?? 0,
      limpezaMin: opcoes.servico?.limpezaMin ?? 0,
      precoCentavos: 5000,
    },
  });
  const profissionalIds: string[] = [];
  for (let i = 0; i < (opcoes.profissionais ?? 1); i++) {
    const p = await prisma.profissional.create({
      data: {
        estabelecimentoId: estab.id,
        nome: `Profissional ${i + 1}`,
        criadoEm: new Date(Date.UTC(2026, 0, 1 + i)),
        servicos: { create: { servicoId: servico.id } },
        jornada: { createMany: { data: JORNADA_SEMANA } },
      },
    });
    profissionalIds.push(p.id);
  }
  const clientes: Cenario['clientes'] = [];
  for (let i = 0; i < (opcoes.clientes ?? 1); i++) {
    const u = await prisma.usuario.create({
      data: { email: `cliente-${n}-${i}@teste`, senhaHash: 'x', papel: 'CLIENTE' },
    });
    const c = await prisma.cliente.create({
      data: { usuarioId: u.id, estabelecimentoId: estab.id },
    });
    clientes.push({ clienteId: c.id, usuarioId: u.id });
  }
  return {
    estabelecimentoId: estab.id,
    donoUsuarioId: dono.id,
    servicoId: servico.id,
    profissionalIds,
    clientes,
  };
}

/** Observa o pg_stat_activity enquanto `trabalho` roda: prova de sobreposição no tempo. */
export async function observarConcorrencia<T>(trabalho: () => Promise<T>): Promise<{
  resultado: T;
  maxEsperandoTrava: number;
  conexoesDistintas: number;
}> {
  const monitor = pgCliente();
  await monitor.connect();
  let maxEsperandoTrava = 0;
  const pids = new Set<number>();
  let ativo = true;
  const amostrar = (async () => {
    while (ativo) {
      const r = await monitor.query<{ pid: number; esperando: boolean }>(
        `SELECT pid, (wait_event_type = 'Lock' AND wait_event IN ('advisory', 'transactionid', 'tuple')) AS esperando
           FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle'`,
      );
      for (const l of r.rows) pids.add(l.pid);
      maxEsperandoTrava = Math.max(maxEsperandoTrava, r.rows.filter((l) => l.esperando).length);
    }
  })();
  try {
    const resultado = await trabalho();
    return { resultado, maxEsperandoTrava, conexoesDistintas: pids.size };
  } finally {
    ativo = false;
    await amostrar;
    await monitor.end();
  }
}

/** Unidade de trabalho que "não enxerga" as ocupações: simula uma leitura obsoleta. */
export function uowCega(uow: UnidadeDeTrabalho): UnidadeDeTrabalho {
  const cegar = (repo: RepositorioAgenda): RepositorioAgenda =>
    new Proxy(repo, {
      get(alvo, prop, receptor) {
        if (prop === 'agendaDoProfissional') {
          return async (args: Parameters<RepositorioAgenda['agendaDoProfissional']>[0]) => ({
            ...(await alvo.agendaDoProfissional(args)),
            ocupacoes: [],
          });
        }
        const v: unknown = Reflect.get(alvo, prop, receptor);
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(alvo) : v;
      },
    });
  return {
    transacao: (fn) => uow.transacao((repo) => fn(cegar(repo))),
    leitura: (fn) => uow.leitura((repo) => fn(cegar(repo))),
  };
}
