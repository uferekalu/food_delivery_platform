import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions, Profile } from 'passport-facebook';
import type { OAuthProfile } from '../interfaces/oauth-profile.interface';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(config: ConfigService) {
    // Same graceful-degradation reasoning as GoogleStrategy — a missing appID/appSecret must
    // never crash app boot; GET /auth/facebook just fails at Facebook's end instead.
    super({
      clientID: config.get<string>('FACEBOOK_APP_ID') ?? 'unconfigured',
      clientSecret: config.get<string>('FACEBOOK_APP_SECRET') ?? 'unconfigured',
      callbackURL:
        config.get<string>('FACEBOOK_CALLBACK_URL') ??
        'http://localhost:4000/auth/facebook/callback',
      profileFields: ['id', 'displayName', 'photos', 'email'],
      // Unlike Google, Facebook does not return email by default — passport-oauth2 (the base
      // class) reads this constructor option and applies it as the default scope on the
      // /auth/facebook redirect. Missing this was the root cause of profile.emails always
      // being empty, which made validate() below throw on every real login attempt.
      scope: ['email'],
    } satisfies StrategyOptions);
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err: Error | null, user?: OAuthProfile) => void,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      // Common for a Facebook account with no verified email on file, or the person declined
      // the email permission — there's no account to find-or-create without one. An
      // UnauthorizedException (not a plain Error) so this surfaces as a clean 401 through
      // Nest's AuthGuard/exception filter instead of an opaque 500.
      done(new UnauthorizedException('Facebook account has no email'));
      return;
    }
    done(null, {
      email,
      name: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    });
  }
}
