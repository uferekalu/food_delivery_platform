import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class ReorderDto {
  @ApiPropertyOptional({
    description:
      "Confirms replacing the customer's current cart with this order's items.",
  })
  @IsOptional()
  @IsBoolean()
  replace?: boolean;
}
