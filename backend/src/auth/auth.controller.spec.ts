import { buildRefreshCookieOptions } from './auth.controller';

// CSRF protection review (docs/ROADMAP.md FDP-99, docs/ARCHITECTURE.md §11): the refresh cookie
// is the only cookie-authenticated surface in this app, so its exact attributes are what stands
// between "narrow, low-value CSRF exposure" and "a real gap" — worth locking down with a direct
// test per environment, not just eyeballing the source.
describe('buildRefreshCookieOptions', () => {
  const expires = new Date('2030-01-01T00:00:00.000Z');

  it('is Secure with SameSite=None in production (required for the cross-site frontend/backend deploy)', () => {
    expect(buildRefreshCookieOptions(true, expires)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/api/auth',
      expires,
    });
  });

  it('is not Secure, with SameSite=Lax, outside production (same-site localhost dev)', () => {
    expect(buildRefreshCookieOptions(false, expires)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/api/auth',
      expires,
    });
  });

  it('is always httpOnly and scoped to the /api/auth path, regardless of environment', () => {
    for (const isProduction of [true, false]) {
      const options = buildRefreshCookieOptions(isProduction, expires);
      expect(options.httpOnly).toBe(true);
      expect(options.path).toBe('/api/auth');
    }
  });
});
