'use client';

import { WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useOnline } from '@/lib/conexao';

/**
 * Aviso de sem conexão, no topo de toda tela: o que está à vista pode estar desatualizado e as
 * ações que gravam ficam bloqueadas até a rede voltar (quando tudo é revalidado sozinho).
 */
export function AvisoOffline() {
  const t = useTranslations('comum');
  const online = useOnline();
  return (
    <div role="status" aria-live="polite" className="contents">
      {online ? null : (
        <p
          data-testid="aviso-offline"
          className="texto-14 sticky top-0 z-[65] flex items-center justify-center gap-2 border-b border-warning-line bg-warning-bg px-4 py-2 text-center font-medium text-warning"
        >
          <WifiOff aria-hidden className="size-4 shrink-0" />
          {t('offline')}
        </p>
      )}
    </div>
  );
}
