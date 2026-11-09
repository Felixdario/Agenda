'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { Toaster } from 'sonner';
import { z } from 'zod';
import { ehErroApi } from '@/lib/erros';

/** Mensagens de validação do Zod no idioma da interface (o shared configura pt-BR por padrão). */
function configurarZod(locale: string) {
  z.config(locale === 'en' ? z.locales.en() : z.locales.ptBR());
}

export function Providers({ children }: { children: ReactNode }) {
  const locale = useLocale();
  configurarZod(locale);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (tentativas, erro) =>
              !(ehErroApi(erro) && erro.status >= 400 && erro.status < 500) && tentativas < 2,
          },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Toast só para confirmação de ação; erro de regra vai para a folha ou para o campo. */}
      <Toaster
        theme="system"
        position="bottom-center"
        closeButton
        toastOptions={{
          classNames: {
            toast:
              '!rounded-[16px] !border !border-border !bg-surface !text-text !shadow-float !font-sans',
            title: '!text-[14px] !font-semibold',
            description: '!text-[14px] !text-muted',
            actionButton: '!rounded-full !bg-primary !text-on-primary !font-semibold',
            closeButton: '!bg-surface !border-border !text-muted',
          },
        }}
      />
    </QueryClientProvider>
  );
}
