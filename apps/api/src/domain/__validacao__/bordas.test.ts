// Testes do Validador (fase 1): bordas das regras RN-01..RN-20, escritos a partir da especificação.
import { Papel, StatusAgendamento } from '@agenda/shared';
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  type ContextoAgenda,
  atendimento,
  blocoDoAtendimento,
  contarAtivosFuturos,
  contarFaltas,
  contem,
  escolherProfissional,
  expedienteDoDia,
  horariosLivres,
  ocupacoesDosAgendamentos,
  podeCancelar,
  podeCriar,
  podeRemarcar,
  proximosHorariosLivres,
  proximosHorariosLivresDeVarios,
  sobrepoe,
  statusInicial,
  subtrair,
  transicionar,
  unir,
  validarHorario,
  verificarProfissional,
} from '../index';
import {
  HORA,
  JORNADA_ALMOCO,
  KOL,
  LIS,
  MIN,
  NY,
  SP,
  ctx,
  hhmm,
  hhmms,
  jornadaTodoDia,
  politicas,
  servico,
  t,
  tOff,
} from './apoio-validacao';

const SEG = '2026-11-09'; // segunda-feira
const S = StatusAgendamento;

function livres(c: Partial<ContextoAgenda> & { dataLocal?: string } = {}): string[] {
  const base = ctx(c);
  const fuso = base.politicas.fuso;
  return hhmms(horariosLivres({ ...base, dataLocal: c.dataLocal ?? SEG }), fuso);
}

function codigo(c: Partial<ContextoAgenda>, inicio: number): string {
  const r = validarHorario({ ...ctx(c), inicio });
  return r.ok ? 'OK' : r.codigo;
}

