import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Everything except: Next internals, the /api rewrite proxy (next.config.ts), static files,
  // and the out-of-scope route trees this ticket deliberately doesn't touch — dashboard/admin/
  // rider stay English-only, unprefixed, exactly as they are today until their own i18n tickets
  // (docs/ROADMAP.md FDP-55's customer-facing-first scope). Excluding them here means the
  // middleware never redirects/rewrites those paths at all.
  matcher: [
    "/((?!api|_next|_vercel|dashboard|admin|rider|design-system|.*\\..*).*)",
  ],
};
