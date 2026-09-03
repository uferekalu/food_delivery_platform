import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Product {
  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId: Types.ObjectId;

  // Always a leaf category (a category with children is a browsing node, not something a
  // product is filed directly under) — enforced in ProductsService, not here.
  @Prop({
    type: Types.ObjectId,
    ref: 'ProductCategory',
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

  // Set only while a promo is active on this item — powers the "-20%" badge + struck-through
  // original price seen on real Glovo store pages. Always < price when set; validated in the DTO.
  @Prop({ type: Number, min: 0, default: null })
  discountedPrice: number | null;

  // Owner-only cost-to-stock, same COGS reasoning as MenuItem.costPrice (docs/ROADMAP.md FDP-64)
  // — nullable because most items won't have one set immediately.
  @Prop({ type: Number, min: 0, default: null })
  costPrice: number | null;

  @Prop({ type: String, default: null })
  imageUrl: string | null;

  // Free-form size/count, e.g. "550ml", "x12" — real Glovo product names already fold this in
  // (e.g. "Bbv Eggs X12"), but keeping it as its own field lets the frontend render it
  // consistently instead of depending on sellers typing it into the name every time.
  @Prop({ type: String, default: null, trim: true })
  unit: string | null;

  // null = not inventory-tracked (always orderable while isAvailable is true, same as a
  // restaurant MenuItem). A number is a real, decremented stock count — groceries/pharmacy items
  // are far more oversell-sensitive than a restaurant dish, which is cooked to order.
  @Prop({ type: Number, min: 0, default: null })
  stockQuantity: number | null;

  @Prop({ type: Boolean, default: true })
  isAvailable: boolean;

  @Prop({ type: Number, default: 0 })
  sortOrder: number;
}

export type ProductDocument = HydratedDocument<Product>;
export const ProductSchema = SchemaFactory.createForClass(Product);
