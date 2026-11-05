/** Intervalos semiabertos [inicio, fim) em minutos. Exemplo de função pura do domínio. */
export interface Intervalo {
  readonly inicio: number;
  readonly fim: number;
}

export function sobrepoe(a: Intervalo, b: Intervalo): boolean {
  return a.inicio < b.fim && b.inicio < a.fim;
}
