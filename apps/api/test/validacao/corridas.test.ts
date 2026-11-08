import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { agendar, cancelar, criarBloqueio, remarcar } from '../../src/application';
import { type Ambiente, type Cenario, criarAmbiente, em, semear } from '../integracao/apoio';
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

const RODADAS = 30;

async function agendarOk(c: Cenario, idx: number, inicio: number, profIdx = 0, servicoId?: string) {
  const cl = c.clientes[idx]!;
  const r = await agendar(amb.deps, {
    estabelecimentoId: c.estabelecimentoId,
    servicoId: servicoId ?? c.servicoId,
    profissionalId: c.profissionalIds[profIdx]!,
    clienteId: cl.clienteId,
    inicio,
    ator: cliente(cl.usuarioId),
  });
  if (!r.ok) throw new Error(`pré-condição: agendar falhou ${JSON.stringify(r)}`);
  return r.valor;
}

const historicoDe = (id: string) =>
  amb.prisma.historicoStatus.findMany({ where: { agendamentoId: id }, orderBy: { em: 'asc' } });

describe('V1 — remarcar × agendar e remarcar × remarcar (RN-16, RN-21)', () => {
  it(`V1a: remarcar(A→14:00) × agendar(14:00), ${RODADAS} rodadas`, async () => {
    const placar: Record<string, number> = {};
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { clientes: 2 });
      const a = await agendarOk(c, 0, H('10:00'));
      const tarefas = [
        () =>
          remarcar(amb.deps, {
            agendamentoId: a.id,
            novoInicio: H('14:00'),
            ator: cliente(c.clientes[0]!.usuarioId),
          }),
        () =>
          agendar(amb.deps, {
            estabelecimentoId: c.estabelecimentoId,
            servicoId: c.servicoId,
            profissionalId: c.profissionalIds[0]!,
            clienteId: c.clientes[1]!.clienteId,
            inicio: H('14:00'),
            ator: cliente(c.clientes[1]!.usuarioId),
          }),
      ];
      const ordem = rodada % 2 === 0 ? tarefas : [...tarefas].reverse();
      const rs = await Promise.all(ordem.map((f) => f()));
      const [rRem, rAg] = rodada % 2 === 0 ? rs : [...rs].reverse();
      expect([rRem!.ok, rAg!.ok].filter(Boolean)).toHaveLength(1);
      const k = rRem!.ok ? 'remarcar' : 'agendar';
      placar[k] = (placar[k] ?? 0) + 1;
      expect(await sobreposicoes(amb.prisma)).toBe(0);
      const depois = await amb.prisma.agendamento.findUniqueOrThrow({ where: { id: a.id } });
      const hist = await historicoDe(a.id);
      if (!rRem!.ok) {
        expect(rRem).toMatchObject({ codigo: 'HORARIO_INDISPONIVEL' });
        // Perdedor intacto.
        expect(depois.inicio.getTime()).toBe(H('10:00'));
        expect(depois.inicioBloco.getTime()).toBe(H('10:00'));
        expect(depois.versao).toBe(a.versao);
        expect(hist.filter((h) => h.tipo === 'REMARCACAO')).toHaveLength(0);
      } else {
        expect(rAg).toMatchObject({ codigo: 'HORARIO_INDISPONIVEL' });
        expect(depois.inicio.getTime()).toBe(H('14:00'));
        expect(hist.filter((h) => h.tipo === 'REMARCACAO')).toHaveLength(1);
      }
      expect(await amb.prisma.agendamento.count({ where: { status: { not: 'CANCELADO' } } })).toBe(
        rRem!.ok ? 1 : 2,
      );
    }
    console.log(`V1a vencedores: ${JSON.stringify(placar)}`);
  });

  it(`V1b: remarcar(A→14:00) × remarcar(B→14:00), ${RODADAS} rodadas`, async () => {
    const placar: Record<string, number> = {};
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { clientes: 2 });
      const a = await agendarOk(c, 0, H('10:00'));
      const b = await agendarOk(c, 1, H('11:00'));
      const pedidos = [
        { ag: a, cl: c.clientes[0]!, antigo: H('10:00') },
        { ag: b, cl: c.clientes[1]!, antigo: H('11:00') },
      ];
      const disparo = rodada % 2 === 0 ? pedidos : [...pedidos].reverse();
      const rs = await Promise.all(
        disparo.map((p) =>
          remarcar(amb.deps, {
            agendamentoId: p.ag.id,
            novoInicio: H('14:00'),
            ator: cliente(p.cl.usuarioId),
          }),
        ),
      );
      expect(codigos(rs)).toEqual({ OK: 1, HORARIO_INDISPONIVEL: 1 });
      expect(await sobreposicoes(amb.prisma)).toBe(0);
      for (let i = 0; i < 2; i++) {
        const p = disparo[i]!;
        const linha = await amb.prisma.agendamento.findUniqueOrThrow({ where: { id: p.ag.id } });
        if (rs[i]!.ok) {
          expect(linha.inicio.getTime()).toBe(H('14:00'));
          placar[p.ag.id === a.id ? 'A' : 'B'] = (placar[p.ag.id === a.id ? 'A' : 'B'] ?? 0) + 1;
        } else {
          expect(linha.inicio.getTime()).toBe(p.antigo);
          expect(linha.inicioBloco.getTime()).toBe(p.antigo);
          expect(linha.versao).toBe(p.ag.versao);
          expect(linha.status).toBe('CONFIRMADO');
        }
      }
    }
    console.log(`V1b vencedores: ${JSON.stringify(placar)}`);
  });

  it(`V1c: remarcar com troca de profissional P1→P2 × agendar(P2) × agendar(P1 no horário antigo), ${RODADAS} rodadas`, async () => {
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { profissionais: 2, clientes: 3 });
      const a = await agendarOk(c, 0, H('10:00'), 0);
      const tarefas = embaralhar(
        [
          () =>
            remarcar(amb.deps, {
              agendamentoId: a.id,
              novoInicio: H('14:00'),
              novoProfissionalId: c.profissionalIds[1]!,
              ator: cliente(c.clientes[0]!.usuarioId),
            }),
          () =>
            agendar(amb.deps, {
              estabelecimentoId: c.estabelecimentoId,
              servicoId: c.servicoId,
              profissionalId: c.profissionalIds[1]!,
              clienteId: c.clientes[1]!.clienteId,
              inicio: H('14:00'),
              ator: cliente(c.clientes[1]!.usuarioId),
            }),
          () =>
            agendar(amb.deps, {
              estabelecimentoId: c.estabelecimentoId,
              servicoId: c.servicoId,
              profissionalId: c.profissionalIds[0]!,
              clienteId: c.clientes[2]!.clienteId,
              inicio: H('10:00'),
              ator: cliente(c.clientes[2]!.usuarioId),
            }),
        ],
        rodada,
      );
      await Promise.all(tarefas.map((f) => f()));
      expect(await sobreposicoes(amb.prisma)).toBe(0);
      expect(
        await amb.prisma.agendamento.count({
          where: { profissionalId: c.profissionalIds[1]!, inicio: new Date(H('14:00')) },
        }),
      ).toBe(1);
    }
  });
});

