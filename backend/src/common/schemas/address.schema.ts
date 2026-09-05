import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { GeoPoint, GeoPointSchema } from './geo-point.schema';

// Shared embedded value object — used by Restaurant (its storefront address) and Order (the
// delivery address captured at checkout). Moved here from restaurants/schemas/ in FDP-11 once
// Order needed the same shape; common/ is for cross-cutting infra shared by domain modules, not
// domain logic itself (see backend/CLAUDE.md), and a generic postal address qualifies.
@Schema({ _id: false })
export class Address {
  @Prop({ type: String, required: true, trim: true })
  line1: string;

  @Prop({ type: String, trim: true })
  line2?: string;

  @Prop({ type: String, required: true, trim: true })
  city: string;

  @Prop({ type: String, required: true, trim: true })
  state: string;

  @Prop({ type: String, trim: true })
  postalCode?: string;

  @Prop({ type: Number })
  lat?: number;

  @Prop({ type: Number })
  lng?: number;

  // "Restaurants/stores near me" (docs/ROADMAP.md FDP-96) — derived from lat/lng via
  // `common/utils/geo.ts`'s `toGeoPoint`, never set directly by a caller. `null` (not just
  // absent) when lat/lng aren't both set, so a `2dsphere` index on this field can still exist on
  // every restaurant/store even though not all of them have coordinates yet. Only meaningful on
  // Restaurant/Store's own storefront address, not Order's delivery address — but lives here
  // since both share the same embedded `Address` shape and there's no reason to fork it.
  @Prop({ type: GeoPointSchema, default: null })
  location?: GeoPoint | null;
}

export const AddressSchema = SchemaFactory.createForClass(Address);
