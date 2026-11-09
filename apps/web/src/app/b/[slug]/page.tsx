import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { PaginaEstabelecimento } from './pagina-estabelecimento';

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslations('metadados');
  try {
    const r = await fetch(`${API_URL}/estabelecimentos/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
    });
    if (!r.ok) return {};
    const { nome } = (await r.json()) as { nome: string };
    return { title: t('tituloEstabelecimento', { nome }) };
  } catch {
    return {};
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Suspense>
      <PaginaEstabelecimento slug={slug} />
    </Suspense>
  );
}
