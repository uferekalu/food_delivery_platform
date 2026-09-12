import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min, Max } from 'class-validator';

// A vendor's own paginated order-transactions list on the sales report page (docs/ROADMAP.md
// FDP-129) — same shape as ListOrderTransactionsQueryDto minus vendorType, since a seller-scoped
// route never needs it (the :restaurantId/:storeId path param already picks the one vendor).
export class ListSalesReportTransactionsQueryDto {
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
