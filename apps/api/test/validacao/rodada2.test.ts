import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  agendar,
  cancelar,
  criarBloqueio,
  marcarNaoComparecimento,
  remarcar,
} from '../../src/application';
import {
  type Ambiente,
  type Cenario,
  criarAmbiente,
  em,
  pgCliente,
  semear,
} from '../integracao/apoio';
import {
  H,
  bloqueioSobreposto,
  cliente,
  codigos,
  dono,
  embaralhar,
  sobreposicoes,
} from './apoio-validacao';

const amb: Ambiente = criarAmbiente(40);
afterAll(() => amb.fechar());
beforeEach(() => amb.limpar());

/** Agendamento passado CONFIRMADO gravado direto (para RN-18). */
async function passado(
  c: Cenario,
  clIdx: number,
  iso: string,
  status: 'CONFIRMADO' | 'NAO_COMPARECEU',
) {
  const ini = em(iso);
  return amb.prisma.agendamento.create({
    data: {
      estabelecimentoId: c.estabelecimentoId,
      profissionalId: c.profissionalIds[0]!,
      clienteId: c.clientes[clIdx]!.clienteId,
      servicoId: c.servicoId,
      servicoNome: 'Corte',
      duracaoMin: 30,
      precoCentavos: 5000,
      preparoMin: 0,
      limpezaMin: 0,
      inicio: new Date(ini),
      fim: new Date(ini + 1_800_000),
      inicioBloco: new Date(ini),
      fimBloco: new Date(ini + 1_800_000),
      status,
      criadoEm: new Date(ini - 86_400_000),
      atualizadoEm: new Date(ini - 86_400_000),
    },
  });
}

const pedidoCliente = (c: Cenario, clIdx: number, inicio: number, prof = 0) =>
  agendar(amb.deps, {
    estabelecimentoId: c.estabelecimentoId,
    servicoId: c.servicoId,
    profissionalId: c.profissionalIds[prof]!,
    clienteId: c.clientes[clIdx]!.clienteId,
    inicio,
    ator: cliente(c.clientes[clIdx]!.usuarioId),
  });

/**
 * Uma transação crua segura a trava advisory do cliente e muda dados dele sem confirmar; o
 * agendar disparado nesse meio-tempo tem de esperar e validar com o dado CONFIRMADO depois.
 */
