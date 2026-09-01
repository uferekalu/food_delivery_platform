import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class GuarantorDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @ApiProperty()
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  phone: string;

  @ApiProperty({ example: 'Sister, employer, landlord, etc.' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  relationship: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  address: string;
}
