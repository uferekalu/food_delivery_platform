import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const VEHICLE_TYPES = ['bicycle', 'motorcycle', 'car', 'van'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

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
}

export type RiderDocument = HydratedDocument<Rider>;
export const RiderSchema = SchemaFactory.createForClass(Rider);
