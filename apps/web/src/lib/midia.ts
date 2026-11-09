'use client';

import { useSyncExternalStore } from 'react';

/** `matchMedia` como estado (no servidor, `false`). */
export function useMidia(consulta: string): boolean {
  return useSyncExternalStore(
    (aviso) => {
      const m = window.matchMedia(consulta);
      m.addEventListener('change', aviso);
      return () => m.removeEventListener('change', aviso);
    },
    () => window.matchMedia(consulta).matches,
    () => false,
  );
}
