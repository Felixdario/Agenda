import type { StatusAgendamento } from '@agenda/shared';
import type {
  AgendaDoProfissional,
  AgendamentoDados,
  ClienteDados,
  EntradaHistoricoGravada,
  Escrita,
  EstabelecimentoDados,
  NovoAgendamento,
  NovoHorario,
  ProfissionalDados,
  RepositorioAgenda,
  ReservaDeChave,
  ServicoDados,
} from '../../application/portas';
import { type DiaIso, type Excecao, type Jornada, type TrechoLocal, DIAS_ISO } from '../../domain';
import { ehViolacaoDeExclusao } from './erros-pg';
import type { Prisma, PrismaClient } from './generated/client';

/** Cliente Prisma da transação (ou o cliente raiz, nas leituras). */
export type ClienteBanco = Prisma.TransactionClient | PrismaClient;

const data = (ms: number) => new Date(ms);
const ms = (d: Date) => d.getTime();
/** Coluna `date` (meia-noite UTC) ↔ "yyyy-MM-dd". */
const dataLocal = (d: Date) => d.toISOString().slice(0, 10);
const colunaDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

type LinhaAgendamento = Prisma.AgendamentoGetPayload<object>;

function paraAgendamento(a: LinhaAgendamento): AgendamentoDados {
  return {
    id: a.id,
    estabelecimentoId: a.estabelecimentoId,
    profissionalId: a.profissionalId,
    clienteId: a.clienteId,
    servicoId: a.servicoId,
    servico: {
      nome: a.servicoNome,
      duracaoMin: a.duracaoMin,
      precoCentavos: a.precoCentavos,
      preparoMin: a.preparoMin,
      limpezaMin: a.limpezaMin,
    },
    inicio: ms(a.inicio),
    fim: ms(a.fim),
    inicioBloco: ms(a.inicioBloco),
    fimBloco: ms(a.fimBloco),
    status: a.status,
    versao: a.versao,
    criadoEm: ms(a.criadoEm),
  };
}

const incluirServicos = { servicos: { select: { servicoId: true } } } as const;

function paraProfissional(p: {
  id: string;
  estabelecimentoId: string;
  ativo: boolean;
  criadoEm: Date;
  servicos: { servicoId: string }[];
}): ProfissionalDados {
  return {
    id: p.id,
    estabelecimentoId: p.estabelecimentoId,
    ativo: p.ativo,
    criadoEm: ms(p.criadoEm),
    servicoIds: p.servicos.map((s) => s.servicoId),
  };
}

/**
 * Executa `fn` num SAVEPOINT. Se o banco recusar por exclusão (23P01), volta ao savepoint e a
 * transação continua utilizável (RN-12: tentar o próximo profissional na mesma requisição).
 */
async function comSavepoint<T>(db: ClienteBanco, fn: () => Promise<T>): Promise<Escrita<T>> {
  await db.$executeRawUnsafe('SAVEPOINT escrita_agenda');
  try {
    const valor = await fn();
    await db.$executeRawUnsafe('RELEASE SAVEPOINT escrita_agenda');
    return { ok: true, valor };
  } catch (e) {
    if (!ehViolacaoDeExclusao(e)) throw e;
    await db.$executeRawUnsafe('ROLLBACK TO SAVEPOINT escrita_agenda');
    return { ok: false, motivo: 'CONFLITO' };
  }
}

export class RepositorioAgendaPrisma implements RepositorioAgenda {
  constructor(private readonly db: ClienteBanco) {}

  async estabelecimento(id: string): Promise<EstabelecimentoDados | null> {
    const e = await this.db.estabelecimento.findUnique({ where: { id } });
    if (e === null) return null;
    return {
      id: e.id,
      politicas: {
        granularidadeMin: e.granularidadeMin,
        antecedenciaMinimaMin: e.antecedenciaMinimaMin,
        horizonteDias: e.horizonteDias,
        prazoCancelamentoHoras: e.prazoCancelamentoHoras,
        limiteAgendamentosAtivos: e.limiteAgendamentosAtivos,
        limiteFaltas: e.limiteFaltas,
        confirmacaoAutomatica: e.confirmacaoAutomatica,
        fuso: e.fuso,
      },
    };
  }

