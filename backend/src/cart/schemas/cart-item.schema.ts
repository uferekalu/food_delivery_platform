import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import {
  SelectedModifier,
  SelectedModifierSchema,
} from './selected-modifier.schema';

@Schema({ timestamps: true })
export class CartItem {
  // Not `@Prop()`-decorated — Mongoose adds `_id` to every subdocument automatically (the
  // default `_id: true` schema option). Declaring it here (undecorated) only gives the TS type
  // the field CartService's update/remove-by-id lookups need; it doesn't change the schema.
  _id: Types.ObjectId;

  // Exactly one of menuItemId/productId is set, matching the parent Cart's sellerType
  // (docs/ROADMAP.md FDP-56) — neither is `required` for that reason.
  @Prop({ type: Types.ObjectId, ref: 'MenuItem', default: null })
  menuItemId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Product', default: null })
  productId: Types.ObjectId | null;

  // Name/price snapshotted at add-to-cart time (see SelectedModifier) — keeps the cart's
  // subtotal stable while shopping even if the owner edits the item afterward.
  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: Number, required: true, min: 0 })
  price: number;

  @Prop({ type: String, default: null })
  imageUrl: string | null;

  @Prop({ type: Number, required: true, min: 1, max: 20 })
  qty: number;

  @Prop({ type: [SelectedModifierSchema], default: [] })
  selectedModifiers: SelectedModifier[];

  @Prop({ type: String, default: '', trim: true, maxlength: 500 })
  notes: string;
}

export const CartItemSchema = SchemaFactory.createForClass(CartItem);
