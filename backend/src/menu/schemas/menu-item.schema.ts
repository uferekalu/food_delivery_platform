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

  // Set only while a promo is active on this item — powers the "-X%" badge + struck-through
  // original price (docs/ROADMAP.md FDP-111), mirroring Product.discountedPrice (stores) exactly.
  // Always < price when set; validated in MenuService, not here (Mongoose validators don't see
  // sibling fields easily).
  @Prop({ type: Number, min: 0, default: null })
  discountedPrice: number | null;

  // Owner-only cost-to-make (ingredients etc.), never shown to customers — feeds the sales
  // report's cost-of-goods-sold/margin figures (docs/ROADMAP.md FDP-64). Nullable rather than
  // required: existing items predate this field, and a newly-created item may not have one set
  // immediately either — the sales report treats a null costPrice as "unknown", not zero, and
  // flags it rather than silently understating COGS.
  @Prop({ type: Number, min: 0, default: null })
  costPrice: number | null;

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
