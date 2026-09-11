import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateAdCampaignDto {
  @ApiPropertyOptional({
    description:
      'Restaurant to advertise. Exactly one of restaurantId/storeId is required.',
  })
  @IsOptional()
  @IsMongoId()
  restaurantId?: string;

  @ApiPropertyOptional({
    description:
      'Store (grocery/pharmacy) to advertise. Exactly one of restaurantId/storeId is required.',
  })
  @IsOptional()
  @IsMongoId()
  storeId?: string;

  @ApiProperty({ description: 'ISO date the campaign should start.' })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    minimum: 1,
    default: 7,
    description: 'How many days the campaign runs for.',
  })
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays: number;

  @ApiPropertyOptional({
    description:
      'Override the suggested dailyRate * durationDays total with a custom price.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPriceOverride?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNotes?: string;
}
