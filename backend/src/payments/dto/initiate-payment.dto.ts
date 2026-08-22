import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsMongoId, IsOptional } from 'class-validator';
import { PAYMENT_PROVIDERS } from '../payment-provider';
import type { PaymentProvider } from '../payment-provider';

export class InitiatePaymentDto {
  @ApiProperty()
  @IsMongoId()
  orderId: string;

  @ApiPropertyOptional({
    enum: PAYMENT_PROVIDERS,
    description:
      'Overrides the order-creation-time default, if the currency supports it',
  })
  @IsOptional()
  @IsIn(PAYMENT_PROVIDERS)
  provider?: PaymentProvider;
}
