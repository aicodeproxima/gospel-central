import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Vitest config (TEST-2).
 *
 * Today the suite is pure-function permission tests, so the default node
 * environment is fine. Adding the `@` alias matches `tsconfig.json`'s
 * `paths` entry so component tests can `import { ... } from '@/...'`
 * without restructuring.
 *
 * To add component tests later: `npm install -D happy-dom @testing-library/react`
 * and set `test.environment: 'happy-dom'`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    globals: false,
  },
});
