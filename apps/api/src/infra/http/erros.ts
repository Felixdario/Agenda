import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  type PipeTransform,
} from '@nestjs/common';
import {
  CodigoErro,
  type CorpoErro,
  HTTP_STATUS_POR_CODIGO,
  MENSAGEM_POR_CODIGO,
} from '@agenda/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { Registro } from '../../application/portas-app';
import type { Falha, Resultado } from '../../domain';

/** Falha de regra (Resultado) levada até o filtro global. */
export class ErroDeAplicacao extends Error {
  constructor(readonly falha: Falha) {
    super(falha.codigo);
  }
}

/** Valor do Resultado, ou lança para o filtro converter no corpo de erro. */
export function responder<T>(r: Resultado<T>): T {
  if (!r.ok) throw new ErroDeAplicacao(r);
  return r.valor;
}

/** Valida com Zod; erro → 400 DADOS_INVALIDOS com `detalhes.campos` (caminho → mensagem). */
export function validar<S extends z.ZodType>(schema: S, valor: unknown): z.infer<S> {
  const r = schema.safeParse(valor ?? {});
  if (r.success) return r.data;
  const campos: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const caminho = issue.path.map(String).join('.') || '(corpo)';
    campos[caminho] ??= issue.message;
  }
  throw new ErroDeAplicacao({
    ok: false,
    codigo: CodigoErro.DADOS_INVALIDOS,
    detalhes: { campos },
  });
}

export function corpoDeErro(
  codigo: CodigoErro,
  detalhes?: Readonly<Record<string, unknown>>,
): CorpoErro {
  return {
    codigo,
    mensagem: MENSAGEM_POR_CODIGO[codigo],
    ...(detalhes === undefined ? {} : { detalhes: { ...detalhes } }),
  };
}

/** Mensagem específica do login (a mesma para e-mail ou senha errados). */
const MENSAGEM_CREDENCIAIS = 'E-mail ou senha incorretos.';

/**
 * Converte tudo em `{codigo, mensagem, detalhes?}` com o status de HTTP_STATUS_POR_CODIGO. Erro
 * inesperado → 500 ERRO_INTERNO, sem stack (registrado no servidor).
 */
@Catch()
export class FiltroDeErros implements ExceptionFilter {
  constructor(private readonly registro: Registro) {}

  catch(excecao: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    let corpo: CorpoErro;

    if (excecao instanceof ErroDeAplicacao) {
      const { codigo, detalhes } = excecao.falha;
      corpo = corpoDeErro(codigo, detalhes);
      if (detalhes?.['motivo'] === 'CREDENCIAIS_INVALIDAS') {
        corpo = { codigo, mensagem: MENSAGEM_CREDENCIAIS };
      }
    } else if (excecao instanceof HttpException) {
      const status = excecao.getStatus();
      const codigo =
        status === HttpStatus.NOT_FOUND
          ? CodigoErro.NAO_ENCONTRADO
          : status === HttpStatus.UNAUTHORIZED
            ? CodigoErro.NAO_AUTENTICADO
            : status === HttpStatus.FORBIDDEN
              ? CodigoErro.ACESSO_NEGADO
              : status < 500
                ? CodigoErro.DADOS_INVALIDOS // JSON malformado, corpo grande demais…
                : CodigoErro.ERRO_INTERNO;
      if (codigo === CodigoErro.ERRO_INTERNO)
        this.registro.erro(`${req.method} ${req.url}`, excecao);
      corpo = corpoDeErro(codigo);
    } else {
      this.registro.erro(`Erro inesperado em ${req.method} ${req.url}`, excecao);
      corpo = corpoDeErro(CodigoErro.ERRO_INTERNO);
    }
    res.status(HTTP_STATUS_POR_CODIGO[corpo.codigo]).json(corpo);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `:id` que não é UUID não pode existir: 404 (e nunca chega ao banco como uuid inválido). */
export class IdPipe implements PipeTransform<string, string> {
  transform(valor: string): string {
    if (UUID.test(valor)) return valor;
    throw new ErroDeAplicacao({ ok: false, codigo: CodigoErro.NAO_ENCONTRADO });
  }
}
