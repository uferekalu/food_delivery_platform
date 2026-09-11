import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { ListOrderTransactionsQueryDto } from '../orders/dto/list-order-transactions-query.dto';
import { ListAdCampaignTransactionsQueryDto } from '../ad-campaigns/dto/list-ad-campaign-transactions-query.dto';

@ApiTags('admin')
@Controller('admin')
@Roles('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('analytics')
  getAnalytics() {
    return this.adminService.getAnalytics();
  }

  // Auditing view (docs/ROADMAP.md FDP-128) — every order across every vendor, paginated and
  // date-filterable, distinct from getAnalytics' aggregate-only counters.
  @Get('transactions/orders')
  getOrderTransactions(@Query() query: ListOrderTransactionsQueryDto) {
    return this.adminService.getOrderTransactions(query);
  }

  @Get('transactions/ad-campaigns')
  getAdCampaignTransactions(@Query() query: ListAdCampaignTransactionsQueryDto) {
    return this.adminService.getAdCampaignTransactions(query);
  }

  // Moved here from RestaurantsController (docs/ROADMAP.md FDP-60) — approval now requires
  // checking both a Restaurant-owned invariant (compliance document) and a Menu-owned one (at
  // least one item), which only this module can do without a circular dependency.
  @Patch('restaurants/:id/approve')
  approveRestaurant(@Param('id') id: string) {
    return this.adminService.approveRestaurant(id);
  }

  // Same split as restaurants/:id/approve above (docs/ROADMAP.md FDP-56).
  @Patch('stores/:id/approve')
  approveStore(@Param('id') id: string) {
    return this.adminService.approveStore(id);
  }
}
