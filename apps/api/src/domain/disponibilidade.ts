import { CodigoErro, StatusAgendamento } from '@agenda/shared';
import { type Excecao, type Jornada, expedienteAoRedor } from './expediente';
import { type Intervalo, contem, intervaloValido, sobrepoe } from './intervalo';
import { formatarData, instanteLocal, lerData, paraLocal, zona } from './tempo';
import { type Resultado, MINUTOS_POR_DIA, MS_POR_MINUTO, OK, falha } from './tipos';

export type Origem = 'CLIENTE' | 'ESTABELECIMENTO';

/** Políticas do estabelecimento (ver tabela em docs/regras-de-negocio.md) + fuso IANA. */
export interface Politicas {
  readonly granularidadeMin: number;
  readonly antecedenciaMinimaMin: number;
  readonly horizonteDias: number;
  readonly prazoCancelamentoHoras: number;
  readonly limiteAgendamentosAtivos: number;
  readonly limiteFaltas: number;
  readonly confirmacaoAutomatica: boolean;
  readonly fuso: string;
}

/** RN-14: cópia dos dados do serviço guardada no agendamento. */
export interface ServicoCopia {
  readonly nome: string;
  readonly duracaoMin: number;
  readonly preparoMin: number;
  readonly limpezaMin: number;
  readonly precoCentavos: number;
}

/** Bloco já calculado (de agendamento não cancelado) ou bloqueio, em UTC. */
export type Ocupacao = Intervalo;

/** Tudo o que a disponibilidade de um profissional precisa. */
export interface ContextoAgenda {
  readonly jornada: Jornada;
  /** Exceções do profissional + feriados do estabelecimento. */
  readonly excecoes: readonly Excecao[];
  /** RN-05: bloqueios pontuais do profissional (UTC). */
  readonly bloqueios: readonly Intervalo[];
  /** RN-06: blocos dos agendamentos não cancelados do profissional. */
  readonly ocupacoes: readonly Ocupacao[];
  readonly servico: ServicoCopia;
  readonly politicas: Politicas;
  /** Instante atual, epoch ms. */
  readonly agora: number;
  readonly origem: Origem;
}

/** Atendimento que o cliente vê: `[inicio, inicio + duração)`. Minutos reais (RN-02). */
export function atendimento(inicio: number, servico: Pick<ServicoCopia, 'duracaoMin'>): Intervalo {
  return { inicio, fim: inicio + servico.duracaoMin * MS_POR_MINUTO };
}

/** RN-06 / D-02: bloco ocupado `[inicio − preparo, inicio + duração + limpeza)`. */
export function blocoDoAtendimento(
  inicio: number,
  servico: Pick<ServicoCopia, 'duracaoMin' | 'preparoMin' | 'limpezaMin'>,
): Intervalo {
  return {
    inicio: inicio - servico.preparoMin * MS_POR_MINUTO,
    fim: inicio + (servico.duracaoMin + servico.limpezaMin) * MS_POR_MINUTO,
  };
}

/** Agendamento já gravado, no mínimo necessário para calcular a ocupação. */
export interface AgendamentoOcupante {
  readonly inicio: number;
  readonly status: StatusAgendamento;
  /** RN-14: a cópia do serviço feita na criação, não o serviço atual. */
  readonly servico: Pick<ServicoCopia, 'duracaoMin' | 'preparoMin' | 'limpezaMin'>;
}

/** RN-06 / D-04: ocupam agenda todos os status exceto CANCELADO. */
export function ocupaAgenda(status: StatusAgendamento): boolean {
  return status !== StatusAgendamento.CANCELADO;
}

/** RN-06 + RN-14: blocos ocupados pelos agendamentos (cancelados liberam o horário). */
export function ocupacoesDosAgendamentos(agendamentos: readonly AgendamentoOcupante[]): Ocupacao[] {
  return agendamentos
    .filter((a) => ocupaAgenda(a.status))
    .map((a) => blocoDoAtendimento(a.inicio, a.servico));
}

function inteiroEntre(n: number, min: number, max: number): boolean {
  return Number.isInteger(n) && n >= min && n <= max;
}

