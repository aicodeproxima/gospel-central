import { describe, it, expect } from 'vitest';
import { buildCSV, escapeCSV } from './csv';

/**
 * CSV formula injection (found by the /feedback design review, pre-existing).
 * Excel/Sheets/LibreOffice execute a cell starting with = + - @ as a formula, so
 * user-controlled text reaching an export could run on the opener's machine.
 * Quoting does NOT help — the spreadsheet strips quotes before evaluating.
 */
describe('escapeCSV — formula injection', () => {
  it.each(['=1+1', '+1+1', '@SUM(A1)', '=HYPERLINK("http://evil","click")', '=cmd|\'/c calc\'!A1'])(
    'neutralizes %s with a leading quote',
    (payload) => {
      expect(escapeCSV(payload).replace(/^"|"$/g, '').startsWith("'")).toBe(true);
    },
  );

  it('neutralizes leading tab / CR tricks', () => {
    expect(escapeCSV('\t=1+1').startsWith("'")).toBe(true);
    expect(escapeCSV('\r=1+1').startsWith("'")).toBe(true);
  });

  it('does NOT mangle plain negative numbers — they are data, not payloads', () => {
    expect(escapeCSV(-5)).toBe('-5');
    expect(escapeCSV('-5')).toBe('-5');
    expect(escapeCSV('-12.75')).toBe('-12.75');
  });

  it('still neutralizes an expression that merely starts like a negative number', () => {
    expect(escapeCSV('-1+1').startsWith("'")).toBe(true);
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeCSV('Andronicus')).toBe('Andronicus');
    expect(escapeCSV('')).toBe('');
    expect(escapeCSV(null)).toBe('');
  });

  it('preserves existing quoting behavior for commas/quotes/newlines', () => {
    expect(escapeCSV('a,b')).toBe('"a,b"');
    expect(escapeCSV('say "hi"')).toBe('"say ""hi"""');
  });

  it('applies through buildCSV, the real export path', () => {
    const csv = buildCSV(['name'], [['=1+1']]);
    expect(csv).toContain("'=1+1");
  });
});
