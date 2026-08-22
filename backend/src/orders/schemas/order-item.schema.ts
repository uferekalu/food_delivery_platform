import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import {
  SelectedModifier,
  SelectedModifierSchema,
} from '../../cart/schemas/selected-modifier.schema';

// Snapshot of a cart item at order-creation time — cart items reference live menu data (and
// disappear once the order is placed, since the cart is cleared), so the order needs its own
// permanent copy of what the customer actually paid for.
@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'MenuItem', required: true })
  menuItemId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: Number, required: true, min: 0 })
  price: number;

  @Prop({ type: Number, required: true, min: 1 })
  qty: number;

  @Prop({ type: [SelectedModifierSchema], default: [] })
  selectedModifiers: SelectedModifier[];

  @Prop({ type: String, default: '', trim: true })
  notes: string;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);
