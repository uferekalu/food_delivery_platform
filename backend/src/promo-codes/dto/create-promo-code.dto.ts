import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { DISCOUNT_TYPES } from '../schemas/promo-code.schema';
import type { DiscountType } from '../schemas/promo-code.schema';

export class CreatePromoCodeDto {
  @ApiProperty({ example: 'WELCOME10' })
  @IsString()
  @MinLength(3)
  code: string;

  @ApiProperty({ enum: DISCOUNT_TYPES })
  @IsEnum(DISCOUNT_TYPES)
  discountType: DiscountType;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  discountValue: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @ApiPropertyOptional({
    description:
      'Restaurant-scoped code. Omit both this and storeId for a platform-wide code — at most one may be set.',
  })
  @IsOptional()
  @IsMongoId()
  restaurantId?: string;

  @ApiPropertyOptional({
    description:
      'Store (grocery/pharmacy)-scoped code (docs/ROADMAP.md FDP-90). At most one of restaurantId/storeId may be set.',
  })
  @IsOptional()
  @IsMongoId()
  storeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;
}
