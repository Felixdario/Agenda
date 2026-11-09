import { CODIGOS_ERRO } from '@agenda/shared';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import ptBR from '../../messages/pt-BR.json';
import { CODIGOS_NO_FRONT, ErroApi, chavesDoErro, erroDaResposta, ehErroDeRegra } from './erros';

type Arvore = { [k: string]: string | Arvore };

function chaves(o: Arvore, prefixo = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefixo}${k}`] : chaves(v, `${prefixo}${k}.`),
  );
}

function valor(o: Arvore, caminho: string): string | undefined {
  let atual: string | Arvore | undefined = o;
  for (const parte of caminho.split('.')) {
    if (atual === undefined || typeof atual === 'string') return undefined;
    atual = atual[parte];
  }
  return typeof atual === 'string' ? atual : undefined;
}

/** Argumentos ICU de uma mensagem ({nome}, {n, plural, …}). */
function argumentos(m: string): string[] {
  return [...m.matchAll(/\{\s*([A-Za-z]\w*)\s*[,}]/g)].map((x) => x[1]!).sort();
}

describe('dicionários', () => {
  it('pt-BR e en têm exatamente as mesmas chaves', () => {
    expect(chaves(en as Arvore).sort()).toEqual(chaves(ptBR as Arvore).sort());
  });

  it('nenhuma mensagem vazia, e os argumentos ICU são os mesmos nos dois idiomas', () => {
    for (const k of chaves(ptBR as Arvore)) {
      const pt = valor(ptBR as Arvore, k)!;
      const ing = valor(en as Arvore, k)!;
      expect(pt.trim(), k).not.toBe('');
      expect(ing.trim(), k).not.toBe('');
      expect(new Set(argumentos(ing)), k).toEqual(new Set(argumentos(pt)));
    }
  });

  it('todo CodigoErro (e o erro de rede) tem mensagem e ação nos dois idiomas', () => {
    for (const codigo of [...CODIGOS_ERRO, 'REDE']) {
      for (const dic of [ptBR, en]) {
        const c = chavesDoErro(codigo as (typeof CODIGOS_NO_FRONT)[number]);
        expect(valor((dic as Arvore)['erros'] as Arvore, c.mensagem), codigo).toBeTruthy();
        expect(valor((dic as Arvore)['erros'] as Arvore, c.acao), codigo).toBeTruthy();
      }
    }
    // Nada sobrando: o dicionário de erros é exatamente os códigos do front.
    expect(Object.keys(ptBR.erros).sort()).toEqual([...CODIGOS_NO_FRONT].sort());
  });
});

describe('mapeamento de erros HTTP → ErroApi', () => {
  it('corpo no contrato vira {codigo, mensagem, detalhes}', () => {
    const e = erroDaResposta(409, {
      codigo: 'HORARIO_INDISPONIVEL',
      mensagem: 'Esse horário acabou de ficar indisponível. Escolha outro.',
      detalhes: { proximosHorarios: ['2026-11-11T13:15:00.000Z', 42, '2026-11-11T13:30:00.000Z'] },
    });
    expect(e).toBeInstanceOf(ErroApi);
    expect(e.codigo).toBe('HORARIO_INDISPONIVEL');
    expect(e.status).toBe(409);
    expect(e.proximosHorarios).toEqual(['2026-11-11T13:15:00.000Z', '2026-11-11T13:30:00.000Z']);
    expect(ehErroDeRegra(e)).toBe(true);
  });

  it('DADOS_INVALIDOS expõe os campos', () => {
    const e = erroDaResposta(400, {
      codigo: 'DADOS_INVALIDOS',
      mensagem: 'x',
      detalhes: { campos: { email: 'E-mail já cadastrado.', outro: 3 } },
    });
    expect(e.campos).toEqual({ email: 'E-mail já cadastrado.' });
  });

  it('corpo fora do contrato vira ERRO_INTERNO, e sem resposta vira REDE', () => {
    expect(erroDaResposta(502, '<html>Bad gateway</html>').codigo).toBe('ERRO_INTERNO');
    expect(erroDaResposta(500, { codigo: 'INVENTADO', mensagem: 'x' }).codigo).toBe('ERRO_INTERNO');
    expect(erroDaResposta(0, null).codigo).toBe('REDE');
    expect(ehErroDeRegra(erroDaResposta(0, null))).toBe(false);
  });
});
