import { API_BASE } from '@/lib/api/client';

/**
 * True when this build will hit a dead backend: the in-page mock is OFF
 * and API_BASE still points at the localhost dev fallback. A build like
 * this must self-announce instead of letting every fetch die and surface
 * fake auth errors (the original iPhone 'Invalid credentials' trap).
 */
export function isDeadBackendBuild(
  mock = process.env.NEXT_PUBLIC_MOCK_API === 'true',
  apiBase = API_BASE,
): boolean {
  return !mock && apiBase.startsWith('http://localhost');
}
