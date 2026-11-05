import { CodigoErro } from '@agenda/shared';
import { type Intervalo, subtrair, unir } from './intervalo';
import {
  type DiaIso,
  diaDaSemanaIso,
  formatarData,
  instanteEmOuApos,
  lerData,
  zona,
} from './tempo';
import { type Resultado, MINUTOS_POR_DIA, falha, ok } from './tipos';

/** "HH:mm" em hora local. "24:00" só é aceito como fim de trecho (fim do dia). */
export type HoraLocal = string;

export interface TrechoLocal {
  readonly inicio: HoraLocal;
  readonly fim: HoraLocal;
}

/** RN-03: trechos por dia da semana ISO (1 = segunda … 7 = domingo). */
export type Jornada = Readonly<Record<DiaIso, readonly TrechoLocal[]>>;

/** RN-04: exceções por data local ("yyyy-MM-dd"). */
export type Excecao =
  | { readonly tipo: 'FERIADO'; readonly data: string }
  | {
      readonly tipo: 'FOLGA';
      readonly data: string;
      readonly inicio?: HoraLocal;
      readonly fim?: HoraLocal;
    }
  | {
      readonly tipo: 'HORARIO_EXTRA';
      readonly data: string;
      readonly inicio: HoraLocal;
      readonly fim: HoraLocal;
    };

export const DIAS_ISO: readonly DiaIso[] = [1, 2, 3, 4, 5, 6, 7];

export const JORNADA_VAZIA: Jornada = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };

const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "HH:mm" → minutos desde 00:00. "24:00" → 1440. Formato inválido → `null`. */
export function minutosDaHora(hora: HoraLocal): number | null {
  if (hora === '24:00') return MINUTOS_POR_DIA;
  const m = HORA_RE.exec(hora);
  return m === null ? null : Number(m[1]) * 60 + Number(m[2]);
}

/** Trecho local válido: formato ok, início < fim (não vazio, não atravessa a meia-noite). */
function minutosDoTrecho(t: TrechoLocal): { inicio: number; fim: number } | null {
  const inicio = minutosDaHora(t.inicio);
  const fim = minutosDaHora(t.fim);
  if (inicio === null || fim === null || inicio >= MINUTOS_POR_DIA || inicio >= fim) return null;
  return { inicio, fim };
}

/** RN-03: trechos válidos, sem sobreposição no mesmo dia, sem vazio, sem atravessar a meia-noite. */
export function validarJornada(jornada: Jornada): Resultado<Jornada> {
  for (const dia of DIAS_ISO) {
    const trechos = jornada[dia];
    if (!Array.isArray(trechos)) {
      return falha(CodigoErro.DADOS_INVALIDOS, { dia, motivo: 'DIA_AUSENTE' });
    }
    const minutos: { inicio: number; fim: number }[] = [];
    for (const [indice, t] of trechos.entries()) {
      const m = minutosDoTrecho(t);
      if (m === null)
        return falha(CodigoErro.DADOS_INVALIDOS, { dia, indice, motivo: 'TRECHO_INVALIDO' });
      minutos.push(m);
    }
    minutos.sort((a, b) => a.inicio - b.inicio);
    for (let i = 1; i < minutos.length; i++) {
      const anterior = minutos[i - 1];
      const atual = minutos[i];
      if (anterior !== undefined && atual !== undefined && atual.inicio < anterior.fim) {
        return falha(CodigoErro.DADOS_INVALIDOS, { dia, motivo: 'TRECHOS_SOBREPOSTOS' });
      }
    }
  }
  return ok(jornada);
}

