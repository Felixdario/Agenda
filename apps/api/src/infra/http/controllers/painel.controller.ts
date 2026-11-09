import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  agendamentoBalcaoSchema,
  bloqueioSchema,
  consultaAgendaSchema,
  excecaoSchema,
  jornadaSchema,
  politicasSchema,
  profissionalParcialSchema,
  profissionalSchema,
  servicoParcialSchema,
  servicoSchema,
} from '@agenda/shared';
import {
  agendaDoPainel,
  agendarNoBalcao,
  atualizarPoliticasPainel,
  criarBloqueioPainel,
  criarExcecaoPainel,
  criarProfissionalPainel,
  criarServicoPainel,
  definirJornadaPainel,
  desbloquearClientePainel,
  editarProfissionalPainel,
  editarServicoPainel,
  estabelecimentoDoPainelCompleto,
  jornadaDoPainel,
  listarClientesPainel,
  listarProfissionaisPainel,
  listarServicosPainel,
  removerBloqueioPainel,
  removerExcecaoPainel,
} from '../../../application/operacoes';
import type { AtorHttp, DependenciasApp } from '../../../application/portas-app';
import type { Excecao } from '../../../domain';
import { AtorAtual, DEPS } from '../autenticacao';
import { Consulta, Corpo } from '../documentacao';
import { IdPipe, responder, validar } from '../erros';

/** Remove chaves `undefined` (exactOptionalPropertyTypes) de um parcial validado pelo Zod. */
function semIndefinidos<T extends object>(o: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as never;
}

/** Painel do estabelecimento: DONO e PROFISSIONAL (este só na própria agenda), RN-23. */
@ApiTags('painel')
@ApiBearerAuth()
@Controller('painel')
export class PainelController {
  constructor(@Inject(DEPS) private readonly deps: DependenciasApp) {}

  @Get('agenda')
  @ApiOperation({ summary: 'Agendamentos, bloqueios e expediente do dia, por profissional' })
  @Consulta(consultaAgendaSchema)
  async agenda(@AtorAtual() ator: AtorHttp, @Query() query: unknown) {
    return responder(await agendaDoPainel(this.deps, ator, validar(consultaAgendaSchema, query)));
  }

  @Post('agendamentos')
  @ApiOperation({ summary: 'Agendamento no balcão (RN-20); cliente por e-mail' })
  @Corpo(agendamentoBalcaoSchema)
  async balcao(@AtorAtual() ator: AtorHttp, @Body() corpo: unknown) {
    return responder(
      await agendarNoBalcao(this.deps, ator, validar(agendamentoBalcaoSchema, corpo)),
    );
  }

  @Post('bloqueios')
  @ApiOperation({ summary: 'Cria bloqueio pontual (RN-05)' })
  @Corpo(bloqueioSchema)
  async criarBloqueio(@AtorAtual() ator: AtorHttp, @Body() corpo: unknown) {
    return responder(await criarBloqueioPainel(this.deps, ator, validar(bloqueioSchema, corpo)));
  }

  @Delete('bloqueios/:id')
  @ApiOperation({ summary: 'Remove bloqueio' })
  async removerBloqueio(@AtorAtual() ator: AtorHttp, @Param('id', IdPipe) id: string) {
    return responder(await removerBloqueioPainel(this.deps, ator, id));
  }

  @Get('servicos')
  @ApiOperation({ summary: 'Serviços (DONO)' })
  async servicos(@AtorAtual() ator: AtorHttp) {
    return responder(await listarServicosPainel(this.deps, ator));
  }

  @Post('servicos')
  @ApiOperation({ summary: 'Cria serviço (DONO)' })
  @Corpo(servicoSchema)
  async criarServico(@AtorAtual() ator: AtorHttp, @Body() corpo: unknown) {
    return responder(await criarServicoPainel(this.deps, ator, validar(servicoSchema, corpo)));
  }

  @Patch('servicos/:id')
  @ApiOperation({ summary: 'Edita serviço (DONO); agendamentos já feitos não mudam (RN-14)' })
  @Corpo(servicoParcialSchema)
  async editarServico(
    @AtorAtual() ator: AtorHttp,
    @Param('id', IdPipe) id: string,
    @Body() corpo: unknown,
  ) {
    const dados = semIndefinidos(validar(servicoParcialSchema, corpo));
    return responder(await editarServicoPainel(this.deps, ator, id, dados));
  }

