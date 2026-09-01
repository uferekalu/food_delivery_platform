import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomInt, createHash } from 'crypto';
import { Model } from 'mongoose';
import type { StringValue } from 'ms';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../notifications/sms.service';
import {
  RefreshToken,
  RefreshTokenDocument,
} from './schemas/refresh-token.schema';
import { PhoneOtp, PhoneOtpDocument } from './schemas/phone-otp.schema';
import type { PhoneOtpPurpose } from './schemas/phone-otp.schema';
import {
  AccessTokenPayload,
  EmailTokenPayload,
  OAuthExchangeTokenPayload,
  PhoneSignupTokenPayload,
} from './interfaces/jwt-payload.interface';
import { RegisterDto } from './dto/register.dto';
import type { OAuthProfile } from './interfaces/oauth-profile.interface';

const OAUTH_EXCHANGE_TTL = '60s';

const BCRYPT_SALT_ROUNDS = 12;
const PHONE_OTP_TTL_MS = 5 * 60 * 1000;
const PHONE_OTP_MAX_ATTEMPTS = 5;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isEmailVerified: boolean;
  avatarUrl: string | null;
  phone: string | null;
  isPhoneVerified: boolean;
}

function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    isPhoneVerified: user.isPhoneVerified,
  };
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(PhoneOtp.name)
    private readonly phoneOtpModel: Model<PhoneOtpDocument>,
  ) {}

  async register(
    dto: RegisterDto,
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const verifiedPhone = dto.phone
      ? this.consumePhoneSignupToken(dto.phone, dto.phoneVerificationToken)
      : undefined;
    if (verifiedPhone) {
      const existingPhone = await this.usersService.findByPhone(verifiedPhone);
      if (existingPhone) {
        throw new ConflictException(
          'An account with this phone number already exists',
        );
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      role: dto.role,
      ...(verifiedPhone ? { phone: verifiedPhone, isPhoneVerified: true } : {}),
    });

    // Deliberately not awaited: registration shouldn't be coupled to a third-party email
    // API's latency (or downtime) — the account is already created and usable regardless of
    // whether/when the verification email lands. Errors are still caught and logged.
    void this.sendVerificationEmail(user).catch((error: unknown) => {
      this.logger.error(
        `Failed to send verification email to ${user.email}`,
        error,
      );
    });

    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  /**
   * Sends (or silently no-ops) a 6-digit OTP over SMS. Never reveals whether a matching account
   * exists — same "don't leak account state" reasoning as forgotPassword(): for `purpose:
   * 'login'`, a phone with no verified account just doesn't get a text, but the caller sees the
   * same generic response either way.
   */
  async sendPhoneCode(phone: string, purpose: PhoneOtpPurpose): Promise<void> {
    if (purpose === 'login') {
      const user = await this.usersService.findByPhone(phone);
      if (!user || !user.isPhoneVerified) return;
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');

    // Only one live code per phone+purpose at a time — an old, still-unexpired code left active
    // would otherwise also validate, doubling the effective attempt budget against it.
    await this.phoneOtpModel
      .deleteMany({ phone, purpose, consumedAt: null })
      .exec();
    await this.phoneOtpModel.create({
      phone,
      purpose,
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() + PHONE_OTP_TTL_MS),
    });

    const sent = await this.smsService.send(
      phone,
      `Your Food Delivery Platform verification code is ${code}. It expires in 5 minutes.`,
    );
    if (!sent) {
      this.logger.warn(
        `Phone OTP to ${phone} (purpose: ${purpose}) was not sent — SMS provider unavailable or unconfigured`,
      );
    }
  }

  /**
   * `purpose: 'login'` logs the caller straight in (passwordless — proving phone ownership via
   * OTP is the credential) and returns real session tokens. `purpose: 'signup'` has no user to
   * log into yet, so it returns a short-lived proof-of-verification token instead, which
   * `register()` above requires alongside a matching `phone` to actually attach it to the new
   * account — this is what stops someone from claiming a phone they were never sent a code for.
   */
  async verifyPhoneCode(
    phone: string,
    code: string,
    purpose: PhoneOtpPurpose,
  ): Promise<
    | { purpose: 'signup'; phoneVerificationToken: string }
    | { purpose: 'login'; user: PublicUser; tokens: AuthTokens }
  > {
    const otp = await this.phoneOtpModel
      .findOne({ phone, purpose, consumedAt: null })
      .sort({ createdAt: -1 })
      .exec();

    if (!otp || otp.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    if (otp.attempts >= PHONE_OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException('Too many attempts — request a new code');
    }
    if (otp.codeHash !== hashToken(code)) {
      otp.attempts += 1;
      await otp.save();
      throw new UnauthorizedException('Invalid or expired code');
    }

    otp.consumedAt = new Date();
    await otp.save();

    if (purpose === 'login') {
      const user = await this.usersService.findByPhone(phone);
      if (!user || !user.isPhoneVerified) {
        throw new UnauthorizedException(
          'No account found with this phone number',
        );
      }
      const tokens = await this.issueTokens(user);
      return { purpose: 'login', user: toPublicUser(user), tokens };
    }

    const phoneVerificationToken = this.jwtService.sign(
      {
        phone,
        purpose: 'verify-phone-signup',
      } satisfies PhoneSignupTokenPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_EMAIL_SECRET'),
        expiresIn: '10m',
      },
    );
    return { purpose: 'signup', phoneVerificationToken };
  }

  /**
   * Finds-or-creates a user for an OAuth-authenticated email (Google, Facebook — any provider
   * whose strategy normalizes its profile into OAuthProfile) and mints a short-lived exchange
   * token (see OAuthExchangeTokenPayload) — this does *not* itself issue session tokens or set
   * the refresh cookie, since the provider's own redirect back to our callback responds
   * directly from the backend's own domain, not proxied through the frontend
   * (docs/ARCHITECTURE.md §11). Real tokens are only issued by `exchangeOAuthToken` below,
   * called from the frontend's own origin.
   *
   * An existing email/password (or other-provider) account with the same verified email is
   * logged into directly — this becomes an additional way in, not a separate account. A new
   * account gets an unusable random password (nobody knows it) until the person sets a real one
   * via "forgot password", and role defaults to `customer` — OAuth sign-in has no UI step to
   * pick `restaurant_owner` the way the registration form does.
   */
  async loginOrRegisterWithOAuthProfile(
    profile: OAuthProfile,
  ): Promise<string> {
    let user = await this.usersService.findByEmail(profile.email);
    if (!user) {
      const passwordHash = await bcrypt.hash(
        randomBytes(32).toString('hex'),
        BCRYPT_SALT_ROUNDS,
      );
      user = await this.usersService.create({
        email: profile.email,
        passwordHash,
        name: profile.name,
        role: 'customer',
      });
    }
    if (!user.isEmailVerified) {
      await this.usersService.markEmailVerified(user._id.toString());
    }

    return this.jwtService.sign(
      {
        sub: user._id.toString(),
        purpose: 'oauth-exchange',
      } satisfies OAuthExchangeTokenPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_EMAIL_SECRET'),
        expiresIn: OAUTH_EXCHANGE_TTL,
      },
    );
  }

  /** Redeems an exchange token from `loginOrRegisterWithOAuthProfile` — this is where session tokens
   * actually get issued, in a call made from the frontend's own origin (see the type doc on
   * OAuthExchangeTokenPayload for why that split exists). */
  async exchangeOAuthToken(
    rawToken: string,
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    let payload: OAuthExchangeTokenPayload;
    try {
      payload = this.jwtService.verify<OAuthExchangeTokenPayload>(rawToken, {
        secret: this.config.getOrThrow<string>('JWT_EMAIL_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired sign-in link');
    }
    if (payload.purpose !== 'oauth-exchange') {
      throw new UnauthorizedException('Invalid or expired sign-in link');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user)
      throw new UnauthorizedException('Invalid or expired sign-in link');

    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  async refresh(
    rawRefreshToken: string,
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const tokenHash = hashToken(rawRefreshToken);
    const stored = await this.refreshTokenModel.findOne({ tokenHash }).exec();

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (stored.revokedAt) {
      // This token was already rotated once — someone is replaying an old token (most likely
      // stolen). Treat the whole family as compromised: revoke every token for this user.
      await this.refreshTokenModel
        .updateMany(
          { userId: stored.userId, revokedAt: null },
          { revokedAt: new Date() },
        )
        .exec();
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId.toString()}`,
      );
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(stored.userId.toString());
    if (!user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokens = await this.issueTokens(user);
    stored.revokedAt = new Date();
    stored.replacedByTokenHash = hashToken(tokens.refreshToken);
    await stored.save();

    return { user: toPublicUser(user), tokens };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    await this.refreshTokenModel
      .updateOne({ tokenHash, revokedAt: null }, { revokedAt: new Date() })
      .exec();
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const payload = this.verifyEmailToken(rawToken, 'verify-email');
    await this.usersService.markEmailVerified(payload.sub);
  }

  async resendVerificationEmail(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user || user.isEmailVerified) return; // don't reveal account existence/state
    // Not awaited — the response never reveals email-send success/failure anyway (same
    // "don't reveal account state" reasoning as above), so awaiting would only add third-party
    // API latency to the response with no corresponding benefit. See `register()`.
    void this.sendVerificationEmail(user).catch((error: unknown) => {
      this.logger.error(
        `Failed to resend verification email to ${user.email}`,
        error,
      );
    });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user) return; // don't reveal whether the account exists

    const token = this.jwtService.sign(
      {
        sub: user._id.toString(),
        purpose: 'reset-password',
        pwdFingerprint: fingerprint(user.passwordHash),
      } satisfies EmailTokenPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_EMAIL_SECRET'),
        expiresIn: '1h',
      },
    );

    const resetUrl = `${this.config.getOrThrow<string>('FRONTEND_URL')}/reset-password?token=${token}`;
    // Not awaited — same reasoning as register()/resendVerificationEmail above.
    void this.mailService
      .sendPasswordResetEmail(user.email, resetUrl)
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to send password reset email to ${user.email}`,
          error,
        );
      });
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const payload = this.verifyEmailToken(rawToken, 'reset-password');
    const target = await this.findUserWithPasswordById(payload.sub);

    if (
      !target ||
      fingerprint(target.passwordHash) !== payload.pwdFingerprint
    ) {
      // Either the user no longer exists, or the password already changed since this token
      // was issued (fingerprint mismatch) — the token has effectively already been used.
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await this.usersService.updatePasswordHash(
      target._id.toString(),
      passwordHash,
    );

    // Password changed — force re-authentication on every device.
    await this.refreshTokenModel
      .updateMany(
        { userId: target._id, revokedAt: null },
        { revokedAt: new Date() },
      )
      .exec();
  }

  /**
   * Change password while already logged in — separate from `resetPassword`'s
   * email-token flow, which is for someone who *can't* log in. Requires the current password
   * rather than just trusting the access token, in case a session was left open on a shared
   * device. Revokes every refresh token on success (same as `resetPassword`) — the current
   * access token stays valid until it naturally expires (~15 min), so this doesn't force an
   * immediate logout, but the next silent refresh anywhere will fail and require a fresh login.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersService.findByIdWithPassword(userId);
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await this.usersService.updatePasswordHash(userId, passwordHash);

    await this.refreshTokenModel
      .updateMany(
        { userId: user._id, revokedAt: null },
        { revokedAt: new Date() },
      )
      .exec();
  }

  private async findUserWithPasswordById(
    id: string,
  ): Promise<UserDocument | null> {
    const user = await this.usersService.findById(id);
    if (!user) return null;
    return this.usersService.findByEmailWithPassword(user.email);
  }

  /**
   * `register()` only calls this when `dto.phone` is actually set, so a phone-less signup never
   * reaches here at all. Once a phone *is* present, a matching, valid `phoneVerificationToken`
   * is mandatory — a bare phone with no proof of OTP verification must never be silently
   * trusted, so every failure path (missing token, expired, wrong phone) throws the same way.
   */
  private consumePhoneSignupToken(
    phone: string,
    rawToken: string | undefined,
  ): string | undefined {
    if (!rawToken) {
      throw new BadRequestException(
        'phoneVerificationToken is required when phone is provided',
      );
    }
    let payload: PhoneSignupTokenPayload;
    try {
      payload = this.jwtService.verify<PhoneSignupTokenPayload>(rawToken, {
        secret: this.config.getOrThrow<string>('JWT_EMAIL_SECRET'),
      });
    } catch {
      throw new BadRequestException('Invalid or expired phone verification');
    }
    if (payload.purpose !== 'verify-phone-signup' || payload.phone !== phone) {
      throw new BadRequestException('Invalid or expired phone verification');
    }
    return payload.phone;
  }

  private verifyEmailToken(
    rawToken: string,
    expectedPurpose: EmailTokenPayload['purpose'],
  ): EmailTokenPayload {
    let payload: EmailTokenPayload;
    try {
      payload = this.jwtService.verify<EmailTokenPayload>(rawToken, {
        secret: this.config.getOrThrow<string>('JWT_EMAIL_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (payload.purpose !== expectedPurpose) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return payload;
  }

  private async sendVerificationEmail(user: UserDocument): Promise<void> {
    const token = this.jwtService.sign(
      {
        sub: user._id.toString(),
        purpose: 'verify-email',
      } satisfies EmailTokenPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_EMAIL_SECRET'),
        expiresIn: '24h',
      },
    );
    const verifyUrl = `${this.config.getOrThrow<string>('FRONTEND_URL')}/verify-email?token=${token}`;
    await this.mailService.sendVerificationEmail(user.email, verifyUrl);
  }

  private async issueTokens(user: UserDocument): Promise<AuthTokens> {
    const accessPayload: AccessTokenPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      // Joi guarantees this is a valid ms-style string (defaulted to '15m') — see env.validation.ts.
      expiresIn: this.config.get<string>(
        'JWT_ACCESS_EXPIRES_IN',
      ) as StringValue,
    });

    const rawRefreshToken = randomBytes(64).toString('hex');
    const refreshTtlMs = this.parseRefreshTtlMs();
    const expiresAt = new Date(Date.now() + refreshTtlMs);

    await this.refreshTokenModel.create({
      userId: user._id,
      tokenHash: hashToken(rawRefreshToken),
      expiresAt,
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      refreshTokenExpiresAt: expiresAt,
    };
  }

  private parseRefreshTtlMs(): number {
    const raw = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d';
    const match = /^(\d+)([smhd])$/.exec(raw);
    if (!match) return 30 * 24 * 60 * 60 * 1000;

    const value = Number(match[1]);
    const unitMs =
      { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]] ??
      86_400_000;
    return value * unitMs;
  }
}
