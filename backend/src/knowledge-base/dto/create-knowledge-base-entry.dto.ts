import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateKnowledgeBaseEntryDto {
  @ApiProperty({ example: 'What areas do you deliver to?' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  question: string;

  @ApiProperty({
    example:
      'We deliver within each restaurant or store’s own delivery zone — enter your address at checkout to see exactly which ones can reach you.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  answer: string;

  @ApiProperty({
    example: ['delivery area', 'where do you deliver', 'delivery zone'],
    description:
      'Substrings matched against a lowercased visitor message — a keyword can be a multi-word phrase for a more specific, higher-weighted match.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  keywords: string[];

  @ApiProperty({ example: 'delivery' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  category: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
