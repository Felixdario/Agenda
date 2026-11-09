import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import {
  abrirRevisao,
  agendarPelaApi,
  dataLocal,
  diaComHorarios,
  entrar,
  estabelecimento,
  novoCliente,
} from './apoio';

/**
 * Capturas para a revisão de design (não é teste de regressão): `CAPTURAS=1 playwright test capturas`.
 * Gera as telas principais em 390 e 1440 px, nos temas claro e escuro, em .impeccable/review/.
 */
const PASTA = fileURLToPath(new URL('../.impeccable/review/', import.meta.url));
mkdirSync(PASTA, { recursive: true });

const LARGURAS = [390, 1440] as const;
const TEMAS = ['light', 'dark'] as const;

async function capturar(page: Page, nome: string, largura: number, inteira = true) {
  for (const tema of TEMAS) {
    await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `${PASTA}${nome}-${largura}-${tema === 'light' ? 'claro' : 'escuro'}.png`,
      fullPage: inteira,
    });
  }
}

for (const largura of LARGURAS) {
  test.describe(`${largura}px`, () => {
    test.use({ viewport: { width: largura, height: largura === 390 ? 844 : 900 } });

    test(`página pública e fluxo (${largura})`, async ({ page, context }) => {
      await page.goto('/b/navalha-e-cafe');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await capturar(page, '01-pagina-publica', largura);

      await page.locator('[data-servico="Corte masculino"]').click();
      await expect(page.getByRole('heading', { name: 'Com quem?' })).toBeVisible();
      await capturar(page, '02-fluxo-profissional', largura, false);

      await page.locator('[data-profissional="qualquer"]').click();
      const pilula = page.getByRole('radiogroup').last().getByRole('radio').first();
      await pilula.click();
      await capturar(page, '03-fluxo-horario', largura, false);

      await novoCliente(context);
      await page.reload();
      await page.getByTestId('continuar').click();
      await expect(page.getByTestId('confirmar')).toBeEnabled();
      await capturar(page, '04-fluxo-revisao', largura, false);
    });

    test(`recusa 409 (${largura})`, async ({ page, context, browser }) => {
      const outro = await browser.newContext();
      await novoCliente(outro);
      await novoCliente(context);
      const e = await estabelecimento(context.request);
      const servico = e.servicos.find((s) => s.nome === 'Corte masculino')!;
      const prof = e.profissionais.find((p) => p.nome === 'Bruna Teles')!;
      const { inicios } = await diaComHorarios(context.request, servico.id, prof.id, 3);
      await abrirRevisao(page, servico.id, prof.id, inicios[1]!);
      await agendarPelaApi(outro.request, servico.id, prof.id, inicios[1]!);
      await page.getByTestId('confirmar').click();
      await expect(page.getByTestId('recusa')).toBeVisible();
      await page.waitForTimeout(600);
      await capturar(page, '05-recusa-409', largura, false);
      await outro.close();
    });

    test(`meus agendamentos e entrar (${largura})`, async ({ page, context }) => {
      await page.goto('/entrar');
      await capturar(page, '06-entrar', largura);
      await entrar(context.request, 'cliente@agenda.dev');
      await page.goto('/meus-agendamentos');
      await expect(page.locator('article[data-agendamento]').first()).toBeVisible();
      await capturar(page, '07-meus-agendamentos', largura);
    });

    test(`painel (${largura})`, async ({ page, context }) => {
      await entrar(context.request, 'dono@agenda.dev');
      const amanha = dataLocal(Date.now() + 86_400_000);
      await page.goto(`/painel?data=${amanha}`);
      await expect(page.getByTestId('agenda-grade')).toBeVisible();
      await capturar(page, '08-painel-agenda', largura, false);
      await page.locator('[data-agendamento]').nth(1).click();
      await expect(page.getByTestId('detalhe-atendimento')).toBeVisible();
      await page.waitForTimeout(400);
      await capturar(page, '09-painel-detalhe', largura, false);

      for (const [nome, rota] of [
        ['10-painel-encaixe', '/painel/encaixe'],
        ['11-painel-servicos', '/painel/servicos'],
        ['12-painel-profissionais', '/painel/profissionais'],
        ['13-painel-clientes', '/painel/clientes'],
        ['14-painel-politicas', '/painel/politicas'],
      ] as const) {
        await page.goto(rota);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.waitForLoadState('networkidle');
        await capturar(page, nome, largura);
      }
    });
  });
}

test('painel do profissional (1440)', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(context.request, 'profissional@agenda.dev');
  await page.goto(`/painel?data=${dataLocal(Date.now() + 86_400_000)}`);
  await expect(page.getByTestId('agenda-grade')).toBeVisible();
  await capturar(page, '15-painel-profissional', 1440, false);
  await page.goto('/painel/profissionais');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await capturar(page, '16-painel-minha-jornada', 1440);
});

test('dia de 40 atendimentos, no banco (1440)', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(context.request, 'dono@agenda.dev');
  // Primeira quarta-feira depois de 15 dias: o dia do `db:seed:pior-caso`.
  const base = dataLocal(Date.now() + 15 * 86_400_000);
  const [a, m, d] = base.split('-').map(Number);
  const dia = new Date(Date.UTC(a!, m! - 1, d!, 12));
  const semana = dia.getUTCDay() === 0 ? 7 : dia.getUTCDay();
  dia.setUTCDate(dia.getUTCDate() + ((3 - semana + 7) % 7));
  await page.goto(`/painel?data=${dia.toISOString().slice(0, 10)}`);
  await expect(page.getByTestId('agenda-grade')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await capturar(page, '17-dia-40-atendimentos', 1440, false);
});
