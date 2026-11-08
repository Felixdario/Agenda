import { describe, expect, it } from 'vitest';
import { contexto, CORTE, em, horas, NY, POLITICAS_PADRAO, SEGUNDA } from './apoio-testes';
import {
  type AgendamentoOcupante,
  type ServicoCopia,
  blocoDoAtendimento,
  horariosLivres,
  ocupacoesDosAgendamentos,
  proximosHorariosLivres,
  proximosHorariosLivresDeVarios,
  unirHorarios,
  validarBloqueio,
  validarHorario,
} from './disponibilidade';
import { JORNADA_VAZIA } from './expediente';

const MIN = 60_000;
const COM_PREPARO: ServicoCopia = {
  ...CORTE,
  nome: 'Química',
  duracaoMin: 30,
  preparoMin: 10,
  limpezaMin: 10,
};
const livres = (parcial: Parameters<typeof contexto>[0] = {}, data = SEGUNDA) =>
  horas(horariosLivres({ ...contexto(parcial), dataLocal: data }));
const validar = (iso: string, parcial: Parameters<typeof contexto>[0] = {}) =>
  validarHorario({ ...contexto(parcial), inicio: em(iso) });
const erro = (codigo: string) => ({ ok: false, codigo });

describe('RN-05 — bloqueios', () => {
  const bloqueios = [{ inicio: em('2026-03-02T11:00'), fim: em('2026-03-02T11:40') }];

  it('RN-05: bloqueio deixa o horário indisponível (HORARIO_INDISPONIVEL, não FORA_DO_EXPEDIENTE)', () => {
    expect(validar('2026-03-02T11:00', { bloqueios })).toMatchObject(erro('HORARIO_INDISPONIVEL'));
    expect(validar('2026-03-02T10:45', { bloqueios })).toMatchObject(erro('HORARIO_INDISPONIVEL'));
    expect(validar('2026-03-02T11:30', { bloqueios })).toMatchObject(erro('HORARIO_INDISPONIVEL'));
  });

  it('RN-05: bloqueio não muda o expediente — horário encostado continua livre', () => {
    expect(validar('2026-03-02T10:30', { bloqueios }).ok).toBe(true);
    const r = livres({ bloqueios });
    expect(r).toContain('10:30');
    expect(r).not.toContain('11:00');
    expect(r).not.toContain('11:15');
  });
});

describe('RN-06 — ocupação de agendamentos', () => {
  it('RN-06: preparo e limpeza ocupam a agenda (bloco [início − preparo, fim + limpeza))', () => {
    const inicio = em('2026-03-02T10:00');
    expect(blocoDoAtendimento(inicio, COM_PREPARO)).toEqual({
      inicio: inicio - 10 * MIN,
      fim: inicio + 40 * MIN,
    });
    const ocupacoes = [blocoDoAtendimento(inicio, COM_PREPARO)]; // 09:50–10:40
    expect(validar('2026-03-02T09:30', { ocupacoes })).toMatchObject(erro('HORARIO_INDISPONIVEL'));
    expect(validar('2026-03-02T10:30', { ocupacoes })).toMatchObject(erro('HORARIO_INDISPONIVEL'));
    expect(validar('2026-03-02T10:45', { ocupacoes }).ok).toBe(true);
    expect(validar('2026-03-02T09:15', { ocupacoes }).ok).toBe(true); // termina 09:45
  });

  it('RN-06: cancelamento libera o horário na hora', () => {
    const ag: AgendamentoOcupante = {
      inicio: em('2026-03-02T10:00'),
      status: 'CONFIRMADO',
      servico: CORTE,
    };
    expect(
      validar('2026-03-02T10:00', { ocupacoes: ocupacoesDosAgendamentos([ag]) }),
    ).toMatchObject(erro('HORARIO_INDISPONIVEL'));
    const cancelado = { ...ag, status: 'CANCELADO' as const };
    expect(ocupacoesDosAgendamentos([cancelado])).toEqual([]);
    expect(
      validar('2026-03-02T10:00', { ocupacoes: ocupacoesDosAgendamentos([cancelado]) }).ok,
    ).toBe(true);
  });

  it('RN-06: todos os status exceto CANCELADO ocupam agenda', () => {
    for (const status of ['PENDENTE', 'CONFIRMADO', 'CONCLUIDO', 'NAO_COMPARECEU'] as const) {
      expect(ocupacoesDosAgendamentos([{ inicio: 0, status, servico: CORTE }])).toHaveLength(1);
    }
  });
});

