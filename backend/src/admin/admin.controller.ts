import { Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';

@ApiTags('admin')
@Controller('admin')
@Roles('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('analytics')
  getAnalytics() {
    return this.adminService.getAnalytics();
  }

  // Moved here from RestaurantsController (docs/ROADMAP.md FDP-60) — approval now requires
  // checking both a Restaurant-owned invariant (compliance document) and a Menu-owned one (at
  // least one item), which only this module can do without a circular dependency.
  @Patch('restaurants/:id/approve')
  approveRestaurant(@Param('id') id: string) {
    return this.adminService.approveRestaurant(id);
  }
}
