import fc from 'fast-check';
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  type ContextoAgenda,
  type Origem,
  type Politicas,
  type ServicoCopia,
  blocoDoAtendimento,
  horariosLivres,
  validarHorario,
} from './disponibilidade';
import { type Excecao, type Jornada, type TrechoLocal, expedienteDoDia } from './expediente';
import { type Intervalo, contem, sobrepoe, unir } from './intervalo';
import { podeRemarcar } from './politicas';
import { diasDesdeEpoca, formatarData, lerData } from './tempo';

const MIN = 60_000;
const DIA = 86_400_000;
const FUSOS = ['America/Sao_Paulo', 'America/New_York', 'Europe/Lisbon', 'Asia/Kolkata'] as const;
const NUM_RUNS = 500;

// Dias de troca de horário de 2026 (NY e Lisboa), para forçar DST com frequência.
const DIAS_DST = [
  '2026-03-08',
  '2026-11-01',
  '2026-03-29',
  '2026-10-25',
  '2027-03-14',
  '2027-11-07',
];

const hhmm = (m: number) =>
  m === 1440
    ? '24:00'
    : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** 0–3 trechos sem sobreposição, bordas múltiplas de 5 min (inclui 00:00 e 24:00). */
const trechosDoDia: fc.Arbitrary<TrechoLocal[]> = fc
  .uniqueArray(fc.integer({ min: 0, max: 288 }), { minLength: 0, maxLength: 6 })
  .map((cortes) => {
    const s = [...cortes].sort((a, b) => a - b).map((c) => c * 5);
    const trechos: TrechoLocal[] = [];
    for (let k = 0; k + 1 < s.length; k += 2)
      trechos.push({ inicio: hhmm(s[k]!), fim: hhmm(s[k + 1]!) });
    return trechos;
  });

const jornada: fc.Arbitrary<Jornada> = fc.oneof(
  // jornada "comercial" com variação, para ter muitas vagas
  fc
    .record({ ini: fc.integer({ min: 0, max: 12 }), fim: fc.integer({ min: 13, max: 24 }) })
    .map(({ ini, fim }) => {
      const t = [{ inicio: hhmm(ini * 60), fim: hhmm(fim * 60) }];
      return { 1: t, 2: t, 3: t, 4: t, 5: t, 6: t, 7: t };
    }),
  fc.record({
    1: trechosDoDia,
    2: trechosDoDia,
    3: trechosDoDia,
    4: trechosDoDia,
    5: trechosDoDia,
    6: trechosDoDia,
    7: trechosDoDia,
  }),
);

const dataLocal: fc.Arbitrary<string> = fc.oneof(
  fc
    .integer({ min: diasDesdeEpoca(2025, 12, 1), max: diasDesdeEpoca(2027, 12, 31) })
    .map(formatarData),
  fc.constantFrom(...DIAS_DST, '2026-01-31', '2026-02-01', '2026-12-31', '2027-01-01'),
);

const minutoLocal = fc.integer({ min: 0, max: 287 }).map((m) => m * 5);
function excecoes(data: string): fc.Arbitrary<Excecao[]> {
  const d = lerData(data)!;
  const datas = fc.constantFrom(formatarData(d - 1), data, data, formatarData(d + 1));
  const trecho = fc
    .tuple(minutoLocal, fc.integer({ min: 1, max: 48 }))
    .map(([i, len]) => ({ inicio: hhmm(i), fim: hhmm(Math.min(1440, i + len * 5)) }));
  const excecao: fc.Arbitrary<Excecao> = fc.oneof(
    { weight: 1, arbitrary: datas.map((d2) => ({ tipo: 'FERIADO' as const, data: d2 })) },
    { weight: 1, arbitrary: datas.map((d2) => ({ tipo: 'FOLGA' as const, data: d2 })) },
    {
      weight: 3,
      arbitrary: fc
        .tuple(datas, trecho)
        .map(([d2, t]) => ({ tipo: 'FOLGA' as const, data: d2, ...t })),
    },
    {
      weight: 3,
      arbitrary: fc
        .tuple(datas, trecho)
        .map(([d2, t]) => ({ tipo: 'HORARIO_EXTRA' as const, data: d2, ...t })),
    },
  );
  return fc.array(excecao, { maxLength: 3 });
}

