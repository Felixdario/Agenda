import { CodigoErro, StatusAgendamento } from '@agenda/shared';
import {
  type Resultado,
  ehEstabelecimento,
  falha,
  ok,
  podeCancelar,
  transicionar,
} from '../domain';
import { type AgendamentoDto, naoEncontrado, paraDto } from './contexto';
import type { AgendamentoDados, AtorAplicacao, Dependencias } from './portas';

export interface ComandoStatus {
  readonly agendamentoId: string;
  readonly ator: AtorAplicacao;
  readonly motivo?: string;
  /**
   * Autorização sobre a linha JÁ TRAVADA (FOR UPDATE), antes de qualquer outra regra. Fecha a
   * janela entre a autorização feita fora da transação e a escrita (RN-23): se o agendamento mudou
   * de profissional nesse meio-tempo, a decisão é tomada sobre o estado atual. Negou → nada é gravado.
   */
  readonly autorizar?: (agendamento: AgendamentoDados) => Resultado;
}

/** RN-15 / RN-19: muda o status com trava da linha e grava o histórico. */
async function mudarStatus(
  deps: Dependencias,
  cmd: ComandoStatus,
  para: StatusAgendamento,
): Promise<Resultado<AgendamentoDto>> {
  return deps.uow.transacao(async (repo) => {
    const agora = deps.relogio.agora();
    // A linha fica travada (FOR UPDATE) e é lida depois da trava: mudanças de status do mesmo
    // agendamento são serializadas.
    const ag = await repo.agendamento(cmd.agendamentoId, { travar: true });
    if (ag === null) return naoEncontrado('agendamento');
    const autorizado = cmd.autorizar?.(ag);
    if (autorizado !== undefined && !autorizado.ok) return autorizado;
    // NAO_COMPARECEU muda a contagem do RN-18, que agendar/remarcar leem sob a trava do cliente.
    if (para === StatusAgendamento.NAO_COMPARECEU) await repo.travar([`cliente:${ag.clienteId}`]);
    const estab = await repo.estabelecimento(ag.estabelecimentoId);
    if (estab === null) return naoEncontrado('estabelecimento');

    let r: Resultado<unknown>;
    if (para === StatusAgendamento.CANCELADO) {
      r = podeCancelar({
        agendamento: ag,
        ator: cmd.ator.papel,
        agora,
        politicas: estab.politicas,
      });
    } else if (para === StatusAgendamento.CONFIRMADO && !ehEstabelecimento(cmd.ator.papel)) {
      // D-11.7: só o estabelecimento confirma.
      r = falha(CodigoErro.ACESSO_NEGADO);
    } else {
      r = transicionar(ag.status, para, { ator: cmd.ator.papel, agora, inicio: ag.inicio });
    }
    if (!r.ok) return r;

    const escrita = await repo.atualizarStatus(ag.id, ag.versao, para, agora);
    if (!escrita.ok)
      return falha(CodigoErro.TRANSICAO_DE_STATUS_INVALIDA, { motivo: 'CONCORRENCIA' });
    await repo.registrarHistorico({
      agendamentoId: ag.id,
      tipo: 'STATUS',
      de: ag.status,
      para,
      autorUsuarioId: cmd.ator.usuarioId,
      em: agora,
      ...(cmd.motivo === undefined ? {} : { motivo: cmd.motivo }),
    });
    return ok(paraDto(escrita.valor));
  });
}

/** RN-15: cancela; o horário fica livre na hora (RN-06). */
export const cancelar = (deps: Dependencias, cmd: ComandoStatus) =>
  mudarStatus(deps, cmd, StatusAgendamento.CANCELADO);

/** RN-19: PENDENTE → CONFIRMADO (estabelecimento). */
export const confirmar = (deps: Dependencias, cmd: ComandoStatus) =>
  mudarStatus(deps, cmd, StatusAgendamento.CONFIRMADO);

/** RN-19: CONFIRMADO → CONCLUIDO, depois do início. */
export const concluir = (deps: Dependencias, cmd: ComandoStatus) =>
  mudarStatus(deps, cmd, StatusAgendamento.CONCLUIDO);

/** RN-18 / RN-19: CONFIRMADO → NAO_COMPARECEU, depois do início. */
export const marcarNaoComparecimento = (deps: Dependencias, cmd: ComandoStatus) =>
  mudarStatus(deps, cmd, StatusAgendamento.NAO_COMPARECEU);
