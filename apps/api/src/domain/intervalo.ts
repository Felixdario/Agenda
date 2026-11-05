/** RN-01: intervalos semiabertos `[inicio, fim)`, em epoch ms UTC (ou qualquer escala numérica). */
export interface Intervalo {
  readonly inicio: number;
  readonly fim: number;
}

/** Intervalo com `inicio < fim` e extremos finitos. Vazios (`inicio >= fim`) são inválidos. */
export function intervaloValido(i: Intervalo): boolean {
  return Number.isFinite(i.inicio) && Number.isFinite(i.fim) && i.inicio < i.fim;
}

/** `a.inicio < b.fim && b.inicio < a.fim`. Intervalo inválido não sobrepõe nada. */
export function sobrepoe(a: Intervalo, b: Intervalo): boolean {
  return intervaloValido(a) && intervaloValido(b) && a.inicio < b.fim && b.inicio < a.fim;
}

/** `interno` está inteiro dentro de `externo` (ambos válidos). */
export function contem(externo: Intervalo, interno: Intervalo): boolean {
  return (
    intervaloValido(externo) &&
    intervaloValido(interno) &&
    externo.inicio <= interno.inicio &&
    interno.fim <= externo.fim
  );
}

/** Normaliza: descarta vazios, ordena e funde sobrepostos e adjacentes (`[a,b) ∪ [b,c) = [a,c)`). */
export function unir(intervalos: readonly Intervalo[]): Intervalo[] {
  const validos = intervalos
    .filter(intervaloValido)
    .map((i) => ({ inicio: i.inicio, fim: i.fim }))
    .sort((a, b) => a.inicio - b.inicio || a.fim - b.fim);
  const saida: { inicio: number; fim: number }[] = [];
  for (const i of validos) {
    const ultimo = saida[saida.length - 1];
    if (ultimo !== undefined && i.inicio <= ultimo.fim) {
      ultimo.fim = Math.max(ultimo.fim, i.fim);
    } else {
      saida.push(i);
    }
  }
  return saida;
}

/** `base − remover`, normalizado, ordenado e sem vazios. */
export function subtrair(base: readonly Intervalo[], remover: readonly Intervalo[]): Intervalo[] {
  const r = unir(remover);
  const saida: Intervalo[] = [];
  for (const b of unir(base)) {
    let cursor = b.inicio;
    for (const x of r) {
      if (x.fim <= cursor) continue;
      if (x.inicio >= b.fim) break;
      if (x.inicio > cursor) saida.push({ inicio: cursor, fim: x.inicio });
      cursor = Math.max(cursor, x.fim);
      if (cursor >= b.fim) break;
    }
    if (cursor < b.fim) saida.push({ inicio: cursor, fim: b.fim });
  }
  return saida;
}
