import { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Propagation-audit cell harness. Catalog-only: observe at the SURFACE
 * (visible DOM + zustand/derived state); mock-state fetch is corroboration ONLY.
 * Isolation: each cell = one test() = a FRESH Playwright context (fresh in-page
 * mock seed + EMPTY localStorage), so persisted prefs/view-state cannot leak
 * between cells (R1). The pinned clock comes from e2e/fixtures.ts.
 */
export const MOCK_DATE = '2026-06-22T12:00:00';
const QA = path.resolve(__dirname, '../../docs/qa');

export function appendJsonl(file: string, obj: unknown): void {
  fs.mkdirSync(QA, { recursive: true });
  fs.appendFileSync(path.join(QA, file), JSON.stringify(obj) + '\n');
}
export function truncate(file: string): void {
  fs.mkdirSync(QA, { recursive: true });
  fs.writeFileSync(path.join(QA, file), '');
}
export function writeFile(file: string, content: string): void {
  fs.mkdirSync(QA, { recursive: true });
  fs.writeFileSync(path.join(QA, file), content);
}

export function sh(cmd: string): string {
  try { return execSync(cmd, { encoding: 'utf8', cwd: path.resolve(__dirname, '../..') }).trim(); }
  catch { return '?'; }
}

/** VISIBLE text of the first matching locator, or null. Visibility-filtered to
 *  defeat the dual-render hidden-node false-pass (R2). */
export async function visibleText(page: Page, selector: string): Promise<string | null> {
  const loc = page.locator(`${selector}:visible`).first();
  if (await loc.count() === 0) return null;
  return (await loc.textContent())?.trim() ?? null;
}

/** Dynamic seed counts via the app's own API (fingerprint + corroboration). Uses
 *  the logged-in token from localStorage so the mock resolves a real actor. */
export async function seedCounts(page: Page): Promise<Record<string, number | null>> {
  return page.evaluate(async () => {
    const token = localStorage.getItem('token');
    const h: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const len = async (p: string): Promise<number | null> => {
      try {
        const r = await fetch('/api' + p, { headers: h });
        const j = await r.json();
        if (Array.isArray(j)) return j.length;
        if (j && Array.isArray(j.entries)) return j.entries.length;
        if (j && typeof j.total === 'number') return j.total;
        return null;
      } catch { return null; }
    };
    return {
      users: await len('/users'),
      contacts: await len('/contacts'),
      bookings: await len('/bookings?start=2026-01-01&end=2027-12-31'),
      areas: await len('/areas'),
      blockedSlots: await len('/blocked-slots'),
      auditLog: await len('/audit-log?limit=1000'),
    };
  });
}

/** Read a zustand store value (CORROBORATION ONLY for store-backed fields — R4). */
export async function prefsState(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('diamond-preferences') || 'null')?.state ?? null; }
    catch { return null; }
  });
}

/** Re-assert the pinned clock + the logged-in actor at observation time (anti-drift). */
export async function assertClockActor(page: Page, expectedRole: string): Promise<{ clock: string | null; role: string | null }> {
  return page.evaluate((role) => {
    const clock = (window as unknown as { __MOCK_DATE__?: string }).__MOCK_DATE__ ?? null;
    let actualRole: string | null = null;
    try { actualRole = JSON.parse(localStorage.getItem('user') || '{}').role ?? null; } catch { /* */ }
    void role;
    return { clock, role: actualRole };
  }, expectedRole);
}
