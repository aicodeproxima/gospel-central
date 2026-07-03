/**
 * i18n key-parity gate (2026-07 overhaul, delegation rule D3b).
 *
 * The translations table is a plain Record<string, Record<string, string>> —
 * tsc cannot see a missing/extra/misspelled key in one locale, so before this
 * test existed an i18n edit could silently ship a key that renders raw in
 * Spanish (or English). Any change to src/lib/i18n.ts must keep this green.
 */

import { describe, expect, test } from 'vitest';
import { translations } from './i18n';

const LOCALES = ['en', 'es'] as const;

describe('i18n key parity (en ≡ es)', () => {
  test('both locales exist', () => {
    for (const locale of LOCALES) {
      expect(translations[locale], `locale "${locale}" missing`).toBeDefined();
    }
  });

  test('every en key exists in es, and vice versa', () => {
    const en = Object.keys(translations.en);
    const es = Object.keys(translations.es);
    const enSet = new Set(en);
    const esSet = new Set(es);
    const missingInEs = en.filter((k) => !esSet.has(k));
    const missingInEn = es.filter((k) => !enSet.has(k));
    expect(missingInEs, `keys missing in es: ${missingInEs.join(', ')}`).toEqual([]);
    expect(missingInEn, `keys missing in en: ${missingInEn.join(', ')}`).toEqual([]);
  });

  test('no empty translation values', () => {
    for (const locale of LOCALES) {
      const empties = Object.entries(translations[locale])
        .filter(([, v]) => typeof v !== 'string' || v.trim() === '')
        .map(([k]) => k);
      expect(empties, `${locale} has empty values for: ${empties.join(', ')}`).toEqual([]);
    }
  });
});
