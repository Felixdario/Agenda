import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { MolduraCliente } from '@/components/comum/moldura-cliente';
import { PaginaMeusAgendamentos } from './pagina-meus';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meus');
  return { title: t('titulo') };
}

export default function Page() {
  return (
    <MolduraCliente>
      <Suspense>
        <PaginaMeusAgendamentos />
      </Suspense>
    </MolduraCliente>
  );
}
