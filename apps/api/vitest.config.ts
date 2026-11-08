import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC no lugar do esbuild: o Nest depende de emitDecoratorMetadata, que o esbuild não emite.
const plugins = [swc.vite({ module: { type: 'es6' } })];

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        plugins,
        test: {
          name: 'domain',
          environment: 'node',
          include: ['src/domain/**/*.test.ts'],
        },
      },
      {
        plugins,
        test: {
          name: 'app',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/domain/**', '**/node_modules/**'],
        },
      },
      {
        // Postgres real (banco agenda_test). Os arquivos compartilham o banco: um de cada vez.
        plugins,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['test/integracao/**/*.test.ts', 'test/validacao/**/*.test.ts'],
          globalSetup: ['test/integracao/global-setup.ts'],
          fileParallelism: false,
          testTimeout: 120_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
