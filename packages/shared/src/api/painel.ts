import { z } from 'zod';
import { dataLocalSchema, horaLocalSchema, idSchema, instanteSchema } from './comum';

export const consultaAgendaSchema = z.object({
  data: dataLocalSchema,
  profissionalId: idSchema.optional(),
});

/** Balcão (RN-20): o cliente é indicado por e-mail. */
export const agendamentoBalcaoSchema = z.object({
  servicoId: idSchema,
  profissionalId: idSchema.nullable().optional(),
  inicio: instanteSchema,
  cliente: z.object({ email: z.email().max(200), nome: z.string().trim().min(1).max(120) }),
});
export type AgendamentoBalcao = z.infer<typeof agendamentoBalcaoSchema>;

export const bloqueioSchema = z.object({
  profissionalId: idSchema,
  inicio: instanteSchema,
  fim: instanteSchema,
  motivo: z.string().trim().max(200).optional(),
});

const minutos = (max: number) => z.number().int().min(0).max(max);

export const servicoSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  duracaoMin: z.number().int().min(5).max(480),
  precoCentavos: z.number().int().min(0).max(10_000_000),
  preparoMin: minutos(120).default(0),
  limpezaMin: minutos(120).default(0),
  ativo: z.boolean().default(true),
});
export const servicoParcialSchema = servicoSchema.partial();

export const profissionalSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  ativo: z.boolean().default(true),
  servicoIds: z.array(idSchema).default([]),
});
export const profissionalParcialSchema = profissionalSchema.partial();

export const trechoSchema = z.object({ inicio: horaLocalSchema, fim: horaLocalSchema });
/** Jornada por dia ISO ("1" = segunda … "7" = domingo). Dia ausente = sem expediente. */
export const jornadaSchema = z.object({
  dias: z.partialRecord(z.enum(['1', '2', '3', '4', '5', '6', '7']), z.array(trechoSchema).max(6)),
});

export const excecaoSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('FOLGA'),
    profissionalId: idSchema,
    data: dataLocalSchema,
    inicio: horaLocalSchema.optional(),
    fim: horaLocalSchema.optional(),
  }),
  z.object({
    tipo: z.literal('HORARIO_EXTRA'),
    profissionalId: idSchema,
    data: dataLocalSchema,
    inicio: horaLocalSchema,
    fim: horaLocalSchema,
  }),
  z.object({ tipo: z.literal('FERIADO'), data: dataLocalSchema }),
]);
export type ExcecaoEntrada = z.infer<typeof excecaoSchema>;

export const politicasSchema = z
  .object({
    granularidadeMin: z.number().int().min(5).max(120),
    antecedenciaMinimaMin: z
      .number()
      .int()
      .min(0)
      .max(60 * 24 * 30),
    horizonteDias: z.number().int().min(0).max(365),
    prazoCancelamentoHoras: z
      .number()
      .int()
      .min(0)
      .max(24 * 30),
    limiteAgendamentosAtivos: z.number().int().min(1).max(100),
    limiteFaltas: z.number().int().min(1).max(100),
    confirmacaoAutomatica: z.boolean(),
  })
  .partial();
