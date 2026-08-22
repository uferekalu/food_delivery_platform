import { envValidationSchema } from './env.validation';

interface ValidatedEnv {
  NODE_ENV: string;
  PORT: number;
  MONGODB_URI: string;
  CORS_ORIGINS: string;
}

describe('envValidationSchema', () => {
  const validEnv = {
    NODE_ENV: 'development',
    PORT: 4000,
    MONGODB_URI: 'mongodb://localhost:27017/test',
    CORS_ORIGINS: 'http://localhost:3000',
    FRONTEND_URL: 'http://localhost:3000',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    JWT_EMAIL_SECRET: 'c'.repeat(32),
    RESEND_API_KEY: 're_test_key',
    MAIL_FROM: 'Food Delivery Platform <noreply@example.com>',
    CLOUDINARY_CLOUD_NAME: 'test-cloud',
    CLOUDINARY_API_KEY: '123456789',
    CLOUDINARY_API_SECRET: 'test-secret',
    STRIPE_SECRET_KEY: 'sk_test_dummy',
    STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
    PAYSTACK_SECRET_KEY: 'sk_test_dummy',
    FLUTTERWAVE_SECRET_KEY: 'FLWSECK_TEST-dummy',
    FLUTTERWAVE_WEBHOOK_HASH: 'dummy-webhook-hash',
  };

  it('accepts a fully specified valid environment', () => {
    const { error } = envValidationSchema.validate(validEnv);
    expect(error).toBeUndefined();
  });

  it('defaults NODE_ENV to development, PORT to 4000, and JWT expiry windows', () => {
    const { MONGODB_URI, CORS_ORIGINS, ...omitted } = validEnv;
    void omitted;
    const { error, value } = envValidationSchema.validate({
      MONGODB_URI,
      CORS_ORIGINS,
      FRONTEND_URL: validEnv.FRONTEND_URL,
      JWT_ACCESS_SECRET: validEnv.JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET: validEnv.JWT_REFRESH_SECRET,
      JWT_EMAIL_SECRET: validEnv.JWT_EMAIL_SECRET,
      RESEND_API_KEY: validEnv.RESEND_API_KEY,
      MAIL_FROM: validEnv.MAIL_FROM,
      CLOUDINARY_CLOUD_NAME: validEnv.CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY: validEnv.CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET: validEnv.CLOUDINARY_API_SECRET,
      STRIPE_SECRET_KEY: validEnv.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: validEnv.STRIPE_WEBHOOK_SECRET,
      PAYSTACK_SECRET_KEY: validEnv.PAYSTACK_SECRET_KEY,
      FLUTTERWAVE_SECRET_KEY: validEnv.FLUTTERWAVE_SECRET_KEY,
      FLUTTERWAVE_WEBHOOK_HASH: validEnv.FLUTTERWAVE_WEBHOOK_HASH,
    }) as {
      error: unknown;
      value: ValidatedEnv & { JWT_ACCESS_EXPIRES_IN: string };
    };
    expect(error).toBeUndefined();
    expect(value.NODE_ENV).toBe('development');
    expect(value.PORT).toBe(4000);
    expect(value.JWT_ACCESS_EXPIRES_IN).toBe('15m');
  });

  it('rejects a missing MONGODB_URI', () => {
    const { MONGODB_URI, ...rest } = validEnv;
    void MONGODB_URI;
    const { error } = envValidationSchema.validate(rest);
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/MONGODB_URI/);
  });

  it('rejects an invalid NODE_ENV value', () => {
    const { error } = envValidationSchema.validate({
      ...validEnv,
      NODE_ENV: 'staging',
    });
    expect(error).toBeDefined();
  });

  it('rejects a JWT secret shorter than 32 characters', () => {
    const { error } = envValidationSchema.validate({
      ...validEnv,
      JWT_ACCESS_SECRET: 'too-short',
    });
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/JWT_ACCESS_SECRET/);
  });
});
