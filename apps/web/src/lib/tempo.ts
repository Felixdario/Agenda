/**
 * Datas e horas sempre no fuso do estabelecimento (D-17, RN-02). Nada aqui lê o fuso do navegador:
 * todo formatador recebe o `fuso` IANA e usa `Intl.DateTimeFormat` com `timeZone`.
 *
 * "Data local" é a string `yyyy-MM-dd` do calendário do estabelecimento, a mesma da API.
 */

type Instante = string | number | Date;

const cache = new Map<string, Intl.DateTimeFormat>();

function formatador(locale: string, opcoes: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const chave = `${locale}|${JSON.stringify(opcoes)}`;
  let f = cache.get(chave);
  if (f === undefined) {
    f = new Intl.DateTimeFormat(locale, opcoes);
    cache.set(chave, f);
  }
  return f;
}

const ms = (i: Instante) =>
  i instanceof Date ? i.getTime() : typeof i === 'number' ? i : Date.parse(i);

/** "10:00" (24 h nos dois idiomas, como numa agenda). */
export function formatarHora(instante: Instante, fuso: string, locale: string): string {
  return formatador(locale, {
    timeZone: fuso,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(ms(instante));
}

/** "sábado, 14 de novembro" */
export function formatarDataLonga(instante: Instante, fuso: string, locale: string): string {
  return formatador(locale, {
    timeZone: fuso,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(ms(instante));
}

/** "sáb., 14 de nov." */
export function formatarDataCurta(instante: Instante, fuso: string, locale: string): string {
  return formatador(locale, {
    timeZone: fuso,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(ms(instante));
}

/** "14/11/2026, 10:00" no histórico. */
export function formatarDataHora(instante: Instante, fuso: string, locale: string): string {
  return formatador(locale, {
    timeZone: fuso,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(ms(instante));
}

export interface PartesLocais {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
}

/** Ano, mês, dia, hora e minuto do instante no fuso dado. */
export function partesLocais(instante: Instante, fuso: string): PartesLocais {
  const partes = formatador('en-US', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ms(instante));
  const v = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  return {
    ano: v('year'),
    mes: v('month'),
    dia: v('day'),
    hora: v('hour') % 24,
    minuto: v('minute'),
  };
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** Data local `yyyy-MM-dd` do instante no fuso do estabelecimento. */
export function dataLocalDe(instante: Instante, fuso: string): string {
  const p = partesLocais(instante, fuso);
  return `${p.ano}-${doisDigitos(p.mes)}-${doisDigitos(p.dia)}`;
}

/** Minutos desde a meia-noite local (para posicionar na grade do painel). */
export function minutosDoDia(instante: Instante, fuso: string): number {
  const p = partesLocais(instante, fuso);
  return p.hora * 60 + p.minuto;
}

function lerData(data: string): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = data.split('-').map(Number);
  return { ano: ano ?? 1970, mes: mes ?? 1, dia: dia ?? 1 };
}

/** Soma dias de calendário a uma data local (sem fuso: é só calendário). */
export function somarDias(data: string, dias: number): string {
  const { ano, mes, dia } = lerData(data);
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`;
}

/** `n` datas locais a partir de `inicio` (a faixa de 14 dias do cliente). */
export function proximosDias(inicio: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => somarDias(inicio, i));
}

/** Dia ISO da semana (1 = segunda … 7 = domingo) de uma data local. */
export function diaDaSemanaIso(data: string): number {
  const { ano, mes, dia } = lerData(data);
  const d = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Meio-dia UTC da data: formatar uma data local sem depender de fuso nenhum. */
const meioDia = (data: string) => {
  const { ano, mes, dia } = lerData(data);
  return Date.UTC(ano, mes - 1, dia, 12);
};

/** Partes de rótulo de uma data local: "sáb." e "14" (faixa de dias). */
export function rotuloDoDia(
  data: string,
  locale: string,
): { semana: string; dia: string; mes: string } {
  const f = formatador(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const partes = f.formatToParts(meioDia(data));
  const de = (t: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === t)?.value ?? '';
  return {
    semana: de('weekday').replace('.', ''),
    dia: de('day'),
    mes: de('month').replace('.', ''),
  };
}

/** "segunda-feira, 9 de novembro" a partir de uma data local. */
export function formatarDataLocalLonga(data: string, locale: string): string {
  return formatador(locale, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(meioDia(data));
}

/** Deslocamento do fuso (ms) num instante: hora de parede − UTC. */
function deslocamento(instante: number, fuso: string): number {
  const p = partesLocais(instante, fuso);
  const parede = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto);
  return parede - Math.floor(instante / 60_000) * 60_000;
}

/**
 * Instante UTC de uma data e hora locais do estabelecimento ("2026-11-14", "10:00"). Usado no
 * encaixe e no bloqueio, onde o dono digita a hora de parede. Em hora inexistente (salto do horário
 * de verão) o resultado cai depois do salto; a API valida a grade de qualquer forma.
 */
export function instanteDeLocal(data: string, horaMinuto: string, fuso: string): number {
  const { ano, mes, dia } = lerData(data);
  const [h, m] = horaMinuto.split(':').map(Number);
  const parede = Date.UTC(ano, mes - 1, dia, h ?? 0, m ?? 0);
  let palpite = parede - deslocamento(parede, fuso);
  // Segunda passada: o deslocamento no palpite pode ser outro (perto de uma virada de horário).
  palpite = parede - deslocamento(palpite, fuso);
  return palpite;
}

/** "HH:mm" de minutos desde a meia-noite. */
export function horaDeMinutos(minutos: number): string {
  return `${doisDigitos(Math.floor(minutos / 60))}:${doisDigitos(minutos % 60)}`;
}
