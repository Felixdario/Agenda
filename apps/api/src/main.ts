import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Agenda API')
    .setDescription('API de agendamentos')
    .setVersion('0.0.0')
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config));

  const port = Number(process.env.API_PORT ?? 3333);
  await app.listen(port);
  console.log(`API em http://localhost:${port} (docs em /docs)`);
}

void bootstrap();
