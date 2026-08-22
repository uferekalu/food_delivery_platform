import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { PromoCodesService } from './promo-codes.service';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { ValidatePromoCodeDto } from './dto/validate-promo-code.dto';

@ApiTags('promo-codes')
@Controller('promo-codes')
export class PromoCodesController {
  constructor(private readonly promoCodesService: PromoCodesService) {}

  // Any authenticated user (customers checking a code at checkout) — not role-restricted.
  @Post('validate')
  validate(@Body() dto: ValidatePromoCodeDto) {
    return this.promoCodesService.validate(
      dto.code,
      dto.restaurantId,
      dto.subtotal,
    );
  }

  // Admin-only creation, API-only for now — same bootstrap pattern as restaurant approval
  // before FDP-5's owner dashboard existed. A management UI is FDP-18 (admin-dashboard).
  @Roles('admin')
  @Post()
  create(@Body() dto: CreatePromoCodeDto) {
    return this.promoCodesService.create(dto);
  }

  @Roles('admin')
  @Get()
  findAll() {
    return this.promoCodesService.findAll();
  }
}
