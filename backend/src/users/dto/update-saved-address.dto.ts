import { PartialType } from '@nestjs/swagger';
import { CreateSavedAddressDto } from './create-saved-address.dto';

export class UpdateSavedAddressDto extends PartialType(CreateSavedAddressDto) {}
