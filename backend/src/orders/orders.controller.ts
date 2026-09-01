import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(user.sub, dto);
  }

  @Get('mine')
  findMine(@CurrentUser() user: AccessTokenPayload) {
    return this.ordersService.findMine(user.sub);
  }

  // Declared before `:id` — a literal path segment ("restaurant") would otherwise never be
  // reached, since `:id` matches everything (same lesson as `/restaurants/mine`, `/orders/mine`).
  @Roles('restaurant_owner', 'admin')
  @Get('restaurant/:restaurantId')
  findForRestaurant(
    @CurrentUser() user: AccessTokenPayload,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.ordersService.findForRestaurant(user, restaurantId);
  }

  // Declared before `:id` for the same reason as `restaurant/:restaurantId` above — vendor
  // payouts epic, part 1 of 4 (docs/ROADMAP.md FDP-51).
  @Roles('restaurant_owner', 'admin')
  @Get('restaurant/:restaurantId/earnings')
  getEarnings(
    @CurrentUser() user: AccessTokenPayload,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.ordersService.getEarningsSummary(user, restaurantId);
  }

  // Declared before `:id` for the same reason as `restaurant/:restaurantId` above — admin-only
  // unrestricted lookup for dispute/refund handling (docs/ROADMAP.md FDP-20), unlike the
  // ownership-checked `:id` route below.
  @Roles('admin')
  @Get('admin/:id')
  findOneAsAdmin(@Param('id') id: string) {
    return this.ordersService.adminFindOrThrow(id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.ordersService.findOne(user.sub, id);
  }

  @Roles('restaurant_owner', 'admin')
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatusByOwner(user, id, dto.status);
  }
}
