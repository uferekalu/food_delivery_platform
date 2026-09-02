/** RFC 4180 field escaping — wraps in quotes and doubles any embedded quote whenever the field
 * contains a comma, quote, or newline. Hand-rolled rather than a dependency: this codebase only
 * ever needs a handful of fixed, simple columns (docs/ROADMAP.md FDP-64's sales-report export),
 * not general-purpose CSV parsing/writing. */
export function csvField(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function csvRow(fields: (string | number)[]): string {
  return fields.map(csvField).join(',');
}
