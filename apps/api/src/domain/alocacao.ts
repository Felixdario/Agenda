import { CodigoErro } from '@agenda/shared';
import { type Resultado, OK, falha } from './tipos';

/** Situação de um profissional para um serviço. */
export interface ProfissionalDoServico {
  readonly ativo: boolean;
  readonly executaServico: boolean;
}

/** RN-11: só profissional ativo que executa o serviço. */
export function verificarProfissional(p: ProfissionalDoServico): Resultado {
  return p.ativo && p.executaServico ? OK : falha(CodigoErro.PROFISSIONAL_NAO_EXECUTA_SERVICO);
}

export interface CandidatoProfissional {
  readonly id: string;
  /** Instante do cadastro, epoch ms. */
  readonly criadoEm: number;
  readonly executaServico: boolean;
  /** Ausente = ativo. */
  readonly ativo?: boolean;
  /** O horário pedido está livre para ele (resultado de `validarHorario`). */
  readonly livre: boolean;
  /** Agendamentos não cancelados dele na data local do pedido. */
  readonly agendamentosNoDia: number;
}

function compararTexto(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * RN-11 + RN-12: ordem de tentativa para "qualquer profissional". Filtra quem está ativo, executa
 * o serviço e tem o horário livre; ordena por menos agendamentos no dia, depois `criadoEm`, depois
 * `id`. O servidor tenta na ordem e só responde HORARIO_INDISPONIVEL se nenhum servir.
 */
export function escolherProfissional(candidatos: readonly CandidatoProfissional[]): string[] {
  return candidatos
    .filter((c) => c.ativo !== false && c.executaServico && c.livre)
    .slice()
    .sort(
      (a, b) =>
        a.agendamentosNoDia - b.agendamentosNoDia ||
        a.criadoEm - b.criadoEm ||
        compararTexto(a.id, b.id),
    )
    .map((c) => c.id);
}
