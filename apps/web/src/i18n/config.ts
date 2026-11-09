/** Idiomas da interface (D-17). O locale vem do cookie NEXT_LOCALE, sem prefixo de rota. */
export const LOCALES = ['pt-BR', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_PADRAO: Locale = 'pt-BR';
export const COOKIE_LOCALE = 'NEXT_LOCALE';

export function ehLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}
