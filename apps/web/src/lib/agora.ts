'use client';

import { useSyncExternalStore } from 'react';

/**
 * "Agora" para a interface, atualizado a cada minuto (linha do agora, prazo de cancelamento).
 * Ler o relógio fora do render mantém os componentes puros.
 */
const ouvintes = new Set<() => void>();
let instante = 0;
let relogio: ReturnType<typeof setInterval> | null = null;

function assinar(aviso: () => void) {
  ouvintes.add(aviso);
  if (relogio === null) {
    instante = Date.now();
    relogio = setInterval(() => {
      instante = Date.now();
      for (const o of ouvintes) o();
    }, 30_000);
  }
  return () => {
    ouvintes.delete(aviso);
    if (ouvintes.size === 0 && relogio !== null) {
      clearInterval(relogio);
      relogio = null;
    }
  };
}

function ler() {
  if (instante === 0) instante = Date.now();
  return instante;
}

/** Instante atual (ms), estável entre renders do mesmo minuto. No servidor, 0. */
export function useAgora(): number {
  return useSyncExternalStore(assinar, ler, () => 0);
}
