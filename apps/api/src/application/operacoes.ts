import { CodigoErro, Papel, type StatusAgendamento, type UsuarioSessao } from '@agenda/shared';
import {
  type Excecao,
  type Jornada,
  type Resultado,
  DIAS_ISO,
  contarAtivosFuturos,
  contarFaltas,
  expedienteDoDia,
  falha,
  lerData,
  ok,
  validarExcecao,
  validarJornada,
} from '../domain';
import { agendarDetalhado } from './agendar';
import {
  type AcaoAgendamento,
  autorizarAgendamento,
  autorizarCliente,
  autorizarPainel,
  estabelecimentoDoPainel,
} from './autorizacao';
import { type AgendamentoDto, intervaloDoDia, iso } from './contexto';
import { criarBloqueio } from './criar-bloqueio';
import { type HorarioOferecido, listarHorarios } from './listar-horarios';
import { cancelar, concluir, confirmar, marcarNaoComparecimento } from './mudar-status';
import { notificar } from './notificacoes';
import type { AgendamentoDados } from './portas';
import type {
  AgendamentoDetalhado,
  AtorHttp,
  DadosProfissional,
  DadosServico,
  DependenciasApp,
  ProfissionalCadastro,
  ServicoCadastro,
} from './portas-app';
import { remarcar } from './remarcar';

/**
 * Operações expostas pela API: autorização (RN-23) + caso de uso + notificação depois do commit
 * (RN-24). Os controllers só validam a entrada e chamam estas funções.
 */

const naoEncontrado = (recurso: string) => falha(CodigoErro.NAO_ENCONTRADO, { recurso });
const ANONIMO = { usuarioId: '', papel: Papel.CLIENTE } as const;
const instante = (isoTexto: string) => Date.parse(isoTexto);

// ───────────────────────── leitura pública ─────────────────────────

export interface EstabelecimentoPublico {
  id: string;
  slug: string;
  nome: string;
  fuso: string;
  politicas: {
    granularidadeMin: number;
    antecedenciaMinimaMin: number;
    horizonteDias: number;
    prazoCancelamentoHoras: number;
  };
  /** Preparo e limpeza vão junto para o cliente ver o bloco ocupado antes de confirmar (D-02). */
  servicos: {
    id: string;
    nome: string;
    duracaoMin: number;
    precoCentavos: number;
    preparoMin: number;
    limpezaMin: number;
  }[];
  profissionais: { id: string; nome: string; servicoIds: string[] }[];
}

export async function estabelecimentoPublico(
  deps: DependenciasApp,
  slug: string,
): Promise<Resultado<EstabelecimentoPublico>> {
  return deps.cadastro.leitura(async (repo) => {
    const e = await repo.estabelecimentoPorSlug(slug);
    if (e === null) return naoEncontrado('estabelecimento');
    const servicos = (await repo.listarServicos(e.id)).filter((s) => s.ativo);
    const ativos = new Set(servicos.map((s) => s.id));
    const profissionais = (await repo.listarProfissionais(e.id)).filter((p) => p.ativo);
    return ok({
      id: e.id,
      slug: e.slug,
      nome: e.nome,
      fuso: e.politicas.fuso,
      politicas: {
        granularidadeMin: e.politicas.granularidadeMin,
        antecedenciaMinimaMin: e.politicas.antecedenciaMinimaMin,
        horizonteDias: e.politicas.horizonteDias,
        prazoCancelamentoHoras: e.politicas.prazoCancelamentoHoras,
      },
      servicos: servicos.map((s) => ({
        id: s.id,
        nome: s.nome,
        duracaoMin: s.duracaoMin,
        precoCentavos: s.precoCentavos,
        preparoMin: s.preparoMin,
        limpezaMin: s.limpezaMin,
      })),
      profissionais: profissionais.map((p) => ({
        id: p.id,
        nome: p.nome,
        servicoIds: p.servicoIds.filter((id) => ativos.has(id)),
      })),
    });
  });
}

