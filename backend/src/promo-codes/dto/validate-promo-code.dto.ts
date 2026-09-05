import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

// Exactly one of restaurantId/storeId is required (docs/ROADMAP.md FDP-90) — checked in the
// controller, not here, since class-validator doesn't cleanly express "exactly one of two
// optional fields" without a custom validator for what's otherwise a two-line check.
export class ValidatePromoCodeDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  storeId?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  subtotal: number;
}
