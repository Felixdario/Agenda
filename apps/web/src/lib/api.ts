import type { z } from 'zod';
import { ERRO_DE_REDE, ErroApi, erroDaResposta } from './erros';

/**
 * Cliente HTTP do front. Sempre same-origin em `/api/...` (o Next faz o rewrite para a API, D-17),
 * com o cookie httpOnly `agenda_sessao`. Toda mutação manda `Content-Type: application/json`,
 * inclusive o DELETE, porque a API exige isso contra CSRF.
 */

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface OpcoesRequisicao {
  metodo?: Metodo;
  corpo?: unknown;
  cabecalhos?: Record<string, string>;
  sinal?: AbortSignal;
}

export const PREFIXO_API = '/api';

export async function requisitar<S extends z.ZodType>(
  caminho: string,
  schema: S,
  opcoes: OpcoesRequisicao = {},
): Promise<z.infer<S>> {
  const metodo = opcoes.metodo ?? 'GET';
  const mutacao = metodo !== 'GET';
  let resposta: Response;
  try {
    resposta = await fetch(`${PREFIXO_API}${caminho}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(mutacao ? { 'Content-Type': 'application/json' } : {}),
        ...opcoes.cabecalhos,
      },
      ...(mutacao ? { body: JSON.stringify(opcoes.corpo ?? {}) } : {}),
      ...(opcoes.sinal === undefined ? {} : { signal: opcoes.sinal }),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ErroApi(ERRO_DE_REDE, 'Falha de rede');
  }

  const texto = await resposta.text();
  let corpo: unknown;
  try {
    corpo = texto === '' ? null : JSON.parse(texto);
  } catch {
    corpo = null;
  }
  if (!resposta.ok) throw erroDaResposta(resposta.status, corpo);

  const r = schema.safeParse(corpo);
  if (!r.success) {
    console.error(`Resposta fora do contrato em ${metodo} ${caminho}`, r.error.issues);
    throw new ErroApi('ERRO_INTERNO', 'Resposta fora do contrato', {}, resposta.status);
  }
  return r.data;
}

/** Monta uma query string sem chaves vazias. */
export function consulta(params: Record<string, string | undefined | null>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== '') s.set(k, v);
  const t = s.toString();
  return t === '' ? '' : `?${t}`;
}
