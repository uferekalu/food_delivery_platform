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

// Localizes the *display* label only — `value` stays the canonical English country name from
// countries.json (what's actually stored on the restaurant and what currencyForCountry keys
// off), so switching locale never changes submitted data, just what the picker shows. Built on
// the platform's own `Intl.DisplayNames` rather than a hand-maintained translation list — with
// ~190 countries × 6 languages that would be both enormous and far more error-prone than the
// browser/Node ICU data every environment already ships.
export function getLocalizedCountryOptions(locale: string): SelectOption[] {
  let displayNames: Intl.DisplayNames | null = null;
  try {
    displayNames = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    displayNames = null;
  }
  return COUNTRIES.map((c) => ({
    value: c.name,
    label: displayNames?.of(c.code) ?? c.name,
  }));
}

// Same reasoning as getLocalizedCountryOptions, for currency names — `value` stays the ISO code
// (NGN, USD, ...) either way.
export function getLocalizedCurrencyOptions(locale: string): SelectOption[] {
  let displayNames: Intl.DisplayNames | null = null;
  try {
    displayNames = new Intl.DisplayNames([locale], { type: "currency" });
  } catch {
    displayNames = null;
  }
  return Array.from(currencyMap.entries())
    .map(([code, name]) => ({ value: code, label: `${code} — ${displayNames?.of(code) ?? name}` }))
    .sort((a, b) => a.value.localeCompare(b.value));
}
