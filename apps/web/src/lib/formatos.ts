'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  formatarDataCurta,
  formatarDataHora,
  formatarDataLocalLonga,
  formatarDataLonga,
  formatarHora,
} from './tempo';

const formatadoresDePreco = new Map<string, Intl.NumberFormat>();

/** Preço em BRL (DESIGN.md), no formato do idioma da interface. */
export function formatarPreco(centavos: number, locale: string): string {
  let f = formatadoresDePreco.get(locale);
  if (f === undefined) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' });
    formatadoresDePreco.set(locale, f);
  }
  return f.format(centavos / 100);
}

/** Nome do fuso para o cliente ("Horário de Brasília"), sem depender do fuso do navegador. */
export function nomeDoFuso(fuso: string, locale: string): string {
  try {
    const partes = new Intl.DateTimeFormat(locale, {
      timeZone: fuso,
      timeZoneName: 'longGeneric',
    }).formatToParts(Date.UTC(2026, 0, 15, 12));
    return partes.find((p) => p.type === 'timeZoneName')?.value ?? fuso;
  } catch {
    return fuso;
  }
}

/** Formatadores ligados ao idioma da interface e ao fuso do estabelecimento. */
export function useFormatos(fuso: string) {
  const locale = useLocale();
  const t = useTranslations('comum');
  return useMemo(() => {
    const duracao = (minutos: number) => {
      const h = Math.floor(minutos / 60);
      const min = minutos % 60;
      if (h === 0) return t('duracao.minutos', { min });
      if (min === 0) return t('duracao.horas', { h });
      return t('duracao.horasMinutos', { h, min });
    };
    return {
      locale,
      fuso,
      hora: (i: string | number) => formatarHora(i, fuso, locale),
      intervalo: (inicio: string | number, fim: string | number) =>
        t('intervalo', {
          inicio: formatarHora(inicio, fuso, locale),
          fim: formatarHora(fim, fuso, locale),
        }),
      dataLonga: (i: string | number) => formatarDataLonga(i, fuso, locale),
      dataCurta: (i: string | number) => formatarDataCurta(i, fuso, locale),
      dataHora: (i: string | number) => formatarDataHora(i, fuso, locale),
      dataLocalLonga: (data: string) => formatarDataLocalLonga(data, locale),
      preco: (centavos: number) => formatarPreco(centavos, locale),
      duracao,
      nomeDoFuso: nomeDoFuso(fuso, locale),
      /** Primeira letra maiúscula ("segunda-feira, 9 de novembro" no início de uma linha). */
      frase: (texto: string) => texto.charAt(0).toLocaleUpperCase(locale) + texto.slice(1),
    };
  }, [fuso, locale, t]);
}

export type Formatos = ReturnType<typeof useFormatos>;
