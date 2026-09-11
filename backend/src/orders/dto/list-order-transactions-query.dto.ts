import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Min, Max } from 'class-validator';

// Admin-wide order transaction ledger (docs/ROADMAP.md FDP-128) — every field optional, an unset
// from/to/sellerType means "everything," same "no forced range" posture as SalesReportQueryDto.
export class ListOrderTransactionsQueryDto {
  @ApiPropertyOptional({
    description: 'ISO date/time — inclusive lower bound on createdAt',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'ISO date/time — inclusive upper bound on createdAt',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: ['restaurant', 'store'] })
  @IsOptional()
  @IsIn(['restaurant', 'store'])
  vendorType?: 'restaurant' | 'store';

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
  @Max(100)
  limit?: number = 20;
}
