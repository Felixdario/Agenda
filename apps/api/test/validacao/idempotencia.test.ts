import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { agendar } from '../../src/application';
import { AGORA, type Ambiente, type Cenario, criarAmbiente, em, semear } from '../integracao/apoio';
import { H, cliente, codigos } from './apoio-validacao';

const amb: Ambiente = criarAmbiente(30);
afterAll(() => amb.fechar());
beforeEach(() => amb.limpar());

const HORA = 3_600_000;

function pedido(c: Cenario, inicio: number, chave: string, clIdx = 0, prof: string | null = null) {
  const cl = c.clientes[clIdx]!;
  return agendar(amb.deps, {
    estabelecimentoId: c.estabelecimentoId,
    servicoId: c.servicoId,
    profissionalId: prof ?? c.profissionalIds[0]!,
    clienteId: cl.clienteId,
    inicio,
    ator: cliente(cl.usuarioId),
    chaveIdempotencia: chave,
  });
}

describe('V3 — Idempotency-Key (RN-22)', () => {
  it('V3a: mesma chave, 10 corpos DIFERENTES em paralelo → 1 agendamento, 9 CHAVE_IDEMPOTENCIA_REUTILIZADA (15 rodadas)', async () => {
    const horas = [
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '13:00',
      '13:30',
      '14:00',
      '14:30',
    ];
    for (let rodada = 0; rodada < 15; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { clientes: 1 });
      const rs = await Promise.all(horas.map((h) => pedido(c, H(h), 'k-1')));
      expect(codigos(rs)).toEqual({ OK: 1, CHAVE_IDEMPOTENCIA_REUTILIZADA: 9 });
      expect(await amb.prisma.agendamento.count()).toBe(1);
      const chave = await amb.prisma.chaveIdempotencia.findMany();
      expect(chave).toHaveLength(1);
      expect(chave[0]!.status).toBe('CONCLUIDA');
      const ag = await amb.prisma.agendamento.findFirstOrThrow();
      expect(chave[0]!.agendamentoId).toBe(ag.id);
      // Repetição do corpo vencedor depois: mesma resposta.
      const vencedor = rs.find((r) => r.ok)!;
      const de2 = await pedido(c, ag.inicio.getTime(), 'k-1');
      expect(de2).toEqual(vencedor);
    }
  });

  it('V3b: mistura de corpos iguais e diferentes em paralelo → no máximo 1 agendamento, respostas iguais ao vencedor', async () => {
    for (let rodada = 0; rodada < 10; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { clientes: 1 });
      const rs = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          pedido(c, i % 3 === 0 ? H('10:00') : H('14:00'), 'k-mix'),
        ),
      );
      expect(await amb.prisma.agendamento.count()).toBe(1);
      const oks = rs.filter((r) => r.ok);
      // Todos os OK são a MESMA resposta (mesmo id).
      expect(new Set(oks.map((r) => (r.ok ? r.valor.id : '')))).toHaveProperty('size', 1);
      const ag = await amb.prisma.agendamento.findFirstOrThrow();
      const vencedorEh10 = ag.inicio.getTime() === H('10:00');
      expect(codigos(rs)).toEqual({
        OK: vencedorEh10 ? 4 : 8,
        CHAVE_IDEMPOTENCIA_REUTILIZADA: vencedorEh10 ? 8 : 4,
      });
    }
  });

  it('V3c: mesma chave de usuários diferentes não colide', async () => {
    const c = await semear(amb.prisma, { clientes: 2, profissionais: 2 });
    const rs = await Promise.all([
      pedido(c, H('10:00'), 'igual', 0, c.profissionalIds[0]!),
      pedido(c, H('10:00'), 'igual', 1, c.profissionalIds[1]!),
    ]);
    expect(codigos(rs)).toEqual({ OK: 2 });
    expect(await amb.prisma.agendamento.count()).toBe(2);
    expect(await amb.prisma.chaveIdempotencia.count()).toBe(2);
  });

  it('V3d: chave vale 24 h — 24h−1ms ainda bloqueia corpo diferente; depois de 24 h pode ser reutilizada', async () => {
    const c = await semear(amb.prisma, { clientes: 1 });
    const r1 = await pedido(c, em('2026-03-03T10:00'), 'k-exp');
    expect(r1.ok).toBe(true);
    amb.relogio.instante = AGORA + 24 * HORA - 1;
    const r2 = await pedido(c, em('2026-03-03T14:00'), 'k-exp');
    expect(r2).toMatchObject({ ok: false, codigo: 'CHAVE_IDEMPOTENCIA_REUTILIZADA' });
    const r2b = await pedido(c, em('2026-03-03T10:00'), 'k-exp');
    expect(r2b).toEqual(r1);
    amb.relogio.instante = AGORA + 24 * HORA + 1;
    const r3 = await pedido(c, em('2026-03-03T14:00'), 'k-exp');
    expect(r3.ok).toBe(true);
    expect(await amb.prisma.agendamento.count()).toBe(2);
    // E a chave reaproveitada aponta para o novo agendamento.
    const k = await amb.prisma.chaveIdempotencia.findFirstOrThrow();
    expect(r3.ok && k.agendamentoId).toBe(r3.ok ? r3.valor.id : null);
    // O mesmo corpo antigo agora é "outro corpo" para a chave nova.
    const r4 = await pedido(c, em('2026-03-03T10:00'), 'k-exp');
    expect(r4).toMatchObject({ ok: false, codigo: 'CHAVE_IDEMPOTENCIA_REUTILIZADA' });
  });

  it('V3e: chave expirada reutilizada em paralelo por 8 corpos diferentes → só 1 agendamento novo', async () => {
    for (let rodada = 0; rodada < 10; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { clientes: 1 });
      const r1 = await pedido(c, em('2026-03-03T09:00'), 'k-par');
      expect(r1.ok).toBe(true);
      amb.relogio.instante = AGORA + 25 * HORA;
      const horas = ['10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30'];
      const rs = await Promise.all(horas.map((h) => pedido(c, em(`2026-03-03T${h}`), 'k-par')));
      expect(codigos(rs)).toEqual({ OK: 1, CHAVE_IDEMPOTENCIA_REUTILIZADA: 7 });
      expect(await amb.prisma.agendamento.count()).toBe(2);
    }
  });

  it('V3f: chave com recusa de regra é repetida (desvio aceito) e não cria nada depois que o horário libera', async () => {
    const c = await semear(amb.prisma, { clientes: 2 });
    await pedido(c, H('10:00'), 'outra', 1);
    const r1 = await pedido(c, H('10:00'), 'k-rec');
    expect(r1).toMatchObject({ ok: false, codigo: 'HORARIO_INDISPONIVEL' });
    await amb.prisma.agendamento.updateMany({ data: { status: 'CANCELADO' } });
    const r2 = await pedido(c, H('10:00'), 'k-rec');
    expect(r2).toEqual(r1);
    expect(await amb.prisma.agendamento.count({ where: { status: { not: 'CANCELADO' } } })).toBe(0);
  });
});
