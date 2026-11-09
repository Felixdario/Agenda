import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HTTP_STATUS_POR_CODIGO, MENSAGEM_POR_CODIGO } from './erros';

/** Linhas `| \`CODIGO\` | 409 | … |` da tabela "Códigos de erro". */
function tabelaDoDocumento(): Record<string, number> {
  const doc = readFileSync(
    resolve(import.meta.dirname, '../../../docs/regras-de-negocio.md'),
    'utf8',
  );
  const secao = doc.split('## Códigos de erro')[1]?.split('\n## ')[0] ?? '';
  const linhas = [...secao.matchAll(/^\| `([A-Z_]+)` \| (\d{3}) \|/gm)];
  return Object.fromEntries(linhas.map((m) => [m[1], Number(m[2])]));
}

describe('códigos de erro × docs/regras-de-negocio.md', () => {
  it('a tabela do documento e HTTP_STATUS_POR_CODIGO batem 1:1', () => {
    expect(tabelaDoDocumento()).toEqual({ ...HTTP_STATUS_POR_CODIGO });
  });

  it('todo código tem mensagem em português', () => {
    expect(Object.keys(MENSAGEM_POR_CODIGO).sort()).toEqual(
      Object.keys(HTTP_STATUS_POR_CODIGO).sort(),
    );
  });
});
