import { STATUS_AGENDAMENTO, type StatusAgendamento } from '@agenda/shared';
import { describe, expect, it } from 'vitest';
import { contexto, CORTE, em, POLITICAS_PADRAO } from './apoio-testes';
import { blocoDoAtendimento } from './disponibilidade';
import {
  type SituacaoCliente,
  TRANSICOES,
  contarAtivosFuturos,
  contarFaltas,
  podeCancelar,
  podeCriar,
  podeRemarcar,
  statusInicial,
  transicionar,
} from './politicas';

const H = 3_600_000;
const erro = (codigo: string) => ({ ok: false, codigo });
const LIMPO: SituacaoCliente = { ativosFuturos: 0, faltasDesdeDesbloqueio: 0 };
const PROF_OK = { ativo: true, executaServico: true };
const { origem: _origem, ...ctxCriar } = contexto();
void _origem;
const INICIO = em('2026-03-02T10:00');

describe('RN-15 — cancelamento', () => {
  const ag = { inicio: INICIO, status: 'CONFIRMADO' as StatusAgendamento };
  const politicas = POLITICAS_PADRAO;

  it('RN-15: cliente cancela até exatamente início − prazo', () => {
    expect(
      podeCancelar({ agendamento: ag, ator: 'CLIENTE', agora: INICIO - 4 * H, politicas }).ok,
    ).toBe(true);
    expect(
      podeCancelar({ agendamento: ag, ator: 'CLIENTE', agora: INICIO - 4 * H + 1, politicas }),
    ).toMatchObject(erro('PRAZO_DE_CANCELAMENTO_ENCERRADO'));
  });

  it('RN-15: depois do prazo só o estabelecimento cancela (RN-20)', () => {
    expect(podeCancelar({ agendamento: ag, ator: 'DONO', agora: INICIO + H, politicas }).ok).toBe(
      true,
    );
    expect(
      podeCancelar({ agendamento: ag, ator: 'PROFISSIONAL', agora: INICIO - H, politicas }).ok,
    ).toBe(true);
  });

  it('RN-15: só PENDENTE ou CONFIRMADO podem ser cancelados', () => {
    expect(
      podeCancelar({
        agendamento: { ...ag, status: 'PENDENTE' },
        ator: 'CLIENTE',
        agora: 0,
        politicas,
      }).ok,
    ).toBe(true);
    for (const status of ['CONCLUIDO', 'NAO_COMPARECEU', 'CANCELADO'] as const) {
      expect(
        podeCancelar({ agendamento: { ...ag, status }, ator: 'DONO', agora: 0, politicas }),
      ).toMatchObject(erro('TRANSICAO_DE_STATUS_INVALIDA'));
    }
  });
});

describe('RN-16 — remarcação', () => {
  const ag = { inicio: INICIO, status: 'CONFIRMADO' as StatusAgendamento, servico: CORTE };
  // ocupações SEM o próprio agendamento; há outro cliente às 11:00
  const outro = blocoDoAtendimento(em('2026-03-02T11:00'), CORTE);
  const ctx = { ...ctxCriar, ocupacoes: [outro] };
  const remarcar = (novoInicio: number, extra: Partial<Parameters<typeof podeRemarcar>[0]> = {}) =>
    podeRemarcar({
      agendamento: ag,
      novoInicio,
      ator: 'CLIENTE',
      cliente: LIMPO,
      profissional: PROF_OK,
      contexto: ctx,
      ...extra,
    });

  it('RN-16: remarcar para o mesmo horário é aceito', () => {
    expect(remarcar(INICIO).ok).toBe(true);
  });

  it('RN-16: remarcar para horário sobreposto ao antigo é aceito', () => {
    expect(remarcar(em('2026-03-02T10:15')).ok).toBe(true);
    expect(remarcar(em('2026-03-02T09:45')).ok).toBe(true);
  });

  it('RN-16: conflito com outro agendamento recusa e nada muda', () => {
    expect(remarcar(em('2026-03-02T10:45'))).toMatchObject(erro('HORARIO_INDISPONIVEL'));
  });

  it('RN-16: cliente remarca no mesmo prazo de RN-15', () => {
    const tarde = { ...ctx, agora: INICIO - 3 * H };
    expect(remarcar(em('2026-03-02T14:00'), { contexto: tarde })).toMatchObject(
      erro('PRAZO_DE_CANCELAMENTO_ENCERRADO'),
    );
    expect(remarcar(em('2026-03-02T14:00'), { contexto: tarde, ator: 'DONO' }).ok).toBe(true);
  });

  it('RN-16: o novo horário passa pelas regras de criação, exceto RN-17', () => {
    expect(
      remarcar(em('2026-03-02T14:00'), {
        cliente: { ativosFuturos: 99, faltasDesdeDesbloqueio: 0 },
      }).ok,
    ).toBe(true);
    expect(
      remarcar(em('2026-03-02T14:00'), {
        cliente: { ativosFuturos: 0, faltasDesdeDesbloqueio: 3 },
      }),
    ).toMatchObject(erro('CLIENTE_BLOQUEADO'));
    expect(
      remarcar(em('2026-03-02T14:00'), { profissional: { ativo: true, executaServico: false } }),
    ).toMatchObject(erro('PROFISSIONAL_NAO_EXECUTA_SERVICO'));
    expect(remarcar(em('2026-03-02T14:05'))).toMatchObject(erro('HORARIO_FORA_DA_GRADE'));
    expect(remarcar(em('2026-03-02T19:00'))).toMatchObject(erro('FORA_DO_EXPEDIENTE'));
  });

  it('RN-16: só agendamento ativo pode ser remarcado', () => {
    expect(remarcar(INICIO, { agendamento: { ...ag, status: 'CANCELADO' } })).toMatchObject(
      erro('TRANSICAO_DE_STATUS_INVALIDA'),
    );
  });

  it('RN-16 / RN-14: a remarcação usa a cópia do serviço do agendamento', () => {
    const longo = { ...ag, servico: { ...CORTE, duracaoMin: 60 } };
    // 10:00–11:00 encosta no outro (11:00); com 75 min já conflitaria
    expect(remarcar(INICIO, { agendamento: longo }).ok).toBe(true);
    expect(
      remarcar(INICIO, { agendamento: { ...ag, servico: { ...CORTE, duracaoMin: 75 } } }),
    ).toMatchObject(erro('HORARIO_INDISPONIVEL'));
  });
});

