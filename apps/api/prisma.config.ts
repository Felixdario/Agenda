import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// .env da raiz do monorepo (ou do próprio app). Em CI, DATABASE_URL vem do ambiente.
for (const arquivo of ['../../.env', '.env']) {
  if (existsSync(arquivo)) process.loadEnvFile(arquivo);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://agenda:agenda@localhost:5432/agenda',
  },
});
