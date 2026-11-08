import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type ComandoAgendar,
  agendar,
  cancelar,
  concluir,
  confirmar,
  listarHorarios,
  marcarNaoComparecimento,
  remarcar,
} from '../../src/application';
import {
  type Ambiente,
  type Cenario,
  SEGUNDA_10H,
  criarAmbiente,
  em,
  semear,
  uowCega,
} from './apoio';

const amb: Ambiente = criarAmbiente(10);
afterAll(() => amb.fechar());
beforeEach(() => amb.limpar());

function comando(c: Cenario, extra: Partial<ComandoAgendar> = {}, cliente = 0): ComandoAgendar {
  const cl = c.clientes[cliente]!;
  return {
    estabelecimentoId: c.estabelecimentoId,
    servicoId: c.servicoId,
    profissionalId: c.profissionalIds[0]!,
    clienteId: cl.clienteId,
    inicio: SEGUNDA_10H,
    ator: { usuarioId: cl.usuarioId, papel: 'CLIENTE' },
    ...extra,
  };
}

async function criado(c: Cenario, extra: Partial<ComandoAgendar> = {}, cliente = 0) {
  const r = await agendar(amb.deps, comando(c, extra, cliente));
  if (!r.ok) throw new Error(`agendar falhou: ${r.codigo}`);
  return r.valor;
}

const historico = (agendamentoId: string) =>
  amb.prisma.historicoStatus.findMany({ where: { agendamentoId }, orderBy: { em: 'asc' } });

describe('C6 — cancelamento libera o horário', () => {
  it('RN-06: cancelar libera o horário e agendar de novo no mesmo horário funciona', async () => {
    const c = await semear(amb.prisma, { clientes: 2 });
    const a = await criado(c);
    expect(await agendar(amb.deps, comando(c, {}, 1))).toMatchObject({
      ok: false,
      codigo: 'HORARIO_INDISPONIVEL',
    });
    const cl0 = c.clientes[0]!;
    expect(
      (
        await cancelar(amb.deps, {
          agendamentoId: a.id,
          ator: { usuarioId: cl0.usuarioId, papel: 'CLIENTE' },
        })
      ).ok,
    ).toBe(true);
    const b = await agendar(amb.deps, comando(c, {}, 1));
    expect(b).toMatchObject({ ok: true, valor: { inicio: a.inicio } });
    expect((await historico(a.id)).map((h) => [h.de, h.para])).toEqual([
      [null, 'CONFIRMADO'],
      ['CONFIRMADO', 'CANCELADO'],
    ]);
  });

  it('RN-15: cliente fora do prazo não cancela; o dono cancela', async () => {
    const c = await semear(amb.prisma);
    const a = await criado(c);
    amb.relogio.instante = SEGUNDA_10H - 3 * 3_600_000;
    const cl = c.clientes[0]!;
    expect(
      await cancelar(amb.deps, {
        agendamentoId: a.id,
        ator: { usuarioId: cl.usuarioId, papel: 'CLIENTE' },
      }),
    ).toMatchObject({
      ok: false,
      codigo: 'PRAZO_DE_CANCELAMENTO_ENCERRADO',
    });
    expect(
      (
        await cancelar(amb.deps, {
          agendamentoId: a.id,
          ator: { usuarioId: c.donoUsuarioId, papel: 'DONO' },
          motivo: 'pedido por telefone',
        })
      ).ok,
    ).toBe(true);
    expect((await historico(a.id)).at(-1)).toMatchObject({
      para: 'CANCELADO',
      motivo: 'pedido por telefone',
      autorUsuarioId: c.donoUsuarioId,
    });
  });
});

