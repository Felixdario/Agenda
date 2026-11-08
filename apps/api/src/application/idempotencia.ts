import { createHash } from 'node:crypto';

/** JSON com chaves ordenadas, para o hash não depender da ordem dos campos. */
function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonico(v)]),
    );
  }
  return valor;
}

/** RN-22: hash SHA-256 do corpo canônico da requisição. */
export function hashDoCorpo(corpo: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonico(corpo)))
    .digest('hex');
}
