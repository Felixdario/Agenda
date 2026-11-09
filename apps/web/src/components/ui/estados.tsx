'use client';

import { CircleAlert, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useOnline } from '@/lib/conexao';
import { ERRO_DE_REDE, ehErroApi } from '@/lib/erros';
import { Botao } from './botao';

/** Barra cinza plana no tamanho real do valor (sem shimmer), para o estado de carregando. */
export function Esqueleto({ className }: { className?: string }) {
  return <span aria-hidden className={cn('block rounded-md bg-raised', className)} />;
}

/** Região que avisa leitores de tela que algo está carregando. */
export function Carregando({ children, className }: { children: ReactNode; className?: string }) {
  const t = useTranslations('comum');
  const online = useOnline();
  return (
    <div role="status" aria-busy="true" className={className}>
      {online ? (
        <span className="sr-only">{t('carregando')}</span>
      ) : (
        <p className="texto-14 mb-3 text-muted">{t('carregandoOffline')}</p>
      )}
      {children}
    </div>
  );
}

/** Vazio: uma frase e uma ação, mantendo a moldura do bloco. */
export function EstadoVazio({
  children,
  acao,
  className,
}: {
  children: ReactNode;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 rounded-card border border-dashed border-control px-5 py-6',
        className,
      )}
    >
      <p className="texto-14 text-muted">{children}</p>
      {acao}
    </div>
  );
}

/**
 * Erro de carga dentro do bloco que falhou: o que falhou e "tentar de novo". Se a consulta ainda
 * tem dados antigos, a tela continua com eles e mostra só o aviso de sem conexão.
 */
export function EstadoErro({
  erro,
  aoTentar,
  temDados = false,
  className,
}: {
  erro: unknown;
  aoTentar: () => void;
  temDados?: boolean;
  className?: string;
}) {
  const t = useTranslations();
  const rede = !ehErroApi(erro) || erro.codigo === ERRO_DE_REDE;
  const Icone = rede ? WifiOff : CircleAlert;
  const texto = temDados
    ? t('comum.semConexao')
    : rede
      ? t('erros.REDE.mensagem')
      : t('comum.erroAoCarregar');
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border bg-surface px-4 py-3',
        className,
      )}
    >
      <Icone aria-hidden className="size-4 shrink-0 text-negative" />
      <p className="texto-14 min-w-0 flex-1">{texto}</p>
      <Botao variante="link" tamanho="sm" onClick={aoTentar} className="texto-14">
        {t('comum.tentarDeNovo')}
      </Botao>
    </div>
  );
}
