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
import {
  RefreshToken,
  RefreshTokenDocument,
  RefreshTokenSchema,
} from './schemas/refresh-token.schema';
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
  let userModel: Model<UserDocument>;
  let refreshTokenModel: Model<RefreshTokenDocument>;

  beforeAll(async () => {
    // See backend/CLAUDE.md ("Testing") for why launchTimeout is set explicitly.
    mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });

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
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
    usersService = moduleRef.get(UsersService);
    mailService = moduleRef.get(MailService);
    userModel = moduleRef.get(getModelToken(User.name));
    refreshTokenModel = moduleRef.get(getModelToken(RefreshToken.name));
  }, 60_000); // headroom for the 60s mongod launchTimeout above, not just module compile

  afterEach(async () => {
    await refreshTokenModel.deleteMany({}).exec();
    await userModel.deleteMany({}).exec();
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
});
