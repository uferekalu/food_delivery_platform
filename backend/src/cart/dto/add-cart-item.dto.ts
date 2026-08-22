import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SelectedModifierInputDto } from './selected-modifier-input.dto';

export class AddCartItemDto {
  @ApiProperty()
  @IsMongoId()
  menuItemId: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  qty?: number;

  @ApiPropertyOptional({ type: [SelectedModifierInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SelectedModifierInputDto)
  selectedModifiers?: SelectedModifierInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Confirms replacing the cart when adding an item from a different restaurant than the one already in it.',
  })
  @IsOptional()
  @IsBoolean()
  replace?: boolean;
}
