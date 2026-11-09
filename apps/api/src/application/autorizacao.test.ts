import { describe, expect, it } from 'vitest';
import {
  type AcaoAgendamento,
  autorizarAgendamento,
  autorizarCliente,
  autorizarPainel,
  estabelecimentoDoPainel,
} from './autorizacao';
import type { AtorHttp } from './portas-app';

const E1 = 'estab-1';
const E2 = 'estab-2';
const dono: AtorHttp = {
  usuarioId: 'u-dono',
  papel: 'DONO',
  estabelecimentoId: E1,
  profissionalId: null,
};
const donoOutro: AtorHttp = { ...dono, usuarioId: 'u-dono2', estabelecimentoId: E2 };
const prof: AtorHttp = {
  usuarioId: 'u-prof',
  papel: 'PROFISSIONAL',
  estabelecimentoId: E1,
  profissionalId: 'p1',
};
const cliente: AtorHttp = {
  usuarioId: 'u-cli',
  papel: 'CLIENTE',
  estabelecimentoId: null,
  profissionalId: null,
};
const outroCliente: AtorHttp = { ...cliente, usuarioId: 'u-cli2' };

const ag = { estabelecimentoId: E1, profissionalId: 'p1', clienteUsuarioId: 'u-cli' };
const doColega = { ...ag, profissionalId: 'p2' };
const codigo = (r: { ok: boolean; codigo?: string }) => (r.ok ? 'OK' : r.codigo);

describe('RN-23 — autorização de agendamento', () => {
  const todas: AcaoAgendamento[] = [
    'VER',
    'HISTORICO',
    'CANCELAR',
    'REMARCAR',
    'CONFIRMAR',
    'CONCLUIR',
    'NAO_COMPARECEU',
  ];

  it('RN-23: cliente vê, cancela e remarca o próprio; confirmar/concluir/faltar → 403', () => {
    expect(todas.map((a) => codigo(autorizarAgendamento(cliente, ag, a)))).toEqual([
      'OK',
      'OK',
      'OK',
      'OK',
      'ACESSO_NEGADO',
      'ACESSO_NEGADO',
      'ACESSO_NEGADO',
    ]);
  });

  it('RN-23: agendamento de outro cliente → 404 em qualquer ação', () => {
    for (const a of todas)
      expect(codigo(autorizarAgendamento(outroCliente, ag, a))).toBe('NAO_ENCONTRADO');
  });

  it('RN-23: dono faz tudo no próprio estabelecimento; de outro estabelecimento → 404', () => {
    for (const a of todas) {
      expect(codigo(autorizarAgendamento(dono, ag, a))).toBe('OK');
      expect(codigo(autorizarAgendamento(donoOutro, ag, a))).toBe('NAO_ENCONTRADO');
    }
  });

  it('RN-23: profissional mexe só na própria agenda; agenda do colega → 403', () => {
    for (const a of todas) {
      expect(codigo(autorizarAgendamento(prof, ag, a))).toBe('OK');
      expect(codigo(autorizarAgendamento(prof, doColega, a))).toBe('ACESSO_NEGADO');
      expect(codigo(autorizarAgendamento(prof, { ...ag, estabelecimentoId: E2 }, a))).toBe(
        'NAO_ENCONTRADO',
      );
    }
  });
});

describe('RN-23 — autorização do painel', () => {
  it('RN-23: cliente não entra no painel (403)', () => {
    expect(codigo(autorizarPainel(cliente, E1))).toBe('ACESSO_NEGADO');
    expect(codigo(estabelecimentoDoPainel(cliente))).toBe('ACESSO_NEGADO');
  });

  it('RN-23: outro estabelecimento → 404; cadastros só do dono → 403 para profissional', () => {
    expect(codigo(autorizarPainel(dono, E2))).toBe('NAO_ENCONTRADO');
    expect(codigo(autorizarPainel(prof, E1, { apenasDono: true }))).toBe('ACESSO_NEGADO');
    expect(codigo(autorizarPainel(dono, E1, { apenasDono: true }))).toBe('OK');
  });

  it('RN-23: profissional só na própria agenda', () => {
    expect(codigo(autorizarPainel(prof, E1, { profissionalId: 'p1' }))).toBe('OK');
    expect(codigo(autorizarPainel(prof, E1, { profissionalId: 'p2' }))).toBe('ACESSO_NEGADO');
    expect(codigo(autorizarPainel(dono, E1, { profissionalId: 'p2' }))).toBe('OK');
  });

  it('RN-23: agendar online é ação de cliente', () => {
    expect(codigo(autorizarCliente(cliente))).toBe('OK');
    expect(codigo(autorizarCliente(dono))).toBe('ACESSO_NEGADO');
  });
});
