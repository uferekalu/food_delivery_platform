import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const RESTAURANT_SORTS = [
  'newest',
  'rating',
  'price_asc',
  'price_desc',
  'delivery_time',
] as const;
export type RestaurantSort = (typeof RESTAURANT_SORTS)[number];

export class ListRestaurantsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cuisine?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 5,
    description: 'Only restaurants rated at least this',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 4,
    description: 'Only restaurants at or below this price level',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  maxPriceLevel?: number;

  @ApiPropertyOptional({
    description:
      'Only restaurants with an estimated delivery time at or below this many minutes',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxDeliveryMinutes?: number;

  @ApiPropertyOptional({ enum: RESTAURANT_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(RESTAURANT_SORTS)
  sort?: RestaurantSort = 'newest';

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
