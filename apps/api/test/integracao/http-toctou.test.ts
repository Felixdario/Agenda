import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEGUNDA_10H, em, pgCliente } from './apoio';
import { type ApiDeTeste, type Estab, criarApi, criarEstab, usuarioComSessao } from './apoio-http';

/**
 * RN-23 sem TOCTOU: a autorização é refeita dentro da transação, sobre a linha travada.
 * Roteiro determinístico:
 *  1. uma transação manual trava X (FOR UPDATE);
 *  2. o PROFISSIONAL A (dono de X) pede cancelar/remarcar: a checagem de fora passa, e o pedido fica
 *     esperando a trava da linha (confirmado no pg_stat_activity);
 *  3. a transação manual move X para o profissional B e confirma;
 *  4. o pedido de A continua, vê X já com B e recebe 403, sem gravar nada.
 */
let api: ApiDeTeste;
let e: Estab;
let profA: string;
let x: string;

beforeAll(async () => {
  api = await criarApi(10);
});
afterAll(() => api.fechar());
beforeEach(async () => {
  await api.limpar();
  e = await criarEstab(api.prisma, 'toctou');
  profA = (
    await usuarioComSessao(api, {
      email: 'a@t.dev',
      papel: 'PROFISSIONAL',
      estabelecimentoId: e.id,
      profissionalId: e.profissionalIds[0],
    })
  ).auth;
  const cliente = (await usuarioComSessao(api, { email: 'c@t.dev', papel: 'CLIENTE' })).auth;
  const r = await api
    .http()
    .post(`/estabelecimentos/${e.slug}/agendamentos`)
    .set('Authorization', cliente)
    .send({
      servicoId: e.servicoId,
      profissionalId: e.profissionalIds[0],
      inicio: new Date(SEGUNDA_10H).toISOString(),
    });
  expect(r.status).toBe(201);
  x = r.body.id as string;
});

async function esperarAlguemNaTrava(monitor: pg.Client): Promise<number> {
  for (let i = 0; i < 200; i++) {
    const r = await monitor.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`,
    );
    if (r.rows[0]!.n > 0) return r.rows[0]!.n;
    await new Promise((ok) => setTimeout(ok, 10));
  }
  throw new Error('o pedido não chegou a esperar a trava da linha');
}

async function corrida(pedido: () => PromiseLike<{ status: number; body: { codigo?: string } }>) {
  const segurador = pgCliente();
  const monitor = pgCliente();
  await segurador.connect();
  await monitor.connect();
  try {
    await segurador.query('BEGIN');
    await segurador.query('SELECT id FROM "Agendamento" WHERE id = $1 FOR UPDATE', [x]);
    const emVoo = Promise.resolve(pedido()); // a checagem de fora vê X ainda com o profissional A
    const esperando = await esperarAlguemNaTrava(monitor);
    await segurador.query(
      'UPDATE "Agendamento" SET "profissionalId" = $2, versao = versao + 1 WHERE id = $1',
      [x, e.profissionalIds[1]],
    );
    await segurador.query('COMMIT');
    return { resposta: await emVoo, esperando };
  } finally {
    await segurador.end();
    await monitor.end();
  }
}

describe('RN-23 — autorização na linha travada (sem TOCTOU)', () => {
  it('RN-23: profissional A cancela X enquanto o dono move X para B → 403 e X não muda', async () => {
    const { resposta, esperando } = await corrida(() =>
      api.http().post(`/agendamentos/${x}/cancelar`).set('Authorization', profA).send({}),
    );
    expect(esperando).toBeGreaterThanOrEqual(1);
    expect(resposta.status).toBe(403);
    expect(resposta.body.codigo).toBe('ACESSO_NEGADO');
    const linha = await api.prisma.agendamento.findUniqueOrThrow({ where: { id: x } });
    expect(linha).toMatchObject({
      status: 'CONFIRMADO',
      profissionalId: e.profissionalIds[1],
      versao: 1,
    });
    expect(await api.prisma.historicoStatus.count({ where: { agendamentoId: x } })).toBe(1);
  });

  it('RN-23: profissional A marca falta em X enquanto X vai para B → 403', async () => {
    api.relogio.instante = em('2026-03-02T10:40');
    const { resposta } = await corrida(() =>
      api.http().post(`/agendamentos/${x}/nao-compareceu`).set('Authorization', profA).send({}),
    );
    expect(resposta.status).toBe(403);
    expect((await api.prisma.agendamento.findUniqueOrThrow({ where: { id: x } })).status).toBe(
      'CONFIRMADO',
    );
  });

  it('RN-23 / RN-16: profissional A remarca X enquanto X vai para B → 403 e o horário fica', async () => {
    const { resposta } = await corrida(() =>
      api
        .http()
        .post(`/agendamentos/${x}/remarcar`)
        .set('Authorization', profA)
        .send({ inicio: new Date(em('2026-03-02T11:00')).toISOString() }),
    );
    expect(resposta.status).toBe(403);
    const linha = await api.prisma.agendamento.findUniqueOrThrow({ where: { id: x } });
    expect(linha.inicio.toISOString()).toBe(new Date(SEGUNDA_10H).toISOString());
    expect(linha.versao).toBe(1);
  });

  it('controle: sem a troca no meio, o mesmo pedido de A passa', async () => {
    const r = await api
      .http()
      .post(`/agendamentos/${x}/cancelar`)
      .set('Authorization', profA)
      .send({});
    expect(r.status).toBe(200);
  });
});
