import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ORDER_STATUSES } from './order-status';
import type { OrderStatus } from './order-status';

@Schema({ _id: false })
export class StatusHistoryEntry {
  @Prop({ type: String, enum: ORDER_STATUSES, required: true })
  status: OrderStatus;

  @Prop({ type: Date, required: true, default: Date.now })
  at: Date;

  // userId of whoever caused the transition, or 'system' for an automated one (e.g. a webhook).
  @Prop({ type: String, required: true })
  by: string;
}

export const StatusHistoryEntrySchema =
  SchemaFactory.createForClass(StatusHistoryEntry);
