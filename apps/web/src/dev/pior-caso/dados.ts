/**
 * Fixtures do pior caso (fase 6, break-ui). Só entram na página de desenvolvimento
 * `/dev/pior-caso`; o front de produção nunca importa este arquivo.
 *
 * Os valores vêm do CATALOG do break-ui ou dos limites dos schemas de @agenda/shared
 * (nome de serviço até 120, duração até 480 min, preço até R$ 100.000,00, e-mail até 200).
 */
import type {
  AgendaPainel,
  AgendamentoLista,
  ClientePainel,
  EstabelecimentoPainel,
  EstabelecimentoPublico,
  Eu,
  Historico,
  HorarioOferecido,
  JornadaResposta,
  ProfissionalPainel,
  ServicoPainel,
  StatusAgendamento,
} from '@agenda/shared';
import { instanteDeLocal, proximosDias, somarDias } from '@/lib/tempo';

export const CENARIOS = ['demo', 'pior', 'sem-vaga', 'vazio'] as const;
export type Cenario = (typeof CENARIOS)[number];

export const TELAS = [
  'publica',
  'meus',
  'painel-agenda',
  'painel-servicos',
  'painel-profissionais',
  'painel-clientes',
] as const;
export type Tela = (typeof TELAS)[number];

/** Rótulos da barra de controle (ferramenta de desenvolvimento, não é interface do produto). */
export const ROTULOS: Record<Cenario | Tela | 'offline' | 'online', string> = {
  demo: 'Dados de demo',
  pior: 'Pior caso',
  'sem-vaga': 'Sem vaga',
  vazio: 'Vazio',
  publica: 'Página pública',
  meus: 'Meus agendamentos',
  'painel-agenda': 'Painel: agenda',
  'painel-servicos': 'Painel: serviços',
  'painel-profissionais': 'Painel: profissionais',
  'painel-clientes': 'Painel: clientes',
  offline: 'Offline',
  online: 'Online',
};

export const SLUG_FIXTURE = 'pior-caso';
const FUSO = 'America/Sao_Paulo';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const em = (data: string, hora: string) =>
  new Date(instanteDeLocal(data, hora, FUSO)).toISOString();
const mais = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString();

// ───────────────────────── catálogo ─────────────────────────

const NOME_ESTAB_LONGO = 'Clínica Integrada de Estética e Bem-Estar Wiśniewska-Kowalczyk';
/** 60 caracteres sem espaço: a palavra que não quebra. */
const PALAVRA_60 = 'Hidroxiapatitananocristalinaremineralizantedentalprofissional';

const SERVICOS_PIOR: ServicoPainel[] = [
  {
    id: id(1),
    nome: 'Coloração completa com mechas, tonalizante, hidratação profunda e escova modeladora',
    duracaoMin: 240,
    precoCentavos: 999_999,
    preparoMin: 15,
    limpezaMin: 30,
    ativo: true,
  },
  {
    id: id(2),
    nome: PALAVRA_60,
    duracaoMin: 45,
    precoCentavos: 35_000,
    preparoMin: 5,
    limpezaMin: 10,
    ativo: true,
  },
  {
    id: id(3),
    nome: 'Dia de noiva',
    duracaoMin: 480,
    precoCentavos: 450_000,
    preparoMin: 30,
    limpezaMin: 30,
    ativo: true,
  },
  {
    id: id(4),
    nome: 'Pé',
    duracaoMin: 15,
    precoCentavos: 0,
    preparoMin: 0,
    limpezaMin: 0,
    ativo: true,
  },
  {
    id: id(5),
    nome: 'Avaliação gratuita (desativada)',
    duracaoMin: 5,
    precoCentavos: 0,
    preparoMin: 0,
    limpezaMin: 0,
    ativo: false,
  },
];

const PROFISSIONAIS_PIOR: ProfissionalPainel[] = [
  {
    id: id(101),
    nome: 'Konstantin Oberhauser-Wettstein',
    ativo: true,
    servicoIds: [id(1), id(2), id(3), id(4)],
  },
  { id: id(102), nome: 'Jo', ativo: true, servicoIds: [id(2), id(4)] },
  { id: id(103), nome: 'Đặng Thị Ngọc Hân', ativo: true, servicoIds: [id(1), id(3)] },
  { id: id(104), nome: 'J', ativo: false, servicoIds: [] },
];

