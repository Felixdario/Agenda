import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { FormularioEntrar } from '@/components/comum/formulario-auth';
import { MolduraCliente } from '@/components/comum/moldura-cliente';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.entrar');
  return { title: t('titulo') };
}

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ voltar?: string }>;
}) {
  const t = await getTranslations('auth');
  const { voltar } = await searchParams;
  const deUmAgendamento = typeof voltar === 'string' && voltar.startsWith('/b/');
  return (
    <MolduraCliente conta={false}>
      <div className="mx-auto flex max-w-[440px] flex-col gap-6 pt-6">
        <header className="flex flex-col gap-1">
          <h1 className="texto-28 font-bold">{t('entrar.titulo')}</h1>
          <p id="descricao-entrar" className="texto-16 text-muted">
            {deUmAgendamento ? t('voltarAoAgendamento') : t('entrar.descricao')}
          </p>
        </header>
        <Suspense>
          <FormularioEntrar />
        </Suspense>
      </div>
    </MolduraCliente>
  );
}
