import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const PHONE_OTP_PURPOSES = ['signup', 'login'] as const;
export type PhoneOtpPurpose = (typeof PHONE_OTP_PURPOSES)[number];

/**
 * One document per outstanding OTP request. `codeHash` follows the same sha256 pattern as
 * RefreshToken's `tokenHash` (not bcrypt) — a 6-digit code is already protected by `expiresAt`
 * (5 min) and `attempts` (capped at 5), so a slow hash buys nothing extra here and would only
 * slow down every send/verify call.
 */
@Schema({ timestamps: true })
export class PhoneOtp {
  @Prop({ required: true, trim: true, index: true })
  phone: string;

  @Prop({ required: true })
  codeHash: string;

  @Prop({ type: String, required: true, enum: PHONE_OTP_PURPOSES })
  purpose: PhoneOtpPurpose;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ type: Date, default: null })
  consumedAt: Date | null;
}

export type PhoneOtpDocument = HydratedDocument<PhoneOtp>;
export const PhoneOtpSchema = SchemaFactory.createForClass(PhoneOtp);
