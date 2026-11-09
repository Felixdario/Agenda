import type { Metadata, Viewport } from 'next';
import { Hanken_Grotesk } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

/**
 * Hanken Grotesk (DESIGN.md), latin, 400–700. `tabular-nums` foi conferido no navegador: os
 * dígitos ficam com a mesma largura (ver D-17).
 */
const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--fonte-hanken',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadados');
  return {
    title: { default: t('titulo'), template: `%s · ${t('titulo')}` },
    description: t('descricao'),
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0f11' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={hanken.variable}>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