describe('RN-07 — grade e encaixe', () => {
  it('RN-07: início fora da grade é recusado com HORARIO_FORA_DA_GRADE', () => {
    expect(validar('2026-03-02T09:10')).toMatchObject(erro('HORARIO_FORA_DA_GRADE'));
    expect(validarHorario({ ...contexto(), inicio: em('2026-03-02T09:15') + 1000 })).toMatchObject(
      erro('HORARIO_FORA_DA_GRADE'),
    );
    expect(validar('2026-03-02T09:15').ok).toBe(true);
  });

  it('RN-07: a grade é alinhada à meia-noite local (D-06), não ao início do trecho', () => {
    const jornada = { ...JORNADA_VAZIA, 1: [{ inicio: '09:10', fim: '10:00' }] };
    expect(livres({ jornada })).toEqual(['09:15', '09:30']);
  });

  it('RN-07: grade no fuso local mesmo com deslocamento de meia hora (Asia/Kolkata)', () => {
    const politicas = { ...POLITICAS_PADRAO, fuso: 'Asia/Kolkata', granularidadeMin: 60 };
    const r = horariosLivres({
      ...contexto({ politicas, agora: em('2026-03-01T00:00', 'Asia/Kolkata') }),
      dataLocal: SEGUNDA,
    });
    expect(horas(r, 'Asia/Kolkata')).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
    ]);
    expect(new Date(r[0]!).toISOString()).toBe('2026-03-02T03:30:00.000Z');
  });

  it('RN-07: atendimento atravessando o almoço 12:00–13:00 não é oferecido', () => {
    const servico = { ...CORTE, duracaoMin: 45 };
    const r = livres({ servico });
    expect(r).toContain('11:15');
    expect(r).not.toContain('11:30');
    expect(r).not.toContain('12:00');
    expect(r).toContain('13:00');
    expect(validar('2026-03-02T11:30', { servico })).toMatchObject(erro('FORA_DO_EXPEDIENTE'));
  });

  it('RN-07: preparo antes do início do expediente não cabe (D-03)', () => {
    const r = livres({ servico: COM_PREPARO });
    expect(r).not.toContain('09:00');
    expect(r[0]).toBe('09:15');
    expect(validar('2026-03-02T09:00', { servico: COM_PREPARO })).toMatchObject(
      erro('FORA_DO_EXPEDIENTE'),
    );
  });

  it('RN-07: limpeza depois do fim do expediente não cabe (D-03)', () => {
    const r = livres({ servico: COM_PREPARO });
    expect(r).toContain('17:15'); // 17:05–17:55
    expect(r).not.toContain('17:30'); // 17:20–18:10
    expect(r).not.toContain('11:30'); // limpeza até 12:10
    expect(r).toContain('11:15');
  });
});

describe('RN-08 — o serviço inteiro precisa caber', () => {
  it('RN-08: serviço maior que o tempo restante do expediente não é oferecido', () => {
    const servico = { ...CORTE, duracaoMin: 45 };
    const r = livres({ servico });
    expect(r).toContain('17:15');
    expect(r).not.toContain('17:30');
    expect(validar('2026-03-02T17:30', { servico })).toMatchObject(erro('FORA_DO_EXPEDIENTE'));
  });

  it('RN-08: serviço mais longo que o trecho inteiro não aparece no trecho', () => {
    const r = livres({ servico: { ...CORTE, duracaoMin: 240 } });
    expect(r.every((h) => h >= '13:00')).toBe(true);
    expect(r).toEqual(['13:00', '13:15', '13:30', '13:45', '14:00']);
  });
});

