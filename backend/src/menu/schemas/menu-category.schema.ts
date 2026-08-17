import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true })
export class MenuCategory {
  @Prop({
    type: Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true,
  })
  restaurantId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: Number, default: 0 })
  sortOrder: number;
}

export type MenuCategoryDocument = HydratedDocument<MenuCategory>;
export const MenuCategorySchema = SchemaFactory.createForClass(MenuCategory);
