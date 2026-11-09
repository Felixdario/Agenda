import { Body, Controller, Get, HttpCode, Inject, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { type UsuarioSessao, loginSchema, registroSchema } from '@agenda/shared';
import type { Response } from 'express';
import { entrar, registrar, sair } from '../../../application/auth';
import { eu } from '../../../application/operacoes';
import type { AtorHttp, DependenciasApp } from '../../../application/portas-app';
import {
  AtorAtual,
  COOKIE_SESSAO,
  DEPS,
  OPCOES_HTTP,
  type OpcoesHttp,
  Publico,
  TokenAtual,
  UsuarioAtual,
} from '../autenticacao';
import { Corpo } from '../documentacao';
import { responder, validar } from '../erros';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(DEPS) private readonly deps: DependenciasApp,
    @Inject(OPCOES_HTTP) private readonly opcoes: OpcoesHttp,
  ) {}

  @Publico()
  @Post('registro')
  @ApiOperation({ summary: 'Cria uma conta de cliente' })
  @Corpo(registroSchema)
  async registro(@Body() corpo: unknown) {
    return responder(await registrar(this.deps, validar(registroSchema, corpo)));
  }

  @Publico()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Entra: devolve o cookie httpOnly agenda_sessao e o token (Bearer)' })
  @Corpo(loginSchema)
  async login(@Body() corpo: unknown, @Res({ passthrough: true }) res: Response) {
    const r = responder(await entrar(this.deps, validar(loginSchema, corpo)));
    res.cookie(COOKIE_SESSAO, r.token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: this.opcoes.producao,
      expires: new Date(r.expiraEm),
    });
    return { token: r.token, expiraEm: new Date(r.expiraEm).toISOString(), usuario: r.usuario };
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sai: revoga a sessão' })
  async logout(@TokenAtual() token: string, @Res({ passthrough: true }) res: Response) {
    await sair(this.deps, token);
    res.clearCookie(COOKIE_SESSAO, { path: '/' });
    return { ok: true };
  }

  @Get('eu')
  @ApiOperation({
    summary: 'Usuário da sessão; com ?estabelecimento=slug, a situação do cliente lá',
  })
  @ApiQuery({ name: 'estabelecimento', required: false })
  async eu(
    @AtorAtual() ator: AtorHttp,
    @UsuarioAtual() usuario: UsuarioSessao,
    @Query('estabelecimento') slug?: string,
  ) {
    return responder(await eu(this.deps, ator, usuario, slug || undefined));
  }
}
