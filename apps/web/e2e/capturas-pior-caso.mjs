/**
 * Capturas do pior caso (fase 6), a partir da página de desenvolvimento /dev/pior-caso.
 * Precisa do `next dev` no ar (a página dá 404 no build de produção) e da API com o seed:
 *   BASE=http://localhost:3000 node e2e/capturas-pior-caso.mjs
 * Gera 390 e 1440 px, claro e escuro, em .impeccable/review/pior-caso-*.png.
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const PASTA = fileURLToPath(new URL('../.impeccable/review/', import.meta.url));
mkdirSync(PASTA, { recursive: true });

const navegador = await chromium.launch({ channel: 'chrome' });

async function capturar(pagina, nome, largura, inteira = true) {
  for (const tema of ['light', 'dark']) {
    await pagina.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
    await pagina.waitForTimeout(250);
    await pagina.screenshot({
      path: `${PASTA}pior-caso-${nome}-${largura}-${tema === 'light' ? 'claro' : 'escuro'}.png`,
      fullPage: inteira,
    });
  }
}

async function abrir(largura, caminho, login) {
  const contexto = await navegador.newContext({
    viewport: { width: largura, height: largura === 390 ? 844 : 900 },
    locale: 'pt-BR',
  });
  if (login !== undefined) {
    await contexto.request.post(`${BASE}/api/auth/login`, {
      data: { email: login, senha: 'demo1234' },
    });
  }
  const pagina = await contexto.newPage();
  await pagina.goto(`${BASE}${caminho}`, { waitUntil: 'networkidle' });
  await pagina.waitForTimeout(600);
  return { contexto, pagina };
}

const dev = (cenario, tela) => `/dev/pior-caso?cenario=${cenario}&tela=${tela}`;

for (const largura of [390, 1440]) {
  // 1. Nome enorme: lista, fluxo, revisão, 409, meus agendamentos e serviços.
  {
    const { contexto, pagina } = await abrir(largura, dev('pior', 'publica'));
    await capturar(pagina, 'nome-enorme-pagina', largura);
    await pagina.locator('[data-servico]').first().click();
    await pagina.locator('[data-profissional]').nth(1).click();
    await pagina.waitForTimeout(800);
    await capturar(pagina, 'nome-enorme-horarios', largura, false);
    await pagina.locator('[role=radiogroup] [data-inicio]').first().click();
    await pagina.getByTestId('continuar').click();
    await pagina.waitForTimeout(400);
    await capturar(pagina, 'nome-enorme-revisao', largura, false);
    await pagina.getByTestId('confirmar').click();
    await pagina.getByTestId('recusa').waitFor();
    await pagina.waitForTimeout(500);
    await capturar(pagina, 'nome-enorme-409', largura, false);
    await contexto.close();
  }
  for (const [nome, tela] of [
    ['nome-enorme-meus', 'meus'],
    ['nome-enorme-servicos', 'painel-servicos'],
    ['nome-enorme-clientes', 'painel-clientes'],
    ['nome-enorme-agenda', 'painel-agenda'],
  ]) {
    const { contexto, pagina } = await abrir(largura, dev('pior', tela));
    await capturar(pagina, nome, largura, tela !== 'painel-agenda');
    if (tela === 'painel-agenda') {
      await pagina.locator('[data-agendamento]').nth(2).click();
      await pagina.getByTestId('detalhe-atendimento').waitFor();
      await capturar(pagina, 'nome-enorme-detalhe', largura, false);
    }
    await contexto.close();
  }

  // 2. Dia sem vaga e semana sem vaga.
  {
    const { contexto, pagina } = await abrir(largura, dev('sem-vaga', 'publica'));
    await pagina.locator('[data-servico]').first().click();
    await pagina.locator('[data-profissional]').nth(1).click();
    await pagina.waitForTimeout(1200);
    await capturar(pagina, 'sem-vaga-profissional', largura, false);
    await pagina.getByRole('button', { name: 'Ver qualquer profissional' }).click();
    await pagina.waitForTimeout(1200);
    await capturar(pagina, 'sem-vaga-semana', largura, false);
    await contexto.close();
  }

  // 3. Zero serviços e zero profissionais.
  for (const [nome, tela] of [
    ['vazio-pagina', 'publica'],
    ['vazio-agenda', 'painel-agenda'],
  ]) {
    const { contexto, pagina } = await abrir(largura, dev('vazio', tela));
    await capturar(pagina, nome, largura);
    await contexto.close();
  }

  // 4. Offline: a agenda em cache continua na tela, com o aviso e as ações bloqueadas.
  {
    const { contexto, pagina } = await abrir(largura, dev('pior', 'painel-agenda'));
    await pagina.locator('[data-agendamento]').first().click();
    await pagina.getByTestId('detalhe-atendimento').waitFor();
    await contexto.setOffline(true);
    await pagina.getByTestId('aviso-offline').waitFor();
    await capturar(pagina, 'offline-painel', largura, false);
    await contexto.close();
  }

  // 5. Os 40 atendimentos de verdade, no banco (db:seed:pior-caso).
  {
    const base = new Date(Date.now() + 15 * 86_400_000);
    const semana = base.getDay() === 0 ? 7 : base.getDay();
    base.setDate(base.getDate() + ((3 - semana + 7) % 7));
    const data = base.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const { contexto, pagina } = await abrir(largura, `/painel?data=${data}`, 'dono@agenda.dev');
    await capturar(pagina, '40-atendimentos', largura, false);
    await contexto.close();
  }
}

await navegador.close();
console.log(`Capturas em ${PASTA}`);