describe('V2 — remarcar para horário sobreposto ao próprio antigo (RN-16)', () => {
  it(`V2: A 10:00–10:30 → 10:15 × agendar 15 min em 10:00 e em 10:30, ${RODADAS} rodadas`, async () => {
    const placar: Record<string, number> = {};
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { clientes: 3 });
      const curto = await amb.prisma.servico.create({
        data: {
          estabelecimentoId: c.estabelecimentoId,
          nome: 'Barba',
          duracaoMin: 15,
          precoCentavos: 2000,
        },
      });
      await amb.prisma.profissionalServico.create({
        data: { profissionalId: c.profissionalIds[0]!, servicoId: curto.id },
      });
      const a = await agendarOk(c, 0, H('10:00'));
      const fs = [
        () =>
          remarcar(amb.deps, {
            agendamentoId: a.id,
            novoInicio: H('10:15'),
            ator: cliente(c.clientes[0]!.usuarioId),
          }),
        () =>
          agendar(amb.deps, {
            estabelecimentoId: c.estabelecimentoId,
            servicoId: curto.id,
            profissionalId: c.profissionalIds[0]!,
            clienteId: c.clientes[1]!.clienteId,
            inicio: H('10:00'),
            ator: cliente(c.clientes[1]!.usuarioId),
          }),
        () =>
          agendar(amb.deps, {
            estabelecimentoId: c.estabelecimentoId,
            servicoId: curto.id,
            profissionalId: c.profissionalIds[0]!,
            clienteId: c.clientes[2]!.clienteId,
            inicio: H('10:30'),
            ator: cliente(c.clientes[2]!.usuarioId),
          }),
      ];
      const idx = embaralhar([0, 1, 2], rodada);
      const brutos = await Promise.all(idx.map((i) => fs[i]!()));
      const rs: (typeof brutos)[number][] = [];
      idx.forEach((i, k) => (rs[i] = brutos[k]!));
      const [rRem, r10, r1030] = rs;
      const chave = `rem=${rRem!.ok ? 'ok' : rRem!.codigo} 10:00=${r10!.ok ? 'ok' : r10!.codigo} 10:30=${r1030!.ok ? 'ok' : r1030!.codigo}`;
      placar[chave] = (placar[chave] ?? 0) + 1;
      expect(await sobreposicoes(amb.prisma)).toBe(0);
      const linha = await amb.prisma.agendamento.findUniqueOrThrow({ where: { id: a.id } });
      if (rRem!.ok) {
        expect(linha.inicio.getTime()).toBe(H('10:15'));
        expect(linha.fimBloco.getTime()).toBe(H('10:45'));
        expect(r1030!.ok).toBe(false);
      } else {
        // Só pode perder se o 10:30 entrou antes.
        expect(r1030!.ok).toBe(true);
        expect(rRem).toMatchObject({ codigo: 'HORARIO_INDISPONIVEL' });
        expect(linha.inicio.getTime()).toBe(H('10:00'));
        expect(r10!.ok).toBe(false);
      }
      // Pelo menos uma das duas pontas sempre sai vencedora: o sistema não "trava" ambas.
      expect([rRem!.ok, r1030!.ok].filter(Boolean)).toHaveLength(1);
    }
    console.log(`V2 desfechos: ${JSON.stringify(placar)}`);
  });

  it('V2b: remarcar para o mesmo horário e para 15 min antes (sobreposto) é aceito sem outro conflito', async () => {
    const c = await semear(amb.prisma, { clientes: 1 });
    const a = await agendarOk(c, 0, H('10:00'));
    const r1 = await remarcar(amb.deps, {
      agendamentoId: a.id,
      novoInicio: H('10:00'),
      ator: cliente(c.clientes[0]!.usuarioId),
    });
    expect(r1.ok).toBe(true);
    const r2 = await remarcar(amb.deps, {
      agendamentoId: a.id,
      novoInicio: H('09:45'),
      ator: cliente(c.clientes[0]!.usuarioId),
    });
    expect(r2.ok).toBe(true);
    const linha = await amb.prisma.agendamento.findUniqueOrThrow({ where: { id: a.id } });
    expect(linha.inicio.getTime()).toBe(H('09:45'));
    expect(linha.fim.getTime()).toBe(H('10:15'));
  });

  it(`V2c: o mesmo agendamento remarcado duas vezes em paralelo → histórico encadeado e versões coerentes`, async () => {
    for (let rodada = 0; rodada < 10; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { clientes: 1 });
      const a = await agendarOk(c, 0, H('10:00'));
      const rs = await Promise.all(
        [H('14:00'), H('15:00')].map((t) =>
          remarcar(amb.deps, {
            agendamentoId: a.id,
            novoInicio: t,
            ator: cliente(c.clientes[0]!.usuarioId),
          }),
        ),
      );
      expect(rs.every((r) => r.ok)).toBe(true);
      const hist = (await historicoDe(a.id)).filter((h) => h.tipo === 'REMARCACAO');
      expect(hist).toHaveLength(2);
      const linha = await amb.prisma.agendamento.findUniqueOrThrow({ where: { id: a.id } });
      expect(linha.versao).toBe(a.versao + 2);
      // Encadeamento: o "anterior" de uma é o "novo" da outra.
      const anteriores = hist.map((h) => h.inicioAnterior!.getTime()).sort();
      const novos = hist.map((h) => h.inicioNovo!.getTime());
      expect(anteriores).toContain(H('10:00'));
      expect(novos).toContain(linha.inicio.getTime());
      expect(new Set(anteriores).size).toBe(2);
    }
  });

  it('V2d: remarcar × cancelar o mesmo agendamento em paralelo → nunca reativa cancelado', async () => {
    for (let rodada = 0; rodada < 20; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { clientes: 1 });
      const a = await agendarOk(c, 0, H('10:00'));
      const ator = cliente(c.clientes[0]!.usuarioId);
      const fs = [
        () => remarcar(amb.deps, { agendamentoId: a.id, novoInicio: H('14:00'), ator }),
        () => cancelar(amb.deps, { agendamentoId: a.id, ator }),
      ];
      const ordem = rodada % 2 === 0 ? fs : [...fs].reverse();
      const brutos = await Promise.all(ordem.map((f) => f()));
      const [rRem, rCan] = rodada % 2 === 0 ? brutos : [...brutos].reverse();
      expect(rCan!.ok).toBe(true);
      const linha = await amb.prisma.agendamento.findUniqueOrThrow({ where: { id: a.id } });
      expect(linha.status).toBe('CANCELADO');
      if (!rRem!.ok) expect(rRem!.codigo).toBe('TRANSICAO_DE_STATUS_INVALIDA');
    }
  });
});

