import { CodigoErro } from '@agenda/shared';
import {
  type ContextoAgenda,
  type ContextoSemOrigem,
  type Falha,
  type ServicoCopia,
  falha,
  formatarData,
  instanteEmOuApos,
  paraLocal,
  proximosHorariosLivres,
  proximosHorariosLivresDeVarios,
  zona,
} from '../domain';
import type {
  AgendamentoDados,
  EstabelecimentoDados,
  ProfissionalDados,
  RepositorioAgenda,
} from './portas';

const DIA = 86_400_000;

/** Dia local (dias desde a época) de um instante no fuso do estabelecimento. */
export function diaLocal(instante: number, estab: EstabelecimentoDados): number {
  const z = zona(estab.politicas.fuso);
  return z === null ? Math.floor(instante / DIA) : paraLocal(instante, z).dias;
}

/** `[00:00 do dia, 00:00 do dia seguinte)` local, em UTC. */
export function intervaloDoDia(
  dias: number,
  estab: EstabelecimentoDados,
): { inicio: number; fim: number } {
  const z = zona(estab.politicas.fuso);
  if (z === null) return { inicio: dias * DIA, fim: (dias + 1) * DIA };
  return { inicio: instanteEmOuApos(dias, 0, z), fim: instanteEmOuApos(dias + 1, 0, z) };
}

/**
 * Carrega o contexto do domínio para um profissional, cobrindo do dia anterior ao pedido até o fim
 * do horizonte (+ folga), o suficiente para validar e para sugerir próximos horários (RN-13).
 */
export async function carregarContexto(
  repo: RepositorioAgenda,
  params: {
    readonly estab: EstabelecimentoDados;
    readonly profissional: ProfissionalDados;
    readonly servico: ServicoCopia;
    readonly dia: number;
    readonly agora: number;
    readonly excetoAgendamentoId?: string;
  },
): Promise<ContextoSemOrigem> {
  const { estab, profissional, dia } = params;
  const de = dia - 2;
  const ate = dia + estab.politicas.horizonteDias + 2;
  const agenda = await repo.agendaDoProfissional({
    profissionalId: profissional.id,
    estabelecimentoId: estab.id,
    janela: { inicio: intervaloDoDia(de, estab).inicio, fim: intervaloDoDia(ate, estab).fim },
    datas: { de: formatarData(de), ate: formatarData(ate) },
    ...(params.excetoAgendamentoId === undefined
      ? {}
      : { excetoAgendamentoId: params.excetoAgendamentoId }),
  });
  return {
    ...agenda,
    servico: params.servico,
    politicas: estab.politicas,
    agora: params.agora,
  };
}

/** RN-13: acrescenta até 5 próximos horários livres a uma recusa por HORARIO_INDISPONIVEL. */
export function comProximosHorarios(
  erro: Falha,
  contextos: readonly ContextoAgenda[],
  aPartirDe: number,
): Falha {
  if (erro.codigo !== CodigoErro.HORARIO_INDISPONIVEL) return erro;
  const proximos =
    contextos.length === 1 && contextos[0] !== undefined
      ? proximosHorariosLivres(contextos[0], aPartirDe, 5)
      : proximosHorariosLivresDeVarios(contextos, aPartirDe, 5);
  return falha(erro.codigo, {
    ...erro.detalhes,
    proximosHorarios: proximos.map(iso),
  });
}

export function iso(instante: number): string {
  return new Date(instante).toISOString();
}

export interface AgendamentoDto {
  readonly id: string;
  readonly estabelecimentoId: string;
  readonly profissionalId: string;
  readonly clienteId: string;
  readonly servicoId: string;
  readonly servicoNome: string;
  readonly duracaoMin: number;
  readonly precoCentavos: number;
  readonly preparoMin: number;
  readonly limpezaMin: number;
  readonly inicio: string;
  readonly fim: string;
  readonly status: AgendamentoDados['status'];
  readonly versao: number;
}

export function paraDto(a: AgendamentoDados): AgendamentoDto {
  return {
    id: a.id,
    estabelecimentoId: a.estabelecimentoId,
    profissionalId: a.profissionalId,
    clienteId: a.clienteId,
    servicoId: a.servicoId,
    servicoNome: a.servico.nome,
    duracaoMin: a.servico.duracaoMin,
    precoCentavos: a.servico.precoCentavos,
    preparoMin: a.servico.preparoMin,
    limpezaMin: a.servico.limpezaMin,
    inicio: iso(a.inicio),
    fim: iso(a.fim),
    status: a.status,
    versao: a.versao,
  };
}

export const naoEncontrado = (recurso: string): Falha =>
  falha(CodigoErro.NAO_ENCONTRADO, { recurso });
