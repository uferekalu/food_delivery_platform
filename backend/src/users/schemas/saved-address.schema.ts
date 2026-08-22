import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { Address, AddressSchema } from '../../common/schemas/address.schema';

// Embedded on User — a customer's reusable delivery addresses ("Home", "Work", ...), separate
// from the one-off Order.deliveryAddress snapshot each checkout writes.
@Schema()
export class SavedAddress {
  // Not `@Prop()`-decorated — see CartItem for why (Mongoose adds `_id` to every subdocument
  // automatically; this only gives UsersService's update/remove-by-id lookups the TS type).
  _id: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 50 })
  label: string;

  @Prop({ type: AddressSchema, required: true })
  address: Address;

  @Prop({ type: Boolean, default: false })
  isDefault: boolean;
}

export const SavedAddressSchema = SchemaFactory.createForClass(SavedAddress);
