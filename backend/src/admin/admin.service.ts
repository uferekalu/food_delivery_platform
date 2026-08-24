import { Injectable } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { RidersService } from '../riders/riders.service';
import { UsersService } from '../users/users.service';
import type { OrderStatus } from '../orders/schemas/order-status';
import type { UserRole } from '../users/schemas/user.schema';

export interface AdminAnalytics {
  orders: {
    total: number;
    byStatus: Record<OrderStatus, number>;
    revenueByCurrency: Record<string, number>;
  };
  restaurants: { approved: number; pending: number };
  riders: { verified: number; pending: number };
  users: Record<UserRole, number>;
}

/**
 * Composes read-only summaries already owned by each domain service (backend/CLAUDE.md's "one
 * service owns a model's writes" convention extends naturally to reads here too — this module
 * never queries another domain's model directly, it always goes through that domain's service).
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly restaurantsService: RestaurantsService,
    private readonly ridersService: RidersService,
    private readonly usersService: UsersService,
  ) {}

  async getAnalytics(): Promise<AdminAnalytics> {
    const [orderStats, restaurantStats, riderStats, userStats] =
      await Promise.all([
        this.ordersService.getAnalyticsSummary(),
        this.restaurantsService.countByApproval(),
        this.ridersService.countByVerification(),
        this.usersService.countByRole(),
      ]);

    return {
      orders: {
        total: orderStats.totalOrders,
        byStatus: orderStats.ordersByStatus,
        revenueByCurrency: orderStats.revenueByCurrency,
      },
      restaurants: restaurantStats,
      riders: riderStats,
      users: userStats,
    };
  }
}
