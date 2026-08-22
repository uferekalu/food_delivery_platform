import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

// Client sends only which option was picked — priceDelta is always resolved server-side against
// the MenuItem's current modifierGroups, never trusted from the request.
export class SelectedModifierInputDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  groupName: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  optionName: string;
}
