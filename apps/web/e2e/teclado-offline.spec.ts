import { type Page, expect, test } from '@playwright/test';
import {
  SLUG,
  abrirRevisao,
  dataLocal,
  diaComHorarios,
  entrar,
  estabelecimento,
  novoCliente,
} from './apoio';

/** Aperta Tab até o elemento focado satisfazer o teste (no máximo `max` vezes). */
async function tabAte(page: Page, teste: string, max = 80) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (
      await page.evaluate(
        `(() => { const el = document.activeElement; return Boolean(${teste}); })()`,
      )
    ) {
      return;
    }
  }
  throw new Error(`Tab não chegou em: ${teste}`);
}

test.use({ viewport: { width: 390, height: 844 } });

test('teclado: agenda um horário só com o teclado, do serviço à confirmação', async ({
  page,
  context,
}) => {
  await novoCliente(context);
  await page.goto(`/b/${SLUG}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await tabAte(page, `el.dataset.servico === 'Corte masculino'`);
  await page.keyboard.press('Enter');
  // A folha abre com o foco no título (o leitor de tela anuncia onde está).
  await expect(
    page.getByRole('heading', { level: 2, name: 'Agendar Corte masculino' }),
  ).toBeFocused();

  await tabAte(page, `el.dataset.profissional === 'qualquer'`);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Quando?' })).toBeVisible();
  await expect(page.getByRole('radiogroup').last().getByRole('radio').first()).toBeVisible();

  // Um único ponto de tabulação na grade; setas andam, Enter escolhe.
  await tabAte(page, `el.dataset.inicio !== undefined && el.getAttribute('role') === 'radio'`);
  await page.keyboard.press('ArrowRight');
  const escolhido = await page.evaluate(
    () => (document.activeElement as HTMLElement).dataset['inicio']!,
  );
  await expect(page.locator(':focus')).toHaveAttribute(
    'aria-label',
    /, com qualquer profissional$/,
  );
  await page.keyboard.press('Enter');
  await expect(page.locator(`[data-inicio="${escolhido}"]`).first()).toHaveAttribute(
    'aria-checked',
    'true',
  );

  await tabAte(page, `el.dataset.testid === 'continuar'`);
  await page.keyboard.press('Enter');
  await tabAte(page, `el.dataset.testid === 'confirmar'`);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Agendamento confirmado')).toBeVisible();
  // A folha fecha e o foco volta para quem a abriu.
  await expect(page.locator('[data-servico="Corte masculino"]')).toBeFocused();

  const meus = await context.request.get('/api/eu/agendamentos');
  const lista = (await meus.json()) as { inicio: string }[];
  expect(lista.map((a) => a.inicio)).toEqual([escolhido]);
});

test('offline: aviso, ação bloqueada e a mesma Idempotency-Key ao reenviar (sem duplicar)', async ({
  page,
  context,
}) => {
  await novoCliente(context);
  const e = await estabelecimento(context.request);
  const servico = e.servicos.find((s) => s.nome === 'Pezinho')!;
  const prof = e.profissionais.find((p) => p.nome === 'Rafael Moura')!;
  const { inicios } = await diaComHorarios(context.request, servico.id, prof.id, 1);
  await abrirRevisao(page, servico.id, prof.id, inicios[0]!);

  // A rede cai: aviso, dados ainda na tela, confirmar bloqueado.
  await context.setOffline(true);
  await expect(page.getByTestId('aviso-offline')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tempo reservado' })).toBeVisible();
  await expect(page.getByTestId('confirmar')).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByTestId('aviso-offline')).toBeHidden();

  // A rede falha no meio da confirmação; reenviar usa a mesma chave e não duplica.
  const chaves: string[] = [];
  let primeira = true;
  await page.route('**/api/estabelecimentos/*/agendamentos', async (rota) => {
    chaves.push(rota.request().headers()['idempotency-key'] ?? '');
    if (primeira) {
      primeira = false;
      await rota.abort('internetdisconnected');
    } else {
      await rota.continue();
    }
  });
  await page.getByTestId('confirmar').click();
  await expect(page.getByText('Sem conexão com o servidor.')).toBeVisible();
  await page.getByTestId('confirmar').click();
  await expect(page.getByText('Agendamento confirmado')).toBeVisible();
  expect(chaves).toHaveLength(2);
  expect(chaves[0]).toBeTruthy();
  expect(chaves[1]).toBe(chaves[0]);

  const lista = (await (await context.request.get('/api/eu/agendamentos')).json()) as {
    inicio: string;
  }[];
  expect(lista.filter((a) => a.inicio === inicios[0])).toHaveLength(1);
});

test('offline no painel: a agenda em cache continua, as ações bloqueiam e voltar revalida', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(context.request, 'dono@agenda.dev');
  const amanha = dataLocal(Date.now() + 86_400_000);
  await page.goto(`/painel?data=${amanha}`);
  const cartao = page.locator('[data-agendamento]').first();
  await cartao.click();
  const detalhe = page.getByTestId('detalhe-atendimento');
  await expect(detalhe).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByTestId('aviso-offline')).toBeVisible();
  await expect(page.getByTestId('agenda-grade')).toBeVisible();
  await expect(detalhe.getByRole('button', { name: 'Remarcar' })).toBeDisabled();
  await expect(detalhe.getByRole('button', { name: 'Cancelar atendimento' })).toBeDisabled();

  const revalidou = page.waitForRequest((r) => r.url().includes('/api/painel/agenda'));
  await context.setOffline(false);
  await expect(page.getByTestId('aviso-offline')).toBeHidden();
  await revalidou;
});