export async function horariosPublicos(
  deps: DependenciasApp,
  ator: AtorHttp | null,
  slug: string,
  q: { servicoId: string; profissionalId?: string | undefined; data: string },
): Promise<Resultado<readonly HorarioOferecido[]>> {
  const e = await deps.cadastro.leitura((repo) => repo.estabelecimentoPorSlug(slug));
  if (e === null) return naoEncontrado('estabelecimento');
  // O balcão do próprio estabelecimento vê a grade sem antecedência/horizonte (RN-20).
  const doBalcao = ator !== null && ator.papel !== Papel.CLIENTE && ator.estabelecimentoId === e.id;
  return listarHorarios(deps, {
    estabelecimentoId: e.id,
    servicoId: q.servicoId,
    profissionalId: q.profissionalId ?? null,
    dataLocal: q.data,
    ator: doBalcao && ator !== null ? { usuarioId: ator.usuarioId, papel: ator.papel } : ANONIMO,
  });
}

// ───────────────────────── conta ─────────────────────────

export interface SituacaoNoEstabelecimento {
  clienteId: string;
  ativosFuturos: number;
  limiteAgendamentosAtivos: number;
  bloqueado: boolean;
}

/** GET /auth/eu: o usuário e, para cliente com `?estabelecimento=slug`, a situação lá (cria a linha Cliente). */
export async function eu(
  deps: DependenciasApp,
  ator: AtorHttp,
  usuario: UsuarioSessao,
  slug?: string,
): Promise<Resultado<{ usuario: UsuarioSessao; estabelecimento?: SituacaoNoEstabelecimento }>> {
  if (slug === undefined || ator.papel !== Papel.CLIENTE) return ok({ usuario });
  const e = await deps.cadastro.leitura((repo) => repo.estabelecimentoPorSlug(slug));
  if (e === null) return naoEncontrado('estabelecimento');
  const clienteId = await deps.uow.transacao((repo) => repo.garantirCliente(ator.usuarioId, e.id));
  const c = await deps.cadastro.leitura((repo) => repo.clientePorId(clienteId));
  if (c === null) return naoEncontrado('cliente');
  const agora = deps.relogio.agora();
  return ok({
    usuario,
    estabelecimento: {
      clienteId,
      ativosFuturos: contarAtivosFuturos(c.agendamentos, agora),
      limiteAgendamentosAtivos: e.politicas.limiteAgendamentosAtivos,
      bloqueado: contarFaltas(c.agendamentos, c.desbloqueadoEm) >= e.politicas.limiteFaltas,
    },
  });
}

// ───────────────────────── agendamentos ─────────────────────────

export interface AgendamentoLista {
  id: string;
  estabelecimento: { id: string; nome: string; slug: string; fuso: string };
  profissional: { id: string; nome: string };
  cliente: { id: string; nome: string; email: string };
  servico: {
    id: string;
    nome: string;
    duracaoMin: number;
    precoCentavos: number;
    preparoMin: number;
    limpezaMin: number;
  };
  inicio: string;
  fim: string;
  inicioBloco: string;
  fimBloco: string;
  status: StatusAgendamento;
  versao: number;
}

export function paraLista(a: AgendamentoDetalhado): AgendamentoLista {
  return {
    id: a.id,
    estabelecimento: {
      id: a.estabelecimentoId,
      nome: a.estabelecimentoNome,
      slug: a.estabelecimentoSlug,
      fuso: a.fuso,
    },
    profissional: { id: a.profissionalId, nome: a.profissionalNome },
    cliente: { id: a.clienteId, nome: a.clienteNome, email: a.clienteEmail },
    servico: {
      id: a.servicoId,
      nome: a.servicoNome,
      duracaoMin: a.duracaoMin,
      precoCentavos: a.precoCentavos,
      preparoMin: a.preparoMin,
      limpezaMin: a.limpezaMin,
    },
    inicio: iso(a.inicio),
    fim: iso(a.fim),
    inicioBloco: iso(a.inicioBloco),
    fimBloco: iso(a.fimBloco),
    status: a.status,
    versao: a.versao,
  };
}

