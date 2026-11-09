'use client';

import { Select } from '@base-ui/react/select';
import { Check, ChevronsUpDown, Languages } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { COOKIE_LOCALE, LOCALES, type Locale, ehLocale } from '@/i18n/config';
import { cn } from '@/lib/cn';

/** Grava o idioma no cookie NEXT_LOCALE (sem prefixo de rota) e re-renderiza no servidor. */
export function useTrocarIdioma() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const trocar = (locale: Locale) => {
    document.cookie = `${COOKIE_LOCALE}=${locale}; path=/; max-age=31536000; samesite=lax`;
    iniciar(() => router.refresh());
  };
  return { trocar, pendente };
}

export function SeletorIdioma({ className }: { className?: string }) {
  const t = useTranslations('comum');
  const locale = useLocale();
  const { trocar, pendente } = useTrocarIdioma();
  const itens = LOCALES.map((l) => ({ value: l, label: t(`idiomas.${l}`) }));
  return (
    <Select.Root
      items={itens}
      value={locale}
      onValueChange={(v) => {
        if (ehLocale(v) && v !== locale) trocar(v);
      }}
      disabled={pendente}
    >
      <Select.Trigger
        aria-label={t('idioma')}
        data-testid="seletor-idioma"
        className={cn(
          'pressionavel texto-14 inline-flex h-10 items-center gap-2 rounded-full border border-control bg-surface px-3 text-text hover:border-muted',
          className,
        )}
      >
        <Languages aria-hidden className="size-4 text-muted" />
        <Select.Value />
        <ChevronsUpDown aria-hidden className="size-4 text-muted" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          sideOffset={6}
          className="z-[60] outline-none"
          alignItemWithTrigger={false}
        >
          <Select.Popup className="flutuante min-w-[var(--anchor-width)] rounded-field bg-surface p-1 text-text shadow-float outline-none">
            <Select.List>
              {itens.map((i) => (
                <Select.Item
                  key={i.value}
                  value={i.value}
                  className="texto-14 flex h-10 cursor-default items-center gap-2 rounded-lg px-3 outline-none select-none data-highlighted:bg-raised"
                >
                  <Select.ItemIndicator className="w-4">
                    <Check aria-hidden className="size-4 text-accent" />
                  </Select.ItemIndicator>
                  <Select.ItemText lang={i.value}>{i.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
