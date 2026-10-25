/**
 * Minimal RFC 4180 CSV: quoted fields, escaped quotes, commas and newlines inside quotes,
 * CRLF or LF line endings, and a leading UTF-8 BOM (Excel adds one).
 */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully empty lines (trailing newline, blank rows).
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export type CsvValue = string | number | boolean | null | undefined | { toString(): string };

function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'object' ? value.toString() : String(value);
  // Neutralise spreadsheet formulas in exported text (CSV injection).
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const BOM = '﻿';

export function toCsv(header: string[], rows: CsvValue[][]): string {
  // BOM so Excel opens UTF-8 (₹, accented names) correctly.
  return `${BOM}${[header, ...rows].map((r) => r.map(escapeCell).join(',')).join('\r\n')}\r\n`;
}
