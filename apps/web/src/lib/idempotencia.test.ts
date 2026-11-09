import { describe, expect, it } from 'vitest';
import { criarChavesDeIdempotencia } from './idempotencia';

const escolha = {
  servicoId: 'a1b2c3d4-0000-4000-8000-000000000001',
  profissionalId: null,
  inicio: '2026-11-11T13:00:00.000Z',
};

describe('Idempotency-Key por tentativa de confirmação (RN-22)', () => {
  it('gera um UUID v4 de verdade por padrão', () => {
    expect(criarChavesDeIdempotencia().chavePara(escolha)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('clicar de novo, ou repetir depois de uma falha de rede, reusa a mesma chave', () => {
    const chaves = criarChavesDeIdempotencia();
    const primeira = chaves.chavePara(escolha);
    expect(chaves.chavePara({ ...escolha })).toBe(primeira);
    expect(chaves.chavePara({ ...escolha })).toBe(primeira);
  });

  it('nova escolha de horário (ou de profissional) gera chave nova', () => {
    let n = 0;
    const chaves = criarChavesDeIdempotencia(() => `chave-${++n}`);
    expect(chaves.chavePara(escolha)).toBe('chave-1');
    expect(chaves.chavePara({ ...escolha, inicio: '2026-11-11T13:15:00.000Z' })).toBe('chave-2');
    expect(
      chaves.chavePara({ ...escolha, inicio: '2026-11-11T13:15:00.000Z', profissionalId: 'p' }),
    ).toBe('chave-3');
    // Voltar para uma escolha anterior é uma tentativa nova.
    expect(chaves.chavePara(escolha)).toBe('chave-4');
  });

  it('depois do sucesso, a mesma escolha começa uma tentativa nova', () => {
    let n = 0;
    const chaves = criarChavesDeIdempotencia(() => `chave-${++n}`);
    expect(chaves.chavePara(escolha)).toBe('chave-1');
    chaves.encerrar();
    expect(chaves.chavePara(escolha)).toBe('chave-2');
  });
});
