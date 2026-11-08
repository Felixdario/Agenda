import { CodigoErro } from '@agenda/shared';
import {
  type Resultado,
  falha,
  horariosLivres,
  lerData,
  ok,
  origemDoAtor,
  unirHorarios,
  verificarProfissional,
} from '../domain';
import { carregarContexto, iso, naoEncontrado } from './contexto';
import type { AtorAplicacao, Dependencias, ProfissionalDados } from './portas';

export interface ConsultaHorarios {
  readonly estabelecimentoId: string;
  readonly servicoId: string;
  /** `null` = qualquer profissional (RN-12). */
  readonly profissionalId: string | null;
  /** "yyyy-MM-dd" no fuso do estabelecimento. */
  readonly dataLocal: string;
  readonly ator: AtorAplicacao;
}

export interface HorarioOferecido {
  readonly inicio: string;
  /** Profissionais com esse horário livre. */
  readonly profissionalIds: readonly string[];
}

/** RN-07 / RN-12: horários livres do dia (união para "qualquer profissional"). */
export async function listarHorarios(
  deps: Dependencias,
  q: ConsultaHorarios,
): Promise<Resultado<readonly HorarioOferecido[]>> {
  const dia = lerData(q.dataLocal);
  if (dia === null) return falha(CodigoErro.DADOS_INVALIDOS, { campo: 'dataLocal' });
  return deps.uow.leitura(async (repo) => {
    const agora = deps.relogio.agora();
    const estab = await repo.estabelecimento(q.estabelecimentoId);
    if (estab === null) return naoEncontrado('estabelecimento');
    const servico = await repo.servico(q.servicoId);
    if (servico === null || servico.estabelecimentoId !== estab.id || !servico.ativo) {
      return naoEncontrado('servico');
    }
    let candidatos: ProfissionalDados[];
    if (q.profissionalId !== null) {
      const p = await repo.profissional(q.profissionalId);
      if (p === null || p.estabelecimentoId !== estab.id) return naoEncontrado('profissional');
      const v = verificarProfissional({
        ativo: p.ativo,
        executaServico: p.servicoIds.includes(servico.id),
      });
      if (!v.ok) return v;
      candidatos = [p];
    } else {
      candidatos = await repo.profissionaisDoServico(estab.id, servico.id);
    }

    const porProfissional = new Map<string, number[]>();
    for (const p of candidatos) {
      const ctx = await carregarContexto(repo, {
        estab,
        profissional: p,
        servico: servico.copia,
        dia,
        agora,
      });
      porProfissional.set(
        p.id,
        horariosLivres({ ...ctx, origem: origemDoAtor(q.ator.papel), dataLocal: q.dataLocal }),
      );
    }
    const todos = unirHorarios([...porProfissional.values()]);
    return ok(
      todos.map((t) => ({
        inicio: iso(t),
        profissionalIds: [...porProfissional].filter(([, hs]) => hs.includes(t)).map(([id]) => id),
      })),
    );
  });
}
