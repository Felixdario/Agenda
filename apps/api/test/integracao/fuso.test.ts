import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { agendar, listarHorarios } from '../../src/application';
import { UnidadeDeTrabalhoPrisma, criarPrisma } from '../../src/infra/prisma';
import { PrismaClient } from '../../src/infra/prisma/generated/client';
import { AGORA, RelogioDeTeste, SEGUNDA_10H, criarAmbiente, semear } from './apoio';
import { BANCO_DE_TESTE, urlAdmin, urlDeTeste } from './banco';

const amb = criarAmbiente(5);

async function admin(sql: string) {
  const c = new pg.Client({ connectionString: urlAdmin() });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

/** Sessão nova, sem SET: herda o default do banco. */
async function consultaCrua<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: urlDeTeste() });
  await c.connect();
  try {
    return (await c.query<T>(sql, params)).rows;
  } finally {
    await c.end();
  }
}

describe('RN-02 — instantes independem do TimeZone do Postgres', () => {
  beforeAll(async () => {
    await amb.limpar();
    await admin(`ALTER DATABASE ${BANCO_DE_TESTE} SET timezone = 'Asia/Tokyo'`);
  });
  afterAll(async () => {
    await admin(`ALTER DATABASE ${BANCO_DE_TESTE} RESET timezone`);
    await amb.fechar();
  });

  it('RN-02: com o banco em Asia/Tokyo, agendar e ler devolvem os mesmos instantes UTC', async () => {
    // O default do banco é mesmo Tokyo para sessões novas…
    const [sessao] = await consultaCrua<{ tz: string }>(`SELECT current_setting('TimeZone') AS tz`);
    expect(sessao?.tz).toBe('Asia/Tokyo');

    // …mas a sessão da aplicação é fixada em UTC por criarPrisma.
    const prisma = criarPrisma({ url: urlDeTeste(), maxConexoes: 3 });
    try {
      const tz = await prisma.$queryRawUnsafe<{ tz: string }[]>(
        `SELECT current_setting('TimeZone') AS tz`,
      );
      expect(tz[0]?.tz).toBe('UTC');

      const c = await semear(prisma, { clientes: 2 });
      const deps = { uow: new UnidadeDeTrabalhoPrisma(prisma), relogio: new RelogioDeTeste(AGORA) };
      const cl = c.clientes[0]!;
      const r = await agendar(deps, {
        estabelecimentoId: c.estabelecimentoId,
        servicoId: c.servicoId,
        profissionalId: c.profissionalIds[0]!,
        clienteId: cl.clienteId,
        inicio: SEGUNDA_10H,
        ator: { usuarioId: cl.usuarioId, papel: 'CLIENTE' },
      });
      expect(r).toMatchObject({
        ok: true,
        valor: { inicio: '2026-03-02T13:00:00.000Z', fim: '2026-03-02T13:30:00.000Z' },
      });
      if (!r.ok) return;

      // Gravado certo: uma sessão em Tokyo lê o mesmo epoch.
      const [linha] = await consultaCrua<{ i: number; local: string }>(
        `SELECT extract(epoch FROM inicio)::float8 AS i, to_char(inicio, 'YYYY-MM-DD HH24:MI TZ') AS local
           FROM "Agendamento" WHERE id = $1`,
        [r.valor.id],
      );
      expect(linha!.i * 1000).toBe(SEGUNDA_10H);
      expect(linha!.local).toBe('2026-03-02 22:00 JST');

      // Lido certo pelo Prisma e pela aplicação: o horário continua ocupado no instante certo.
      const lido = await prisma.agendamento.findUniqueOrThrow({ where: { id: r.valor.id } });
      expect(lido.inicio.getTime()).toBe(SEGUNDA_10H);
      const outro = c.clientes[1]!;
      expect(
        await agendar(deps, {
          estabelecimentoId: c.estabelecimentoId,
          servicoId: c.servicoId,
          profissionalId: c.profissionalIds[0]!,
          clienteId: outro.clienteId,
          inicio: SEGUNDA_10H,
          ator: { usuarioId: outro.usuarioId, papel: 'CLIENTE' },
        }),
      ).toMatchObject({ ok: false, codigo: 'HORARIO_INDISPONIVEL' });
      const horarios = await listarHorarios(deps, {
        estabelecimentoId: c.estabelecimentoId,
        servicoId: c.servicoId,
        profissionalId: null,
        dataLocal: '2026-03-02',
        ator: { usuarioId: outro.usuarioId, papel: 'CLIENTE' },
      });
      expect(horarios.ok && horarios.valor.map((h) => h.inicio)).not.toContain(
        '2026-03-02T13:00:00.000Z',
      );
      expect(horarios.ok && horarios.valor.map((h) => h.inicio)).toContain(
        '2026-03-02T13:30:00.000Z',
      );
    } finally {
      await prisma.$disconnect();
    }
  });

  it('RN-02: TimeZone forçado na URL (options=-c TimeZone=…) também é sobreposto por UTC', async () => {
    const url = new URL(urlDeTeste());
    url.searchParams.set('options', '-c TimeZone=America/New_York');
    const prisma = criarPrisma({ url: url.toString(), maxConexoes: 2 });
    try {
      const tz = await prisma.$queryRawUnsafe<{ tz: string }[]>(
        `SELECT current_setting('TimeZone') AS tz`,
      );
      expect(tz[0]?.tz).toBe('UTC');
      const c = await semear(prisma);
      const instante = new Date('2026-11-01T05:30:00.000Z'); // 01:30 EDT, hora repetida em NY
      const b = await prisma.bloqueio.create({
        data: {
          profissionalId: c.profissionalIds[0]!,
          inicio: instante,
          fim: new Date(instante.getTime() + 60_000),
        },
      });
      const [linha] = await consultaCrua<{ i: number }>(
        `SELECT extract(epoch FROM inicio)::float8 AS i FROM "Bloqueio" WHERE id = $1`,
        [b.id],
      );
      expect(linha!.i * 1000).toBe(instante.getTime());
    } finally {
      await prisma.$disconnect();
    }
  });

  it('RN-02 (controle): sem o SET de criarPrisma, o adapter-pg grava deslocado pelo fuso da sessão', async () => {
    // Documenta o comportamento do @prisma/adapter-pg 7.10.1 que motivou a correção. Se uma versão
    // futura do adapter corrigir isso, este teste avisa e o SET pode ser revisto.
    const cru = new PrismaClient({
      adapter: new PrismaPg({ connectionString: urlDeTeste(), max: 1 }),
    });
    try {
      const c = await semear(cru);
      const instante = new Date('2026-03-02T13:00:00.000Z');
      const b = await cru.bloqueio.create({
        data: {
          profissionalId: c.profissionalIds[0]!,
          inicio: instante,
          fim: new Date(instante.getTime() + 60_000),
        },
      });
      const [linha] = await consultaCrua<{ i: number }>(
        `SELECT extract(epoch FROM inicio)::float8 AS i FROM "Bloqueio" WHERE id = $1`,
        [b.id],
      );
      expect(instante.getTime() - linha!.i * 1000).toBe(9 * 3_600_000); // Tokyo = UTC+9
    } finally {
      await cru.$disconnect();
    }
  });
});
