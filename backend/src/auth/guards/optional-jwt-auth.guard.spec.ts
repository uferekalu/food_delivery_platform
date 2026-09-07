import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

describe('OptionalJwtAuthGuard (docs/ROADMAP.md FDP-106)', () => {
  const guard = new OptionalJwtAuthGuard();

  it('returns the verified user payload when a valid token was sent', () => {
    const user = { sub: 'user-1', email: 'a@example.com', role: 'customer' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('returns null (never throws) when no token was sent — Passport reports this as `false`', () => {
    expect(guard.handleRequest(null, false)).toBeNull();
  });

  it('returns null (never throws) when an invalid/expired token was sent', () => {
    expect(guard.handleRequest(new Error('jwt expired'), false)).toBeNull();
  });
});