function servicoValido(s: ServicoCopia): boolean {
  return (
    inteiroEntre(s.duracaoMin, 1, MINUTOS_POR_DIA) &&
    inteiroEntre(s.preparoMin, 0, MINUTOS_POR_DIA) &&
    inteiroEntre(s.limpezaMin, 0, MINUTOS_POR_DIA)
  );
}

function politicasValidas(p: Politicas): boolean {
  return (
    inteiroEntre(p.granularidadeMin, 1, MINUTOS_POR_DIA) &&
    inteiroEntre(p.antecedenciaMinimaMin, 0, Number.MAX_SAFE_INTEGER) &&
    inteiroEntre(p.horizonteDias, 0, 100_000)
  );
}

/** Cache de expediente por dia, válido durante uma chamada (mesmo contexto). */
type CacheExpediente = Map<number, Intervalo[]>;

/** Data local de "hoje" + horizonte, em dias desde a época (RN-10, D-07). */
function ultimoDiaDoHorizonte(
  ctx: ContextoAgenda,
  z: NonNullable<ReturnType<typeof zona>>,
): number {
  return paraLocal(ctx.agora, z).dias + ctx.politicas.horizonteDias;
}

/**
 * Avalia um início na ordem da tabela de erros:
 * grade (RN-07) → antecedência/passado (RN-09/RN-20) → horizonte (RN-10) → expediente → conflito.
 */
function avaliar(inicio: number, ctx: ContextoAgenda, cache: CacheExpediente): Resultado {
  const p = ctx.politicas;
  const z = zona(p.fuso);
  if (z === null) return falha(CodigoErro.DADOS_INVALIDOS, { campo: 'fuso' });
  if (!politicasValidas(p)) return falha(CodigoErro.DADOS_INVALIDOS, { campo: 'politicas' });
  if (!servicoValido(ctx.servico)) return falha(CodigoErro.DADOS_INVALIDOS, { campo: 'servico' });
  if (!Number.isFinite(inicio) || !Number.isFinite(ctx.agora)) {
    return falha(CodigoErro.DADOS_INVALIDOS, { campo: 'inicio' });
  }

  // RN-07 / D-06 / RN-02: minuto cheio, múltiplo da granularidade desde 00:00 local, e a 1ª
  // ocorrência daquela hora local (a 2ª ocorrência de uma hora repetida não está na grade).
  const local = paraLocal(inicio, z);
  if (
    !local.minutoExato ||
    local.minutos % p.granularidadeMin !== 0 ||
    instanteLocal(local.dias, local.minutos, z) !== inicio
  ) {
    return falha(CodigoErro.HORARIO_FORA_DA_GRADE);
  }

  if (ctx.origem === 'CLIENTE') {
    // RN-09: inclui o passado.
    if (inicio < ctx.agora + p.antecedenciaMinimaMin * MS_POR_MINUTO) {
      return falha(CodigoErro.ANTECEDENCIA_MINIMA);
    }
    // RN-10 / D-07: dias de calendário do estabelecimento.
    if (local.dias > ultimoDiaDoHorizonte(ctx, z)) {
      return falha(CodigoErro.ALEM_DO_HORIZONTE, {
        ultimaData: formatarData(ultimoDiaDoHorizonte(ctx, z)),
      });
    }
  } else if (inicio < ctx.agora) {
    // RN-20: o balcão ignora antecedência e horizonte, mas não aceita o passado.
    return falha(CodigoErro.HORARIO_NO_PASSADO);
  }

  const bloco = blocoDoAtendimento(inicio, ctx.servico);

  // RN-03/04/07/08 + D-03: o bloco inteiro (com preparo e limpeza) num único trecho do expediente.
  let expediente = cache.get(local.dias);
  if (expediente === undefined) {
    expediente = expedienteAoRedor(ctx.jornada, ctx.excecoes, local.dias, z);
    cache.set(local.dias, expediente);
  }
  if (!expediente.some((trecho) => contem(trecho, bloco))) {
    return falha(CodigoErro.FORA_DO_EXPEDIENTE);
  }

  // RN-05 / RN-06: bloqueios e blocos de outros agendamentos.
  if (
    ctx.bloqueios.some((b) => sobrepoe(b, bloco)) ||
    ctx.ocupacoes.some((o) => sobrepoe(o, bloco))
  ) {
    return falha(CodigoErro.HORARIO_INDISPONIVEL);
  }
  return OK;
}

