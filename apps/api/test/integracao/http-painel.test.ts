import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEGUNDA_10H, em } from './apoio';
import { type ApiDeTeste, type Estab, criarApi, criarEstab, usuarioComSessao } from './apoio-http';

let api: ApiDeTeste;
let e: Estab;
let dono: string;
let prof: string;

beforeAll(async () => {
  api = await criarApi(10);
});
afterAll(() => api.fechar());
beforeEach(async () => {
  await api.limpar();
  e = await criarEstab(api.prisma, 'painel');
  dono = (
    await usuarioComSessao(api, { email: 'dono@t.dev', papel: 'DONO', estabelecimentoId: e.id })
  ).auth;
  prof = (
    await usuarioComSessao(api, {
      email: 'p@t.dev',
      papel: 'PROFISSIONAL',
      estabelecimentoId: e.id,
      profissionalId: e.profissionalIds[0],
    })
  ).auth;
});

const iso = (ms: number) => new Date(ms).toISOString();

describe('painel', () => {
  it('RN-20: balcão cria o cliente por e-mail (sem senha) e ignora a antecedência; agenda do dia mostra tudo', async () => {
    api.relogio.instante = em('2026-03-02T09:50');
    const r = await api
      .http()
      .post('/painel/agendamentos')
      .set('Authorization', dono)
      .send({
        servicoId: e.servicoId,
        profissionalId: e.profissionalIds[0],
        inicio: iso(SEGUNDA_10H),
        cliente: { email: 'Novo@T.dev', nome: 'Novo' },
      });
    expect(r.status).toBe(201);
    const u = await api.prisma.usuario.findUniqueOrThrow({ where: { email: 'novo@t.dev' } });
    expect(u).toMatchObject({ papel: 'CLIENTE', senhaHash: null });
    // conta sem senha não entra
    expect(
      (await api.http().post('/auth/login').send({ email: 'novo@t.dev', senha: 'qualquer-coisa' }))
        .status,
    ).toBe(401);

    await api
      .http()
      .post('/painel/bloqueios')
      .set('Authorization', prof)
      .send({
        profissionalId: e.profissionalIds[0],
        inicio: iso(em('2026-03-02T15:00')),
        fim: iso(em('2026-03-02T15:40')),
        motivo: 'médico',
      });
    const agenda = await api
      .http()
      .get('/painel/agenda?data=2026-03-02')
      .set('Authorization', prof);
    expect(agenda.status).toBe(200);
    expect(agenda.body.profissionais).toHaveLength(1); // profissional vê só a própria agenda
    const [p] = agenda.body.profissionais;
    expect(p.agendamentos).toHaveLength(1);
    expect(p.bloqueios).toEqual([
      expect.objectContaining({ motivo: 'médico', inicio: '2026-03-02T18:00:00.000Z' }),
    ]);
    expect(p.expediente).toEqual([
      { inicio: '2026-03-02T12:00:00.000Z', fim: '2026-03-02T15:00:00.000Z' },
      { inicio: '2026-03-02T16:00:00.000Z', fim: '2026-03-02T21:00:00.000Z' },
    ]);
    expect(
      (await api.http().get('/painel/agenda?data=2026-03-02').set('Authorization', dono)).body
        .profissionais,
    ).toHaveLength(2);
  });

  it('RN-05: bloqueio sobre agendamento → 409; remover bloqueio libera', async () => {
    const c = (await usuarioComSessao(api, { email: 'c@t.dev', papel: 'CLIENTE' })).auth;
    await api
      .http()
      .post(`/estabelecimentos/${e.slug}/agendamentos`)
      .set('Authorization', c)
      .send({
        servicoId: e.servicoId,
        profissionalId: e.profissionalIds[0],
        inicio: iso(SEGUNDA_10H),
      });
    const sobre = await api
      .http()
      .post('/painel/bloqueios')
      .set('Authorization', dono)
      .send({
        profissionalId: e.profissionalIds[0],
        inicio: iso(em('2026-03-02T10:15')),
        fim: iso(em('2026-03-02T11:00')),
      });
    expect(sobre.status).toBe(409);
    const b = await api
      .http()
      .post('/painel/bloqueios')
      .set('Authorization', dono)
      .send({
        profissionalId: e.profissionalIds[0],
        inicio: iso(em('2026-03-02T11:00')),
        fim: iso(em('2026-03-02T11:30')),
      });
    expect(b.status).toBe(201);
    const ag = await api
      .http()
      .post(`/estabelecimentos/${e.slug}/agendamentos`)
      .set('Authorization', c)
      .send({
        servicoId: e.servicoId,
        profissionalId: e.profissionalIds[0],
        inicio: iso(em('2026-03-02T11:00')),
      });
    expect(ag.status).toBe(409);
    expect(
      (await api.http().delete(`/painel/bloqueios/${b.body.id}`).set('Authorization', dono)).status,
    ).toBe(200);
    const de_novo = await api
      .http()
      .post(`/estabelecimentos/${e.slug}/agendamentos`)
      .set('Authorization', c)
      .send({
        servicoId: e.servicoId,
        profissionalId: e.profissionalIds[0],
        inicio: iso(em('2026-03-02T11:00')),
      });
    expect(de_novo.status).toBe(201);
  });

  it('RN-14: serviços — criar e editar (DONO) sem mudar agendamentos feitos', async () => {
    const c = (await usuarioComSessao(api, { email: 'c@t.dev', papel: 'CLIENTE' })).auth;
    const ag = await api
      .http()
      .post(`/estabelecimentos/${e.slug}/agendamentos`)
      .set('Authorization', c)
      .send({
        servicoId: e.servicoId,
        profissionalId: e.profissionalIds[0],
        inicio: iso(SEGUNDA_10H),
      });
    const ed = await api
      .http()
      .patch(`/painel/servicos/${e.servicoId}`)
      .set('Authorization', dono)
      .send({ duracaoMin: 90, precoCentavos: 9000 });
    expect(ed.status).toBe(200);
    expect(ed.body).toMatchObject({ duracaoMin: 90, precoCentavos: 9000, nome: 'Corte' });
    const lista = await api.http().get('/eu/agendamentos').set('Authorization', c);
    expect(lista.body[0]).toMatchObject({
      id: ag.body.id,
      servico: { duracaoMin: 30, precoCentavos: 5000 },
      fim: '2026-03-02T13:30:00.000Z',
    });
    const novo = await api
      .http()
      .post('/painel/servicos')
      .set('Authorization', dono)
      .send({ nome: 'Barba', duracaoMin: 20, precoCentavos: 3000 });
    expect(novo.status).toBe(201);
    expect(novo.body).toMatchObject({ preparoMin: 0, limpezaMin: 0, ativo: true });
    expect(
      (
        await api
          .http()
          .post('/painel/servicos')
          .set('Authorization', dono)
          .send({ nome: '', duracaoMin: 2 })
      ).status,
    ).toBe(400);
  });

  it('RN-11 / RN-03: profissionais e jornada (validada pelo domínio)', async () => {
    const p = await api
      .http()
      .post('/painel/profissionais')
      .set('Authorization', dono)
      .send({ nome: 'Nova', servicoIds: [e.servicoId] });
    expect(p.status).toBe(201);
    expect(p.body).toMatchObject({ nome: 'Nova', ativo: true, servicoIds: [e.servicoId] });
    const outro = await criarEstab(api.prisma, 'outro');
    const ruim = await api
      .http()
      .patch(`/painel/profissionais/${p.body.id}`)
      .set('Authorization', dono)
      .send({ servicoIds: [outro.servicoId] });
    expect(ruim.status).toBe(400);

    const sobreposta = await api
      .http()
      .put(`/painel/profissionais/${p.body.id}/jornada`)
      .set('Authorization', dono)
      .send({
        dias: {
          '1': [
            { inicio: '09:00', fim: '12:00' },
            { inicio: '11:00', fim: '13:00' },
          ],
        },
      });
    expect(sobreposta.status).toBe(400);
    expect(sobreposta.body.detalhes).toMatchObject({ motivo: 'TRECHOS_SOBREPOSTOS' });
    const ok = await api
      .http()
      .put(`/painel/profissionais/${p.body.id}/jornada`)
      .set('Authorization', dono)
      .send({ dias: { '1': [{ inicio: '14:00', fim: '16:00' }] } });
    expect(ok.status).toBe(200);
    const horarios = await api
      .http()
      .get(
        `/estabelecimentos/${e.slug}/horarios?servicoId=${e.servicoId}&profissionalId=${p.body.id}&data=2026-03-02`,
      );
    expect(horarios.body.map((h: { inicio: string }) => h.inicio)[0]).toBe(
      '2026-03-02T17:00:00.000Z',
    );
  });

  it('RN-04: folga do profissional tira o dia; remover a exceção devolve', async () => {
    const folga = await api
      .http()
      .post('/painel/excecoes')
      .set('Authorization', prof)
      .send({ tipo: 'FOLGA', profissionalId: e.profissionalIds[0], data: '2026-03-02' });
    expect(folga.status).toBe(201);
    const url = `/estabelecimentos/${e.slug}/horarios?servicoId=${e.servicoId}&profissionalId=${e.profissionalIds[0]}&data=2026-03-02`;
    expect((await api.http().get(url)).body).toEqual([]);
    expect(
      (await api.http().delete(`/painel/excecoes/${folga.body.id}`).set('Authorization', prof))
        .status,
    ).toBe(200);
    expect((await api.http().get(url)).body.length).toBeGreaterThan(0);
    const invalida = await api.http().post('/painel/excecoes').set('Authorization', dono).send({
      tipo: 'HORARIO_EXTRA',
      profissionalId: e.profissionalIds[0],
      data: '2026-03-02',
      inicio: '20:00',
      fim: '19:00',
    });
    expect(invalida.status).toBe(400);
  });

  it('RN-18: clientes com faltas aparecem bloqueados; desbloquear libera o agendamento online', async () => {
    const { id } = await usuarioComSessao(api, { email: 'c@t.dev', papel: 'CLIENTE' });
    const c = (
      await api.http().post('/auth/login').send({ email: 'c@t.dev', senha: 'senha-de-teste' })
    ).body.token as string;
    const ids: string[] = [];
    for (const dia of ['02', '03', '04']) {
      const r = await api
        .http()
        .post(`/estabelecimentos/${e.slug}/agendamentos`)
        .set('Authorization', `Bearer ${c}`)
        .send({
          servicoId: e.servicoId,
          profissionalId: e.profissionalIds[0],
          inicio: iso(em(`2026-03-${dia}T10:00`)),
        });
      ids.push(r.body.id as string);
    }
    api.relogio.instante = em('2026-03-04T11:00');
    for (const ag of ids)
      expect(
        (
          await api
            .http()
            .post(`/agendamentos/${ag}/nao-compareceu`)
            .set('Authorization', dono)
            .send({})
        ).status,
      ).toBe(200);
    const lista = await api.http().get('/painel/clientes').set('Authorization', dono);
    const cli = lista.body.find((x: { email: string }) => x.email === 'c@t.dev');
    expect(cli).toMatchObject({ faltas: 3, bloqueado: true });
    const tentar = () =>
      api
        .http()
        .post(`/estabelecimentos/${e.slug}/agendamentos`)
        .set('Authorization', `Bearer ${c}`)
        .send({
          servicoId: e.servicoId,
          profissionalId: e.profissionalIds[0],
          inicio: iso(em('2026-03-06T10:00')),
        });
    expect((await tentar()).status).toBe(403);
    expect(
      (
        await api
          .http()
          .post(`/painel/clientes/${cli.id}/desbloquear`)
          .set('Authorization', dono)
          .send({})
      ).status,
    ).toBe(200);
    expect((await tentar()).status).toBe(201);
    expect(id).toBeTruthy();
  });

  it('RN-09: políticas editáveis pelo dono valem na hora', async () => {
    const r = await api
      .http()
      .patch('/painel/estabelecimento/politicas')
      .set('Authorization', dono)
      .send({ antecedenciaMinimaMin: 0, granularidadeMin: 30 });
    expect(r.status).toBe(200);
    expect(r.body.politicas).toMatchObject({ antecedenciaMinimaMin: 0, granularidadeMin: 30 });
    expect(
      (
        await api
          .http()
          .patch('/painel/estabelecimento/politicas')
          .set('Authorization', dono)
          .send({ granularidadeMin: 1 })
      ).status,
    ).toBe(400);
  });

  it('leituras do painel (fase 5): estabelecimento, jornada, exceções do dia e serviço público com bloco', async () => {
    const est = await api.http().get('/painel/estabelecimento').set('Authorization', prof);
    expect(est.status).toBe(200);
    expect(est.body).toMatchObject({ id: e.id, slug: e.slug, fuso: 'America/Sao_Paulo' });
    expect(est.body.politicas).toMatchObject({ limiteFaltas: 3, confirmacaoAutomatica: true });
    expect(est.body.politicas).not.toHaveProperty('fuso');

    const jornada = await api
      .http()
      .get(`/painel/profissionais/${e.profissionalIds[0]}/jornada`)
      .set('Authorization', prof);
    expect(jornada.status).toBe(200);
    expect(jornada.body.dias['1']).toEqual([
      { inicio: '09:00', fim: '12:00' },
      { inicio: '13:00', fim: '18:00' },
    ]);
    expect(jornada.body.dias['7']).toEqual([]);
    // RN-23: o profissional não lê a jornada do colega.
    expect(
      (
        await api
          .http()
          .get(`/painel/profissionais/${e.profissionalIds[1]}/jornada`)
          .set('Authorization', prof)
      ).status,
    ).toBe(403);

    const folga = await api.http().post('/painel/excecoes').set('Authorization', dono).send({
      tipo: 'FOLGA',
      profissionalId: e.profissionalIds[0],
      data: '2026-03-02',
      inicio: '15:00',
      fim: '18:00',
    });
    const agenda = await api
      .http()
      .get('/painel/agenda?data=2026-03-02')
      .set('Authorization', dono);
    const [p1, p2] = agenda.body.profissionais;
    expect(p1.excecoes).toEqual([
      { id: folga.body.id, tipo: 'FOLGA', inicio: '15:00', fim: '18:00' },
    ]);
    expect(p2.excecoes).toEqual([]);

    const pub = await api.http().get(`/estabelecimentos/${e.slug}`);
    expect(pub.body.servicos[0]).toMatchObject({ preparoMin: 0, limpezaMin: 0 });
  });
});
