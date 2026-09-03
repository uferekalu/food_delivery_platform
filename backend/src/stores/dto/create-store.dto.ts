import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AddressDto } from '../../common/dto/address.dto';
import { OpeningHourDto } from '../../common/dto/opening-hour.dto';
import { STORE_TYPES } from '../schemas/store.schema';
import type { StoreType } from '../schemas/store.schema';

export class CreateStoreDto {
  @ApiProperty({ example: 'Market Square Supermarket' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: STORE_TYPES })
  @IsIn(STORE_TYPES)
  type: StoreType;

  @ApiPropertyOptional({ type: [String], example: ['Supermarket'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Set when the owner uploads a logo before submitting',
  })
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @ApiPropertyOptional({
    description: 'Set when the owner uploads a cover photo before submitting',
  })
  @IsOptional()
  @IsUrl()
  coverUrl?: string;

  @ApiProperty({
    description:
      "Proof of business registration (e.g. a pharmacy operating license, or the store's " +
      'country equivalent) — required before a store can be created, and re-checked at admin ' +
      'approval time',
  })
  @IsUrl()
  complianceDocumentUrl: string;

  @ApiProperty({ example: 'NGN', description: 'ISO 4217 currency code' })
  @IsString()
  @Length(3, 3)
  currency: string;

  @ApiProperty({ example: 'Nigeria' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  country: string;

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @ApiProperty({ type: [OpeningHourDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningHourDto)
  openingHours?: OpeningHourDto[];

  @ApiPropertyOptional({ description: 'A static estimate, in minutes' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedDeliveryMinutes?: number;
}
