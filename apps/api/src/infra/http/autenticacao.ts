import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CodigoErro, HTTP_STATUS_POR_CODIGO, type UsuarioSessao } from '@agenda/shared';
import type { NextFunction, Request, Response } from 'express';
import { autenticar } from '../../application/auth';
import type { AtorHttp, DependenciasApp } from '../../application/portas-app';
import { ErroDeAplicacao, corpoDeErro } from './erros';

export const DEPS = Symbol('DEPS');
export const OPCOES_HTTP = Symbol('OPCOES_HTTP');
export interface OpcoesHttp {
  readonly producao: boolean;
  readonly webOrigin: string;
}

export const COOKIE_SESSAO = 'agenda_sessao';

export interface RequisicaoAutenticada extends Request {
  ator?: AtorHttp;
  usuario?: UsuarioSessao;
  token?: string;
}

const PUBLICO = 'agenda:publico';
/** Rota pública: o ator é resolvido se houver sessão válida, mas não é exigido. */
export const Publico = () => SetMetadata(PUBLICO, true);

/** Ator autenticado (ou `null` numa rota pública sem sessão). */
export const AtorAtual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<RequisicaoAutenticada>().ator ?? null,
);
export const UsuarioAtual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<RequisicaoAutenticada>().usuario,
);
export const TokenAtual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<RequisicaoAutenticada>().token,
);

function lerCookie(cabecalho: string | undefined, nome: string): string | undefined {
  for (const parte of (cabecalho ?? '').split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** D-15: `Authorization: Bearer <token>` (Swagger, testes) ou o cookie httpOnly. */
export function tokenDaRequisicao(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim() || undefined;
  return lerCookie(req.headers.cookie, COOKIE_SESSAO);
}

/** Guard global: resolve o ator pela sessão; rota não pública sem sessão válida → 401. */
@Injectable()
export class GuardaDeSessao implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DEPS) private readonly deps: DependenciasApp,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(PUBLICO, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest<RequisicaoAutenticada>();
    const token = tokenDaRequisicao(req);
    if (token !== undefined) {
      const r = await autenticar(this.deps, token);
      if (r.ok) {
        req.ator = r.valor.ator;
        req.usuario = r.valor.usuario;
        req.token = token;
        return true;
      }
    }
    if (publico === true) return true;
    throw new ErroDeAplicacao({ ok: false, codigo: CodigoErro.NAO_AUTENTICADO });
  }
}

const MUDA_ESTADO = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * D-15 (CSRF): requisição que muda estado e vem com o cookie de sessão precisa ser
 * `Content-Type: application/json`. Formulários de outro site não conseguem mandar esse tipo sem
 * preflight, e o CORS só libera WEB_ORIGIN.
 */
export function middlewareCsrf(req: Request, res: Response, next: NextFunction): void {
  const temCookie = lerCookie(req.headers.cookie, COOKIE_SESSAO) !== undefined;
  const ehJson = (req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json');
  if (MUDA_ESTADO.has(req.method) && temCookie && !ehJson) {
    res
      .status(HTTP_STATUS_POR_CODIGO.DADOS_INVALIDOS)
      .json(corpoDeErro(CodigoErro.DADOS_INVALIDOS, { motivo: 'CONTENT_TYPE_JSON_OBRIGATORIO' }));
    return;
  }
  next();
}
