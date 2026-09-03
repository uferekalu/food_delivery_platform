import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import {
  SelectedModifier,
  SelectedModifierSchema,
} from '../../cart/schemas/selected-modifier.schema';

// Snapshot of a cart item at order-creation time — cart items reference live menu/product data
// (and disappear once the order is placed, since the cart is cleared), so the order needs its
// own permanent copy of what the customer actually paid for.
@Schema({ _id: false })
export class OrderItem {
  // Exactly one of menuItemId/productId is set, matching the parent Order's sellerType
  // (docs/ROADMAP.md FDP-56) — neither is `required` for that reason.
  @Prop({ type: Types.ObjectId, ref: 'MenuItem', default: null })
  menuItemId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Product', default: null })
  productId: Types.ObjectId | null;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: Number, required: true, min: 0 })
  price: number;

  // Snapshotted from MenuItem.costPrice at order-creation time (docs/ROADMAP.md FDP-64), same
  // "protect against later edits" reasoning as `price` — null means the menu item had no cost
  // price set at the moment this order was placed, not that the cost was zero; the sales report
  // treats these two cases differently rather than conflating them.
  @Prop({ type: Number, min: 0, default: null })
  costPrice: number | null;

  @Prop({ type: String, default: null })
  imageUrl: string | null;

  @Prop({ type: Number, required: true, min: 1 })
  qty: number;

  @Prop({ type: [SelectedModifierSchema], default: [] })
  selectedModifiers: SelectedModifier[];

  @Prop({ type: String, default: '', trim: true })
  notes: string;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);
