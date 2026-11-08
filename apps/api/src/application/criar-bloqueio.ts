import { CodigoErro } from '@agenda/shared';
import {
  type Resultado,
  ehEstabelecimento,
  falha,
  formatarData,
  ok,
  validarBloqueio,
} from '../domain';
import { diaLocal, naoEncontrado } from './contexto';
import type { AtorAplicacao, Dependencias } from './portas';

export interface ComandoBloqueio {
  readonly profissionalId: string;
  readonly inicio: number;
  readonly fim: number;
  readonly motivo?: string;
  readonly ator: AtorAplicacao;
}

/**
 * RN-05 / D-05: cria um bloqueio na mesma trava do profissional usada por agendar e remarcar, e
 * recusa bloqueio sobre agendamento existente. Assim, bloqueio e agendamento concorrentes nunca
 * passam os dois.
 */
export async function criarBloqueio(
  deps: Dependencias,
  cmd: ComandoBloqueio,
): Promise<Resultado<{ readonly id: string }>> {
  if (!ehEstabelecimento(cmd.ator.papel)) return falha(CodigoErro.ACESSO_NEGADO);
  return deps.uow.transacao(async (repo) => {
    // D-05: trava antes de ler o que será validado.
    await repo.travar([`profissional:${cmd.profissionalId}`]);

    const profissional = await repo.profissional(cmd.profissionalId);
    if (profissional === null) return naoEncontrado('profissional');
    const estab = await repo.estabelecimento(profissional.estabelecimentoId);
    if (estab === null) return naoEncontrado('estabelecimento');

    const agenda = await repo.agendaDoProfissional({
      profissionalId: profissional.id,
      estabelecimentoId: estab.id,
      janela: { inicio: cmd.inicio, fim: cmd.fim },
      datas: {
        de: formatarData(diaLocal(cmd.inicio, estab)),
        ate: formatarData(diaLocal(cmd.fim, estab)),
      },
    });
    const r = validarBloqueio({ inicio: cmd.inicio, fim: cmd.fim }, agenda.ocupacoes);
    if (!r.ok) return r;
    return ok(
      await repo.inserirBloqueio({
        profissionalId: profissional.id,
        inicio: cmd.inicio,
        fim: cmd.fim,
        motivo: cmd.motivo ?? null,
      }),
    );
  });
}