/** POST /estabelecimentos/:slug/agendamentos (cliente, RN-22 com Idempotency-Key). */
export async function agendarOnline(
  deps: DependenciasApp,
  ator: AtorHttp,
  slug: string,
  entrada: { servicoId: string; profissionalId?: string | null | undefined; inicio: string },
  chaveIdempotencia?: string,
): Promise<Resultado<AgendamentoDto>> {
  const negado = autorizarCliente(ator);
  if (!negado.ok) return negado;
  const e = await deps.cadastro.leitura((repo) => repo.estabelecimentoPorSlug(slug));
  if (e === null) return naoEncontrado('estabelecimento');
  const { resultado, repetido } = await agendarDetalhado(deps, {
    estabelecimentoId: e.id,
    servicoId: entrada.servicoId,
    profissionalId: entrada.profissionalId ?? null,
    clienteUsuarioId: ator.usuarioId,
    inicio: instante(entrada.inicio),
    ator: { usuarioId: ator.usuarioId, papel: ator.papel },
    ...(chaveIdempotencia === undefined ? {} : { chaveIdempotencia }),
  });
  if (resultado.ok && !repetido) await notificar(deps, resultado.valor.id, 'CONFIRMACAO');
  return resultado;
}

/** POST /painel/agendamentos (balcão, RN-20). Cliente por e-mail; criado sem senha se não existir. */
export async function agendarNoBalcao(
  deps: DependenciasApp,
  ator: AtorHttp,
  entrada: {
    servicoId: string;
    profissionalId?: string | null | undefined;
    inicio: string;
    cliente: { email: string; nome: string };
  },
): Promise<Resultado<AgendamentoDto>> {
  const estab = estabelecimentoDoPainel(ator);
  if (!estab.ok) return estab;
  // PROFISSIONAL agenda na própria agenda ("qualquer" vira ele mesmo).
  const profissionalId =
    ator.papel === Papel.PROFISSIONAL
      ? (entrada.profissionalId ?? ator.profissionalId)
      : (entrada.profissionalId ?? null);
  const pode = autorizarPainel(
    ator,
    estab.valor,
    profissionalId === null ? {} : { profissionalId },
  );
  if (!pode.ok) return pode;

  const email = entrada.cliente.email.trim().toLowerCase();
  const usuario = await deps.cadastro.transacao(async (repo) => {
    const existente = await repo.usuarioPorEmail(email);
    if (existente !== null) return existente;
    return (
      (await repo.criarUsuario({
        email,
        nome: entrada.cliente.nome.trim(),
        senhaHash: null,
        papel: Papel.CLIENTE,
        estabelecimentoId: null,
        profissionalId: null,
      })) ?? (await repo.usuarioPorEmail(email))
    );
  });
  if (usuario === null || usuario.papel !== Papel.CLIENTE) {
    return falha(CodigoErro.DADOS_INVALIDOS, {
      campos: { 'cliente.email': 'Este e-mail não é de um cliente.' },
    });
  }
  const { resultado } = await agendarDetalhado(deps, {
    estabelecimentoId: estab.valor,
    servicoId: entrada.servicoId,
    profissionalId,
    clienteUsuarioId: usuario.id,
    inicio: instante(entrada.inicio),
    ator: { usuarioId: ator.usuarioId, papel: ator.papel },
  });
  if (resultado.ok) await notificar(deps, resultado.valor.id, 'CONFIRMACAO');
  return resultado;
}

/** GET /eu/agendamentos */
export async function meusAgendamentos(
  deps: DependenciasApp,
  ator: AtorHttp,
  escopo: 'futuros' | 'passados',
): Promise<Resultado<AgendamentoLista[]>> {
  const lista = await deps.cadastro.leitura((repo) =>
    repo.agendamentosDoUsuario(ator.usuarioId, {
      futuros: escopo === 'futuros',
      agora: deps.relogio.agora(),
    }),
  );
  return ok(lista.map(paraLista));
}

/**
 * Repete a autorização dentro da transação, sobre a linha travada (RN-23). Usa o estado atual de
 * estabelecimento e profissional; o cliente do agendamento não muda (clienteId é imutável), então
 * o usuário dele vem da leitura de fora, conferida pelo clienteId.
 */
function autorizarNaTrava(ator: AtorHttp, lido: AgendamentoDetalhado, acao: AcaoAgendamento) {
  return (travado: AgendamentoDados): Resultado => {
    if (travado.clienteId !== lido.clienteId) return naoEncontrado('agendamento');
    return autorizarAgendamento(
      ator,
      {
        estabelecimentoId: travado.estabelecimentoId,
        profissionalId: travado.profissionalId,
        clienteUsuarioId: lido.clienteUsuarioId,
      },
      acao,
    );
  };
}

