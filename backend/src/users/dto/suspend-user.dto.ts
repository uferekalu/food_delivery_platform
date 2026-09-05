import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SuspendUserDto {
  @ApiProperty({
    description: 'Shown to the user, and kept for the admin audit trail',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