describe('RN-09 — antecedência mínima', () => {
  const agora = em('2026-03-02T07:00');

  it('RN-09: exatamente no limite da antecedência é aceito', () => {
    expect(validar('2026-03-02T09:00', { agora }).ok).toBe(true);
    expect(livres({ agora })[0]).toBe('09:00');
  });

  it('RN-09: um instante antes do limite é recusado com ANTECEDENCIA_MINIMA', () => {
    expect(validar('2026-03-02T09:00', { agora: agora + 1 })).toMatchObject(
      erro('ANTECEDENCIA_MINIMA'),
    );
    expect(livres({ agora: agora + 1 })[0]).toBe('09:15');
  });

  it('RN-09: horário no passado nunca é oferecido nem aceito para o cliente', () => {
    const tarde = em('2026-03-02T15:00');
    expect(validar('2026-03-02T10:00', { agora: tarde })).toMatchObject(
      erro('ANTECEDENCIA_MINIMA'),
    );
    expect(livres({ agora: tarde })[0]).toBe('17:00');
    expect(livres({ agora: em('2026-03-03T08:00') })).toEqual([]);
  });
});

describe('RN-10 — horizonte em dias de calendário', () => {
  it('RN-10: último dia do horizonte aberto e o dia seguinte fechado', () => {
    // agora 2026-03-01 08:00, horizonte 60 → último dia 2026-04-30 (quinta)
    expect(livres({}, '2026-04-30')).toHaveLength(livres().length);
    expect(livres({}, '2026-05-01')).toEqual([]);
    expect(validar('2026-05-01T09:00')).toMatchObject(erro('ALEM_DO_HORIZONTE'));
    expect(validar('2026-04-30T17:30').ok).toBe(true);
  });

  it('RN-10: o "hoje" é a data local do estabelecimento, não a de UTC', () => {
    // 2026-03-01T02:30Z = 2026-02-28 23:30 em SP → último dia = 2026-02-28 + 1
    const ctx = {
      agora: Date.UTC(2026, 2, 1, 2, 30),
      politicas: { ...POLITICAS_PADRAO, horizonteDias: 1 },
    };
    expect(validar('2026-03-02T09:00', ctx)).toMatchObject(erro('ALEM_DO_HORIZONTE'));
    expect(validar('2026-03-01T10:00', ctx)).toMatchObject(erro('FORA_DO_EXPEDIENTE')); // domingo, dentro do horizonte
  });

  it('RN-10: virada de mês (31/01 → 01/02)', () => {
    const ctx = {
      agora: em('2026-01-31T10:00'),
      politicas: { ...POLITICAS_PADRAO, horizonteDias: 1 },
      excecoes: [
        { tipo: 'HORARIO_EXTRA' as const, data: '2026-02-01', inicio: '10:00', fim: '12:00' },
      ],
    };
    expect(validar('2026-02-01T10:00', ctx).ok).toBe(true);
    expect(validar('2026-02-02T10:00', ctx)).toMatchObject(erro('ALEM_DO_HORIZONTE'));
  });

  it('RN-10: virada de ano (31/12 → 01/01)', () => {
    const ctx = {
      agora: em('2026-12-31T23:00'),
      politicas: { ...POLITICAS_PADRAO, horizonteDias: 1 },
    };
    expect(livres(ctx, '2027-01-01')[0]).toBe('09:00');
    expect(livres(ctx, '2027-01-02')).toEqual([]);
    expect(validar('2027-01-02T09:00', ctx)).toMatchObject(erro('ALEM_DO_HORIZONTE'));
  });

  it('RN-10: horizonte zero permite só hoje', () => {
    const ctx = {
      agora: em('2026-03-02T06:00'),
      politicas: { ...POLITICAS_PADRAO, horizonteDias: 0 },
    };
    expect(livres(ctx).length).toBeGreaterThan(0);
    expect(livres(ctx, '2026-03-03')).toEqual([]);
  });
});

