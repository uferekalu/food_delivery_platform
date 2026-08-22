import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CartItem, CartItemSchema } from './cart-item.schema';

// Created lazily on the first `addItem` call — no document means an empty cart, rather than
// modeling "empty" as a real document with an empty items array and no restaurant to anchor
// it to. Deleted again once the last item is removed, for the same reason.
@Schema({ timestamps: true })
export class Cart {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  userId: Types.ObjectId;

  // One active restaurant per cart (docs/PRODUCT_GUIDE.md §4) — enforced in CartService, not
  // here; adding an item from a different restaurant requires an explicit `replace: true`.
  @Prop({
    type: Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true,
  })
  restaurantId: Types.ObjectId;

  @Prop({ type: [CartItemSchema], default: [] })
  items: CartItem[];
}

export type CartDocument = HydratedDocument<Cart>;
export const CartSchema = SchemaFactory.createForClass(Cart);
