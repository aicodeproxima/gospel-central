import toast from 'react-hot-toast';

/**
 * Generate a CSV string from a header row and data rows.
 * Handles quoting fields that contain commas, quotes, or newlines.
 *
 * Also neutralizes CSV formula injection: Excel / Sheets / LibreOffice execute a
 * cell beginning with = + - @ (or a leading tab/CR) as a formula, so exported
 * user-controlled text like `=HYPERLINK(...)` or `=cmd|...` can run on the
 * machine of whoever opens the export. Quoting alone does NOT prevent this — the
 * spreadsheet strips the quotes first. Prefixing a single quote is the standard
 * mitigation (OWASP): the cell renders as text and the payload stays inert.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
/** A plain negative number is data, not a payload — never quote-prefix it, or
 *  every negative metric in an export turns into a text cell. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function escapeCSV(value: string | number | undefined | null): string {
  let s = String(value ?? '');
  if (FORMULA_TRIGGER.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCSV(
  headers: string[],
  rows: Array<Array<string | number | undefined | null>>,
): string {
  const headerLine = headers.map(escapeCSV).join(',');
  const dataLines = rows.map((row) => row.map(escapeCSV).join(','));
  return [headerLine, ...dataLines].join('\n');
}

/**
 * Trigger a browser download of a CSV string.
 */
export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Build + download CSV in one call. Shows a toast on completion.
 */
export function exportCSV(
  headers: string[],
  rows: Array<Array<string | number | undefined | null>>,
  filename: string,
) {
  const csv = buildCSV(headers, rows);
  downloadCSV(csv, filename);
  toast.success(`Exported ${rows.length} rows`);
}

/**
 * Parse a CSV string into an array of objects keyed by the header row.
 * Handles quoted fields with commas and escaped quotes.
 */
export function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          cells.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = parseRow(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] ?? '';
    });
    return obj;
  });
}
