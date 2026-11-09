'use client';

import type { VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useOnline } from '@/lib/conexao';
import { cn } from '@/lib/cn';

import { estiloBotao } from './botao-estilo';

export { estiloBotao };

export interface BotaoProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof estiloBotao> {
  carregando?: boolean;
  icone?: ReactNode;
  /** Ação que grava: fica desabilitada sem rede, com o motivo no rótulo de ajuda. */
  exigeRede?: boolean;
}

export function Botao({
  className,
  variante,
  tamanho,
  largura,
  carregando = false,
  icone,
  children,
  type = 'button',
  disabled,
  exigeRede = false,
  ...props
}: BotaoProps) {
  const online = useOnline();
  const t = useTranslations('comum');
  const semRede = exigeRede && !online;
  return (
    <button
      type={type}
      className={cn(estiloBotao({ variante, tamanho, largura }), className)}
      disabled={disabled === true || semRede}
      {...(semRede ? { title: t('acaoOffline') } : {})}
      aria-busy={carregando || undefined}
      {...props}
    >
      {carregando ? (
        <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />
      ) : (
        icone
      )}
      {children}
    </button>
  );
}
