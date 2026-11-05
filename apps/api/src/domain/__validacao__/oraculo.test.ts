// Propriedades do Validador: comparam o domínio com oráculos ingênuos escritos com Luxon DateTime,
// minuto a minuto, sem usar nenhuma função de tempo do domínio.
import { Papel } from '@agenda/shared';
import fc from 'fast-check';
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  type ContextoAgenda,
  type Excecao,
  type Intervalo,
  type Jornada,
  escolherProfissional,
  horariosLivres,
  podeCriar,
  proximosHorariosLivres,
  subtrair,
  unir,
  validarHorario,
} from '../index';
import { KOL, LIS, MIN, NY, SP } from './apoio-validacao';

// Santiago muda à meia-noite local; Lord_Howe muda 30 min.
const FUSOS = [SP, NY, LIS, KOL, 'America/Santiago', 'Australia/Lord_Howe'] as const;
const DATAS_ESPECIAIS = [
  '2026-03-08',
  '2026-11-01',
  '2027-03-14',
  '2027-11-07', // NY
  '2027-03-28',
  '2027-10-31',
  '2026-03-29',
  '2026-10-25', // Lisboa
  '2027-04-03',
  '2027-04-04',
  '2027-09-04',
  '2027-09-05',
  '2026-04-04',
  '2026-04-05',
  '2026-09-05',
  '2026-09-06', // Santiago
  '2027-10-03',
  '2026-10-04', // Lord_Howe
  '2026-12-31',
  '2027-01-01',
  '2027-01-31',
  '2027-02-01',
  '2026-11-09',
];

// Bordas de trecho: múltiplos de 30 min, sem 01:30 (D-11.2: borda dentro da hora repetida
// termina na 1ª ocorrência, o que o oráculo de "pertence pela hora local" não modela; 23:30 idem
// para Santiago).
const BORDAS = Array.from({ length: 49 }, (_, i) => i * 30).filter((m) => m !== 90 && m !== 1410);
const hm = (m: number) =>
  m === 1440
    ? '24:00'
    : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const arbTrechos = fc
  .uniqueArray(fc.constantFrom(...BORDAS), { minLength: 0, maxLength: 6 })
  .map((bs) => {
    const s = [...bs].sort((a, b) => a - b);
    const out: { inicio: string; fim: string }[] = [];
    for (let i = 0; i + 1 < s.length; i += 2) out.push({ inicio: hm(s[i]!), fim: hm(s[i + 1]!) });
    return out;
  });

const arbJornada: fc.Arbitrary<Jornada> = fc
  .tuple(arbTrechos, arbTrechos, arbTrechos, arbTrechos, arbTrechos, arbTrechos, arbTrechos)
  .map(([a, b, c, d, e, f, g]) => ({ 1: a, 2: b, 3: c, 4: d, 5: e, 6: f, 7: g }));

const arbPar = fc
  .uniqueArray(fc.constantFrom(...BORDAS), { minLength: 2, maxLength: 2 })
  .map((bs) => [...bs].sort((a, b) => a - b) as [number, number]);

function arbExcecao(datas: string[]): fc.Arbitrary<Excecao> {
  const data = fc.constantFrom(...datas);
  return fc.oneof(
    fc.record({ tipo: fc.constant('FERIADO' as const), data }),
    fc.record({ tipo: fc.constant('FOLGA' as const), data }),
    fc
      .tuple(data, arbPar)
      .map(([d, [a, b]]) => ({ tipo: 'FOLGA' as const, data: d, inicio: hm(a), fim: hm(b) })),
    fc.tuple(data, arbPar).map(([d, [a, b]]) => ({
      tipo: 'HORARIO_EXTRA' as const,
      data: d,
      inicio: hm(a),
      fim: hm(b),
    })),
  );
}

interface Cenario {
  ctx: ContextoAgenda;
  dataLocal: string;
}

