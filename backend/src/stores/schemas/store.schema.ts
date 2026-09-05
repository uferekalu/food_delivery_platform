import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Address, AddressSchema } from '../../common/schemas/address.schema';
import {
  OpeningHour,
  OpeningHourSchema,
} from '../../common/schemas/opening-hour.schema';
import {
  PayoutAccount,
  PayoutAccountSchema,
} from '../../common/schemas/payout-account.schema';

// Glovo's own vertical split (docs/ROADMAP.md FDP-56) — a store belongs to exactly one, and a
// category-listing page only ever shows stores of that one type (confirmed against the real
// Glovo groceries/pharmacy-beauty category pages before designing this schema).
export const STORE_TYPES = ['groceries', 'pharmacy_beauty'] as const;
export type StoreType = (typeof STORE_TYPES)[number];

@Schema({ timestamps: true })
export class Store {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  slug: string;

  @Prop({ type: String, enum: STORE_TYPES, required: true, index: true })
  type: StoreType;

  // Sub-category filter chips shown on the category-listing page (e.g. "Supermarket"/"Bakery"
  // under groceries, "Parapharmacy" under pharmacy & beauty) — free-form like
  // Restaurant.cuisineTypes rather than a fixed enum, since Glovo's own sub-category set varies
  // by market and isn't something this platform needs to hardcode.
  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: String, default: '', trim: true })
  description: string;

  @Prop({ type: String, default: null })
  logoUrl: string | null;

  @Prop({ type: String, default: null })
  coverUrl: string | null;

  // Same onboarding compliance gate as Restaurant (docs/ROADMAP.md FDP-60) — a pharmacy's
  // "business registration proof" is realistically a pharmacy operating license rather than a
  // generic CAC certificate, but the schema/flow is identical, so it reuses the same field/gate
  // rather than inventing a parallel one.
  @Prop({ type: String, default: null })
  complianceDocumentUrl: string | null;

  /** ISO 4217 — source of truth for this store's order currency, see docs/ARCHITECTURE.md §4. */
  @Prop({ type: String, required: true, uppercase: true })
  currency: string;

  @Prop({ type: String, required: true })
  country: string;

  @Prop({ type: AddressSchema, required: true })
  address: Address;

  @Prop({ type: [OpeningHourSchema], default: [] })
  openingHours: OpeningHour[];

  /** Manual "busy/closed" toggle by the owner — same as Restaurant.isOpen. */
  @Prop({ type: Boolean, default: true })
  isOpen: boolean;

  /** Gate set by an admin — unapproved stores don't appear in public listings. */
  @Prop({ type: Boolean, default: false })
  isApproved: boolean;

  // Vendor payouts epic, extended to stores in FDP-91 — see PayoutAccount's doc comment.
  @Prop({ type: [PayoutAccountSchema], default: [] })
  payoutAccounts: PayoutAccount[];

  @Prop({ type: Number, default: 0 })
  avgRating: number;

  @Prop({ type: Number, default: 0 })
  reviewCount: number;

  // A static owner-set estimate, same reasoning as Restaurant.estimatedDeliveryMinutes.
  @Prop({ type: Number, default: null, min: 0 })
  estimatedDeliveryMinutes: number | null;
}

export type StoreDocument = HydratedDocument<Store>;
export const StoreSchema = SchemaFactory.createForClass(Store);
// Every public query filters on isApproved (and usually type) first — same compound-index
// reasoning as RestaurantSchema.
StoreSchema.index({ isApproved: 1, type: 1, avgRating: -1 });
StoreSchema.index({ isApproved: 1, type: 1, createdAt: -1 });
// "Near me" (docs/ROADMAP.md FDP-96) — same reasoning as RestaurantSchema's equivalent index.
StoreSchema.index({ 'address.location': '2dsphere' });
