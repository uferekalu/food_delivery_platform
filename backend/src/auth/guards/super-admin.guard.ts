import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccessTokenPayload } from '../interfaces/jwt-payload.interface';

/**
 * Gates the single most consequential admin action — granting or revoking admin access
 * (`UsersController.updateRole`, docs/ROADMAP.md FDP-139) — behind a narrower privilege than
 * plain `@Roles('admin')`. A super admin is still an ordinary `role: 'admin'` user for every
 * other admin-only endpoint in the app; this is the one deliberate exception. Always applied
 * alongside `@Roles('admin')`, never in place of it — an unauthenticated or non-admin request
 * is already rejected before this guard runs.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AccessTokenPayload }>();

    if (!request.user?.isSuperAdmin) {
      throw new ForbiddenException(
        'Only a super admin can grant or revoke admin access.',
      );
    }
    return true;
  }
}