describe('RN-13 — próximos horários livres', () => {
  it('RN-13: devolve até 5 próximos horários livres, pulando ocupados e atravessando dias', () => {
    const ctx = contexto({
      ocupacoes: [{ inicio: em('2026-03-02T09:00'), fim: em('2026-03-02T17:30') }],
    });
    const r = proximosHorariosLivres(ctx, em('2026-03-02T09:00'));
    expect(r.map((t) => new Date(t).toISOString())).toEqual([
      '2026-03-02T20:30:00.000Z',
      '2026-03-03T12:00:00.000Z',
      '2026-03-03T12:15:00.000Z',
      '2026-03-03T12:30:00.000Z',
      '2026-03-03T12:45:00.000Z',
    ]);
  });

  it('RN-13: respeita n e o limite de dias; lista vazia se nada cabe', () => {
    expect(proximosHorariosLivres(contexto(), em('2026-03-02T09:00'), 2)).toHaveLength(2);
    expect(
      proximosHorariosLivres(contexto({ jornada: JORNADA_VAZIA }), em('2026-03-02T09:00')),
    ).toEqual([]);
    expect(proximosHorariosLivres(contexto(), em('2026-03-07T13:00'), 5, 1)).toEqual([]); // sáb após 13h, dom fechado
  });

  it('RN-13: "qualquer profissional" une os próximos horários de todos', () => {
    const a = contexto({
      ocupacoes: [{ inicio: em('2026-03-02T09:00'), fim: em('2026-03-02T10:00') }],
    });
    const b = contexto({
      ocupacoes: [{ inicio: em('2026-03-02T09:30'), fim: em('2026-03-02T12:00') }],
    });
    expect(horas(proximosHorariosLivresDeVarios([a, b], em('2026-03-02T09:00'), 4))).toEqual([
      '09:00',
      '10:00',
      '10:15',
      '10:30',
    ]);
    expect(
      unirHorarios([
        [3, 1],
        [2, 3],
      ]),
    ).toEqual([1, 2, 3]);
  });
});

describe('RN-14 — cópia do serviço', () => {
  it('RN-14: serviço editado não altera o bloco do agendamento existente', () => {
    const copia: ServicoCopia = { ...COM_PREPARO };
    const ag: AgendamentoOcupante = {
      inicio: em('2026-03-02T10:00'),
      status: 'CONFIRMADO',
      servico: copia,
    };
    const antes = ocupacoesDosAgendamentos([ag]);
    const servicoEditado: ServicoCopia = { ...COM_PREPARO, duracaoMin: 90, limpezaMin: 30 };
    expect(servicoEditado.duracaoMin).not.toBe(copia.duracaoMin);
    expect(ocupacoesDosAgendamentos([ag])).toEqual(antes);
    expect(antes).toEqual([{ inicio: em('2026-03-02T09:50'), fim: em('2026-03-02T10:40') }]);
  });
});

describe('RN-20 — balcão (disponibilidade)', () => {
  const balcao = { origem: 'ESTABELECIMENTO' as const, agora: em('2026-03-02T09:50') };

  it('RN-20: estabelecimento não tem antecedência mínima nem horizonte', () => {
    expect(validar('2026-03-02T10:00', balcao).ok).toBe(true);
    expect(validar('2027-03-02T10:00', balcao).ok).toBe(true);
    expect(livres(balcao)[0]).toBe('10:00');
  });

  it('RN-20: horário no passado é recusado com HORARIO_NO_PASSADO', () => {
    expect(validar('2026-03-02T09:45', balcao)).toMatchObject(erro('HORARIO_NO_PASSADO'));
  });

  it('RN-20: continua sujeito a expediente e conflitos', () => {
    expect(validar('2026-03-02T19:00', balcao)).toMatchObject(erro('FORA_DO_EXPEDIENTE'));
    const ocupacoes = [{ inicio: em('2026-03-02T10:00'), fim: em('2026-03-02T10:30') }];
    expect(validar('2026-03-02T10:00', { ...balcao, ocupacoes })).toMatchObject(
      erro('HORARIO_INDISPONIVEL'),
    );
  });
});

