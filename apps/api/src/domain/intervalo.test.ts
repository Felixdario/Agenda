import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sobrepoe } from './intervalo';

const intervalo = fc
  .tuple(fc.integer({ min: 0, max: 1440 }), fc.integer({ min: 1, max: 240 }))
  .map(([inicio, duracao]) => ({ inicio, fim: inicio + duracao }));

describe('sobrepoe', () => {
  it('intervalos encostados não se sobrepõem', () => {
    expect(sobrepoe({ inicio: 0, fim: 30 }, { inicio: 30, fim: 60 })).toBe(false);
  });

  it('é simétrica', () => {
    fc.assert(fc.property(intervalo, intervalo, (a, b) => sobrepoe(a, b) === sobrepoe(b, a)));
  });
});