async function carregarAutorizado(
  deps: DependenciasApp,
  ator: AtorHttp,
  id: string,
  acao: AcaoAgendamento,
) {
  const a = await deps.cadastro.leitura((repo) => repo.agendamentoDetalhado(id));
  if (a === null) return naoEncontrado('agendamento');
  const r = autorizarAgendamento(ator, a, acao);
  return r.ok ? ok(a) : r;
}

export type AcaoDeStatus = 'CANCELAR' | 'CONFIRMAR' | 'CONCLUIR' | 'NAO_COMPARECEU';

const CASO_DE_USO = {
  CANCELAR: cancelar,
  CONFIRMAR: confirmar,
  CONCLUIR: concluir,
  NAO_COMPARECEU: marcarNaoComparecimento,
} as const;

/** POST /agendamentos/:id/{cancelar,confirmar,concluir,nao-compareceu} */
export async function mudarStatusComoAtor(
  deps: DependenciasApp,
  ator: AtorHttp,
  id: string,
  acao: AcaoDeStatus,
  motivo?: string,
): Promise<Resultado<AgendamentoDto>> {
  const autorizado = await carregarAutorizado(deps, ator, id, acao);
  if (!autorizado.ok) return autorizado;
  const r = await CASO_DE_USO[acao](deps, {
    agendamentoId: id,
    ator: { usuarioId: ator.usuarioId, papel: ator.papel },
    autorizar: autorizarNaTrava(ator, autorizado.valor, acao),
    ...(motivo === undefined ? {} : { motivo }),
  });
  if (r.ok && acao === 'CANCELAR') await notificar(deps, id, 'CANCELAMENTO');
  return r;
}

/** POST /agendamentos/:id/remarcar */
export async function remarcarComoAtor(
  deps: DependenciasApp,
  ator: AtorHttp,
  id: string,
  entrada: { inicio: string; profissionalId?: string | undefined },
): Promise<Resultado<AgendamentoDto>> {
  const autorizado = await carregarAutorizado(deps, ator, id, 'REMARCAR');
  if (!autorizado.ok) return autorizado;
  if (
    entrada.profissionalId !== undefined &&
    entrada.profissionalId !== autorizado.valor.profissionalId
  ) {
    // Trocar de profissional: o cliente escolhe livremente no estabelecimento; o profissional só
    // pode mover para a própria agenda.
    if (ator.papel === Papel.PROFISSIONAL && entrada.profissionalId !== ator.profissionalId) {
      return falha(CodigoErro.ACESSO_NEGADO);
    }
  }
  const r = await remarcar(deps, {
    agendamentoId: id,
    novoInicio: instante(entrada.inicio),
    ...(entrada.profissionalId === undefined ? {} : { novoProfissionalId: entrada.profissionalId }),
    ator: { usuarioId: ator.usuarioId, papel: ator.papel },
    autorizar: autorizarNaTrava(ator, autorizado.valor, 'REMARCAR'),
  });
  if (r.ok) await notificar(deps, id, 'REMARCACAO');
  return r;
}

/** GET /agendamentos/:id/historico */
export async function historicoComoAtor(deps: DependenciasApp, ator: AtorHttp, id: string) {
  const autorizado = await carregarAutorizado(deps, ator, id, 'HISTORICO');
  if (!autorizado.ok) return autorizado;
  const h = await deps.cadastro.leitura((repo) => repo.historico(id));
  return ok(
    h.map((x) => ({
      tipo: x.tipo,
      de: x.de,
      para: x.para,
      autorUsuarioId: x.autorUsuarioId,
      em: iso(x.em),
      motivo: x.motivo,
      inicioAnterior: x.inicioAnterior === null ? null : iso(x.inicioAnterior),
      inicioNovo: x.inicioNovo === null ? null : iso(x.inicioNovo),
    })),
  );
}

// ───────────────────────── painel ─────────────────────────

