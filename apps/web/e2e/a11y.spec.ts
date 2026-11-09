import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import {
  SLUG,
  abrirRevisao,
  agendarPelaApi,
  dataLocal,
  diaComHorarios,
  entrar,
  estabelecimento,
  novoCliente,
} from './apoio';

/**
 * WCAG 2.2 AA com o axe, nas telas principais, em claro e escuro. Exigência: zero violações
 * "serious" ou "critical".
 */
async function semViolacoes(page: Page, tela: string) {
  for (const tema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
    await page.waitForTimeout(150);
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const graves = r.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
    expect(graves, `${tela} em ${tema}`).toEqual([]);
  }
}

/** Primeira quarta-feira depois de 15 dias: o dia de pior caso do seed (`db:seed:pior-caso`). */
function diaDoPiorCaso(): string {
  const base = dataLocal(Date.now() + 15 * 86_400_000);
  const [a, m, d] = base.split('-').map(Number);
  const dia = new Date(Date.UTC(a!, m! - 1, d!, 12));
  const semana = dia.getUTCDay() === 0 ? 7 : dia.getUTCDay();
  dia.setUTCDate(dia.getUTCDate() + ((3 - semana + 7) % 7));
  return dia.toISOString().slice(0, 10);
}

test.describe('a11y do cliente (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('página pública e cada passo do fluxo', async ({ page, context }) => {
    await novoCliente(context);
    await page.goto(`/b/${SLUG}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await semViolacoes(page, 'página pública');

    await page.locator('[data-servico="Corte masculino"]').click();
    await expect(page.getByRole('heading', { name: 'Com quem?' })).toBeVisible();
    await semViolacoes(page, 'fluxo: profissional');

    await page.locator('[data-profissional="qualquer"]').click();
    const pilula = page.getByRole('radiogroup').last().getByRole('radio').first();
    await pilula.click();
    await semViolacoes(page, 'fluxo: horário');

    await page.getByTestId('continuar').click();
    await expect(page.getByTestId('confirmar')).toBeEnabled();
    await semViolacoes(page, 'fluxo: revisão');
  });

  test('sheet 409', async ({ page, context, browser }) => {
    const outro = await browser.newContext();
    try {
      await novoCliente(context);
      await novoCliente(outro);
      const e = await estabelecimento(context.request);
      const servico = e.servicos.find((s) => s.nome === 'Corte masculino')!;
      const prof = e.profissionais.find((p) => p.nome === 'Bruna Teles')!;
      const { inicios } = await diaComHorarios(context.request, servico.id, prof.id, 3);
      await abrirRevisao(page, servico.id, prof.id, inicios[0]!);
      await agendarPelaApi(outro.request, servico.id, prof.id, inicios[0]!);
      await page.getByTestId('confirmar').click();
      await expect(page.getByTestId('recusa')).toBeVisible();
      await page.waitForTimeout(500);
      await semViolacoes(page, 'recusa 409');
    } finally {
      await outro.close();
    }
  });

  test('entrar e meus agendamentos', async ({ page, context }) => {
    await page.goto('/entrar');
    await semViolacoes(page, 'entrar');
    await entrar(context.request, 'cliente@agenda.dev');
    await page.goto('/meus-agendamentos');
    await expect(page.locator('article[data-agendamento]').first()).toBeVisible();
    await semViolacoes(page, 'meus agendamentos');
  });
});

test.describe('a11y do painel (1440 px)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('agenda com 40 atendimentos, detalhe e cadastros', async ({ page, context }) => {
    await entrar(context.request, 'dono@agenda.dev');
    await page.goto(`/painel?data=${diaDoPiorCaso()}`);
    await expect(page.getByTestId('agenda-grade')).toBeVisible();
    await expect(page.locator('[data-agendamento]')).toHaveCount(40 + 40 + 38);
    await semViolacoes(page, 'painel: agenda');

    await page.locator('[data-agendamento]').first().click();
    await expect(page.getByTestId('detalhe-atendimento')).toBeVisible();
    await semViolacoes(page, 'painel: detalhe');

    for (const rota of [
      '/painel/servicos',
      '/painel/profissionais',
      '/painel/clientes',
      '/painel/politicas',
    ]) {
      await page.goto(rota);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await semViolacoes(page, rota);
    }
  });
});
