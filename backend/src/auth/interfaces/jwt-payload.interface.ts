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
