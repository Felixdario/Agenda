'use client';

import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/**
 * Estado da rede, o mesmo que o TanStack Query usa (eventos online/offline do navegador). Offline:
 * as consultas pausam e mantêm o cache na tela, e voltar a rede revalida tudo (refetchOnReconnect).
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (aviso) => onlineManager.subscribe(aviso),
    () => onlineManager.isOnline(),
    () => true,
  );
}