/** Intervalos UTC em torno do dia (de −14 h a +38 h da meia-noite UTC da data). */
function intervalosPerto(data: string): fc.Arbitrary<Intervalo[]> {
  const base = lerData(data)! * DIA;
  return fc.array(
    fc
      .tuple(fc.integer({ min: -840, max: 2280 }), fc.integer({ min: 1, max: 240 }))
      .map(([i, len]) => ({ inicio: base + i * MIN, fim: base + (i + len) * MIN })),
    { maxLength: 4 },
  );
}

const servico: fc.Arbitrary<ServicoCopia> = fc.record({
  nome: fc.constant('S'),
  duracaoMin: fc.integer({ min: 1, max: 240 }),
  preparoMin: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 30 })),
  limpezaMin: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 30 })),
  precoCentavos: fc.constant(1000),
});

const politicas: fc.Arbitrary<Politicas> = fc.record({
  granularidadeMin: fc.oneof(
    fc.constantFrom(5, 10, 15, 20, 30, 60),
    fc.integer({ min: 5, max: 120 }),
  ),
  antecedenciaMinimaMin: fc.integer({ min: 0, max: 600 }),
  horizonteDias: fc.integer({ min: 0, max: 90 }),
  prazoCancelamentoHoras: fc.integer({ min: 0, max: 48 }),
  limiteAgendamentosAtivos: fc.constant(3),
  limiteFaltas: fc.constant(3),
  confirmacaoAutomatica: fc.boolean(),
  fuso: fc.constantFrom(...FUSOS),
});

type Cenario = ContextoAgenda & { readonly dataLocal: string };

const cenario: fc.Arbitrary<Cenario> = dataLocal.chain((data) => {
  const base = lerData(data)! * DIA;
  return fc.record({
    dataLocal: fc.constant(data),
    jornada,
    excecoes: excecoes(data),
    bloqueios: intervalosPerto(data),
    ocupacoes: intervalosPerto(data),
    servico,
    politicas,
    // "agora" de ~95 dias antes até 2 dias depois da data, com segundos quebrados
    agora: fc
      .tuple(fc.integer({ min: -95 * 1440, max: 2 * 1440 }), fc.integer({ min: 0, max: 59_999 }))
      .map(([m, ms]) => base + m * MIN + ms),
    origem: fc.constantFrom<Origem>('CLIENTE', 'ESTABELECIMENTO'),
  });
});

function expedienteEfetivo(c: Cenario): Intervalo[] {
  const d = lerData(c.dataLocal)!;
  return unir(
    [d - 1, d, d + 1].flatMap((x) =>
      expedienteDoDia(c.jornada, c.excecoes, formatarData(x), c.politicas.fuso),
    ),
  );
}

let comVagas = 0;
const contarVagas = (livres: readonly number[]) => {
  if (livres.length > 0) comVagas++;
};

