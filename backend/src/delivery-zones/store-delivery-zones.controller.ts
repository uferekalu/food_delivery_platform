import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { DeliveryZonesService } from './delivery-zones.service';
import { CreateDeliveryZoneDto } from './dto/create-delivery-zone.dto';
import { UpdateDeliveryZoneDto } from './dto/update-delivery-zone.dto';

// Store (grocery/pharmacy) counterpart of DeliveryZonesController (docs/ROADMAP.md FDP-90) —
// same owner-managed-only shape, same shared DeliveryZonesService, just a store instead of a
// restaurant as the seller.
@ApiTags('delivery-zones')
@Controller('stores/:storeId/delivery-zones')
@Roles('restaurant_owner', 'admin')
export class StoreDeliveryZonesController {
  constructor(private readonly deliveryZonesService: DeliveryZonesService) {}

  @Get()
  list(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.deliveryZonesService.list('store', storeId, user);
  }

  @Post()
  create(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateDeliveryZoneDto,
  ) {
    return this.deliveryZonesService.create('store', storeId, user, dto);
  }

  @Patch(':zoneId')
  update(
    @Param('storeId') storeId: string,
    @Param('zoneId') zoneId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateDeliveryZoneDto,
  ) {
    return this.deliveryZonesService.update(
      'store',
      storeId,
      zoneId,
      user,
      dto,
    );
  }

  @Delete(':zoneId')
  delete(
    @Param('storeId') storeId: string,
    @Param('zoneId') zoneId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.deliveryZonesService.delete('store', storeId, zoneId, user);
  }
}
