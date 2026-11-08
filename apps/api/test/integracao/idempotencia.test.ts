import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { type ComandoAgendar, agendar } from '../../src/application';
import {
  type Ambiente,
  type Cenario,
  AGORA,
  SEGUNDA_10H,
  criarAmbiente,
  em,
  semear,
} from './apoio';

const amb: Ambiente = criarAmbiente(20);
let c: Cenario;
let base: ComandoAgendar;

afterAll(() => amb.fechar());
beforeEach(async () => {
  await amb.limpar();
  c = await semear(amb.prisma);
  const cl = c.clientes[0]!;
  base = {
    estabelecimentoId: c.estabelecimentoId,
    servicoId: c.servicoId,
    profissionalId: c.profissionalIds[0]!,
    clienteId: cl.clienteId,
    inicio: SEGUNDA_10H,
    ator: { usuarioId: cl.usuarioId, papel: 'CLIENTE' },
    chaveIdempotencia: 'chave-1',
  };
});

describe('C4 — idempotência', () => {
  it('RN-22: mesma Idempotency-Key 10× em paralelo → 1 agendamento e 10 respostas iguais', async () => {
    const rs = await Promise.all(Array.from({ length: 10 }, () => agendar(amb.deps, base)));
    expect(rs[0]).toMatchObject({ ok: true });
    for (const r of rs) expect(r).toEqual(rs[0]);
    expect(await amb.prisma.agendamento.count()).toBe(1);
    expect(await amb.prisma.chaveIdempotencia.count()).toBe(1);
  });

  it('RN-22: mesma chave com corpo diferente → CHAVE_IDEMPOTENCIA_REUTILIZADA', async () => {
    const primeira = await agendar(amb.deps, base);
    expect(primeira.ok).toBe(true);
    const outra = await agendar(amb.deps, { ...base, inicio: em('2026-03-02T11:00') });
    expect(outra).toMatchObject({ ok: false, codigo: 'CHAVE_IDEMPOTENCIA_REUTILIZADA' });
    expect(await amb.prisma.agendamento.count()).toBe(1);
  });

  it('RN-22: corpos diferentes com a mesma chave em paralelo → um só agendamento; o outro corpo é recusado', async () => {
    const outroCorpo = { ...base, inicio: em('2026-03-02T11:00') };
    const rs = await Promise.all(
      Array.from({ length: 10 }, (_, i) => agendar(amb.deps, i % 2 === 0 ? base : outroCorpo)),
    );
    expect(await amb.prisma.agendamento.count()).toBe(1);
    const ok = rs.filter((r) => r.ok);
    const recusas = rs.filter((r) => !r.ok);
    expect(ok).toHaveLength(5);
    for (const r of ok) expect(r).toEqual(ok[0]);
    for (const r of recusas) expect(r).toMatchObject({ codigo: 'CHAVE_IDEMPOTENCIA_REUTILIZADA' });
  });

  it('RN-22: a recusa também é a resposta original (409 repetido, sem reexecutar)', async () => {
    const outroCliente = await amb.prisma.usuario.create({
      data: { email: 'outro@teste', senhaHash: 'x', papel: 'CLIENTE' },
    });
    await agendar(amb.deps, { ...base, chaveIdempotencia: 'k0' });
    const cliente2 = await amb.prisma.cliente.create({
      data: { usuarioId: outroCliente.id, estabelecimentoId: c.estabelecimentoId },
    });
    const cmd = {
      ...base,
      clienteId: cliente2.id,
      ator: { usuarioId: outroCliente.id, papel: 'CLIENTE' as const },
    };
    const r1 = await agendar(amb.deps, cmd);
    expect(r1).toMatchObject({ ok: false, codigo: 'HORARIO_INDISPONIVEL' });
    await amb.prisma.agendamento.updateMany({ data: { status: 'CANCELADO' } }); // libera o horário
    expect(await agendar(amb.deps, cmd)).toEqual(r1);
  });

  it('RN-22: a chave vale 24 h; depois disso o pedido é reavaliado', async () => {
    const r1 = await agendar(amb.deps, base);
    expect(r1.ok).toBe(true);
    amb.relogio.instante = AGORA + 24 * 3_600_000 - 1;
    expect(await agendar(amb.deps, base)).toEqual(r1);
    amb.relogio.instante = AGORA + 24 * 3_600_000;
    const r2 = await agendar(amb.deps, base);
    expect(r2).not.toEqual(r1);
    expect(r2).toMatchObject({ ok: false, codigo: 'HORARIO_INDISPONIVEL' }); // reexecutado: o horário já é dele
    expect(await amb.prisma.agendamento.count()).toBe(1);
  });

  it('RN-22: a mesma chave de usuários diferentes não colide', async () => {
    const u2 = await amb.prisma.usuario.create({
      data: { email: 'u2@teste', senhaHash: 'x', papel: 'CLIENTE' },
    });
    const c2 = await amb.prisma.cliente.create({
      data: { usuarioId: u2.id, estabelecimentoId: c.estabelecimentoId },
    });
    expect((await agendar(amb.deps, base)).ok).toBe(true);
    const r = await agendar(amb.deps, {
      ...base,
      clienteId: c2.id,
      inicio: em('2026-03-02T11:00'),
      ator: { usuarioId: u2.id, papel: 'CLIENTE' },
    });
    expect(r.ok).toBe(true);
    expect(await amb.prisma.agendamento.count()).toBe(2);
  });
});
