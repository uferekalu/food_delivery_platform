import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min, Max } from 'class-validator';

// Powers the admin Overview tab's "Advertising Revenue" transaction ledger (docs/ROADMAP.md
// FDP-128) — same shape as ListOrderTransactionsQueryDto's date-range fields.
export class ListAdCampaignTransactionsQueryDto {
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
