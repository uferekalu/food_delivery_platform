import { ExecutionContext } from '@nestjs/common';
import { SuperAdminGuard } from './super-admin.guard';
import { AccessTokenPayload } from '../interfaces/jwt-payload.interface';

function createContext(user?: AccessTokenPayload): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('SuperAdminGuard', () => {
  const guard = new SuperAdminGuard();

  it('allows a super admin through', () => {
    const user = {
      sub: '1',
      email: 'a@b.com',
      role: 'admin',
      isSuperAdmin: true,
    } as AccessTokenPayload;
    expect(guard.canActivate(createContext(user))).toBe(true);
  });

  it('rejects a plain admin (isSuperAdmin: false)', () => {
    const user = {
      sub: '1',
      email: 'a@b.com',
      role: 'admin',
      isSuperAdmin: false,
    } as AccessTokenPayload;
    expect(() => guard.canActivate(createContext(user))).toThrow(
      'Only a super admin can grant or revoke admin access.',
    );
  });

  it('rejects a plain admin (isSuperAdmin absent — a pre-migration token)', () => {
    const user = {
      sub: '1',
      email: 'a@b.com',
      role: 'admin',
    } as AccessTokenPayload;
    expect(() => guard.canActivate(createContext(user))).toThrow();
  });

  it('rejects when there is no authenticated user at all', () => {
    expect(() => guard.canActivate(createContext(undefined))).toThrow();
  });
});
