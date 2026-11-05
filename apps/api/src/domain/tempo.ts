import { IANAZone } from 'luxon';
import { MINUTOS_POR_DIA, MS_POR_DIA, MS_POR_MINUTO } from './tipos';

/**
 * Conversões entre instante UTC e hora local (RN-02). O calendário é aritmético (dias desde
 * 1970-01-01, algoritmo de H. Hinnant); o deslocamento do fuso vem do Luxon (`IANAZone.offset`).
 * Nada aqui lê o relógio.
 */

export type DiaIso = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Dias desde 1970-01-01 de uma data civil (calendário gregoriano proléptico). */
export function diasDesdeEpoca(ano: number, mes: number, dia: number): number {
  const y = mes <= 2 ? ano - 1 : ano;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (mes + (mes > 2 ? -3 : 9)) + 2) / 5) + dia - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function dataCivil(dias: number): { ano: number; mes: number; dia: number } {
  const z = dias + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const dia = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const mes = mp < 10 ? mp + 3 : mp - 9;
  return { ano: yoe + era * 400 + (mes <= 2 ? 1 : 0), mes, dia };
}

const DATA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "yyyy-MM-dd" → dias desde a época, ou `null` se a data não existe. */
export function lerData(data: string): number | null {
  const m = DATA_RE.exec(data);
  if (m === null) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const dias = diasDesdeEpoca(ano, mes, dia);
  const volta = dataCivil(dias);
  return volta.ano === ano && volta.mes === mes && volta.dia === dia ? dias : null;
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatarData(dias: number): string {
  const { ano, mes, dia } = dataCivil(dias);
  return `${String(ano).padStart(4, '0')}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

/** Dia da semana ISO (1 = segunda … 7 = domingo). 1970-01-01 foi uma quinta (4). */
export function diaDaSemanaIso(dias: number): DiaIso {
  return (((((dias + 3) % 7) + 7) % 7) + 1) as DiaIso;
}

const zonas = new Map<string, IANAZone | null>();

/** Zona IANA válida ou `null`. */
export function zona(fuso: string): IANAZone | null {
  let z = zonas.get(fuso);
  if (z === undefined) {
    z = IANAZone.isValidZone(fuso) ? IANAZone.create(fuso) : null;
    zonas.set(fuso, z);
  }
  return z;
}

const MS_POR_HORA = 3_600_000;
const deslocamentosPorZona = new WeakMap<IANAZone, Map<number, number>>();

/**
 * Deslocamento (min) do fuso no instante. `IANAZone.offset` custa alguns µs (Intl), e a grade de um
 * dia chama isso milhares de vezes; guardamos o deslocamento por hora UTC quando ele é o mesmo no
 * começo e no fim da hora (nenhum fuso real muda duas vezes na mesma hora). Senão, cálculo exato.
 */
export function deslocamento(z: IANAZone, instante: number): number {
  let cache = deslocamentosPorZona.get(z);
  if (cache === undefined) {
    cache = new Map();
    deslocamentosPorZona.set(z, cache);
  }
  const hora = Math.floor(instante / MS_POR_HORA);
  let fixo = cache.get(hora);
  if (fixo === undefined) {
    const inicio = z.offset(hora * MS_POR_HORA);
    fixo = inicio === z.offset((hora + 1) * MS_POR_HORA - 1) ? inicio : Number.NaN;
    if (cache.size > 500_000) cache.clear();
    cache.set(hora, fixo);
  }
  return Number.isNaN(fixo) ? z.offset(instante) : fixo;
}

/** Hora local de um instante. */
export interface Local {
  /** Data local, em dias desde 1970-01-01. */
  readonly dias: number;
  /** Minutos de relógio desde 00:00 local (arredondado para baixo). */
  readonly minutos: number;
  /** `true` se o instante cai exatamente num minuto cheio. */
  readonly minutoExato: boolean;
}

export function paraLocal(instante: number, z: IANAZone): Local {
  const parede = instante + deslocamento(z, instante) * MS_POR_MINUTO;
  const dias = Math.floor(parede / MS_POR_DIA);
  const msNoDia = parede - dias * MS_POR_DIA;
  return {
    dias,
    minutos: Math.floor(msNoDia / MS_POR_MINUTO),
    minutoExato: msNoDia % MS_POR_MINUTO === 0,
  };
}

/**
 * Instante da hora local `dias` + `minutos` (minutos acima de 1440 rolam para o dia seguinte).
 * RN-02: horário inexistente (salto para frente) → `null`; ambíguo (volta) → 1ª ocorrência.
 * Não usa o "empurrar para frente" do Luxon: testa cada deslocamento candidato.
 */
export function instanteLocal(dias: number, minutos: number, z: IANAZone): number | null {
  const parede = dias * MS_POR_DIA + minutos * MS_POR_MINUTO;
  const deslocamentos = new Set<number>();
  for (const delta of [-MS_POR_DIA, -MS_POR_DIA / 2, 0, MS_POR_DIA / 2, MS_POR_DIA]) {
    deslocamentos.add(deslocamento(z, parede + delta));
  }
  let melhor: number | null = null;
  for (const off of deslocamentos) {
    const candidato = parede - off * MS_POR_MINUTO;
    if (deslocamento(z, candidato) === off && (melhor === null || candidato < melhor)) {
      melhor = candidato;
    }
  }
  return melhor;
}

/**
 * Primeiro instante cuja hora local é `>=` a pedida: para horário existente, ele mesmo (1ª
 * ocorrência); para inexistente, o fim do salto (02:30 no salto 02:00→03:00 vira 03:00).
 * Usado nas bordas dos trechos de expediente.
 */
export function instanteEmOuApos(dias: number, minutos: number, z: IANAZone): number {
  for (let k = 0; k <= MINUTOS_POR_DIA; k++) {
    const t = instanteLocal(dias, minutos + k, z);
    if (t !== null) return t;
  }
  // Nenhum fuso real salta mais de um dia; mantém a função total.
  return dias * MS_POR_DIA + minutos * MS_POR_MINUTO;
}