const CLIENTES = [
  ['Aleksandra Wiśniewska-Kowalczyk', 'aleksandra.wisniewska-kowalczyk@pior-caso.example.com'],
  ['Christopher Alexander Montgomery III', 'christopher.montgomery@pior-caso.example.com'],
  ['Jo', 'jo@pior-caso.example.com'],
  ['J', 'a@b.co'],
  ['Đặng Thị Ngọc Hân', 'dang.thi.ngoc.han@pior-caso.example.com'],
  ['🦊 Fox', 'fox@pior-caso.example.com'],
  ['王秀英', 'wang.xiuying@pior-caso.example.com'],
  ['María José de la Cruz y Fernández', 'first.last+billing-notifications@pior-caso.example.com'],
  ["Seán O'Brien-Ó Súilleabháin", 'sean.obrien@pior-caso.example.com'],
  ['👩🏽‍💻 Priya', 'priya@pior-caso.example.com'],
  ['Bartholomew Fitzgerald', 'bartholomew.fitzgerald@northwind-industries-holdings.example.com'],
] as const;

function estabPublico(
  servicos: ServicoPainel[],
  profissionais: ProfissionalPainel[],
  nome: string,
) {
  return {
    id: id(900),
    slug: SLUG_FIXTURE,
    nome,
    fuso: FUSO,
    politicas: {
      granularidadeMin: 15,
      antecedenciaMinimaMin: 120,
      horizonteDias: 60,
      prazoCancelamentoHoras: 4,
    },
    servicos: servicos
      .filter((s) => s.ativo)
      .map(({ ativo: _a, ...s }) => {
        void _a;
        return s;
      }),
    profissionais: profissionais
      .filter((p) => p.ativo)
      .map((p) => ({ id: p.id, nome: p.nome, servicoIds: p.servicoIds })),
  } satisfies EstabelecimentoPublico;
}

function agendamento(
  n: number,
  inicio: string,
  servico: ServicoPainel,
  profissional: { id: string; nome: string },
  cliente: readonly [string, string],
  status: StatusAgendamento,
  nomeEstab: string,
): AgendamentoLista {
  const fim = mais(inicio, servico.duracaoMin);
  return {
    id: id(10_000 + n),
    estabelecimento: { id: id(900), nome: nomeEstab, slug: SLUG_FIXTURE, fuso: FUSO },
    profissional,
    cliente: { id: id(20_000 + n), nome: cliente[0], email: cliente[1] },
    servico: {
      id: servico.id,
      nome: servico.nome,
      duracaoMin: servico.duracaoMin,
      precoCentavos: servico.precoCentavos,
      preparoMin: servico.preparoMin,
      limpezaMin: servico.limpezaMin,
    },
    inicio,
    fim,
    inicioBloco: mais(inicio, -servico.preparoMin),
    fimBloco: mais(fim, servico.limpezaMin),
    status,
    versao: 0,
  };
}

const STATUS_CICLO: StatusAgendamento[] = [
  'CONFIRMADO',
  'CONFIRMADO',
  'PENDENTE',
  'CONFIRMADO',
  'CONCLUIDO',
  'NAO_COMPARECEU',
  'CONFIRMADO',
];

// ───────────────────────── respostas por cenário ─────────────────────────

export interface Fixture {
  estabelecimento: EstabelecimentoPublico;
  estabelecimentoPainel: EstabelecimentoPainel;
  eu: Eu;
  horarios: (servicoId: string, profissionalId: string | null, data: string) => HorarioOferecido[];
  meus: { futuros: AgendamentoLista[]; passados: AgendamentoLista[] };
  agenda: (data: string) => AgendaPainel;
  servicos: ServicoPainel[];
  profissionais: ProfissionalPainel[];
  clientes: ClientePainel[];
  historico: Historico;
  jornada: JornadaResposta['dias'];
  /** Próximos horários que a recusa 409 oferece. */
  proximos: (perdido: string) => string[];
}

