import { CODIGOS_ERRO, HTTP_STATUS_POR_CODIGO, corpoErroSchema } from '@agenda/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { enviarLembretes } from '../../src/application';
import { criarAplicacao } from '../../src/infra/http';
import { SEGUNDA_10H, em } from './apoio';
import {
  type ApiDeTeste,
  type Estab,
  WEB_ORIGIN,
  criarApi,
  criarEstab,
  usuarioComSessao,
} from './apoio-http';

let api: ApiDeTeste;
let e: Estab;
let dono: string;
let cliente: string;
let clienteEmail: string;

beforeAll(async () => {
  api = await criarApi(30);
});
afterAll(() => api.fechar());
beforeEach(async () => {
  await api.limpar();
  e = await criarEstab(api.prisma, 'barbearia');
  dono = (
    await usuarioComSessao(api, { email: 'dono@t.dev', papel: 'DONO', estabelecimentoId: e.id })
  ).auth;
  clienteEmail = 'cliente@t.dev';
  cliente = (await usuarioComSessao(api, { email: clienteEmail, papel: 'CLIENTE', nome: 'Clara' }))
    .auth;
});

const iso = (ms: number) => new Date(ms).toISOString();
const agendar = (auth: string, inicio: number, extra: object = {}, chave?: string) => {
  let r = api.http().post(`/estabelecimentos/${e.slug}/agendamentos`).set('Authorization', auth);
  if (chave !== undefined) r = r.set('Idempotency-Key', chave);
  return r.send({
    servicoId: e.servicoId,
    profissionalId: e.profissionalIds[0],
    inicio: iso(inicio),
    ...extra,
  });
};

