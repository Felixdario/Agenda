import {
  type Resultado,
  atendimento,
  blocoDoAtendimento,
  falha,
  ok,
  origemDoAtor,
  podeRemarcar,
} from '../domain';
import { CodigoErro } from '@agenda/shared';
import {
  type AgendamentoDto,
  carregarContexto,
  comProximosHorarios,
  diaLocal,
  naoEncontrado,
  paraDto,
} from './contexto';
import { situacaoDoCliente } from './agendar';
import type { AgendamentoDados, AtorAplicacao, Dependencias } from './portas';

export interface ComandoRemarcar {
  readonly agendamentoId: string;
  readonly novoInicio: number;
  /** Opcional: troca de profissional (RN-16). */
  readonly novoProfissionalId?: string;
  readonly ator: AtorAplicacao;
  /**
   * Autorização sobre a linha JÁ TRAVADA (FOR UPDATE), antes de qualquer outra regra. Fecha a
   * janela entre a autorização feita fora da transação e a escrita (RN-23): se o agendamento mudou
   * de profissional nesse meio-tempo, a decisão é tomada sobre o estado atual. Negou → nada é gravado.
   */
  readonly autorizar?: (agendamento: AgendamentoDados) => Resultado;
}

/**
 * RN-16: UPDATE da mesma linha numa transação. A constraint de exclusão compara só com outras
 * linhas, então o agendamento não conflita consigo; se o novo horário for recusado, nada muda.
 */
export async function remarcar(
  deps: Dependencias,
  cmd: ComandoRemarcar,
): Promise<Resultado<AgendamentoDto>> {
  return deps.uow.transacao(async (repo) => {
    const agora = deps.relogio.agora();
    // A linha do agendamento fica travada (FOR UPDATE) e é lida depois da trava.
    const ag = await repo.agendamento(cmd.agendamentoId, { travar: true });
    if (ag === null) return naoEncontrado('agendamento');
    const autorizado = cmd.autorizar?.(ag);
    if (autorizado !== undefined && !autorizado.ok) return autorizado;
    const novoProfissionalId = cmd.novoProfissionalId ?? ag.profissionalId;

    // D-05: cliente (RN-18), profissional novo (conflito) e antigo (troca de profissional), em
    // ordem estável, ANTES de ler qualquer dado que será validado.
    await repo.travar([
      `cliente:${ag.clienteId}`,
      `profissional:${novoProfissionalId}`,
      `profissional:${ag.profissionalId}`,
    ]);

    const estab = await repo.estabelecimento(ag.estabelecimentoId);
    if (estab === null) return naoEncontrado('estabelecimento');
    const profissional = await repo.profissional(novoProfissionalId);
    if (profissional === null || profissional.estabelecimentoId !== estab.id) {
      return naoEncontrado('profissional');
    }
    const cliente = await repo.cliente(ag.clienteId);
    if (cliente === null) return naoEncontrado('cliente');

    // Ocupações SEM o próprio agendamento (RN-16).
    const contexto = await carregarContexto(repo, {
      estab,
      profissional,
      servico: ag.servico,
      dia: diaLocal(cmd.novoInicio, estab),
      agora,
      excetoAgendamentoId: ag.id,
    });
    const { servico: _servico, ...contextoSemServico } = contexto;
    void _servico;
    const contextoComOrigem = [{ ...contexto, origem: origemDoAtor(cmd.ator.papel) }];
    const r = podeRemarcar({
      agendamento: { inicio: ag.inicio, status: ag.status, servico: ag.servico },
      novoInicio: cmd.novoInicio,
      ator: cmd.ator.papel,
      cliente: situacaoDoCliente(cliente, agora),
      profissional: {
        ativo: profissional.ativo,
        executaServico: profissional.servicoIds.includes(ag.servicoId),
      },
      contexto: contextoSemServico,
    });
    if (!r.ok) return comProximosHorarios(r, contextoComOrigem, cmd.novoInicio);

    // RN-14: o bloco usa a cópia do serviço gravada no agendamento.
    const bloco = blocoDoAtendimento(cmd.novoInicio, ag.servico);
    const escrita = await repo.atualizarHorario(ag.id, ag.versao, {
      profissionalId: profissional.id,
      inicio: cmd.novoInicio,
      fim: atendimento(cmd.novoInicio, ag.servico).fim,
      inicioBloco: bloco.inicio,
      fimBloco: bloco.fim,
      atualizadoEm: agora,
    });
    if (!escrita.ok) {
      return comProximosHorarios(
        falha(CodigoErro.HORARIO_INDISPONIVEL),
        contextoComOrigem,
        cmd.novoInicio,
      );
    }
    await repo.registrarHistorico({
      agendamentoId: ag.id,
      tipo: 'REMARCACAO',
      de: ag.status,
      para: ag.status,
      autorUsuarioId: cmd.ator.usuarioId,
      em: agora,
      inicioAnterior: ag.inicio,
      inicioNovo: cmd.novoInicio,
      profissionalAnteriorId: ag.profissionalId,
      profissionalNovoId: profissional.id,
    });
    return ok(paraDto(escrita.valor));
  });
}
