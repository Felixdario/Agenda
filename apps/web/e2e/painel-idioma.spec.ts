import { expect, test } from '@playwright/test';
import { FUSO, SLUG, dataLocal, entrar, horarios } from './apoio';

interface AgendaDoDia {
  profissionais: {
    agendamentos: { id: string; inicio: string; status: string; cliente: { nome: string } }[];
  }[];
}

test('5. o dono vê o atendimento no painel e marca como concluído, depois do horário', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(context.request, 'dono@agenda.dev');

  // O seed deixa o atendimento passado mais recente em aberto (CONFIRMADO), como num balcão real.
  let alvo: { id: string; data: string; cliente: string } | null = null;
  for (let d = 1; d <= 8 && alvo === null; d++) {
    const data = dataLocal(Date.now() - d * 86_400_000);
    const r = await context.request.get(`/api/painel/agenda?data=${data}`);
    expect(r.ok()).toBe(true);
    const agenda = (await r.json()) as AgendaDoDia;
    const aberto = agenda.profissionais
      .flatMap((p) => p.agendamentos)
      .find((a) => a.status === 'CONFIRMADO' && Date.parse(a.inicio) < Date.now());
    if (aberto !== undefined) alvo = { id: aberto.id, data, cliente: aberto.cliente.nome };
  }
  expect(alvo, 'o seed deveria deixar um atendimento passado em aberto').not.toBeNull();

  await page.goto(`/painel?data=${alvo!.data}`);
  await expect(page.getByTestId('agenda-grade')).toBeVisible();
  await page.locator(`[data-agendamento="${alvo!.id}"]`).click();
  const detalhe = page.getByTestId('detalhe-atendimento');
  await expect(detalhe.getByRole('heading', { name: alvo!.cliente })).toBeVisible();
  await expect(detalhe.getByRole('img', { name: /Tempo reservado de/ })).toBeVisible();
  await detalhe.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByText('Atendimento concluído')).toBeVisible();
  await expect(detalhe.getByText('Concluído').first()).toBeVisible();
  await expect(detalhe.getByText('Confirmado para Concluído')).toBeVisible();
});

test('6. trocar para inglês muda os textos e mantém os horários no fuso do estabelecimento', async ({
  browser,
}) => {
  // Navegador em Tóquio: se o front usasse o fuso do navegador, as horas mudariam 12 h.
  const contexto = await browser.newContext({
    timezoneId: 'Asia/Tokyo',
    locale: 'en-US',
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await contexto.newPage();
    await page.goto(`/b/${SLUG}`);
    await expect(page.getByRole('heading', { name: 'Serviços' })).toBeVisible();

    await page.getByTestId('seletor-idioma').click();
    await page.getByRole('option', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'Services' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.locator('[data-servico="Corte masculino"]').click();
    await expect(page.getByRole('heading', { name: 'With whom?' })).toBeVisible();
    await page.locator('[data-profissional="qualquer"]').click();
    const pilula = page.getByRole('radiogroup').last().getByRole('radio').first();
    await expect(pilula).toBeVisible();
    const inicio = (await pilula.getAttribute('data-inicio'))!;
    await expect(pilula).toHaveAttribute('aria-label', /, with any staff member$/);

    const emSaoPaulo = new Intl.DateTimeFormat('en', {
      timeZone: FUSO,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(inicio));
    const emToquio = new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(inicio));
    expect(emSaoPaulo).not.toBe(emToquio);
    await expect(pilula).toHaveText(emSaoPaulo);

    // O horário exibido é um dos que a API oferece para aquela data local do estabelecimento.
    const servicoId = new URL(page.url()).searchParams.get('servico')!;
    expect(await horarios(contexto.request, servicoId, null, dataLocal(inicio))).toContain(inicio);
  } finally {
    await contexto.close();
  }
});
