import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class SelectedModifier {
  @Prop({ type: String, required: true, trim: true })
  groupName: string;

  @Prop({ type: String, required: true, trim: true })
  optionName: string;

  // Resolved server-side from the MenuItem's modifierGroups at add-to-cart time — never trusted
  // from the client — so the cart's displayed price stays stable even if the owner edits prices
  // afterward. The order-creation endpoint (FDP-11) re-validates against current menu data
  // before charging.
  @Prop({ type: Number, required: true, min: 0 })
  priceDelta: number;
}

export const SelectedModifierSchema =
  SchemaFactory.createForClass(SelectedModifier);
