import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { FormularioCriarConta } from '@/components/comum/formulario-auth';
import { MolduraCliente } from '@/components/comum/moldura-cliente';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.criar');
  return { title: t('titulo') };
}

export default async function CriarConta({
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
          <h1 className="texto-28 font-bold">{t('criar.titulo')}</h1>
          <p className="texto-16 text-muted">
            {deUmAgendamento ? t('voltarAoAgendamento') : t('criar.descricao')}
          </p>
        </header>
        <Suspense>
          <FormularioCriarConta />
        </Suspense>
      </div>
    </MolduraCliente>
  );
}
