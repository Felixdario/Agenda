import { CodigoErro } from '@agenda/shared';
import {
  type ContextoSemOrigem,
  type Falha,
  type Resultado,
  atendimento,
  blocoDoAtendimento,
  contarAtivosFuturos,
  contarFaltas,
  escolherProfissional,
  falha,
  ok,
  origemDoAtor,
  podeCriar,
  statusInicial,
  verificarProfissional,
} from '../domain';
import {
  type AgendamentoDto,
  carregarContexto,
  comProximosHorarios,
  diaLocal,
  intervaloDoDia,
  naoEncontrado,
  paraDto,
} from './contexto';
import { hashDoCorpo } from './idempotencia';
import type {
  AtorAplicacao,
  ClienteDados,
  Dependencias,
  ProfissionalDados,
  RepositorioAgenda,
} from './portas';

export interface ComandoAgendar {
  readonly estabelecimentoId: string;
  readonly servicoId: string;
  /** `null` = "qualquer profissional" (RN-12). */
  readonly profissionalId: string | null;
  readonly clienteId: string;
  /** Epoch ms. */
  readonly inicio: number;
  readonly ator: AtorAplicacao;
  /** RN-22: header Idempotency-Key. */
  readonly chaveIdempotencia?: string;
}

const VALIDADE_CHAVE_MS = 24 * 3_600_000;

/**
 * Prioridade das recusas quando ninguém serve em "qualquer profissional": a que chegou mais longe
 * na ordem de checagem da tabela de erros (o conflito é o último passo).
 */
const ORDEM_DE_CHECAGEM: readonly CodigoErro[] = [
  CodigoErro.DADOS_INVALIDOS,
  CodigoErro.CLIENTE_BLOQUEADO,
  CodigoErro.LIMITE_DE_AGENDAMENTOS,
  CodigoErro.PROFISSIONAL_NAO_EXECUTA_SERVICO,
  CodigoErro.HORARIO_FORA_DA_GRADE,
  CodigoErro.ANTECEDENCIA_MINIMA,
  CodigoErro.HORARIO_NO_PASSADO,
  CodigoErro.ALEM_DO_HORIZONTE,
  CodigoErro.FORA_DO_EXPEDIENTE,
  CodigoErro.HORARIO_INDISPONIVEL,
];

function maisAdiante(erros: readonly Falha[]): Falha {
  return erros.reduce((a, b) =>
    ORDEM_DE_CHECAGEM.indexOf(b.codigo) > ORDEM_DE_CHECAGEM.indexOf(a.codigo) ? b : a,
  );
}

export function situacaoDoCliente(cliente: ClienteDados, agora: number) {
  return {
    ativosFuturos: contarAtivosFuturos(cliente.agendamentos, agora),
    faltasDesdeDesbloqueio: contarFaltas(cliente.agendamentos, cliente.desbloqueadoEm),
  };
}

/** Cria um agendamento (RN-05..RN-22). Idempotente quando há `chaveIdempotencia`. */
export async function agendar(
  deps: Dependencias,
  cmd: ComandoAgendar,
): Promise<Resultado<AgendamentoDto>> {
  return deps.uow.transacao(async (repo) => {
    const agora = deps.relogio.agora();
    const chave = cmd.chaveIdempotencia;
    if (chave === undefined) return agendarNaTransacao(repo, cmd, agora);

    // RN-22: a reserva vem antes de qualquer trava de profissional. Uma requisição paralela com a
    // mesma chave espera aqui (índice único) até esta transação terminar.
    const hashCorpo = hashDoCorpo({
      estabelecimentoId: cmd.estabelecimentoId,
      servicoId: cmd.servicoId,
      profissionalId: cmd.profissionalId,
      clienteId: cmd.clienteId,
      inicio: cmd.inicio,
    });
    const reserva = await repo.reservarChave({
      usuarioId: cmd.ator.usuarioId,
      chave,
      hashCorpo,
      agora,
      expiraEm: agora + VALIDADE_CHAVE_MS,
    });
    if (!reserva.nova) {
      return reserva.hashCorpo === hashCorpo
        ? (reserva.resposta as Resultado<AgendamentoDto>)
        : falha(CodigoErro.CHAVE_IDEMPOTENCIA_REUTILIZADA);
    }
    const resultado = await agendarNaTransacao(repo, cmd, agora);
    await repo.concluirChave({
      usuarioId: cmd.ator.usuarioId,
      chave,
      resposta: resultado,
      agendamentoId: resultado.ok ? resultado.valor.id : null,
    });
    return resultado;
  });
}

