import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Publico } from './autenticacao';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Publico()
  @Get()
  @ApiOkResponse({ description: 'API no ar' })
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
