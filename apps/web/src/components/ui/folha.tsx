'use client';

import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Folha (sheet): de baixo no celular, à direita no desktop. Foco preso e Esc fecha (base-ui).
 * Entrada de 240 ms com cubic-bezier(.2,.8,.2,1), do DESIGN.md (classe `.folha`).
 */
export function Folha({
  aberta,
  aoMudar,
  titulo,
  descricao,
  cabecalho,
  rodape,
  children,
  largura = 'md',
}: {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  titulo: ReactNode;
  descricao?: ReactNode;
  /** Conteúdo acima do título (ex.: botão voltar). */
  cabecalho?: ReactNode;
  /** Barra fixa embaixo (ação principal). */
  rodape?: ReactNode;
  children: ReactNode;
  largura?: 'md' | 'lg';
}) {
  const t = useTranslations('comum');
  return (
    <Dialog.Root open={aberta} onOpenChange={(v) => aoMudar(v)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="veu fixed inset-0 z-40 bg-[var(--scrim)]" />
        <Dialog.Popup
          className={cn(
            'folha fixed z-50 flex flex-col bg-surface text-text shadow-float outline-none',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[20px]',
            'md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:rounded-l-[20px] md:rounded-tr-none',
            largura === 'md' ? 'md:w-[480px]' : 'md:w-[560px]',
          )}
        >
          <div className="flex items-start gap-3 px-4 pt-4 pb-3 md:px-6 md:pt-6">
            <div className="min-w-0 flex-1">
              {cabecalho}
              <Dialog.Title className="texto-20 font-semibold">{titulo}</Dialog.Title>
              {descricao === undefined ? null : (
                <Dialog.Description className="texto-14 mt-1 text-muted">
                  {descricao}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label={t('fechar')}
              className="pressionavel -mt-1 -mr-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-text"
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 md:px-6">
            {children}
          </div>
          {rodape === undefined ? null : (
            <div className="border-t border-border px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:px-6 md:pb-6">
              {rodape}
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
