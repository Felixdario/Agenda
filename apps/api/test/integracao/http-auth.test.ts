import { corpoErroSchema } from '@agenda/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AGORA } from './apoio';
import { type ApiDeTeste, SENHA, criarApi, criarEstab, usuarioComSessao } from './apoio-http';

let api: ApiDeTeste;
beforeAll(async () => {
  api = await criarApi(10);
});
afterAll(() => api.fechar());
beforeEach(() => api.limpar());

describe('autenticação (D-15)', () => {
  it('RN-23: registro cria cliente; e-mail repetido → 400 com o campo', async () => {
    const r = await api
      .http()
      .post('/auth/registro')
      .send({ nome: 'Ana', email: 'Ana@Teste.dev', senha: '12345678' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ email: 'ana@teste.dev', papel: 'CLIENTE', nome: 'Ana' });
    const dup = await api
      .http()
      .post('/auth/registro')
      .send({ nome: 'Ana', email: 'ana@teste.dev', senha: '12345678' });
    expect(dup.status).toBe(400);
    expect(dup.body).toMatchObject({
      codigo: 'DADOS_INVALIDOS',
      detalhes: { campos: { email: expect.any(String) } },
    });
    const curta = await api
      .http()
      .post('/auth/registro')
      .send({ nome: 'Ana', email: 'b@teste.dev', senha: '123' });
    expect(curta.body.detalhes.campos.senha).toBeTruthy();
  });

  it('RN-23: login certo devolve cookie httpOnly + token; errado → 401 com a mesma mensagem', async () => {
    await api
      .http()
      .post('/auth/registro')
      .send({ nome: 'Ana', email: 'ana@teste.dev', senha: SENHA });
    const ok = await api.http().post('/auth/login').send({ email: 'ana@teste.dev', senha: SENHA });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toEqual(expect.any(String));
    const cookie = String(ok.headers['set-cookie']);
    expect(cookie).toMatch(/agenda_sessao=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Secure/i);

    const senhaErrada = await api
      .http()
      .post('/auth/login')
      .send({ email: 'ana@teste.dev', senha: 'outra-senha' });
    const semConta = await api
      .http()
      .post('/auth/login')
      .send({ email: 'ninguem@teste.dev', senha: SENHA });
    expect(senhaErrada.status).toBe(401);
    expect(semConta.status).toBe(401);
    expect(senhaErrada.body).toEqual(semConta.body);
    expect(senhaErrada.body).toEqual({
      codigo: 'NAO_AUTENTICADO',
      mensagem: 'E-mail ou senha incorretos.',
    });
    expect(corpoErroSchema.safeParse(senhaErrada.body).success).toBe(true);
  });

  it('RN-23: sem sessão → 401; Bearer e cookie funcionam; logout revoga', async () => {
    expect((await api.http().get('/auth/eu')).status).toBe(401);
    const { token, auth } = await usuarioComSessao(api, { email: 'c@teste.dev', papel: 'CLIENTE' });
    expect(
      (await api.http().get('/auth/eu').set('Authorization', auth)).body.usuario,
    ).toMatchObject({ email: 'c@teste.dev' });
    expect((await api.http().get('/auth/eu').set('Cookie', `agenda_sessao=${token}`)).status).toBe(
      200,
    );
    expect((await api.http().get('/auth/eu').set('Authorization', 'Bearer inventado')).status).toBe(
      401,
    );

    const sair = await api.http().post('/auth/logout').set('Authorization', auth);
    expect(sair.status).toBe(200);
    expect(String(sair.headers['set-cookie'])).toMatch(/agenda_sessao=;/);
    expect((await api.http().get('/auth/eu').set('Authorization', auth)).status).toBe(401);
  });

  it('D-15: sessão expira em 7 dias', async () => {
    const { auth } = await usuarioComSessao(api, { email: 'c@teste.dev', papel: 'CLIENTE' });
    api.relogio.instante = AGORA + 7 * 24 * 3_600_000 - 1;
    expect((await api.http().get('/auth/eu').set('Authorization', auth)).status).toBe(200);
    api.relogio.instante = AGORA + 7 * 24 * 3_600_000;
    expect((await api.http().get('/auth/eu').set('Authorization', auth)).status).toBe(401);
  });

  it('D-15 (CSRF): mudança de estado com cookie exige Content-Type JSON; CORS só para WEB_ORIGIN', async () => {
    const { token } = await usuarioComSessao(api, { email: 'c@teste.dev', papel: 'CLIENTE' });
    const form = await api
      .http()
      .post('/auth/logout')
      .set('Cookie', `agenda_sessao=${token}`)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('x=1');
    expect(form.status).toBe(400);
    expect(form.body).toMatchObject({
      codigo: 'DADOS_INVALIDOS',
      detalhes: { motivo: 'CONTENT_TYPE_JSON_OBRIGATORIO' },
    });
    expect((await api.http().get('/auth/eu').set('Authorization', `Bearer ${token}`)).status).toBe(
      200,
    ); // não revogou

    const json = await api
      .http()
      .post('/auth/logout')
      .set('Cookie', `agenda_sessao=${token}`)
      .set('Content-Type', 'application/json')
      .send({});
    expect(json.status).toBe(200);

    const preflight = await api
      .http()
      .options('/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');
    expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(preflight.headers['access-control-allow-credentials']).toBe('true');
    const estranho = await api
      .http()
      .options('/auth/login')
      .set('Origin', 'https://mal.example')
      .set('Access-Control-Request-Method', 'POST');
    // Origem fixa: o cabeçalho continua sendo WEB_ORIGIN, e o navegador barra a outra origem.
    expect(estranho.headers['access-control-allow-origin']).not.toBe('https://mal.example');
  });

  it('RN-23: GET /auth/eu?estabelecimento=slug cria a linha Cliente sob demanda e traz a situação', async () => {
    const e = await criarEstab(api.prisma, 'eu-estab');
    const { id, auth } = await usuarioComSessao(api, { email: 'c@teste.dev', papel: 'CLIENTE' });
    expect(await api.prisma.cliente.count()).toBe(0);
    const r = await api.http().get(`/auth/eu?estabelecimento=${e.slug}`).set('Authorization', auth);
    expect(r.status).toBe(200);
    expect(r.body.estabelecimento).toMatchObject({
      ativosFuturos: 0,
      limiteAgendamentosAtivos: 3,
      bloqueado: false,
    });
    await api.http().get(`/auth/eu?estabelecimento=${e.slug}`).set('Authorization', auth);
    expect(await api.prisma.cliente.count({ where: { usuarioId: id } })).toBe(1);
  });
});
