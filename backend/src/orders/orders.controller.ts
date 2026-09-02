import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { csvRow } from '../common/utils/csv';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { SalesReportQueryDto } from './dto/sales-report-query.dto';

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

  // Declared before `:id` for the same reason as `restaurant/:restaurantId` above — detailed
  // sales report + COGS (docs/ROADMAP.md FDP-64).
  @Roles('restaurant_owner', 'admin')
  @Get('restaurant/:restaurantId/sales-report')
  getSalesReport(
    @CurrentUser() user: AccessTokenPayload,
    @Param('restaurantId') restaurantId: string,
    @Query() query: SalesReportQueryDto,
  ) {
    return this.ordersService.getSalesReport(
      user,
      restaurantId,
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }

  /** Order-level CSV export backing the sales report page's "Download CSV" button — one row per
   * DELIVERED order in range, so an owner can reconcile in Excel/Sheets rather than only reading
   * the aggregated numbers on screen. */
  @Roles('restaurant_owner', 'admin')
  @Get('restaurant/:restaurantId/sales-report/export')
  async exportSalesReport(
    @CurrentUser() user: AccessTokenPayload,
    @Param('restaurantId') restaurantId: string,
    @Query() query: SalesReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const orders = await this.ordersService.getSalesReportOrders(
      user,
      restaurantId,
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );

    const header = csvRow([
      'Order number',
      'Delivered at',
      'Items',
      'Subtotal',
      'Delivery fee',
      'Service fee',
      'Discount',
      'Total',
      'Platform fee',
      'Restaurant payout',
      'COGS',
      'Gross profit',
      'Promo code',
    ]);
    const rows = orders.map((order) => {
      const cogs = order.items.reduce(
        (sum, item) => sum + (item.costPrice ?? 0) * item.qty,
        0,
      );
      return csvRow([
        order.orderNumber,
        order.deliveredAt?.toISOString() ?? '',
        order.items.map((item) => `${item.name} x${item.qty}`).join('; '),
        order.subtotal,
        order.deliveryFee,
        order.serviceFee,
        order.discount,
        order.total,
        order.platformFeeAmount,
        order.restaurantPayoutAmount,
        Math.round(cogs * 100) / 100,
        Math.round((order.subtotal - cogs) * 100) / 100,
        order.promoCode ?? '',
      ]);
    });

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header(
      'Content-Disposition',
      `attachment; filename="sales-report-${restaurantId}.csv"`,
    );
    return [header, ...rows].join('\r\n');
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