/**
 * RN-05..RN-10, RN-20: valida um início para o profissional do contexto. Não cobre RN-11, RN-17 e
 * RN-18 (ver `podeCriar`). Ordem dos erros: grade → antecedência/passado → horizonte → expediente →
 * conflito.
 */
export function validarHorario(ctx: ContextoAgenda & { readonly inicio: number }): Resultado {
  return avaliar(ctx.inicio, ctx, new Map());
}

function livresNoDia(ctx: ContextoAgenda, dias: number, cache: CacheExpediente): number[] {
  const z = zona(ctx.politicas.fuso);
  if (z === null || !politicasValidas(ctx.politicas) || !servicoValido(ctx.servico)) return [];
  const saida: number[] = [];
  for (let m = 0; m < MINUTOS_POR_DIA; m += ctx.politicas.granularidadeMin) {
    // RN-02: horário local inexistente é descartado; ambíguo usa a 1ª ocorrência.
    const t = instanteLocal(dias, m, z);
    if (t !== null && avaliar(t, ctx, cache).ok) saida.push(t);
  }
  return saida;
}

/**
 * RN-07: inícios oferecidos numa data local ("yyyy-MM-dd"), em ordem crescente. Por construção,
 * `validarHorario` aceita todos eles (mesma função de avaliação).
 */
export function horariosLivres(ctx: ContextoAgenda & { readonly dataLocal: string }): number[] {
  const dias = lerData(ctx.dataLocal);
  return dias === null ? [] : livresNoDia(ctx, dias, new Map());
}

/**
 * RN-13: até `n` próximos inícios livres `>= aPartirDe`, procurando de hoje (data local de
 * `aPartirDe`) até `diasMax` dias depois.
 */
export function proximosHorariosLivres(
  ctx: ContextoAgenda,
  aPartirDe: number,
  n = 5,
  diasMax: number = ctx.politicas.horizonteDias,
): number[] {
  const z = zona(ctx.politicas.fuso);
  if (z === null || !Number.isFinite(aPartirDe) || n <= 0) return [];
  const primeiro = paraLocal(aPartirDe, z).dias;
  const cache: CacheExpediente = new Map();
  const saida: number[] = [];
  for (let d = 0; d <= diasMax && saida.length < n; d++) {
    for (const t of livresNoDia(ctx, primeiro + d, cache)) {
      if (t >= aPartirDe) saida.push(t);
      if (saida.length >= n) break;
    }
  }
  return saida;
}

/** RN-12: horários de "qualquer profissional" = união ordenada, sem repetição. */
export function unirHorarios(listas: readonly (readonly number[])[], n = Infinity): number[] {
  const todos = [...new Set(listas.flat())].sort((a, b) => a - b);
  return Number.isFinite(n) ? todos.slice(0, n) : todos;
}

/** RN-12 + RN-13: próximos `n` horários livres de qualquer um dos profissionais. */
export function proximosHorariosLivresDeVarios(
  contextos: readonly ContextoAgenda[],
  aPartirDe: number,
  n = 5,
  diasMax?: number,
): number[] {
  return unirHorarios(
    contextos.map((c) =>
      proximosHorariosLivres(c, aPartirDe, n, diasMax ?? c.politicas.horizonteDias),
    ),
    n,
  );
}

/**
 * RN-05 / D-05: um bloqueio novo não pode ser vazio nem cobrir o bloco de um agendamento que ocupa
 * agenda. (Bloqueio sobre bloqueio é permitido.)
 */
export function validarBloqueio(bloqueio: Intervalo, ocupacoes: readonly Ocupacao[]): Resultado {
  if (!intervaloValido(bloqueio)) return falha(CodigoErro.DADOS_INVALIDOS, { campo: 'intervalo' });
  return ocupacoes.some((o) => sobrepoe(o, bloqueio)) ? falha(CodigoErro.HORARIO_INDISPONIVEL) : OK;
}
