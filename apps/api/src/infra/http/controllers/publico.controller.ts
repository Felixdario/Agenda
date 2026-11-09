import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  chaveIdempotenciaSchema,
  consultaHorariosSchema,
  criarAgendamentoSchema,
  escopoAgendamentosSchema,
} from '@agenda/shared';
import {
  agendarOnline,
  estabelecimentoPublico,
  horariosPublicos,
  meusAgendamentos,
} from '../../../application/operacoes';
import type { AtorHttp, DependenciasApp } from '../../../application/portas-app';
import { AtorAtual, DEPS, Publico } from '../autenticacao';
import { Consulta, Corpo } from '../documentacao';
import { responder, validar } from '../erros';

@ApiTags('estabelecimentos')
@ApiBearerAuth()
@Controller()
export class PublicoController {
  constructor(@Inject(DEPS) private readonly deps: DependenciasApp) {}

  @Publico()
  @Get('estabelecimentos/:slug')
  @ApiOperation({
    summary: 'Página pública: fuso, políticas públicas, serviços e profissionais ativos',
  })
  async estabelecimento(@Param('slug') slug: string) {
    return responder(await estabelecimentoPublico(this.deps, slug));
  }

  @Publico()
  @Get('estabelecimentos/:slug/horarios')
  @ApiOperation({ summary: 'Horários livres do dia (sem profissionalId = qualquer profissional)' })
  @Consulta(consultaHorariosSchema)
  async horarios(
    @AtorAtual() ator: AtorHttp | null,
    @Param('slug') slug: string,
    @Query() query: unknown,
  ) {
    return responder(
      await horariosPublicos(this.deps, ator, slug, validar(consultaHorariosSchema, query)),
    );
  }

  @Post('estabelecimentos/:slug/agendamentos')
  @ApiOperation({ summary: 'Cliente agenda (RN-22: header Idempotency-Key opcional)' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @Corpo(criarAgendamentoSchema)
  async agendar(
    @AtorAtual() ator: AtorHttp,
    @Param('slug') slug: string,
    @Body() corpo: unknown,
    @Headers('idempotency-key') chave?: string,
  ) {
    const entrada = validar(criarAgendamentoSchema, corpo);
    const chaveValida = chave === undefined ? undefined : validar(chaveIdempotenciaSchema, chave);
    return responder(await agendarOnline(this.deps, ator, slug, entrada, chaveValida));
  }

  @Get('eu/agendamentos')
  @ApiOperation({ summary: 'Agendamentos do usuário (futuros ou passados)' })
  @Consulta(escopoAgendamentosSchema)
  async meus(@AtorAtual() ator: AtorHttp, @Query() query: unknown) {
    const { escopo } = validar(escopoAgendamentosSchema, query);
    return responder(await meusAgendamentos(this.deps, ator, escopo));
  }
}
