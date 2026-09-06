import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ResolveRefundReconciliationDto {
  @ApiProperty({
    description:
      'What the admin found on the provider dashboard: did the refund actually complete?',
  })
  @IsBoolean()
  refundActuallySucceeded: boolean;
}
