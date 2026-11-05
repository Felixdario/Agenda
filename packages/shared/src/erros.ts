import { z } from 'zod';

/**
 * Códigos de erro da API. Fonte da verdade: tabela "Códigos de erro" em
 * docs/regras-de-negocio.md. Qualquer mudança lá precisa ser refletida aqui 1:1.
 */
export const CodigoErro = {
  HORARIO_INDISPONIVEL: 'HORARIO_INDISPONIVEL',
  FORA_DO_EXPEDIENTE: 'FORA_DO_EXPEDIENTE',
  HORARIO_FORA_DA_GRADE: 'HORARIO_FORA_DA_GRADE',
  ANTECEDENCIA_MINIMA: 'ANTECEDENCIA_MINIMA',
  HORARIO_NO_PASSADO: 'HORARIO_NO_PASSADO',
  ALEM_DO_HORIZONTE: 'ALEM_DO_HORIZONTE',
  PROFISSIONAL_NAO_EXECUTA_SERVICO: 'PROFISSIONAL_NAO_EXECUTA_SERVICO',
  PRAZO_DE_CANCELAMENTO_ENCERRADO: 'PRAZO_DE_CANCELAMENTO_ENCERRADO',
  LIMITE_DE_AGENDAMENTOS: 'LIMITE_DE_AGENDAMENTOS',
  CLIENTE_BLOQUEADO: 'CLIENTE_BLOQUEADO',
  TRANSICAO_DE_STATUS_INVALIDA: 'TRANSICAO_DE_STATUS_INVALIDA',
  CHAVE_IDEMPOTENCIA_REUTILIZADA: 'CHAVE_IDEMPOTENCIA_REUTILIZADA',
  ACESSO_NEGADO: 'ACESSO_NEGADO',
  NAO_ENCONTRADO: 'NAO_ENCONTRADO',
  DADOS_INVALIDOS: 'DADOS_INVALIDOS',
} as const;

export type CodigoErro = (typeof CodigoErro)[keyof typeof CodigoErro];

export const CODIGOS_ERRO = Object.values(CodigoErro) as [CodigoErro, ...CodigoErro[]];

/** Mapa código → HTTP status (coluna "HTTP" da tabela). */
export const HTTP_STATUS_POR_CODIGO = {
  HORARIO_INDISPONIVEL: 409,
  FORA_DO_EXPEDIENTE: 422,
  HORARIO_FORA_DA_GRADE: 422,
  ANTECEDENCIA_MINIMA: 422,
  HORARIO_NO_PASSADO: 422,
  ALEM_DO_HORIZONTE: 422,
  PROFISSIONAL_NAO_EXECUTA_SERVICO: 422,
  PRAZO_DE_CANCELAMENTO_ENCERRADO: 422,
  LIMITE_DE_AGENDAMENTOS: 422,
  CLIENTE_BLOQUEADO: 403,
  TRANSICAO_DE_STATUS_INVALIDA: 422,
  CHAVE_IDEMPOTENCIA_REUTILIZADA: 422,
  ACESSO_NEGADO: 403,
  NAO_ENCONTRADO: 404,
  DADOS_INVALIDOS: 400,
} as const satisfies Record<CodigoErro, number>;

export const codigoErroSchema = z.enum(CODIGOS_ERRO);

/** Corpo de erro: `{ codigo, mensagem, detalhes? }`. */
export const corpoErroSchema = z.object({
  codigo: codigoErroSchema,
  mensagem: z.string(),
  detalhes: z.record(z.string(), z.unknown()).optional(),
});

export type CorpoErro = z.infer<typeof corpoErroSchema>;
