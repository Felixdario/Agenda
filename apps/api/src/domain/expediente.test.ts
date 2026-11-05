import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { contexto, em, horas, JORNADA_PADRAO, NY, SEGUNDA, SP } from './apoio-testes';
import { horariosLivres, validarHorario } from './disponibilidade';
import {
  type Excecao,
  type Jornada,
  JORNADA_VAZIA,
  expedienteDoDia,
  validarExcecao,
  validarJornada,
} from './expediente';
import { diaDaSemanaIso, formatarData, instanteLocal, lerData, zona } from './tempo';

const MIN = 60_000;
const duracaoTotal = (xs: readonly { inicio: number; fim: number }[]) =>
  xs.reduce((s, x) => s + (x.fim - x.inicio), 0) / MIN;

describe('RN-02 — fuso e horário de verão', () => {
  const ny = zona(NY)!;
  const domingoNy: Jornada = { ...JORNADA_VAZIA, 7: [{ inicio: '00:00', fim: '06:00' }] };

  it('RN-02: horário inexistente (NY, 08/03/2026 02:30) é descartado, sem o "empurrão" do Luxon', () => {
    const dias = lerData('2026-03-08')!;
    expect(instanteLocal(dias, 150, ny)).toBeNull();
    // O Luxon empurra para 03:30; o domínio não aceita isso silenciosamente.
    const luxon = DateTime.fromObject(
      { year: 2026, month: 3, day: 8, hour: 2, minute: 30 },
      { zone: NY },
    );
    expect(luxon.toFormat('HH:mm')).toBe('03:30');
  });

  it('RN-02: DST em NY (março) — 02:00 e 02:30 não são oferecidos e o expediente tem 5 h reais', () => {
    const exp = expedienteDoDia(domingoNy, [], '2026-03-08', NY);
    expect(duracaoTotal(exp)).toBe(5 * 60);
    const ctx = contexto({
      jornada: domingoNy,
      politicas: { ...contexto().politicas, fuso: NY, granularidadeMin: 30 },
      agora: em('2026-03-01T00:00', NY),
    });
    const livres = horas(horariosLivres({ ...ctx, dataLocal: '2026-03-08' }), NY);
    expect(livres).toEqual([
      '00:00',
      '00:30',
      '01:00',
      '01:30',
      '03:00',
      '03:30',
      '04:00',
      '04:30',
      '05:00',
      '05:30',
    ]);
  });

  it('RN-02: a duração é em minutos reais — 60 min a partir de 01:30 terminam às 03:30 no dia do salto', () => {
    const ctx = contexto({
      jornada: domingoNy,
      servico: { ...contexto().servico, duracaoMin: 60 },
      politicas: { ...contexto().politicas, fuso: NY, granularidadeMin: 30 },
      agora: em('2026-03-01T00:00', NY),
    });
    const inicio = em('2026-03-08T01:30', NY);
    expect(validarHorario({ ...ctx, inicio }).ok).toBe(true);
    expect(DateTime.fromMillis(inicio + 60 * MIN, { zone: NY }).toFormat('HH:mm')).toBe('03:30');
  });

  it('RN-02: DST em NY (novembro) — hora repetida usa a 1ª ocorrência e o dia tem 7 h reais em 00:00–06:00', () => {
    const exp = expedienteDoDia(domingoNy, [], '2026-11-01', NY);
    expect(duracaoTotal(exp)).toBe(7 * 60);
    const ctx = contexto({
      jornada: domingoNy,
      politicas: { ...contexto().politicas, fuso: NY, granularidadeMin: 30 },
      agora: em('2026-10-25T00:00', NY),
    });
    const livres = horariosLivres({ ...ctx, dataLocal: '2026-11-01' });
    const primeira = em('2026-11-01T01:30-04:00', NY);
    const segunda = em('2026-11-01T01:30-05:00', NY);
    expect(livres).toContain(primeira);
    expect(livres).not.toContain(segunda);
    expect(validarHorario({ ...ctx, inicio: segunda })).toMatchObject({
      ok: false,
      codigo: 'HORARIO_FORA_DA_GRADE',
    });
    expect(horas(livres, NY)).toEqual([
      '00:00',
      '00:30',
      '01:00',
      '01:30',
      '02:00',
      '02:30',
      '03:00',
      '03:30',
      '04:00',
      '04:30',
      '05:00',
      '05:30',
    ]);
  });

  it('RN-02: America/Sao_Paulo não tem horário de verão — todo dia de 2026 tem 24 h', () => {
    const z = zona(SP)!;
    const inicio = lerData('2026-01-01')!;
    for (let d = inicio; d < inicio + 365; d++) {
      expect(instanteLocal(d + 1, 0, z)! - instanteLocal(d, 0, z)!).toBe(24 * 60 * MIN);
    }
    expect(
      duracaoTotal(
        expedienteDoDia(
          { ...JORNADA_VAZIA, 7: [{ inicio: '00:00', fim: '24:00' }] },
          [],
          '2026-11-01',
          SP,
        ),
      ),
    ).toBe(1440);
  });

  it('RN-02: calendário — dia da semana e datas batem com o Luxon, inclusive viradas de mês e ano', () => {
    const inicio = lerData('2025-12-01')!;
    for (let d = inicio; d < inicio + 800; d++) {
      const dt = DateTime.fromISO(formatarData(d), { zone: 'utc' });
      expect(dt.isValid).toBe(true);
      expect(diaDaSemanaIso(d)).toBe(dt.weekday);
    }
    expect(formatarData(lerData('2026-01-31')! + 1)).toBe('2026-02-01');
    expect(formatarData(lerData('2026-12-31')! + 1)).toBe('2027-01-01');
    expect(lerData('2026-02-29')).toBeNull();
    expect(lerData('2028-02-29')).not.toBeNull();
    expect(lerData('2026-13-01')).toBeNull();
  });

  it('RN-02: fuso ou data inválidos geram expediente vazio', () => {
    expect(expedienteDoDia(JORNADA_PADRAO, [], SEGUNDA, 'Marte/Olympus')).toEqual([]);
    expect(expedienteDoDia(JORNADA_PADRAO, [], '2026-02-30', SP)).toEqual([]);
  });
});

