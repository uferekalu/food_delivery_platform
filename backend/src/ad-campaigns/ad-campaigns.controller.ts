import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { AdCampaignsService } from './ad-campaigns.service';
import { CreateAdCampaignDto } from './dto/create-ad-campaign.dto';
import { CancelAdCampaignDto } from './dto/cancel-ad-campaign.dto';
import { InitiateAdCampaignPaymentDto } from './dto/initiate-ad-campaign-payment.dto';

@ApiTags('ad-campaigns')
@Controller('ad-campaigns')
export class AdCampaignsController {
  constructor(private readonly adCampaignsService: AdCampaignsService) {}

  // Admin-initiated by design (docs/ROADMAP.md FDP-124) — the vendor never requests a campaign,
  // they only pay to activate one an admin already set up for them.
  @Roles('admin')
  @Post()
  create(
    @CurrentUser() admin: AccessTokenPayload,
    @Body() dto: CreateAdCampaignDto,
  ) {
    return this.adCampaignsService.create(dto, admin);
  }

  @Roles('admin')
  @Get()
  findAll() {
    return this.adCampaignsService.findAllForAdmin();
  }

  @Roles('restaurant_owner')
  @Get('mine')
  findMine(@CurrentUser() user: AccessTokenPayload) {
    return this.adCampaignsService.findMine(user);
  }

  @Roles('admin')
  @Post('run-lifecycle-sweep')
  runLifecycleSweep() {
    return this.adCampaignsService.runLifecycleSweep();
  }

  @Roles('admin', 'restaurant_owner')
  @Get(':id')
  findOne(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.adCampaignsService.findOneForRequester(id, user);
  }

  // Vendor-only, never admin — the checkout receipt email must be the paying vendor's own.
  // Throttled the same as order checkout (docs/CLAUDE.md) — each call creates a real
  // provider-hosted checkout session.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Roles('restaurant_owner')
  @Post(':id/pay')
  pay(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: InitiateAdCampaignPaymentDto,
  ) {
    return this.adCampaignsService.initiateCampaignPayment(
      id,
      user,
      dto.provider,
    );
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Roles('restaurant_owner')
  @Post(':id/verify')
  verify(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.adCampaignsService.verifyPayment(id, user);
  }

  // Records an offline payment (bank transfer, invoiced deal) — converges on the same activation
  // logic the online checkout webhook uses.
  @Roles('admin')
  @Patch(':id/mark-paid')
  markPaidManually(
    @CurrentUser() admin: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.adCampaignsService.markPaidManually(id, admin);
  }

  @Roles('admin')
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelAdCampaignDto) {
    return this.adCampaignsService.cancel(id, dto.reason);
  }

  // Webhook routes: @Public(), signature verification happens inside the adapter (see
  // PaymentsController's identical reasoning) — reads the raw body captured by main.ts's
  // `rawBody: true`.
  @Public()
  @Post('webhooks/stripe')
  @HttpCode(HttpStatus.OK)
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    await this.adCampaignsService.handleWebhook('stripe', rawBody, signature);
    return { received: true };
  }

  @Public()
  @Post('webhooks/paystack')
  @HttpCode(HttpStatus.OK)
  async paystackWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    await this.adCampaignsService.handleWebhook('paystack', rawBody, signature);
    return { received: true };
  }

  @Public()
  @Post('webhooks/flutterwave')
  @HttpCode(HttpStatus.OK)
  async flutterwaveWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('verif-hash') signature?: string,
  ) {
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    await this.adCampaignsService.handleWebhook(
      'flutterwave',
      rawBody,
      signature,
    );
    return { received: true };
  }
}
