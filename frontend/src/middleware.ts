import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Everything except: Next internals, the /api rewrite proxy (next.config.ts), static files,
  // and the out-of-scope route trees this ticket deliberately doesn't touch — design-system
  // stays English-only, unprefixed, exactly as it is today until its own i18n ticket
  // (docs/ROADMAP.md FDP-55's customer-facing-first scope; dashboard moved in-scope in FDP-70,
  // admin in FDP-72, rider in FDP-73). Excluding it here means the middleware never redirects/
  // rewrites that path at all.
  matcher: [
    "/((?!api|_next|_vercel|design-system|.*\\..*).*)",
  ],
};
