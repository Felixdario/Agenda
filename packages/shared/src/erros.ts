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
  NAO_AUTENTICADO: 'NAO_AUTENTICADO',
  /** Erro inesperado (bug, banco fora do ar). Nunca vem de regra de negócio. */
  ERRO_INTERNO: 'ERRO_INTERNO',
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
  NAO_AUTENTICADO: 401,
  ERRO_INTERNO: 500,
} as const satisfies Record<CodigoErro, number>;

export const codigoErroSchema = z.enum(CODIGOS_ERRO);

/** Corpo de erro: `{ codigo, mensagem, detalhes? }`. */
export const corpoErroSchema = z.object({
  codigo: codigoErroSchema,
  mensagem: z.string(),
  detalhes: z.record(z.string(), z.unknown()).optional(),
});

export type CorpoErro = z.infer<typeof corpoErroSchema>;

/** Mensagens amigáveis em português (a API usa; o front pode reaproveitar). */
export const MENSAGEM_POR_CODIGO: Record<CodigoErro, string> = {
  HORARIO_INDISPONIVEL: 'Esse horário acabou de ficar indisponível. Escolha outro.',
  FORA_DO_EXPEDIENTE: 'Esse horário está fora do expediente do profissional.',
  HORARIO_FORA_DA_GRADE: 'Esse horário não está na grade de horários do estabelecimento.',
  ANTECEDENCIA_MINIMA: 'Esse horário está muito próximo. Escolha um horário com mais antecedência.',
  HORARIO_NO_PASSADO: 'Esse horário já passou.',
  ALEM_DO_HORIZONTE: 'Ainda não é possível agendar para essa data.',
  PROFISSIONAL_NAO_EXECUTA_SERVICO: 'Esse profissional não realiza esse serviço.',
  PRAZO_DE_CANCELAMENTO_ENCERRADO:
    'O prazo para cancelar ou remarcar pela internet terminou. Fale com o estabelecimento.',
  LIMITE_DE_AGENDAMENTOS: 'Você atingiu o limite de agendamentos ativos neste estabelecimento.',
  CLIENTE_BLOQUEADO: 'Agendamento online indisponível para esta conta. Fale com o estabelecimento.',
  TRANSICAO_DE_STATUS_INVALIDA: 'Essa ação não é possível no status atual do agendamento.',
  CHAVE_IDEMPOTENCIA_REUTILIZADA: 'Esta chave de requisição já foi usada com outros dados.',
  ACESSO_NEGADO: 'Você não tem permissão para fazer isso.',
  NAO_ENCONTRADO: 'Não encontrado.',
  DADOS_INVALIDOS: 'Alguns dados estão inválidos. Confira os campos.',
  NAO_AUTENTICADO: 'Entre na sua conta para continuar.',
  ERRO_INTERNO: 'Algo deu errado do nosso lado. Tente de novo em instantes.',
};
