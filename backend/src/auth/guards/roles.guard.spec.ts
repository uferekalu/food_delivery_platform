import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { AccessTokenPayload } from '../interfaces/jwt-payload.interface';

function createContext(user?: AccessTokenPayload): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  function guardWithRoles(roles: string[] | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(roles),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  it('allows the request through when the route has no @Roles() requirement', () => {
    const guard = guardWithRoles(undefined);
    expect(guard.canActivate(createContext(undefined))).toBe(true);
  });

  it('allows a user whose role is in the required list', () => {
    const guard = guardWithRoles(['admin', 'restaurant_owner']);
    const user = {
      sub: '1',
      email: 'a@b.com',
      role: 'admin',
    } as AccessTokenPayload;
    expect(guard.canActivate(createContext(user))).toBe(true);
  });

  it('rejects a user whose role is not in the required list', () => {
    const guard = guardWithRoles(['admin']);
    const user = {
      sub: '1',
      email: 'a@b.com',
      role: 'customer',
    } as AccessTokenPayload;
    expect(() => guard.canActivate(createContext(user))).toThrow(
      'You do not have permission to perform this action',
    );
  });

  it('rejects when there is no authenticated user at all', () => {
    const guard = guardWithRoles(['admin']);
    expect(() => guard.canActivate(createContext(undefined))).toThrow();
  });
});