describe('V4 — cancelar em paralelo (RN-06, RN-19)', () => {
  it(`V4a: cancelar(A 10:00) × agendar(10:00), ${RODADAS} rodadas`, async () => {
    const placar: Record<string, number> = {};
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { clientes: 2 });
      const a = await agendarOk(c, 0, H('10:00'));
      const fs = [
        () => cancelar(amb.deps, { agendamentoId: a.id, ator: cliente(c.clientes[0]!.usuarioId) }),
        () =>
          agendar(amb.deps, {
            estabelecimentoId: c.estabelecimentoId,
            servicoId: c.servicoId,
            profissionalId: c.profissionalIds[0]!,
            clienteId: c.clientes[1]!.clienteId,
            inicio: H('10:00'),
            ator: cliente(c.clientes[1]!.usuarioId),
          }),
      ];
      const ordem = rodada % 2 === 0 ? fs : [...fs].reverse();
      const brutos = await Promise.all(ordem.map((f) => f()));
      const [rCan, rAg] = rodada % 2 === 0 ? brutos : [...brutos].reverse();
      expect(rCan!.ok).toBe(true);
      if (!rAg!.ok) expect(rAg!.codigo).toBe('HORARIO_INDISPONIVEL');
      const k = rAg!.ok ? 'agendar-ok' : 'agendar-409';
      placar[k] = (placar[k] ?? 0) + 1;
      expect(await sobreposicoes(amb.prisma)).toBe(0);
      // Depois de tudo, o horário tem de estar livre de novo se o agendar perdeu (RN-06).
      if (!rAg!.ok) {
        const de2 = await agendar(amb.deps, {
          estabelecimentoId: c.estabelecimentoId,
          servicoId: c.servicoId,
          profissionalId: c.profissionalIds[0]!,
          clienteId: c.clientes[1]!.clienteId,
          inicio: H('10:00'),
          ator: cliente(c.clientes[1]!.usuarioId),
        });
        expect(de2.ok).toBe(true);
      }
    }
    console.log(`V4a desfechos: ${JSON.stringify(placar)}`);
  });

  it(`V4b: cancelar duas (e cinco) vezes em paralelo → 1 ok, resto TRANSICAO_DE_STATUS_INVALIDA, histórico sem duplicar`, async () => {
    for (let rodada = 0; rodada < 20; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { clientes: 1 });
      const a = await agendarOk(c, 0, H('10:00'));
      const n = rodada % 2 === 0 ? 2 : 5;
      const rs = await Promise.all(
        Array.from({ length: n }, (_, i) =>
          cancelar(amb.deps, {
            agendamentoId: a.id,
            ator: i % 2 === 0 ? cliente(c.clientes[0]!.usuarioId) : dono(c.donoUsuarioId),
          }),
        ),
      );
      expect(codigos(rs)).toEqual({ OK: 1, TRANSICAO_DE_STATUS_INVALIDA: n - 1 });
      const hist = await historicoDe(a.id);
      expect(hist.filter((h) => h.para === 'CANCELADO')).toHaveLength(1);
      expect(hist).toHaveLength(2); // criação + cancelamento
    }
  });
});

