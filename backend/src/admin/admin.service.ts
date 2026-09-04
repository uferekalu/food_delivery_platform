import { BadRequestException, Injectable } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { RidersService } from '../riders/riders.service';
import { UsersService } from '../users/users.service';
import { MenuService } from '../menu/menu.service';
import { StoresService } from '../stores/stores.service';
import { ProductsService } from '../stores/products.service';
import type { RestaurantDocument } from '../restaurants/schemas/restaurant.schema';
import type { StoreDocument } from '../stores/schemas/store.schema';
import type { OrderStatus } from '../orders/schemas/order-status';
import type { UserRole } from '../users/schemas/user.schema';

export interface AdminAnalytics {
  orders: {
    total: number;
    byStatus: Record<OrderStatus, number>;
    revenueByCurrency: Record<string, number>;
  };
  restaurants: { approved: number; pending: number };
  stores: { approved: number; pending: number };
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
    private readonly menuService: MenuService,
    private readonly storesService: StoresService,
    private readonly productsService: ProductsService,
  ) {}

  async getAnalytics(): Promise<AdminAnalytics> {
    const [orderStats, restaurantStats, storeStats, riderStats, userStats] =
      await Promise.all([
        this.ordersService.getAnalyticsSummary(),
        this.restaurantsService.countByApproval(),
        this.storesService.countByApproval(),
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
      stores: storeStats,
      riders: riderStats,
      users: userStats,
    };
  }

  /**
   * The sole real entry point for restaurant approval (docs/ROADMAP.md FDP-60) — lives here,
   * not on RestaurantsService, specifically because this check needs MenuService and
   * RestaurantsModule importing MenuModule would create a cycle (MenuModule already imports
   * RestaurantsModule). RestaurantsService.approve() still independently enforces the
   * compliance-document requirement regardless of caller; this method adds the one other
   * approval prerequisite — a menu with at least one item, so approving a restaurant never
   * hands customers an empty storefront — before delegating to it.
   */
  async approveRestaurant(id: string): Promise<RestaurantDocument> {
    const menu = await this.menuService.getMenu(id);
    const itemCount = menu.reduce(
      (total, category) => total + category.items.length,
      0,
    );
    if (itemCount === 0) {
      throw new BadRequestException(
        'This restaurant has no menu items yet — add at least one before approving',
      );
    }
    return this.restaurantsService.approve(id);
  }

  /**
   * Same split as approveRestaurant() above, and for the same reason — the "at least one
   * product" check needs ProductsService, and StoresModule importing ProductsModule would
   * create a cycle (docs/ROADMAP.md FDP-56).
   */
  async approveStore(id: string): Promise<StoreDocument> {
    const catalog = await this.productsService.getCatalog(id);
    if (catalog.products.length === 0) {
      throw new BadRequestException(
        'This store has no products yet — add at least one before approving',
      );
    }
    return this.storesService.approve(id);
  }
}
