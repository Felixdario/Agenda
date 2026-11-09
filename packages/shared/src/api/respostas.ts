import { z } from 'zod';
import { PAPEIS, STATUS_AGENDAMENTO } from '../status';
import { usuarioSessaoSchema } from './auth';
import { dataLocalSchema, horaLocalSchema, instanteSchema } from './comum';

/**
 * Schemas das respostas da API. O front valida cada resposta com eles (D-17), e uma mudança de
 * formato na API quebra no cliente com um erro claro, em vez de virar `undefined` na tela.
 */

const statusSchema = z.enum(STATUS_AGENDAMENTO);

export const politicasPublicasSchema = z.object({
  granularidadeMin: z.number().int(),
  antecedenciaMinimaMin: z.number().int(),
  horizonteDias: z.number().int(),
  prazoCancelamentoHoras: z.number().int(),
});
export type PoliticasPublicas = z.infer<typeof politicasPublicasSchema>;

export const servicoPublicoSchema = z.object({
  id: z.string(),
  nome: z.string(),
  duracaoMin: z.number().int(),
  precoCentavos: z.number().int(),
  preparoMin: z.number().int(),
  limpezaMin: z.number().int(),
});
export type ServicoPublico = z.infer<typeof servicoPublicoSchema>;

export const profissionalPublicoSchema = z.object({
  id: z.string(),
  nome: z.string(),
  servicoIds: z.array(z.string()),
});
export type ProfissionalPublico = z.infer<typeof profissionalPublicoSchema>;

/** GET /estabelecimentos/:slug */
export const estabelecimentoPublicoSchema = z.object({
  id: z.string(),
  slug: z.string(),
  nome: z.string(),
  fuso: z.string(),
  politicas: politicasPublicasSchema,
  servicos: z.array(servicoPublicoSchema),
  profissionais: z.array(profissionalPublicoSchema),
});
export type EstabelecimentoPublico = z.infer<typeof estabelecimentoPublicoSchema>;

/** GET /estabelecimentos/:slug/horarios */
export const horarioOferecidoSchema = z.object({
  inicio: instanteSchema,
  profissionalIds: z.array(z.string()),
});
export const horariosSchema = z.array(horarioOferecidoSchema);
export type HorarioOferecido = z.infer<typeof horarioOferecidoSchema>;

/** Resposta de agendar, remarcar e mudar status. */
export const agendamentoDtoSchema = z.object({
  id: z.string(),
  estabelecimentoId: z.string(),
  profissionalId: z.string(),
  clienteId: z.string(),
  servicoId: z.string(),
  servicoNome: z.string(),
  duracaoMin: z.number().int(),
  precoCentavos: z.number().int(),
  preparoMin: z.number().int(),
  limpezaMin: z.number().int(),
  inicio: instanteSchema,
  fim: instanteSchema,
  status: statusSchema,
  versao: z.number().int(),
});
export type AgendamentoDto = z.infer<typeof agendamentoDtoSchema>;

/** Item de GET /eu/agendamentos e da agenda do painel. */
export const agendamentoListaSchema = z.object({
  id: z.string(),
  estabelecimento: z.object({
    id: z.string(),
    nome: z.string(),
    slug: z.string(),
    fuso: z.string(),
  }),
  profissional: z.object({ id: z.string(), nome: z.string() }),
  cliente: z.object({ id: z.string(), nome: z.string(), email: z.string() }),
  servico: z.object({
    id: z.string(),
    nome: z.string(),
    duracaoMin: z.number().int(),
    precoCentavos: z.number().int(),
    preparoMin: z.number().int(),
    limpezaMin: z.number().int(),
  }),
  inicio: instanteSchema,
  fim: instanteSchema,
  inicioBloco: instanteSchema,
  fimBloco: instanteSchema,
  status: statusSchema,
  versao: z.number().int(),
});
export const agendamentosListaSchema = z.array(agendamentoListaSchema);
export type AgendamentoLista = z.infer<typeof agendamentoListaSchema>;

/** GET /agendamentos/:id/historico */
export const historicoSchema = z.array(
  z.object({
    tipo: z.enum(['STATUS', 'REMARCACAO']),
    de: statusSchema.nullable(),
    para: statusSchema.nullable(),
    autorUsuarioId: z.string().nullable(),
    em: instanteSchema,
    motivo: z.string().nullable(),
    inicioAnterior: instanteSchema.nullable(),
    inicioNovo: instanteSchema.nullable(),
  }),
);
export type Historico = z.infer<typeof historicoSchema>;

