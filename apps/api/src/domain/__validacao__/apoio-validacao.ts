// Apoio aos testes do Validador. Independente de apoio-testes.ts do Executor.
import { DateTime } from 'luxon';
import type { ContextoAgenda, Jornada, Politicas, ServicoCopia } from '../index';

export const SP = 'America/Sao_Paulo';
export const NY = 'America/New_York';
export const LIS = 'Europe/Lisbon';
export const KOL = 'Asia/Kolkata';

export const MIN = 60_000;
export const HORA = 3_600_000;

/** Hora local (sem offset) no fuso → epoch ms. Lança se o Luxon "empurrar" (horário inexistente). */
export function t(isoLocal: string, fuso: string = SP): number {
  const dt = DateTime.fromISO(isoLocal, { zone: fuso });
  if (!dt.isValid) throw new Error(`ISO inválido: ${isoLocal}`);
  return dt.toMillis();
}

/** ISO com offset explícito → epoch ms (para escolher a 2ª ocorrência na volta do DST). */
export function tOff(isoComOffset: string): number {
  const dt = DateTime.fromISO(isoComOffset, { setZone: true });
  if (!dt.isValid) throw new Error(`ISO inválido: ${isoComOffset}`);
  return dt.toMillis();
}

export function hhmm(ms: number, fuso: string = SP): string {
  return DateTime.fromMillis(ms, { zone: fuso }).toFormat('HH:mm');
}

export function hhmms(ms: readonly number[], fuso: string = SP): string[] {
  return ms.map((x) => hhmm(x, fuso));
}

export function jornadaTodoDia(trechos: { inicio: string; fim: string }[]): Jornada {
  return { 1: trechos, 2: trechos, 3: trechos, 4: trechos, 5: trechos, 6: trechos, 7: trechos };
}

export const JORNADA_ALMOCO = jornadaTodoDia([
  { inicio: '09:00', fim: '12:00' },
  { inicio: '13:00', fim: '18:00' },
]);

export function politicas(p: Partial<Politicas> = {}): Politicas {
  return {
    granularidadeMin: 15,
    antecedenciaMinimaMin: 120,
    horizonteDias: 60,
    prazoCancelamentoHoras: 4,
    limiteAgendamentosAtivos: 3,
    limiteFaltas: 3,
    confirmacaoAutomatica: true,
    fuso: SP,
    ...p,
  };
}

export function servico(s: Partial<ServicoCopia> = {}): ServicoCopia {
  return { nome: 'Corte', duracaoMin: 30, preparoMin: 0, limpezaMin: 0, precoCentavos: 5000, ...s };
}

export function ctx(c: Partial<ContextoAgenda> = {}): ContextoAgenda {
  return {
    jornada: JORNADA_ALMOCO,
    excecoes: [],
    bloqueios: [],
    ocupacoes: [],
    servico: servico(),
    politicas: politicas(),
    agora: t('2026-11-02T08:00'),
    origem: 'CLIENTE',
    ...c,
  };
}
