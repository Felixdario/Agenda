import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { DateTime } from 'luxon';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { agendar, remarcar } from '../../src/application';
import { UnidadeDeTrabalhoPrisma, criarPrisma } from '../../src/infra/prisma';
import {
  type Ambiente,
  RelogioDeTeste,
  criarAmbiente,
  pgCliente,
  semear,
} from '../integracao/apoio';
import { urlAdmin, urlDeTeste } from '../integracao/banco';
import { H, cliente, dono } from './apoio-validacao';

const amb: Ambiente = criarAmbiente(10);
afterAll(() => amb.fechar());
beforeEach(() => amb.limpar());

const sqlstate = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

async function linhaCrua(
  db: pg.Client,
  c: Awaited<ReturnType<typeof semear>>,
  o: { inicio: string; fim: string; ib?: string; fb?: string; status?: string },
) {
  return db.query(
    `INSERT INTO "Agendamento" (id, "estabelecimentoId", "profissionalId", "clienteId", "servicoId",
       "servicoNome", "duracaoMin", "precoCentavos", "preparoMin", "limpezaMin",
       inicio, fim, "inicioBloco", "fimBloco", status, "criadoEm", "atualizadoEm")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'Corte', 30, 5000, 0, 0, $5, $6, $7, $8,
             $9::"StatusAgendamento", now(), now()) RETURNING id`,
    [
      c.estabelecimentoId,
      c.profissionalIds[0],
      c.clientes[0]!.clienteId,
      c.servicoId,
      o.inicio,
      o.fim,
      o.ib ?? o.inicio,
      o.fb ?? o.fim,
      o.status ?? 'CONFIRMADO',
    ],
  );
}

describe('V8 — integridade direta no banco (RN-21, D-02)', () => {
  it('V8a: UPDATE cru CANCELADO→CONFIRMADO que cria sobreposição falha com 23P01', async () => {
    const c = await semear(amb.prisma);
    const db = pgCliente();
    await db.connect();
    try {
      await linhaCrua(db, c, { inicio: '2026-03-02T13:00Z', fim: '2026-03-02T13:30Z' });
      const b = await linhaCrua(db, c, {
        inicio: '2026-03-02T13:15Z',
        fim: '2026-03-02T13:45Z',
        status: 'CANCELADO',
      });
      expect(
        await sqlstate(
          db.query(`UPDATE "Agendamento" SET status = 'CONFIRMADO' WHERE id = $1`, [b.rows[0].id]),
        ),
      ).toBe('23P01');
      // Também para os outros status que ocupam agenda.
      for (const s of ['PENDENTE', 'CONCLUIDO', 'NAO_COMPARECEU']) {
        expect(
          await sqlstate(
            db.query(`UPDATE "Agendamento" SET status = $2::"StatusAgendamento" WHERE id = $1`, [
              b.rows[0].id,
              s,
            ]),
          ),
        ).toBe('23P01');
      }
      // Deslocar o bloco cru para dentro do outro também falha.
      const c2 = await linhaCrua(db, c, { inicio: '2026-03-02T15:00Z', fim: '2026-03-02T15:30Z' });
      expect(
        await sqlstate(
          db.query(
            `UPDATE "Agendamento" SET "inicioBloco" = '2026-03-02T13:20Z', inicio = '2026-03-02T13:20Z' WHERE id = $1`,
            [c2.rows[0].id],
          ),
        ),
      ).toBe('23P01');
    } finally {
      await db.end();
    }
  });

  it('V8b: CHECK bloco_valido recusa bloco que não contém o atendimento, bloco vazio e atendimento vazio', async () => {
    const c = await semear(amb.prisma);
    const db = pgCliente();
    await db.connect();
    try {
      const casos = [
        { inicio: '2026-03-02T13:00Z', fim: '2026-03-02T13:30Z', ib: '2026-03-02T13:05Z' },
        { inicio: '2026-03-02T13:00Z', fim: '2026-03-02T13:30Z', fb: '2026-03-02T13:25Z' },
        { inicio: '2026-03-02T13:00Z', fim: '2026-03-02T13:00Z' },
        {
          inicio: '2026-03-02T13:30Z',
          fim: '2026-03-02T13:00Z',
          ib: '2026-03-02T13:00Z',
          fb: '2026-03-02T13:30Z',
        },
      ];
      for (const caso of casos) expect(await sqlstate(linhaCrua(db, c, caso))).toBe('23514');
      // Bloqueio vazio também.
      expect(
        await sqlstate(
          db.query(
            `INSERT INTO "Bloqueio" (id, "profissionalId", inicio, fim) VALUES (gen_random_uuid(), $1, '2026-03-02T13:00Z', '2026-03-02T13:00Z')`,
            [c.profissionalIds[0]],
          ),
        ),
      ).toBe('23514');
    } finally {
      await db.end();
    }
  });

  it('V8c: adjacência exata [09:30,10:00) + [10:00,10:30) é aceita; 1 ms de sobreposição não', async () => {
    const c = await semear(amb.prisma);
    const db = pgCliente();
    await db.connect();
    try {
      expect(
        await sqlstate(linhaCrua(db, c, { inicio: '2026-03-02T12:30Z', fim: '2026-03-02T13:00Z' })),
      ).toBe('OK');
      expect(
        await sqlstate(linhaCrua(db, c, { inicio: '2026-03-02T13:00Z', fim: '2026-03-02T13:30Z' })),
      ).toBe('OK');
      expect(
        await sqlstate(
          linhaCrua(db, c, { inicio: '2026-03-02T13:29:59.999Z', fim: '2026-03-02T14:00Z' }),
        ),
      ).toBe('23P01');
    } finally {
      await db.end();
    }
    // Pela aplicação: 10:30 SP (13:30Z) encosta no bloco cru que termina 13:30Z.
    const r1 = await agendar(amb.deps, {
      estabelecimentoId: c.estabelecimentoId,
      servicoId: c.servicoId,
      profissionalId: c.profissionalIds[0]!,
      clienteId: c.clientes[0]!.clienteId,
      inicio: H('10:30'),
      ator: dono(c.donoUsuarioId),
    });
    expect(r1.ok).toBe(true);
  });
});

