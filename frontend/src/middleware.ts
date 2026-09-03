import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Everything except: Next internals, the /api rewrite proxy (next.config.ts), static files,
  // and the out-of-scope route trees this ticket deliberately doesn't touch — rider/design-system
  // stay English-only, unprefixed, exactly as they are today until their own i18n tickets
  // (docs/ROADMAP.md FDP-55's customer-facing-first scope; dashboard moved in-scope in FDP-70,
  // admin in FDP-72). Excluding them here means the middleware never redirects/rewrites those
  // paths at all.
  matcher: [
    "/((?!api|_next|_vercel|rider|design-system|.*\\..*).*)",
  ],
};