  async servico(id: string): Promise<ServicoDados | null> {
    const s = await this.db.servico.findUnique({ where: { id } });
    if (s === null) return null;
    return {
      id: s.id,
      estabelecimentoId: s.estabelecimentoId,
      ativo: s.ativo,
      copia: {
        nome: s.nome,
        duracaoMin: s.duracaoMin,
        preparoMin: s.preparoMin,
        limpezaMin: s.limpezaMin,
        precoCentavos: s.precoCentavos,
      },
    };
  }

  async profissional(id: string): Promise<ProfissionalDados | null> {
    const p = await this.db.profissional.findUnique({ where: { id }, include: incluirServicos });
    return p === null ? null : paraProfissional(p);
  }

  async profissionaisDoServico(
    estabelecimentoId: string,
    servicoId: string,
  ): Promise<ProfissionalDados[]> {
    const ps = await this.db.profissional.findMany({
      where: { estabelecimentoId, ativo: true, servicos: { some: { servicoId } } },
      include: incluirServicos,
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
    });
    return ps.map(paraProfissional);
  }

  async cliente(id: string): Promise<ClienteDados | null> {
    const c = await this.db.cliente.findUnique({
      where: { id },
      include: {
        agendamentos: {
          where: { status: { in: ['PENDENTE', 'CONFIRMADO', 'NAO_COMPARECEU'] } },
          select: { inicio: true, status: true },
        },
      },
    });
    if (c === null) return null;
    return {
      id: c.id,
      usuarioId: c.usuarioId,
      estabelecimentoId: c.estabelecimentoId,
      desbloqueadoEm: c.desbloqueadoEm === null ? null : ms(c.desbloqueadoEm),
      agendamentos: c.agendamentos.map((a) => ({ inicio: ms(a.inicio), status: a.status })),
    };
  }

  async agendamento(
    id: string,
    opcoes?: { readonly travar?: boolean },
  ): Promise<AgendamentoDados | null> {
    if (opcoes?.travar === true) {
      await this.db.$queryRaw`SELECT id FROM "Agendamento" WHERE id = ${id}::uuid FOR UPDATE`;
    }
    const a = await this.db.agendamento.findUnique({ where: { id } });
    return a === null ? null : paraAgendamento(a);
  }

