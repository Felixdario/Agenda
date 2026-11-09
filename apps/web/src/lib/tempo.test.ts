import { afterEach, describe, expect, it } from 'vitest';
import {
  dataLocalDe,
  diaDaSemanaIso,
  formatarDataLonga,
  formatarHora,
  instanteDeLocal,
  minutosDoDia,
  proximosDias,
  somarDias,
} from './tempo';

const SP = 'America/Sao_Paulo';
const TZ_ORIGINAL = process.env.TZ;

afterEach(() => {
  process.env.TZ = TZ_ORIGINAL;
});

describe('tempo.ts: tudo no fuso do estabelecimento', () => {
  it('13:00 UTC é 10:00 em São Paulo, em pt-BR e em inglês', () => {
    expect(formatarHora('2026-11-11T13:00:00.000Z', SP, 'pt-BR')).toBe('10:00');
    expect(formatarHora('2026-11-11T13:00:00.000Z', SP, 'en')).toBe('10:00');
  });

  it('um navegador em outro fuso não muda o que é exibido', () => {
    const instante = '2026-11-14T02:30:00.000Z'; // sexta 23:30 em SP; sábado em Tóquio e em UTC
    const resultados = ['Asia/Tokyo', 'America/Los_Angeles', 'UTC', 'Europe/Lisbon'].map((tz) => {
      process.env.TZ = tz;
      return [
        formatarHora(instante, SP, 'pt-BR'),
        formatarDataLonga(instante, SP, 'pt-BR'),
        dataLocalDe(instante, SP),
        minutosDoDia(instante, SP),
      ];
    });
    for (const r of resultados) {
      expect(r).toEqual(['23:30', 'sexta-feira, 13 de novembro', '2026-11-13', 23 * 60 + 30]);
    }
  });

  it('dataLocalDe usa o calendário do estabelecimento, não o UTC', () => {
    expect(dataLocalDe('2026-11-14T01:00:00.000Z', SP)).toBe('2026-11-13');
    expect(dataLocalDe('2026-11-14T01:00:00.000Z', 'Asia/Tokyo')).toBe('2026-11-14');
  });

  it('instanteDeLocal é o inverso: hora de parede no fuso → instante UTC', () => {
    expect(new Date(instanteDeLocal('2026-11-11', '10:00', SP)).toISOString()).toBe(
      '2026-11-11T13:00:00.000Z',
    );
    expect(new Date(instanteDeLocal('2026-03-02', '09:30', 'Asia/Kolkata')).toISOString()).toBe(
      '2026-03-02T04:00:00.000Z',
    );
    // Nova York, dias de verão e de inverno (o deslocamento muda)
    expect(new Date(instanteDeLocal('2026-07-01', '09:00', 'America/New_York')).toISOString()).toBe(
      '2026-07-01T13:00:00.000Z',
    );
    expect(new Date(instanteDeLocal('2026-12-01', '09:00', 'America/New_York')).toISOString()).toBe(
      '2026-12-01T14:00:00.000Z',
    );
  });

  it('instanteDeLocal não depende do fuso do processo', () => {
    process.env.TZ = 'Asia/Tokyo';
    expect(new Date(instanteDeLocal('2026-11-11', '10:00', SP)).toISOString()).toBe(
      '2026-11-11T13:00:00.000Z',
    );
  });

  it('calendário: somar dias atravessa mês e ano; faixa de 14 dias; dia ISO da semana', () => {
    expect(somarDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
    const faixa = proximosDias('2026-11-09', 14);
    expect(faixa).toHaveLength(14);
    expect(faixa[0]).toBe('2026-11-09');
    expect(faixa.at(-1)).toBe('2026-11-22');
    expect(diaDaSemanaIso('2026-11-09')).toBe(1); // segunda
    expect(diaDaSemanaIso('2026-11-15')).toBe(7); // domingo
  });
});
