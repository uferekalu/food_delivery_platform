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
import { OrdersService, round2 } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { SalesReportQueryDto } from './dto/sales-report-query.dto';
import { ListSalesReportTransactionsQueryDto } from './dto/list-sales-report-transactions-query.dto';
import { ReorderDto } from './dto/reorder.dto';

/**
 * A bare date-only `to` value ("2026-09-30", the shape a native `<input type="date">` sends)
 * parses to that day's midnight UTC — used as-is for an *inclusive upper bound*, that silently
 * excludes the entire last day of a report (docs/ROADMAP.md FDP-65: an owner requesting a
 * natural "full month" range lost almost a full day of revenue/COGS with no indication anything
 * was dropped). Only a bare date gets nudged to end-of-day; a caller that already passed a full
 * datetime is used exactly as given. `from` needs no equivalent treatment — a bare date's
 * midnight UTC is already the correct inclusive lower bound.
 */
function parseRangeTo(value?: string): Date | undefined {
  if (!value) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T23:59:59.999Z`)
    : new Date(value);
}

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

  // Declared before `:id` for the same reason as every other literal segment in this controller.
  // No @Roles() restriction — both an admin and any vendor need this reference table, and it's
  // non-sensitive (docs/ROADMAP.md FDP-129).
  @Get('fee-schedule')
  getFeeSchedule() {
    return this.ordersService.getFeeSchedule();
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

  // Store-catalog counterpart of `restaurant/:restaurantId` above (docs/ROADMAP.md FDP-56).
  // Declared before `:id` for the same route-matching-order reason.
  @Roles('restaurant_owner', 'admin')
  @Get('store/:storeId')
  findForStore(
    @CurrentUser() user: AccessTokenPayload,
    @Param('storeId') storeId: string,
  ) {
    return this.ordersService.findForStore(user, storeId);
  }

  // Declared before `:id` for the same reason as `restaurant/:restaurantId` above — vendor
  // payouts epic, part 1 of 4 (docs/ROADMAP.md FDP-51).
  @Roles('restaurant_owner', 'admin')
  @Get('restaurant/:restaurantId/earnings')
  getEarnings(
    @CurrentUser() user: AccessTokenPayload,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.ordersService.getEarningsSummary(
      user,
      'restaurant',
      restaurantId,
    );
  }

  // Store-catalog counterpart of `restaurant/:restaurantId/earnings` above (docs/ROADMAP.md
  // FDP-102) — was a real gap left over from FDP-90's own seller-parity pass, which generalized
  // delivery-zones/promo-codes but not earnings/sales-report.
  @Roles('restaurant_owner', 'admin')
  @Get('store/:storeId/earnings')
  getStoreEarnings(
    @CurrentUser() user: AccessTokenPayload,
    @Param('storeId') storeId: string,
  ) {
    return this.ordersService.getEarningsSummary(user, 'store', storeId);
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
      'restaurant',
      restaurantId,
      query.from ? new Date(query.from) : undefined,
      parseRangeTo(query.to),
    );
  }

  // Store-catalog counterpart of `restaurant/:restaurantId/sales-report` above (docs/ROADMAP.md
  // FDP-102).
  @Roles('restaurant_owner', 'admin')
  @Get('store/:storeId/sales-report')
  getStoreSalesReport(
    @CurrentUser() user: AccessTokenPayload,
    @Param('storeId') storeId: string,
    @Query() query: SalesReportQueryDto,
  ) {
    return this.ordersService.getSalesReport(
      user,
      'store',
      storeId,
      query.from ? new Date(query.from) : undefined,
      parseRangeTo(query.to),
    );
  }

  /** Paginated per-order fee breakdown backing the sales report page's new "Order transactions"
   * section (docs/ROADMAP.md FDP-129) — same date range as the aggregated report above it, but
   * detailed per order (subtotal/delivery fee/service fee/tax/discount/platform fee, each with
   * its effective rate) so a vendor can see exactly what was deducted from every order. */
  @Roles('restaurant_owner', 'admin')
  @Get('restaurant/:restaurantId/sales-report/transactions')
  getSalesReportTransactions(
    @CurrentUser() user: AccessTokenPayload,
    @Param('restaurantId') restaurantId: string,
    @Query() query: ListSalesReportTransactionsQueryDto,
  ) {
    return this.ordersService.getSalesReportTransactions(
      user,
      'restaurant',
      restaurantId,
      query.from ? new Date(query.from) : undefined,
      parseRangeTo(query.to),
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  // Store-catalog counterpart of `restaurant/:restaurantId/sales-report/transactions` above.
  @Roles('restaurant_owner', 'admin')
  @Get('store/:storeId/sales-report/transactions')
  getStoreSalesReportTransactions(
    @CurrentUser() user: AccessTokenPayload,
    @Param('storeId') storeId: string,
    @Query() query: ListSalesReportTransactionsQueryDto,
  ) {
    return this.ordersService.getSalesReportTransactions(
      user,
      'store',
      storeId,
      query.from ? new Date(query.from) : undefined,
      parseRangeTo(query.to),
      query.page ?? 1,
      query.limit ?? 20,
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
      'restaurant',
      restaurantId,
      query.from ? new Date(query.from) : undefined,
      parseRangeTo(query.to),
    );
    return this.sendSalesReportCsv(res, orders, restaurantId);
  }

  // Store-catalog counterpart of `restaurant/:restaurantId/sales-report/export` above
  // (docs/ROADMAP.md FDP-102).
  @Roles('restaurant_owner', 'admin')
  @Get('store/:storeId/sales-report/export')
  async exportStoreSalesReport(
    @CurrentUser() user: AccessTokenPayload,
    @Param('storeId') storeId: string,
    @Query() query: SalesReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const orders = await this.ordersService.getSalesReportOrders(
      user,
      'store',
      storeId,
      query.from ? new Date(query.from) : undefined,
      parseRangeTo(query.to),
    );
    return this.sendSalesReportCsv(res, orders, storeId);
  }

  /** Shared CSV-building tail for both sales-report exports above — the column header says
   * "Seller payout" rather than "Restaurant payout", matching `restaurantPayoutAmount`'s own
   * established "legacy field name, means whichever seller type owns this order" convention
   * (docs/ROADMAP.md FDP-56/90) rather than introducing a restaurant-specific label a store
   * owner's export would then have to carry too. */
  private sendSalesReportCsv(
    res: Response,
    orders: Awaited<ReturnType<OrdersService['getSalesReportOrders']>>,
    sellerId: string,
  ): string {
    const header = csvRow([
      'Order number',
      'Delivered at',
      'Items',
      'Subtotal',
      'Delivery fee',
      'Service fee',
      'Discount',
      'Tax',
      'Total',
      'Platform fee',
      'Seller payout',
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
        order.tax,
        order.total,
        order.platformFeeAmount,
        order.restaurantPayoutAmount,
        round2(cogs),
        round2(order.subtotal - cogs),
        order.promoCode ?? '',
      ]);
    });

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header(
      'Content-Disposition',
      `attachment; filename="sales-report-${sellerId}.csv"`,
    );
    return [header, ...rows].join('\r\n');
  }

  // Declared before `admin/:id` for the same "literal before param" reason as every other
  // fixed-segment route in this controller — refund-hardening pass (docs/ROADMAP.md FDP-104):
  // every order that needs a human to look at its refund status, since nothing else in this
  // codebase prompts an admin to notice a cancelled-but-unrefunded order or an ambiguous refund
  // outcome on its own.
  @Roles('admin')
  @Get('admin/needs-refund-attention')
  findNeedingRefundAttention() {
    return this.ordersService.findNeedingRefundAttention();
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

  // "Buy again" (docs/ROADMAP.md FDP-97).
  @Post(':id/reorder')
  reorder(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: ReorderDto,
  ) {
    return this.ordersService.reorder(user.sub, id, dto.replace);
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