describe('V5 — bloqueio × agendamento (RN-05, D-05)', () => {
  it(`V5: criarBloqueio(10:00–10:30) × agendar(10:00) e × agendar(10:15 parcial), ${RODADAS} rodadas`, async () => {
    const placar: Record<string, number> = {};
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { clientes: 2 });
      const fs = [
        () =>
          criarBloqueio(amb.deps, {
            profissionalId: c.profissionalIds[0]!,
            inicio: H('10:00'),
            fim: H('10:30'),
            ator: dono(c.donoUsuarioId),
          }),
        () =>
          agendar(amb.deps, {
            estabelecimentoId: c.estabelecimentoId,
            servicoId: c.servicoId,
            profissionalId: c.profissionalIds[0]!,
            clienteId: c.clientes[0]!.clienteId,
            inicio: H('10:00'),
            ator: cliente(c.clientes[0]!.usuarioId),
          }),
        () =>
          agendar(amb.deps, {
            estabelecimentoId: c.estabelecimentoId,
            servicoId: c.servicoId,
            profissionalId: c.profissionalIds[0]!,
            clienteId: c.clientes[1]!.clienteId,
            inicio: H('10:15'),
            ator: dono(c.donoUsuarioId),
          }),
      ];
      const idx = embaralhar([0, 1, 2], rodada);
      const brutos = await Promise.all(idx.map((i) => fs[i]!()));
      const rs: (typeof brutos)[number][] = [];
      idx.forEach((i, k) => (rs[i] = brutos[k]!));
      const chave = rs.map((r) => (r.ok ? 'ok' : r.codigo)).join('/');
      placar[chave] = (placar[chave] ?? 0) + 1;
      expect(await bloqueioSobreposto(amb.prisma)).toBe(0);
      expect(await sobreposicoes(amb.prisma)).toBe(0);
      expect(rs.filter((r) => r.ok).length).toBe(1);
    }
    console.log(`V5 desfechos (bloq/10:00/10:15): ${JSON.stringify(placar)}`);
  });
});

