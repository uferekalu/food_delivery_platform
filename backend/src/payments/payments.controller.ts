import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { PaymentsService } from './payments.service';
import { PaymentProviderResolver } from './provider-resolver';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { ListProvidersDto } from './dto/list-providers.dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly providerResolver: PaymentProviderResolver,
  ) {}

  @Post('initiate')
  initiate(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.paymentsService.initiatePayment(
      user,
      dto.orderId,
      dto.provider,
    );
  }

  /** Ordered provider list for a currency (index 0 = default) — populates the checkout page's
   * "switch provider" control (docs/ARCHITECTURE.md §4). */
  @Get('providers')
  listProviders(@Query() query: ListProvidersDto) {
    return this.providerResolver.resolve(query.currency);
  }

  @Roles('admin')
  @Post(':orderId/refund')
  refund(@Param('orderId') orderId: string) {
    return this.paymentsService.refundOrder(orderId);
  }

  /** Called by the checkout callback page right after the provider redirects back — an active
   * nudge alongside the passive webhook, so a customer never gets stuck on "Confirming your
   * payment…" waiting on a webhook that may never arrive at this deploy. */
  @Post(':orderId/verify')
  verify(
    @CurrentUser() user: AccessTokenPayload,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentsService.verifyPayment(user.sub, orderId);
  }

  // Webhook routes: @Public() (providers don't send our access tokens — signature verification
  // inside PaymentsService.handleWebhook is the real auth), and read the raw body captured by
  // `rawBody: true` in main.ts rather than the parsed one, since Stripe/Paystack's signature
  // schemes are computed over the exact bytes received, not a re-serialized JS object.
  @Public()
  @Post('webhooks/stripe')
  @HttpCode(HttpStatus.OK)
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    await this.paymentsService.handleWebhook(
      'stripe',
      req.rawBody ?? Buffer.alloc(0),
      signature,
    );
    return { received: true };
  }

  @Public()
  @Post('webhooks/paystack')
  @HttpCode(HttpStatus.OK)
  async paystackWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    await this.paymentsService.handleWebhook(
      'paystack',
      req.rawBody ?? Buffer.alloc(0),
      signature,
    );
    return { received: true };
  }

  @Public()
  @Post('webhooks/flutterwave')
  @HttpCode(HttpStatus.OK)
  async flutterwaveWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('verif-hash') signature?: string,
  ) {
    await this.paymentsService.handleWebhook(
      'flutterwave',
      req.rawBody ?? Buffer.alloc(0),
      signature,
    );
    return { received: true };
  }
}
