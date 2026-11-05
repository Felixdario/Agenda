import { CodigoErro, Papel, StatusAgendamento } from '@agenda/shared';
import { type ProfissionalDoServico, verificarProfissional } from './alocacao';
import {
  type ContextoAgenda,
  type Origem,
  type Politicas,
  type ServicoCopia,
  validarHorario,
} from './disponibilidade';
import { type Resultado, MS_POR_HORA, OK, falha, ok } from './tipos';

/** Quem age: DONO e PROFISSIONAL são "o estabelecimento" (RN-20). */
export type Ator = Papel;

export function ehEstabelecimento(ator: Ator): boolean {
  return ator === Papel.DONO || ator === Papel.PROFISSIONAL;
}

export function origemDoAtor(ator: Ator): Origem {
  return ehEstabelecimento(ator) ? 'ESTABELECIMENTO' : 'CLIENTE';
}

/** RN-19: transições permitidas. */
export const TRANSICOES: Readonly<Record<StatusAgendamento, readonly StatusAgendamento[]>> = {
  PENDENTE: [StatusAgendamento.CONFIRMADO, StatusAgendamento.CANCELADO],
  CONFIRMADO: [
    StatusAgendamento.CONCLUIDO,
    StatusAgendamento.NAO_COMPARECEU,
    StatusAgendamento.CANCELADO,
  ],
  CONCLUIDO: [],
  NAO_COMPARECEU: [],
  CANCELADO: [],
};

/** RN-17 / D-04: ativos = PENDENTE ou CONFIRMADO. */
export function ehAtivo(status: StatusAgendamento): boolean {
  return status === StatusAgendamento.PENDENTE || status === StatusAgendamento.CONFIRMADO;
}

/** RN-19: status de nascimento. */
export function statusInicial(
  politicas: Pick<Politicas, 'confirmacaoAutomatica'>,
): StatusAgendamento {
  return politicas.confirmacaoAutomatica
    ? StatusAgendamento.CONFIRMADO
    : StatusAgendamento.PENDENTE;
}

/**
 * RN-19: valida uma transição. CONCLUIDO e NAO_COMPARECEU exigem `agora >= inicio` e ator do
 * estabelecimento (cliente → ACESSO_NEGADO). O cancelamento tem regras próprias: use `podeCancelar`.
 */
export function transicionar(
  de: StatusAgendamento,
  para: StatusAgendamento,
  { ator, agora, inicio }: { readonly ator: Ator; readonly agora: number; readonly inicio: number },
): Resultado<StatusAgendamento> {
  if (!TRANSICOES[de].includes(para)) {
    return falha(CodigoErro.TRANSICAO_DE_STATUS_INVALIDA, { de, para });
  }
  if (para === StatusAgendamento.CONCLUIDO || para === StatusAgendamento.NAO_COMPARECEU) {
    if (!ehEstabelecimento(ator)) return falha(CodigoErro.ACESSO_NEGADO);
    if (agora < inicio) {
      return falha(CodigoErro.TRANSICAO_DE_STATUS_INVALIDA, {
        de,
        para,
        motivo: 'ANTES_DO_INICIO',
      });
    }
  }
  return ok(para);
}

/** RN-19: linha de histórico gravada a cada mudança de status ou remarcação. */
export interface EntradaHistorico {
  readonly tipo: 'STATUS' | 'REMARCACAO';
  readonly statusAnterior: StatusAgendamento | null;
  readonly statusNovo: StatusAgendamento;
  readonly autorId: string;
  readonly em: number;
  readonly motivo?: string;
  readonly inicioAnterior?: number;
  readonly inicioNovo?: number;
}

/** RN-15: o cliente cancela enquanto `agora <= inicio − prazo`. */
function dentroDoPrazo(
  inicio: number,
  agora: number,
  politicas: Pick<Politicas, 'prazoCancelamentoHoras'>,
): boolean {
  return agora <= inicio - politicas.prazoCancelamentoHoras * MS_POR_HORA;
}

/**
 * RN-15: só PENDENTE/CONFIRMADO; cliente só dentro do prazo; estabelecimento a qualquer momento.
 * (Se o ator é dono do recurso é RN-23, checado na aplicação.)
 */
export function podeCancelar({
  agendamento,
  ator,
  agora,
  politicas,
}: {
  readonly agendamento: { readonly inicio: number; readonly status: StatusAgendamento };
  readonly ator: Ator;
  readonly agora: number;
  readonly politicas: Pick<Politicas, 'prazoCancelamentoHoras'>;
}): Resultado {
  if (!ehAtivo(agendamento.status)) {
    return falha(CodigoErro.TRANSICAO_DE_STATUS_INVALIDA, {
      de: agendamento.status,
      para: StatusAgendamento.CANCELADO,
    });
  }
  if (!ehEstabelecimento(ator) && !dentroDoPrazo(agendamento.inicio, agora, politicas)) {
    return falha(CodigoErro.PRAZO_DE_CANCELAMENTO_ENCERRADO);
  }
  return OK;
}

