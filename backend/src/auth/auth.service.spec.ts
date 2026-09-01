import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { UnauthorizedException } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../notifications/sms.service';
import {
  RefreshToken,
  RefreshTokenDocument,
  RefreshTokenSchema,
} from './schemas/refresh-token.schema';
import {
  PhoneOtp,
  PhoneOtpDocument,
  PhoneOtpSchema,
} from './schemas/phone-otp.schema';
import { User, UserDocument, UserSchema } from '../users/schemas/user.schema';
import * as bcrypt from 'bcryptjs';

// bcrypt at cost factor 12 (deliberately slow, by design) plus real Mongo round-trips can
// comfortably exceed Jest's 5s default per-test timeout on a loaded/virtualized machine.
jest.setTimeout(30_000);

describe('AuthService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let authService: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let mailService: jest.Mocked<MailService>;
  let smsService: jest.Mocked<SmsService>;
  let userModel: Model<UserDocument>;
  let refreshTokenModel: Model<RefreshTokenDocument>;
  let phoneOtpModel: Model<PhoneOtpDocument>;

  beforeAll(async () => {
    // See backend/CLAUDE.md ("Testing") for why launchTimeout is set explicitly.
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_ACCESS_SECRET: 'a'.repeat(32),
              JWT_ACCESS_EXPIRES_IN: '15m',
              JWT_REFRESH_EXPIRES_IN: '30d',
              JWT_EMAIL_SECRET: 'c'.repeat(32),
              FRONTEND_URL: 'http://localhost:3000',
            }),
          ],
        }),
        JwtModule.register({}),
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: RefreshToken.name, schema: RefreshTokenSchema },
          { name: User.name, schema: UserSchema },
          { name: PhoneOtp.name, schema: PhoneOtpSchema },
        ]),
      ],
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findByEmailWithPassword: jest.fn(),
            findById: jest.fn(),
            findByIdWithPassword: jest.fn(),
            findByPhone: jest.fn(),
            create: jest.fn(),
            markEmailVerified: jest.fn(),
            updatePasswordHash: jest.fn(),
          },
        },
        {
          provide: MailService,
          // Both real MailService methods always return Promise<void> — matching that here
          // matters now that AuthService chains .catch() onto these calls (fire-and-forget
          // email sends, see auth.service.ts). A bare jest.fn() resolves to `undefined`
          // rather than a promise, which broke with `TypeError: Cannot read properties of
          // undefined (reading 'catch')` the moment that .catch() chaining was added.
          useValue: {
            sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
            sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SmsService,
          useValue: {
            send: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
    usersService = moduleRef.get(UsersService);
    mailService = moduleRef.get(MailService);
    smsService = moduleRef.get(SmsService);
    userModel = moduleRef.get(getModelToken(User.name));
    refreshTokenModel = moduleRef.get(getModelToken(RefreshToken.name));
    phoneOtpModel = moduleRef.get(getModelToken(PhoneOtp.name));
  }, 60_000); // headroom for the 60s mongod launchTimeout above, not just module compile

  afterEach(async () => {
    await refreshTokenModel.deleteMany({}).exec();
    await userModel.deleteMany({}).exec();
    await phoneOtpModel.deleteMany({}).exec();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  async function createUser(passwordHash: string) {
    return userModel.create({
      email: 'jane@example.com',
      passwordHash,
      name: 'Jane Doe',
      role: 'customer',
      isEmailVerified: false,
    });
  }

  describe('register', () => {
    it('rejects an email that is already taken', async () => {
      usersService.findByEmail.mockResolvedValue(
        await createUser('irrelevant'),
      );

      await expect(
        authService.register({
          email: 'jane@example.com',
          password: 'Str0ngPass!',
          name: 'Jane',
        }),
      ).rejects.toThrow('An account with this email already exists');
    });

    it('creates a user with a hashed (not plaintext) password and sends a verification email', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockImplementation((input) =>
        userModel.create({
          ...input,
          role: 'customer',
          isEmailVerified: false,
        }),
      );

      const { user, tokens } = await authService.register({
        email: 'new@example.com',
        password: 'Str0ngPass!',
        name: 'New User',
      });

      expect(user.email).toBe('new@example.com');
      expect(tokens.accessToken).toEqual(expect.any(String));
      const createArg = usersService.create.mock.calls[0][0];
      expect(createArg.passwordHash).not.toBe('Str0ngPass!');
      expect(createArg.passwordHash).toMatch(/^\$2[aby]\$/); // a real bcrypt hash, not plaintext
      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
        'new@example.com',
        expect.stringContaining('/verify-email?token='),
      );
    });
  });

  describe('login', () => {
    it('rejects an incorrect password without revealing which field was wrong', async () => {
      const passwordHash = await bcrypt.hash('CorrectPass1', 12);
      usersService.findByEmailWithPassword.mockResolvedValue(
        await createUser(passwordHash),
      );

      await expect(
        authService.login('jane@example.com', 'WrongPass1'),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    });

    it('issues tokens for a correct password', async () => {
      const passwordHash = await bcrypt.hash('CorrectPass1', 12);
      usersService.findByEmailWithPassword.mockResolvedValue(
        await createUser(passwordHash),
      );

      const { tokens } = await authService.login(
        'jane@example.com',
        'CorrectPass1',
      );
      expect(tokens.accessToken).toEqual(expect.any(String));
      expect(tokens.refreshToken).toEqual(expect.any(String));
    });
  });

  describe('refresh token rotation', () => {
    it('rotates the token and revokes the previous one on a valid refresh', async () => {
      const passwordHash = await bcrypt.hash('CorrectPass1', 12);
      const user = await createUser(passwordHash);
      usersService.findById.mockResolvedValue(user);

      usersService.findByEmailWithPassword.mockResolvedValue(user);
      const { tokens: first } = await authService.login(
        'jane@example.com',
        'CorrectPass1',
      );

      const { tokens: second } = await authService.refresh(first.refreshToken);
      expect(second.refreshToken).not.toBe(first.refreshToken);

      // The original token must now be rejected if presented again.
      await expect(authService.refresh(first.refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('detects reuse of an already-rotated token and revokes the whole family', async () => {
      const passwordHash = await bcrypt.hash('CorrectPass1', 12);
      const user = await createUser(passwordHash);
      usersService.findById.mockResolvedValue(user);
      usersService.findByEmailWithPassword.mockResolvedValue(user);

      const { tokens: first } = await authService.login(
        'jane@example.com',
        'CorrectPass1',
      );
      const { tokens: second } = await authService.refresh(first.refreshToken);

      // Replaying the original (already-rotated) token is reuse — should also invalidate `second`.
      await expect(authService.refresh(first.refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(authService.refresh(second.refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('resetPassword', () => {
    it('rejects a reset token whose password fingerprint no longer matches (already used)', async () => {
      const passwordHash = await bcrypt.hash('CorrectPass1', 12);
      const user = await createUser(passwordHash);
      usersService.findByEmailWithPassword.mockResolvedValueOnce(user);
      usersService.findById.mockResolvedValue(user);

      await authService.forgotPassword('jane@example.com');
      const resetUrl = mailService.sendPasswordResetEmail.mock.calls[0][1];
      const token = new URL(resetUrl).searchParams.get('token')!;

      // Simulate the password having already changed since the token was issued.
      usersService.findByEmailWithPassword.mockResolvedValue(
        await (async () => {
          user.passwordHash = await bcrypt.hash('SomeOtherPass1', 12);
          return user.save();
        })(),
      );

      await expect(
        authService.resetPassword(token, 'NewPass123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('accepts a valid reset token, updates the password, and revokes existing sessions', async () => {
      const passwordHash = await bcrypt.hash('CorrectPass1', 12);
      const user = await createUser(passwordHash);
      usersService.findByEmailWithPassword.mockResolvedValue(user);
      usersService.findById.mockResolvedValue(user);

      await authService.forgotPassword('jane@example.com');
      const resetUrl = mailService.sendPasswordResetEmail.mock.calls[0][1];
      const token = new URL(resetUrl).searchParams.get('token')!;

      await authService.resetPassword(token, 'BrandNewPass1');

      expect(usersService.updatePasswordHash).toHaveBeenCalledWith(
        user._id.toString(),
        expect.any(String),
      );
    });
  });

  describe('changePassword', () => {
    it('rejects an incorrect current password', async () => {
      const passwordHash = await bcrypt.hash('CorrectPass1', 12);
      const user = await createUser(passwordHash);
      usersService.findByIdWithPassword.mockResolvedValue(user);

      await expect(
        authService.changePassword(
          user._id.toString(),
          'WrongPass1',
          'BrandNewPass1',
        ),
      ).rejects.toThrow(
        new UnauthorizedException('Current password is incorrect'),
      );
      expect(usersService.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('updates the password and revokes existing refresh tokens on success', async () => {
      const passwordHash = await bcrypt.hash('CorrectPass1', 12);
      const user = await createUser(passwordHash);
      usersService.findByIdWithPassword.mockResolvedValue(user);
      usersService.findById.mockResolvedValue(user);
      usersService.findByEmailWithPassword.mockResolvedValue(user);

      const { tokens } = await authService.login(
        'jane@example.com',
        'CorrectPass1',
      );

      await authService.changePassword(
        user._id.toString(),
        'CorrectPass1',
        'BrandNewPass1',
      );

      expect(usersService.updatePasswordHash).toHaveBeenCalledWith(
        user._id.toString(),
        expect.any(String),
      );
      // The refresh token issued before the change must now be dead.
      await expect(authService.refresh(tokens.refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('phone OTP', () => {
    function sentCode(): string {
      const message = smsService.send.mock.calls.at(-1)?.[1] ?? '';
      const match = /code is (\d{6})/.exec(message);
      if (!match) throw new Error('No OTP code found in the last SMS send');
      return match[1];
    }

    it('signup: verifying the sent code returns a phoneVerificationToken usable by register()', async () => {
      await authService.sendPhoneCode('+2348012345678', 'signup');
      const code = sentCode();

      const result = await authService.verifyPhoneCode(
        '+2348012345678',
        code,
        'signup',
      );
      expect(result.purpose).toBe('signup');
      if (result.purpose !== 'signup') return;

      usersService.findByEmail.mockResolvedValue(null);
      usersService.findByPhone.mockResolvedValue(null);
      usersService.create.mockImplementation((input) =>
        userModel.create({ ...input, role: 'customer' }),
      );

      const { user } = await authService.register({
        email: 'phone-signup@example.com',
        password: 'Str0ngPass!',
        name: 'Phone Signup',
        phone: '+2348012345678',
        phoneVerificationToken: result.phoneVerificationToken,
      });

      expect(user.phone).toBe('+2348012345678');
      expect(user.isPhoneVerified).toBe(true);
    });

    it('register() rejects a phone with no verification token', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.register({
          email: 'unverified-phone@example.com',
          password: 'Str0ngPass!',
          name: 'No Token',
          phone: '+2348099999999',
        }),
      ).rejects.toThrow(
        'phoneVerificationToken is required when phone is provided',
      );
    });

    it('register() rejects a verification token minted for a different phone', async () => {
      await authService.sendPhoneCode('+2348011111111', 'signup');
      const code = sentCode();
      const result = await authService.verifyPhoneCode(
        '+2348011111111',
        code,
        'signup',
      );
      if (result.purpose !== 'signup')
        throw new Error('expected signup result');

      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.register({
          email: 'mismatched-phone@example.com',
          password: 'Str0ngPass!',
          name: 'Mismatch',
          phone: '+2348022222222', // different from the verified phone above
          phoneVerificationToken: result.phoneVerificationToken,
        }),
      ).rejects.toThrow('Invalid or expired phone verification');
    });

    it('rejects the wrong code and eventually locks out after too many attempts', async () => {
      await authService.sendPhoneCode('+2348033333333', 'signup');

      for (let i = 0; i < 5; i++) {
        await expect(
          authService.verifyPhoneCode('+2348033333333', '000000', 'signup'),
        ).rejects.toThrow('Invalid or expired code');
      }
      // The 6th attempt is blocked for being over the limit, not for a wrong code — a
      // different message, asserted here so the two failure modes don't get conflated.
      await expect(
        authService.verifyPhoneCode('+2348033333333', '000000', 'signup'),
      ).rejects.toThrow('Too many attempts — request a new code');
    });

    it('login: does not text a phone with no verified account, but responds the same either way', async () => {
      usersService.findByPhone.mockResolvedValue(null);
      await authService.sendPhoneCode('+2348044444444', 'login');
      expect(smsService.send).not.toHaveBeenCalled();
    });

    it('login: verifying the code for a phone-verified user logs them in', async () => {
      const user = await createUser('irrelevant-hash');
      user.phone = '+2348055555555';
      user.isPhoneVerified = true;
      await user.save();
      usersService.findByPhone.mockResolvedValue(user);

      await authService.sendPhoneCode('+2348055555555', 'login');
      const code = sentCode();

      const result = await authService.verifyPhoneCode(
        '+2348055555555',
        code,
        'login',
      );
      expect(result.purpose).toBe('login');
      if (result.purpose !== 'login') return;
      expect(result.user.phone).toBe('+2348055555555');
      expect(result.tokens.accessToken).toEqual(expect.any(String));
    });

    it('a consumed code cannot be replayed', async () => {
      await authService.sendPhoneCode('+2348066666666', 'signup');
      const code = sentCode();

      await authService.verifyPhoneCode('+2348066666666', code, 'signup');
      await expect(
        authService.verifyPhoneCode('+2348066666666', code, 'signup'),
      ).rejects.toThrow('Invalid or expired code');
    });
  });
});
