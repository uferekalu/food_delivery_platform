import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PAYMENT_PROVIDERS } from '../../payments/payment-provider';
import type { PaymentProvider } from '../../payments/payment-provider';

export class InitiateAdCampaignPaymentDto {
  @ApiPropertyOptional({
    enum: PAYMENT_PROVIDERS,
    description:
      'Overrides the auto-selected default, if the currency supports it',
  })
  @IsOptional()
  @IsIn(PAYMENT_PROVIDERS)
  provider?: PaymentProvider;
}
