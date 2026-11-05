import type { CodigoErro } from '@agenda/shared';

/** Resultado de uma operação do domínio. O domínio nunca lança exceção por regra de negócio. */
export type Resultado<T = void> =
  | { readonly ok: true; readonly valor: T }
  | {
      readonly ok: false;
      readonly codigo: CodigoErro;
      readonly detalhes?: Readonly<Record<string, unknown>>;
    };

export type Falha = Extract<Resultado<never>, { ok: false }>;

export function ok<T>(valor: T): Resultado<T> {
  return { ok: true, valor };
}

export const OK: Resultado<void> = { ok: true, valor: undefined };

export function falha(codigo: CodigoErro, detalhes?: Readonly<Record<string, unknown>>): Falha {
  return detalhes === undefined ? { ok: false, codigo } : { ok: false, codigo, detalhes };
}

export const MS_POR_MINUTO = 60_000;
export const MS_POR_HORA = 3_600_000;
export const MS_POR_DIA = 86_400_000;
export const MINUTOS_POR_DIA = 1440;
