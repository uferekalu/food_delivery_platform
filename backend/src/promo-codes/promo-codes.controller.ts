import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { PromoCodesService } from './promo-codes.service';
import type { PromoCodeSeller } from './promo-codes.service';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';
import { ValidatePromoCodeDto } from './dto/validate-promo-code.dto';

@ApiTags('promo-codes')
@Controller('promo-codes')
export class PromoCodesController {
  constructor(private readonly promoCodesService: PromoCodesService) {}

  // Any authenticated user (customers checking a code at checkout) — not role-restricted.
  @Post('validate')
  validate(@Body() dto: ValidatePromoCodeDto) {
    const seller = this.resolveSeller(dto);
    return this.promoCodesService.validate(dto.code, seller, dto.subtotal);
  }

  private resolveSeller(dto: ValidatePromoCodeDto): PromoCodeSeller {
    if (dto.restaurantId && dto.storeId) {
      throw new BadRequestException(
        'Provide either restaurantId or storeId, not both',
      );
    }
    if (dto.restaurantId) {
      return { sellerType: 'restaurant', sellerId: dto.restaurantId };
    }
    if (dto.storeId) {
      return { sellerType: 'store', sellerId: dto.storeId };
    }
    throw new BadRequestException('Provide either restaurantId or storeId');
  }

  // A vendor may also create a code, scoped to their own restaurant/store only — enforced in
  // PromoCodesService.create (docs/ROADMAP.md FDP-111).
  @Roles('admin', 'restaurant_owner')
  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreatePromoCodeDto,
  ) {
    return this.promoCodesService.create(dto, user);
  }

  // Full platform-wide list — admin only. A vendor uses GET /promo-codes/mine instead.
  @Roles('admin')
  @Get()
  findAll() {
    return this.promoCodesService.findAll();
  }

  @Roles('restaurant_owner')
  @Get('mine')
  findMine(@CurrentUser() user: AccessTokenPayload) {
    return this.promoCodesService.findMine(user);
  }

  @Roles('admin', 'restaurant_owner')
  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePromoCodeDto,
  ) {
    return this.promoCodesService.update(id, dto, user);
  }
}
