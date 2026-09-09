import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional } from 'class-validator';

// Exactly one of restaurantId/storeId is required — checked in the controller, same as
// ValidatePromoCodeDto (docs/ROADMAP.md FDP-90's reasoning for why that's not expressed here).
export class ActivePromoCodesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  restaurantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  storeId?: string;
}
