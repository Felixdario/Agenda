import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { type ReactNode, Suspense } from 'react';
import { ShellPainel } from '@/components/painel/shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('conta');
  return { title: t('painel') };
}

export default function LayoutPainel({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <ShellPainel>{children}</ShellPainel>
    </Suspense>
  );
}
