import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { agendar, criarBloqueio, remarcar } from '../../src/application';
import {
  type Ambiente,
  SEGUNDA_10H,
  criarAmbiente,
  em,
  observarConcorrencia,
  semear,
} from './apoio';

const amb: Ambiente = criarAmbiente(30);
afterAll(() => amb.fechar());
beforeEach(() => amb.limpar());

const codigos = (rs: readonly { ok: boolean; codigo?: string }[]) =>
  rs.reduce<Record<string, number>>((acc, r) => {
    const k = r.ok ? 'OK' : (r.codigo ?? '?');
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

describe('C1 — 20 agendamentos simultâneos no mesmo horário', () => {
  for (let rodada = 1; rodada <= 10; rodada++) {
    it(`RN-21: 20 simultâneos no mesmo horário → 1 sucesso e 19 HORARIO_INDISPONIVEL (rodada ${rodada}/10)`, async () => {
      const c = await semear(amb.prisma, { clientes: 20 });
      const { resultado, maxEsperandoTrava, conexoesDistintas } = await observarConcorrencia(() =>
        Promise.all(
          c.clientes.map((cl) =>
            agendar(amb.deps, {
              estabelecimentoId: c.estabelecimentoId,
              servicoId: c.servicoId,
              profissionalId: c.profissionalIds[0]!,
              clienteId: cl.clienteId,
              inicio: SEGUNDA_10H,
              ator: { usuarioId: cl.usuarioId, papel: 'CLIENTE' },
            }),
          ),
        ),
      );
      console.log(
        `C1 rodada ${rodada}: ${JSON.stringify(codigos(resultado))}; máx. transações esperando a trava ao mesmo tempo = ${maxEsperandoTrava}; conexões distintas vistas = ${conexoesDistintas}`,
      );
      expect(codigos(resultado)).toEqual({ OK: 1, HORARIO_INDISPONIVEL: 19 });
      // As requisições se sobrepuseram de verdade: várias transações esperando a trava juntas.
      expect(maxEsperandoTrava).toBeGreaterThanOrEqual(2);
      expect(conexoesDistintas).toBeGreaterThanOrEqual(2);
      // RN-13: a recusa traz próximos horários livres.
      const recusa = resultado.find((r) => !r.ok);
      expect(recusa).toMatchObject({ detalhes: { proximosHorarios: expect.any(Array) } });
      expect(await amb.prisma.agendamento.count()).toBe(1);
    });
  }
});

describe('C2 — qualquer profissional em paralelo', () => {
  it('RN-12: 20 simultâneos em "qualquer profissional" com 3 profissionais → 3 ok e 17 HORARIO_INDISPONIVEL', async () => {
    const c = await semear(amb.prisma, { profissionais: 3, clientes: 20 });
    const rs = await Promise.all(
      c.clientes.map((cl) =>
        agendar(amb.deps, {
          estabelecimentoId: c.estabelecimentoId,
          servicoId: c.servicoId,
          profissionalId: null,
          clienteId: cl.clienteId,
          inicio: SEGUNDA_10H,
          ator: { usuarioId: cl.usuarioId, papel: 'CLIENTE' },
        }),
      ),
    );
    expect(codigos(rs)).toEqual({ OK: 3, HORARIO_INDISPONIVEL: 17 });
    const profs = rs.flatMap((r) => (r.ok ? [r.valor.profissionalId] : []));
    expect(new Set(profs)).toEqual(new Set(c.profissionalIds));
  });
});

describe('C5 — remarcações concorrentes', () => {
  it('RN-16: duas remarcações concorrentes para o mesmo horário → só 1 aceita', async () => {
    for (let rodada = 0; rodada < 5; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { clientes: 2 });
      const base = {
        estabelecimentoId: c.estabelecimentoId,
        servicoId: c.servicoId,
        profissionalId: c.profissionalIds[0]!,
      };
      const [a, b] = await Promise.all(
        c.clientes.map((cl, i) =>
          agendar(amb.deps, {
            ...base,
            clienteId: cl.clienteId,
            inicio: em(`2026-03-02T${10 + i}:00`),
            ator: { usuarioId: cl.usuarioId, papel: 'CLIENTE' },
          }),
        ),
      );
      if (!a?.ok || !b?.ok) throw new Error('preparação falhou');
      const rs = await Promise.all(
        [a.valor, b.valor].map((ag, i) =>
          remarcar(amb.deps, {
            agendamentoId: ag.id,
            novoInicio: em('2026-03-02T14:00'),
            ator: { usuarioId: c.clientes[i]!.usuarioId, papel: 'CLIENTE' },
          }),
        ),
      );
      expect(codigos(rs)).toEqual({ OK: 1, HORARIO_INDISPONIVEL: 1 });
      // o perdedor continua no horário antigo (RN-16: nada muda)
      const perdedor = rs[0]!.ok ? b.valor : a.valor;
      const linha = await amb.prisma.agendamento.findUniqueOrThrow({ where: { id: perdedor.id } });
      expect(linha.inicio.toISOString()).toBe(perdedor.inicio);
    }
  });
});

describe('C7 — bloqueio × agendamento concorrentes', () => {
  it('RN-05 / D-05: bloqueio e agendamento concorrentes nunca passam os dois (10 rodadas)', async () => {
    for (let rodada = 0; rodada < 10; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma);
      const cl = c.clientes[0]!;
      const [bloqueio, agendamento] = await Promise.all([
        criarBloqueio(amb.deps, {
          profissionalId: c.profissionalIds[0]!,
          inicio: em('2026-03-02T09:45'),
          fim: em('2026-03-02T11:00'),
          motivo: 'médico',
          ator: { usuarioId: c.donoUsuarioId, papel: 'DONO' },
        }),
        agendar(amb.deps, {
          estabelecimentoId: c.estabelecimentoId,
          servicoId: c.servicoId,
          profissionalId: c.profissionalIds[0]!,
          clienteId: cl.clienteId,
          inicio: SEGUNDA_10H,
          ator: { usuarioId: cl.usuarioId, papel: 'CLIENTE' },
        }),
      ]);
      expect([bloqueio.ok, agendamento.ok].filter(Boolean)).toHaveLength(1);
      const perdedor = bloqueio.ok ? agendamento : bloqueio;
      expect(perdedor).toMatchObject({ ok: false, codigo: 'HORARIO_INDISPONIVEL' });
      const total = (await amb.prisma.bloqueio.count()) + (await amb.prisma.agendamento.count());
      expect(total).toBe(1);
    }
  });
});