describe('V5b — bloqueio × agendamento com atraso aleatório', () => {
  it(`V5b: bloqueio disparado 0–20 ms depois do agendar, ${RODADAS} rodadas → nunca coexistem`, async () => {
    const placar: Record<string, number> = {};
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { clientes: 1 });
      const atraso = (rodada * 7) % 21;
      const [rAg, rBl] = await Promise.all([
        agendar(amb.deps, {
          estabelecimentoId: c.estabelecimentoId,
          servicoId: c.servicoId,
          profissionalId: c.profissionalIds[0]!,
          clienteId: c.clientes[0]!.clienteId,
          inicio: H('10:00'),
          ator: cliente(c.clientes[0]!.usuarioId),
        }),
        new Promise((r) => setTimeout(r, atraso)).then(() =>
          criarBloqueio(amb.deps, {
            profissionalId: c.profissionalIds[0]!,
            inicio: H('10:20'),
            fim: H('11:00'),
            ator: dono(c.donoUsuarioId),
          }),
        ),
      ]);
      const k = `${rAg.ok ? 'ag' : rAg.codigo}/${rBl.ok ? 'bl' : rBl.codigo}`;
      placar[k] = (placar[k] ?? 0) + 1;
      expect([rAg.ok, rBl.ok].filter(Boolean)).toHaveLength(1);
      expect(await bloqueioSobreposto(amb.prisma)).toBe(0);
    }
    console.log(`V5b desfechos (agendar/bloqueio): ${JSON.stringify(placar)}`);
  });
});

