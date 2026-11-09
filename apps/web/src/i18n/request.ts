import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { COOKIE_LOCALE, LOCALE_PADRAO, ehLocale } from './config';

export default getRequestConfig(async () => {
  const valor = (await cookies()).get(COOKIE_LOCALE)?.value;
  const locale = ehLocale(valor) ? valor : LOCALE_PADRAO;
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
