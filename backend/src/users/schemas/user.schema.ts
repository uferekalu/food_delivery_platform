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

export const USER_STATUSES = ['active', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

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
  // (docs/ROADMAP.md FDP-19) can actually reach; absent until the user supplies one, since
  // registration never required a phone number. Deliberately NO `default` here (not even
  // `null`) — a sparse index only excludes a document where the field is genuinely *missing*,
  // not one where it's explicitly set to `null`. An earlier `default: null` meant every
  // phone-less user actually had the field present with value null, so the second such user to
  // register hit a real E11000 duplicate-key error on this "unique" index — reproduces 100% of
  // the time with 2+ phone-less registrations, caught via the riders/reviews/admin e2e specs.
  // toPublicUser() below normalizes the resulting `undefined` back to `null` at the API
  // boundary so PublicUser's `phone: string | null` contract doesn't change.
  @Prop({ type: String, trim: true, unique: true, sparse: true })
  phone?: string | null;

  // Proven by completing the OTP-over-SMS flow (docs/ROADMAP.md FDP-41), independently of
  // isEmailVerified — a user can have one, both, or neither verified.
  @Prop({ default: false })
  isPhoneVerified: boolean;

  @Prop({ type: [SavedAddressSchema], default: [] })
  savedAddresses: SavedAddress[];

  @Prop({ type: [Types.ObjectId], ref: 'Restaurant', default: [] })
  favoriteRestaurantIds: Types.ObjectId[];

  // Admin ban/suspend (docs/ROADMAP.md FDP-89). Suspending immediately revokes every one of this
  // user's refresh tokens (see UsersService.suspend) so silent token refresh stops working right
  // away; a still-valid ~15-min access token keeps working until it naturally expires, since
  // JwtAccessStrategy deliberately doesn't hit the DB on every request (see
  // docs/ARCHITECTURE.md §16) — an accepted small window, not an oversight.
  @Prop({ type: String, enum: USER_STATUSES, required: true, default: 'active' })
  status: UserStatus;

  @Prop({ type: Date, default: null })
  suspendedAt: Date | null;

  @Prop({ type: String, default: null })
  suspendedReason: string | null;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