/** GET /painel/agenda: agendamentos, bloqueios e expediente do dia, por profissional. */
export async function agendaDoPainel(
  deps: DependenciasApp,
  ator: AtorHttp,
  q: { data: string; profissionalId?: string | undefined },
) {
  const estab = estabelecimentoDoPainel(ator);
  if (!estab.ok) return estab;
  const filtro =
    ator.papel === Papel.PROFISSIONAL
      ? (q.profissionalId ?? ator.profissionalId ?? undefined)
      : q.profissionalId;
  const pode = autorizarPainel(
    ator,
    estab.valor,
    filtro === undefined ? {} : { profissionalId: filtro },
  );
  if (!pode.ok) return pode;
  const dias = lerData(q.data);
  if (dias === null)
    return falha(CodigoErro.DADOS_INVALIDOS, { campos: { data: 'Data inválida.' } });

  return deps.cadastro.leitura(async (repo) => {
    const e = await repo.estabelecimentoPorId(estab.valor);
    if (e === null) return naoEncontrado('estabelecimento');
    const todos = await repo.listarProfissionais(e.id);
    const profissionais = filtro === undefined ? todos : todos.filter((p) => p.id === filtro);
    if (filtro !== undefined && profissionais.length === 0) return naoEncontrado('profissional');
    const dia = intervaloDoDia(dias, { id: e.id, politicas: e.politicas });
    const ids = profissionais.map((p) => p.id);
    const [agendamentos, bloqueios, excecoes] = [
      await repo.agendamentosNoIntervalo(ids, dia),
      await repo.bloqueiosNoIntervalo(ids, dia),
      await repo.excecoesDaData(e.id, q.data),
    ];
    const agendas = [];
    for (const p of profissionais) {
      const agenda = await deps.uow.leitura((r) =>
        r.agendaDoProfissional({
          profissionalId: p.id,
          estabelecimentoId: e.id,
          janela: dia,
          datas: { de: q.data, ate: q.data },
        }),
      );
      agendas.push({
        profissional: { id: p.id, nome: p.nome, ativo: p.ativo },
        expediente: expedienteDoDia(agenda.jornada, agenda.excecoes, q.data, e.politicas.fuso).map(
          (t) => ({
            inicio: iso(t.inicio),
            fim: iso(t.fim),
          }),
        ),
        agendamentos: agendamentos.filter((a) => a.profissionalId === p.id).map(paraLista),
        bloqueios: bloqueios
          .filter((b) => b.profissionalId === p.id)
          .map((b) => ({ id: b.id, inicio: iso(b.inicio), fim: iso(b.fim), motivo: b.motivo })),
        // Folgas e horários extras do profissional, mais os feriados (com id, para remover).
        excecoes: excecoes
          .filter((x) => x.profissionalId === p.id || x.tipo === 'FERIADO')
          .map((x) => ({ id: x.id, tipo: x.tipo, inicio: x.inicio, fim: x.fim })),
      });
    }
    return ok({ data: q.data, fuso: e.politicas.fuso, profissionais: agendas });
  });
}

/** GET /painel/estabelecimento: nome, fuso e políticas (DONO e PROFISSIONAL leem; só o DONO edita). */
export async function estabelecimentoDoPainelCompleto(deps: DependenciasApp, ator: AtorHttp) {
  const estab = estabelecimentoDoPainel(ator);
  if (!estab.ok) return estab;
  const e = await deps.cadastro.leitura((repo) => repo.estabelecimentoPorId(estab.valor));
  if (e === null) return naoEncontrado('estabelecimento');
  const { fuso, ...politicas } = e.politicas;
  return ok({ id: e.id, slug: e.slug, nome: e.nome, fuso, politicas });
}

/** GET /painel/profissionais/:id/jornada (DONO ou o próprio PROFISSIONAL). */
export async function jornadaDoPainel(
  deps: DependenciasApp,
  ator: AtorHttp,
  profissionalId: string,
) {
  const p = await profissionalDoPainel(deps, ator, profissionalId);
  if (!p.ok) return p;
  const trechos = await deps.cadastro.leitura((repo) => repo.jornadaDoProfissional(profissionalId));
  return ok({
    profissionalId,
    dias: Object.fromEntries(
      DIAS_ISO.map((d) => [
        String(d),
        trechos.filter((t) => t.diaSemana === d).map((t) => ({ inicio: t.inicio, fim: t.fim })),
      ]),
    ),
  });
}

