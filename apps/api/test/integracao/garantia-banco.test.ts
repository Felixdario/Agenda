import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { type Ambiente, type Cenario, criarAmbiente, pgCliente, semear } from './apoio';

const amb: Ambiente = criarAmbiente(5);
let sql: pg.Client;
let c: Cenario;

beforeEach(async () => {
  await amb.limpar();
  c = await semear(amb.prisma, { profissionais: 2 });
  sql = pgCliente();
  await sql.connect();
});
afterEach(() => sql.end());
afterAll(() => amb.fechar());

/** INSERT cru, sem passar pelo código da aplicação. */
function inserir(profissionalId: string, inicio: string, fim: string, status = 'CONFIRMADO') {
  return sql.query(
    `INSERT INTO "Agendamento" (id, "estabelecimentoId", "profissionalId", "clienteId", "servicoId",
       "servicoNome", "duracaoMin", "precoCentavos", "preparoMin", "limpezaMin",
       inicio, fim, "inicioBloco", "fimBloco", status, "criadoEm", "atualizadoEm")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'Corte', 30, 5000, 0, 0, $5, $6, $5, $6, $7::"StatusAgendamento", now(), now())`,
    [
      c.estabelecimentoId,
      profissionalId,
      c.clientes[0]!.clienteId,
      c.servicoId,
      inicio,
      fim,
      status,
    ],
  );
}

const sqlstate = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code;
  }
};

describe('C3 — a garantia é do banco', () => {
  it('RN-21: INSERT SQL cru sobreposto falha com 23P01', async () => {
    const p = c.profissionalIds[0]!;
    expect(await sqlstate(inserir(p, '2026-03-02T13:00Z', '2026-03-02T13:30Z'))).toBe('OK');
    expect(await sqlstate(inserir(p, '2026-03-02T13:15Z', '2026-03-02T13:45Z'))).toBe('23P01');
    expect(await amb.prisma.agendamento.count()).toBe(1);
  });

  it('RN-01 / RN-21: blocos encostados não violam a constraint ([) semiaberto)', async () => {
    const p = c.profissionalIds[0]!;
    expect(await sqlstate(inserir(p, '2026-03-02T13:00Z', '2026-03-02T13:30Z'))).toBe('OK');
    expect(await sqlstate(inserir(p, '2026-03-02T13:30Z', '2026-03-02T14:00Z'))).toBe('OK');
  });

  it('RN-06 / RN-21: agendamento CANCELADO não ocupa; outro profissional não conflita', async () => {
    const [p1, p2] = c.profissionalIds as [string, string];
    expect(await sqlstate(inserir(p1, '2026-03-02T13:00Z', '2026-03-02T13:30Z', 'CANCELADO'))).toBe(
      'OK',
    );
    expect(await sqlstate(inserir(p1, '2026-03-02T13:00Z', '2026-03-02T13:30Z'))).toBe('OK');
    expect(await sqlstate(inserir(p2, '2026-03-02T13:00Z', '2026-03-02T13:30Z'))).toBe('OK');
    // reativar o cancelado por UPDATE também é barrado pelo banco
    expect(
      await sqlstate(
        sql.query(`UPDATE "Agendamento" SET status = 'CONFIRMADO' WHERE status = 'CANCELADO'`),
      ),
    ).toBe('23P01');
  });

  it('D-02: CHECK bloco_valido recusa bloco vazio ou que não contém o atendimento (23514)', async () => {
    const p = c.profissionalIds[0]!;
    expect(await sqlstate(inserir(p, '2026-03-02T13:30Z', '2026-03-02T13:00Z'))).toBe('23514');
    expect(
      await sqlstate(
        sql.query(`UPDATE "Agendamento" SET "inicioBloco" = inicio + interval '1 minute'`),
      ),
    ).toBe('OK'); // tabela vazia neste teste: nada a atualizar
    expect(await sqlstate(inserir(p, '2026-03-02T13:00Z', '2026-03-02T13:30Z'))).toBe('OK');
    expect(
      await sqlstate(
        sql.query(`UPDATE "Agendamento" SET "inicioBloco" = inicio + interval '1 minute'`),
      ),
    ).toBe('23514');
  });

  it('RN-21: a constraint de exclusão existe após migrate deploy', async () => {
    const r = await sql.query(
      `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = '"Agendamento"'::regclass AND contype IN ('x', 'c') ORDER BY conname`,
    );
    expect(r.rows.map((l: { conname: string }) => l.conname)).toEqual([
      'agendamento_sem_sobreposicao',
      'bloco_valido',
    ]);
  });
});
