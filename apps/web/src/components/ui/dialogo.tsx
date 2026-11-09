'use client';

import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Diálogo centrado (formulários do painel e confirmações). Foco preso e Esc fecha. */
export function Dialogo({
  aberto,
  aoMudar,
  titulo,
  descricao,
  children,
  rodape,
  largura = 'md',
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  titulo: ReactNode;
  descricao?: ReactNode;
  children?: ReactNode;
  rodape?: ReactNode;
  largura?: 'sm' | 'md' | 'lg';
}) {
  const t = useTranslations('comum');
  return (
    <Dialog.Root open={aberto} onOpenChange={(v) => aoMudar(v)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="veu fixed inset-0 z-40 bg-[var(--scrim)]" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <Dialog.Popup
            className={cn(
              'dialogo flex max-h-[92dvh] w-full flex-col rounded-t-[20px] bg-surface text-text shadow-float outline-none sm:rounded-card',
              largura === 'sm' && 'sm:max-w-[420px]',
              largura === 'md' && 'sm:max-w-[520px]',
              largura === 'lg' && 'sm:max-w-[720px]',
            )}
          >
            <div className="flex items-start gap-3 px-5 pt-5 pb-2">
              <div className="min-w-0 flex-1">
                <Dialog.Title className="texto-20 font-semibold">{titulo}</Dialog.Title>
                {descricao === undefined ? null : (
                  <Dialog.Description className="texto-14 mt-1 text-muted">
                    {descricao}
                  </Dialog.Description>
                )}
              </div>
              <Dialog.Close
                aria-label={t('fechar')}
                className="pressionavel -mt-1 -mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-text"
              >
                <X aria-hidden className="size-5" />
              </Dialog.Close>
            </div>
            {children === undefined ? null : (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">{children}</div>
            )}
            {rodape === undefined ? null : (
              <div className="flex flex-col-reverse gap-2 px-5 pt-2 pb-[max(20px,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
                {rodape}
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
