/**
 * Pins the dead-backend detector behind MSWProvider's warning banner.
 *
 * A build with NEXT_PUBLIC_MOCK_API unset AND no NEXT_PUBLIC_API_URL is a
 * trap: mock off + API_BASE=http://localhost → every fetch dies → the UI
 * historically surfaced a fake "Invalid credentials" on iPhone. This suite
 * pins that `isDeadBackendBuild` flags exactly that combination — including
 * the zero-arg path, which in this Node test env (both env vars unset)
 * mirrors a flag-less production artifact and MUST return true.
 */

import { describe, expect, it } from 'vitest';
import { isDeadBackendBuild } from './mock-guard';

describe('isDeadBackendBuild', () => {
  it('mock off + localhost API base → dead build (true)', () => {
    expect(isDeadBackendBuild(false, 'http://localhost:8080/api')).toBe(true);
  });

  it('mock on → never a dead build, regardless of API base', () => {
    expect(isDeadBackendBuild(true, 'http://localhost:8080/api')).toBe(false);
    expect(isDeadBackendBuild(true, '/api')).toBe(false);
    expect(isDeadBackendBuild(true, 'https://real.example/api')).toBe(false);
  });

  it('mock off + same-origin /api base → not dead (false)', () => {
    expect(isDeadBackendBuild(false, '/api')).toBe(false);
  });

  it('mock off + real https backend → not dead (false)', () => {
    expect(isDeadBackendBuild(false, 'https://real.example/api')).toBe(false);
  });

  it('zero-arg call in an env-less build (both env vars unset) → detected as dead (true)', () => {
    // In the vitest Node env neither NEXT_PUBLIC_MOCK_API nor
    // NEXT_PUBLIC_API_URL is set, so the defaults resolve exactly like a
    // flag-less production artifact: mock=false, API_BASE=localhost.
    expect(process.env.NEXT_PUBLIC_MOCK_API).toBeUndefined();
    expect(process.env.NEXT_PUBLIC_API_URL).toBeUndefined();
    expect(isDeadBackendBuild()).toBe(true);
  });
});
