import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { REVIEW_TARGET_TYPES } from '../schemas/review.schema';
import type { ReviewTargetType } from '../schemas/review.schema';

export class ListReviewsDto {
  @ApiProperty({ enum: REVIEW_TARGET_TYPES })
  @IsIn(REVIEW_TARGET_TYPES)
  targetType: ReviewTargetType;

  @ApiProperty()
  @IsMongoId()
  targetId: string;

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