async function profissionalDoPainel(deps: DependenciasApp, ator: AtorHttp, profissionalId: string) {
  const estab = estabelecimentoDoPainel(ator);
  if (!estab.ok) return estab;
  const p = await deps.cadastro.leitura((repo) => repo.profissionalPorId(profissionalId));
  if (p === null || p.estabelecimentoId !== estab.valor) return naoEncontrado('profissional');
  const pode = autorizarPainel(ator, estab.valor, { profissionalId });
  return pode.ok ? ok(p) : pode;
}

/** POST /painel/bloqueios */
export async function criarBloqueioPainel(
  deps: DependenciasApp,
  ator: AtorHttp,
  b: { profissionalId: string; inicio: string; fim: string; motivo?: string | undefined },
) {
  const p = await profissionalDoPainel(deps, ator, b.profissionalId);
  if (!p.ok) return p;
  return criarBloqueio(deps, {
    profissionalId: b.profissionalId,
    inicio: instante(b.inicio),
    fim: instante(b.fim),
    ...(b.motivo === undefined ? {} : { motivo: b.motivo }),
    ator: { usuarioId: ator.usuarioId, papel: ator.papel },
  });
}

/** DELETE /painel/bloqueios/:id */
export async function removerBloqueioPainel(
  deps: DependenciasApp,
  ator: AtorHttp,
  id: string,
): Promise<Resultado<{ id: string }>> {
  const b = await deps.cadastro.leitura((repo) => repo.bloqueioPorId(id));
  const estab = estabelecimentoDoPainel(ator);
  if (!estab.ok) return estab;
  if (b === null || b.estabelecimentoId !== estab.valor) return naoEncontrado('bloqueio');
  const pode = autorizarPainel(ator, estab.valor, { profissionalId: b.profissionalId });
  if (!pode.ok) return pode;
  await deps.cadastro.transacao((repo) => repo.removerBloqueio(id));
  return ok({ id });
}

const paraServico = (s: ServicoCadastro) => ({
  id: s.id,
  nome: s.nome,
  duracaoMin: s.duracaoMin,
  precoCentavos: s.precoCentavos,
  preparoMin: s.preparoMin,
  limpezaMin: s.limpezaMin,
  ativo: s.ativo,
});

function donoDoPainel(ator: AtorHttp): Resultado<string> {
  const estab = estabelecimentoDoPainel(ator);
  if (!estab.ok) return estab;
  const pode = autorizarPainel(ator, estab.valor, { apenasDono: true });
  return pode.ok ? estab : pode;
}

export async function listarServicosPainel(deps: DependenciasApp, ator: AtorHttp) {
  const estab = donoDoPainel(ator);
  if (!estab.ok) return estab;
  return ok(
    (await deps.cadastro.leitura((repo) => repo.listarServicos(estab.valor))).map(paraServico),
  );
}

export async function criarServicoPainel(
  deps: DependenciasApp,
  ator: AtorHttp,
  dados: DadosServico,
) {
  const estab = donoDoPainel(ator);
  if (!estab.ok) return estab;
  return ok(
    paraServico(await deps.cadastro.transacao((repo) => repo.criarServico(estab.valor, dados))),
  );
}

/** PATCH /painel/servicos/:id. RN-14: os agendamentos já feitos guardam a cópia e não mudam. */
export async function editarServicoPainel(
  deps: DependenciasApp,
  ator: AtorHttp,
  id: string,
  dados: Partial<DadosServico>,
) {
  const estab = donoDoPainel(ator);
  if (!estab.ok) return estab;
  return deps.cadastro.transacao(async (repo) => {
    const s = await repo.servicoPorId(id);
    if (s === null || s.estabelecimentoId !== estab.valor) return naoEncontrado('servico');
    return ok(paraServico(await repo.atualizarServico(id, dados)));
  });
}

const paraProfissional = (p: ProfissionalCadastro) => ({
  id: p.id,
  nome: p.nome,
  ativo: p.ativo,
  servicoIds: [...p.servicoIds],
});

