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

  // Which seller kind this cart belongs to (docs/ROADMAP.md FDP-56) — mirrors Order.sellerType,
  // same default-'restaurant' backward-compatibility reasoning.
  @Prop({
    type: String,
    enum: ['restaurant', 'store'],
    required: true,
    default: 'restaurant',
  })
  sellerType: 'restaurant' | 'store';

  // One active seller per cart (docs/PRODUCT_GUIDE.md §4) — enforced in CartService, not here;
  // adding an item from a different restaurant/store (or switching seller type) requires an
  // explicit `replace: true`. No longer `required` — a store cart has this null instead. See
  // Order.restaurantId's comment for why the field name itself wasn't generalized.
  @Prop({ type: Types.ObjectId, ref: 'Restaurant', default: null, index: true })
  restaurantId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Store', default: null, index: true })
  storeId: Types.ObjectId | null;

  @Prop({ type: [CartItemSchema], default: [] })
  items: CartItem[];
}

export type CartDocument = HydratedDocument<Cart>;
export const CartSchema = SchemaFactory.createForClass(Cart);
