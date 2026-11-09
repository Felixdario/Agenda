import { expect, test } from '@playwright/test';
import {
  SLUG,
  abrirRevisao,
  agendarPelaApi,
  dataLocal,
  diaComHorarios,
  estabelecimento,
  hora,
  horarios,
  novoCliente,
} from './apoio';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('1. o cliente agenda pela página pública e vê em "meus agendamentos"', async ({
  page,
  context,
}) => {
  await novoCliente(context);
  await page.goto(`/b/${SLUG}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Navalha & Café' })).toBeVisible();

  await page.locator('[data-servico="Corte masculino"]').click();
  await page.locator('[data-profissional="qualquer"]').click();
  const pilula = page.getByRole('radiogroup').last().getByRole('radio').first();
  await expect(pilula).toBeVisible();
  const inicio = (await pilula.getAttribute('data-inicio'))!;
  // Rótulo completo, para leitor de tela.
  await expect(pilula).toHaveAttribute('aria-label', /, com qualquer profissional$/);
  await pilula.click();
  await page.getByTestId('continuar').click();

  // Revisão: bloco ocupado, preço e política de cancelamento.
  await expect(page.getByRole('heading', { name: 'Tempo reservado' })).toBeVisible();
  await expect(page.getByText(/Você pode cancelar ou remarcar pela internet até/)).toBeVisible();
  await page.getByTestId('confirmar').click();
  await expect(page.getByText('Agendamento confirmado')).toBeVisible();

  await page.goto('/meus-agendamentos');
  const cartao = page.locator('article[data-agendamento]').filter({ hasText: 'Corte masculino' });
  await expect(cartao).toHaveCount(1);
  await expect(cartao).toContainText(hora(inicio));
  await expect(cartao).toContainText('Confirmado');
});

test('2. o cliente remarca e o horário antigo volta a ficar livre', async ({ page, context }) => {
  await novoCliente(context);
  const e = await estabelecimento(context.request);
  const servico = e.servicos.find((s) => s.nome === 'Corte masculino')!;
  const rafael = e.profissionais.find((p) => p.nome === 'Rafael Moura')!;
  const { data, inicios } = await diaComHorarios(context.request, servico.id, rafael.id, 3);
  const antigo = await agendarPelaApi(context.request, servico.id, rafael.id, inicios[0]!);
  expect(await horarios(context.request, servico.id, rafael.id, data)).not.toContain(antigo.inicio);

  await page.goto('/meus-agendamentos');
  await page
    .locator(`article[data-agendamento="${antigo.id}"]`)
    .getByRole('button', { name: 'Remarcar' })
    .click();
  // Serviço e profissional travados: abre direto no passo de dia e horário, no mesmo dia.
  await expect(page.getByText('Com Rafael Moura')).toBeVisible();
  await page.locator(`[data-data="${data}"]`).click();
  const novo = page.getByRole('radiogroup').last().getByRole('radio').nth(1);
  const novoInicio = (await novo.getAttribute('data-inicio'))!;
  expect(novoInicio).not.toBe(antigo.inicio);
  await novo.click();
  await page.getByTestId('continuar').click();
  await page.getByTestId('confirmar').click();
  await expect(page.getByText('Agendamento remarcado')).toBeVisible();

  await expect(page.locator(`article[data-agendamento="${antigo.id}"]`)).toContainText(
    hora(novoInicio),
  );
  const livres = await horarios(context.request, servico.id, rafael.id, data);
  expect(livres).toContain(antigo.inicio);
  expect(livres).not.toContain(novoInicio);
});

test('3. o cliente cancela e o horário volta a ficar livre', async ({ page, context }) => {
  await novoCliente(context);
  const e = await estabelecimento(context.request);
  const servico = e.servicos.find((s) => s.nome === 'Barba completa')!;
  const rafael = e.profissionais.find((p) => p.nome === 'Rafael Moura')!;
  const { data, inicios } = await diaComHorarios(context.request, servico.id, rafael.id, 1);
  const ag = await agendarPelaApi(context.request, servico.id, rafael.id, inicios[0]!);
  expect(await horarios(context.request, servico.id, rafael.id, data)).not.toContain(ag.inicio);

  await page.goto('/meus-agendamentos');
  await page
    .locator(`article[data-agendamento="${ag.id}"]`)
    .getByRole('button', { name: 'Cancelar' })
    .click();
  await page.getByLabel('Motivo (opcional)').fill('Imprevisto no trabalho');
  await page.getByTestId('confirmar-cancelamento').click();
  await expect(page.getByText('Agendamento cancelado')).toBeVisible();
  await expect(page.locator(`article[data-agendamento="${ag.id}"]`)).toContainText('Cancelado');

  expect(await horarios(context.request, servico.id, rafael.id, data)).toContain(ag.inicio);
});

test('4. 409: dois clientes no mesmo horário; o segundo vê os próximos e marca um deles', async ({
  browser,
}) => {
  const a = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
  const b = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
  try {
    await novoCliente(a);
    await novoCliente(b);
    const e = await estabelecimento(a.request);
    const servico = e.servicos.find((s) => s.nome === 'Corte + barba')!;
    const bruna = e.profissionais.find((p) => p.servicoIds.includes(servico.id))!;
    const { inicios } = await diaComHorarios(a.request, servico.id, bruna.id, 2);
    const disputado = inicios[0]!;

    const pa = await a.newPage();
    const pb = await b.newPage();
    // Os dois escolhem o mesmo horário e chegam à revisão.
    await abrirRevisao(pa, servico.id, bruna.id, disputado);
    await abrirRevisao(pb, servico.id, bruna.id, disputado);

    await pa.getByTestId('confirmar').click();
    await expect(pa.getByText('Agendamento confirmado')).toBeVisible();

    await pb.getByTestId('confirmar').click();
    const recusa = pb.getByTestId('recusa');
    await expect(recusa).toBeVisible();
    await expect(
      recusa.getByRole('heading', { name: 'Esse horário acabou de ser reservado' }),
    ).toBeVisible();
    await expect(recusa.getByLabel(`${hora(disputado)}, indisponível`)).toBeVisible();
    const proximos = recusa.locator('button[data-inicio]');
    await expect(proximos.first()).toBeVisible();
    expect(await proximos.count()).toBeGreaterThan(0);
    expect(await proximos.count()).toBeLessThanOrEqual(5);
    const escolhido = (await proximos.first().getAttribute('data-inicio'))!;
    expect(escolhido).not.toBe(disputado);

    await proximos.first().click();
    await expect(pb.getByText('Agendamento confirmado')).toBeVisible();
    await pb.goto('/meus-agendamentos');
    await expect(pb.locator('article[data-agendamento]')).toContainText(hora(escolhido));
    expect(dataLocal(escolhido)).toBeTruthy();
  } finally {
    await a.close();
    await b.close();
  }
});