  @Get('profissionais')
  @ApiOperation({ summary: 'Profissionais e os serviços que executam (DONO)' })
  async profissionais(@AtorAtual() ator: AtorHttp) {
    return responder(await listarProfissionaisPainel(this.deps, ator));
  }

  @Post('profissionais')
  @ApiOperation({ summary: 'Cria profissional (DONO)' })
  @Corpo(profissionalSchema)
  async criarProfissional(@AtorAtual() ator: AtorHttp, @Body() corpo: unknown) {
    return responder(
      await criarProfissionalPainel(this.deps, ator, validar(profissionalSchema, corpo)),
    );
  }

  @Patch('profissionais/:id')
  @ApiOperation({ summary: 'Edita profissional (DONO)' })
  @Corpo(profissionalParcialSchema)
  async editarProfissional(
    @AtorAtual() ator: AtorHttp,
    @Param('id', IdPipe) id: string,
    @Body() corpo: unknown,
  ) {
    const dados = semIndefinidos(validar(profissionalParcialSchema, corpo));
    return responder(await editarProfissionalPainel(this.deps, ator, id, dados));
  }

  @Get('profissionais/:id/jornada')
  @ApiOperation({ summary: 'Jornada semanal (DONO ou o próprio PROFISSIONAL)' })
  async lerJornada(@AtorAtual() ator: AtorHttp, @Param('id', IdPipe) id: string) {
    return responder(await jornadaDoPainel(this.deps, ator, id));
  }

  @Put('profissionais/:id/jornada')
  @ApiOperation({ summary: 'Define a jornada semanal (DONO ou o próprio PROFISSIONAL), RN-03' })
  @Corpo(jornadaSchema)
  async jornada(
    @AtorAtual() ator: AtorHttp,
    @Param('id', IdPipe) id: string,
    @Body() corpo: unknown,
  ) {
    const { dias } = validar(jornadaSchema, corpo);
    return responder(await definirJornadaPainel(this.deps, ator, id, dias));
  }

  @Post('excecoes')
  @ApiOperation({
    summary: 'Folga ou horário extra (DONO para todos, PROFISSIONAL para si); feriado (DONO)',
  })
  @Corpo(excecaoSchema)
  async criarExcecao(@AtorAtual() ator: AtorHttp, @Body() corpo: unknown) {
    const e = semIndefinidos(validar(excecaoSchema, corpo)) as Excecao & {
      profissionalId?: string;
    };
    return responder(await criarExcecaoPainel(this.deps, ator, e));
  }

  @Delete('excecoes/:id')
  @ApiOperation({ summary: 'Remove exceção' })
  async removerExcecao(@AtorAtual() ator: AtorHttp, @Param('id', IdPipe) id: string) {
    return responder(await removerExcecaoPainel(this.deps, ator, id));
  }

  @Get('clientes')
  @ApiOperation({ summary: 'Clientes com faltas e bloqueio (DONO, RN-18)' })
  async clientes(@AtorAtual() ator: AtorHttp) {
    return responder(await listarClientesPainel(this.deps, ator));
  }

  @Post('clientes/:id/desbloquear')
  @HttpCode(200)
  @ApiOperation({ summary: 'Desbloqueia cliente (DONO, RN-18)' })
  async desbloquear(@AtorAtual() ator: AtorHttp, @Param('id', IdPipe) id: string) {
    return responder(await desbloquearClientePainel(this.deps, ator, id));
  }

  @Get('estabelecimento')
  @ApiOperation({ summary: 'Estabelecimento do painel: nome, slug, fuso e políticas' })
  async estabelecimento(@AtorAtual() ator: AtorHttp) {
    return responder(await estabelecimentoDoPainelCompleto(this.deps, ator));
  }

  @Patch('estabelecimento/politicas')
  @ApiOperation({ summary: 'Atualiza políticas (DONO)' })
  @Corpo(politicasSchema)
  async politicas(@AtorAtual() ator: AtorHttp, @Body() corpo: unknown) {
    return responder(
      await atualizarPoliticasPainel(this.deps, ator, validar(politicasSchema, corpo)),
    );
  }
}