describe('agendamentos pela API', () => {
  it('RN-13 / RN-16 / RN-15: agendar → 201, conflito → 409 com próximos horários, remarcar e cancelar', async () => {
    const outro = (await usuarioComSessao(api, { email: 'outro@t.dev', papel: 'CLIENTE' })).auth;
    const a = await agendar(cliente, SEGUNDA_10H);
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({
      inicio: '2026-03-02T13:00:00.000Z',
      status: 'CONFIRMADO',
      servicoNome: 'Corte',
    });

    const conflito = await agendar(outro, SEGUNDA_10H);
    expect(conflito.status).toBe(409);
    expect(corpoErroSchema.parse(conflito.body).codigo).toBe('HORARIO_INDISPONIVEL');
    expect(conflito.body.detalhes.proximosHorarios).toEqual([
      '2026-03-02T13:30:00.000Z',
      '2026-03-02T13:45:00.000Z',
      '2026-03-02T14:00:00.000Z',
      '2026-03-02T14:15:00.000Z',
      '2026-03-02T14:30:00.000Z',
    ]);

    const remarcado = await api
      .http()
      .post(`/agendamentos/${a.body.id}/remarcar`)
      .set('Authorization', cliente)
      .send({ inicio: iso(em('2026-03-02T15:00')) });
    expect(remarcado.status).toBe(200);
    expect(remarcado.body).toMatchObject({
      id: a.body.id,
      inicio: '2026-03-02T18:00:00.000Z',
      versao: 1,
    });

    const futuros = await api
      .http()
      .get('/eu/agendamentos?escopo=futuros')
      .set('Authorization', cliente);
    expect(futuros.body).toHaveLength(1);
    expect(futuros.body[0]).toMatchObject({
      estabelecimento: { slug: e.slug, fuso: 'America/Sao_Paulo' },
      status: 'CONFIRMADO',
    });

    const cancelado = await api
      .http()
      .post(`/agendamentos/${a.body.id}/cancelar`)
      .set('Authorization', cliente)
      .send({ motivo: 'imprevisto' });
    expect(cancelado.status).toBe(200);
    expect(cancelado.body.status).toBe('CANCELADO');
    const h = await api
      .http()
      .get(`/agendamentos/${a.body.id}/historico`)
      .set('Authorization', cliente);
    expect(h.body.map((x: { tipo: string; para: string }) => `${x.tipo}:${x.para}`)).toEqual([
      'STATUS:CONFIRMADO',
      'REMARCACAO:CONFIRMADO',
      'STATUS:CANCELADO',
    ]);
    // o horário liberado volta a ser oferecido
    const horarios = await api
      .http()
      .get(
        `/estabelecimentos/${e.slug}/horarios?servicoId=${e.servicoId}&profissionalId=${e.profissionalIds[0]}&data=2026-03-02`,
      );
    expect(horarios.body.map((x: { inicio: string }) => x.inicio)).toContain(
      '2026-03-02T18:00:00.000Z',
    );
  });

  it('RN-12: GET /estabelecimentos/:slug e horários de "qualquer profissional"', async () => {
    const pub = await api.http().get(`/estabelecimentos/${e.slug}`);
    expect(pub.status).toBe(200);
    expect(pub.body).toMatchObject({
      slug: e.slug,
      fuso: 'America/Sao_Paulo',
      politicas: { antecedenciaMinimaMin: 120 },
    });
    expect(pub.body.servicos.map((s: { nome: string }) => s.nome).sort()).toEqual([
      'Corte',
      'Sem profissional',
    ]);
    expect(pub.body.profissionais).toHaveLength(2);
    const r = await api
      .http()
      .get(`/estabelecimentos/${e.slug}/horarios?servicoId=${e.servicoId}&data=2026-03-02`);
    expect(r.status).toBe(200);
    expect(r.body[0]).toEqual({
      inicio: '2026-03-02T12:00:00.000Z',
      profissionalIds: e.profissionalIds,
    });
  });

  it('RN-22: Idempotency-Key pela API — replay idêntico e corpo diferente → 422', async () => {
    const r1 = await agendar(cliente, SEGUNDA_10H, {}, 'k-1');
    const r2 = await agendar(cliente, SEGUNDA_10H, {}, 'k-1');
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.body).toEqual(r1.body);
    expect(await api.prisma.agendamento.count()).toBe(1);
    expect(api.notificador.enviados).toHaveLength(1); // o replay não manda outro e-mail
    const r3 = await agendar(cliente, em('2026-03-02T11:00'), {}, 'k-1');
    expect(r3.status).toBe(422);
    expect(r3.body.codigo).toBe('CHAVE_IDEMPOTENCIA_REUTILIZADA');
  });

  it('RN-21: 20 POSTs simultâneos via HTTP no mesmo horário → 1×201 e 19×409', async () => {
    const sessoes = [];
    for (let i = 0; i < 20; i++)
      sessoes.push((await usuarioComSessao(api, { email: `c${i}@t.dev`, papel: 'CLIENTE' })).auth);
    const rs = await Promise.all(sessoes.map((auth) => agendar(auth, SEGUNDA_10H)));
    const status = rs.map((r) => r.status).sort();
    expect(status.filter((s) => s === 201)).toHaveLength(1);
    expect(status.filter((s) => s === 409)).toHaveLength(19);
    expect(await api.prisma.agendamento.count()).toBe(1);
    expect(api.notificador.enviados).toHaveLength(1);
  });
});