async function agendarNaTransacao(
  repo: RepositorioAgenda,
  cmd: ComandoAgendar,
  agora: number,
): Promise<Resultado<AgendamentoDto>> {
  // 1) Antes da trava, só descobre QUEM travar (ids). Nada lido aqui entra na validação.
  const idsCandidatos =
    cmd.profissionalId !== null
      ? [cmd.profissionalId]
      : (await repo.profissionaisDoServico(cmd.estabelecimentoId, cmd.servicoId)).map((p) => p.id);

  // 2) D-05: trava cliente (RN-17/RN-18) e profissionais (conflito) numa ordem estável.
  await repo.travar([
    `cliente:${cmd.clienteId}`,
    ...idsCandidatos.map((id) => `profissional:${id}`),
  ]);

  // 3) Depois da trava, lê tudo o que será validado (READ COMMITTED: cada leitura vê o último
  //    estado confirmado, e quem mexe nesses dados espera a mesma trava).
  const estab = await repo.estabelecimento(cmd.estabelecimentoId);
  if (estab === null) return naoEncontrado('estabelecimento');
  const servico = await repo.servico(cmd.servicoId);
  if (servico === null || servico.estabelecimentoId !== estab.id || !servico.ativo) {
    return naoEncontrado('servico');
  }
  const cliente = await repo.cliente(cmd.clienteId);
  if (cliente === null || cliente.estabelecimentoId !== estab.id) return naoEncontrado('cliente');

  const candidatos: ProfissionalDados[] = [];
  for (const id of idsCandidatos) {
    const p = await repo.profissional(id);
    if (p === null || p.estabelecimentoId !== estab.id) {
      if (cmd.profissionalId !== null) return naoEncontrado('profissional');
      continue;
    }
    // "Qualquer profissional": quem deixou de executar o serviço ou foi desativado sai da lista.
    if (cmd.profissionalId === null && !(p.ativo && p.servicoIds.includes(servico.id))) continue;
    candidatos.push(p);
  }
  if (candidatos.length === 0) return falha(CodigoErro.PROFISSIONAL_NAO_EXECUTA_SERVICO);

  const situacao = situacaoDoCliente(cliente, agora);
  const dia = diaLocal(cmd.inicio, estab);
  const origem = origemDoAtor(cmd.ator.papel);

  // RN-13: revalida tudo no servidor, para cada candidato.
  const avaliados: {
    profissional: ProfissionalDados;
    contexto: ContextoSemOrigem;
    resultado: Resultado;
  }[] = [];
  for (const profissional of candidatos) {
    const contexto = await carregarContexto(repo, {
      estab,
      profissional,
      servico: servico.copia,
      dia,
      agora,
    });
    const resultado = podeCriar({
      ator: cmd.ator.papel,
      cliente: situacao,
      profissional: {
        ativo: profissional.ativo,
        executaServico: profissional.servicoIds.includes(servico.id),
      },
      inicio: cmd.inicio,
      contexto,
    });
    avaliados.push({ profissional, contexto, resultado });
  }
  const contextos = avaliados
    .filter(
      (a) =>
        verificarProfissional({
          ativo: a.profissional.ativo,
          executaServico: a.profissional.servicoIds.includes(servico.id),
        }).ok,
    )
    .map((a) => ({ ...a.contexto, origem }));

  const livres = avaliados.filter((a) => a.resultado.ok);
  if (livres.length === 0) {
    const erros = avaliados.flatMap((a) => (a.resultado.ok ? [] : [a.resultado]));
    return comProximosHorarios(maisAdiante(erros), contextos, cmd.inicio);
  }

  // RN-12: ordem de tentativa entre os que têm o horário livre.
  const doDia = intervaloDoDia(dia, estab);
  const candidatosOrdenaveis = [];
  for (const a of livres) {
    candidatosOrdenaveis.push({
      id: a.profissional.id,
      criadoEm: a.profissional.criadoEm,
      ativo: a.profissional.ativo,
      executaServico: true,
      livre: true,
      agendamentosNoDia:
        livres.length > 1 ? await repo.contarAgendamentos(a.profissional.id, doDia) : 0,
    });
  }
  const ordem = escolherProfissional(candidatosOrdenaveis);

  const bloco = blocoDoAtendimento(cmd.inicio, servico.copia);
  const status = statusInicial(estab.politicas);
  for (const profissionalId of ordem) {
    const escrita = await repo.inserirAgendamento({
      estabelecimentoId: estab.id,
      profissionalId,
      clienteId: cliente.id,
      servicoId: servico.id,
      servico: servico.copia,
      inicio: cmd.inicio,
      fim: atendimento(cmd.inicio, servico.copia).fim,
      inicioBloco: bloco.inicio,
      fimBloco: bloco.fim,
      status,
      criadoEm: agora,
    });
    // RN-21 / RN-12: 23P01 no escolhido → tenta o próximo da ordem, na mesma transação.
    if (!escrita.ok) continue;
    await repo.registrarHistorico({
      agendamentoId: escrita.valor.id,
      tipo: 'STATUS',
      de: null,
      para: status,
      autorUsuarioId: cmd.ator.usuarioId,
      em: agora,
    });
    return ok(paraDto(escrita.valor));
  }
  return comProximosHorarios(falha(CodigoErro.HORARIO_INDISPONIVEL), contextos, cmd.inicio);
}