/** Situação do cliente no estabelecimento (RN-17, RN-18). */
export interface SituacaoCliente {
  /** Agendamentos PENDENTE/CONFIRMADO com início futuro (ver `contarAtivosFuturos`). */
  readonly ativosFuturos: number;
  /** NAO_COMPARECEU desde o último desbloqueio (ver `contarFaltas`). */
  readonly faltasDesdeDesbloqueio: number;
}

/** RN-17 / D-04: PENDENTE ou CONFIRMADO com `inicio > agora`. */
export function contarAtivosFuturos(
  agendamentos: readonly { readonly inicio: number; readonly status: StatusAgendamento }[],
  agora: number,
): number {
  return agendamentos.filter((a) => ehAtivo(a.status) && a.inicio > agora).length;
}

/** RN-18: NAO_COMPARECEU com início `>=` o desbloqueio (faltas anteriores deixam de contar). */
export function contarFaltas(
  agendamentos: readonly { readonly inicio: number; readonly status: StatusAgendamento }[],
  desbloqueadoEm: number | null,
): number {
  return agendamentos.filter(
    (a) =>
      a.status === StatusAgendamento.NAO_COMPARECEU &&
      (desbloqueadoEm === null || a.inicio >= desbloqueadoEm),
  ).length;
}

function verificarBloqueioCliente(cliente: SituacaoCliente, politicas: Politicas): Resultado {
  return cliente.faltasDesdeDesbloqueio >= politicas.limiteFaltas
    ? falha(CodigoErro.CLIENTE_BLOQUEADO)
    : OK;
}

/** Contexto de agenda sem a origem (derivada do ator). */
export type ContextoSemOrigem = Omit<ContextoAgenda, 'origem'>;

/**
 * Criação, na ordem da tabela: RN-18 → RN-17 → RN-11 → grade → antecedência/passado → horizonte →
 * expediente → conflito. Estabelecimento pula RN-18 e RN-17 (RN-20). Autenticação/autorização
 * (RN-23) ficam na aplicação.
 */
export function podeCriar({
  ator,
  cliente,
  profissional,
  inicio,
  contexto,
}: {
  readonly ator: Ator;
  /** Obrigatório quando o ator é CLIENTE. */
  readonly cliente?: SituacaoCliente;
  readonly profissional: ProfissionalDoServico;
  readonly inicio: number;
  readonly contexto: ContextoSemOrigem;
}): Resultado {
  if (!ehEstabelecimento(ator)) {
    if (cliente === undefined) return falha(CodigoErro.DADOS_INVALIDOS, { campo: 'cliente' });
    const bloqueio = verificarBloqueioCliente(cliente, contexto.politicas);
    if (!bloqueio.ok) return bloqueio;
    if (cliente.ativosFuturos >= contexto.politicas.limiteAgendamentosAtivos) {
      return falha(CodigoErro.LIMITE_DE_AGENDAMENTOS);
    }
  }
  const prof = verificarProfissional(profissional);
  if (!prof.ok) return prof;
  return validarHorario({ ...contexto, origem: origemDoAtor(ator), inicio });
}

/**
 * RN-16: remarcação. Só PENDENTE/CONFIRMADO. Cliente: RN-18 e prazo de RN-15 (sobre o início
 * atual). Depois RN-11 e todas as regras de horário, exceto RN-17. Usa a cópia do serviço do
 * agendamento (RN-14). `contexto.ocupacoes` deve vir SEM o bloco do próprio agendamento, para que
 * remarcar para o mesmo horário ou para um horário sobreposto ao antigo seja aceito.
 */
export function podeRemarcar({
  agendamento,
  novoInicio,
  ator,
  cliente,
  profissional,
  contexto,
}: {
  readonly agendamento: {
    readonly inicio: number;
    readonly status: StatusAgendamento;
    readonly servico: ServicoCopia;
  };
  readonly novoInicio: number;
  readonly ator: Ator;
  /** Obrigatório quando o ator é CLIENTE. */
  readonly cliente?: SituacaoCliente;
  readonly profissional: ProfissionalDoServico;
  /** Ocupações SEM o próprio agendamento. O serviço vem da cópia do agendamento. */
  readonly contexto: Omit<ContextoSemOrigem, 'servico'>;
}): Resultado {
  if (!ehAtivo(agendamento.status)) {
    return falha(CodigoErro.TRANSICAO_DE_STATUS_INVALIDA, {
      de: agendamento.status,
      motivo: 'REMARCACAO',
    });
  }
  if (!ehEstabelecimento(ator)) {
    if (cliente === undefined) return falha(CodigoErro.DADOS_INVALIDOS, { campo: 'cliente' });
    const bloqueio = verificarBloqueioCliente(cliente, contexto.politicas);
    if (!bloqueio.ok) return bloqueio;
    if (!dentroDoPrazo(agendamento.inicio, contexto.agora, contexto.politicas)) {
      return falha(CodigoErro.PRAZO_DE_CANCELAMENTO_ENCERRADO);
    }
  }
  const prof = verificarProfissional(profissional);
  if (!prof.ok) return prof;
  return validarHorario({
    ...contexto,
    servico: agendamento.servico,
    origem: origemDoAtor(ator),
    inicio: novoInicio,
  });
}
