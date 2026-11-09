import type { AgendaPainel } from '@agenda/shared';
import { minutosDoDia } from './tempo';

/** Pixels por minuto na grade do painel: 15 min = 24 px, uma hora = 96 px. */
export const PX_POR_MINUTO = 1.6;

/**
 * Faixa de horas exibida: do primeiro expediente (ou bloco ocupado) ao último, arredondada para
 * horas cheias, na hora local do estabelecimento. Sem nada no dia, 08:00–20:00.
 */
export function faixaDoDia(agenda: AgendaPainel): { inicio: number; fim: number } {
  const minutos: number[] = [];
  for (const p of agenda.profissionais) {
    for (const t of p.expediente) {
      minutos.push(minutosDoDia(t.inicio, agenda.fuso));
      minutos.push(fimLocal(t.fim, t.inicio, agenda.fuso));
    }
    for (const a of p.agendamentos) {
      if (a.status === 'CANCELADO') continue;
      minutos.push(minutosDoDia(a.inicioBloco, agenda.fuso));
      minutos.push(fimLocal(a.fimBloco, a.inicioBloco, agenda.fuso));
    }
  }
  if (minutos.length === 0) return { inicio: 8 * 60, fim: 20 * 60 };
  const inicio = Math.floor(Math.min(...minutos) / 60) * 60;
  const fim = Math.min(24 * 60, Math.ceil(Math.max(...minutos) / 60) * 60);
  return { inicio, fim: Math.max(fim, inicio + 60) };
}

/** Fim em minutos locais; um fim exatamente à meia-noite seguinte vira 24:00. */
export function fimLocal(fim: string, inicio: string, fuso: string): number {
  const m = minutosDoDia(fim, fuso);
  const duracao = (Date.parse(fim) - Date.parse(inicio)) / 60_000;
  return m === 0 && duracao > 0 ? 24 * 60 : m;
}

/** Arredonda minutos para a grade (granularidade do estabelecimento). */
export function naGrade(minutos: number, granularidade: number): number {
  return Math.round(minutos / granularidade) * granularidade;
}
