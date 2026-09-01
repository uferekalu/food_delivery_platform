import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy,
  StrategyOptions,
  VerifyCallback,
} from 'passport-google-oauth20';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    // Falls back to harmless placeholders rather than getOrThrow — passport-oauth2's own
    // constructor throws synchronously if clientID/clientSecret are missing, which would crash
    // app boot entirely in any environment without Google configured. With placeholders, boot
    // always succeeds; GET /auth/google just fails at Google's end (invalid client_id) instead.
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID') ?? 'unconfigured',
      clientSecret:
        config.get<string>('GOOGLE_CLIENT_SECRET') ?? 'unconfigured',
      callbackURL:
        config.get<string>('GOOGLE_CALLBACK_URL') ??
        'http://localhost:4000/auth/google/callback',
      scope: ['email', 'profile'],
    } satisfies StrategyOptions);
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: {
      id: string;
      emails?: { value: string }[];
      displayName: string;
      photos?: { value: string }[];
    },
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      // UnauthorizedException (not a plain Error) so this surfaces as a clean 401 through
      // Nest's AuthGuard/exception filter instead of an opaque 500 — see the same fix on
      // FacebookStrategy.
      done(new UnauthorizedException('Google account has no email'));
      return;
    }
    const googleProfile: GoogleProfile = {
      googleId: profile.id,
      email,
      name: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };
    done(null, googleProfile);
  }
}
