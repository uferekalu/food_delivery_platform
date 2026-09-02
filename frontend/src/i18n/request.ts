import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

// Loads the message catalog for the active locale (docs/ROADMAP.md FDP-55). Falls back to the
// default locale's messages for any request next-intl can't resolve a supported locale for
// (e.g. an out-of-scope route the middleware never touched) — never throws, since the shared
// root layout renders for every route in the app, in and out of i18n scope.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
