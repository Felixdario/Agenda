import type mensagens from '../../messages/pt-BR.json';
import type { Locale } from './config';

// Chaves do dicionário checadas pelo TypeScript: t('chave.inexistente') não compila.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof mensagens;
  }
}
