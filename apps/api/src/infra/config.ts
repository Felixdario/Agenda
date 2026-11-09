import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Configuração lida do ambiente (com o .env da raiz em dev). */
export interface Config {
  readonly databaseUrl: string;
  readonly porta: number;
  readonly webOrigin: string;
  readonly producao: boolean;
  readonly smtp: { host: string; port: number } | null;
  readonly lembretesAtivos: boolean;
}

export function carregarConfig(): Config {
  for (const arquivo of [
    resolve(import.meta.dirname, '../../../../.env'),
    resolve(process.cwd(), '.env'),
  ]) {
    if (existsSync(arquivo)) process.loadEnvFile(arquivo);
  }
  const env = process.env;
  return {
    databaseUrl: env.DATABASE_URL ?? 'postgresql://agenda:agenda@localhost:5432/agenda',
    porta: Number(env.API_PORT ?? 3333),
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:3000',
    producao: env.NODE_ENV === 'production',
    smtp: env.SMTP_HOST ? { host: env.SMTP_HOST, port: Number(env.SMTP_PORT ?? 1025) } : null,
    lembretesAtivos: env.LEMBRETES_ATIVOS !== 'false',
  };
}