export async function listarProfissionaisPainel(deps: DependenciasApp, ator: AtorHttp) {
  const estab = donoDoPainel(ator);
  if (!estab.ok) return estab;
  return ok(
    (await deps.cadastro.leitura((repo) => repo.listarProfissionais(estab.valor))).map(
      paraProfissional,
    ),
  );
}

async function servicosDoEstabelecimento(
  deps: DependenciasApp,
  estabelecimentoId: string,
  ids: readonly string[],
) {
  const doEstab = new Set(
    (await deps.cadastro.leitura((repo) => repo.listarServicos(estabelecimentoId))).map(
      (s) => s.id,
    ),
  );
  const invalidos = ids.filter((id) => !doEstab.has(id));
  return invalidos.length === 0
    ? ok(undefined)
    : falha(CodigoErro.DADOS_INVALIDOS, {
        campos: { servicoIds: 'Serviço de outro estabelecimento ou inexistente.' },
      });
}

export async function criarProfissionalPainel(
  deps: DependenciasApp,
  ator: AtorHttp,
  dados: DadosProfissional,
) {
  const estab = donoDoPainel(ator);
  if (!estab.ok) return estab;
  const servicos = await servicosDoEstabelecimento(deps, estab.valor, dados.servicoIds);
  if (!servicos.ok) return servicos;
  return ok(
    paraProfissional(
      await deps.cadastro.transacao((repo) =>
        repo.criarProfissional(estab.valor, dados, deps.relogio.agora()),
      ),
    ),
  );
}

export async function editarProfissionalPainel(
  deps: DependenciasApp,
  ator: AtorHttp,
  id: string,
  dados: Partial<DadosProfissional>,
) {
  const estab = donoDoPainel(ator);
  if (!estab.ok) return estab;
  if (dados.servicoIds !== undefined) {
    const servicos = await servicosDoEstabelecimento(deps, estab.valor, dados.servicoIds);
    if (!servicos.ok) return servicos;
  }
  return deps.cadastro.transacao(async (repo) => {
    // Desativar ou mudar serviços muda a disponibilidade: mesma trava de agendar (D-05).
    await repo.travar([`profissional:${id}`]);
    const p = await repo.profissionalPorId(id);
    if (p === null || p.estabelecimentoId !== estab.valor) return naoEncontrado('profissional');
    return ok(paraProfissional(await repo.atualizarProfissional(id, dados)));
  });
}

/** PUT /painel/profissionais/:id/jornada (DONO ou o próprio PROFISSIONAL), validada pelo domínio (RN-03). */
export async function definirJornadaPainel(
  deps: DependenciasApp,
  ator: AtorHttp,
  profissionalId: string,
  dias: Partial<Record<string, readonly { inicio: string; fim: string }[]>>,
) {
  const p = await profissionalDoPainel(deps, ator, profissionalId);
  if (!p.ok) return p;
  const jornada = Object.fromEntries(
    DIAS_ISO.map((d) => [d, dias[String(d)] ?? []]),
  ) as unknown as Jornada;
  const valida = validarJornada(jornada);
  if (!valida.ok) return valida;
  await deps.cadastro.transacao(async (repo) => {
    await repo.travar([`profissional:${profissionalId}`]);
    await repo.definirJornada(
      profissionalId,
      DIAS_ISO.flatMap((d) =>
        jornada[d].map((t) => ({ diaSemana: d, inicio: t.inicio, fim: t.fim })),
      ),
    );
  });
  return ok({
    profissionalId,
    dias: Object.fromEntries(DIAS_ISO.map((d) => [String(d), jornada[d]])),
  });
}

