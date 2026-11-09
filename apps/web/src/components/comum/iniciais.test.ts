import { describe, expect, it } from 'vitest';
import { iniciaisDe } from './iniciais';

describe('iniciais (break-ui: nomes difíceis)', () => {
  it.each([
    ['Navalha & Café', 'NC'],
    ['Christopher Alexander Montgomery III', 'CM'],
    ['José da Silva Filho', 'JS'],
    ['Jo', 'J'],
    ['J', 'J'],
    ['dana', 'D'],
    ['🦊 Fox', 'F'],
    ['Ólafur Darri Ólafsson', 'ÓÓ'],
    ['王秀英', '王'],
    ['  Sam   Lee ', 'SL'],
  ])('%s → %s', (nome, esperado) => {
    expect(iniciaisDe(nome)).toBe(esperado);
  });
});
