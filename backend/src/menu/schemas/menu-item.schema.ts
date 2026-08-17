import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ModifierGroup, ModifierGroupSchema } from './modifier-group.schema';

@Schema({ timestamps: true })
export class MenuItem {
  @Prop({
    type: Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true,
  })
  restaurantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'MenuCategory',
    required: true,
    index: true,
  })
  categoryId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: String, default: '', trim: true })
  description: string;

  @Prop({ type: Number, required: true, min: 0 })
  price: number;

  @Prop({ type: String, default: null })
  imageUrl: string | null;

  @Prop({ type: Boolean, default: true })
  isAvailable: boolean;

  @Prop({ type: Number, default: 0 })
  sortOrder: number;

  @Prop({ type: [ModifierGroupSchema], default: [] })
  modifierGroups: ModifierGroup[];
}

export type MenuItemDocument = HydratedDocument<MenuItem>;
export const MenuItemSchema = SchemaFactory.createForClass(MenuItem);
