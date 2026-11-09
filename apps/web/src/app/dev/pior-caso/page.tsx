import { notFound } from 'next/navigation';
import { Suspense } from 'react';

/**
 * Pior caso do break-ui: só em desenvolvimento. No build de produção, `NODE_ENV` vira a constante
 * 'production', o ramo do `import()` é código morto e some: a rota responde 404 e as fixtures não
 * entram em bundle nenhum.
 */
export default async function Page() {
  if (process.env.NODE_ENV !== 'production') {
    const { PaginaPiorCaso } = await import('@/dev/pior-caso/pagina');
    return (
      <Suspense>
        <PaginaPiorCaso />
      </Suspense>
    );
  }
  notFound();
}
