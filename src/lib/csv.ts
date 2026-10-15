/**
 * Minimal CSV writer for admin exports.
 * - Quotes every field that contains a comma, quote or newline.
 * - Neutralises spreadsheet formulas: a cell starting with = + - @ (or tab/CR) gets a
 *   leading apostrophe so a guest-entered name like "=HYPERLINK(...)" can't execute in
 *   Excel or Google Sheets.
 */
export type CsvValue = string | number | boolean | null | undefined

function formatCell(value: CsvValue): string {
  if (value === null || value === undefined) return ""
  let text = typeof value === "string" ? value : String(value)
  const isPlainNumber = /^-?\d+(\.\d+)?$/.test(text)
  if (typeof value === "string" && !isPlainNumber && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(formatCell).join(","), ...rows.map((row) => row.map(formatCell).join(","))]
  // Leading BOM so Excel opens UTF-8 (names with accents) correctly.
  return "﻿" + lines.join("\r\n") + "\r\n"
}
