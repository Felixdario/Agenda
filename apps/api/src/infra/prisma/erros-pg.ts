/** SQLSTATE de violação de constraint de exclusão (RN-21). */
export const EXCLUSION_VIOLATION = '23P01';

/**
 * O Prisma com driver adapter embrulha o erro do `pg` em camadas (`cause`, `meta`,
 * `driverAdapterError`…). Procuramos o SQLSTATE em qualquer campo de código, sem depender do
 * formato exato da versão.
 */
export function sqlstate(erro: unknown, profundidade = 0): string | null {
  if (erro === null || typeof erro !== 'object' || profundidade > 6) return null;
  const o = erro as Record<string, unknown>;
  for (const campo of ['code', 'originalCode', 'sqlState']) {
    const v = o[campo];
    if (typeof v === 'string' && /^[0-9A-Z]{5}$/.test(v) && !v.startsWith('P')) return v;
  }
  for (const campo of ['cause', 'meta', 'driverAdapterError', 'original']) {
    const achado = sqlstate(o[campo], profundidade + 1);
    if (achado !== null) return achado;
  }
  return null;
}

export function ehViolacaoDeExclusao(erro: unknown): boolean {
  return sqlstate(erro) === EXCLUSION_VIOLATION;
}
