'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { ehErroApi } from './erros';

/**
 * A verdade da sessão é a API: se uma consulta de área protegida volta 401 (sessão expirou no meio),
 * manda para /entrar?voltar=… e volta para o mesmo lugar depois.
 */
export function useRedirecionarSeSemSessao(...erros: unknown[]) {
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams().toString();
  const semSessao = erros.some((e) => ehErroApi(e) && e.status === 401);
  useEffect(() => {
    if (!semSessao) return;
    const voltar = busca === '' ? caminho : `${caminho}?${busca}`;
    router.replace(`/entrar?voltar=${encodeURIComponent(voltar)}`);
  }, [semSessao, router, caminho, busca]);
  return semSessao;
}
