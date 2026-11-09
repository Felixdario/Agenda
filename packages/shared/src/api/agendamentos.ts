import { z } from 'zod';
import { dataLocalSchema, idSchema, instanteSchema } from './comum';

export const consultaHorariosSchema = z.object({
  servicoId: idSchema,
  /** Ausente = qualquer profissional (RN-12). */
  profissionalId: idSchema.optional(),
  data: dataLocalSchema,
});
export type ConsultaHorarios = z.infer<typeof consultaHorariosSchema>;

export const criarAgendamentoSchema = z.object({
  servicoId: idSchema,
  /** Ausente ou null = qualquer profissional (RN-12). */
  profissionalId: idSchema.nullable().optional(),
  inicio: instanteSchema,
});
export type CriarAgendamento = z.infer<typeof criarAgendamentoSchema>;

export const remarcarSchema = z.object({
  inicio: instanteSchema,
  profissionalId: idSchema.optional(),
});
export type Remarcar = z.infer<typeof remarcarSchema>;

export const motivoSchema = z.object({ motivo: z.string().trim().max(500).optional() });
export type Motivo = z.infer<typeof motivoSchema>;

export const escopoAgendamentosSchema = z.object({
  escopo: z.enum(['futuros', 'passados']).default('futuros'),
});

/** Idempotency-Key (RN-22). */
export const chaveIdempotenciaSchema = z.string().trim().min(1).max(200);