describe('C8 — cópia do serviço', () => {
  it('RN-14: editar o serviço não muda o agendamento existente nem o bloco dele', async () => {
    const c = await semear(amb.prisma, {
      servico: { duracaoMin: 30, preparoMin: 10, limpezaMin: 10 },
    });
    const a = await criado(c);
    await amb.prisma.servico.update({
      where: { id: c.servicoId },
      data: {
        nome: 'Corte premium',
        duracaoMin: 90,
        preparoMin: 30,
        limpezaMin: 30,
        precoCentavos: 9000,
      },
    });
    const linha = await amb.prisma.agendamento.findUniqueOrThrow({ where: { id: a.id } });
    expect(linha).toMatchObject({
      servicoNome: 'Corte',
      duracaoMin: 30,
      preparoMin: 10,
      limpezaMin: 10,
      precoCentavos: 5000,
    });
    expect(linha.inicioBloco.toISOString()).toBe('2026-03-02T12:50:00.000Z');
    expect(linha.fimBloco.toISOString()).toBe('2026-03-02T13:40:00.000Z');

    // Remarcar mantém a cópia (bloco de 50 min, não 150).
    const r = await remarcar(amb.deps, {
      agendamentoId: a.id,
      novoInicio: em('2026-03-02T14:00'),
      ator: { usuarioId: c.clientes[0]!.usuarioId, papel: 'CLIENTE' },
    });
    expect(r).toMatchObject({ ok: true, valor: { servicoNome: 'Corte', duracaoMin: 30 } });
    const depois = await amb.prisma.agendamento.findUniqueOrThrow({ where: { id: a.id } });
    expect(depois.fimBloco.getTime() - depois.inicioBloco.getTime()).toBe(50 * 60_000);

    // Agendamentos novos usam o serviço editado.
    const novo = await criado(c, { inicio: em('2026-03-03T10:00') });
    expect(novo).toMatchObject({ servicoNome: 'Corte premium', duracaoMin: 90 });
  });
});

describe('RN-16 — remarcação (mesma linha)', () => {
  it('RN-16: remarcar para horário sobreposto ao próprio é aceito (UPDATE da mesma linha) e grava histórico', async () => {
    const c = await semear(amb.prisma);
    const a = await criado(c);
    const ator = { usuarioId: c.clientes[0]!.usuarioId, papel: 'CLIENTE' as const };
    const r = await remarcar(amb.deps, {
      agendamentoId: a.id,
      novoInicio: em('2026-03-02T10:15'),
      ator,
    });
    expect(r).toMatchObject({
      ok: true,
      valor: { id: a.id, inicio: '2026-03-02T13:15:00.000Z', versao: 1 },
    });
    expect(
      (await remarcar(amb.deps, { agendamentoId: a.id, novoInicio: em('2026-03-02T10:15'), ator }))
        .ok,
    ).toBe(true);
    expect(await amb.prisma.agendamento.count()).toBe(1);
    const h = await historico(a.id);
    expect(h.filter((x) => x.tipo === 'REMARCACAO')).toHaveLength(2);
    expect(h[1]).toMatchObject({ de: 'CONFIRMADO', para: 'CONFIRMADO' });
    expect(h[1]!.inicioAnterior?.toISOString()).toBe(a.inicio);
  });

  it('RN-16 / RN-13: remarcação recusada não muda nada e sugere próximos horários', async () => {
    const c = await semear(amb.prisma, { clientes: 2 });
    const a = await criado(c);
    await criado(c, { inicio: em('2026-03-02T11:00') }, 1);
    const r = await remarcar(amb.deps, {
      agendamentoId: a.id,
      novoInicio: em('2026-03-02T11:00'),
      ator: { usuarioId: c.clientes[0]!.usuarioId, papel: 'CLIENTE' },
    });
    expect(r).toMatchObject({ ok: false, codigo: 'HORARIO_INDISPONIVEL' });
    if (!r.ok)
      expect((r.detalhes?.['proximosHorarios'] as string[])[0]).toBe('2026-03-02T14:30:00.000Z');
    const linha = await amb.prisma.agendamento.findUniqueOrThrow({ where: { id: a.id } });
    expect(linha.inicio.toISOString()).toBe(a.inicio);
    expect(linha.versao).toBe(0);
  });

  it('RN-16: troca de profissional na remarcação', async () => {
    const c = await semear(amb.prisma, { profissionais: 2 });
    const a = await criado(c);
    const r = await remarcar(amb.deps, {
      agendamentoId: a.id,
      novoInicio: SEGUNDA_10H,
      novoProfissionalId: c.profissionalIds[1]!,
      ator: { usuarioId: c.donoUsuarioId, papel: 'DONO' },
    });
    expect(r).toMatchObject({ ok: true, valor: { profissionalId: c.profissionalIds[1] } });
  });
});