describe('V6 — RN-17 sob concorrência', () => {
  it('V6: cliente com limite−1 ativos dispara 6 agendamentos paralelos em profissionais diferentes → no máximo 1 aceito', async () => {
    const resumo: string[] = [];
    let violacoes = 0;
    for (let rodada = 0; rodada < 10; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { profissionais: 6, clientes: 1 });
      const cl = c.clientes[0]!;
      // limite padrão = 3; deixa 2 ativos.
      await agendarOk(c, 0, H('09:00'), 0);
      await agendarOk(c, 0, H('09:00'), 1);
      const rs = await Promise.all(
        c.profissionalIds.map((p) =>
          agendar(amb.deps, {
            estabelecimentoId: c.estabelecimentoId,
            servicoId: c.servicoId,
            profissionalId: p,
            clienteId: cl.clienteId,
            inicio: H('14:00'),
            ator: cliente(cl.usuarioId),
          }),
        ),
      );
      const ativos = await amb.prisma.agendamento.count({
        where: { clienteId: cl.clienteId, status: { in: ['PENDENTE', 'CONFIRMADO'] } },
      });
      resumo.push(`${JSON.stringify(codigos(rs))}→ativos=${ativos}`);
      if (ativos > 3) violacoes++;
    }
    console.log(`V6 rodadas: ${resumo.join(' | ')}`);
    expect(violacoes).toBe(0);
  });

  it('V6c (controle sequencial): o mesmo pedido em série é recusado com LIMITE_DE_AGENDAMENTOS', async () => {
    const c = await semear(amb.prisma, { profissionais: 2, clientes: 1 });
    await agendarOk(c, 0, H('09:00'), 0);
    await agendarOk(c, 0, H('09:00'), 1);
    await agendarOk(c, 0, H('14:00'), 0);
    const r = await agendar(amb.deps, {
      estabelecimentoId: c.estabelecimentoId,
      servicoId: c.servicoId,
      profissionalId: c.profissionalIds[1]!,
      clienteId: c.clientes[0]!.clienteId,
      inicio: H('14:00'),
      ator: cliente(c.clientes[0]!.usuarioId),
    });
    expect(r).toMatchObject({ ok: false, codigo: 'LIMITE_DE_AGENDAMENTOS' });
  });

  it('V6d (mínimo): limite−1 ativos e 2 pedidos paralelos em 2 profissionais → só 1 aceito (10 rodadas)', async () => {
    let violacoes = 0;
    for (let rodada = 0; rodada < 10; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { profissionais: 2, clientes: 1 });
      await agendarOk(c, 0, H('09:00'), 0);
      await agendarOk(c, 0, H('09:00'), 1);
      const rs = await Promise.all(
        [0, 1].map((i) =>
          agendar(amb.deps, {
            estabelecimentoId: c.estabelecimentoId,
            servicoId: c.servicoId,
            profissionalId: c.profissionalIds[i]!,
            clienteId: c.clientes[0]!.clienteId,
            inicio: H('14:00'),
            ator: cliente(c.clientes[0]!.usuarioId),
          }),
        ),
      );
      if (rs.every((r) => r.ok)) violacoes++;
    }
    console.log(`V6d: rodadas com 2 aceitos (4 ativos, limite 3) = ${violacoes}/10`);
    expect(violacoes).toBe(0);
  });

  it('V6b: mesmo ataque com "qualquer profissional" em paralelo', async () => {
    const c = await semear(amb.prisma, { profissionais: 6, clientes: 1 });
    const cl = c.clientes[0]!;
    await agendarOk(c, 0, H('09:00'), 0);
    await agendarOk(c, 0, H('09:00'), 1);
    const rs = await Promise.all(
      [H('13:00'), H('14:00'), H('15:00'), H('16:00'), H('17:00')].map((t) =>
        agendar(amb.deps, {
          estabelecimentoId: c.estabelecimentoId,
          servicoId: c.servicoId,
          profissionalId: null,
          clienteId: cl.clienteId,
          inicio: t,
          ator: cliente(cl.usuarioId),
        }),
      ),
    );
    console.log(`V6b: ${JSON.stringify(codigos(rs))}`);
    expect(codigos(rs)).toEqual({ OK: 1, LIMITE_DE_AGENDAMENTOS: 4 });
  });
});

