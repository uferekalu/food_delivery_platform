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
});
