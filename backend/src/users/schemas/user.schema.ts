import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SavedAddress, SavedAddressSchema } from './saved-address.schema';

export const USER_ROLES = [
  'customer',
  'restaurant_owner',
  'rider',
  'admin',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Roles a person can pick for themselves at registration — like choosing "customer" vs.
 * "sell on our platform" at signup on any real marketplace. Deliberately excludes:
 * - `admin`: a real privilege-escalation risk, must be seeded/promoted manually
 * - `rider`: goes through its own application/verification flow (`POST /riders/apply` +
 *   admin verify, `docs/ROADMAP.md` FDP-16), not open signup
 */
export const SELF_REGISTERABLE_ROLES = [
  'customer',
  'restaurant_owner',
] as const;
export type SelfRegisterableRole = (typeof SELF_REGISTERABLE_ROLES)[number];

@Schema({ timestamps: true })
export class User {
  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, required: true, enum: USER_ROLES, default: 'customer' })
  role: UserRole;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ type: String, default: null })
  avatarUrl: string | null;

  // E.164-ish (optional leading `+`, digits only) — the only channel SMS notifications
  // (docs/ROADMAP.md FDP-19) can actually reach; null until the user supplies one, since
  // registration never required a phone number. `sparse` (not a plain `unique`) so any number
  // of users can each have `phone: null` without colliding on the unique index — only actual
  // phone values need to be distinct.
  @Prop({ type: String, default: null, trim: true, unique: true, sparse: true })
  phone: string | null;

  // Proven by completing the OTP-over-SMS flow (docs/ROADMAP.md FDP-41), independently of
  // isEmailVerified — a user can have one, both, or neither verified.
  @Prop({ default: false })
  isPhoneVerified: boolean;

  @Prop({ type: [SavedAddressSchema], default: [] })
  savedAddresses: SavedAddress[];

  @Prop({ type: [Types.ObjectId], ref: 'Restaurant', default: [] })
  favoriteRestaurantIds: Types.ObjectId[];
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
