import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class ModifierOption {
  @Prop({ type: String, required: true, trim: true })
  name: string;

  /** Added to the item's price when this option is selected — can be 0, negative not allowed. */
  @Prop({ type: Number, required: true, min: 0 })
  priceDelta: number;
}

export const ModifierOptionSchema =
  SchemaFactory.createForClass(ModifierOption);