describe('RN-19 — ciclo de vida e histórico', () => {
  it('RN-19: PENDENTE → CONFIRMADO → CONCLUIDO, com histórico de cada mudança', async () => {
    const c = await semear(amb.prisma, { confirmacaoAutomatica: false });
    const a = await criado(c);
    expect(a.status).toBe('PENDENTE');
    const cliente = { usuarioId: c.clientes[0]!.usuarioId, papel: 'CLIENTE' as const };
    const dono = { usuarioId: c.donoUsuarioId, papel: 'DONO' as const };
    expect(await confirmar(amb.deps, { agendamentoId: a.id, ator: cliente })).toMatchObject({
      ok: false,
      codigo: 'ACESSO_NEGADO',
    });
    expect(await confirmar(amb.deps, { agendamentoId: a.id, ator: dono })).toMatchObject({
      ok: true,
      valor: { status: 'CONFIRMADO' },
    });
    expect(await concluir(amb.deps, { agendamentoId: a.id, ator: dono })).toMatchObject({
      ok: false,
      codigo: 'TRANSICAO_DE_STATUS_INVALIDA',
    });
    amb.relogio.instante = SEGUNDA_10H;
    expect(await concluir(amb.deps, { agendamentoId: a.id, ator: dono })).toMatchObject({
      ok: true,
      valor: { status: 'CONCLUIDO' },
    });
    expect(await cancelar(amb.deps, { agendamentoId: a.id, ator: dono })).toMatchObject({
      ok: false,
      codigo: 'TRANSICAO_DE_STATUS_INVALIDA',
    });
    const h = await historico(a.id);
    expect(h.map((x) => [x.de, x.para, x.autorUsuarioId])).toEqual([
      [null, 'PENDENTE', cliente.usuarioId],
      ['PENDENTE', 'CONFIRMADO', dono.usuarioId],
      ['CONFIRMADO', 'CONCLUIDO', dono.usuarioId],
    ]);
  });

  it('RN-18 / RN-19: três NAO_COMPARECEU bloqueiam o cliente', async () => {
    const c = await semear(amb.prisma);
    const dono = { usuarioId: c.donoUsuarioId, papel: 'DONO' as const };
    for (const dia of ['02', '03', '04']) {
      amb.relogio.instante = em(`2026-03-${String(Number(dia) - 1).padStart(2, '0')}T08:00`);
      const a = await criado(c, { inicio: em(`2026-03-${dia}T10:00`) });
      amb.relogio.instante = em(`2026-03-${dia}T10:30`);
      expect(
        (await marcarNaoComparecimento(amb.deps, { agendamentoId: a.id, ator: dono })).ok,
      ).toBe(true);
    }
    amb.relogio.instante = em('2026-03-05T08:00');
    expect(await agendar(amb.deps, comando(c, { inicio: em('2026-03-06T10:00') }))).toMatchObject({
      ok: false,
      codigo: 'CLIENTE_BLOQUEADO',
    });
    // o balcão continua podendo agendar para ele (RN-20)
    expect(
      (await agendar(amb.deps, { ...comando(c, { inicio: em('2026-03-06T10:00') }), ator: dono }))
        .ok,
    ).toBe(true);
  });
});

