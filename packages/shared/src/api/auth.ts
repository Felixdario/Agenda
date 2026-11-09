import { z } from 'zod';
import { PAPEIS } from '../status';

export const registroSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  email: z.email().max(200),
  senha: z.string().min(8).max(200),
});
export type Registro = z.infer<typeof registroSchema>;

export const loginSchema = z.object({
  email: z.email().max(200),
  senha: z.string().min(1).max(200),
});
export type Login = z.infer<typeof loginSchema>;

export const usuarioSessaoSchema = z.object({
  id: z.string(),
  nome: z.string(),
  email: z.string(),
  papel: z.enum(PAPEIS),
  estabelecimentoId: z.string().nullable(),
  profissionalId: z.string().nullable(),
});
export type UsuarioSessao = z.infer<typeof usuarioSessaoSchema>;
