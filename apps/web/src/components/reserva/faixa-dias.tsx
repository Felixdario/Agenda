'use client';

import { useLocale, useTranslations } from 'next-intl';
import { type KeyboardEvent, useRef } from 'react';
import { cn } from '@/lib/cn';
import { proximoIndice } from '@/lib/horarios';
import { formatarDataLocalLonga, rotuloDoDia } from '@/lib/tempo';

export interface DiaDaFaixa {
  data: string;
  /** `undefined` enquanto carrega; `0` = sem horários. */
  vagas: number | undefined;
}

/**
 * Faixa horizontal de 14 dias. Dia sem horário fica esmaecido e diz "sem horários" (a API não
 * informa o motivo; o front não adivinha). Setas esquerda/direita andam entre os dias.
 */
export function FaixaDias({
  dias,
  escolhido,
  aoEscolher,
}: {
  dias: readonly DiaDaFaixa[];
  escolhido: string;
  aoEscolher: (data: string) => void;
}) {
  const t = useTranslations('fluxo');
  const locale = useLocale();
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const indiceEscolhido = Math.max(
    0,
    dias.findIndex((d) => d.data === escolhido),
  );

  const aoTeclar = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const tecla = e.key === 'ArrowUp' || e.key === 'ArrowDown' ? '' : e.key;
    const proximo = proximoIndice(i, tecla, dias.length, 1);
    if (proximo === null) return;
    e.preventDefault();
    botoes.current[proximo]?.focus();
    aoEscolher(dias[proximo]!.data);
  };

  return (
    <div
      role="radiogroup"
      aria-label={t('diasDisponiveis')}
      className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 pt-1 pb-2 md:-mx-6 md:px-6"
    >
      {dias.map((d, i) => {
        const r = rotuloDoDia(d.data, locale);
        const marcado = d.data === escolhido;
        const vazio = d.vagas === 0;
        return (
          <button
            key={d.data}
            ref={(el) => {
              botoes.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={marcado}
            aria-label={`${formatarDataLocalLonga(d.data, locale)}${vazio ? `, ${t('semHorarios')}` : ''}`}
            tabIndex={i === indiceEscolhido ? 0 : -1}
            onClick={() => aoEscolher(d.data)}
            onKeyDown={(e) => aoTeclar(e, i)}
            data-data={d.data}
            className={cn(
              'pressionavel flex h-[76px] w-[76px] shrink-0 snap-start flex-col items-center justify-center gap-0.5 rounded-[16px] border',
              marcado
                ? 'border-accent bg-accent-soft text-accent'
                : vazio
                  ? 'border-border bg-ground text-faint'
                  : 'border-border bg-surface text-text hover:border-control',
            )}
          >
            <span className="texto-12 font-medium capitalize">{r.semana}</span>
            <span className="texto-20 num font-semibold">{r.dia}</span>
            <span className={cn('texto-12 h-4 leading-4', !vazio && !marcado && 'text-muted')}>
              {vazio ? t('semHorarios') : r.mes}
            </span>
          </button>
        );
      })}
    </div>
  );
}