describe('RN-17 — limite de agendamentos ativos', () => {
  it('RN-17: cliente no limite não cria outro', () => {
    const r = podeCriar({
      ator: 'CLIENTE',
      cliente: { ativosFuturos: 3, faltasDesdeDesbloqueio: 0 },
      profissional: PROF_OK,
      inicio: INICIO,
      contexto: ctxCriar,
    });
    expect(r).toMatchObject(erro('LIMITE_DE_AGENDAMENTOS'));
    expect(
      podeCriar({
        ator: 'CLIENTE',
        cliente: { ativosFuturos: 2, faltasDesdeDesbloqueio: 0 },
        profissional: PROF_OK,
        inicio: INICIO,
        contexto: ctxCriar,
      }).ok,
    ).toBe(true);
  });

  it('RN-17: ativos = PENDENTE/CONFIRMADO com início futuro', () => {
    const agora = 1_000;
    const ags = [
      { inicio: 2_000, status: 'PENDENTE' as const },
      { inicio: 2_000, status: 'CONFIRMADO' as const },
      { inicio: 2_000, status: 'CANCELADO' as const },
      { inicio: 2_000, status: 'CONCLUIDO' as const },
      { inicio: 500, status: 'CONFIRMADO' as const },
      { inicio: 1_000, status: 'CONFIRMADO' as const },
    ];
    expect(contarAtivosFuturos(ags, agora)).toBe(2);
  });
});

describe('RN-18 — não comparecimento', () => {
  it('RN-18: cliente com limiteFaltas faltas fica bloqueado (e isso vem antes de RN-17)', () => {
    const bloqueado = { ativosFuturos: 5, faltasDesdeDesbloqueio: 3 };
    expect(
      podeCriar({
        ator: 'CLIENTE',
        cliente: bloqueado,
        profissional: PROF_OK,
        inicio: INICIO,
        contexto: ctxCriar,
      }),
    ).toMatchObject(erro('CLIENTE_BLOQUEADO'));
    expect(
      podeCriar({
        ator: 'CLIENTE',
        cliente: { ...LIMPO, faltasDesdeDesbloqueio: 2 },
        profissional: PROF_OK,
        inicio: INICIO,
        contexto: ctxCriar,
      }).ok,
    ).toBe(true);
  });

  it('RN-18: faltas anteriores ao desbloqueio deixam de contar', () => {
    const ags = [
      { inicio: 100, status: 'NAO_COMPARECEU' as const },
      { inicio: 200, status: 'NAO_COMPARECEU' as const },
      { inicio: 300, status: 'NAO_COMPARECEU' as const },
      { inicio: 400, status: 'CONCLUIDO' as const },
    ];
    expect(contarFaltas(ags, null)).toBe(3);
    expect(contarFaltas(ags, 250)).toBe(1);
    expect(contarFaltas(ags, 300)).toBe(1);
  });
});

