import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ModifierOption, ModifierOptionSchema } from './modifier-option.schema';

@Schema({ _id: false })
export class ModifierGroup {
  @Prop({ type: String, required: true, trim: true })
  name: string;

  /** Minimum number of options the customer must pick from this group (0 = optional). */
  @Prop({ type: Number, required: true, min: 0 })
  min: number;

  /** Maximum number of options the customer may pick from this group. */
  @Prop({ type: Number, required: true, min: 1 })
  max: number;

  @Prop({ type: [ModifierOptionSchema], default: [] })
  options: ModifierOption[];
}

export const ModifierGroupSchema = SchemaFactory.createForClass(ModifierGroup);