describe('RN-03 — jornada semanal', () => {
  it('RN-03: jornada padrão é válida e gera os trechos da segunda em UTC', () => {
    expect(validarJornada(JORNADA_PADRAO).ok).toBe(true);
    expect(expedienteDoDia(JORNADA_PADRAO, [], SEGUNDA, SP)).toEqual([
      { inicio: em('2026-03-02T09:00'), fim: em('2026-03-02T12:00') },
      { inicio: em('2026-03-02T13:00'), fim: em('2026-03-02T18:00') },
    ]);
  });

  it('RN-03: trechos sobrepostos, vazios, que atravessam a meia-noite ou mal formatados são recusados', () => {
    const com = (trechos: Jornada[1]): Jornada => ({ ...JORNADA_VAZIA, 1: trechos });
    expect(
      validarJornada(
        com([
          { inicio: '09:00', fim: '12:00' },
          { inicio: '11:00', fim: '13:00' },
        ]),
      ),
    ).toMatchObject({ ok: false, codigo: 'DADOS_INVALIDOS' });
    expect(validarJornada(com([{ inicio: '10:00', fim: '10:00' }])).ok).toBe(false);
    expect(validarJornada(com([{ inicio: '22:00', fim: '02:00' }])).ok).toBe(false);
    expect(validarJornada(com([{ inicio: '9:00', fim: '12:00' }])).ok).toBe(false);
    expect(validarJornada(com([{ inicio: '24:00', fim: '24:00' }])).ok).toBe(false);
    expect(
      validarJornada(
        com([
          { inicio: '09:00', fim: '12:00' },
          { inicio: '12:00', fim: '13:00' },
        ]),
      ).ok,
    ).toBe(true);
    expect(validarJornada(com([{ inicio: '20:00', fim: '24:00' }])).ok).toBe(true);
  });

  it('RN-03: dia sem intervalos é dia sem expediente', () => {
    const ctx = contexto();
    expect(expedienteDoDia(JORNADA_PADRAO, [], '2026-03-01', SP)).toEqual([]);
    expect(horariosLivres({ ...ctx, dataLocal: '2026-03-08' })).toEqual([]);
    expect(validarHorario({ ...ctx, inicio: em('2026-03-08T10:00') })).toMatchObject({
      ok: false,
      codigo: 'FORA_DO_EXPEDIENTE',
    });
  });
});

