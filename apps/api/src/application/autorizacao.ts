import { CodigoErro, Papel } from '@agenda/shared';
import { type Resultado, OK, falha } from '../domain';
import type { AtorHttp } from './portas-app';

/**
 * RN-23, em funções puras.
 * - Recurso de outro estabelecimento, ou de outro cliente → 404 NAO_ENCONTRADO (não vaza existência).
 * - Recurso visível, mas ação proibida para o papel → 403 ACESSO_NEGADO.
 */

export type AcaoAgendamento =
  'VER' | 'HISTORICO' | 'CANCELAR' | 'REMARCAR' | 'CONFIRMAR' | 'CONCLUIR' | 'NAO_COMPARECEU';

const ACOES_DO_CLIENTE: readonly AcaoAgendamento[] = ['VER', 'HISTORICO', 'CANCELAR', 'REMARCAR'];

const naoEncontrado = falha(CodigoErro.NAO_ENCONTRADO);
const negado = falha(CodigoErro.ACESSO_NEGADO);

/** O agendamento, no mínimo necessário para decidir. */
export interface AgendamentoParaAutorizar {
  readonly estabelecimentoId: string;
  readonly profissionalId: string;
  readonly clienteUsuarioId: string;
}

export function autorizarAgendamento(
  ator: AtorHttp,
  ag: AgendamentoParaAutorizar,
  acao: AcaoAgendamento,
): Resultado {
  if (ator.papel === Papel.CLIENTE) {
    if (ag.clienteUsuarioId !== ator.usuarioId) return naoEncontrado;
    return ACOES_DO_CLIENTE.includes(acao) ? OK : negado;
  }
  if (ator.estabelecimentoId !== ag.estabelecimentoId) return naoEncontrado;
  if (ator.papel === Papel.DONO) return OK;
  // PROFISSIONAL: vê o agendamento do colega (mesmo estabelecimento), mas só mexe na própria agenda.
  return ator.profissionalId === ag.profissionalId ? OK : negado;
}

/**
 * Acesso ao painel de um estabelecimento.
 * - `apenasDono`: cadastros e políticas.
 * - `profissionalId`: o recurso é da agenda desse profissional (PROFISSIONAL só a própria).
 */
export function autorizarPainel(
  ator: AtorHttp,
  estabelecimentoId: string,
  opcoes: { readonly apenasDono?: boolean; readonly profissionalId?: string } = {},
): Resultado {
  if (ator.papel === Papel.CLIENTE) return negado;
  if (ator.estabelecimentoId !== estabelecimentoId) return naoEncontrado;
  if (ator.papel === Papel.DONO) return OK;
  if (opcoes.apenasDono === true) return negado;
  if (opcoes.profissionalId !== undefined && opcoes.profissionalId !== ator.profissionalId) {
    return negado;
  }
  return OK;
}

/** Ações que só o cliente faz por si (agendar online pela página pública). */
export function autorizarCliente(ator: AtorHttp): Resultado {
  return ator.papel === Papel.CLIENTE ? OK : negado;
}

/** Estabelecimento do painel do ator (DONO/PROFISSIONAL), ou 403 para cliente. */
export function estabelecimentoDoPainel(ator: AtorHttp): Resultado<string> {
  if (ator.papel === Papel.CLIENTE || ator.estabelecimentoId === null) return negado;
  return { ok: true, valor: ator.estabelecimentoId };
}
