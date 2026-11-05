// Apoio aos testes do domínio (não é importado pelo código de produção).
import { DateTime } from 'luxon';
import type { ContextoAgenda, Politicas, ServicoCopia } from './disponibilidade';
import type { Jornada } from './expediente';

export const SP = 'America/Sao_Paulo';
export const NY = 'America/New_York';

/** Instante de uma hora local ISO com offset explícito ou no fuso dado. */
export function em(iso: string, fuso: string = SP): number {
  const dt = DateTime.fromISO(iso, { zone: fuso });
  if (!dt.isValid) throw new Error(`ISO inválido: ${iso}`);
  return dt.toMillis();
}

/** Hora local "HH:mm" de um instante. */
export function hora(t: number, fuso: string = SP): string {
  return DateTime.fromMillis(t, { zone: fuso }).toFormat('HH:mm');
}

export function horas(ts: readonly number[], fuso: string = SP): string[] {
  return ts.map((t) => hora(t, fuso));
}

/** Seg–sex 09:00–12:00 e 13:00–18:00; sáb 09:00–13:00; dom fechado. */
export const JORNADA_PADRAO: Jornada = {
  1: [
    { inicio: '09:00', fim: '12:00' },
    { inicio: '13:00', fim: '18:00' },
  ],
  2: [
    { inicio: '09:00', fim: '12:00' },
    { inicio: '13:00', fim: '18:00' },
  ],
  3: [
    { inicio: '09:00', fim: '12:00' },
    { inicio: '13:00', fim: '18:00' },
  ],
  4: [
    { inicio: '09:00', fim: '12:00' },
    { inicio: '13:00', fim: '18:00' },
  ],
  5: [
    { inicio: '09:00', fim: '12:00' },
    { inicio: '13:00', fim: '18:00' },
  ],
  6: [{ inicio: '09:00', fim: '13:00' }],
  7: [],
};

export const POLITICAS_PADRAO: Politicas = {
  granularidadeMin: 15,
  antecedenciaMinimaMin: 120,
  horizonteDias: 60,
  prazoCancelamentoHoras: 4,
  limiteAgendamentosAtivos: 3,
  limiteFaltas: 3,
  confirmacaoAutomatica: true,
  fuso: SP,
};

export const CORTE: ServicoCopia = {
  nome: 'Corte',
  duracaoMin: 30,
  preparoMin: 0,
  limpezaMin: 0,
  precoCentavos: 5000,
};

/** Segunda-feira 2026-03-02; "agora" no domingo anterior às 08:00 (SP). */
export const SEGUNDA = '2026-03-02';
export const AGORA_PADRAO = em('2026-03-01T08:00');

export function contexto(parcial: Partial<ContextoAgenda> = {}): ContextoAgenda {
  return {
    jornada: JORNADA_PADRAO,
    excecoes: [],
    bloqueios: [],
    ocupacoes: [],
    servico: CORTE,
    politicas: POLITICAS_PADRAO,
    agora: AGORA_PADRAO,
    origem: 'CLIENTE',
    ...parcial,
  };
}
