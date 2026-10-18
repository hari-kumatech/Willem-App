// CSV helpers. Semicolon-separated with a UTF-8 BOM so Dutch Excel opens it directly (A.2),
// and every cell is protected against formula injection (A.8 finding).

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  // A cell starting with = + - @ (or tab/CR) is run as a formula by Excel: prefix it with a quote
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[;"\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(';'));
  return `﻿${lines.join('\r\n')}\r\n`;
}
