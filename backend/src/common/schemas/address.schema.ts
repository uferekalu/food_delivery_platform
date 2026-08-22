import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

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
}

export const AddressSchema = SchemaFactory.createForClass(Address);
