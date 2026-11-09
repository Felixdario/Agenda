import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const SLUG = 'navalha-e-cafe';
export const FUSO = 'America/Sao_Paulo';
export const SENHA_DEMO = 'demo1234';

export interface Estab {
  id: string;
  fuso: string;
  servicos: { id: string; nome: string; duracaoMin: number }[];
  profissionais: { id: string; nome: string; servicoIds: string[] }[];
}

let contador = 0;

/** Cliente novo por teste (o seed tem limite de 3 ativos por cliente: RN-17). */
export async function novoCliente(contexto: BrowserContext) {
  const email = `e2e-${Date.now()}-${++contador}@teste.dev`;
  const r = await contexto.request.post('/api/auth/registro', {
    data: { nome: `Cliente E2E ${contador}`, email, senha: 'senha-e2e-123' },
  });
  expect(r.status(), await r.text()).toBe(201);
  await entrar(contexto.request, email, 'senha-e2e-123');
  return email;
}

/** Entra pela API do próprio web (/api): o cookie httpOnly fica no contexto do navegador. */
export async function entrar(req: APIRequestContext, email: string, senha = SENHA_DEMO) {
  const r = await req.post('/api/auth/login', { data: { email, senha } });
  expect(r.status(), await r.text()).toBe(200);
}

export async function estabelecimento(req: APIRequestContext): Promise<Estab> {
  const r = await req.get(`/api/estabelecimentos/${SLUG}`);
  expect(r.ok()).toBe(true);
  return (await r.json()) as Estab;
}

export async function horarios(
  req: APIRequestContext,
  servicoId: string,
  profissionalId: string | null,
  data: string,
): Promise<string[]> {
  const q = new URLSearchParams({
    servicoId,
    data,
    ...(profissionalId === null ? {} : { profissionalId }),
  });
  const r = await req.get(`/api/estabelecimentos/${SLUG}/horarios?${q}`);
  expect(r.ok()).toBe(true);
  return ((await r.json()) as { inicio: string }[]).map((h) => h.inicio);
}

/** Data local (yyyy-MM-dd) de um instante no fuso do estabelecimento. */
export function dataLocal(instante: string | number, fuso = FUSO): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instante));
}

export function hora(instante: string, fuso = FUSO): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instante));
}

/** Primeiro dia (a partir de amanhã) com pelo menos `minimo` horários livres. */
export async function diaComHorarios(
  req: APIRequestContext,
  servicoId: string,
  profissionalId: string | null,
  minimo = 2,
): Promise<{ data: string; inicios: string[] }> {
  for (let d = 1; d <= 14; d++) {
    const data = dataLocal(Date.now() + d * 86_400_000);
    const inicios = await horarios(req, servicoId, profissionalId, data);
    if (inicios.length >= minimo) return { data, inicios };
  }
  throw new Error('Nenhum dia com horários livres nos próximos 14 dias');
}

/** Agenda direto pela API (preparação de cenário); o teste exercita a tela depois. */
export async function agendarPelaApi(
  req: APIRequestContext,
  servicoId: string,
  profissionalId: string,
  inicio: string,
): Promise<{ id: string; inicio: string }> {
  const r = await req.post(`/api/estabelecimentos/${SLUG}/agendamentos`, {
    data: { servicoId, profissionalId, inicio },
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
  expect(r.status(), await r.text()).toBe(201);
  return (await r.json()) as { id: string; inicio: string };
}

/** Abre a revisão de um horário direto pela URL do fluxo (o estado do fluxo vive na URL). */
export async function abrirRevisao(
  page: Page,
  servicoId: string,
  profissional: string,
  inicio: string,
) {
  const q = new URLSearchParams({
    servico: servicoId,
    prof: profissional,
    data: dataLocal(inicio),
    inicio,
    passo: 'revisao',
  });
  await page.goto(`/b/${SLUG}?${q}`);
  await expect(page.getByTestId('confirmar')).toBeEnabled();
}
