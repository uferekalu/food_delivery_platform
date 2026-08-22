import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Address, AddressSchema } from '../../common/schemas/address.schema';
import { OpeningHour, OpeningHourSchema } from './opening-hour.schema';

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
}

export type RestaurantDocument = HydratedDocument<Restaurant>;
export const RestaurantSchema = SchemaFactory.createForClass(Restaurant);
RestaurantSchema.index({
  name: 'text',
  description: 'text',
  cuisineTypes: 'text',
});