describe('RN-04 — exceções por data', () => {
  const ctx = contexto();
  const livres = (excecoes: Excecao[], data = SEGUNDA) =>
    horas(horariosLivres({ ...ctx, excecoes, dataLocal: data }));

  it('RN-04: folga no dia inteiro tira o dia do expediente', () => {
    expect(livres([{ tipo: 'FOLGA', data: SEGUNDA }])).toEqual([]);
    expect(
      validarHorario({
        ...ctx,
        excecoes: [{ tipo: 'FOLGA', data: SEGUNDA }],
        inicio: em('2026-03-02T10:00'),
      }),
    ).toMatchObject({ ok: false, codigo: 'FORA_DO_EXPEDIENTE' });
  });

  it('RN-04: folga parcial tira só o intervalo', () => {
    const r = livres([{ tipo: 'FOLGA', data: SEGUNDA, inicio: '14:00', fim: '16:00' }]);
    expect(r).toContain('13:30');
    expect(r).not.toContain('13:45');
    expect(r).not.toContain('15:00');
    expect(r).toContain('16:00');
  });

  it('RN-04: feriado tira o dia e vence horário extra', () => {
    expect(livres([{ tipo: 'FERIADO', data: SEGUNDA }])).toEqual([]);
    expect(
      livres([
        { tipo: 'FERIADO', data: SEGUNDA },
        { tipo: 'HORARIO_EXTRA', data: SEGUNDA, inicio: '19:00', fim: '21:00' },
      ]),
    ).toEqual([]);
  });

  it('RN-04: folga vence horário extra no mesmo dia', () => {
    expect(
      livres([
        { tipo: 'HORARIO_EXTRA', data: SEGUNDA, inicio: '19:00', fim: '21:00' },
        { tipo: 'FOLGA', data: SEGUNDA },
      ]),
    ).toEqual([]);
    const parcial = livres([
      { tipo: 'HORARIO_EXTRA', data: SEGUNDA, inicio: '19:00', fim: '21:00' },
      { tipo: 'FOLGA', data: SEGUNDA, inicio: '19:00', fim: '20:00' },
    ]);
    expect(parcial).not.toContain('19:00');
    expect(parcial).toContain('20:00');
  });

  it('RN-04: horário extra soma ao expediente (inclusive em domingo) e funde com trecho adjacente', () => {
    expect(
      livres(
        [{ tipo: 'HORARIO_EXTRA', data: '2026-03-08', inicio: '10:00', fim: '11:00' }],
        '2026-03-08',
      ),
    ).toEqual(['10:00', '10:15', '10:30']);
    const r = livres([{ tipo: 'HORARIO_EXTRA', data: SEGUNDA, inicio: '18:00', fim: '19:00' }]);
    expect(r).toContain('17:45'); // atravessa 18:00, agora contínuo
    expect(r).toContain('18:30');
    expect(r).not.toContain('18:45');
  });

  it('RN-04: exceção de outra data não afeta o dia', () => {
    expect(livres([{ tipo: 'FERIADO', data: '2026-03-03' }]).length).toBeGreaterThan(0);
  });

  it('RN-04: validação de exceções', () => {
    expect(validarExcecao({ tipo: 'FERIADO', data: '2026-02-30' }).ok).toBe(false);
    expect(
      validarExcecao({ tipo: 'HORARIO_EXTRA', data: SEGUNDA, inicio: '20:00', fim: '19:00' }).ok,
    ).toBe(false);
    expect(validarExcecao({ tipo: 'FOLGA', data: SEGUNDA, inicio: '10:00' }).ok).toBe(false);
    expect(validarExcecao({ tipo: 'FOLGA', data: SEGUNDA, inicio: '10:00', fim: '11:00' }).ok).toBe(
      true,
    );
    expect(validarExcecao({ tipo: 'FOLGA', data: SEGUNDA }).ok).toBe(true);
  });
});