describe('ordem dos erros e dados inválidos', () => {
  it('RN-07/09/10: grade vem antes de antecedência, que vem antes de horizonte, expediente e conflito', () => {
    const agora = em('2026-03-02T09:00');
    expect(validar('2026-03-02T09:05', { agora })).toMatchObject(erro('HORARIO_FORA_DA_GRADE'));
    expect(
      validar('2026-03-01T03:00', { agora, politicas: { ...POLITICAS_PADRAO, horizonteDias: 0 } }),
    ).toMatchObject(erro('ANTECEDENCIA_MINIMA'));
    expect(validar('2026-06-07T03:00')).toMatchObject(erro('ALEM_DO_HORIZONTE'));
    const ocupacoes = [{ inicio: em('2026-03-02T19:00'), fim: em('2026-03-02T20:00') }];
    expect(validar('2026-03-02T19:00', { ocupacoes })).toMatchObject(erro('FORA_DO_EXPEDIENTE'));
  });

  it('dados inválidos (fuso, granularidade, serviço) → DADOS_INVALIDOS e nenhuma vaga', () => {
    expect(
      validar('2026-03-02T10:00', { politicas: { ...POLITICAS_PADRAO, fuso: 'X/Y' } }),
    ).toMatchObject(erro('DADOS_INVALIDOS'));
    expect(
      validar('2026-03-02T10:00', { politicas: { ...POLITICAS_PADRAO, granularidadeMin: 0 } }),
    ).toMatchObject(erro('DADOS_INVALIDOS'));
    expect(validar('2026-03-02T10:00', { servico: { ...CORTE, duracaoMin: 0 } })).toMatchObject(
      erro('DADOS_INVALIDOS'),
    );
    expect(livres({ politicas: { ...POLITICAS_PADRAO, granularidadeMin: -15 } })).toEqual([]);
    expect(livres({}, '2026-02-31')).toEqual([]);
  });

  it('RN-02: preparo pode usar o expediente do dia anterior quando ele é contínuo', () => {
    const jornada = {
      ...JORNADA_VAZIA,
      1: [{ inicio: '00:00', fim: '02:00' }],
      7: [{ inicio: '22:00', fim: '24:00' }],
    };
    const ctx = {
      jornada,
      servico: COM_PREPARO,
      politicas: { ...POLITICAS_PADRAO, fuso: NY },
      agora: em('2026-03-01T00:00', NY),
    };
    expect(horas(horariosLivres({ ...contexto(ctx), dataLocal: SEGUNDA }), NY)[0]).toBe('00:00');
  });
});

describe('D-05 — bloqueio sobre agendamento', () => {
  const ocupacoes = [{ inicio: em('2026-03-02T10:00'), fim: em('2026-03-02T10:30') }];

  it('RN-05: bloqueio sobre o bloco de um agendamento existente é recusado', () => {
    const r = validarBloqueio(
      { inicio: em('2026-03-02T10:15'), fim: em('2026-03-02T11:00') },
      ocupacoes,
    );
    expect(r).toMatchObject({ ok: false, codigo: 'HORARIO_INDISPONIVEL' });
  });

  it('RN-05: bloqueio encostado no agendamento é aceito; bloqueio vazio é inválido', () => {
    expect(
      validarBloqueio({ inicio: em('2026-03-02T10:30'), fim: em('2026-03-02T11:00') }, ocupacoes)
        .ok,
    ).toBe(true);
    expect(
      validarBloqueio({ inicio: em('2026-03-02T11:00'), fim: em('2026-03-02T11:00') }, []),
    ).toMatchObject({
      ok: false,
      codigo: 'DADOS_INVALIDOS',
    });
  });
});