describe('RN-19 — ciclo de vida', () => {
  const ctx = { ator: 'DONO' as const, agora: INICIO, inicio: INICIO };

  it('RN-19: nasce CONFIRMADO com confirmação automática, senão PENDENTE', () => {
    expect(statusInicial({ confirmacaoAutomatica: true })).toBe('CONFIRMADO');
    expect(statusInicial({ confirmacaoAutomatica: false })).toBe('PENDENTE');
  });

  it('RN-19: transições permitidas e inválidas (matriz completa)', () => {
    const permitidas = new Set([
      'PENDENTE>CONFIRMADO',
      'PENDENTE>CANCELADO',
      'CONFIRMADO>CONCLUIDO',
      'CONFIRMADO>NAO_COMPARECEU',
      'CONFIRMADO>CANCELADO',
    ]);
    for (const de of STATUS_AGENDAMENTO) {
      for (const para of STATUS_AGENDAMENTO) {
        const r = transicionar(de, para, ctx);
        expect(r.ok, `${de}>${para}`).toBe(permitidas.has(`${de}>${para}`));
        if (!r.ok) expect(r.codigo).toBe('TRANSICAO_DE_STATUS_INVALIDA');
      }
    }
    expect(TRANSICOES.CONCLUIDO).toEqual([]);
  });

  it('RN-19: CONCLUIDO e NAO_COMPARECEU antes do início são inválidos', () => {
    expect(transicionar('CONFIRMADO', 'CONCLUIDO', { ...ctx, agora: INICIO - 1 })).toMatchObject(
      erro('TRANSICAO_DE_STATUS_INVALIDA'),
    );
    expect(
      transicionar('CONFIRMADO', 'NAO_COMPARECEU', { ...ctx, agora: INICIO - 1 }),
    ).toMatchObject(erro('TRANSICAO_DE_STATUS_INVALIDA'));
    expect(transicionar('CONFIRMADO', 'CONCLUIDO', ctx)).toEqual({ ok: true, valor: 'CONCLUIDO' });
  });

  it('RN-19: só o estabelecimento marca CONCLUIDO ou NAO_COMPARECEU', () => {
    expect(transicionar('CONFIRMADO', 'CONCLUIDO', { ...ctx, ator: 'CLIENTE' })).toMatchObject(
      erro('ACESSO_NEGADO'),
    );
    expect(transicionar('CONFIRMADO', 'NAO_COMPARECEU', { ...ctx, ator: 'PROFISSIONAL' }).ok).toBe(
      true,
    );
  });
});

describe('RN-20 — balcão (políticas)', () => {
  it('RN-20: estabelecimento ignora RN-09, RN-10, RN-17 e RN-18 ao criar', () => {
    const bloqueado = { ativosFuturos: 99, faltasDesdeDesbloqueio: 99 };
    const agora = em('2026-03-02T09:55');
    expect(
      podeCriar({
        ator: 'DONO',
        cliente: bloqueado,
        profissional: PROF_OK,
        inicio: INICIO,
        contexto: { ...ctxCriar, agora },
      }).ok,
    ).toBe(true);
    expect(
      podeCriar({
        ator: 'PROFISSIONAL',
        profissional: PROF_OK,
        inicio: em('2027-01-04T10:00'),
        contexto: ctxCriar,
      }).ok,
    ).toBe(true);
  });

  it('RN-20: estabelecimento continua sujeito a passado, RN-11, expediente e conflito', () => {
    const agora = em('2026-03-02T10:01');
    expect(
      podeCriar({
        ator: 'DONO',
        profissional: PROF_OK,
        inicio: INICIO,
        contexto: { ...ctxCriar, agora },
      }),
    ).toMatchObject(erro('HORARIO_NO_PASSADO'));
    expect(
      podeCriar({
        ator: 'DONO',
        profissional: { ativo: true, executaServico: false },
        inicio: INICIO,
        contexto: ctxCriar,
      }),
    ).toMatchObject(erro('PROFISSIONAL_NAO_EXECUTA_SERVICO'));
    expect(
      podeCriar({
        ator: 'DONO',
        profissional: PROF_OK,
        inicio: em('2026-03-02T12:00'),
        contexto: ctxCriar,
      }),
    ).toMatchObject(erro('FORA_DO_EXPEDIENTE'));
    const ocupado = { ...ctxCriar, ocupacoes: [blocoDoAtendimento(INICIO, CORTE)] };
    expect(
      podeCriar({ ator: 'DONO', profissional: PROF_OK, inicio: INICIO, contexto: ocupado }),
    ).toMatchObject(erro('HORARIO_INDISPONIVEL'));
  });

  it('RN-18/17/11/07: ordem de checagem na criação pelo cliente', () => {
    const tudoErrado = {
      ator: 'CLIENTE' as const,
      profissional: { ativo: true, executaServico: false },
      inicio: em('2026-03-02T10:05'),
      contexto: ctxCriar,
    };
    expect(
      podeCriar({ ...tudoErrado, cliente: { ativosFuturos: 9, faltasDesdeDesbloqueio: 9 } }),
    ).toMatchObject(erro('CLIENTE_BLOQUEADO'));
    expect(
      podeCriar({ ...tudoErrado, cliente: { ativosFuturos: 9, faltasDesdeDesbloqueio: 0 } }),
    ).toMatchObject(erro('LIMITE_DE_AGENDAMENTOS'));
    expect(podeCriar({ ...tudoErrado, cliente: LIMPO })).toMatchObject(
      erro('PROFISSIONAL_NAO_EXECUTA_SERVICO'),
    );
    expect(podeCriar({ ...tudoErrado, cliente: LIMPO, profissional: PROF_OK })).toMatchObject(
      erro('HORARIO_FORA_DA_GRADE'),
    );
    expect(podeCriar({ ...tudoErrado, profissional: PROF_OK })).toMatchObject(
      erro('DADOS_INVALIDOS'),
    );
  });
});
