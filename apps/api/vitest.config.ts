import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC no lugar do esbuild: o Nest depende de emitDecoratorMetadata, que o esbuild não emite.
const plugins = [swc.vite({ module: { type: 'es6' } })];

export default defineConfig({
  test: {
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
    ],
  },
});
