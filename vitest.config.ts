import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Two projects:
 *  - `unit`: the existing pure-function tests in the default `node` env, on the
 *    REAL clock (unchanged — 317 tests).
 *  - `integration`: `*.itest.ts(x)` in `happy-dom`, with a PINNED mock clock and
 *    an msw/node server so flows/handlers/components are exercised deterministically.
 *    `vitest.pin-clock.ts` MUST stay first in setupFiles (it pins the seed clock
 *    before the seed module is imported).
 */
const alias = { '@': path.resolve(__dirname, './src') };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
          exclude: ['**/*.itest.*', '**/node_modules/**'],
          globals: false,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'happy-dom',
          include: ['src/**/*.itest.{ts,tsx}'],
          setupFiles: ['./vitest.pin-clock.ts', './vitest.integration.setup.ts'],
          globals: true,
        },
      },
    ],
  },
});
