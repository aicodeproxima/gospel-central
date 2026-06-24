import { describe, it, expect } from 'vitest';
import { API_BASE } from '@/lib/api/client';
import { mockBookings } from '@/mocks/data';
import { now } from '@/mocks/mock-clock';

/**
 * Proves the integration tier works end to end: the seed clock is PINNED
 * (deterministic), the msw/node server intercepts the same handlers the browser
 * uses, and auth behaves. This is the foundation the adversarial / flow tests
 * (Phase 3) build on.
 */
describe('integration foundation: pinned clock + msw/node mock backend', () => {
  it('pins the seed clock to the fixed Monday 2026-06-22', () => {
    const d = now();
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 5, 22]);
    expect(d.getDay()).toBe(1); // Monday
  });

  it('msw/node intercepts login and returns a token for a seeded user', async () => {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'branch1', password: 'admin' }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { token: string; user: { username: string } };
    expect(data.token).toMatch(/^mock-jwt-token-/);
    expect(data.user.username).toBe('branch1');
  });

  it('rejects a wrong password with 401', async () => {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'branch1', password: 'nope' }),
    });
    expect(res.status).toBe(401);
  });

  it('seeds bookings within the pinned week (deterministic, not day-drifting)', () => {
    const base = now();
    const ws = new Date(base);
    ws.setDate(base.getDate() - ((base.getDay() + 6) % 7)); // back to Monday
    ws.setHours(0, 0, 0, 0);
    const we = new Date(ws.getTime() + 7 * 86_400_000);
    const inWeek = mockBookings.filter((b) => {
      const t = new Date(b.startTime).getTime();
      return t >= ws.getTime() && t < we.getTime();
    });
    expect(inWeek.length).toBeGreaterThan(0);
  });
});
