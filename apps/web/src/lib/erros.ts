import { CODIGOS_ERRO, type CodigoErro, corpoErroSchema } from '@agenda/shared';

/** Falha de rede (sem resposta da API). Não é um `CodigoErro`: só existe no front. */
export const ERRO_DE_REDE = 'REDE' as const;
export type CodigoNoFront = CodigoErro | typeof ERRO_DE_REDE;

/** Todo código que a interface sabe explicar: os da API e o de rede. */
export const CODIGOS_NO_FRONT: readonly CodigoNoFront[] = [...CODIGOS_ERRO, ERRO_DE_REDE];

/** Erro HTTP normalizado (D-17): `{codigo, mensagem, detalhes}`. */
export class ErroApi extends Error {
  readonly codigo: CodigoNoFront;
  readonly detalhes: Readonly<Record<string, unknown>>;
  readonly status: number;

  constructor(
    codigo: CodigoNoFront,
    mensagem: string,
    detalhes: Record<string, unknown> = {},
    status = 0,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
    this.codigo = codigo;
    this.detalhes = detalhes;
    this.status = status;
  }

  get mensagem(): string {
    return this.message;
  }

  /** Recusa por horário tomado (409), com os próximos horários livres (RN-13). */
  get proximosHorarios(): string[] {
    const p = this.detalhes['proximosHorarios'];
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string') : [];
  }

  /** Erros de campo de DADOS_INVALIDOS (`detalhes.campos`). */
  get campos(): Record<string, string> {
    const c = this.detalhes['campos'];
    if (c === null || typeof c !== 'object') return {};
    return Object.fromEntries(
      Object.entries(c as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === 'string',
      ),
    );
  }
}

/** Converte a resposta de erro da API (ou um corpo inesperado) em `ErroApi`. */
export function erroDaResposta(status: number, corpo: unknown): ErroApi {
  const r = corpoErroSchema.safeParse(corpo);
  if (r.success) return new ErroApi(r.data.codigo, r.data.mensagem, r.data.detalhes ?? {}, status);
  // Corpo fora do contrato (proxy fora do ar, HTML de erro…): tratado como erro interno.
  return new ErroApi(status === 0 ? ERRO_DE_REDE : 'ERRO_INTERNO', `HTTP ${status}`, {}, status);
}

export function ehErroApi(e: unknown): e is ErroApi {
  return e instanceof ErroApi;
}

/** Chaves do dicionário de um código: `erros.<CODIGO>.mensagem` e `erros.<CODIGO>.acao`. */
export function chavesDoErro(codigo: CodigoNoFront) {
  return { mensagem: `${codigo}.mensagem`, acao: `${codigo}.acao` } as const;
}

/** Recusa de regra: aparece na tela como mensagem + ação (nunca num toast). */
export function ehErroDeRegra(e: unknown): e is ErroApi {
  return ehErroApi(e) && e.codigo !== ERRO_DE_REDE && e.codigo !== 'ERRO_INTERNO';
}
