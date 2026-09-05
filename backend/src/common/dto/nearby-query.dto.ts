import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsLatitude, IsLongitude, IsOptional, Max, Min } from 'class-validator';

/**
 * "Restaurants/stores near me" (docs/ROADMAP.md FDP-96) — shared by
 * `RestaurantsController`/`StoresController`'s `GET .../nearby` routes. `lat`/`lng` are the
 * customer's own current position (from the browser's Geolocation API), not a saved address —
 * this endpoint answers "what's near me right now", which is a different question from the
 * existing delivery-zone fee calculation (that's "what's near a specific delivery address").
 */
export class NearbyQueryDto {
  @ApiProperty({ description: "The customer's current latitude" })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({ description: "The customer's current longitude" })
  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @ApiPropertyOptional({
    default: 10,
    minimum: 0.5,
    maximum: 50,
    description: 'Search radius in kilometres',
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0.5)
  @Max(50)
  radiusKm?: number = 10;

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
