import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { STORE_TYPES } from '../schemas/store.schema';
import type { StoreType } from '../schemas/store.schema';

export const STORE_SORTS = ['newest', 'rating', 'delivery_time'] as const;
export type StoreSort = (typeof STORE_SORTS)[number];

// A category-listing page (Groceries, Pharmacy & Beauty) always picks exactly one type —
// confirmed against the real Glovo pages, where a groceries listing never shows a pharmacy
// store (docs/ROADMAP.md FDP-56) — so, unlike ListRestaurantsDto, `type` is required here.
export class ListStoresDto {
  @ApiProperty({ enum: STORE_TYPES })
  @IsIn(STORE_TYPES)
  type: StoreType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sub-category chip, e.g. "Supermarket" or "Parapharmacy"',
  })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 5,
    description: 'Only stores rated at least this',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({
    description:
      'Only stores with an estimated delivery time at or below this many minutes',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxDeliveryMinutes?: number;

  @ApiPropertyOptional({ enum: STORE_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(STORE_SORTS)
  sort?: StoreSort = 'newest';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
