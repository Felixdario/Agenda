import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';

/** JSON Schema de um schema Zod, para o Swagger (os mesmos schemas do front, em @agenda/shared). */
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignorado, ...resto } = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  void _ignorado;
  return resto;
}

export const Corpo = (schema: z.ZodType) => ApiBody({ schema: jsonSchema(schema) as never });

/** Parâmetros de query a partir de um z.object. */
export function Consulta(schema: z.ZodObject) {
  const props = (jsonSchema(schema)['properties'] ?? {}) as Record<string, Record<string, unknown>>;
  const obrigatorios = new Set((jsonSchema(schema)['required'] as string[] | undefined) ?? []);
  return applyDecorators(
    ...Object.entries(props).map(([name, s]) =>
      ApiQuery({
        name,
        required: obrigatorios.has(name) && s['default'] === undefined,
        schema: s as never,
      }),
    ),
  );
}
