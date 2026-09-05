import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

// A restaurant's zones are evaluated ordered by maxDistanceKm ascending (see
// DeliveryZonesService.calculateFee) — the first zone whose radius covers the computed
// distance wins, so zones should be set up as concentric rings (e.g. 0-3km, 0-8km, 0-15km),
// not disjoint ranges.
// Exactly one of restaurantId/storeId is ever set — a zone belongs to one seller
// (docs/ROADMAP.md FDP-90), enforced in DeliveryZonesService.create, not here.
@Schema({ timestamps: true })
export class DeliveryZone {
  @Prop({
    type: Types.ObjectId,
    ref: 'Restaurant',
    default: null,
    index: true,
  })
  restaurantId: Types.ObjectId | null;

  @Prop({
    type: Types.ObjectId,
    ref: 'Store',
    default: null,
    index: true,
  })
  storeId: Types.ObjectId | null;

  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ type: Number, required: true, min: 0 })
  maxDistanceKm: number;

  @Prop({ type: Number, required: true, min: 0 })
  baseFee: number;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  perKmFee: number;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export type DeliveryZoneDocument = HydratedDocument<DeliveryZone>;
export const DeliveryZoneSchema = SchemaFactory.createForClass(DeliveryZone);
