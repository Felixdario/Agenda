'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, Suspense } from 'react';
import { MenuConta } from './conta';
import { SeletorIdioma } from './seletor-idioma';

/** Marca do produto: só o nome, em tinta (sem logo inventado). */
export function MarcaPontual({ className }: { className?: string }) {
  const t = useTranslations('comum');
  return (
    <Link href="/" className={className ?? 'texto-16 font-bold tracking-tight text-text'}>
      {t('pontual')}
    </Link>
  );
}

/**
 * Moldura das telas do cliente (mobile-first). Na página de um estabelecimento, ele é o primeiro
 * plano e o Pontual fica como assinatura no rodapé (`marca={false}`).
 */
export function MolduraCliente({
  children,
  slug,
  marca = true,
  conta = true,
}: {
  children: ReactNode;
  slug?: string;
  marca?: boolean;
  /** Nas telas de entrar e criar conta, o menu da conta sobra. */
  conta?: boolean;
}) {
  const t = useTranslations('comum');
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="texto-14 sr-only rounded-full bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70]"
      >
        {t('pularParaConteudo')}
      </a>
      <header className="mx-auto flex h-16 w-full max-w-[720px] items-center justify-between gap-3 px-4">
        {marca ? <MarcaPontual /> : <span />}
        {conta ? (
          <Suspense
            fallback={<span aria-hidden className="block h-10 w-24 rounded-full bg-raised" />}
          >
            <MenuConta {...(slug === undefined ? {} : { slug })} />
          </Suspense>
        ) : null}
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-[720px] flex-1 px-4 pb-12">
        {children}
      </main>
      <footer className="mx-auto flex w-full max-w-[720px] flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-5">
        <Link href="/" className="texto-12 text-muted hover:text-text">
          {marca ? t('pontual') : t('assinatura')}
        </Link>
        <SeletorIdioma />
      </footer>
    </div>
  );
}
