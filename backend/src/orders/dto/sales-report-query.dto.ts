import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

// Both optional — an unset from/to means "all-time", matching getEarningsSummary's existing
// behavior rather than forcing every caller to always pick a range.
export class SalesReportQueryDto {
  @ApiPropertyOptional({
    description: 'ISO date/time — inclusive lower bound on deliveredAt',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'ISO date/time — inclusive upper bound on deliveredAt',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
