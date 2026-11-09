import { type DynamicModule, type INestApplication, type LogLevel, Module } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { DependenciasApp } from '../../application/portas-app';
import { DEPS, GuardaDeSessao, OPCOES_HTTP, type OpcoesHttp, middlewareCsrf } from './autenticacao';
import { AgendamentosController } from './controllers/agendamentos.controller';
import { AuthController } from './controllers/auth.controller';
import { PainelController } from './controllers/painel.controller';
import { PublicoController } from './controllers/publico.controller';
import { FiltroDeErros } from './erros';
import { HealthController } from './health.controller';

@Module({})
export class ApiModule {
  /** As dependências chegam prontas (composição em main.ts ou nos testes); nada de Prisma aqui. */
  static com(deps: DependenciasApp, opcoes: OpcoesHttp): DynamicModule {
    return {
      module: ApiModule,
      controllers: [
        HealthController,
        AuthController,
        PublicoController,
        AgendamentosController,
        PainelController,
      ],
      providers: [
        { provide: DEPS, useValue: deps },
        { provide: OPCOES_HTTP, useValue: opcoes },
        { provide: APP_GUARD, useClass: GuardaDeSessao },
      ],
    };
  }
}

export function documentoOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Agenda API')
    .setDescription(
      'API de agendamentos. Autentique em POST /auth/login e use o token em "Authorize" (Bearer). ' +
        'Instantes em ISO UTC; o fuso do estabelecimento vem em GET /estabelecimentos/:slug. ' +
        'Erros: {codigo, mensagem, detalhes?}.',
    )
    .setVersion('0.3.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}

/** Monta a aplicação Nest (main.ts e testes de integração HTTP). */
export async function criarAplicacao(
  deps: DependenciasApp,
  opcoes: OpcoesHttp & { readonly logger?: LogLevel[] | false },
): Promise<INestApplication> {
  const app = await NestFactory.create(ApiModule.com(deps, opcoes), {
    logger: opcoes.logger ?? ['error', 'warn', 'log'],
  });
  app.enableCors({ origin: opcoes.webOrigin, credentials: true });
  app.use(middlewareCsrf);
  app.useGlobalFilters(new FiltroDeErros(deps.registro));
  SwaggerModule.setup('docs', app, () => documentoOpenApi(app));
  return app;
}