describe('RN-24 — e-mails', () => {
  it('RN-24: um e-mail de confirmação depois do commit; nenhum na recusa', async () => {
    const a = await agendar(cliente, SEGUNDA_10H);
    expect(a.status).toBe(201);
    expect(api.notificador.enviados).toEqual([
      expect.objectContaining({
        para: clienteEmail,
        assunto: expect.stringContaining('confirmado'),
      }),
    ]);
    expect(api.notificador.enviados[0]!.texto).toContain('segunda-feira, 02/03/2026 às 10:00');
    expect((await agendar(cliente, SEGUNDA_10H)).status).toBe(409);
    expect((await agendar(cliente, em('2026-03-02T10:05'))).status).toBe(422);
    expect(api.notificador.enviados).toHaveLength(1);
  });

  it('RN-24: falha no envio não desfaz o agendamento', async () => {
    api.notificador.falharProximos = 1;
    const a = await agendar(cliente, SEGUNDA_10H);
    expect(a.status).toBe(201);
    expect(await api.prisma.agendamento.count()).toBe(1);
    expect(api.erros).toHaveLength(1);
  });

  it('RN-24: lembrete 24 h antes, uma vez; remarcar rearma; cancelado não recebe', async () => {
    const a = await agendar(cliente, SEGUNDA_10H);
    const b = await agendar(cliente, em('2026-03-02T15:00'));
    api.notificador.enviados.length = 0;
    expect(await enviarLembretes(api.deps)).toBe(0); // agora = domingo 08:00, faltam 26 h

    await api
      .http()
      .post(`/agendamentos/${b.body.id}/cancelar`)
      .set('Authorization', cliente)
      .send({});
    api.notificador.enviados.length = 0;
    api.relogio.instante = em('2026-03-01T16:00'); // faltam 18 h para A; B está cancelado
    const [x, y] = await Promise.all([enviarLembretes(api.deps), enviarLembretes(api.deps)]);
    expect(x + y).toBe(1); // duas "instâncias" do job: um único envio
    expect(api.notificador.enviados).toEqual([
      expect.objectContaining({ assunto: expect.stringContaining('Lembrete') }),
    ]);
    expect(await enviarLembretes(api.deps)).toBe(0);

    const r = await api
      .http()
      .post(`/agendamentos/${a.body.id}/remarcar`)
      .set('Authorization', cliente)
      .send({ inicio: iso(em('2026-03-02T11:00')) });
    expect(r.status).toBe(200);
    expect(await enviarLembretes(api.deps)).toBe(1); // remarcar zerou lembreteEnviadoEm
  });
});

