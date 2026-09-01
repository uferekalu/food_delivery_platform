import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Address, AddressSchema } from '../../common/schemas/address.schema';
import { OpeningHour, OpeningHourSchema } from './opening-hour.schema';
import { PayoutAccount, PayoutAccountSchema } from './payout-account.schema';

@Schema({ timestamps: true })
export class Restaurant {
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

  @Prop({ type: String, default: '', trim: true })
  description: string;

  @Prop({ type: String, default: null })
  logoUrl: string | null;

  @Prop({ type: String, default: null })
  coverUrl: string | null;

  @Prop({ type: [String], default: [] })
  cuisineTypes: string[];

  /** ISO 4217 — source of truth for this restaurant's order currency, see docs/ARCHITECTURE.md §4. */
  @Prop({ type: String, required: true, uppercase: true })
  currency: string;

  @Prop({ type: String, required: true })
  country: string;

  @Prop({ type: AddressSchema, required: true })
  address: Address;

  @Prop({ type: [OpeningHourSchema], default: [] })
  openingHours: OpeningHour[];

  /** Manual "busy/closed" toggle by the owner — independent of openingHours. */
  @Prop({ type: Boolean, default: true })
  isOpen: boolean;

  /** Gate set by an admin — unapproved restaurants don't appear in public listings. */
  @Prop({ type: Boolean, default: false })
  isApproved: boolean;

  @Prop({ type: Number, default: 0 })
  avgRating: number;

  @Prop({ type: Number, default: 0 })
  reviewCount: number;

  // 1-4 ($ .. $$$$), owner-set at creation — the simplest useful "how expensive is this place"
  // signal without aggregating live menu item prices (docs/ROADMAP.md FDP-21's discovery filters).
  @Prop({ type: Number, default: 2, min: 1, max: 4 })
  priceLevel: number;

  // A static owner-set estimate, not a computed live ETA (that would need real routing/traffic
  // data, out of scope) — still useful for the "under 30 min" style filter FDP-21 calls for.
  @Prop({ type: Number, default: null, min: 0 })
  estimatedDeliveryMinutes: number | null;

  // Vendor payouts epic, part 1 of 4 (docs/ROADMAP.md FDP-51) — see PayoutAccount's doc comment.
  @Prop({ type: [PayoutAccountSchema], default: [] })
  payoutAccounts: PayoutAccount[];
}

export type RestaurantDocument = HydratedDocument<Restaurant>;
export const RestaurantSchema = SchemaFactory.createForClass(Restaurant);
// No text index — RestaurantsService.findAllApproved does a case-insensitive $regex substring
// match instead of $text (word-tokenized $text search couldn't match a partial word like "fd"
// against "FDP15 Test Kitchen"), so a text index here would just be unused write overhead.
// Compound indexes below cover the common filter+sort combinations the discovery page uses
// (docs/ROADMAP.md FDP-21) — every public query filters on `isApproved` first, so it leads
// every compound index here.
RestaurantSchema.index({ isApproved: 1, avgRating: -1 });
RestaurantSchema.index({ isApproved: 1, priceLevel: 1 });
RestaurantSchema.index({ isApproved: 1, estimatedDeliveryMinutes: 1 });
RestaurantSchema.index({ isApproved: 1, createdAt: -1 });
