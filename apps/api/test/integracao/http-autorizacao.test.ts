import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEGUNDA_10H } from './apoio';
import { type ApiDeTeste, type Estab, criarApi, criarEstab, usuarioComSessao } from './apoio-http';

/**
 * Matriz papel × rota sensível (RN-23). Cenário fixo, montado uma vez:
 * E1 (dono1, prof1 → P1, prof2 → P2), E2 (dono2), clientes A (dono do agendamento X, em P1) e B.
 */
let api: ApiDeTeste;
let e1: Estab;
let e2: Estab;
const t: Record<string, string> = {};
let x = '';

beforeAll(async () => {
  api = await criarApi(10);
  await api.limpar();
  e1 = await criarEstab(api.prisma, 'e1', { confirmacaoAutomatica: false });
  e2 = await criarEstab(api.prisma, 'e2');
  const [p1, p2] = e1.profissionalIds;
  t['dono1'] = (
    await usuarioComSessao(api, { email: 'dono1@t.dev', papel: 'DONO', estabelecimentoId: e1.id })
  ).auth;
  t['prof1'] = (
    await usuarioComSessao(api, {
      email: 'prof1@t.dev',
      papel: 'PROFISSIONAL',
      estabelecimentoId: e1.id,
      profissionalId: p1,
    })
  ).auth;
  t['prof2'] = (
    await usuarioComSessao(api, {
      email: 'prof2@t.dev',
      papel: 'PROFISSIONAL',
      estabelecimentoId: e1.id,
      profissionalId: p2,
    })
  ).auth;
  t['dono2'] = (
    await usuarioComSessao(api, { email: 'dono2@t.dev', papel: 'DONO', estabelecimentoId: e2.id })
  ).auth;
  t['clienteA'] = (await usuarioComSessao(api, { email: 'a@t.dev', papel: 'CLIENTE' })).auth;
  t['clienteB'] = (await usuarioComSessao(api, { email: 'b@t.dev', papel: 'CLIENTE' })).auth;
  const r = await api
    .http()
    .post('/estabelecimentos/e1/agendamentos')
    .set('Authorization', t['clienteA'])
    .send({
      servicoId: e1.servicoId,
      profissionalId: p1,
      inicio: new Date(SEGUNDA_10H).toISOString(),
    });
  expect(r.status).toBe(201);
  x = r.body.id as string;
});
afterAll(() => api.fechar());

type Papel = 'anonimo' | 'clienteA' | 'clienteB' | 'prof1' | 'prof2' | 'dono1' | 'dono2';

async function chamar(
  quem: Papel,
  metodo: 'get' | 'post' | 'patch' | 'put' | 'delete',
  rota: string,
  corpo?: object,
) {
  let req = api.http()[metodo](rota);
  if (quem !== 'anonimo') req = req.set('Authorization', t[quem]!);
  return (corpo === undefined ? req : req.send(corpo)).then((r) => r.status);
}

async function matriz(
  metodo: 'get' | 'post' | 'patch' | 'put' | 'delete',
  rota: string,
  esperado: Partial<Record<Papel, number>>,
  corpo?: () => object,
) {
  const obtido: Partial<Record<Papel, number>> = {};
  for (const quem of Object.keys(esperado) as Papel[])
    obtido[quem] = await chamar(quem, metodo, rota, corpo?.());
  expect(obtido).toEqual(esperado);
}