describe('RN-12 / RN-13 / RN-21 — escolha, sugestões e 23P01', () => {
  it('RN-13: recusa por HORARIO_INDISPONIVEL traz até 5 próximos horários livres', async () => {
    const c = await semear(amb.prisma, { clientes: 2 });
    await criado(c);
    const r = await agendar(amb.deps, comando(c, {}, 1));
    expect(r).toMatchObject({ ok: false, codigo: 'HORARIO_INDISPONIVEL' });
    if (!r.ok) {
      expect(r.detalhes?.['proximosHorarios']).toEqual([
        '2026-03-02T13:30:00.000Z',
        '2026-03-02T13:45:00.000Z',
        '2026-03-02T14:00:00.000Z',
        '2026-03-02T14:15:00.000Z',
        '2026-03-02T14:30:00.000Z',
      ]);
    }
  });

  it('RN-12: qualquer profissional escolhe quem tem menos agendamentos no dia, depois o mais antigo', async () => {
    const c = await semear(amb.prisma, { profissionais: 3, clientes: 3 });
    const [p1, p2, p3] = c.profissionalIds as [string, string, string];
    await criado(c, { profissionalId: p1, inicio: em('2026-03-02T15:00') }, 0);
    const r = await agendar(amb.deps, comando(c, { profissionalId: null }, 1));
    expect(r).toMatchObject({ ok: true, valor: { profissionalId: p2 } });
    const r2 = await agendar(
      amb.deps,
      comando(c, { profissionalId: null, inicio: em('2026-03-02T11:00') }, 2),
    );
    expect(r2).toMatchObject({ ok: true, valor: { profissionalId: p3 } });
  });

  it('RN-12 / RN-21: se o escolhido dá 23P01, tenta o próximo na mesma requisição', async () => {
    const c = await semear(amb.prisma, { profissionais: 2, clientes: 4 });
    const [p1, p2] = c.profissionalIds as [string, string];
    await criado(c, { profissionalId: p1 }, 0); // p1 ocupado às 10:00
    await criado(c, { profissionalId: p2, inicio: em('2026-03-02T14:00') }, 1);
    await criado(c, { profissionalId: p2, inicio: em('2026-03-02T15:00') }, 2);
    // Com leitura "cega", p1 parece livre e vem primeiro (1 agendamento no dia contra 2 do p2).
    const cego = { uow: uowCega(amb.uow), relogio: amb.relogio };
    const r = await agendar(cego, comando(c, { profissionalId: null }, 3));
    expect(r).toMatchObject({ ok: true, valor: { profissionalId: p2 } });
    // Profissional específico com leitura cega: o banco recusa e a resposta é HORARIO_INDISPONIVEL.
    const r2 = await agendar(cego, comando(c, { profissionalId: p1 }, 3));
    expect(r2).toMatchObject({ ok: false, codigo: 'HORARIO_INDISPONIVEL' });
    expect(await amb.prisma.agendamento.count()).toBe(4);
  });

  it('RN-07 / RN-12: listarHorarios une os profissionais e indica quem atende cada horário', async () => {
    const c = await semear(amb.prisma, { profissionais: 2 });
    const [p1, p2] = c.profissionalIds as [string, string];
    await criado(c, { profissionalId: p1 });
    const r = await listarHorarios(amb.deps, {
      estabelecimentoId: c.estabelecimentoId,
      servicoId: c.servicoId,
      profissionalId: null,
      dataLocal: '2026-03-02',
      ator: { usuarioId: c.clientes[0]!.usuarioId, papel: 'CLIENTE' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor).toHaveLength(30); // 11 inícios de manhã + 19 à tarde (grade de 15 min, serviço de 30 min)
    expect(r.valor.find((h) => h.inicio === '2026-03-02T13:00:00.000Z')?.profissionalIds).toEqual([
      p2,
    ]);
    expect(r.valor.find((h) => h.inicio === '2026-03-02T12:00:00.000Z')?.profissionalIds).toEqual([
      p1,
      p2,
    ]);
  });
});
