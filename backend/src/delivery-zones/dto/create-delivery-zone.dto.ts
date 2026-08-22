import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateDeliveryZoneDto {
  @ApiProperty({ example: 'Nearby (0-3km)' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 3, description: 'Upper bound of this ring, in kilometres' })
  @IsNumber()
  @Min(0)
  @Max(1000)
  maxDistanceKm: number;

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(0)
  baseFee: number;

  @ApiProperty({ example: 50, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  perKmFee?: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
