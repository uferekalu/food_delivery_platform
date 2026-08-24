import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { OrdersService } from '../orders/orders.service';
import { UpdateOrderStatusDto } from '../orders/dto/update-order-status.dto';
import { RidersService } from './riders.service';
import { ApplyRiderDto } from './dto/apply-rider.dto';

@ApiTags('riders')
@Controller('riders')
export class RidersController {
  constructor(
    private readonly ridersService: RidersService,
    private readonly ordersService: OrdersService,
  ) {}

  // No @Roles() here — any authenticated non-rider/non-admin can apply; RidersService.apply
  // enforces the rest.
  @Post('apply')
  apply(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ApplyRiderDto,
  ) {
    return this.ridersService.apply(user, dto);
  }

  @Roles('rider')
  @Get('me')
  findMine(@CurrentUser() user: AccessTokenPayload) {
    return this.ridersService.findMine(user.sub);
  }

  @Roles('rider')
  @Patch('me/toggle-online')
  toggleOnline(@CurrentUser() user: AccessTokenPayload) {
    return this.ridersService.toggleOnline(user.sub);
  }

  @Roles('rider')
  @Get('me/deliveries')
  myDeliveries(@CurrentUser() user: AccessTokenPayload) {
    return this.ordersService.findForRider(user.sub);
  }

  @Roles('rider')
  @Get('queue')
  queue() {
    return this.ordersService.findUnassignedForRiders();
  }

  @Roles('rider')
  @Post('orders/:orderId/assign')
  async assign(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    await this.ridersService.assertVerified(user.sub);
    return this.ordersService.assignToRider(user.sub, orderId);
  }

  @Roles('rider')
  @Patch('orders/:orderId/status')
  updateOrderStatus(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatusByRider(
      user.sub,
      orderId,
      dto.status,
    );
  }

  @Roles('admin')
  @Get()
  findAll() {
    return this.ridersService.findAll();
  }

  @Roles('admin')
  @Patch(':riderId/verify')
  verify(@Param('riderId') riderId: string) {
    return this.ridersService.verify(riderId);
  }
}
