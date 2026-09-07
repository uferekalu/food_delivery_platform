import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AccessTokenPayload } from '../interfaces/jwt-payload.interface';

/** The authenticated user's JWT payload, attached to the request by JwtAuthGuard/JwtStrategy. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AccessTokenPayload }>();
    return request.user;
  },
);

/** Support chat widget (docs/ROADMAP.md FDP-106) — for a route guarded by
 * `OptionalJwtAuthGuard` instead of the default mandatory `JwtAuthGuard`, where `request.user`
 * is genuinely `null` for a guest rather than always a real payload. Kept as its own decorator
 * (not a nullable overload of `CurrentUser`) so every other, non-optional call site keeps its
 * honest non-null type — only a route that actually opted into optional auth needs to handle
 * `null`. */
export const CurrentUserOptional = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload | null => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AccessTokenPayload | null }>();
    return request.user ?? null;
  },
);