/** POST /painel/excecoes: FERIADO só o dono; FOLGA/HORARIO_EXTRA: dono para todos, profissional para si. */
export async function criarExcecaoPainel(
  deps: DependenciasApp,
  ator: AtorHttp,
  e: Excecao & { profissionalId?: string },
) {
  const estab = estabelecimentoDoPainel(ator);
  if (!estab.ok) return estab;
  let profissionalId: string | null = null;
  if (e.tipo === 'FERIADO') {
    const pode = autorizarPainel(ator, estab.valor, { apenasDono: true });
    if (!pode.ok) return pode;
  } else {
    if (e.profissionalId === undefined)
      return falha(CodigoErro.DADOS_INVALIDOS, { campos: { profissionalId: 'Obrigatório.' } });
    const p = await profissionalDoPainel(deps, ator, e.profissionalId);
    if (!p.ok) return p;
    profissionalId = p.valor.id;
  }
  const { profissionalId: _ignorado, ...excecao } = e;
  void _ignorado;
  const valida = validarExcecao(excecao as Excecao);
  if (!valida.ok) return valida;
  return deps.cadastro.transacao(async (repo) => {
    const travas =
      profissionalId !== null
        ? [`profissional:${profissionalId}`]
        : (await repo.listarProfissionais(estab.valor)).map((p) => `profissional:${p.id}`);
    await repo.travar(travas);
    return ok(await repo.criarExcecao(estab.valor, { ...(excecao as Excecao), profissionalId }));
  });
}

export async function removerExcecaoPainel(
  deps: DependenciasApp,
  ator: AtorHttp,
  id: string,
): Promise<Resultado<{ id: string }>> {
  const estab = estabelecimentoDoPainel(ator);
  if (!estab.ok) return estab;
  const e = await deps.cadastro.leitura((repo) => repo.excecaoPorId(id));
  if (e === null || e.estabelecimentoId !== estab.valor) return naoEncontrado('excecao');
  const pode = autorizarPainel(
    ator,
    estab.valor,
    e.profissionalId === null ? { apenasDono: true } : { profissionalId: e.profissionalId },
  );
  if (!pode.ok) return pode;
  await deps.cadastro.transacao(async (repo) => {
    if (e.profissionalId !== null) await repo.travar([`profissional:${e.profissionalId}`]);
    await repo.removerExcecao(id);
  });
  return ok({ id });
}

/** GET /painel/clientes (DONO): faltas e bloqueio (RN-18) calculados pelo domínio. */
export async function listarClientesPainel(deps: DependenciasApp, ator: AtorHttp) {
  const estab = donoDoPainel(ator);
  if (!estab.ok) return estab;
  return deps.cadastro.leitura(async (repo) => {
    const e = await repo.estabelecimentoPorId(estab.valor);
    if (e === null) return naoEncontrado('estabelecimento');
    const agora = deps.relogio.agora();
    return ok(
      (await repo.listarClientes(e.id)).map((c) => {
        const faltas = contarFaltas(c.agendamentos, c.desbloqueadoEm);
        return {
          id: c.id,
          nome: c.nome,
          email: c.email,
          ativosFuturos: contarAtivosFuturos(c.agendamentos, agora),
          faltas,
          bloqueado: faltas >= e.politicas.limiteFaltas,
          desbloqueadoEm: c.desbloqueadoEm === null ? null : iso(c.desbloqueadoEm),
        };
      }),
    );
  });
}

/** POST /painel/clientes/:id/desbloquear (DONO, RN-18): faltas anteriores deixam de contar. */
export async function desbloquearClientePainel(deps: DependenciasApp, ator: AtorHttp, id: string) {
  const estab = donoDoPainel(ator);
  if (!estab.ok) return estab;
  return deps.cadastro.transacao(async (repo) => {
    // Mesma trava do cliente usada por agendar (RN-18 lido sob ela).
    await repo.travar([`cliente:${id}`]);
    const c = await repo.clientePorId(id);
    if (c === null || c.estabelecimentoId !== estab.valor) return naoEncontrado('cliente');
    const em = deps.relogio.agora();
    await repo.desbloquearCliente(id, em);
    return ok({ id, desbloqueadoEm: iso(em) });
  });
}

/** PATCH /painel/estabelecimento/politicas (DONO). */
export async function atualizarPoliticasPainel(
  deps: DependenciasApp,
  ator: AtorHttp,
  politicas: Record<string, number | boolean | undefined>,
) {
  const estab = donoDoPainel(ator);
  if (!estab.ok) return estab;
  const limpas = Object.fromEntries(Object.entries(politicas).filter(([, v]) => v !== undefined));
  const e = await deps.cadastro.transacao((repo) => repo.atualizarPoliticas(estab.valor, limpas));
  return ok({
    id: e.id,
    slug: e.slug,
    nome: e.nome,
    fuso: e.politicas.fuso,
    politicas: e.politicas,
  });
}
