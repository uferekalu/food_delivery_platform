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

// Owner-managed only (not @Public()) — unlike the menu, a restaurant's delivery-zone pricing
// isn't customer-facing UI; the customer only ever sees its effect, the fee on their order.
@ApiTags('delivery-zones')
@Controller('restaurants/:restaurantId/delivery-zones')
@Roles('restaurant_owner', 'admin')
export class DeliveryZonesController {
  constructor(private readonly deliveryZonesService: DeliveryZonesService) {}

  @Get()
  list(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.deliveryZonesService.list(restaurantId, user);
  }

  @Post()
  create(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateDeliveryZoneDto,
  ) {
    return this.deliveryZonesService.create(restaurantId, user, dto);
  }

  @Patch(':zoneId')
  update(
    @Param('restaurantId') restaurantId: string,
    @Param('zoneId') zoneId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateDeliveryZoneDto,
  ) {
    return this.deliveryZonesService.update(restaurantId, zoneId, user, dto);
  }

  @Delete(':zoneId')
  delete(
    @Param('restaurantId') restaurantId: string,
    @Param('zoneId') zoneId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.deliveryZonesService.delete(restaurantId, zoneId, user);
  }
}