  async agendaDoProfissional(params: {
    readonly profissionalId: string;
    readonly estabelecimentoId: string;
    readonly janela: { readonly inicio: number; readonly fim: number };
    readonly datas: { readonly de: string; readonly ate: string };
    readonly excetoAgendamentoId?: string;
  }): Promise<AgendaDoProfissional> {
    const { profissionalId, estabelecimentoId, janela } = params;
    const [linhasJornada, linhasExcecao, linhasBloqueio, linhasOcupacao] = [
      await this.db.jornadaIntervalo.findMany({ where: { profissionalId } }),
      await this.db.excecao.findMany({
        where: {
          estabelecimentoId,
          data: { gte: colunaDate(params.datas.de), lte: colunaDate(params.datas.ate) },
          OR: [{ profissionalId }, { profissionalId: null, tipo: 'FERIADO' }],
        },
      }),
      await this.db.bloqueio.findMany({
        where: {
          profissionalId,
          inicio: { lt: data(janela.fim) },
          fim: { gt: data(janela.inicio) },
        },
        select: { inicio: true, fim: true },
      }),
      await this.db.agendamento.findMany({
        where: {
          profissionalId,
          status: { not: 'CANCELADO' },
          inicioBloco: { lt: data(janela.fim) },
          fimBloco: { gt: data(janela.inicio) },
          ...(params.excetoAgendamentoId === undefined
            ? {}
            : { id: { not: params.excetoAgendamentoId } }),
        },
        select: { inicioBloco: true, fimBloco: true },
      }),
    ];

    const dias: Record<DiaIso, TrechoLocal[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
    for (const j of linhasJornada) {
      if ((DIAS_ISO as readonly number[]).includes(j.diaSemana)) {
        dias[j.diaSemana as DiaIso].push({ inicio: j.inicio, fim: j.fim });
      }
    }
    const jornada: Jornada = dias;
    const excecoes: Excecao[] = linhasExcecao.flatMap((e): Excecao[] => {
      const d = dataLocal(e.data);
      if (e.tipo === 'FERIADO') return [{ tipo: 'FERIADO', data: d }];
      if (e.tipo === 'FOLGA') {
        return [
          {
            tipo: 'FOLGA',
            data: d,
            ...(e.inicio === null ? {} : { inicio: e.inicio }),
            ...(e.fim === null ? {} : { fim: e.fim }),
          },
        ];
      }
      return e.inicio === null || e.fim === null
        ? []
        : [{ tipo: 'HORARIO_EXTRA', data: d, inicio: e.inicio, fim: e.fim }];
    });
    return {
      jornada,
      excecoes,
      bloqueios: linhasBloqueio.map((b) => ({ inicio: ms(b.inicio), fim: ms(b.fim) })),
      ocupacoes: linhasOcupacao.map((o) => ({ inicio: ms(o.inicioBloco), fim: ms(o.fimBloco) })),
    };
  }

  contarAgendamentos(
    profissionalId: string,
    intervalo: { inicio: number; fim: number },
  ): Promise<number> {
    return this.db.agendamento.count({
      where: {
        profissionalId,
        status: { not: 'CANCELADO' },
        inicio: { gte: data(intervalo.inicio), lt: data(intervalo.fim) },
      },
    });
  }

  async travar(chaves: readonly string[]): Promise<void> {
    // Ordem estável entre transações evita deadlock quando uma requisição trava várias chaves.
    for (const chave of [...new Set(chaves)].sort()) {
      await this.db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${chave}, 0))`;
    }
  }

  inserirAgendamento(novo: NovoAgendamento): Promise<Escrita<AgendamentoDados>> {
    return comSavepoint(this.db, async () =>
      paraAgendamento(
        await this.db.agendamento.create({
          data: {
            estabelecimentoId: novo.estabelecimentoId,
            profissionalId: novo.profissionalId,
            clienteId: novo.clienteId,
            servicoId: novo.servicoId,
            servicoNome: novo.servico.nome,
            duracaoMin: novo.servico.duracaoMin,
            precoCentavos: novo.servico.precoCentavos,
            preparoMin: novo.servico.preparoMin,
            limpezaMin: novo.servico.limpezaMin,
            inicio: data(novo.inicio),
            fim: data(novo.fim),
            inicioBloco: data(novo.inicioBloco),
            fimBloco: data(novo.fimBloco),
            status: novo.status,
            criadoEm: data(novo.criadoEm),
            atualizadoEm: data(novo.criadoEm),
          },
        }),
      ),
    );
  }

  async atualizarHorario(
    id: string,
    versao: number,
    novo: NovoHorario,
  ): Promise<Escrita<AgendamentoDados>> {
    const r = await comSavepoint(this.db, () =>
      this.db.agendamento.updateMany({
        where: { id, versao },
        data: {
          profissionalId: novo.profissionalId,
          inicio: data(novo.inicio),
          fim: data(novo.fim),
          inicioBloco: data(novo.inicioBloco),
          fimBloco: data(novo.fimBloco),
          atualizadoEm: data(novo.atualizadoEm),
          versao: { increment: 1 },
        },
      }),
    );
    return this.depoisDoUpdate(id, r);
  }

  async atualizarStatus(
    id: string,
    versao: number,
    status: StatusAgendamento,
    atualizadoEm: number,
  ): Promise<Escrita<AgendamentoDados>> {
    const r = await comSavepoint(this.db, () =>
      this.db.agendamento.updateMany({
        where: { id, versao },
        data: { status, atualizadoEm: data(atualizadoEm), versao: { increment: 1 } },
      }),
    );
    return this.depoisDoUpdate(id, r);
  }

  private async depoisDoUpdate(
    id: string,
    r: Escrita<{ count: number }>,
  ): Promise<Escrita<AgendamentoDados>> {
    if (!r.ok) return r;
    if (r.valor.count === 0) return { ok: false, motivo: 'VERSAO' };
    const a = await this.db.agendamento.findUniqueOrThrow({ where: { id } });
    return { ok: true, valor: paraAgendamento(a) };
  }

  async registrarHistorico(e: EntradaHistoricoGravada): Promise<void> {
    await this.db.historicoStatus.create({
      data: {
        agendamentoId: e.agendamentoId,
        tipo: e.tipo,
        de: e.de,
        para: e.para,
        autorUsuarioId: e.autorUsuarioId,
        em: data(e.em),
        motivo: e.motivo ?? null,
        inicioAnterior: e.inicioAnterior === undefined ? null : data(e.inicioAnterior),
        inicioNovo: e.inicioNovo === undefined ? null : data(e.inicioNovo),
        profissionalAnteriorId: e.profissionalAnteriorId ?? null,
        profissionalNovoId: e.profissionalNovoId ?? null,
      },
    });
  }

  async inserirBloqueio(b: {
    readonly profissionalId: string;
    readonly inicio: number;
    readonly fim: number;
    readonly motivo: string | null;
  }): Promise<{ readonly id: string }> {
    return this.db.bloqueio.create({
      data: {
        profissionalId: b.profissionalId,
        inicio: data(b.inicio),
        fim: data(b.fim),
        motivo: b.motivo,
      },
      select: { id: true },
    });
  }

  async reservarChave(p: {
    readonly usuarioId: string;
    readonly chave: string;
    readonly hashCorpo: string;
    readonly agora: number;
    readonly expiraEm: number;
  }): Promise<ReservaDeChave> {
    // Com a mesma chave em voo, o INSERT espera a outra transação terminar (índice da PK).
    // Chave expirada (24 h) é reaproveitada como nova.
    const linhas = await this.db.$queryRaw<{ usuarioId: string }[]>`
      INSERT INTO "ChaveIdempotencia" ("usuarioId", "chave", "hashCorpo", "status", "criadaEm", "expiraEm")
      VALUES (${p.usuarioId}::uuid, ${p.chave}, ${p.hashCorpo}, 'EM_ANDAMENTO'::"StatusChaveIdempotencia",
              ${data(p.agora)}::timestamptz, ${data(p.expiraEm)}::timestamptz)
      ON CONFLICT ("usuarioId", "chave") DO UPDATE SET
        "hashCorpo" = EXCLUDED."hashCorpo", "status" = EXCLUDED."status", "respostaJson" = NULL,
        "agendamentoId" = NULL, "criadaEm" = EXCLUDED."criadaEm", "expiraEm" = EXCLUDED."expiraEm"
      WHERE "ChaveIdempotencia"."expiraEm" <= EXCLUDED."criadaEm"
      RETURNING "usuarioId"`;
    if (linhas.length > 0) return { nova: true };
    const existente = await this.db.chaveIdempotencia.findUniqueOrThrow({
      where: { usuarioId_chave: { usuarioId: p.usuarioId, chave: p.chave } },
    });
    return { nova: false, hashCorpo: existente.hashCorpo, resposta: existente.respostaJson };
  }

  async concluirChave(p: {
    readonly usuarioId: string;
    readonly chave: string;
    readonly resposta: unknown;
    readonly agendamentoId: string | null;
  }): Promise<void> {
    await this.db.chaveIdempotencia.update({
      where: { usuarioId_chave: { usuarioId: p.usuarioId, chave: p.chave } },
      data: {
        status: 'CONCLUIDA',
        respostaJson: p.resposta as Prisma.InputJsonValue,
        agendamentoId: p.agendamentoId,
      },
    });
  }
}
