// Routes that live outside app/[locale] — not yet translated (a future ticket per
// docs/ROADMAP.md FDP-55/FDP-70), so the middleware never locale-prefixes them and they only
// ever exist at their plain, unprefixed path. Shared by SmartLink (picking which Link
// implementation to render) and LanguageSwitcher (never constructing a locale-prefixed URL for
// one of these paths — that URL doesn't exist and previously 404'd anyone who switched language
// while on, say, /dashboard/restaurants). `/dashboard` moved in-scope in FDP-70, `/admin` in
// FDP-72, `/rider` in FDP-73 — this list now only covers design-system.
export const OUT_OF_SCOPE_PREFIXES = ["/design-system"];

export function isOutOfScopePath(pathname: string): boolean {
  return OUT_OF_SCOPE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`),
  );
}
