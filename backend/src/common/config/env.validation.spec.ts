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
  };

  it('accepts a fully specified valid environment', () => {
    const { error } = envValidationSchema.validate(validEnv);
    expect(error).toBeUndefined();
  });

  it('defaults NODE_ENV to development and PORT to 4000', () => {
    const { error, value } = envValidationSchema.validate({
      MONGODB_URI: validEnv.MONGODB_URI,
      CORS_ORIGINS: validEnv.CORS_ORIGINS,
    }) as { error: unknown; value: ValidatedEnv };
    expect(error).toBeUndefined();
    expect(value.NODE_ENV).toBe('development');
    expect(value.PORT).toBe(4000);
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
});
