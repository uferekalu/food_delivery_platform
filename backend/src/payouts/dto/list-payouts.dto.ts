import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PAYOUT_STATUSES, PAYOUT_VENDOR_TYPES } from '../schemas/payout.schema';
import type { PayoutStatus, PayoutVendorType } from '../schemas/payout.schema';

export class ListPayoutsDto {
  @ApiPropertyOptional({ enum: PAYOUT_STATUSES })
  @IsOptional()
  @IsIn(PAYOUT_STATUSES)
  status?: PayoutStatus;

  @ApiPropertyOptional({ enum: PAYOUT_VENDOR_TYPES })
  @IsOptional()
  @IsIn(PAYOUT_VENDOR_TYPES)
  vendorType?: PayoutVendorType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  reconciliationRequired?: boolean;

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
