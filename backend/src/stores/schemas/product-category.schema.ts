import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

// Unlike the restaurant menu's flat MenuCategory, a store's real Glovo catalog nests 2-3 levels
// deep (e.g. "Health & Medicines" -> "Sexual Wellness" -> "Condoms & Lubricants", "Frozen goods"
// -> "Frozen Fruits & Vegetables" -> "Frozen Potato" — confirmed against the real store pages
// before designing this, docs/ROADMAP.md FDP-56). A single self-referencing parentCategoryId
// supports arbitrary depth without hardcoding a level limit; in practice the UI mostly exercises
// 2 levels.
@Schema({ timestamps: true })
export class ProductCategory {
  @Prop({ type: Types.ObjectId, ref: 'Store', required: true, index: true })
  storeId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  /** null = a top-level category. */
  @Prop({
    type: Types.ObjectId,
    ref: 'ProductCategory',
    default: null,
    index: true,
  })
  parentCategoryId: Types.ObjectId | null;

  @Prop({ type: Number, default: 0 })
  sortOrder: number;
}

export type ProductCategoryDocument = HydratedDocument<ProductCategory>;
export const ProductCategorySchema =
  SchemaFactory.createForClass(ProductCategory);
