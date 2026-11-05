import { describe, expect, it } from 'vitest';
import {
  type CandidatoProfissional,
  escolherProfissional,
  verificarProfissional,
} from './alocacao';

const base: CandidatoProfissional = {
  id: 'p',
  criadoEm: 1_000,
  executaServico: true,
  livre: true,
  agendamentosNoDia: 0,
};

describe('RN-11 — profissional executa o serviço', () => {
  it('RN-11: só profissional ativo que executa o serviço', () => {
    expect(verificarProfissional({ ativo: true, executaServico: true }).ok).toBe(true);
    expect(verificarProfissional({ ativo: true, executaServico: false })).toMatchObject({
      ok: false,
      codigo: 'PROFISSIONAL_NAO_EXECUTA_SERVICO',
    });
    expect(verificarProfissional({ ativo: false, executaServico: true })).toMatchObject({
      ok: false,
      codigo: 'PROFISSIONAL_NAO_EXECUTA_SERVICO',
    });
  });

  it('RN-11: "qualquer profissional" ignora quem não executa, está inativo ou não tem o horário livre', () => {
    expect(
      escolherProfissional([
        { ...base, id: 'nao-executa', executaServico: false },
        { ...base, id: 'inativo', ativo: false },
        { ...base, id: 'ocupado', livre: false },
        { ...base, id: 'ok' },
      ]),
    ).toEqual(['ok']);
    expect(escolherProfissional([])).toEqual([]);
  });
});

describe('RN-12 — qualquer profissional', () => {
  it('RN-12: prefere quem tem menos agendamentos no dia', () => {
    expect(
      escolherProfissional([
        { ...base, id: 'a', agendamentosNoDia: 3, criadoEm: 1 },
        { ...base, id: 'b', agendamentosNoDia: 1, criadoEm: 9 },
        { ...base, id: 'c', agendamentosNoDia: 2, criadoEm: 5 },
      ]),
    ).toEqual(['b', 'c', 'a']);
  });

  it('RN-12: empate por ordem de cadastro (criadoEm, depois id)', () => {
    expect(
      escolherProfissional([
        { ...base, id: 'z', criadoEm: 200 },
        { ...base, id: 'b', criadoEm: 100 },
        { ...base, id: 'a', criadoEm: 100 },
      ]),
    ).toEqual(['a', 'b', 'z']);
  });

  it('RN-12: a ordem de tentativa não depende da ordem de entrada', () => {
    const lista: CandidatoProfissional[] = [
      { ...base, id: 'x', criadoEm: 3, agendamentosNoDia: 1 },
      { ...base, id: 'y', criadoEm: 1, agendamentosNoDia: 1 },
      { ...base, id: 'w', criadoEm: 2, agendamentosNoDia: 0 },
    ];
    expect(escolherProfissional(lista)).toEqual(['w', 'y', 'x']);
    expect(escolherProfissional([...lista].reverse())).toEqual(['w', 'y', 'x']);
  });
});
