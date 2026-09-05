import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  PayoutAccount,
  PayoutAccountSchema,
} from '../../common/schemas/payout-account.schema';

export const VEHICLE_TYPES = ['bicycle', 'motorcycle', 'car', 'van'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const GOVERNMENT_ID_TYPES = [
  'national_id',
  'passport',
  'voters_card',
  'drivers_license',
] as const;
export type GovernmentIdType = (typeof GOVERNMENT_ID_TYPES)[number];

// The surety a rider names to vouch for them — standard for dispatch-rider onboarding at
// real logistics/delivery companies, and explicitly requested (docs/ROADMAP.md FDP-61).
// Deliberately a plain subdocument (no separate collection) — it's never queried on its own,
// only ever read alongside the rider that owns it.
@Schema({ _id: false })
export class Guarantor {
  @Prop({ type: String, required: true, trim: true })
  fullName: string;

  @Prop({ type: String, required: true, trim: true })
  phone: string;

  @Prop({ type: String, required: true, trim: true })
  relationship: string;

  @Prop({ type: String, required: true, trim: true })
  address: string;
}
export const GuarantorSchema = SchemaFactory.createForClass(Guarantor);

@Schema({ timestamps: true })
export class Rider {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: VEHICLE_TYPES, required: true })
  vehicleType: VehicleType;

  @Prop({ type: Boolean, default: false })
  isOnline: boolean;

  /** Gate set by an admin — mirrors Restaurant.isApproved. Unverified riders can see the
   * unassigned queue but can't self-assign to an order yet (see RidersController's `/assign`
   * pattern in `docs/ENGINEERING_RULES.md`-style ownership checks, done in the service layer). */
  @Prop({ type: Boolean, default: false })
  isVerified: boolean;

  @Prop({ type: Number, default: 0, min: 0, max: 5 })
  rating: number;

  @Prop({ type: Number, default: 0, min: 0 })
  reviewCount: number;

  // --- KYC fields (docs/ROADMAP.md FDP-61) — all collected up front at apply() time via
  // ApplyRiderDto, so a Rider document can never exist without them (unlike a Restaurant, which
  // can be created before its menu). RidersService.verify() still re-checks completeness
  // defensively, the same "unconditionally regardless of caller" posture as
  // RestaurantsService.approve() for FDP-60, in case of legacy data predating this schema.

  @Prop({ type: Date, required: true })
  dateOfBirth: Date;

  @Prop({ type: String, enum: GOVERNMENT_ID_TYPES, required: true })
  governmentIdType: GovernmentIdType;

  @Prop({ type: String, required: true, trim: true })
  governmentIdNumber: string;

  @Prop({ type: String, required: true })
  governmentIdDocumentUrl: string;

  @Prop({ type: String, required: true })
  proofOfAddressDocumentUrl: string;

  // Only required for a motorized vehicle type — enforced in ApplyRiderDto/RidersService, not
  // at the schema level, since a bicycle rider genuinely has none of these.
  @Prop({ type: String, trim: true, default: null })
  driversLicenseNumber: string | null;

  @Prop({ type: Date, default: null })
  driversLicenseExpiry: Date | null;

  @Prop({ type: String, default: null })
  driversLicenseDocumentUrl: string | null;

  @Prop({ type: String, trim: true, default: null })
  vehiclePlateNumber: string | null;

  @Prop({ type: String, default: null })
  vehicleRegistrationDocumentUrl: string | null;

  @Prop({ type: GuarantorSchema, required: true })
  guarantor: Guarantor;

  @Prop({ type: String, required: true, trim: true })
  nextOfKinName: string;

  @Prop({ type: String, required: true, trim: true })
  nextOfKinPhone: string;

  @Prop({ type: String, required: true, trim: true })
  nextOfKinRelationship: string;

  // Vendor payouts epic, extended to riders in FDP-91 — see PayoutAccount's doc comment. A
  // rider owns their own payout account directly (no separate ownerId the way a restaurant/
  // store has — `assertOwnerOrAdmin`-equivalent checks compare against `rider.userId` instead).
  @Prop({ type: [PayoutAccountSchema], default: [] })
  payoutAccounts: PayoutAccount[];
}

export type RiderDocument = HydratedDocument<Rider>;
export const RiderSchema = SchemaFactory.createForClass(Rider);