function seq(de: string, ate: string, passo: number): string[] {
  const [h1, m1] = de.split(':').map(Number) as [number, number];
  const [h2, m2] = ate.split(':').map(Number) as [number, number];
  const out: string[] = [];
  for (let m = h1 * 60 + m1; m <= h2 * 60 + m2; m += passo) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

describe('V RN-01 intervalos', () => {
  it('RN-01: adjacentes não se sobrepõem; 1 ms de sobreposição sim', () => {
    expect(sobrepoe({ inicio: 0, fim: 10 }, { inicio: 10, fim: 20 })).toBe(false);
    expect(sobrepoe({ inicio: 10, fim: 20 }, { inicio: 0, fim: 10 })).toBe(false);
    expect(sobrepoe({ inicio: 0, fim: 11 }, { inicio: 10, fim: 20 })).toBe(true);
  });

  it('RN-01: degenerados não sobrepõem nem são contidos', () => {
    expect(sobrepoe({ inicio: 5, fim: 5 }, { inicio: 0, fim: 10 })).toBe(false);
    expect(sobrepoe({ inicio: 6, fim: 4 }, { inicio: 0, fim: 10 })).toBe(false);
    expect(contem({ inicio: 0, fim: 10 }, { inicio: 5, fim: 5 })).toBe(false);
    expect(contem({ inicio: 0, fim: 10 }, { inicio: 0, fim: 10 })).toBe(true);
  });

  it('RN-01: listas vazias em unir/subtrair', () => {
    expect(unir([])).toEqual([]);
    expect(subtrair([], [])).toEqual([]);
    expect(subtrair([], [{ inicio: 0, fim: 10 }])).toEqual([]);
    expect(subtrair([{ inicio: 0, fim: 10 }], [])).toEqual([{ inicio: 0, fim: 10 }]);
    expect(subtrair([{ inicio: 0, fim: 10 }], [{ inicio: 0, fim: 10 }])).toEqual([]);
    expect(unir([{ inicio: 3, fim: 3 }])).toEqual([]);
  });

  it('RN-01: subtrair borda com borda deixa pedaços semiabertos corretos', () => {
    expect(subtrair([{ inicio: 0, fim: 30 }], [{ inicio: 10, fim: 20 }])).toEqual([
      { inicio: 0, fim: 10 },
      { inicio: 20, fim: 30 },
    ]);
    expect(
      subtrair(
        [
          { inicio: 0, fim: 10 },
          { inicio: 10, fim: 20 },
        ],
        [{ inicio: 5, fim: 15 }],
      ),
    ).toEqual([
      { inicio: 0, fim: 5 },
      { inicio: 15, fim: 20 },
    ]);
  });

  it('RN-01: ocupação que só encosta não impede (antes e depois)', () => {
    const ocupacoes = [{ inicio: t(`${SEG}T10:00`), fim: t(`${SEG}T10:30`) }];
    const l = livres({ ocupacoes });
    expect(l).toContain('09:30');
    expect(l).toContain('10:30');
    expect(l).not.toContain('09:45');
    expect(l).not.toContain('10:00');
    expect(l).not.toContain('10:15');
  });
});

describe('V RN-03/04 expediente', () => {
  it('RN-03: dia sem trechos não tem horários', () => {
    const jornada = { ...JORNADA_ALMOCO, 1: [] };
    expect(livres({ jornada })).toEqual([]);
  });

  it('RN-04: folga do dia inteiro', () => {
    expect(livres({ excecoes: [{ tipo: 'FOLGA', data: SEG }] })).toEqual([]);
  });

  it('RN-04: folga parcial 10:00–11:00 com serviço de 30 min', () => {
    const l = livres({ excecoes: [{ tipo: 'FOLGA', data: SEG, inicio: '10:00', fim: '11:00' }] });
    expect(l).toEqual([
      ...seq('09:00', '09:30', 15),
      ...seq('11:00', '11:30', 15),
      ...seq('13:00', '17:30', 15),
    ]);
    expect(
      codigo(
        { excecoes: [{ tipo: 'FOLGA', data: SEG, inicio: '10:00', fim: '11:00' }] },
        t(`${SEG}T10:30`),
      ),
    ).toBe('FORA_DO_EXPEDIENTE');
  });

  it('RN-04: feriado vence horário extra', () => {
    const excecoes = [
      { tipo: 'HORARIO_EXTRA' as const, data: SEG, inicio: '19:00', fim: '21:00' },
      { tipo: 'FERIADO' as const, data: SEG },
    ];
    expect(livres({ excecoes })).toEqual([]);
  });

  it('RN-04: folga total vence horário extra', () => {
    const excecoes = [
      { tipo: 'HORARIO_EXTRA' as const, data: SEG, inicio: '19:00', fim: '21:00' },
      { tipo: 'FOLGA' as const, data: SEG },
    ];
    expect(livres({ excecoes })).toEqual([]);
  });

  it('RN-04: folga parcial dentro do horário extra o recorta', () => {
    const excecoes = [
      { tipo: 'HORARIO_EXTRA' as const, data: SEG, inicio: '19:00', fim: '21:00' },
      { tipo: 'FOLGA' as const, data: SEG, inicio: '19:30', fim: '20:00' },
    ];
    const l = livres({ excecoes, jornada: jornadaTodoDia([]) });
    expect(l).toEqual(['19:00', '20:00', '20:15', '20:30']);
  });

  it('RN-04: horário extra num dia sem jornada', () => {
    const excecoes = [{ tipo: 'HORARIO_EXTRA' as const, data: SEG, inicio: '08:00', fim: '09:00' }];
    expect(livres({ excecoes, jornada: jornadaTodoDia([]) })).toEqual(['08:00', '08:15', '08:30']);
  });

  it('RN-04: horário extra colado no fim da jornada forma um trecho contínuo', () => {
    const excecoes = [{ tipo: 'HORARIO_EXTRA' as const, data: SEG, inicio: '18:00', fim: '19:00' }];
    const l = livres({ excecoes, servico: servico({ duracaoMin: 60 }) });
    expect(l).toContain('17:30');
    expect(l).toContain('18:00');
    expect(l).not.toContain('18:15');
  });

  it('RN-04: exceção de outra data não afeta o dia', () => {
    expect(livres({ excecoes: [{ tipo: 'FERIADO', data: '2026-11-10' }] })).toHaveLength(
      livres().length,
    );
  });

  it('RN-04: expedienteDoDia com feriado + extra é vazio; com extra somado é a união', () => {
    expect(
      expedienteDoDia(
        JORNADA_ALMOCO,
        [
          { tipo: 'FERIADO', data: SEG },
          { tipo: 'HORARIO_EXTRA', data: SEG, inicio: '12:00', fim: '13:00' },
        ],
        SEG,
        SP,
      ),
    ).toEqual([]);
    expect(
      expedienteDoDia(
        JORNADA_ALMOCO,
        [{ tipo: 'HORARIO_EXTRA', data: SEG, inicio: '12:00', fim: '13:00' }],
        SEG,
        SP,
      ),
    ).toEqual([{ inicio: t(`${SEG}T09:00`), fim: t(`${SEG}T18:00`) }]);
  });
});

describe('V RN-05/06 bloqueios e ocupações', () => {
  it('RN-05: bloqueio parcialmente sobreposto 11:00–11:40', () => {
    const bloqueios = [{ inicio: t(`${SEG}T11:00`), fim: t(`${SEG}T11:40`) }];
    const l = livres({ bloqueios });
    expect(l).toContain('10:30');
    expect(l).not.toContain('10:45');
    expect(l).not.toContain('11:15');
    // 11:45 + 30 = 12:15 > 12:00 → fora pelo almoço; nada da manhã depois do bloqueio
    expect(l.filter((h) => h > '11:00' && h < '12:00')).toEqual([]);
    expect(codigo({ bloqueios }, t(`${SEG}T11:15`))).toBe('HORARIO_INDISPONIVEL');
  });

  it('RN-05: bloqueio que termina 11:40 com serviço de 15 min: 11:45 livre; com preparo de 10, não', () => {
    const bloqueios = [{ inicio: t(`${SEG}T11:00`), fim: t(`${SEG}T11:40`) }];
    expect(livres({ bloqueios, servico: servico({ duracaoMin: 15 }) })).toContain('11:45');
    expect(
      codigo(
        { bloqueios, servico: servico({ duracaoMin: 15, preparoMin: 10 }) },
        t(`${SEG}T11:45`),
      ),
    ).toBe('HORARIO_INDISPONIVEL');
  });

  it('RN-05 + D-11.11: bloqueio fora do expediente dá FORA_DO_EXPEDIENTE (expediente antes de conflito)', () => {
    const bloqueios = [{ inicio: t(`${SEG}T19:00`), fim: t(`${SEG}T20:00`) }];
    expect(codigo({ bloqueios }, t(`${SEG}T19:00`))).toBe('FORA_DO_EXPEDIENTE');
  });

  it('RN-06: todos os status exceto CANCELADO ocupam', () => {
    const svc = { duracaoMin: 30, preparoMin: 5, limpezaMin: 5 };
    const inicio = t(`${SEG}T10:00`);
    for (const status of [S.PENDENTE, S.CONFIRMADO, S.CONCLUIDO, S.NAO_COMPARECEU]) {
      expect(ocupacoesDosAgendamentos([{ inicio, status, servico: svc }])).toEqual([
        { inicio: inicio - 5 * MIN, fim: inicio + 35 * MIN },
      ]);
    }
    expect(ocupacoesDosAgendamentos([{ inicio, status: S.CANCELADO, servico: svc }])).toEqual([]);
  });

  it('RN-06: blocos com preparo/limpeza só encostando são aceitos', () => {
    const svc = servico({ duracaoMin: 30, preparoMin: 10, limpezaMin: 10 });
    const ocupacoes = [blocoDoAtendimento(t(`${SEG}T10:00`), svc)]; // 09:50–10:40
    expect(
      codigo({ servico: servico({ duracaoMin: 30, preparoMin: 5 }), ocupacoes }, t(`${SEG}T10:45`)),
    ).toBe('OK');
    expect(
      codigo({ servico: servico({ duracaoMin: 30, preparoMin: 6 }), ocupacoes }, t(`${SEG}T10:45`)),
    ).toBe('HORARIO_INDISPONIVEL');
    // termina encostando no preparo do existente: 09:15 + 30 + limpeza 5 = 09:50
    expect(
      codigo({ servico: servico({ duracaoMin: 30, limpezaMin: 5 }), ocupacoes }, t(`${SEG}T09:15`)),
    ).toBe('OK');
    expect(
      codigo({ servico: servico({ duracaoMin: 30, limpezaMin: 6 }), ocupacoes }, t(`${SEG}T09:15`)),
    ).toBe('HORARIO_INDISPONIVEL');
  });
});

describe('V RN-07/08 grade, preparo, limpeza, tamanho', () => {
  it('RN-07: lista exata segunda 09–12/13–18, serviço 30, grade 15', () => {
    expect(livres()).toEqual([...seq('09:00', '11:30', 15), ...seq('13:00', '17:30', 15)]);
  });

  it('RN-07/08: serviço atravessando o almoço não é oferecido', () => {
    expect(livres()).not.toContain('11:45');
    expect(codigo({}, t(`${SEG}T11:45`))).toBe('FORA_DO_EXPEDIENTE');
  });

  it('RN-08: 45 min com 30 min restantes no trecho', () => {
    const l = livres({ servico: servico({ duracaoMin: 45 }) });
    expect(l).toContain('11:15');
    expect(l).not.toContain('11:30');
    expect(l).toContain('17:15');
    expect(l).not.toContain('17:30');
  });

  it('RN-08: serviço maior que qualquer trecho → nada', () => {
    expect(livres({ servico: servico({ duracaoMin: 301 }) })).toEqual([]);
    expect(livres({ servico: servico({ duracaoMin: 300 }) })).toEqual(['13:00']);
  });

  it('D-03: preparo antes da abertura e limpeza após o fechamento', () => {
    const l = livres({ servico: servico({ duracaoMin: 30, preparoMin: 10, limpezaMin: 10 }) });
    expect(l[0]).toBe('09:15');
    expect(l).toContain('11:15');
    expect(l).not.toContain('11:30');
    expect(l).toContain('13:15');
    expect(l[l.length - 1]).toBe('17:15');
    expect(codigo({ servico: servico({ preparoMin: 10 }) }, t(`${SEG}T09:00`))).toBe(
      'FORA_DO_EXPEDIENTE',
    );
    expect(codigo({ servico: servico({ limpezaMin: 1 }) }, t(`${SEG}T17:30`))).toBe(
      'FORA_DO_EXPEDIENTE',
    );
  });

  it('RN-07: início fora da grade (minuto, segundo, milissegundo)', () => {
    expect(codigo({}, t(`${SEG}T09:05`))).toBe('HORARIO_FORA_DA_GRADE');
    expect(codigo({}, t(`${SEG}T09:00`) + 1)).toBe('HORARIO_FORA_DA_GRADE');
    expect(codigo({}, t(`${SEG}T09:00`) + 1000)).toBe('HORARIO_FORA_DA_GRADE');
    expect(codigo({}, t(`${SEG}T09:15`))).toBe('OK');
  });

  it.each([5, 10, 15, 20, 30, 45, 60])(
    'RN-07: granularidade %i alinhada à meia-noite local',
    (g) => {
      const jornada = jornadaTodoDia([{ inicio: '09:00', fim: '18:00' }]);
      const l = livres({ jornada, politicas: politicas({ granularidadeMin: g }) });
      const esperado: string[] = [];
      for (let m = 0; m < 1440; m += g)
        if (m >= 540 && m + 30 <= 1080) esperado.push(seq('00:00', '23:59', 1)[m]!);
      expect(l).toEqual(esperado);
    },
  );

  it('RN-07: granularidade 7 (não divide 60) alinhada à meia-noite: 1º início 09:06', () => {
    const jornada = jornadaTodoDia([{ inicio: '09:00', fim: '18:00' }]);
    const l = livres({ jornada, politicas: politicas({ granularidadeMin: 7 }) });
    expect(l[0]).toBe('09:06');
    expect(
      codigo({ jornada, politicas: politicas({ granularidadeMin: 7 }) }, t(`${SEG}T09:00`)),
    ).toBe('HORARIO_FORA_DA_GRADE');
  });

  it('RN-07: grade no fuso Asia/Kolkata (+05:30)', () => {
    const l = livres({ politicas: politicas({ fuso: KOL }), agora: t('2026-11-02T08:00', KOL) });
    expect(l[0]).toBe('09:00');
    expect(
      codigo(
        { politicas: politicas({ fuso: KOL }), agora: t('2026-11-02T08:00', KOL) },
        t(`${SEG}T09:00`, KOL),
      ),
    ).toBe('OK');
    // 09:00 UTC-aligned (= 14:30 Kolkata) está na grade local; 09:00Z+15min... 14:45 também
    expect(
      codigo(
        { politicas: politicas({ fuso: KOL }), agora: t('2026-11-02T08:00', KOL) },
        t(`${SEG}T14:30`, KOL),
      ),
    ).toBe('OK');
  });

  it('RN-07: data local inválida → lista vazia', () => {
    expect(livres({ dataLocal: '2026-02-30' })).toEqual([]);
    expect(livres({ dataLocal: '2026-13-01' })).toEqual([]);
  });
});

describe('V RN-09 antecedência', () => {
  const D = SEG;
  it('RN-09: exatamente no limite é aceito; 1 ms depois não', () => {
    const agora = t(`${D}T07:00`);
    expect(livres({ agora })[0]).toBe('09:00');
    expect(codigo({ agora }, t(`${D}T09:00`))).toBe('OK');
    expect(livres({ agora: agora + 1 })[0]).toBe('09:15');
    expect(codigo({ agora: agora + 1 }, t(`${D}T09:00`))).toBe('ANTECEDENCIA_MINIMA');
  });

  it('RN-09: agora com milissegundos', () => {
    const agora = t(`${D}T07:13:27.512`);
    expect(livres({ agora })[0]).toBe('09:15');
  });

  it('RN-09: passado nunca é oferecido (antecedência 0)', () => {
    const p = politicas({ antecedenciaMinimaMin: 0 });
    const agora = t(`${D}T15:00`);
    expect(livres({ agora, politicas: p })[0]).toBe('15:00');
    expect(codigo({ agora, politicas: p }, t(`${D}T14:45`))).toBe('ANTECEDENCIA_MINIMA');
    expect(codigo({ agora: agora + 1, politicas: p }, t(`${D}T15:00`))).toBe('ANTECEDENCIA_MINIMA');
  });
});

describe('V RN-10 horizonte', () => {
  it('RN-10: último dia aberto inteiro e o seguinte fechado, agora 23:59:59.999 local', () => {
    const p = politicas({ horizonteDias: 7 });
    const agora = t('2026-11-02T23:59:59.999');
    expect(livres({ agora, politicas: p, dataLocal: '2026-11-09' })).toHaveLength(livres().length);
    expect(livres({ agora, politicas: p, dataLocal: '2026-11-10' })).toEqual([]);
    expect(codigo({ agora, politicas: p }, t('2026-11-10T09:00'))).toBe('ALEM_DO_HORIZONTE');
    expect(codigo({ agora: t('2026-11-03T00:00'), politicas: p }, t('2026-11-10T09:00'))).toBe(
      'OK',
    );
  });

  it('RN-10: Sao_Paulo 22:00 (UTC já é o dia seguinte) — usa data local', () => {
    const p = politicas({ horizonteDias: 7 });
    const agora = t('2026-11-02T22:00'); // 01:00Z de 03/11
    expect(codigo({ agora, politicas: p }, t('2026-11-10T09:00'))).toBe('ALEM_DO_HORIZONTE');
    expect(codigo({ agora, politicas: p }, t('2026-11-09T17:30'))).toBe('OK');
  });

  it('RN-10: Asia/Kolkata 00:10 (UTC ainda é o dia anterior) — usa data local', () => {
    const p = politicas({ horizonteDias: 7, fuso: KOL });
    const agora = t('2026-11-03T00:10', KOL); // 18:40Z de 02/11
    expect(codigo({ agora, politicas: p }, t('2026-11-10T09:00', KOL))).toBe('OK');
    expect(codigo({ agora, politicas: p }, t('2026-11-11T09:00', KOL))).toBe('ALEM_DO_HORIZONTE');
    const agora2 = t('2026-11-02T23:59', KOL);
    expect(codigo({ agora: agora2, politicas: p }, t('2026-11-09T17:30', KOL))).toBe('OK');
    expect(codigo({ agora: agora2, politicas: p }, t('2026-11-10T09:00', KOL))).toBe(
      'ALEM_DO_HORIZONTE',
    );
  });

  it('RN-10: virada de ano', () => {
    const p = politicas({ horizonteDias: 1, antecedenciaMinimaMin: 0 });
    const agora = t('2026-12-31T22:00');
    expect(livres({ agora, politicas: p, dataLocal: '2027-01-01' })).toHaveLength(livres().length);
    expect(livres({ agora, politicas: p, dataLocal: '2027-01-02' })).toEqual([]);
  });

  it('RN-10: virada de mês (31/01 → 01/02)', () => {
    const p = politicas({ horizonteDias: 1, antecedenciaMinimaMin: 0 });
    const agora = t('2027-01-31T23:30');
    expect(livres({ agora, politicas: p, dataLocal: '2027-02-01' })).toHaveLength(livres().length);
    expect(livres({ agora, politicas: p, dataLocal: '2027-02-02' })).toEqual([]);
  });

  it('RN-10: horizonte 0 só hoje', () => {
    const p = politicas({ horizonteDias: 0, antecedenciaMinimaMin: 0 });
    const agora = t(`${SEG}T00:00`);
    expect(livres({ agora, politicas: p })).toHaveLength(livres().length);
    expect(livres({ agora, politicas: p, dataLocal: '2026-11-10' })).toEqual([]);
  });

  it('RN-10: horizonte atravessando a mudança de DST (NY, março)', () => {
    const p = politicas({ horizonteDias: 2, fuso: NY, antecedenciaMinimaMin: 0 });
    const agora = t('2027-03-13T23:30', NY);
    expect(livres({ agora, politicas: p, dataLocal: '2027-03-15' })).toHaveLength(livres().length);
    expect(livres({ agora, politicas: p, dataLocal: '2027-03-16' })).toEqual([]);
  });
});

describe('V RN-02 DST e fusos', () => {
  const svc30 = servico({ duracaoMin: 30 });
  const g30 = (fuso: string) => politicas({ granularidadeMin: 30, fuso, antecedenciaMinimaMin: 0 });

  it('RN-02: NY março — horários inexistentes descartados, duração real', () => {
    const jornada = jornadaTodoDia([{ inicio: '00:00', fim: '05:00' }]);
    const agora = t('2027-03-01T00:00', NY);
    const l = livres({
      jornada,
      servico: svc30,
      politicas: g30(NY),
      agora,
      dataLocal: '2027-03-14',
    });
    expect(l).toEqual(['00:00', '00:30', '01:00', '01:30', '03:00', '03:30', '04:00', '04:30']);
    const l60 = livres({
      jornada,
      servico: servico({ duracaoMin: 60 }),
      politicas: g30(NY),
      agora,
      dataLocal: '2027-03-14',
    });
    expect(l60).toEqual(['00:00', '00:30', '01:00', '01:30', '03:00', '03:30', '04:00']);
    const inicio = t('2027-03-14T01:30', NY);
    expect(atendimento(inicio, { duracaoMin: 60 }).fim - inicio).toBe(60 * MIN);
    expect(hhmm(atendimento(inicio, { duracaoMin: 60 }).fim, NY)).toBe('03:30');
  });

  it('RN-02 + D-11.3: trecho com borda inexistente (02:30–05:00) começa às 03:00', () => {
    const jornada = jornadaTodoDia([{ inicio: '02:30', fim: '05:00' }]);
    const l = livres({
      jornada,
      servico: svc30,
      politicas: g30(NY),
      agora: t('2027-03-01T00:00', NY),
      dataLocal: '2027-03-14',
    });
    expect(l).toEqual(['03:00', '03:30', '04:00', '04:30']);
  });

  it('RN-02 + D-11.2: NY novembro — 1ª ocorrência na grade, 2ª fora', () => {
    const jornada = jornadaTodoDia([{ inicio: '00:00', fim: '03:00' }]);
    const c = { jornada, servico: svc30, politicas: g30(NY), agora: t('2027-11-01T00:00', NY) };
    const ms = horariosLivres({ ...ctx(c), dataLocal: '2027-11-07' });
    expect(hhmms(ms, NY)).toEqual(['00:00', '00:30', '01:00', '01:30', '02:00', '02:30']);
    expect(ms[2]).toBe(tOff('2027-11-07T01:00-04:00'));
    expect(codigo(c, tOff('2027-11-07T01:00-05:00'))).toBe('HORARIO_FORA_DA_GRADE');
    // expediente real tem 4 h
    const exp = expedienteDoDia(jornada, [], '2027-11-07', NY);
    expect(exp).toEqual([
      { inicio: tOff('2027-11-07T00:00-04:00'), fim: tOff('2027-11-07T03:00-05:00') },
    ]);
  });

  it('RN-02: NY novembro — serviço de 120 min atravessando a volta dura 120 min reais', () => {
    const jornada = jornadaTodoDia([{ inicio: '00:00', fim: '03:00' }]);
    const c = {
      jornada,
      servico: servico({ duracaoMin: 120 }),
      politicas: g30(NY),
      agora: t('2027-11-01T00:00', NY),
    };
    // 00:30 EDT + 120 min = 01:30 EST, cabe (fim 03:00 EST)
    const l = livres({ ...c, dataLocal: '2027-11-07' });
    expect(l).toEqual(['00:00', '00:30', '01:00', '01:30']);
    const inicio = tOff('2027-11-07T00:30-04:00');
    expect(hhmm(atendimento(inicio, { duracaoMin: 120 }).fim, NY)).toBe('01:30');
  });

  it('RN-02: Lisboa março (01:xx não existe)', () => {
    const jornada = jornadaTodoDia([{ inicio: '00:00', fim: '03:00' }]);
    const l = livres({
      jornada,
      servico: svc30,
      politicas: g30(LIS),
      agora: t('2027-03-01T00:00', LIS),
      dataLocal: '2027-03-28',
    });
    expect(l).toEqual(['00:00', '00:30', '02:00', '02:30']);
  });

  it('RN-02: Lisboa outubro (01:xx se repete)', () => {
    const jornada = jornadaTodoDia([{ inicio: '00:00', fim: '03:00' }]);
    const c = { jornada, servico: svc30, politicas: g30(LIS), agora: t('2027-10-01T00:00', LIS) };
    const ms = horariosLivres({ ...ctx(c), dataLocal: '2027-10-31' });
    expect(hhmms(ms, LIS)).toEqual(['00:00', '00:30', '01:00', '01:30', '02:00', '02:30']);
    expect(ms[2]).toBe(tOff('2027-10-31T01:00+01:00'));
    expect(codigo(c, tOff('2027-10-31T01:00+00:00'))).toBe('HORARIO_FORA_DA_GRADE');
  });

  it('RN-02: dia comum em NY tem 9 h de expediente 09–18', () => {
    const exp = expedienteDoDia(
      jornadaTodoDia([{ inicio: '09:00', fim: '18:00' }]),
      [],
      '2027-03-15',
      NY,
    );
    expect(exp[0]!.fim - exp[0]!.inicio).toBe(9 * HORA);
  });
});

describe('V RN-11/12 alocação', () => {
  it('RN-11: inativo ou que não executa → PROFISSIONAL_NAO_EXECUTA_SERVICO', () => {
    expect(verificarProfissional({ ativo: false, executaServico: true })).toMatchObject({
      codigo: 'PROFISSIONAL_NAO_EXECUTA_SERVICO',
    });
    expect(verificarProfissional({ ativo: true, executaServico: false })).toMatchObject({
      codigo: 'PROFISSIONAL_NAO_EXECUTA_SERVICO',
    });
    expect(verificarProfissional({ ativo: true, executaServico: true }).ok).toBe(true);
  });

  it('RN-12: menos agendamentos, depois criadoEm, depois id; inativos/ocupados/não executa fora', () => {
    const base = { executaServico: true, livre: true };
    const ordem = escolherProfissional([
      { ...base, id: 'z', criadoEm: 1, agendamentosNoDia: 2 },
      { ...base, id: 'b', criadoEm: 5, agendamentosNoDia: 1 },
      { ...base, id: 'a', criadoEm: 5, agendamentosNoDia: 1 },
      { ...base, id: 'c', criadoEm: 3, agendamentosNoDia: 1 },
      { ...base, id: 'inativo', criadoEm: 0, agendamentosNoDia: 0, ativo: false },
      { ...base, id: 'ocupado', criadoEm: 0, agendamentosNoDia: 0, livre: false },
      { ...base, id: 'naoexec', criadoEm: 0, agendamentosNoDia: 0, executaServico: false },
    ]);
    expect(ordem).toEqual(['c', 'a', 'b', 'z']);
    expect(escolherProfissional([])).toEqual([]);
  });

  it('RN-12: qualquer profissional une horários sem repetir', () => {
    const c1 = ctx({ jornada: jornadaTodoDia([{ inicio: '09:00', fim: '10:00' }]) });
    const c2 = ctx({ jornada: jornadaTodoDia([{ inicio: '09:30', fim: '11:00' }]) });
    const r = proximosHorariosLivresDeVarios([c1, c2], t(`${SEG}T00:00`), 6);
    expect(hhmms(r)).toEqual(['09:00', '09:15', '09:30', '09:45', '10:00', '10:15']);
  });
});

describe('V RN-13 próximos horários', () => {
  it('RN-13: a partir de 11:50 com ms → após o almoço', () => {
    const r = proximosHorariosLivres(ctx(), t(`${SEG}T11:50:00.123`), 5);
    expect(hhmms(r)).toEqual(['13:00', '13:15', '13:30', '13:45', '14:00']);
  });
  it('RN-13: atravessa para o dia seguinte; n=0 vazio; diasMax 0 corta', () => {
    const r = proximosHorariosLivres(ctx(), t(`${SEG}T17:20`), 3);
    expect(hhmms(r)).toEqual(['17:30', '09:00', '09:15']);
    expect(proximosHorariosLivres(ctx(), t(`${SEG}T17:20`), 0)).toEqual([]);
    expect(hhmms(proximosHorariosLivres(ctx(), t(`${SEG}T17:20`), 5, 0))).toEqual(['17:30']);
  });
});

describe('V RN-14 cópia do serviço', () => {
  it('RN-14: bloco do agendamento usa a cópia, não o serviço editado', () => {
    const copia = { duracaoMin: 60, preparoMin: 10, limpezaMin: 10 };
    const oc = ocupacoesDosAgendamentos([
      { inicio: t(`${SEG}T10:00`), status: S.CONFIRMADO, servico: copia },
    ]);
    expect(oc).toEqual([{ inicio: t(`${SEG}T09:50`), fim: t(`${SEG}T11:10`) }]);
    // serviço editado para 15 min: 11:00 continua indisponível (bloco até 11:10)
    expect(codigo({ ocupacoes: oc, servico: servico({ duracaoMin: 15 }) }, t(`${SEG}T11:00`))).toBe(
      'HORARIO_INDISPONIVEL',
    );
  });

  it('RN-14/16: remarcação usa a cópia do agendamento mesmo se o contexto trouxer outro serviço', () => {
    const agendamento = {
      inicio: t(`${SEG}T09:00`),
      status: S.CONFIRMADO,
      servico: servico({ duracaoMin: 60 }),
    };
    const contexto = { ...ctx(), servico: servico({ duracaoMin: 15 }) };
    const r = podeRemarcar({
      agendamento,
      novoInicio: t(`${SEG}T11:15`),
      ator: Papel.DONO,
      profissional: { ativo: true, executaServico: true },
      contexto,
    });
    expect(r).toMatchObject({ ok: false, codigo: 'FORA_DO_EXPEDIENTE' });
  });
});

describe('V RN-15 cancelamento', () => {
  const p = politicas();
  const inicio = t(`${SEG}T14:00`);
  it('RN-15: prazo exato aceito, 1 ms depois recusado ao cliente', () => {
    expect(
      podeCancelar({
        agendamento: { inicio, status: S.CONFIRMADO },
        ator: Papel.CLIENTE,
        agora: inicio - 4 * HORA,
        politicas: p,
      }).ok,
    ).toBe(true);
    expect(
      podeCancelar({
        agendamento: { inicio, status: S.CONFIRMADO },
        ator: Papel.CLIENTE,
        agora: inicio - 4 * HORA + 1,
        politicas: p,
      }),
    ).toMatchObject({ codigo: 'PRAZO_DE_CANCELAMENTO_ENCERRADO' });
  });
  it('RN-15: estabelecimento cancela depois do prazo; PENDENTE cancelável', () => {
    for (const ator of [Papel.DONO, Papel.PROFISSIONAL]) {
      expect(
        podeCancelar({
          agendamento: { inicio, status: S.PENDENTE },
          ator,
          agora: inicio - 1,
          politicas: p,
        }).ok,
      ).toBe(true);
    }
  });
  it('RN-15 + D-11.6: status final não cancela (nem pelo dono)', () => {
    for (const status of [S.CANCELADO, S.CONCLUIDO, S.NAO_COMPARECEU]) {
      expect(
        podeCancelar({ agendamento: { inicio, status }, ator: Papel.DONO, agora: 0, politicas: p }),
      ).toMatchObject({
        codigo: 'TRANSICAO_DE_STATUS_INVALIDA',
      });
    }
  });
});

describe('V RN-16 remarcação', () => {
  const svc = servico({ duracaoMin: 30, preparoMin: 5, limpezaMin: 5 });
  const antigo = t(`${SEG}T10:00`);
  const ag: { inicio: number; status: StatusAgendamento; servico: typeof svc } = {
    inicio: antigo,
    status: S.CONFIRMADO,
    servico: svc,
  };
  const prof = { ativo: true, executaServico: true };
  const cli = { ativosFuturos: 0, faltasDesdeDesbloqueio: 0 };
  const contexto = (o: Partial<ContextoAgenda> = {}) => ctx(o);

  it('RN-16: mesmo horário e sobreposto ao antigo são aceitos (ocupações sem o próprio)', () => {
    expect(
      podeRemarcar({
        agendamento: ag,
        novoInicio: antigo,
        ator: Papel.CLIENTE,
        cliente: cli,
        profissional: prof,
        contexto: contexto(),
      }).ok,
    ).toBe(true);
    expect(
      podeRemarcar({
        agendamento: ag,
        novoInicio: antigo + 15 * MIN,
        ator: Papel.CLIENTE,
        cliente: cli,
        profissional: prof,
        contexto: contexto(),
      }).ok,
    ).toBe(true);
  });

  it('RN-16: sobreposto ao antigo mas com outro conflito → HORARIO_INDISPONIVEL', () => {
    const outro = blocoDoAtendimento(t(`${SEG}T10:45`), svc); // 10:40–11:20
    const r = podeRemarcar({
      agendamento: ag,
      novoInicio: t(`${SEG}T10:15`),
      ator: Papel.CLIENTE,
      cliente: cli,
      profissional: prof,
      contexto: contexto({ ocupacoes: [outro] }),
    });
    expect(r).toMatchObject({ codigo: 'HORARIO_INDISPONIVEL' });
  });

  it('RN-16: cliente no limite de RN-17 remarca; bloqueado (RN-18) não', () => {
    expect(
      podeRemarcar({
        agendamento: ag,
        novoInicio: t(`${SEG}T13:15`),
        ator: Papel.CLIENTE,
        cliente: { ativosFuturos: 99, faltasDesdeDesbloqueio: 0 },
        profissional: prof,
        contexto: contexto(),
      }).ok,
    ).toBe(true);
    expect(
      podeRemarcar({
        agendamento: ag,
        novoInicio: t(`${SEG}T13:15`),
        ator: Papel.CLIENTE,
        cliente: { ativosFuturos: 0, faltasDesdeDesbloqueio: 3 },
        profissional: prof,
        contexto: contexto(),
      }),
    ).toMatchObject({ codigo: 'CLIENTE_BLOQUEADO' });
  });

  it('RN-16: prazo do RN-15 sobre o início antigo (exato aceito, +1 ms recusado)', () => {
    const r1 = podeRemarcar({
      agendamento: ag,
      novoInicio: t(`${SEG}T15:00`),
      ator: Papel.CLIENTE,
      cliente: cli,
      profissional: prof,
      contexto: contexto({
        agora: antigo - 4 * HORA,
        politicas: politicas({ antecedenciaMinimaMin: 0 }),
      }),
    });
    expect(r1.ok).toBe(true);
    const r2 = podeRemarcar({
      agendamento: ag,
      novoInicio: t(`${SEG}T15:00`),
      ator: Papel.CLIENTE,
      cliente: cli,
      profissional: prof,
      contexto: contexto({
        agora: antigo - 4 * HORA + 1,
        politicas: politicas({ antecedenciaMinimaMin: 0 }),
      }),
    });
    expect(r2).toMatchObject({ codigo: 'PRAZO_DE_CANCELAMENTO_ENCERRADO' });
  });

  it('RN-16 + D-11.8: ordem status → RN-18 → prazo → RN-11 → horário', () => {
    const tarde = contexto({ agora: antigo - HORA });
    const fora = t(`${SEG}T09:05`);
    const bloqueado = { ativosFuturos: 0, faltasDesdeDesbloqueio: 3 };
    const inativo = { ativo: false, executaServico: true };
    const r = (a: typeof ag, c: typeof cli, p: typeof prof, cx: ContextoAgenda) =>
      podeRemarcar({
        agendamento: a,
        novoInicio: fora,
        ator: Papel.CLIENTE,
        cliente: c,
        profissional: p,
        contexto: cx,
      });
    expect(r({ ...ag, status: S.CANCELADO }, bloqueado, inativo, tarde)).toMatchObject({
      codigo: 'TRANSICAO_DE_STATUS_INVALIDA',
    });
    expect(r(ag, bloqueado, inativo, tarde)).toMatchObject({ codigo: 'CLIENTE_BLOQUEADO' });
    expect(r(ag, cli, inativo, tarde)).toMatchObject({ codigo: 'PRAZO_DE_CANCELAMENTO_ENCERRADO' });
    expect(r(ag, cli, inativo, contexto())).toMatchObject({
      codigo: 'PROFISSIONAL_NAO_EXECUTA_SERVICO',
    });
    expect(r(ag, cli, prof, contexto())).toMatchObject({ codigo: 'HORARIO_FORA_DA_GRADE' });
  });

  it('RN-16 + RN-20: estabelecimento remarca depois do prazo, sem antecedência, mas não para o passado', () => {
    const agora = antigo - 30 * MIN; // 09:30
    const cx = contexto({ agora });
    expect(
      podeRemarcar({
        agendamento: ag,
        novoInicio: t(`${SEG}T09:30`),
        ator: Papel.PROFISSIONAL,
        profissional: prof,
        contexto: cx,
      }).ok,
    ).toBe(true);
    expect(
      podeRemarcar({
        agendamento: ag,
        novoInicio: t(`${SEG}T09:15`),
        ator: Papel.DONO,
        profissional: prof,
        contexto: cx,
      }),
    ).toMatchObject({ codigo: 'HORARIO_NO_PASSADO' });
  });
});

describe('V RN-17/18 limites do cliente', () => {
  const prof = { ativo: true, executaServico: true };
  const cx = ctx();
  const ini = t(`${SEG}T09:00`);
  const criar = (
    cliente: { ativosFuturos: number; faltasDesdeDesbloqueio: number },
    ator: Papel = Papel.CLIENTE,
  ) => podeCriar({ ator, cliente, profissional: prof, inicio: ini, contexto: cx });

  it('RN-17: limite − 1 cria; limite não', () => {
    expect(criar({ ativosFuturos: 2, faltasDesdeDesbloqueio: 0 }).ok).toBe(true);
    expect(criar({ ativosFuturos: 3, faltasDesdeDesbloqueio: 0 })).toMatchObject({
      codigo: 'LIMITE_DE_AGENDAMENTOS',
    });
  });

  it('RN-17 + D-11.10: contagem de ativos futuros (início == agora não conta)', () => {
    const agora = 1_000_000;
    const ags = [
      { inicio: agora, status: S.CONFIRMADO },
      { inicio: agora + 1, status: S.CONFIRMADO },
      { inicio: agora + 1, status: S.PENDENTE },
      { inicio: agora + 1, status: S.CANCELADO },
      { inicio: agora + 1, status: S.CONCLUIDO },
      { inicio: agora + 1, status: S.NAO_COMPARECEU },
      { inicio: agora - 1, status: S.PENDENTE },
    ];
    expect(contarAtivosFuturos(ags, agora)).toBe(2);
    expect(contarAtivosFuturos([], agora)).toBe(0);
  });

  it('RN-18: limite − 1 cria; limite bloqueia, antes de RN-17', () => {
    expect(criar({ ativosFuturos: 0, faltasDesdeDesbloqueio: 2 }).ok).toBe(true);
    expect(criar({ ativosFuturos: 3, faltasDesdeDesbloqueio: 3 })).toMatchObject({
      codigo: 'CLIENTE_BLOQUEADO',
    });
  });

  it('RN-18 + D-11.9: faltas anteriores ao desbloqueio não contam', () => {
    const d = 5_000;
    const ags = [
      { inicio: d - 1, status: S.NAO_COMPARECEU },
      { inicio: d, status: S.NAO_COMPARECEU },
      { inicio: d + 1, status: S.NAO_COMPARECEU },
      { inicio: d + 1, status: S.CONCLUIDO },
    ];
    expect(contarFaltas(ags, d)).toBe(2);
    expect(contarFaltas(ags, null)).toBe(3);
  });

  it('RN-20: estabelecimento ignora RN-17 e RN-18', () => {
    expect(criar({ ativosFuturos: 99, faltasDesdeDesbloqueio: 99 }, Papel.DONO).ok).toBe(true);
    expect(
      podeCriar({ ator: Papel.PROFISSIONAL, profissional: prof, inicio: ini, contexto: cx }).ok,
    ).toBe(true);
  });
});

describe('V RN-19 ciclo de vida', () => {
  const todos = [S.PENDENTE, S.CONFIRMADO, S.CONCLUIDO, S.NAO_COMPARECEU, S.CANCELADO];
  const permitidas = new Set([
    'PENDENTE>CONFIRMADO',
    'PENDENTE>CANCELADO',
    'CONFIRMADO>CONCLUIDO',
    'CONFIRMADO>NAO_COMPARECEU',
    'CONFIRMADO>CANCELADO',
  ]);
  const inicio = 1_000_000;

  it('RN-19: matriz completa 5×5 (estabelecimento, depois do início)', () => {
    for (const de of todos)
      for (const para of todos) {
        const r = transicionar(de, para, { ator: Papel.DONO, agora: inicio, inicio });
        if (permitidas.has(`${de}>${para}`))
          expect(r, `${de}>${para}`).toEqual({ ok: true, valor: para });
        else
          expect(r, `${de}>${para}`).toMatchObject({
            ok: false,
            codigo: 'TRANSICAO_DE_STATUS_INVALIDA',
          });
      }
  });

  it('RN-19: CONCLUIDO/NAO_COMPARECEU 1 ms antes do início recusado; no início aceito', () => {
    for (const para of [S.CONCLUIDO, S.NAO_COMPARECEU]) {
      expect(
        transicionar(S.CONFIRMADO, para, { ator: Papel.PROFISSIONAL, agora: inicio - 1, inicio }),
      ).toMatchObject({
        codigo: 'TRANSICAO_DE_STATUS_INVALIDA',
      });
      expect(
        transicionar(S.CONFIRMADO, para, { ator: Papel.PROFISSIONAL, agora: inicio, inicio }).ok,
      ).toBe(true);
    }
  });

  it('RN-19 + D-11.7: cliente marcando CONCLUIDO → ACESSO_NEGADO', () => {
    expect(
      transicionar(S.CONFIRMADO, S.CONCLUIDO, { ator: Papel.CLIENTE, agora: inicio, inicio }),
    ).toMatchObject({ codigo: 'ACESSO_NEGADO' });
  });

  it('RN-19: status inicial', () => {
    expect(statusInicial({ confirmacaoAutomatica: true })).toBe(S.CONFIRMADO);
    expect(statusInicial({ confirmacaoAutomatica: false })).toBe(S.PENDENTE);
  });
});

describe('V RN-20 balcão', () => {
  const est = (o: Partial<ContextoAgenda> & { dataLocal?: string } = {}) => ({
    ...o,
    origem: 'ESTABELECIMENTO' as const,
  });

  it('RN-20: ignora antecedência — oferece 1º horário >= agora', () => {
    expect(livres(est({ agora: t(`${SEG}T10:07`) }))[0]).toBe('10:15');
    expect(livres(est({ agora: t(`${SEG}T10:15`) }))[0]).toBe('10:15');
  });

  it('RN-20: ignora horizonte', () => {
    const p = politicas({ horizonteDias: 1 });
    expect(livres(est({ politicas: p, dataLocal: '2027-06-01' }))).toHaveLength(livres().length);
  });

  it('RN-20: passado → HORARIO_NO_PASSADO; fora do expediente, conflito e grade continuam', () => {
    const agora = t(`${SEG}T10:07`);
    expect(codigo(est({ agora }), t(`${SEG}T10:00`))).toBe('HORARIO_NO_PASSADO');
    expect(codigo(est({ agora }), t(`${SEG}T19:00`))).toBe('FORA_DO_EXPEDIENTE');
    expect(
      codigo(
        est({ agora, ocupacoes: [{ inicio: t(`${SEG}T10:30`), fim: t(`${SEG}T10:31`) }] }),
        t(`${SEG}T10:15`),
      ),
    ).toBe('HORARIO_INDISPONIVEL');
    expect(codigo(est({ agora }), t(`${SEG}T10:20`))).toBe('HORARIO_FORA_DA_GRADE');
  });

  it('RN-20: podeCriar estabelecimento com profissional inativo → RN-11', () => {
    expect(
      podeCriar({
        ator: Papel.DONO,
        profissional: { ativo: false, executaServico: true },
        inicio: t(`${SEG}T09:00`),
        contexto: ctx(),
      }),
    ).toMatchObject({ codigo: 'PROFISSIONAL_NAO_EXECUTA_SERVICO' });
  });
});

describe('V ordem de erros na criação', () => {
  const prof = { ativo: true, executaServico: true };
  const inativo = { ativo: false, executaServico: true };
  const ruim = { ativosFuturos: 3, faltasDesdeDesbloqueio: 3 };
  const limite = { ativosFuturos: 3, faltasDesdeDesbloqueio: 0 };
  const ok = { ativosFuturos: 0, faltasDesdeDesbloqueio: 0 };

  it('RN-18 → RN-17 → RN-11 → grade → RN-09 → RN-10 → expediente → conflito', () => {
    const p = politicas({ horizonteDias: 3, antecedenciaMinimaMin: 60 * 24 * 10 });
    const agora = t('2026-11-01T08:00');
    // 2026-11-09 19:05: fora da grade, antecedência (10 dias), além do horizonte, fora do expediente
    const ocup = [{ inicio: t(`${SEG}T00:00`), fim: t('2026-11-10T00:00') }];
    const cx = ctx({ agora, politicas: p, ocupacoes: ocup });
    const c = (cliente: typeof ok, profissional: typeof prof, inicio: number, contexto = cx) =>
      podeCriar({ ator: Papel.CLIENTE, cliente, profissional, inicio, contexto });
    expect(c(ruim, inativo, t(`${SEG}T19:05`))).toMatchObject({ codigo: 'CLIENTE_BLOQUEADO' });
    expect(c(limite, inativo, t(`${SEG}T19:05`))).toMatchObject({
      codigo: 'LIMITE_DE_AGENDAMENTOS',
    });
    expect(c(ok, inativo, t(`${SEG}T19:05`))).toMatchObject({
      codigo: 'PROFISSIONAL_NAO_EXECUTA_SERVICO',
    });
    expect(c(ok, prof, t(`${SEG}T19:05`))).toMatchObject({ codigo: 'HORARIO_FORA_DA_GRADE' });
    expect(c(ok, prof, t(`${SEG}T19:00`))).toMatchObject({ codigo: 'ANTECEDENCIA_MINIMA' });
    const cx2 = ctx({ agora, politicas: politicas({ horizonteDias: 3 }), ocupacoes: ocup });
    expect(c(ok, prof, t(`${SEG}T19:00`), cx2)).toMatchObject({ codigo: 'ALEM_DO_HORIZONTE' });
    const cx3 = ctx({ agora, politicas: politicas({ horizonteDias: 30 }), ocupacoes: ocup });
    expect(c(ok, prof, t(`${SEG}T19:00`), cx3)).toMatchObject({ codigo: 'FORA_DO_EXPEDIENTE' });
    expect(c(ok, prof, t(`${SEG}T10:00`), cx3)).toMatchObject({ codigo: 'HORARIO_INDISPONIVEL' });
    expect(c(ok, prof, t('2026-11-10T10:00'), cx3).ok).toBe(true);
  });

  it('cliente CLIENTE sem situação → não passa silenciosamente', () => {
    const r = podeCriar({
      ator: Papel.CLIENTE,
      profissional: prof,
      inicio: t(`${SEG}T09:00`),
      contexto: ctx(),
    });
    expect(r.ok).toBe(false);
  });
});

describe('V consistência lista × validação (minuto a minuto)', () => {
  const cenarios: [string, Partial<ContextoAgenda> & { dataLocal: string }][] = [
    ['SP padrão', { dataLocal: SEG }],
    [
      'NY março',
      {
        dataLocal: '2027-03-14',
        politicas: politicas({ fuso: NY, antecedenciaMinimaMin: 0 }),
        agora: t('2027-03-01T00:00', NY),
        jornada: jornadaTodoDia([{ inicio: '00:00', fim: '24:00' }]),
      },
    ],
    [
      'NY novembro',
      {
        dataLocal: '2027-11-07',
        politicas: politicas({ fuso: NY, granularidadeMin: 20 }),
        agora: t('2027-11-01T00:00', NY),
        jornada: jornadaTodoDia([{ inicio: '00:00', fim: '24:00' }]),
      },
    ],
    [
      'Lisboa outubro',
      {
        dataLocal: '2027-10-31',
        politicas: politicas({ fuso: LIS, granularidadeMin: 45 }),
        agora: t('2027-10-01T00:00', LIS),
        jornada: jornadaTodoDia([{ inicio: '00:00', fim: '24:00' }]),
      },
    ],
    [
      'Kolkata',
      {
        dataLocal: SEG,
        politicas: politicas({ fuso: KOL, granularidadeMin: 10 }),
        agora: t('2026-11-09T09:43:12.5', KOL),
        servico: servico({ preparoMin: 7, limpezaMin: 3 }),
      },
    ],
  ];
  it.each(cenarios)('validarHorario ok ⇔ está em horariosLivres (%s)', (_n, c) => {
    const base = ctx(c);
    const lista = new Set(horariosLivres({ ...base, dataLocal: c.dataLocal }));
    const fuso = base.politicas.fuso;
    const ini = t(`${c.dataLocal}T00:00`, fuso) - 2 * HORA;
    for (let u = ini; u < ini + 30 * HORA; u += MIN) {
      if (dataLocalDe(u, fuso) !== c.dataLocal) continue;
      const okV = validarHorario({ ...base, inicio: u }).ok;
      expect(okV, `${hhmm(u, fuso)} (${u})`).toBe(lista.has(u));
    }
  });
});

function dataLocalDe(u: number, fuso: string): string {
  return DateTime.fromMillis(u, { zone: fuso }).toISODate()!;
}

describe('V entradas inválidas e fusos com meia-noite inexistente', () => {
  it('políticas/serviço/fuso inválidos → DADOS_INVALIDOS e lista vazia (sem laço infinito)', () => {
    expect(codigo({ politicas: politicas({ granularidadeMin: 0 }) }, t(`${SEG}T09:00`))).toBe(
      'DADOS_INVALIDOS',
    );
    expect(livres({ politicas: politicas({ granularidadeMin: 0 }) })).toEqual([]);
    expect(codigo({ servico: servico({ duracaoMin: 0 }) }, t(`${SEG}T09:00`))).toBe(
      'DADOS_INVALIDOS',
    );
    expect(codigo({ servico: servico({ preparoMin: -5 }) }, t(`${SEG}T09:00`))).toBe(
      'DADOS_INVALIDOS',
    );
    expect(codigo({ politicas: politicas({ fuso: 'Marte/Olympus' }) }, t(`${SEG}T09:00`))).toBe(
      'DADOS_INVALIDOS',
    );
    expect(codigo({}, Number.NaN)).toBe('DADOS_INVALIDOS');
  });

  it('RN-02: America/Santiago — dia em que 00:00 não existe começa às 01:00', () => {
    const fuso = 'America/Santiago';
    const p = politicas({ fuso, granularidadeMin: 30, antecedenciaMinimaMin: 0 });
    const jornada = jornadaTodoDia([{ inicio: '00:00', fim: '03:00' }]);
    const agora = t('2026-09-01T00:00', fuso);
    const dia = '2026-09-06';
    const temMeiaNoite =
      DateTime.fromISO(`${dia}T00:00`, { zone: fuso }).toFormat('HH:mm') === '00:00';
    const l = livres({ jornada, politicas: p, agora, dataLocal: dia });
    if (temMeiaNoite) expect(l[0]).toBe('00:00');
    else expect(l).toEqual(['01:00', '01:30', '02:00', '02:30']);
  });

  it('RN-13: n padrão = 5', () => {
    expect(proximosHorariosLivres(ctx(), t(`${SEG}T00:00`))).toHaveLength(5);
  });

  it('D-11.5: preparo usa o expediente contínuo do dia anterior (dom 22–24 + seg 00–02)', () => {
    const jornada = {
      ...jornadaTodoDia([]),
      7: [{ inicio: '22:00', fim: '24:00' }],
      1: [{ inicio: '00:00', fim: '02:00' }],
    };
    const c = {
      jornada,
      servico: servico({ duracaoMin: 30, preparoMin: 15 }),
      politicas: politicas({ antecedenciaMinimaMin: 0 }),
    };
    expect(codigo(c, t(`${SEG}T00:00`))).toBe('OK');
    // sem o domingo, o preparo cai fora
    expect(codigo({ ...c, jornada: { ...jornada, 7: [] } }, t(`${SEG}T00:00`))).toBe(
      'FORA_DO_EXPEDIENTE',
    );
    // feriado no domingo derruba o preparo também
    expect(
      codigo({ ...c, excecoes: [{ tipo: 'FERIADO', data: '2026-11-08' }] }, t(`${SEG}T00:00`)),
    ).toBe('FORA_DO_EXPEDIENTE');
  });
});
