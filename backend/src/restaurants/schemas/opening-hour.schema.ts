import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class OpeningHour {
  /** 0 = Sunday … 6 = Saturday */
  @Prop({ type: Number, required: true, min: 0, max: 6 })
  dayOfWeek: number;

  /** "HH:mm" 24-hour, e.g. "09:00" */
  @Prop({ type: String, required: true })
  openTime: string;

  @Prop({ type: String, required: true })
  closeTime: string;

  @Prop({ type: Boolean, default: false })
  isClosed: boolean;
}

export const OpeningHourSchema = SchemaFactory.createForClass(OpeningHour);