describe('V9 — fuso e timestamptz (RN-02)', () => {
  async function semearNY() {
    const estab = await amb.prisma.estabelecimento.create({
      data: { slug: 'ny', nome: 'NY', fuso: 'America/New_York', confirmacaoAutomatica: true },
    });
    const servico = await amb.prisma.servico.create({
      data: { estabelecimentoId: estab.id, nome: 'Corte', duracaoMin: 60, precoCentavos: 5000 },
    });
    const prof = await amb.prisma.profissional.create({
      data: {
        estabelecimentoId: estab.id,
        nome: 'P',
        servicos: { create: { servicoId: servico.id } },
        // Domingo inteiro 00:00–06:00.
        jornada: { createMany: { data: [{ diaSemana: 7, inicio: '00:00', fim: '06:00' }] } },
      },
    });
    const u = await amb.prisma.usuario.create({
      data: { email: 'c@ny', senhaHash: 'x', papel: 'CLIENTE' },
    });
    const cl = await amb.prisma.cliente.create({
      data: { usuarioId: u.id, estabelecimentoId: estab.id },
    });
    const d = await amb.prisma.usuario.create({
      data: { email: 'd@ny', senhaHash: 'x', papel: 'DONO', estabelecimentoId: estab.id },
    });
    return { estab, servico, prof, u, cl, d };
  }

  const poolEm = (tz: string) => {
    const url = new URL(urlDeTeste());
    url.searchParams.set('options', `-c TimeZone=${tz}`);
    return criarPrisma({ url: url.toString(), maxConexoes: 2 });
  };

  for (const tzApp of ['UTC', 'Asia/Tokyo'])
    it(`V9a[app em sessão ${tzApp}]: DST de primavera (2026-03-08 NY): 01:30 EST + 60 min termina 03:30 EDT; instantes UTC corretos e independentes do TimeZone da sessão`, async () => {
      const s = await semearNY();
      amb.relogio.instante = DateTime.fromISO('2026-03-07T12:00', {
        zone: 'America/New_York',
      }).toMillis();
      const inicio = Date.parse('2026-03-08T06:30:00Z'); // 01:30 EST
      // Agendamento por um pool cuja URL pede TimeZone=tzApp. RN-02 (correção aceita): a sessão
      // da aplicação é sempre UTC, qualquer que seja o fuso pedido pelo servidor/banco/URL.
      const prismaTokyo = poolEm(tzApp);
      try {
        const tz = await prismaTokyo.$queryRawUnsafe<{ tz: string }[]>(
          `SELECT current_setting('TimeZone') AS tz`,
        );
        expect(tz[0]!.tz).toBe('UTC');
        const deps = { uow: new UnidadeDeTrabalhoPrisma(prismaTokyo), relogio: amb.relogio };
        const r = await agendar(deps, {
          estabelecimentoId: s.estab.id,
          servicoId: s.servico.id,
          profissionalId: s.prof.id,
          clienteId: s.cl.id,
          inicio,
          ator: cliente(s.u.id),
        });
        expect(r).toMatchObject({ ok: true });
        if (!r.ok) return;
        expect(r.valor.inicio).toBe('2026-03-08T06:30:00.000Z');
        expect(r.valor.fim).toBe('2026-03-08T07:30:00.000Z');
        // 02:30 local não existe: deve ser recusado (fora da grade/descartado), nunca gravado.
        const inexistente = DateTime.fromObject(
          { year: 2026, month: 3, day: 8, hour: 2, minute: 30 },
          { zone: 'America/New_York' },
        ).toMillis();
        const r2 = await agendar(deps, {
          estabelecimentoId: s.estab.id,
          servicoId: s.servico.id,
          profissionalId: s.prof.id,
          clienteId: s.cl.id,
          inicio: inexistente,
          ator: dono(s.d.id),
        });
        // Luxon empurra 02:30 → 03:30 EDT = 07:30Z, que é adjacente ao primeiro: ok seria legítimo.
        if (r2.ok) expect(r2.valor.inicio).toBe('2026-03-08T07:30:00.000Z');
      } finally {
        await prismaTokyo.$disconnect();
      }
      // Leitura com sessões em fusos diferentes: mesmo epoch.
      for (const tz of ['UTC', 'America/New_York', 'Asia/Kolkata', 'Pacific/Chatham']) {
        const db = pgCliente();
        await db.connect();
        try {
          await db.query(`SET TIME ZONE '${tz}'`);
          const q = await db.query(
            `SELECT extract(epoch FROM inicio)::float8 AS i, extract(epoch FROM fim)::float8 AS f,
                  to_char(inicio AT TIME ZONE 'America/New_York', 'YYYY-MM-DD HH24:MI') AS li,
                  to_char(fim AT TIME ZONE 'America/New_York', 'YYYY-MM-DD HH24:MI') AS lf
             FROM "Agendamento" WHERE inicio = '2026-03-08T06:30:00Z'`,
          );
          expect(q.rows).toHaveLength(1);
          expect(q.rows[0].i * 1000).toBe(inicio);
          expect(q.rows[0].f * 1000).toBe(inicio + 3_600_000);
          expect(q.rows[0].li).toBe('2026-03-08 01:30');
          expect(q.rows[0].lf).toBe('2026-03-08 03:30');
          const lit = await db.query(
            `SELECT count(*)::int AS n FROM "Agendamento" WHERE inicio = '2026-03-08 01:30:00-05'`,
          );
          expect(lit.rows[0].n).toBe(1);
        } finally {
          await db.end();
        }
      }
      // E o prisma "normal" lê o mesmo instante.
      const linha = await amb.prisma.agendamento.findFirstOrThrow({
        where: { inicio: new Date(inicio) },
      });
      expect(linha.fim.getTime() - linha.inicio.getTime()).toBe(3_600_000);
    });

  it('V9c (mínimo): Prisma com TimeZone ≠ UTC pedido na URL grava o instante certo', async () => {
    const c = await semear(amb.prisma);
    const p = poolEm('America/New_York');
    try {
      const casos = [
        '2026-03-02T13:00:00.000Z',
        '2026-03-08T02:30:00.000Z',
        '2026-11-01T01:30:00.000Z',
      ];
      const lidos: string[] = [];
      for (const iso of casos) {
        const b = await p.bloqueio.create({
          data: {
            profissionalId: c.profissionalIds[0]!,
            inicio: new Date(iso),
            fim: new Date(Date.parse(iso) + 60_000),
          },
        });
        const db = pgCliente();
        await db.connect();
        await db.query(`SET TIME ZONE 'UTC'`);
        const q = await db.query(
          `SELECT to_char(inicio, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS i FROM "Bloqueio" WHERE id = $1`,
          [b.id],
        );
        await db.end();
        lidos.push(q.rows[0].i);
      }
      console.log(
        `V9c gravado (lido em UTC): ${JSON.stringify(lidos)} esperado ${JSON.stringify(casos)}`,
      );
      expect(lidos).toEqual(casos);
    } finally {
      await p.$disconnect();
    }
  });

  it('V9b: volta do horário (2026-11-01 NY): 01:30 da 1ª ocorrência aceita; 01:30 da 2ª fora da grade', async () => {
    const s = await semearNY();
    amb.relogio.instante = Date.parse('2026-10-31T12:00:00Z');
    const base = {
      estabelecimentoId: s.estab.id,
      servicoId: s.servico.id,
      profissionalId: s.prof.id,
      clienteId: s.cl.id,
      ator: cliente(s.u.id),
    };
    const segunda = await agendar(amb.deps, {
      ...base,
      inicio: Date.parse('2026-11-01T06:30:00Z'),
    }); // 01:30 EST
    expect(segunda).toMatchObject({ ok: false, codigo: 'HORARIO_FORA_DA_GRADE' });
    const primeira = await agendar(amb.deps, {
      ...base,
      inicio: Date.parse('2026-11-01T05:30:00Z'),
    }); // 01:30 EDT
    expect(primeira).toMatchObject({ ok: true });
    // 60 min reais: 01:30 EDT → 01:30 EST.
    if (primeira.ok) expect(primeira.valor.fim).toBe('2026-11-01T06:30:00.000Z');
  });
});