const arbCenario: fc.Arbitrary<Cenario> = fc
  .record({
    fuso: fc.constantFrom(...FUSOS),
    data: fc.oneof(
      fc.constantFrom(...DATAS_ESPECIAIS),
      fc
        .integer({ min: 0, max: 730 })
        .map((n) => DateTime.fromISO('2026-01-01').plus({ days: n }).toISODate()!),
    ),
  })
  .chain(({ fuso, data }) => {
    const d0 = DateTime.fromISO(data, { zone: fuso });
    const vizinhas = [-1, 0, 1].map((k) => d0.plus({ days: k }).toISODate()!);
    const inicioDia = d0.startOf('day').toMillis();
    const arbIntervalo = fc
      .tuple(fc.integer({ min: -60, max: 60 * 30 }), fc.integer({ min: 1, max: 240 }))
      .map(([ini, dur]): Intervalo => ({
        inicio: inicioDia + ini * MIN,
        fim: inicioDia + (ini + dur) * MIN,
      }));
    return fc.record({
      dataLocal: fc.constant(data),
      ctx: fc.record({
        jornada: arbJornada,
        excecoes: fc.array(arbExcecao(vizinhas), { maxLength: 4 }),
        bloqueios: fc.array(arbIntervalo, { maxLength: 3 }),
        ocupacoes: fc.array(arbIntervalo, { maxLength: 4 }),
        servico: fc.record({
          nome: fc.constant('S'),
          duracaoMin: fc.integer({ min: 1, max: 240 }),
          preparoMin: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 45 })),
          limpezaMin: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 45 })),
          precoCentavos: fc.constant(100),
        }),
        politicas: fc.record({
          granularidadeMin: fc.constantFrom(5, 10, 15, 20, 30, 45, 60, 7, 25, 90),
          antecedenciaMinimaMin: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 600 })),
          horizonteDias: fc.integer({ min: 0, max: 4 }),
          prazoCancelamentoHoras: fc.constant(4),
          limiteAgendamentosAtivos: fc.constant(3),
          limiteFaltas: fc.constant(3),
          confirmacaoAutomatica: fc.constant(true),
          fuso: fc.constant(fuso),
        }),
        agora: fc
          .integer({ min: -4 * 1440 * 60_000, max: 1440 * 60_000 + 59_999 })
          .map((x) => inicioDia + x),
        origem: fc.constantFrom('CLIENTE' as const, 'ESTABELECIMENTO' as const),
      }),
    });
  });

/** Oráculo ingênuo: pertencimento ao expediente efetivo pela hora local de cada minuto UTC. */
function noExpediente(c: ContextoAgenda, data: string, m: number): boolean {
  const exs = c.excecoes.filter((e) => e.data === data);
  if (exs.some((e) => e.tipo === 'FERIADO' || (e.tipo === 'FOLGA' && e.inicio === undefined)))
    return false;
  const min = (h: string) =>
    h === '24:00' ? 1440 : Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
  const wd = DateTime.fromISO(data).weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7;
  const dentro = (a: string, b: string) => min(a) <= m && m < min(b);
  const base =
    c.jornada[wd].some((tr) => dentro(tr.inicio, tr.fim)) ||
    exs.some((e) => e.tipo === 'HORARIO_EXTRA' && dentro(e.inicio, e.fim));
  const folga = exs.some(
    (e) =>
      e.tipo === 'FOLGA' &&
      e.inicio !== undefined &&
      e.fim !== undefined &&
      dentro(e.inicio, e.fim),
  );
  return base && !folga;
}

type Codigo = string;

