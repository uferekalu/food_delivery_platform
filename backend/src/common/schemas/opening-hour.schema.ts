import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// Shared embedded value object — used by Restaurant and Store (FDP-84: stores need the same
// day-by-day schedule restaurants always had; Phase 1 of the marketplace, docs/ROADMAP.md
// FDP-56, deliberately left it off Store and that turned out to be a real gap, not a
// deliberate simplification worth keeping). Moved here from restaurants/schemas/ the same way
// Address moved to common/ in FDP-11 once a second domain needed the identical shape.
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
