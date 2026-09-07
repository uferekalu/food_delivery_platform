import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AccessTokenPayload } from '../interfaces/jwt-payload.interface';

/**
 * Support chat widget (docs/ROADMAP.md FDP-106) — the first "public but user-aware" endpoint
 * this codebase has needed. `@Public()` alone (see `jwt-auth.guard.ts`) skips Passport entirely,
 * so `request.user` is never populated even when a valid Authorization header is sent; that's
 * fine for every existing `@Public()` route (webhooks, browse endpoints), none of which care who
 * (if anyone) is asking. The chatbot does: a logged-in visitor should be identified by their real
 * account, a guest by a client-generated session id — both hitting the same endpoint.
 *
 * Standard documented Nest/Passport pattern for "identify the user if a token was sent, never
 * reject if not": override `handleRequest` to return `user ?? null` instead of the default
 * (throw on missing/invalid token). Apply alongside `@Public()` — `@Public()` satisfies the
 * global `JwtAuthGuard`, this one still runs (route-level guards stack, they don't replace the
 * global one) and actually attempts the token verification, just never failing the request over
 * it. `@CurrentUser()` then returns the verified payload or `null`, unchanged from its existing
 * shape.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt-access') {
  // Passport's default "no strategy match" value is `false`, not `null` — normalized here so
  // every caller (this guard's only consumers, the two chatbot routes, via `@CurrentUserOptional`)
  // can rely on exactly two possible shapes: a real `AccessTokenPayload`, or `null`. `TUser` is
  // constrained to that same union so a caller can't accidentally get back something else.
  handleRequest<TUser = AccessTokenPayload | null>(
    _err: unknown,
    user: unknown,
  ): TUser {
    return ((user as AccessTokenPayload | false) || null) as TUser;
  }
}
