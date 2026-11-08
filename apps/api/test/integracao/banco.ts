import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const BANCO_DE_TESTE = 'agenda_test';

/** URL do banco principal (DATABASE_URL do ambiente ou do .env da raiz). */
export function urlBase(): string {
  if (process.env.DATABASE_URL === undefined) {
    const env = resolve(import.meta.dirname, '../../../../.env');
    if (existsSync(env)) process.loadEnvFile(env);
  }
  return process.env.DATABASE_URL ?? 'postgresql://agenda:agenda@localhost:5432/agenda';
}

function comBanco(url: string, banco: string): string {
  const u = new URL(url);
  u.pathname = `/${banco}`;
  u.searchParams.delete('schema');
  return u.toString();
}

/** Banco separado para os testes de integração (nunca o de desenvolvimento). */
export const urlDeTeste = () => comBanco(urlBase(), BANCO_DE_TESTE);
/** Banco de manutenção, para o CREATE DATABASE. */
export const urlAdmin = () => comBanco(urlBase(), 'postgres');
