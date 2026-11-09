import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { motivoSchema, remarcarSchema } from '@agenda/shared';
import {
  type AcaoDeStatus,
  historicoComoAtor,
  mudarStatusComoAtor,
  remarcarComoAtor,
} from '../../../application/operacoes';
import type { AtorHttp, DependenciasApp } from '../../../application/portas-app';
import { AtorAtual, DEPS } from '../autenticacao';
import { Corpo } from '../documentacao';
import { IdPipe, responder, validar } from '../erros';

/** Cliente e painel usam as mesmas rotas; a autorização decide pelo papel (RN-23). */
@ApiTags('agendamentos')
@ApiBearerAuth()
@Controller('agendamentos')
export class AgendamentosController {
  constructor(@Inject(DEPS) private readonly deps: DependenciasApp) {}

  private async status(ator: AtorHttp, idAgendamento: string, acao: AcaoDeStatus, corpo: unknown) {
    const { motivo } = validar(motivoSchema, corpo);
    return responder(await mudarStatusComoAtor(this.deps, ator, idAgendamento, acao, motivo));
  }

  @Post(':id/remarcar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remarca (RN-16); opcionalmente troca o profissional' })
  @Corpo(remarcarSchema)
  async remarcar(
    @AtorAtual() ator: AtorHttp,
    @Param('id', IdPipe) idAgendamento: string,
    @Body() corpo: unknown,
  ) {
    return responder(
      await remarcarComoAtor(this.deps, ator, idAgendamento, validar(remarcarSchema, corpo)),
    );
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancela (RN-15)' })
  @Corpo(motivoSchema)
  cancelar(
    @AtorAtual() ator: AtorHttp,
    @Param('id', IdPipe) idAgendamento: string,
    @Body() corpo: unknown,
  ) {
    return this.status(ator, idAgendamento, 'CANCELAR', corpo);
  }

  @Post(':id/confirmar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirma (estabelecimento, RN-19)' })
  confirmar(
    @AtorAtual() ator: AtorHttp,
    @Param('id', IdPipe) idAgendamento: string,
    @Body() corpo: unknown,
  ) {
    return this.status(ator, idAgendamento, 'CONFIRMAR', corpo);
  }

  @Post(':id/concluir')
  @HttpCode(200)
  @ApiOperation({ summary: 'Conclui, depois do início (RN-19)' })
  concluir(
    @AtorAtual() ator: AtorHttp,
    @Param('id', IdPipe) idAgendamento: string,
    @Body() corpo: unknown,
  ) {
    return this.status(ator, idAgendamento, 'CONCLUIR', corpo);
  }

  @Post(':id/nao-compareceu')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marca falta, depois do início (RN-18, RN-19)' })
  naoCompareceu(
    @AtorAtual() ator: AtorHttp,
    @Param('id', IdPipe) idAgendamento: string,
    @Body() corpo: unknown,
  ) {
    return this.status(ator, idAgendamento, 'NAO_COMPARECEU', corpo);
  }

  @Get(':id/historico')
  @ApiOperation({ summary: 'Histórico de status e remarcações (RN-19)' })
  async historico(@AtorAtual() ator: AtorHttp, @Param('id', IdPipe) idAgendamento: string) {
    return responder(await historicoComoAtor(this.deps, ator, idAgendamento));
  }
}
