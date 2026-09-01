import { Injectable } from '@nestjs/common';
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
      // the email permission — there's no account to find-or-create without one.
      done(new Error('Facebook account has no email'));
      return;
    }
    done(null, {
      email,
      name: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    });
  }
}