/** POST /auth/login */
export const loginRespostaSchema = z.object({
  token: z.string(),
  expiraEm: instanteSchema,
  usuario: usuarioSessaoSchema,
});

/** GET /auth/eu (com ?estabelecimento=slug, a situação do cliente lá). */
export const euSchema = z.object({
  usuario: usuarioSessaoSchema,
  estabelecimento: z
    .object({
      clienteId: z.string(),
      ativosFuturos: z.number().int(),
      limiteAgendamentosAtivos: z.number().int(),
      bloqueado: z.boolean(),
    })
    .optional(),
});
export type Eu = z.infer<typeof euSchema>;

export const papelSchema = z.enum(PAPEIS);

// ───────────────────────── painel ─────────────────────────

export const politicasCompletasSchema = politicasPublicasSchema.extend({
  limiteAgendamentosAtivos: z.number().int(),
  limiteFaltas: z.number().int(),
  confirmacaoAutomatica: z.boolean(),
});
export type PoliticasCompletas = z.infer<typeof politicasCompletasSchema>;

/** GET /painel/estabelecimento e PATCH /painel/estabelecimento/politicas */
export const estabelecimentoPainelSchema = z.object({
  id: z.string(),
  slug: z.string(),
  nome: z.string(),
  fuso: z.string(),
  politicas: politicasCompletasSchema,
});
export type EstabelecimentoPainel = z.infer<typeof estabelecimentoPainelSchema>;

const trechoInstanteSchema = z.object({ inicio: instanteSchema, fim: instanteSchema });

/** GET /painel/agenda */
export const agendaPainelSchema = z.object({
  data: dataLocalSchema,
  fuso: z.string(),
  profissionais: z.array(
    z.object({
      profissional: z.object({ id: z.string(), nome: z.string(), ativo: z.boolean() }),
      expediente: z.array(trechoInstanteSchema),
      agendamentos: z.array(agendamentoListaSchema),
      bloqueios: z.array(
        trechoInstanteSchema.extend({ id: z.string(), motivo: z.string().nullable() }),
      ),
      excecoes: z.array(
        z.object({
          id: z.string(),
          tipo: z.enum(['FOLGA', 'FERIADO', 'HORARIO_EXTRA']),
          inicio: horaLocalSchema.nullable(),
          fim: horaLocalSchema.nullable(),
        }),
      ),
    }),
  ),
});
export type AgendaPainel = z.infer<typeof agendaPainelSchema>;

export const servicoPainelSchema = servicoPublicoSchema.extend({ ativo: z.boolean() });
export const servicosPainelSchema = z.array(servicoPainelSchema);
export type ServicoPainel = z.infer<typeof servicoPainelSchema>;

export const profissionalPainelSchema = z.object({
  id: z.string(),
  nome: z.string(),
  ativo: z.boolean(),
  servicoIds: z.array(z.string()),
});
export const profissionaisPainelSchema = z.array(profissionalPainelSchema);
export type ProfissionalPainel = z.infer<typeof profissionalPainelSchema>;

/** GET e PUT /painel/profissionais/:id/jornada */
export const jornadaRespostaSchema = z.object({
  profissionalId: z.string(),
  dias: z.record(z.string(), z.array(z.object({ inicio: horaLocalSchema, fim: horaLocalSchema }))),
});
export type JornadaResposta = z.infer<typeof jornadaRespostaSchema>;

/** GET /painel/clientes */
export const clientesPainelSchema = z.array(
  z.object({
    id: z.string(),
    nome: z.string(),
    email: z.string(),
    ativosFuturos: z.number().int(),
    faltas: z.number().int(),
    bloqueado: z.boolean(),
    desbloqueadoEm: instanteSchema.nullable(),
  }),
);
export type ClientePainel = z.infer<typeof clientesPainelSchema>[number];

/** Respostas que só devolvem o id (remover bloqueio, remover exceção, criar exceção). */
export const idRespostaSchema = z.object({ id: z.string() });
export const bloqueioRespostaSchema = z.object({ id: z.string() }).loose();