function fixturePior(hoje: string): Fixture {
  const nome = NOME_ESTAB_LONGO;
  const [konstantin, jo] = PROFISSIONAIS_PIOR as [ProfissionalPainel, ProfissionalPainel];
  const servico15 = { ...SERVICOS_PIOR[0]!, duracaoMin: 15, preparoMin: 0, limpezaMin: 0 };
  const servico15b = { ...SERVICOS_PIOR[1]!, duracaoMin: 15, preparoMin: 0, limpezaMin: 0 };

  const agenda = (data: string): AgendaPainel => {
    // Konstantin: 40 atendimentos de 15 min, das 09:00 às 19:00, com todos os status.
    const deK = Array.from({ length: 40 }, (_, i) => {
      const inicio = mais(em(data, '09:00'), i * 15);
      return agendamento(
        i,
        inicio,
        i % 2 === 0 ? servico15 : servico15b,
        konstantin,
        CLIENTES[i % CLIENTES.length]!,
        STATUS_CICLO[i % STATUS_CICLO.length]!,
        nome,
      );
    });
    // Um cancelado no mesmo horário de um ativo (não aparece na grade, conta no resumo).
    deK.push(
      agendamento(99, em(data, '10:00'), servico15, konstantin, CLIENTES[5]!, 'CANCELADO', nome),
    );
    // Jo: serviços longos (8 h de "Dia de noiva" não cabe; 45 min com preparo e limpeza).
    const deJo = [0, 1, 2, 3, 4].map((i) =>
      agendamento(
        100 + i,
        mais(em(data, '10:00'), i * 75),
        SERVICOS_PIOR[1]!,
        jo,
        CLIENTES[(i + 3) % CLIENTES.length]!,
        STATUS_CICLO[(i + 2) % STATUS_CICLO.length]!,
        nome,
      ),
    );
    return {
      data,
      fuso: FUSO,
      profissionais: [
        {
          profissional: { id: konstantin.id, nome: konstantin.nome, ativo: true },
          expediente: [{ inicio: em(data, '09:00'), fim: em(data, '19:00') }],
          agendamentos: deK,
          bloqueios: [],
          excecoes: [{ id: id(501), tipo: 'HORARIO_EXTRA', inicio: '12:00', fim: '13:00' }],
        },
        {
          profissional: { id: jo.id, nome: jo.nome, ativo: true },
          expediente: [
            { inicio: em(data, '08:00'), fim: em(data, '12:00') },
            { inicio: em(data, '13:30'), fim: em(data, '22:00') },
          ],
          agendamentos: deJo,
          bloqueios: [
            {
              id: id(601),
              inicio: em(data, '17:00'),
              fim: em(data, '18:30'),
              motivo:
                'Consulta médica marcada há meses, com exames de rotina e retorno no mesmo dia',
            },
            { id: id(602), inicio: em(data, '20:00'), fim: em(data, '20:15'), motivo: null },
          ],
          excecoes: [{ id: id(502), tipo: 'FOLGA', inicio: '12:00', fim: '13:30' }],
        },
        {
          profissional: { id: id(103), nome: 'Đặng Thị Ngọc Hân', ativo: true },
          expediente: [],
          agendamentos: [],
          bloqueios: [],
          excecoes: [
            { id: id(503), tipo: 'FOLGA', inicio: null, fim: null },
            { id: id(504), tipo: 'FERIADO', inicio: null, fim: null },
          ],
        },
      ],
    };
  };

  const futuros = Array.from({ length: 12 }, (_, i) =>
    agendamento(
      200 + i,
      mais(em(somarDias(hoje, 1 + Math.floor(i / 3)), '09:00'), (i % 3) * 300),
      SERVICOS_PIOR[i % 4]!,
      PROFISSIONAIS_PIOR[i % 3]!,
      CLIENTES[0]!,
      (['CONFIRMADO', 'PENDENTE', 'CONFIRMADO', 'CANCELADO'] as const)[i % 4]!,
      nome,
    ),
  );
  // O primeiro já passou do prazo de cancelamento (começa daqui a 1 h).
  futuros[0] = {
    ...futuros[0]!,
    inicio: mais(new Date().toISOString(), 60),
    fim: mais(new Date().toISOString(), 300),
  };
  const passados = Array.from({ length: 30 }, (_, i) =>
    agendamento(
      300 + i,
      em(somarDias(hoje, -1 - i), '14:00'),
      SERVICOS_PIOR[i % 4]!,
      PROFISSIONAIS_PIOR[i % 3]!,
      CLIENTES[0]!,
      (['CONCLUIDO', 'NAO_COMPARECEU', 'CANCELADO'] as const)[i % 3]!,
      nome,
    ),
  );

  return {
    estabelecimento: estabPublico(SERVICOS_PIOR, PROFISSIONAIS_PIOR, nome),
    estabelecimentoPainel: {
      id: id(900),
      slug: SLUG_FIXTURE,
      nome,
      fuso: FUSO,
      politicas: {
        granularidadeMin: 15,
        antecedenciaMinimaMin: 120,
        horizonteDias: 60,
        prazoCancelamentoHoras: 4,
        limiteAgendamentosAtivos: 100,
        limiteFaltas: 100,
        confirmacaoAutomatica: false,
      },
    },
    eu: {
      usuario: {
        id: id(700),
        nome: 'Christopher Alexander Montgomery III',
        email: 'bartholomew.fitzgerald@northwind-industries-holdings.example.com',
        papel: 'DONO',
        estabelecimentoId: id(900),
        profissionalId: null,
      },
    },
    horarios: (_s, _p, data) => {
      const i = proximosDias(hoje, 14).indexOf(data);
      if (i % 3 === 0) return [];
      // Do primeiro ao último horário do dia: manhã, tarde e noite, 40 pílulas.
      return Array.from({ length: 40 }, (_, k) => ({
        inicio: mais(em(data, '08:00'), k * 15 + (k >= 20 ? 360 : 0)),
        profissionalIds: [id(101)],
      }));
    },
    meus: { futuros, passados },
    agenda,
    servicos: SERVICOS_PIOR,
    profissionais: PROFISSIONAIS_PIOR,
    clientes: CLIENTES.map(([n, e], i) => ({
      id: id(800 + i),
      nome: n,
      email: e,
      ativosFuturos: i === 0 ? 1284 : i % 4,
      faltas: i === 1 ? 12 : i % 3,
      bloqueado: i % 4 === 1,
      desbloqueadoEm: null,
    })),
    historico: [
      {
        tipo: 'STATUS',
        de: null,
        para: 'PENDENTE',
        autorUsuarioId: id(1),
        em: em(somarDias(hoje, -3), '08:12'),
        motivo: null,
        inicioAnterior: null,
        inicioNovo: null,
      },
      {
        tipo: 'REMARCACAO',
        de: null,
        para: null,
        autorUsuarioId: id(1),
        em: em(somarDias(hoje, -2), '19:40'),
        motivo:
          'Cliente pediu para trocar por causa de um imprevisto no trabalho; avisou por telefone e confirmou por mensagem',
        inicioAnterior: em(somarDias(hoje, -1), '09:00'),
        inicioNovo: em(hoje, '09:00'),
      },
      {
        tipo: 'STATUS',
        de: 'PENDENTE',
        para: 'CONFIRMADO',
        autorUsuarioId: id(1),
        em: em(somarDias(hoje, -1), '10:00'),
        motivo: null,
        inicioAnterior: null,
        inicioNovo: null,
      },
    ],
    jornada: {
      '1': [
        { inicio: '06:00', fim: '07:00' },
        { inicio: '08:00', fim: '10:00' },
        { inicio: '10:30', fim: '12:00' },
        { inicio: '13:00', fim: '15:00' },
        { inicio: '15:30', fim: '18:00' },
        { inicio: '19:00', fim: '24:00' },
      ],
      '2': [{ inicio: '09:00', fim: '18:00' }],
    },
    proximos: (perdido) => [
      mais(perdido, 15),
      mais(perdido, 24 * 60 + 30),
      mais(perdido, 3 * 24 * 60),
      mais(perdido, 3 * 24 * 60 + 15),
      mais(perdido, 9 * 24 * 60 + 600),
    ],
  };
}

