import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { contexto, em, horas, SEGUNDA } from './apoio-testes';
import { horariosLivres, validarHorario } from './disponibilidade';
import { type Intervalo, contem, intervaloValido, sobrepoe, subtrair, unir } from './intervalo';

const i = (inicio: number, fim: number): Intervalo => ({ inicio, fim });

describe('intervalo (RN-01)', () => {
  it('RN-01: terminar 10:00 e começar 10:00 não se sobrepõem', () => {
    const a = i(em('2026-03-02T09:00'), em('2026-03-02T10:00'));
    const b = i(em('2026-03-02T10:00'), em('2026-03-02T11:00'));
    expect(sobrepoe(a, b)).toBe(false);
    expect(sobrepoe(b, a)).toBe(false);
  });

  it('RN-01: um minuto em comum já é sobreposição', () => {
    expect(sobrepoe(i(0, 61), i(60, 120))).toBe(true);
    expect(sobrepoe(i(0, 100), i(10, 20))).toBe(true);
  });

  it('RN-01: intervalos vazios são inválidos e não sobrepõem nada', () => {
    expect(intervaloValido(i(5, 5))).toBe(false);
    expect(intervaloValido(i(6, 5))).toBe(false);
    expect(intervaloValido(i(Number.NaN, 5))).toBe(false);
    expect(sobrepoe(i(5, 5), i(0, 10))).toBe(false);
    expect(contem(i(0, 10), i(5, 5))).toBe(false);
  });

  it('RN-01: contem aceita bordas iguais', () => {
    expect(contem(i(0, 10), i(0, 10))).toBe(true);
    expect(contem(i(0, 10), i(0, 11))).toBe(false);
  });

  it('RN-01: unir funde sobrepostos e adjacentes e descarta vazios', () => {
    expect(unir([i(10, 20), i(0, 5), i(5, 8), i(15, 30), i(40, 40)])).toEqual([i(0, 8), i(10, 30)]);
  });

  it('RN-01: subtrair recorta, divide e descarta vazios', () => {
    expect(subtrair([i(0, 100)], [i(10, 20), i(50, 60)])).toEqual([
      i(0, 10),
      i(20, 50),
      i(60, 100),
    ]);
    expect(subtrair([i(0, 10)], [i(0, 10)])).toEqual([]);
    expect(subtrair([i(0, 10)], [i(10, 20)])).toEqual([i(0, 10)]);
    expect(subtrair([i(0, 10), i(20, 30)], [])).toEqual([i(0, 10), i(20, 30)]);
  });

  it('RN-01: agendamento até 10:00 não impede início às 10:00', () => {
    const ctx = contexto({ ocupacoes: [i(em('2026-03-02T09:00'), em('2026-03-02T10:00'))] });
    expect(validarHorario({ ...ctx, inicio: em('2026-03-02T10:00') }).ok).toBe(true);
    expect(validarHorario({ ...ctx, inicio: em('2026-03-02T09:45') })).toMatchObject({
      ok: false,
      codigo: 'HORARIO_INDISPONIVEL',
    });
    expect(horas(horariosLivres({ ...ctx, dataLocal: SEGUNDA })).slice(0, 2)).toEqual([
      '10:00',
      '10:15',
    ]);
  });
});

describe('propriedade P6 (subtrair)', () => {
  const intervalo = fc
    .tuple(fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 60 }))
    .map(([inicio, tam]) => i(inicio, inicio + tam));
  const lista = fc.array(intervalo, { maxLength: 8 });
  const dentro = (xs: readonly Intervalo[], p: number) =>
    xs.some((x) => x.inicio <= p && p < x.fim);

  it('P6: subtrair nunca devolve ponto de remover e preserva os pontos de base fora de remover', () => {
    fc.assert(
      fc.property(lista, lista, (base, remover) => {
        const r = subtrair(base, remover);
        // normalizado: válidos, ordenados, sem encostar
        for (let k = 0; k < r.length; k++) {
          const atual = r[k]!;
          if (!intervaloValido(atual)) return false;
          const anterior = r[k - 1];
          if (anterior !== undefined && anterior.fim >= atual.inicio) return false;
        }
        for (let p = -1; p <= 262; p++) {
          const esperado = dentro(base, p) && !dentro(remover, p);
          if (dentro(r, p) !== esperado) return false;
        }
        return true;
      }),
      { numRuns: 1000 },
    );
  });
});