/** RN-04: data válida; HORARIO_EXTRA e FOLGA parcial com trecho válido (FOLGA: ambos ou nenhum). */
export function validarExcecao(excecao: Excecao): Resultado<Excecao> {
  if (lerData(excecao.data) === null) {
    return falha(CodigoErro.DADOS_INVALIDOS, { motivo: 'DATA_INVALIDA' });
  }
  if (excecao.tipo === 'HORARIO_EXTRA' && minutosDoTrecho(excecao) === null) {
    return falha(CodigoErro.DADOS_INVALIDOS, { motivo: 'TRECHO_INVALIDO' });
  }
  if (excecao.tipo === 'FOLGA') {
    const temInicio = excecao.inicio !== undefined;
    const temFim = excecao.fim !== undefined;
    if (temInicio !== temFim)
      return falha(CodigoErro.DADOS_INVALIDOS, { motivo: 'FOLGA_INCOMPLETA' });
    if (
      excecao.inicio !== undefined &&
      excecao.fim !== undefined &&
      minutosDoTrecho({ inicio: excecao.inicio, fim: excecao.fim }) === null
    ) {
      return falha(CodigoErro.DADOS_INVALIDOS, { motivo: 'TRECHO_INVALIDO' });
    }
  }
  return ok(excecao);
}

type Zona = NonNullable<ReturnType<typeof zona>>;

/**
 * Trecho local → intervalo UTC. Bordas inexistentes (salto do horário de verão) vão para o fim do
 * salto, então o intervalo cobre exatamente os horários locais existentes do trecho (RN-02).
 */
function trechoParaUtc(dias: number, inicioMin: number, fimMin: number, z: Zona): Intervalo {
  return { inicio: instanteEmOuApos(dias, inicioMin, z), fim: instanteEmOuApos(dias, fimMin, z) };
}

/** Expediente efetivo de um dia, em dias desde a época. Ver `expedienteDoDia`. */
export function expedienteDoDiaPorDias(
  jornada: Jornada,
  excecoes: readonly Excecao[],
  dias: number,
  z: Zona,
): Intervalo[] {
  const data = formatarData(dias);
  const doDia = excecoes.filter((e) => e.data === data);
  if (doDia.some((e) => e.tipo === 'FERIADO')) return [];
  if (doDia.some((e) => e.tipo === 'FOLGA' && e.inicio === undefined && e.fim === undefined)) {
    return [];
  }

  const somar: Intervalo[] = [];
  for (const t of jornada[diaDaSemanaIso(dias)] ?? []) {
    const m = minutosDoTrecho(t);
    if (m !== null) somar.push(trechoParaUtc(dias, m.inicio, m.fim, z));
  }
  const remover: Intervalo[] = [];
  for (const e of doDia) {
    if (e.tipo === 'HORARIO_EXTRA') {
      const m = minutosDoTrecho(e);
      if (m !== null) somar.push(trechoParaUtc(dias, m.inicio, m.fim, z));
    } else if (e.tipo === 'FOLGA') {
      // FOLGA com só uma das bordas: a borda ausente é o começo/fim do dia.
      const m = minutosDoTrecho({ inicio: e.inicio ?? '00:00', fim: e.fim ?? '24:00' });
      if (m !== null) remover.push(trechoParaUtc(dias, m.inicio, m.fim, z));
    }
  }
  // (jornada ∪ horários extras) − feriados − folgas
  return subtrair(unir(somar), remover);
}

/**
 * RN-02, RN-03, RN-04: expediente efetivo de uma data local, como intervalos UTC normalizados.
 * `(jornada ∪ horários extras) − feriados − folgas`. Data ou fuso inválidos → `[]`.
 * As exceções recebidas devem ser as do profissional mais os feriados do estabelecimento.
 */
export function expedienteDoDia(
  jornada: Jornada,
  excecoes: readonly Excecao[],
  dataLocal: string,
  fuso: string,
): Intervalo[] {
  const dias = lerData(dataLocal);
  const z = zona(fuso);
  if (dias === null || z === null) return [];
  return expedienteDoDiaPorDias(jornada, excecoes, dias, z);
}

/**
 * Expediente de `dias − 1`, `dias` e `dias + 1` unidos. O preparo de um início logo após a
 * meia-noite (ou a limpeza de um fim perto dela) pode cair no dia vizinho.
 */
export function expedienteAoRedor(
  jornada: Jornada,
  excecoes: readonly Excecao[],
  dias: number,
  z: Zona,
): Intervalo[] {
  return unir([
    ...expedienteDoDiaPorDias(jornada, excecoes, dias - 1, z),
    ...expedienteDoDiaPorDias(jornada, excecoes, dias, z),
    ...expedienteDoDiaPorDias(jornada, excecoes, dias + 1, z),
  ]);
}
