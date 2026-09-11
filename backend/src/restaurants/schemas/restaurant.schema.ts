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
import {
  BusinessVerificationResult,
  BusinessVerificationResultSchema,
} from '../../common/schemas/business-verification-result.schema';

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

  // Restaurant onboarding compliance (docs/ROADMAP.md FDP-60) — business registration proof
  // (e.g. a Nigerian CAC certificate, or the equivalent for another country), required at
  // creation for every *new* restaurant and re-checked at approval time regardless of when the
  // restaurant was created (see RestaurantsService.approve). Nullable at the schema level only
  // because restaurants created before this field existed predate the requirement — never
  // nullable on a newly-created one, CreateRestaurantDto requires it.
  @Prop({ type: String, default: null })
  complianceDocumentUrl: string | null;

  // Automated business verification (docs/ROADMAP.md FDP-115) — the RC/BN/IT/LP/LLP number (or
  // equivalent for another country) the owner entered, required by CreateRestaurantDto for every
  // *new* restaurant, nullable at the schema level for the same legacy-record reason as
  // complianceDocumentUrl above. `businessVerification` holds the result of the automated check
  // against it — see BusinessVerificationResult's own doc comment for how the two interact.
  @Prop({ type: String, default: null, trim: true })
  businessRegistrationNumber: string | null;

  @Prop({ type: BusinessVerificationResultSchema, default: () => ({}) })
  businessVerification: BusinessVerificationResult;

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

  // Sponsored listings (docs/ROADMAP.md FDP-124) — denormalized from AdCampaign so the hot
  // discovery-listing path (findAllApproved) stays a plain indexed .find(), never a live
  // cross-collection join. Never written to directly outside AdCampaignsService's payment-success
  // handler and its daily lifecycle sweep — see RestaurantsService.setSponsorship. `isSponsored`
  // is the field actually sorted/filtered on (an explicit boolean, not inferred from
  // sponsoredUntil's nullability — a nullable Date sorts non-null-before-null in MongoDB
  // regardless of whether that date is in the future, which would keep an expired-but-not-yet-
  // swept campaign floating to the top for up to a day); `sponsoredUntil` is kept alongside it
  // purely for display ("Sponsored until Oct 3") and as the sweep's own end-date query trigger.
  @Prop({ type: Date, default: null })
  sponsoredUntil: Date | null;

  @Prop({ type: Boolean, default: false, index: true })
  isSponsored: boolean;
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
// Sponsored listings (docs/ROADMAP.md FDP-124) — isSponsored now leads findAllApproved's sort,
// so it leads this compound index too, same "sort/filter field leads the index" convention as
// every index above.
RestaurantSchema.index({ isApproved: 1, isSponsored: -1, createdAt: -1 });
// "Near me" (docs/ROADMAP.md FDP-96) — powers `$geoNear` in `RestaurantsService.findNearby`.
// Standalone (not compounded with `isApproved`) since 2dsphere indexes have their own compounding
// rules and `$geoNear`'s own `query` option already applies the `isApproved` filter without
// needing it baked into this index. A restaurant with no `address.location` set (owner never
// entered coordinates) is automatically excluded from geo queries, not an indexing error.
RestaurantSchema.index({ 'address.location': '2dsphere' });
