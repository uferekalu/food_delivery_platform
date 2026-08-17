import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * One document per issued refresh token (not per user) — supports multiple concurrent
 * sessions/devices, and rotation-with-reuse-detection: a stolen-and-replayed token can be
 * detected because it's already marked `revokedAt` by the time it's reused, which lets us
 * revoke the whole family instead of just the one token.
 */
@Schema({ timestamps: true })
export class RefreshToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  tokenHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  revokedAt: Date | null;

  /** Set when this token is rotated — lets a replay of this (now-revoked) token be traced. */
  @Prop({ type: String, default: null })
  replacedByTokenHash: string | null;
}

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;
export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);