async function comTravaDoCliente(
  clienteId: string,
  sql: string,
  params: unknown[],
  durante: () => Promise<unknown>,
) {
  const db = pgCliente();
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `cliente:${clienteId}`,
    ]);
    await db.query(sql, params);
    const p = durante();
    await new Promise((r) => setTimeout(r, 300));
    // Ainda esperando a trava?
    const esperando = await amb.prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event = 'advisory'`,
    );
    await db.query('COMMIT');
    return { resultado: await p, esperando: esperando[0]!.n };
  } finally {
    await db.end();
  }
}

describe('R2 — leitura depois da trava (RN-17, RN-18)', () => {
  it('R2a: RN-17 — ativo inserido por quem segura a trava do cliente é visto pelo agendar que esperou', async () => {
    const c = await semear(amb.prisma, { profissionais: 2, clientes: 1 });
    expect((await pedidoCliente(c, 0, H('09:00'), 0)).ok).toBe(true);
    expect((await pedidoCliente(c, 0, H('09:00'), 1)).ok).toBe(true);
    const a = await amb.prisma.agendamento.findFirstOrThrow();
    const { resultado, esperando } = await comTravaDoCliente(
      c.clientes[0]!.clienteId,
      `INSERT INTO "Agendamento" (id, "estabelecimentoId", "profissionalId", "clienteId", "servicoId",
         "servicoNome", "duracaoMin", "precoCentavos", "preparoMin", "limpezaMin",
         inicio, fim, "inicioBloco", "fimBloco", status, "criadoEm", "atualizadoEm")
       SELECT gen_random_uuid(), "estabelecimentoId", "profissionalId", "clienteId", "servicoId",
         "servicoNome", "duracaoMin", "precoCentavos", "preparoMin", "limpezaMin",
         inicio + interval '5 hours', fim + interval '5 hours', "inicioBloco" + interval '5 hours',
         "fimBloco" + interval '5 hours', status, "criadoEm", "atualizadoEm"
         FROM "Agendamento" WHERE id = $1`,
      [a.id],
      () => pedidoCliente(c, 0, H('15:00'), 1),
    );
    expect(esperando).toBeGreaterThanOrEqual(1);
    expect(resultado).toMatchObject({ ok: false, codigo: 'LIMITE_DE_AGENDAMENTOS' });
  });

  it('R2b: RN-18 — falta gravada por quem segura a trava do cliente é vista pelo agendar que esperou', async () => {
    const c = await semear(amb.prisma, { clientes: 1 });
    await passado(c, 0, '2026-02-02T10:00', 'NAO_COMPARECEU');
    await passado(c, 0, '2026-02-03T10:00', 'NAO_COMPARECEU');
    const terceiro = await passado(c, 0, '2026-02-04T10:00', 'CONFIRMADO');
    const { resultado, esperando } = await comTravaDoCliente(
      c.clientes[0]!.clienteId,
      `UPDATE "Agendamento" SET status = 'NAO_COMPARECEU' WHERE id = $1`,
      [terceiro.id],
      () => pedidoCliente(c, 0, H('10:00')),
    );
    expect(esperando).toBeGreaterThanOrEqual(1);
    expect(resultado).toMatchObject({ ok: false, codigo: 'CLIENTE_BLOQUEADO' });
  });

  it('R2c: RN-18 — marcarNaoComparecimento (3ª falta) × agendar do mesmo cliente em paralelo, 30 rodadas: só desfechos válidos', async () => {
    const placar: Record<string, number> = {};
    for (let rodada = 0; rodada < 30; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { clientes: 1 });
      await passado(c, 0, '2026-02-02T10:00', 'NAO_COMPARECEU');
      await passado(c, 0, '2026-02-03T10:00', 'NAO_COMPARECEU');
      const terceiro = await passado(c, 0, '2026-02-04T10:00', 'CONFIRMADO');
      const fs = [
        () =>
          marcarNaoComparecimento(amb.deps, {
            agendamentoId: terceiro.id,
            ator: dono(c.donoUsuarioId),
          }),
        () => pedidoCliente(c, 0, H('10:00')),
        () => pedidoCliente(c, 0, H('14:00')),
      ];
      const idx = embaralhar([0, 1, 2], rodada);
      const brutos = await Promise.all(idx.map((i) => fs[i]!()));
      const rs: (typeof brutos)[number][] = [];
      idx.forEach((i, k) => (rs[i] = brutos[k]!));
      expect(rs[0]!.ok).toBe(true);
      for (const r of rs.slice(1)) if (!r.ok) expect(r.codigo).toBe('CLIENTE_BLOQUEADO');
      const k = rs.map((r) => (r.ok ? 'ok' : r.codigo)).join('/');
      placar[k] = (placar[k] ?? 0) + 1;
      // Depois de tudo, um novo pedido é sempre recusado.
      expect(await pedidoCliente(c, 0, H('16:00'))).toMatchObject({ codigo: 'CLIENTE_BLOQUEADO' });
    }
    console.log(`R2c desfechos (falta/10:00/14:00): ${JSON.stringify(placar)}`);
  });
});

describe('R3 — carga mista: nenhum deadlock / erro não tratado', () => {
  it('R3: 3 profissionais, 6 clientes, remarcações com troca de profissional, qualquer-profissional, cancelamentos e bloqueios (15 rodadas × 40 operações)', async () => {
    let excecoes = 0;
    const mensagens = new Set<string>();
    const total: Record<string, number> = {};
    for (let rodada = 0; rodada < 15; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { profissionais: 3, clientes: 6 });
      // Cada cliente começa com 1 agendamento (P = i % 3) em horários distintos.
      const base: string[] = [];
      for (let i = 0; i < 6; i++) {
        const r = await pedidoCliente(
          c,
          i,
          H(['09:00', '10:00', '11:00'][Math.floor(i / 3)]!),
          i % 3,
        );
        if (!r.ok) throw new Error(JSON.stringify(r));
        base.push(r.valor.id);
      }
      const horas = ['09:00', '09:30', '10:00', '10:30', '11:00', '13:00', '13:30', '14:00'];
      const ops: (() => Promise<{ ok: boolean; codigo?: string }>)[] = [];
      for (let k = 0; k < 40; k++) {
        const s = (rodada * 41 + k * 17) % 1000;
        const cl = s % 6;
        const h = H(horas[s % horas.length]!);
        const p = s % 3;
        switch (k % 5) {
          case 0:
            ops.push(() =>
              remarcar(amb.deps, {
                agendamentoId: base[cl]!,
                novoInicio: h,
                novoProfissionalId: c.profissionalIds[p]!,
                ator: dono(c.donoUsuarioId),
              }),
            );
            break;
          case 1:
            ops.push(() =>
              agendar(amb.deps, {
                estabelecimentoId: c.estabelecimentoId,
                servicoId: c.servicoId,
                profissionalId: null,
                clienteId: c.clientes[cl]!.clienteId,
                inicio: h,
                ator: cliente(c.clientes[cl]!.usuarioId),
              }),
            );
            break;
          case 2:
            ops.push(() => pedidoCliente(c, cl, h, p));
            break;
          case 3:
            ops.push(() =>
              k % 10 === 3
                ? cancelar(amb.deps, { agendamentoId: base[cl]!, ator: dono(c.donoUsuarioId) })
                : remarcar(amb.deps, {
                    agendamentoId: base[(cl + 1) % 6]!,
                    novoInicio: h,
                    ator: cliente(c.clientes[(cl + 1) % 6]!.usuarioId),
                  }),
            );
            break;
          default:
            ops.push(() =>
              criarBloqueio(amb.deps, {
                profissionalId: c.profissionalIds[p]!,
                inicio: h,
                fim: h + 15 * 60_000,
                ator: dono(c.donoUsuarioId),
              }),
            );
        }
      }
      const rs = await Promise.all(
        embaralhar(ops, rodada).map((f) =>
          f().catch((e: unknown) => {
            excecoes++;
            mensagens.add(String((e as Error).message ?? e).slice(0, 200));
            return { ok: false, codigo: 'EXCECAO' };
          }),
        ),
      );
      for (const [k, v] of Object.entries(codigos(rs))) total[k] = (total[k] ?? 0) + v;
      expect(await sobreposicoes(amb.prisma)).toBe(0);
      expect(await bloqueioSobreposto(amb.prisma)).toBe(0);
      const ativos = await amb.prisma.agendamento.groupBy({
        by: ['clienteId'],
        where: { status: { in: ['PENDENTE', 'CONFIRMADO'] } },
        _count: true,
      });
      for (const a of ativos) expect(a._count).toBeLessThanOrEqual(3);
    }
    console.log(
      `R3 totais: ${JSON.stringify(total)}; exceções: ${excecoes} ${JSON.stringify([...mensagens])}`,
    );
    expect(excecoes).toBe(0);
  });
});
