import type {
  AgendamentoDetalhado,
  BloqueioDados,
  ClienteResumo,
  DadosProfissional,
  DadosServico,
  EstabelecimentoCompleto,
  ExcecaoDados,
  ExcecaoListada,
  HistoricoDados,
  ProfissionalCadastro,
  RepositorioCadastro,
  ServicoCadastro,
  UnidadeCadastro,
  UsuarioDados,
} from '../../application/portas-app';
import type { Excecao, Intervalo, Politicas } from '../../domain';
import type { Prisma, PrismaClient } from './generated/client';
import type { ClienteBanco } from './repositorio-agenda';

const data = (ms: number) => new Date(ms);
const ms = (d: Date) => d.getTime();
const msOuNulo = (d: Date | null) => (d === null ? null : d.getTime());
const colunaDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

type LinhaEstab = Prisma.EstabelecimentoGetPayload<object>;
function paraEstab(e: LinhaEstab): EstabelecimentoCompleto {
  return {
    id: e.id,
    slug: e.slug,
    nome: e.nome,
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

const paraUsuario = (u: Prisma.UsuarioGetPayload<object>): UsuarioDados => ({
  id: u.id,
  email: u.email,
  nome: u.nome,
  senhaHash: u.senhaHash,
  papel: u.papel,
  estabelecimentoId: u.estabelecimentoId,
  profissionalId: u.profissionalId,
});

const paraServico = (s: Prisma.ServicoGetPayload<object>): ServicoCadastro => ({
  id: s.id,
  estabelecimentoId: s.estabelecimentoId,
  nome: s.nome,
  duracaoMin: s.duracaoMin,
  precoCentavos: s.precoCentavos,
  preparoMin: s.preparoMin,
  limpezaMin: s.limpezaMin,
  ativo: s.ativo,
});

const comServicos = { servicos: { select: { servicoId: true } } } as const;
const paraProfissional = (
  p: Prisma.ProfissionalGetPayload<{ include: typeof comServicos }>,
): ProfissionalCadastro => ({
  id: p.id,
  estabelecimentoId: p.estabelecimentoId,
  nome: p.nome,
  ativo: p.ativo,
  criadoEm: ms(p.criadoEm),
  servicoIds: p.servicos.map((s) => s.servicoId),
});

const detalhe = {
  estabelecimento: { select: { nome: true, slug: true, fuso: true } },
  profissional: { select: { nome: true } },
  cliente: { select: { usuario: { select: { id: true, nome: true, email: true } } } },
} as const;
type LinhaDetalhada = Prisma.AgendamentoGetPayload<{ include: typeof detalhe }>;
const paraDetalhado = (a: LinhaDetalhada): AgendamentoDetalhado => ({
  id: a.id,
  estabelecimentoId: a.estabelecimentoId,
  estabelecimentoNome: a.estabelecimento.nome,
  estabelecimentoSlug: a.estabelecimento.slug,
  fuso: a.estabelecimento.fuso,
  profissionalId: a.profissionalId,
  profissionalNome: a.profissional.nome,
  clienteId: a.clienteId,
  clienteUsuarioId: a.cliente.usuario.id,
  clienteNome: a.cliente.usuario.nome,
  clienteEmail: a.cliente.usuario.email,
  servicoId: a.servicoId,
  servicoNome: a.servicoNome,
  duracaoMin: a.duracaoMin,
  precoCentavos: a.precoCentavos,
  preparoMin: a.preparoMin,
  limpezaMin: a.limpezaMin,
  inicio: ms(a.inicio),
  fim: ms(a.fim),
  inicioBloco: ms(a.inicioBloco),
  fimBloco: ms(a.fimBloco),
  status: a.status,
  versao: a.versao,
});

/** RN-17/RN-18: só os status que entram nas contagens. */
const STATUS_CONTADOS: ('PENDENTE' | 'CONFIRMADO' | 'NAO_COMPARECEU')[] = [
  'PENDENTE',
  'CONFIRMADO',
  'NAO_COMPARECEU',
];
const comCliente = {
  usuario: { select: { nome: true, email: true } },
  agendamentos: {
    where: { status: { in: STATUS_CONTADOS } },
    select: { inicio: true, status: true },
  },
} satisfies Prisma.ClienteInclude;
const paraCliente = (
  c: Prisma.ClienteGetPayload<{ include: typeof comCliente }>,
): ClienteResumo => ({
  id: c.id,
  usuarioId: c.usuarioId,
  estabelecimentoId: c.estabelecimentoId,
  nome: c.usuario.nome,
  email: c.usuario.email,
  desbloqueadoEm: msOuNulo(c.desbloqueadoEm),
  agendamentos: c.agendamentos.map((a) => ({ inicio: ms(a.inicio), status: a.status })),
});

/** Código de violação de unicidade do Prisma. */
function ehUnicidade(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';
}

export class RepositorioCadastroPrisma implements RepositorioCadastro {
  constructor(private readonly db: ClienteBanco) {}

  async travar(chaves: readonly string[]): Promise<void> {
    for (const chave of [...new Set(chaves)].sort()) {
      await this.db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${chave}, 0))`;
    }
  }

  // ── usuários e sessões
  async usuarioPorEmail(email: string) {
    const u = await this.db.usuario.findUnique({ where: { email } });
    return u === null ? null : paraUsuario(u);
  }
  async usuarioPorId(id: string) {
    const u = await this.db.usuario.findUnique({ where: { id } });
    return u === null ? null : paraUsuario(u);
  }
  async criarUsuario(u: Omit<UsuarioDados, 'id'>) {
    try {
      return paraUsuario(await this.db.usuario.create({ data: { ...u } }));
    } catch (e) {
      if (ehUnicidade(e)) return null;
      throw e;
    }
  }
  async criarSessao(s: {
    usuarioId: string;
    tokenHash: string;
    criadaEm: number;
    expiraEm: number;
  }) {
    await this.db.sessao.create({
      data: {
        usuarioId: s.usuarioId,
        tokenHash: s.tokenHash,
        criadaEm: data(s.criadaEm),
        expiraEm: data(s.expiraEm),
      },
    });
  }
  async sessaoPorTokenHash(tokenHash: string) {
    const s = await this.db.sessao.findUnique({ where: { tokenHash }, include: { usuario: true } });
    if (s === null) return null;
    return {
      usuario: paraUsuario(s.usuario),
      expiraEm: ms(s.expiraEm),
      revogadaEm: msOuNulo(s.revogadaEm),
    };
  }
  async revogarSessao(tokenHash: string, em: number) {
    await this.db.sessao.updateMany({
      where: { tokenHash, revogadaEm: null },
      data: { revogadaEm: data(em) },
    });
  }

  // ── estabelecimento
  async estabelecimentoPorSlug(slug: string) {
    const e = await this.db.estabelecimento.findUnique({ where: { slug } });
    return e === null ? null : paraEstab(e);
  }
  async estabelecimentoPorId(id: string) {
    const e = await this.db.estabelecimento.findUnique({ where: { id } });
    return e === null ? null : paraEstab(e);
  }
  async atualizarPoliticas(id: string, politicas: Partial<Omit<Politicas, 'fuso'>>) {
    return paraEstab(
      await this.db.estabelecimento.update({ where: { id }, data: { ...politicas } }),
    );
  }

  // ── serviços e profissionais
  async listarServicos(estabelecimentoId: string) {
    const ss = await this.db.servico.findMany({
      where: { estabelecimentoId },
      orderBy: { nome: 'asc' },
    });
    return ss.map(paraServico);
  }
  async servicoPorId(id: string) {
    const s = await this.db.servico.findUnique({ where: { id } });
    return s === null ? null : paraServico(s);
  }
  async criarServico(estabelecimentoId: string, dados: DadosServico) {
    return paraServico(await this.db.servico.create({ data: { ...dados, estabelecimentoId } }));
  }
  async atualizarServico(id: string, dados: Partial<DadosServico>) {
    return paraServico(await this.db.servico.update({ where: { id }, data: { ...dados } }));
  }
  async listarProfissionais(estabelecimentoId: string) {
    const ps = await this.db.profissional.findMany({
      where: { estabelecimentoId },
      include: comServicos,
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
    });
    return ps.map(paraProfissional);
  }
  async profissionalPorId(id: string) {
    const p = await this.db.profissional.findUnique({ where: { id }, include: comServicos });
    return p === null ? null : paraProfissional(p);
  }
  async criarProfissional(estabelecimentoId: string, dados: DadosProfissional, criadoEm: number) {
    const p = await this.db.profissional.create({
      data: {
        estabelecimentoId,
        nome: dados.nome,
        ativo: dados.ativo,
        criadoEm: data(criadoEm),
        servicos: { create: dados.servicoIds.map((servicoId) => ({ servicoId })) },
      },
      include: comServicos,
    });
    return paraProfissional(p);
  }
  async atualizarProfissional(id: string, dados: Partial<DadosProfissional>) {
    if (dados.servicoIds !== undefined) {
      await this.db.profissionalServico.deleteMany({ where: { profissionalId: id } });
      await this.db.profissionalServico.createMany({
        data: dados.servicoIds.map((servicoId) => ({ profissionalId: id, servicoId })),
      });
    }
    const p = await this.db.profissional.update({
      where: { id },
      data: {
        ...(dados.nome === undefined ? {} : { nome: dados.nome }),
        ...(dados.ativo === undefined ? {} : { ativo: dados.ativo }),
      },
      include: comServicos,
    });
    return paraProfissional(p);
  }
  async definirJornada(
    profissionalId: string,
    trechos: readonly { diaSemana: number; inicio: string; fim: string }[],
  ) {
    await this.db.jornadaIntervalo.deleteMany({ where: { profissionalId } });
    await this.db.jornadaIntervalo.createMany({
      data: trechos.map((t) => ({ ...t, profissionalId })),
    });
  }

  async jornadaDoProfissional(profissionalId: string) {
    return this.db.jornadaIntervalo.findMany({
      where: { profissionalId },
      select: { diaSemana: true, inicio: true, fim: true },
      orderBy: [{ diaSemana: 'asc' }, { inicio: 'asc' }],
    });
  }

  // ── exceções e bloqueios
  async criarExcecao(estabelecimentoId: string, e: Excecao & { profissionalId: string | null }) {
    return this.db.excecao.create({
      data: {
        estabelecimentoId,
        profissionalId: e.profissionalId,
        tipo: e.tipo,
        data: colunaDate(e.data),
        inicio: e.tipo === 'FERIADO' ? null : (e.inicio ?? null),
        fim: e.tipo === 'FERIADO' ? null : (e.fim ?? null),
      },
      select: { id: true },
    });
  }
  async excecaoPorId(id: string): Promise<ExcecaoDados | null> {
    return this.db.excecao.findUnique({
      where: { id },
      select: { id: true, estabelecimentoId: true, profissionalId: true },
    });
  }
  async excecoesDaData(estabelecimentoId: string, dataLocal: string): Promise<ExcecaoListada[]> {
    const linhas = await this.db.excecao.findMany({
      where: { estabelecimentoId, data: colunaDate(dataLocal) },
      orderBy: [{ tipo: 'asc' }, { inicio: 'asc' }],
    });
    return linhas.map((e) => ({
      id: e.id,
      profissionalId: e.profissionalId,
      tipo: e.tipo,
      data: dataLocal,
      inicio: e.inicio,
      fim: e.fim,
    }));
  }
  async removerExcecao(id: string) {
    await this.db.excecao.delete({ where: { id } });
  }
  async bloqueioPorId(id: string): Promise<BloqueioDados | null> {
    const b = await this.db.bloqueio.findUnique({
      where: { id },
      include: { profissional: { select: { estabelecimentoId: true } } },
    });
    if (b === null) return null;
    return {
      id: b.id,
      profissionalId: b.profissionalId,
      estabelecimentoId: b.profissional.estabelecimentoId,
      inicio: ms(b.inicio),
      fim: ms(b.fim),
      motivo: b.motivo,
    };
  }
  async removerBloqueio(id: string) {
    await this.db.bloqueio.delete({ where: { id } });
  }
  async bloqueiosNoIntervalo(profissionalIds: readonly string[], intervalo: Intervalo) {
    const bs = await this.db.bloqueio.findMany({
      where: {
        profissionalId: { in: [...profissionalIds] },
        inicio: { lt: data(intervalo.fim) },
        fim: { gt: data(intervalo.inicio) },
      },
      include: { profissional: { select: { estabelecimentoId: true } } },
      orderBy: { inicio: 'asc' },
    });
    return bs.map((b) => ({
      id: b.id,
      profissionalId: b.profissionalId,
      estabelecimentoId: b.profissional.estabelecimentoId,
      inicio: ms(b.inicio),
      fim: ms(b.fim),
      motivo: b.motivo,
    }));
  }

  // ── clientes
  async listarClientes(estabelecimentoId: string) {
    const cs = await this.db.cliente.findMany({
      where: { estabelecimentoId },
      include: comCliente,
      orderBy: { criadoEm: 'asc' },
    });
    return cs.map(paraCliente);
  }
  async clientePorId(id: string) {
    const c = await this.db.cliente.findUnique({ where: { id }, include: comCliente });
    return c === null ? null : paraCliente(c);
  }
  async clienteDoUsuario(usuarioId: string, estabelecimentoId: string) {
    const c = await this.db.cliente.findUnique({
      where: { usuarioId_estabelecimentoId: { usuarioId, estabelecimentoId } },
      include: comCliente,
    });
    return c === null ? null : paraCliente(c);
  }
  async desbloquearCliente(id: string, em: number) {
    await this.db.cliente.update({ where: { id }, data: { desbloqueadoEm: data(em) } });
  }

  // ── agendamentos
  async agendamentoDetalhado(id: string) {
    const a = await this.db.agendamento.findUnique({ where: { id }, include: detalhe });
    return a === null ? null : paraDetalhado(a);
  }
  async agendamentosDoUsuario(
    usuarioId: string,
    filtro: { readonly futuros: boolean; readonly agora: number },
  ) {
    const as = await this.db.agendamento.findMany({
      where: {
        cliente: { usuarioId },
        ...(filtro.futuros
          ? { fim: { gt: data(filtro.agora) } }
          : { fim: { lte: data(filtro.agora) } }),
      },
      include: detalhe,
      orderBy: { inicio: filtro.futuros ? 'asc' : 'desc' },
      take: 200,
    });
    return as.map(paraDetalhado);
  }
  async agendamentosNoIntervalo(profissionalIds: readonly string[], intervalo: Intervalo) {
    const as = await this.db.agendamento.findMany({
      where: {
        profissionalId: { in: [...profissionalIds] },
        inicio: { gte: data(intervalo.inicio), lt: data(intervalo.fim) },
      },
      include: detalhe,
      orderBy: { inicio: 'asc' },
    });
    return as.map(paraDetalhado);
  }
  async historico(agendamentoId: string): Promise<HistoricoDados[]> {
    const hs = await this.db.historicoStatus.findMany({
      where: { agendamentoId },
      orderBy: { em: 'asc' },
    });
    return hs.map((h) => ({
      tipo: h.tipo,
      de: h.de,
      para: h.para,
      autorUsuarioId: h.autorUsuarioId,
      em: ms(h.em),
      motivo: h.motivo,
      inicioAnterior: msOuNulo(h.inicioAnterior),
      inicioNovo: msOuNulo(h.inicioNovo),
    }));
  }

  // ── lembretes (RN-24)
  async reservarLembretes(agora: number, ate: number): Promise<string[]> {
    const linhas = await this.db.$queryRaw<{ id: string }[]>`
      UPDATE "Agendamento" SET "lembreteEnviadoEm" = ${data(agora)}::timestamptz
       WHERE "lembreteEnviadoEm" IS NULL
         AND status IN ('PENDENTE', 'CONFIRMADO')
         AND inicio > ${data(agora)}::timestamptz
         AND inicio <= ${data(ate)}::timestamptz
      RETURNING id::text AS id`;
    return linhas.map((l) => l.id);
  }
}

export class UnidadeCadastroPrisma implements UnidadeCadastro {
  constructor(private readonly prisma: PrismaClient) {}

  transacao<T>(fn: (repo: RepositorioCadastro) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => fn(new RepositorioCadastroPrisma(tx)), {
      isolationLevel: 'ReadCommitted',
      maxWait: 10_000,
      timeout: 20_000,
    });
  }

  leitura<T>(fn: (repo: RepositorioCadastro) => Promise<T>): Promise<T> {
    return fn(new RepositorioCadastroPrisma(this.prisma));
  }
}
