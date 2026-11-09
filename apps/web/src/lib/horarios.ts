import type { HorarioOferecido } from '@agenda/shared';
import { minutosDoDia } from './tempo';

/** Períodos do dia em que os horários são agrupados, na hora local do estabelecimento. */
export const PERIODOS = ['manha', 'tarde', 'noite'] as const;
export type Periodo = (typeof PERIODOS)[number];

/** Manhã até 11:59, tarde de 12:00 a 17:59, noite a partir de 18:00. */
export function periodoDe(instante: string, fuso: string): Periodo {
  const minutos = minutosDoDia(instante, fuso);
  if (minutos < 12 * 60) return 'manha';
  if (minutos < 18 * 60) return 'tarde';
  return 'noite';
}

export interface GrupoDeHorarios {
  periodo: Periodo;
  horarios: HorarioOferecido[];
}

/**
 * Agrupa os horários da API por período, na ordem manhã → tarde → noite, sem grupos vazios e sem
 * reordenar nem filtrar nada: a lista é a da API (RN-13), o front só organiza a exibição.
 */
export function agruparPorPeriodo(
  horarios: readonly HorarioOferecido[],
  fuso: string,
): GrupoDeHorarios[] {
  const grupos = new Map<Periodo, HorarioOferecido[]>();
  for (const h of horarios) {
    const p = periodoDe(h.inicio, fuso);
    const lista = grupos.get(p) ?? [];
    lista.push(h);
    grupos.set(p, lista);
  }
  return PERIODOS.filter((p) => grupos.has(p)).map((p) => ({
    periodo: p,
    horarios: grupos.get(p)!,
  }));
}

/**
 * Próximo índice na grade de pílulas para uma tecla de seta (navegação só com teclado).
 * Esquerda/direita andam um; cima/baixo andam uma linha (`colunas`); Home/End vão às pontas.
 * Devolve `null` para teclas que não navegam.
 */
export function proximoIndice(
  atual: number,
  tecla: string,
  total: number,
  colunas: number,
): number | null {
  if (total === 0) return null;
  const limitar = (i: number) => Math.min(total - 1, Math.max(0, i));
  switch (tecla) {
    case 'ArrowRight':
      return limitar(atual + 1);
    case 'ArrowLeft':
      return limitar(atual - 1);
    case 'ArrowDown':
      return limitar(atual + colunas);
    case 'ArrowUp':
      return limitar(atual - colunas);
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    default:
      return null;
  }
}