describe('V7 — "qualquer profissional" (RN-12)', () => {
  it(`V7a: 3 profissionais, 20 pedidos no mesmo horário → exatamente 3 aceitos, um por profissional (10 rodadas)`, async () => {
    for (let rodada = 0; rodada < 10; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, { profissionais: 3, clientes: 20 });
      const rs = await Promise.all(
        c.clientes.map((cl) =>
          agendar(amb.deps, {
            estabelecimentoId: c.estabelecimentoId,
            servicoId: c.servicoId,
            profissionalId: null,
            clienteId: cl.clienteId,
            inicio: H('10:00'),
            ator: cliente(cl.usuarioId),
          }),
        ),
      );
      expect(codigos(rs)).toEqual({ OK: 3, HORARIO_INDISPONIVEL: 17 });
      const profs = rs.flatMap((r) => (r.ok ? [r.valor.profissionalId] : []));
      expect(new Set(profs)).toEqual(new Set(c.profissionalIds));
      expect(rs.find((r) => !r.ok)).toMatchObject({
        detalhes: { proximosHorarios: expect.any(Array) },
      });
      expect(await sobreposicoes(amb.prisma)).toBe(0);
    }
  });

  it('V7b: 20 pedidos paralelos em horários distintos com cargas iniciais (2,1,0) → distribuição gulosa determinística (8,8,7)', async () => {
    for (let rodada = 0; rodada < 5; rodada++) {
      await amb.limpar();
      const c = await semear(amb.prisma, {
        profissionais: 3,
        clientes: 23,
        servico: { duracaoMin: 15 },
      });
      await agendarOk(c, 20, H('09:00'), 0);
      await agendarOk(c, 21, H('09:15'), 0);
      await agendarOk(c, 22, H('09:00'), 1);
      const horas = [
        ...['10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '11:45'],
        ...[
          '13:00',
          '13:15',
          '13:30',
          '13:45',
          '14:00',
          '14:15',
          '14:30',
          '14:45',
          '15:00',
          '15:15',
          '15:30',
          '15:45',
        ],
      ];
      const rs = await Promise.all(
        embaralhar(horas, rodada).map((h, i) =>
          agendar(amb.deps, {
            estabelecimentoId: c.estabelecimentoId,
            servicoId: c.servicoId,
            profissionalId: null,
            clienteId: c.clientes[i]!.clienteId,
            inicio: H(h),
            ator: cliente(c.clientes[i]!.usuarioId),
          }),
        ),
      );
      expect(codigos(rs)).toEqual({ OK: 20 });
      const cont = await Promise.all(
        c.profissionalIds.map((p) =>
          amb.prisma.agendamento.count({ where: { profissionalId: p } }),
        ),
      );
      expect(cont).toEqual([8, 8, 7]);
    }
  });

  it('V7c: escolha sequencial respeita "menos agendamentos no dia" e desempate por criadoEm', async () => {
    const c = await semear(amb.prisma, { profissionais: 3, clientes: 6 });
    await agendarOk(c, 3, H('09:00'), 0);
    await agendarOk(c, 4, H('09:30'), 0);
    await agendarOk(c, 5, H('09:00'), 1);
    // Agendamento do P3 noutro dia não conta para a data.
    await agendarOk(c, 5, em('2026-03-03T09:00'), 2);
    const escolhidos: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await agendar(amb.deps, {
        estabelecimentoId: c.estabelecimentoId,
        servicoId: c.servicoId,
        profissionalId: null,
        clienteId: c.clientes[i]!.clienteId,
        inicio: H('14:00'),
        ator: cliente(c.clientes[i]!.usuarioId),
      });
      expect(r.ok).toBe(true);
      if (r.ok) escolhidos.push(r.valor.profissionalId);
    }
    expect(escolhidos).toEqual([c.profissionalIds[2], c.profissionalIds[1], c.profissionalIds[0]]);
  });
});