function oraculo(c: ContextoAgenda, dataLocal: string) {
  const fuso = c.politicas.fuso;
  const d0 = DateTime.fromISO(dataLocal, { zone: fuso });
  const ini = d0.minus({ days: 1 }).startOf('day').toMillis();
  const fim = d0.plus({ days: 2 }).startOf('day').toMillis();
  const membro = new Map<number, boolean>();
  const localDe = new Map<number, { data: string; m: number }>();
  // Luxon a cada 15 min UTC (todos os fusos testados têm deslocamento múltiplo de 15 min e mudam
  // em hora cheia UTC); os 14 minutos seguintes têm a mesma data e deslocamento.
  for (let u0 = ini; u0 < fim; u0 += 15 * MIN) {
    const dt = DateTime.fromMillis(u0, { zone: fuso });
    const data = dt.toISODate()!;
    const m0 = dt.hour * 60 + dt.minute;
    if (m0 % 15 !== 0) throw new Error('premissa do oráculo');
    for (let j = 0; j < 15; j++) {
      localDe.set(u0 + j * MIN, { data, m: m0 + j });
      membro.set(u0 + j * MIN, noExpediente(c, data, m0 + j));
    }
  }
  const p = c.politicas;
  const hojeMaisH = DateTime.fromMillis(c.agora, { zone: fuso })
    .startOf('day')
    .plus({ days: p.horizonteDias })
    .toISODate()!;
  const vistos = new Set<number>();
  const primeiraOcorrencia = new Set<number>();
  for (let u = ini; u < fim; u += MIN) {
    const l = localDe.get(u)!;
    if (l.data !== dataLocal) continue;
    if (!vistos.has(l.m)) {
      vistos.add(l.m);
      primeiraOcorrencia.add(u);
    }
  }
  const s = c.servico;
  function avaliar(u: number): Codigo {
    const l = localDe.get(u);
    if (l === undefined || u % MIN !== 0) throw new Error('fora da janela do oráculo');
    if (!primeiraOcorrencia.has(u) || l.m % p.granularidadeMin !== 0)
      return 'HORARIO_FORA_DA_GRADE';
    if (c.origem === 'CLIENTE') {
      if (u < c.agora + p.antecedenciaMinimaMin * MIN) return 'ANTECEDENCIA_MINIMA';
      if (l.data > hojeMaisH) return 'ALEM_DO_HORIZONTE';
    } else if (u < c.agora) return 'HORARIO_NO_PASSADO';
    const bIni = u - s.preparoMin * MIN;
    const bFim = u + (s.duracaoMin + s.limpezaMin) * MIN;
    for (let x = bIni; x < bFim; x += MIN) if (membro.get(x) !== true) return 'FORA_DO_EXPEDIENTE';
    const sob = (o: Intervalo) => o.inicio < o.fim && o.inicio < bFim && bIni < o.fim;
    if (c.bloqueios.some(sob) || c.ocupacoes.some(sob)) return 'HORARIO_INDISPONIVEL';
    return 'OK';
  }
  const livres = [...primeiraOcorrencia].filter((u) => avaliar(u) === 'OK').sort((a, b) => a - b);
  return { livres, avaliar, primeiraOcorrencia };
}

const RUNS = Number(process.env.VALIDACAO_RUNS ?? 300);

describe('V propriedades com oráculo Luxon', () => {
  it('VP0: o gerador produz cenários com e sem horários livres (o oráculo não é trivial)', () => {
    const amostra = fc.sample(arbCenario, { numRuns: 300, seed: 42 });
    const naoVazios = amostra.filter(
      ({ ctx, dataLocal }) => horariosLivres({ ...ctx, dataLocal }).length > 0,
    ).length;
    expect(naoVazios).toBeGreaterThan(30);
    expect(naoVazios).toBeLessThan(290);
  }, 60_000);

  it('VP1 (RN-02..RN-10, RN-20): horariosLivres == oráculo ingênuo minuto a minuto', () => {
    fc.assert(
      fc.property(arbCenario, ({ ctx, dataLocal }) => {
        const obtido = horariosLivres({ ...ctx, dataLocal });
        const { livres } = oraculo(ctx, dataLocal);
        expect(obtido).toEqual(livres);
      }),
      { numRuns: RUNS },
    );
  }, 300_000);

  it('VP2 (ordem de erros): validarHorario dá o mesmo código do oráculo em instantes do dia', () => {
    fc.assert(
      fc.property(
        arbCenario,
        fc.integer({ min: 0, max: 1439 }),
        fc.constantFrom(0, 0, 0, 1, 999, 30_000),
        ({ ctx, dataLocal }, k, ms) => {
          const { avaliar, primeiraOcorrencia } = oraculo(ctx, dataLocal);
          const lista = [...primeiraOcorrencia].sort((a, b) => a - b);
          const u = lista[k % lista.length]!;
          const r = validarHorario({ ...ctx, inicio: u + ms });
          const obtido = r.ok ? 'OK' : r.codigo;
          const esperado = ms === 0 ? avaliar(u) : 'HORARIO_FORA_DA_GRADE';
          expect(obtido).toBe(esperado);
        },
      ),
      { numRuns: RUNS },
    );
  }, 300_000);

  it('VP3 (RN-13): proximosHorariosLivres == concatenação dos dias filtrada', () => {
    fc.assert(
      fc.property(
        arbCenario,
        fc.integer({ min: 0, max: 1439 }),
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 0, max: 2 }),
        ({ ctx }, k, n, diasMax) => {
          const fuso = ctx.politicas.fuso;
          const aPartirDe = ctx.agora + k * MIN + 123;
          const d0 = DateTime.fromMillis(aPartirDe, { zone: fuso }).startOf('day');
          const esperado: number[] = [];
          for (let d = 0; d <= diasMax; d++) {
            const data = d0.plus({ days: d }).toISODate()!;
            esperado.push(
              ...horariosLivres({ ...ctx, dataLocal: data }).filter((x) => x >= aPartirDe),
            );
          }
          expect(proximosHorariosLivres(ctx, aPartirDe, n, diasMax)).toEqual(esperado.slice(0, n));
        },
      ),
      { numRuns: 150 },
    );
  }, 300_000);

  it('VP4 (RN-20/RN-11): podeCriar pelo DONO com profissional apto == validarHorario no balcão', () => {
    fc.assert(
      fc.property(arbCenario, fc.integer({ min: 0, max: 1439 }), ({ ctx, dataLocal }, k) => {
        const { primeiraOcorrencia } = oraculo(ctx, dataLocal);
        const lista = [...primeiraOcorrencia];
        const u = lista[k % lista.length]!;
        const semOrigem: Omit<ContextoAgenda, 'origem'> & { origem?: unknown } = { ...ctx };
        delete semOrigem.origem;
        const a = podeCriar({
          ator: Papel.DONO,
          profissional: { ativo: true, executaServico: true },
          inicio: u,
          contexto: semOrigem,
        });
        const b = validarHorario({ ...ctx, origem: 'ESTABELECIMENTO', inicio: u });
        expect(a.ok ? 'OK' : a.codigo).toBe(b.ok ? 'OK' : b.codigo);
      }),
      { numRuns: 200 },
    );
  }, 300_000);
});

