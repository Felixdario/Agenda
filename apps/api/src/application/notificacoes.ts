import { DateTime } from 'luxon';
import type { AgendamentoDetalhado, DependenciasApp, Email } from './portas-app';

export type TipoNotificacao = 'CONFIRMACAO' | 'REMARCACAO' | 'CANCELAMENTO' | 'LEMBRETE';

const quando = (a: AgendamentoDetalhado) =>
  DateTime.fromMillis(a.inicio, { zone: a.fuso })
    .setLocale('pt-BR')
    .toFormat("cccc, dd/MM/yyyy 'às' HH:mm");

const ASSUNTO: Record<TipoNotificacao, string> = {
  CONFIRMACAO: 'Agendamento confirmado',
  REMARCACAO: 'Agendamento remarcado',
  CANCELAMENTO: 'Agendamento cancelado',
  LEMBRETE: 'Lembrete: seu horário é amanhã',
};

export function montarEmail(tipo: TipoNotificacao, a: AgendamentoDetalhado): Email {
  const linhas = [
    `Olá, ${a.clienteNome || 'cliente'}!`,
    tipo === 'CANCELAMENTO'
      ? `Seu agendamento de ${a.servicoNome} em ${a.estabelecimentoNome} foi cancelado.`
      : `${a.servicoNome} com ${a.profissionalNome} em ${a.estabelecimentoNome}.`,
    `Quando: ${quando(a)} (horário de ${a.fuso}).`,
  ];
  if (a.status === 'PENDENTE' && tipo !== 'CANCELAMENTO') {
    linhas.push('O estabelecimento ainda vai confirmar o horário.');
  }
  return {
    para: a.clienteEmail,
    assunto: `${ASSUNTO[tipo]} — ${a.estabelecimentoNome}`,
    texto: linhas.join('\n'),
  };
}

/**
 * RN-24: envia o e-mail de um agendamento. Chamado DEPOIS do commit; a falha de envio é só
 * registrada e não desfaz nada.
 */
export async function notificar(
  deps: DependenciasApp,
  agendamentoId: string,
  tipo: TipoNotificacao,
): Promise<boolean> {
  try {
    const a = await deps.cadastro.leitura((repo) => repo.agendamentoDetalhado(agendamentoId));
    if (a === null) return false;
    await deps.notificador.enviar(montarEmail(tipo, a));
    return true;
  } catch (erro) {
    deps.registro.erro(`Falha ao enviar e-mail (${tipo}) do agendamento ${agendamentoId}`, erro);
    return false;
  }
}

/**
 * RN-24: lembrete 24 h antes, uma única vez por agendamento ativo. A marcação atômica vem ANTES do
 * envio, então duas instâncias do job nunca enviam o mesmo lembrete. Se o envio falhar depois da
 * marcação, o lembrete daquele agendamento se perde (preferimos não duplicar).
 */
export async function enviarLembretes(deps: DependenciasApp): Promise<number> {
  const agora = deps.relogio.agora();
  const ids = await deps.cadastro.transacao((repo) =>
    repo.reservarLembretes(agora, agora + 24 * 3_600_000),
  );
  let enviados = 0;
  for (const id of ids) if (await notificar(deps, id, 'LEMBRETE')) enviados++;
  return enviados;
}
