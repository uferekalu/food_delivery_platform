import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

// Shared between RestaurantsController and StoresController (docs/ROADMAP.md FDP-115) — lets an
// owner correct a mistyped registration number and re-run the automated check without touching
// anything else about the restaurant/store. Same validation as CreateRestaurantDto/
// CreateStoreDto's businessRegistrationNumber field.
export class ReverifyBusinessRegistrationDto {
  @ApiProperty({ example: 'RC1234567' })
  @IsString()
  @MinLength(4)
  @MaxLength(30)
  businessRegistrationNumber: string;
}
