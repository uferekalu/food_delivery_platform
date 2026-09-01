import { UserRole } from '../../users/schemas/user.schema';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface EmailTokenPayload {
  sub: string;
  purpose: 'verify-email' | 'reset-password';
  /** Fingerprint of the user's current passwordHash at issue time — for reset-password tokens,
   * this makes the token effectively single-use: once the password changes, the fingerprint
   * no longer matches and the token is rejected even though it hasn't expired yet. */
  pwdFingerprint?: string;
}

/**
 * Proves a phone number was just verified via OTP (docs/ROADMAP.md FDP-41), carried from
 * `POST /auth/phone/verify-code` (purpose: 'signup') into `POST /auth/register` — there's no
 * user record yet at that point, so unlike EmailTokenPayload this has no `sub`.
 */
export interface PhoneSignupTokenPayload {
  phone: string;
  purpose: 'verify-phone-signup';
}

/**
 * Redeemed once by `POST /auth/oauth/exchange` (docs/ROADMAP.md FDP-42) to actually issue
 * session tokens and set the refresh cookie. Google's own redirect back to
 * `GET /auth/google/callback` necessarily lands on the backend's bare domain, not proxied
 * through the frontend's origin (docs/ARCHITECTURE.md §11) — a cookie set there would be
 * third-party again. This carries only a `sub` and a short (60s) expiry to the frontend via a
 * URL param instead, which redeems it through the frontend's own `/api/*` proxy — a real
 * first-party call — rather than putting the actual session tokens in a URL at all.
 */
export interface OAuthExchangeTokenPayload {
  sub: string;
  purpose: 'oauth-exchange';
}