describe('V propriedades de intervalos e alocação', () => {
  const arbInts = fc.array(
    fc
      .tuple(fc.integer({ min: 0, max: 60 }), fc.integer({ min: -3, max: 20 }))
      .map(([a, l]) => ({ inicio: a, fim: a + l })),
    { maxLength: 8 },
  );
  const pontos = (is: Intervalo[]) => {
    const s = new Set<number>();
    for (const i of is) for (let x = i.inicio; x < i.fim; x++) s.add(x);
    return s;
  };

  it('VP5 (RN-01): unir e subtrair == oráculo de conjunto de pontos; saída normalizada', () => {
    fc.assert(
      fc.property(arbInts, arbInts, (base, remover) => {
        const u = unir(base);
        expect([...pontos(u)].sort((a, b) => a - b)).toEqual(
          [...pontos(base)].sort((a, b) => a - b),
        );
        const r = subtrair(base, remover);
        const pr = pontos(remover);
        expect([...pontos(r)].sort((a, b) => a - b)).toEqual(
          [...pontos(base)].filter((x) => !pr.has(x)).sort((a, b) => a - b),
        );
        for (const out of [u, r])
          for (let i = 0; i < out.length; i++) {
            expect(out[i]!.inicio).toBeLessThan(out[i]!.fim);
            if (i > 0) expect(out[i - 1]!.fim).toBeLessThan(out[i]!.inicio); // nem adjacentes
          }
      }),
      { numRuns: 1000 },
    );
  });

  it('VP6 (RN-12): escolherProfissional == ordenação ingênua, independente da entrada', () => {
    const arbCand = fc.record({
      id: fc.constantFrom('a', 'b', 'c', 'd', 'aa', 'B'),
      criadoEm: fc.integer({ min: 0, max: 3 }),
      executaServico: fc.boolean(),
      ativo: fc.boolean(),
      livre: fc.boolean(),
      agendamentosNoDia: fc.integer({ min: 0, max: 3 }),
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(arbCand, { selector: (c) => c.id, maxLength: 6 }),
        fc.integer(),
        (cands, seed) => {
          const aptos = cands.filter((c) => c.ativo !== false && c.executaServico && c.livre);
          const esperado = [...aptos]
            .sort(
              (x, y) =>
                x.agendamentosNoDia - y.agendamentosNoDia ||
                x.criadoEm - y.criadoEm ||
                (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
            )
            .map((c) => c.id);
          expect(escolherProfissional(cands)).toEqual(esperado);
          const emb = [...cands].sort(() => 0).reverse();
          if (seed % 2 === 0) emb.reverse();
          expect(escolherProfissional(emb)).toEqual(esperado);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
