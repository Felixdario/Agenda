import { describe, expect, it } from 'vitest';
import { CODIGOS_ERRO, HTTP_STATUS_POR_CODIGO, corpoErroSchema } from './erros';

describe('erros', () => {
  it('todo código tem HTTP status', () => {
    expect(Object.keys(HTTP_STATUS_POR_CODIGO).sort()).toEqual([...CODIGOS_ERRO].sort());
  });

  it('valida o corpo de erro', () => {
    expect(corpoErroSchema.safeParse({ codigo: 'NAO_ENCONTRADO', mensagem: 'x' }).success).toBe(
      true,
    );
    expect(corpoErroSchema.safeParse({ codigo: 'OUTRO', mensagem: 'x' }).success).toBe(false);
  });
});