describe('propriedades da disponibilidade (fast-check)', () => {
  it('P1: nenhum horário retornado tem bloco sobreposto a ocupação ou bloqueio', () => {
    fc.assert(
      fc.property(cenario, (c) => {
        const livres = horariosLivres(c);
        contarVagas(livres);
        return livres.every((t) => {
          const b = blocoDoAtendimento(t, c.servico);
          return (
            !c.ocupacoes.some((o) => sobrepoe(o, b)) && !c.bloqueios.some((o) => sobrepoe(o, b))
          );
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('P2: todo bloco retornado cabe inteiro num trecho do expediente efetivo', () => {
    fc.assert(
      fc.property(cenario, (c) => {
        const exp = expedienteEfetivo(c);
        return horariosLivres(c).every((t) =>
          exp.some((e) => contem(e, blocoDoAtendimento(t, c.servico))),
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('P3: nenhum horário viola antecedência (CLIENTE), passado (ESTABELECIMENTO) nem horizonte', () => {
    fc.assert(
      fc.property(cenario, (c) => {
        const fuso = c.politicas.fuso;
        // cálculo independente, só com Luxon
        const ultimo = DateTime.fromMillis(c.agora, { zone: fuso })
          .startOf('day')
          .plus({ days: c.politicas.horizonteDias })
          .toISODate()!;
        return horariosLivres(c).every((t) => {
          if (c.origem === 'ESTABELECIMENTO') return t >= c.agora;
          const data = DateTime.fromMillis(t, { zone: fuso }).toISODate()!;
          return t >= c.agora + c.politicas.antecedenciaMinimaMin * MIN && data <= ultimo;
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('P4: todo horário retornado está na grade local, na data pedida, na 1ª ocorrência', () => {
    fc.assert(
      fc.property(cenario, (c) => {
        const fuso = c.politicas.fuso;
        return horariosLivres(c).every((t) => {
          const dt = DateTime.fromMillis(t, { zone: fuso });
          const minutos = dt.hour * 60 + dt.minute;
          const umaHoraAntes = DateTime.fromMillis(t - 3_600_000, { zone: fuso });
          // na volta do horário de verão, a 2ª ocorrência tem a mesma hora local de 1 h antes
          const segundaOcorrencia =
            umaHoraAntes.toFormat('yyyy-MM-dd HH:mm') === dt.toFormat('yyyy-MM-dd HH:mm');
          return (
            dt.second === 0 &&
            dt.millisecond === 0 &&
            minutos % c.politicas.granularidadeMin === 0 &&
            dt.toISODate() === c.dataLocal &&
            !segundaOcorrencia
          );
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('P5: validarHorario aceita todo horário da lista e recusa os inícios da grade que ficaram fora', () => {
    fc.assert(
      fc.property(cenario, (c) => {
        const livres = horariosLivres(c);
        const conjunto = new Set(livres);
        if (!livres.every((t) => validarHorario({ ...c, inicio: t }).ok)) return false;
        // recíproca: varre a grade do dia (em minutos de relógio) e confere que o que não veio é recusado
        const fuso = c.politicas.fuso;
        const meiaNoite = DateTime.fromISO(c.dataLocal, { zone: fuso });
        for (let m = 0; m < 1440; m += c.politicas.granularidadeMin) {
          const dt = meiaNoite.set({ hour: Math.floor(m / 60), minute: m % 60 });
          if (dt.hour * 60 + dt.minute !== m) continue; // inexistente (o Luxon empurrou)
          const t = dt.toMillis();
          if (!conjunto.has(t) && validarHorario({ ...c, inicio: t }).ok) return false;
        }
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('P7: remarcar para o próprio horário atual é sempre aceito quando não há outro conflito', () => {
    let naoVazios = 0;
    fc.assert(
      fc.property(cenario, fc.nat(), (c, escolha) => {
        const ator = c.origem === 'CLIENTE' ? 'CLIENTE' : 'DONO';
        const prazo = c.politicas.prazoCancelamentoHoras * 3_600_000;
        // horários atuais possíveis: livres (sem conflito) e, para o cliente, ainda dentro do prazo
        const candidatos = horariosLivres(c).filter((t) => ator === 'DONO' || c.agora <= t - prazo);
        if (candidatos.length === 0) return true;
        naoVazios++;
        const inicio = candidatos[escolha % candidatos.length]!;
        const { servico: s, origem: _o, dataLocal: _d, ...contexto } = c;
        void _o;
        void _d;
        const r = podeRemarcar({
          agendamento: { inicio, status: 'CONFIRMADO', servico: s },
          novoInicio: inicio,
          ator,
          cliente: { ativosFuturos: 99, faltasDesdeDesbloqueio: 0 },
          profissional: { ativo: true, executaServico: true },
          contexto, // ocupações sem o próprio agendamento
        });
        return r.ok;
      }),
      { numRuns: NUM_RUNS },
    );
    expect(naoVazios).toBeGreaterThan(NUM_RUNS / 10);
  });

  it('os geradores produzem cenários com vagas com frequência', () => {
    expect(comVagas).toBeGreaterThan(NUM_RUNS / 10);
  });
});
