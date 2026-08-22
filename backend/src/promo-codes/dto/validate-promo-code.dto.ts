import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNumber, IsString, Min, MinLength } from 'class-validator';

export class ValidatePromoCodeDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  code: string;

  @ApiProperty()
  @IsMongoId()
  restaurantId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  subtotal: number;
}