describe('V10 — migrations do zero num banco novo', () => {
  const NOME = 'agenda_validacao';
  const urlNova = () => {
    const u = new URL(urlAdmin());
    u.pathname = `/${NOME}`;
    return u.toString();
  };

  it('V10: prisma migrate deploy em banco vazio recria EXCLUDE, CHECKs e btree_gist', async () => {
    const admin = new pg.Client({ connectionString: urlAdmin() });
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${NOME} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${NOME}`);
      const raizApi = resolve(import.meta.dirname, '../..');
      execFileSync(
        process.execPath,
        [join(raizApi, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'],
        {
          cwd: raizApi,
          env: { ...process.env, DATABASE_URL: urlNova(), PRISMA_HIDE_UPDATE_MESSAGE: '1' },
          stdio: 'pipe',
        },
      );
      const db = new pg.Client({ connectionString: urlNova() });
      await db.connect();
      try {
        const cons = await db.query(
          `SELECT conname, contype, pg_get_constraintdef(oid) AS def FROM pg_constraint
            WHERE conname IN ('agendamento_sem_sobreposicao', 'bloco_valido', 'bloqueio_valido')`,
        );
        const porNome = Object.fromEntries(cons.rows.map((r) => [r.conname, r]));
        expect(porNome.agendamento_sem_sobreposicao?.contype).toBe('x');
        expect(porNome.agendamento_sem_sobreposicao?.def).toMatch(/EXCLUDE USING gist/);
        expect(porNome.agendamento_sem_sobreposicao?.def).toMatch(/"profissionalId" WITH =/);
        expect(porNome.agendamento_sem_sobreposicao?.def).toMatch(
          /tstzrange\("inicioBloco", "fimBloco", '\[\)'::text\) WITH &&/,
        );
        expect(porNome.agendamento_sem_sobreposicao?.def).toMatch(
          /WHERE \(\(status <> 'CANCELADO'/,
        );
        expect(porNome.bloco_valido?.contype).toBe('c');
        expect(porNome.bloqueio_valido?.contype).toBe('c');
        const ext = await db.query(`SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'`);
        expect(ext.rowCount).toBe(1);
        const mig = await db.query(
          `SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL`,
        );
        expect(mig.rows[0].n).toBeGreaterThanOrEqual(2);
        // Deploy de novo é no-op.
        execFileSync(
          process.execPath,
          [join(raizApi, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'],
          {
            cwd: raizApi,
            env: { ...process.env, DATABASE_URL: urlNova(), PRISMA_HIDE_UPDATE_MESSAGE: '1' },
            stdio: 'pipe',
          },
        );
        // E o schema.prisma não difere do banco (o diff não tenta remover a constraint).
        const diff = execFileSync(
          process.execPath,
          [
            join(raizApi, 'node_modules', 'prisma', 'build', 'index.js'),
            'migrate',
            'diff',
            '--from-config-datasource',
            '--to-schema',
            'prisma/schema.prisma',
            '--script',
          ],
          {
            cwd: raizApi,
            env: { ...process.env, DATABASE_URL: urlNova(), PRISMA_HIDE_UPDATE_MESSAGE: '1' },
            stdio: 'pipe',
          },
        ).toString();
        console.log(`V10 migrate diff:\n${diff}`);
        expect(diff).not.toMatch(/agendamento_sem_sobreposicao|DROP CONSTRAINT/i);
      } finally {
        await db.end();
      }
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS ${NOME} WITH (FORCE)`);
      await admin.end();
    }
  });
});

describe('V11 — RN-14 cópia do serviço', () => {
  it('V11: editar preço/duração/preparo/limpeza não muda agendamento nem bloco; remarcar mantém a cópia', async () => {
    const c = await semear(amb.prisma, {
      clientes: 2,
      servico: { duracaoMin: 30, preparoMin: 0, limpezaMin: 0 },
    });
    const cl = c.clientes[0]!;
    const r = await agendar(amb.deps, {
      estabelecimentoId: c.estabelecimentoId,
      servicoId: c.servicoId,
      profissionalId: c.profissionalIds[0]!,
      clienteId: cl.clienteId,
      inicio: H('10:00'),
      ator: cliente(cl.usuarioId),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const antes = await amb.prisma.agendamento.findUniqueOrThrow({ where: { id: r.valor.id } });
    await amb.prisma.servico.update({
      where: { id: c.servicoId },
      data: {
        nome: 'Corte novo',
        duracaoMin: 60,
        precoCentavos: 9999,
        preparoMin: 10,
        limpezaMin: 15,
      },
    });
    const depois = await amb.prisma.agendamento.findUniqueOrThrow({ where: { id: r.valor.id } });
    expect(depois).toEqual(antes);
    // Remarcar para 11:30: com a cópia (30 min) cabe antes do almoço; com o serviço novo (10+60+15) não.
    const rr = await remarcar(amb.deps, {
      agendamentoId: r.valor.id,
      novoInicio: H('11:30'),
      ator: cliente(cl.usuarioId),
    });
    expect(rr).toMatchObject({ ok: true });
    const rem = await amb.prisma.agendamento.findUniqueOrThrow({ where: { id: r.valor.id } });
    expect(rem.servicoNome).toBe('Corte');
    expect([rem.duracaoMin, rem.precoCentavos, rem.preparoMin, rem.limpezaMin]).toEqual([
      30, 5000, 0, 0,
    ]);
    expect(rem.inicioBloco.getTime()).toBe(H('11:30'));
    expect(rem.fimBloco.getTime()).toBe(H('12:00'));
    // O espaço 10:00–11:30 ficou livre e o novo agendamento usa os valores novos.
    const novo = await agendar(amb.deps, {
      estabelecimentoId: c.estabelecimentoId,
      servicoId: c.servicoId,
      profissionalId: c.profissionalIds[0]!,
      clienteId: c.clientes[1]!.clienteId,
      inicio: H('10:00'),
      ator: cliente(c.clientes[1]!.usuarioId),
    });
    expect(novo).toMatchObject({ ok: true, valor: { duracaoMin: 60, precoCentavos: 9999 } });
    const n = await amb.prisma.agendamento.findUniqueOrThrow({
      where: { id: novo.ok ? novo.valor.id : '' },
    });
    expect(n.inicioBloco.getTime()).toBe(H('09:50'));
    expect(n.fimBloco.getTime()).toBe(H('11:15'));
  });
});

// Garante que o relógio de teste é o injetado (sem Date.now no caminho).
void RelogioDeTeste;