describe('mapeamento de códigos', () => {
  it('RN-23: todo CodigoErro alcançável via HTTP volta com o status da tabela e o corpo de erro', async () => {
    const vistos = new Map<string, number>();
    const registrar = (r: request.Response) => {
      const corpo = corpoErroSchema.parse(r.body);
      expect(r.status, corpo.codigo).toBe(HTTP_STATUS_POR_CODIGO[corpo.codigo]);
      vistos.set(corpo.codigo, r.status);
    };
    const outro = (await usuarioComSessao(api, { email: 'o@t.dev', papel: 'CLIENTE' })).auth;
    const [p1] = e.profissionalIds;

    const a = await agendar(cliente, SEGUNDA_10H);
    registrar(await agendar(outro, SEGUNDA_10H)); // HORARIO_INDISPONIVEL
    registrar(await agendar(outro, em('2026-03-02T19:00'))); // FORA_DO_EXPEDIENTE
    registrar(await agendar(outro, em('2026-03-02T10:05'))); // HORARIO_FORA_DA_GRADE
    registrar(await agendar(outro, em('2026-03-01T09:00'))); // ANTECEDENCIA_MINIMA
    registrar(await agendar(outro, em('2026-06-01T10:00'))); // ALEM_DO_HORIZONTE
    registrar(await agendar(outro, em('2026-03-02T11:00'), { servicoId: e.servicoOrfaoId })); // PROFISSIONAL_NAO_EXECUTA_SERVICO
    registrar(
      await api
        .http()
        .post('/painel/agendamentos')
        .set('Authorization', dono)
        .send({
          servicoId: e.servicoId,
          profissionalId: p1,
          inicio: iso(em('2026-02-27T10:00')),
          cliente: { email: 'z@t.dev', nome: 'Z' },
        }),
    ); // HORARIO_NO_PASSADO
    registrar(
      await api
        .http()
        .post(`/agendamentos/${a.body.id}/confirmar`)
        .set('Authorization', cliente)
        .send({}),
    ); // ACESSO_NEGADO
    registrar(
      await api
        .http()
        .post(`/agendamentos/${a.body.id}/confirmar`)
        .set('Authorization', dono)
        .send({}),
    ); // TRANSICAO (já confirmado)
    expect((await agendar(cliente, em('2026-03-03T10:00'), {}, 'k')).status).toBe(201);
    registrar(await agendar(cliente, em('2026-03-03T11:00'), {}, 'k')); // CHAVE_IDEMPOTENCIA_REUTILIZADA
    await agendar(cliente, em('2026-03-04T10:00'));
    registrar(await agendar(cliente, em('2026-03-05T10:00'))); // LIMITE_DE_AGENDAMENTOS (3 ativos)
    await api.prisma.agendamento.updateMany({
      where: { inicio: { gte: new Date('2026-03-03T00:00:00Z') } },
      data: { status: 'NAO_COMPARECEU' },
    });
    await api.prisma.agendamento.create({
      data: {
        estabelecimentoId: e.id,
        profissionalId: p1,
        clienteId: (await api.prisma.agendamento.findUniqueOrThrow({ where: { id: a.body.id } }))
          .clienteId,
        servicoId: e.servicoId,
        servicoNome: 'Corte',
        duracaoMin: 30,
        precoCentavos: 0,
        preparoMin: 0,
        limpezaMin: 0,
        inicio: new Date('2026-02-20T13:00:00Z'),
        fim: new Date('2026-02-20T13:30:00Z'),
        inicioBloco: new Date('2026-02-20T13:00:00Z'),
        fimBloco: new Date('2026-02-20T13:30:00Z'),
        status: 'NAO_COMPARECEU',
        criadoEm: new Date(0),
        atualizadoEm: new Date(0),
      },
    });
    registrar(await agendar(cliente, em('2026-03-06T10:00'))); // CLIENTE_BLOQUEADO (3 faltas)
    api.relogio.instante = em('2026-03-02T07:00');
    registrar(
      await api
        .http()
        .post(`/agendamentos/${a.body.id}/cancelar`)
        .set('Authorization', cliente)
        .send({}),
    ); // PRAZO
    registrar(await api.http().get('/estabelecimentos/nao-existe')); // NAO_ENCONTRADO
    registrar(await api.http().post('/auth/registro').send({ email: 'x' })); // DADOS_INVALIDOS
    registrar(await api.http().get('/eu/agendamentos')); // NAO_AUTENTICADO

    // ERRO_INTERNO: uma app cujo repositório falha de verdade.
    const quebrada = await criarAplicacao(
      {
        ...api.deps,
        cadastro: {
          leitura: () => Promise.reject(new Error('banco fora')),
          transacao: () => Promise.reject(new Error('x')),
        },
        registro: { erro: () => undefined },
      },
      { producao: false, webOrigin: WEB_ORIGIN, logger: false },
    );
    await quebrada.init();
    const r500 = await request(quebrada.getHttpServer()).get('/estabelecimentos/qualquer');
    expect(r500.body).toEqual({ codigo: 'ERRO_INTERNO', mensagem: expect.any(String) });
    expect(JSON.stringify(r500.body)).not.toContain('banco fora');
    registrar(r500);
    await quebrada.close();

    expect([...vistos.keys()].sort()).toEqual([...CODIGOS_ERRO].sort());
  });
});

describe('OpenAPI', () => {
  it('GET /docs-json responde e contém as rotas principais (com bearer auth)', async () => {
    const r = await api.http().get('/docs-json');
    expect(r.status).toBe(200);
    expect(r.body.components.securitySchemes.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    const rotas = Object.keys(r.body.paths);
    for (const rota of [
      '/auth/login',
      '/auth/registro',
      '/auth/eu',
      '/estabelecimentos/{slug}',
      '/estabelecimentos/{slug}/horarios',
      '/estabelecimentos/{slug}/agendamentos',
      '/eu/agendamentos',
      '/agendamentos/{id}/remarcar',
      '/agendamentos/{id}/cancelar',
      '/painel/agenda',
      '/painel/agendamentos',
      '/painel/bloqueios',
      '/painel/servicos',
      '/painel/profissionais/{id}/jornada',
    ]) {
      expect(rotas).toContain(rota);
    }
    expect(
      r.body.paths['/auth/login'].post.requestBody.content['application/json'].schema.properties,
    ).toHaveProperty('email');
  });
});
