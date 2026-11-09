/** Estado do fluxo de reserva. Guardado na URL para sobreviver ao "entrar e voltar". */
export const PASSOS = ['profissional', 'horario', 'revisao'] as const;
export type Passo = (typeof PASSOS)[number];

export const QUALQUER = 'qualquer';

export interface EstadoFluxo {
  servicoId: string;
  /** Id, `QUALQUER`, ou ausente enquanto não escolheu. */
  profissional?: string;
  data?: string;
  inicio?: string;
  passo: Passo;
}

const ehPasso = (v: string | null): v is Passo =>
  v !== null && (PASSOS as readonly string[]).includes(v);

/** Lê `?servico=…&prof=…&data=…&inicio=…&passo=…`. Sem serviço, a folha está fechada. */
export function lerEstadoDaUrl(params: URLSearchParams): EstadoFluxo | null {
  const servicoId = params.get('servico');
  if (servicoId === null || servicoId === '') return null;
  const profissional = params.get('prof') ?? undefined;
  const data = params.get('data') ?? undefined;
  const inicio = params.get('inicio') ?? undefined;
  const pedido = params.get('passo');
  // Um passo só vale se o anterior foi cumprido; sem passo pedido, vai ao mais adiantado possível.
  const pedidoValido = ehPasso(pedido) ? pedido : null;
  const maximo: Passo =
    profissional === undefined ? 'profissional' : inicio === undefined ? 'horario' : 'revisao';
  const passo: Passo =
    pedidoValido !== null && PASSOS.indexOf(pedidoValido) <= PASSOS.indexOf(maximo)
      ? pedidoValido
      : maximo;
  return {
    servicoId,
    passo,
    ...(profissional === undefined ? {} : { profissional }),
    ...(data === undefined ? {} : { data }),
    ...(inicio === undefined ? {} : { inicio }),
  };
}

export function estadoParaUrl(estado: EstadoFluxo | null, base: URLSearchParams): string {
  const p = new URLSearchParams(base);
  for (const k of ['servico', 'prof', 'data', 'inicio', 'passo']) p.delete(k);
  if (estado !== null) {
    p.set('servico', estado.servicoId);
    if (estado.profissional !== undefined) p.set('prof', estado.profissional);
    if (estado.data !== undefined) p.set('data', estado.data);
    if (estado.inicio !== undefined) p.set('inicio', estado.inicio);
    p.set('passo', estado.passo);
  }
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
}