describe('RN-23 — matriz de autorização pela API', () => {
  it('RN-23: GET /agendamentos/:id/historico', async () => {
    await matriz('get', `/agendamentos/${x}/historico`, {
      anonimo: 401,
      clienteA: 200,
      clienteB: 404,
      prof1: 200,
      prof2: 403,
      dono1: 200,
      dono2: 404,
    });
  });

  it('RN-23: POST /agendamentos/:id/confirmar (cliente 403; colega 403; outro estab 404; o profissional confirma)', async () => {
    await matriz(
      'post',
      `/agendamentos/${x}/confirmar`,
      {
        anonimo: 401,
        clienteA: 403,
        clienteB: 404,
        prof2: 403,
        dono2: 404,
        prof1: 200,
      },
      () => ({}),
    );
  });

  it('RN-23: GET /painel/agenda', async () => {
    await matriz('get', '/painel/agenda?data=2026-03-02', {
      anonimo: 401,
      clienteA: 403,
      prof1: 200,
      dono1: 200,
      dono2: 200,
    });
    await matriz('get', `/painel/agenda?data=2026-03-02&profissionalId=${e1.profissionalIds[1]}`, {
      prof1: 403,
      dono1: 200,
      dono2: 404,
    });
  });

  it('RN-23: cadastros só do dono (servicos, profissionais, clientes, políticas)', async () => {
    await matriz('get', '/painel/servicos', {
      anonimo: 401,
      clienteA: 403,
      prof1: 403,
      dono1: 200,
    });
    await matriz('get', '/painel/profissionais', { clienteA: 403, prof1: 403, dono1: 200 });
    await matriz('get', '/painel/clientes', { clienteA: 403, prof1: 403, dono1: 200 });
    await matriz(
      'patch',
      '/painel/estabelecimento/politicas',
      { clienteA: 403, prof1: 403, dono1: 200 },
      () => ({ horizonteDias: 60 }),
    );
    await matriz(
      'patch',
      `/painel/servicos/${e1.servicoId}`,
      { prof1: 403, dono2: 404, dono1: 200 },
      () => ({ precoCentavos: 5500 }),
    );
  });

  it('RN-23: bloqueios e jornada — profissional só na própria agenda', async () => {
    const bloqueio = (p: string, h: number) => () => ({
      profissionalId: p,
      inicio: new Date(SEGUNDA_10H + h * 3_600_000).toISOString(),
      fim: new Date(SEGUNDA_10H + h * 3_600_000 + 30 * 60_000).toISOString(),
    });
    const [p1, p2] = e1.profissionalIds;
    await matriz(
      'post',
      '/painel/bloqueios',
      { clienteA: 403, prof1: 403, dono2: 404 },
      bloqueio(p2, 4),
    );
    await matriz('post', '/painel/bloqueios', { prof1: 201 }, bloqueio(p1, 4));
    await matriz('post', '/painel/bloqueios', { dono1: 201 }, bloqueio(p2, 5));
    const jornada = () => ({
      dias: {
        '1': [
          { inicio: '09:00', fim: '12:00' },
          { inicio: '13:00', fim: '18:00' },
        ],
      },
    });
    await matriz(
      'put',
      `/painel/profissionais/${p1}/jornada`,
      { prof1: 200, prof2: 403, dono2: 404, dono1: 200 },
      jornada,
    );
  });

  it('RN-23: exceções — feriado só o dono; folga do colega 403', async () => {
    const [p1, p2] = e1.profissionalIds;
    await matriz('post', '/painel/excecoes', { prof1: 403, dono1: 201 }, () => ({
      tipo: 'FERIADO',
      data: '2026-12-25',
    }));
    await matriz('post', '/painel/excecoes', { prof1: 403 }, () => ({
      tipo: 'FOLGA',
      profissionalId: p2,
      data: '2026-12-26',
    }));
    await matriz('post', '/painel/excecoes', { prof1: 201 }, () => ({
      tipo: 'FOLGA',
      profissionalId: p1,
      data: '2026-12-26',
    }));
  });

  it('RN-23: agendar online é só para cliente; balcão é só para o estabelecimento', async () => {
    const corpo = () => ({
      servicoId: e1.servicoId,
      inicio: new Date(SEGUNDA_10H + 3_600_000).toISOString(),
    });
    await matriz(
      'post',
      '/estabelecimentos/e1/agendamentos',
      { anonimo: 401, dono1: 403, prof1: 403 },
      corpo,
    );
    const balcao = () => ({ ...corpo(), cliente: { email: 'novo@t.dev', nome: 'Novo' } });
    await matriz('post', '/painel/agendamentos', { anonimo: 401, clienteA: 403 }, balcao);
  });

  it('RN-23: cliente B não vê nem cancela o agendamento de A (404); remarcar pelo colega → 403', async () => {
    await matriz(
      'post',
      `/agendamentos/${x}/cancelar`,
      { clienteB: 404, dono2: 404, prof2: 403 },
      () => ({}),
    );
    await matriz('post', `/agendamentos/${x}/remarcar`, { clienteB: 404, prof2: 403 }, () => ({
      inicio: new Date(SEGUNDA_10H + 3_600_000).toISOString(),
    }));
    // o profissional não move o agendamento para a agenda de outro profissional
    await matriz('post', `/agendamentos/${x}/remarcar`, { prof1: 403 }, () => ({
      inicio: new Date(SEGUNDA_10H).toISOString(),
      profissionalId: e1.profissionalIds[1],
    }));
  });

  it('RN-23: id que não é UUID → 404, rota inexistente → 404', async () => {
    expect(await chamar('dono1', 'get', '/agendamentos/abc/historico')).toBe(404);
    expect(await chamar('dono1', 'get', '/nao-existe')).toBe(404);
  });
});