function fixtureSemVaga(hoje: string): Fixture {
  const base = fixturePior(hoje);
  const servicos = SERVICOS_PIOR.slice(1, 4).map((s, i) => ({
    ...s,
    nome: ['Corte', 'Barba', 'Sobrancelha'][i]!,
  }));
  const profissionais = PROFISSIONAIS_PIOR.slice(0, 2).map((p) => ({
    ...p,
    servicoIds: servicos.map((s) => s.id),
  }));
  const dias = proximosDias(hoje, 14);
  return {
    ...base,
    estabelecimento: estabPublico(servicos, profissionais, 'Estúdio Sem Vaga'),
    // Profissional escolhido: nenhum dia com vaga. "Qualquer": só no 10º dia (a semana toda lotada).
    horarios: (_s, profissionalId, data) =>
      profissionalId === null && data === dias[9]
        ? [
            { inicio: em(data, '18:00'), profissionalIds: [profissionais[1]!.id] },
            { inicio: em(data, '18:15'), profissionalIds: [profissionais[1]!.id] },
          ]
        : [],
    proximos: () => [],
  };
}

function fixtureVazio(hoje: string): Fixture {
  const base = fixturePior(hoje);
  return {
    ...base,
    estabelecimento: estabPublico([], [], 'Recém-aberto'),
    estabelecimentoPainel: { ...base.estabelecimentoPainel, nome: 'Recém-aberto' },
    horarios: () => [],
    meus: { futuros: [], passados: [] },
    agenda: (data) => ({ data, fuso: FUSO, profissionais: [] }),
    servicos: [],
    profissionais: [],
    clientes: [],
    historico: [],
    jornada: {},
    proximos: () => [],
  };
}

export function fixtureDo(cenario: Exclude<Cenario, 'demo'>, hoje: string): Fixture {
  if (cenario === 'pior') return fixturePior(hoje);
  if (cenario === 'sem-vaga') return fixtureSemVaga(hoje);
  return fixtureVazio(hoje);
}
