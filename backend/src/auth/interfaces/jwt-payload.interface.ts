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
