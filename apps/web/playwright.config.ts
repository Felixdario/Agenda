import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra API real e seed real, num banco próprio (`agenda_e2e`, migrate deploy + seed a cada
 * execução). Web e API sobem em portas próprias (3100 e 3334) para não brigar com o dev.
 * O navegador é o Chrome instalado (canal `chrome`): nada é baixado.
 */
const PORTA_WEB = 3100;
const PORTA_API = 3334;
const BANCO =
  process.env.E2E_DATABASE_URL ??
  'postgresql://agenda:agenda@localhost:5432/agenda_e2e?schema=public';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // As capturas de revisão só rodam quando pedidas (CAPTURAS=1).
  testIgnore: process.env.CAPTURAS === '1' ? [] : ['**/capturas.spec.ts'],
  // Uma API e um banco compartilhados: os testes rodam em série, cada um com clientes próprios.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORTA_WEB}`,
    channel: 'chrome',
    trace: 'retain-on-failure',
    locale: 'pt-BR',
  },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: [
    {
      name: 'api',
      command: 'node e2e/preparar-banco.mjs && corepack pnpm --filter @agenda/api start',
      url: `http://localhost:${PORTA_API}/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        DATABASE_URL: BANCO,
        API_PORT: String(PORTA_API),
        WEB_ORIGIN: `http://localhost:${PORTA_WEB}`,
        LEMBRETES_ATIVOS: 'false',
        SMTP_HOST: '',
      },
    },
    {
      name: 'web',
      command: `corepack pnpm exec next build && corepack pnpm exec next start --port ${PORTA_WEB}`,
      url: `http://localhost:${PORTA_WEB}/`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        API_URL: `http://localhost:${PORTA_API}`,
        NEXT_DIST_DIR: '.next-e2e',
      },
    },
  ],
});
