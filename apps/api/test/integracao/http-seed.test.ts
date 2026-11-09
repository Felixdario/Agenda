import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { relogioDoSistema } from '../../src/infra/relogio';
import { CONTAS_DEMO, SENHA_DEMO, SLUG_DEMO, semearDemo } from '../../src/infra/seed/demo';
import { semearPiorCaso } from '../../src/infra/seed/pior-caso';
import { type ApiDeTeste, criarApi } from './apoio-http';

let api: ApiDeTeste;
beforeAll(async () => {
  api = await criarApi(10);
  await api.limpar();
  // O seed usa o relógio de verdade ("duas semanas a partir de hoje"); a API do teste também.
  api.relogio.instante = relogioDoSistema.agora();
});
afterAll(() => api.fechar());

describe('seed demo', () => {
  it('seed roda duas vezes sem erro nem duplicação, e as contas demo fazem login', async () => {
    const agora = relogioDoSistema.agora();
    const r1 = await semearDemo(api.prisma, { agora, hasher: api.deps.hasher });
    const contagem = async () => ({
      estabs: await api.prisma.estabelecimento.count({ where: { slug: SLUG_DEMO } }),
      agendamentos: await api.prisma.agendamento.count(),
      usuarios: await api.prisma.usuario.count(),
      servicos: await api.prisma.servico.count(),
      profissionais: await api.prisma.profissional.count(),
    });
    const depoisDo1 = await contagem();
    const r2 = await semearDemo(api.prisma, { agora, hasher: api.deps.hasher });
    expect(await contagem()).toEqual(depoisDo1);
    expect(r2).toMatchObject({
      agendamentosFuturos: r1.agendamentosFuturos,
      historico: r1.historico,
    });
    expect(depoisDo1).toMatchObject({ estabs: 1, servicos: 6, profissionais: 3 });
    expect(r1.agendamentosFuturos).toBeGreaterThan(50);
    expect(r1.historico).toBeGreaterThan(5);

    const status = await api.prisma.agendamento.groupBy({ by: ['status'], _count: true });
    expect(status.map((s) => s.status).sort()).toEqual([
      'CANCELADO',
      'CONCLUIDO',
      'CONFIRMADO',
      'NAO_COMPARECEU',
    ]);

    for (const email of Object.values(CONTAS_DEMO)) {
      const r = await api.http().post('/auth/login').send({ email, senha: SENHA_DEMO });
      expect(r.status, email).toBe(200);
    }
    const cliente = (
      await api.http().post('/auth/login').send({ email: CONTAS_DEMO.cliente, senha: SENHA_DEMO })
    ).body.token;
    const meus = await api.http().get('/eu/agendamentos').set('Authorization', `Bearer ${cliente}`);
    expect(meus.body.length).toBeGreaterThanOrEqual(1);
    expect(meus.body.length).toBeLessThanOrEqual(2);
    const pub = await api.http().get(`/estabelecimentos/${SLUG_DEMO}`);
    expect(pub.body).toMatchObject({ nome: 'Navalha & Café', fuso: 'America/Sao_Paulo' });
  });

  it('pior caso (fase 6): 40 atendimentos de 15 min num dia, idempotente e só naquele dia', async () => {
    const agora = relogioDoSistema.agora();
    await semearDemo(api.prisma, { agora, hasher: api.deps.hasher });
    const antes = await api.prisma.agendamento.count();
    const r1 = await semearPiorCaso(api.prisma, { agora });
    const depois1 = await api.prisma.agendamento.count();
    const r2 = await semearPiorCaso(api.prisma, { agora });
    expect(await api.prisma.agendamento.count()).toBe(depois1);
    expect(r2).toEqual(r1);
    expect(r1.porProfissional['Rafael Moura']).toBe(40);
    expect(depois1 - antes).toBe(Object.values(r1.porProfissional).reduce((a, b) => a + b, 0));
  });
});
