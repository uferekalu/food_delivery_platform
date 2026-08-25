import countries from "@/data/countries.json";
import type { SelectOption } from "@/components/ui/select";

export interface Country {
  name: string;
  code: string;
  currencyCode: string;
  currencyName: string;
}

export const COUNTRIES: Country[] = countries;

export const COUNTRY_OPTIONS: SelectOption[] = COUNTRIES.map((c) => ({
  value: c.name,
  label: c.name,
}));

const CURRENCY_BY_COUNTRY = new Map(COUNTRIES.map((c) => [c.name, c.currencyCode]));

// A currency can be shared by several countries (e.g. EUR) — de-duped by code, sorted so a
// searched-for code is easy to scan for in the dropdown.
const currencyMap = new Map<string, string>();
for (const c of COUNTRIES) {
  if (!currencyMap.has(c.currencyCode)) currencyMap.set(c.currencyCode, c.currencyName);
}
export const CURRENCY_OPTIONS: SelectOption[] = Array.from(currencyMap.entries())
  .map(([code, name]) => ({ value: code, label: `${code} — ${name}` }))
  .sort((a, b) => a.value.localeCompare(b.value));

export function currencyForCountry(countryName: string): string | undefined {
  return CURRENCY_BY_COUNTRY.get(countryName);
}
