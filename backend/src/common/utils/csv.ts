/** RFC 4180 field escaping — wraps in quotes and doubles any embedded quote whenever the field
 * contains a comma, quote, or newline. Hand-rolled rather than a dependency: this codebase only
 * ever needs a handful of fixed, simple columns (docs/ROADMAP.md FDP-64's sales-report export),
 * not general-purpose CSV parsing/writing.
 *
 * Also neutralizes CSV/formula injection (OWASP) for string fields: a value starting with
 * =, +, -, @, tab, or CR can be interpreted as a formula by Excel/Sheets when the exported file
 * is opened — e.g. a menu item named `=HYPERLINK("http://evil.example",...)` reaching this
 * export via an order's item-name snapshot (docs/ROADMAP.md FDP-65, `CreateMenuItemDto.name`
 * has no character restriction). A leading single quote forces plain-text interpretation in
 * every modern spreadsheet app without changing the visible value. Only applied to strings — a
 * genuine negative number (`typeof value === 'number'`) is never at risk and must not be
 * mangled into text. */
export function csvField(value: string | number): string {
  if (typeof value === 'number') return String(value);
  const str = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function csvRow(fields: (string | number)[]): string {
  return fields.map(csvField).join(',');
}
