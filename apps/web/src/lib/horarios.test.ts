import type { AgendaPainel } from '@agenda/shared';
import { describe, expect, it } from 'vitest';
import { estadoParaUrl, lerEstadoDaUrl } from '../components/reserva/estado';
import { faixaDoDia, naGrade } from './grade-agenda';
import { agruparPorPeriodo, periodoDe, proximoIndice } from './horarios';

const SP = 'America/Sao_Paulo';
const h = (iso: string) => ({ inicio: iso, profissionalIds: ['p1'] });

describe('agrupamento dos horários', () => {
  it('manhã até 11:59, tarde até 17:59, noite depois, no fuso do estabelecimento', () => {
    expect(periodoDe('2026-11-11T14:59:00.000Z', SP)).toBe('manha'); // 11:59
    expect(periodoDe('2026-11-11T15:00:00.000Z', SP)).toBe('tarde'); // 12:00
    expect(periodoDe('2026-11-11T20:59:00.000Z', SP)).toBe('tarde'); // 17:59
    expect(periodoDe('2026-11-11T21:00:00.000Z', SP)).toBe('noite'); // 18:00
    // O mesmo instante é "manhã" em Tóquio: o período depende do fuso, não do navegador.
    expect(periodoDe('2026-11-11T21:00:00.000Z', 'Asia/Tokyo')).toBe('manha');
  });

  it('mantém a ordem da API e omite períodos vazios', () => {
    const lista = [
      h('2026-11-11T12:00:00.000Z'), // 09:00
      h('2026-11-11T12:15:00.000Z'), // 09:15
      h('2026-11-11T21:30:00.000Z'), // 18:30
    ];
    const grupos = agruparPorPeriodo(lista, SP);
    expect(grupos.map((g) => g.periodo)).toEqual(['manha', 'noite']);
    expect(grupos[0]!.horarios.map((x) => x.inicio)).toEqual([lista[0]!.inicio, lista[1]!.inicio]);
    expect(agruparPorPeriodo([], SP)).toEqual([]);
  });

  it('setas na grade de pílulas: uma coluna para os lados, uma linha para cima e para baixo', () => {
    expect(proximoIndice(0, 'ArrowRight', 10, 4)).toBe(1);
    expect(proximoIndice(0, 'ArrowLeft', 10, 4)).toBe(0);
    expect(proximoIndice(1, 'ArrowDown', 10, 4)).toBe(5);
    expect(proximoIndice(8, 'ArrowDown', 10, 4)).toBe(9);
    expect(proximoIndice(5, 'ArrowUp', 10, 4)).toBe(1);
    expect(proximoIndice(5, 'Home', 10, 4)).toBe(0);
    expect(proximoIndice(5, 'End', 10, 4)).toBe(9);
    expect(proximoIndice(5, 'a', 10, 4)).toBeNull();
    expect(proximoIndice(0, 'ArrowRight', 0, 4)).toBeNull();
  });
});

describe('estado do fluxo na URL (volta do login no mesmo passo)', () => {
  it('ida e volta preserva a escolha', () => {
    const estado = {
      servicoId: 's1',
      profissional: 'qualquer',
      data: '2026-11-11',
      inicio: '2026-11-11T13:00:00.000Z',
      passo: 'revisao' as const,
    };
    const url = estadoParaUrl(estado, new URLSearchParams('outro=1'));
    expect(lerEstadoDaUrl(new URLSearchParams(url))).toEqual(estado);
    expect(url).toContain('outro=1');
  });

  it('um passo sem os anteriores cai no passo possível', () => {
    expect(lerEstadoDaUrl(new URLSearchParams('servico=s1&passo=revisao'))?.passo).toBe(
      'profissional',
    );
    expect(lerEstadoDaUrl(new URLSearchParams('servico=s1&prof=p1&passo=revisao'))?.passo).toBe(
      'horario',
    );
    expect(lerEstadoDaUrl(new URLSearchParams('servico=s1&prof=p1&inicio=x'))?.passo).toBe(
      'revisao',
    );
    expect(lerEstadoDaUrl(new URLSearchParams(''))).toBeNull();
  });
});

describe('grade do painel', () => {
  it('faixa do dia em horas cheias, do primeiro expediente ao último bloco', () => {
    const agenda = {
      data: '2026-11-11',
      fuso: SP,
      profissionais: [
        {
          profissional: { id: 'p', nome: 'P', ativo: true },
          expediente: [{ inicio: '2026-11-11T12:30:00.000Z', fim: '2026-11-11T21:00:00.000Z' }], // 09:30–18:00
          agendamentos: [],
          bloqueios: [],
          excecoes: [],
        },
      ],
    } as AgendaPainel;
    expect(faixaDoDia(agenda)).toEqual({ inicio: 9 * 60, fim: 18 * 60 });
    expect(faixaDoDia({ ...agenda, profissionais: [] })).toEqual({ inicio: 8 * 60, fim: 20 * 60 });
  });

  it('seleção encaixa na granularidade', () => {
    expect(naGrade(9 * 60 + 7, 15)).toBe(9 * 60 + 15 - 15);
    expect(naGrade(9 * 60 + 8, 15)).toBe(9 * 60 + 15);
  });
});
