import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { REVIEW_TARGET_TYPES } from '../schemas/review.schema';
import type { ReviewTargetType } from '../schemas/review.schema';

export class CreateReviewDto {
  @ApiProperty({ enum: REVIEW_TARGET_TYPES })
  @IsIn(REVIEW_TARGET_TYPES)
  targetType: ReviewTargetType;

  @ApiProperty()
  @IsMongoId()
  orderId: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsUrl({}, { each: true })
  images?: string[];
}
