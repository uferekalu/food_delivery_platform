import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(4000),
  MONGODB_URI: Joi.string().uri().required(),
  CORS_ORIGINS: Joi.string().required(),
  FRONTEND_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),
  JWT_EMAIL_SECRET: Joi.string().min(32).required(),

  RESEND_API_KEY: Joi.string().required(),
  MAIL_FROM: Joi.string().required(),

  CLOUDINARY_CLOUD_NAME: Joi.string().required(),
  CLOUDINARY_API_KEY: Joi.string().required(),
  CLOUDINARY_API_SECRET: Joi.string().required(),

  STRIPE_SECRET_KEY: Joi.string().required(),
  STRIPE_WEBHOOK_SECRET: Joi.string().required(),
  PAYSTACK_SECRET_KEY: Joi.string().required(),
  FLUTTERWAVE_SECRET_KEY: Joi.string().required(),
  FLUTTERWAVE_WEBHOOK_HASH: Joi.string().required(),

  // Termii (SMS notifications, docs/ROADMAP.md FDP-19) — deliberately optional. No real Termii
  // account exists for this project yet; SmsService degrades to a no-op log when these are
  // unset, the same graceful-degradation pattern as NEXT_PUBLIC_MAPBOX_TOKEN (FDP-17).
  TERMII_API_KEY: Joi.string().optional(),
  TERMII_BASE_URL: Joi.string().uri().optional(),
  TERMII_SENDER_ID: Joi.string().optional(),
  TERMII_CHANNEL: Joi.string().optional(),

  // Sentry (docs/ROADMAP.md FDP-22) — optional, same graceful-degradation pattern as Termii
  // above: no error tracking happens until a real DSN is set in Render's env vars.
  SENTRY_DSN: Joi.string().uri().optional(),

  // Google OAuth (docs/ROADMAP.md FDP-42) — optional, same graceful-degradation pattern as
  // Termii above. GoogleStrategy falls back to harmless placeholder values when unset so app
  // boot never fails over a missing OAuth client; hitting /auth/google without real credentials
  // just fails at Google's end instead (an invalid client_id error page), not a server crash.
  GOOGLE_CLIENT_ID: Joi.string().optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().optional(),
  GOOGLE_CALLBACK_URL: Joi.string().uri().optional(),

  // Facebook Login — same optional, graceful-degradation pattern as Google above.
  FACEBOOK_APP_ID: Joi.string().optional(),
  FACEBOOK_APP_SECRET: Joi.string().optional(),
  FACEBOOK_CALLBACK_URL: Joi.string().uri().optional(),
});
