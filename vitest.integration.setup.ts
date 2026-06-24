// Integration-project setup: jest-dom matchers, RTL auto-cleanup, and an
// msw/node server so tests can hit the same mock handlers the browser uses,
// in Node, against a PINNED clock (see vitest.pin-clock.ts, which runs first).
import { afterAll, afterEach, beforeAll } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { handlers } from './src/mocks/handlers';

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
