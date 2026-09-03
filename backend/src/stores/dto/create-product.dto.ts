import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty()
  @IsMongoId()
  categoryId: string;

  @ApiProperty({ example: 'Bbv Eggs X12' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    description:
      'Set only while a promo is active on this item — must be lower than price. Powers the ' +
      '"-X%" badge shown to customers',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountedPrice?: number;

  @ApiPropertyOptional({
    description:
      'Owner-only cost to stock this item, used for sales-report COGS/margin figures — never shown to customers',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({
    description: 'Set when the owner uploads a photo before submitting',
  })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional({ example: '550ml' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @ApiPropertyOptional({
    description:
      'Omit to leave this item untracked (always orderable while available, same as a restaurant menu item); set a real count to enforce it',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
