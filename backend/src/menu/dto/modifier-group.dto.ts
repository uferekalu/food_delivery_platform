import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ModifierOptionDto } from './modifier-option.dto';

export class ModifierGroupDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  min: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  max: number;

  @ApiProperty({ type: [ModifierOptionDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ModifierOptionDto)
  options: ModifierOptionDto[];
}
