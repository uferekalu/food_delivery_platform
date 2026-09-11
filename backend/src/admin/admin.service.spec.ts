import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { OrdersService } from '../orders/orders.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { RidersService } from '../riders/riders.service';
import { UsersService } from '../users/users.service';
import { MenuService } from '../menu/menu.service';
import { StoresService } from '../stores/stores.service';
import { ProductsService } from '../stores/products.service';
import { AdCampaignsService } from '../ad-campaigns/ad-campaigns.service';

describe('AdminService', () => {
  let service: AdminService;
  let ordersService: jest.Mocked<
    Pick<OrdersService, 'getAnalyticsSummary' | 'findAllForAdmin'>
  >;
  let restaurantsService: jest.Mocked<
    Pick<RestaurantsService, 'countByApproval' | 'approve'>
  >;
  let ridersService: jest.Mocked<Pick<RidersService, 'countByVerification'>>;
  let usersService: jest.Mocked<Pick<UsersService, 'countByRole'>>;
  let menuService: jest.Mocked<Pick<MenuService, 'getMenu'>>;
  let storesService: jest.Mocked<
    Pick<StoresService, 'approve' | 'countByApproval'>
  >;
  let productsService: jest.Mocked<Pick<ProductsService, 'getCatalog'>>;
  let adCampaignsService: jest.Mocked<
    Pick<AdCampaignsService, 'findAllForAdminPaginated'>
  >;

  beforeEach(async () => {
    ordersService = { getAnalyticsSummary: jest.fn(), findAllForAdmin: jest.fn() };
    restaurantsService = { countByApproval: jest.fn(), approve: jest.fn() };
    ridersService = { countByVerification: jest.fn() };
    usersService = { countByRole: jest.fn() };
    menuService = { getMenu: jest.fn() };
    storesService = { approve: jest.fn(), countByApproval: jest.fn() };
    productsService = { getCatalog: jest.fn() };
    adCampaignsService = { findAllForAdminPaginated: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: OrdersService, useValue: ordersService },
        { provide: RestaurantsService, useValue: restaurantsService },
        { provide: RidersService, useValue: ridersService },
        { provide: UsersService, useValue: usersService },
        { provide: MenuService, useValue: menuService },
        { provide: StoresService, useValue: storesService },
        { provide: ProductsService, useValue: productsService },
        { provide: AdCampaignsService, useValue: adCampaignsService },
      ],
    }).compile();

    service = moduleRef.get(AdminService);
  });

  it("composes every domain service's summary into one analytics payload", async () => {
    ordersService.getAnalyticsSummary.mockResolvedValue({
      totalOrders: 10,
      ordersByStatus: { DELIVERED: 5 } as never,
      revenueByCurrency: { NGN: 1000 },
    });
    restaurantsService.countByApproval.mockResolvedValue({
      approved: 3,
      pending: 1,
    });
    storesService.countByApproval.mockResolvedValue({
      approved: 4,
      pending: 2,
    });
    ridersService.countByVerification.mockResolvedValue({
      verified: 2,
      pending: 1,
    });
    usersService.countByRole.mockResolvedValue({
      customer: 20,
      restaurant_owner: 3,
      rider: 3,
      admin: 1,
    });

    const analytics = await service.getAnalytics();

    expect(analytics).toEqual({
      orders: {
        total: 10,
        byStatus: { DELIVERED: 5 },
        revenueByCurrency: { NGN: 1000 },
      },
      restaurants: { approved: 3, pending: 1 },
      stores: { approved: 4, pending: 2 },
      riders: { verified: 2, pending: 1 },
      users: { customer: 20, restaurant_owner: 3, rider: 3, admin: 1 },
    });
  });

  describe('approveRestaurant (FDP-60)', () => {
    it('rejects approval when the restaurant has no menu items', async () => {
      menuService.getMenu.mockResolvedValue([
        { _id: 'cat-1', items: [] } as never,
      ]);

      await expect(service.approveRestaurant('restaurant-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(restaurantsService.approve).not.toHaveBeenCalled();
    });

    it('delegates to RestaurantsService.approve once the menu has at least one item', async () => {
      menuService.getMenu.mockResolvedValue([
        { _id: 'cat-1', items: [{ _id: 'item-1' }] } as never,
      ]);
      restaurantsService.approve.mockResolvedValue({
        isApproved: true,
      } as never);

      const result = await service.approveRestaurant('restaurant-1');

      expect(restaurantsService.approve).toHaveBeenCalledWith('restaurant-1');
      expect(result).toEqual({ isApproved: true });
    });
  });

  describe('approveStore (FDP-56)', () => {
    it('rejects approval when the store has no products', async () => {
      productsService.getCatalog.mockResolvedValue({
        categories: [],
        products: [],
      });

      await expect(service.approveStore('store-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(storesService.approve).not.toHaveBeenCalled();
    });

    it('delegates to StoresService.approve once the catalog has at least one product', async () => {
      productsService.getCatalog.mockResolvedValue({
        categories: [{ _id: 'cat-1' }],
        products: [{ _id: 'product-1' }],
      } as never);
      storesService.approve.mockResolvedValue({ isApproved: true } as never);

      const result = await service.approveStore('store-1');

      expect(storesService.approve).toHaveBeenCalledWith('store-1');
      expect(result).toEqual({ isApproved: true });
    });
  });

  describe('getOrderTransactions / getAdCampaignTransactions (docs/ROADMAP.md FDP-128)', () => {
    it('delegates order transactions to OrdersService.findAllForAdmin with the query as-is', async () => {
      const paginated = {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
        totalsByCurrency: {},
      };
      ordersService.findAllForAdmin.mockResolvedValue(paginated as never);

      const query = { vendorType: 'restaurant' as const, page: 2, limit: 10 };
      const result = await service.getOrderTransactions(query);

      expect(ordersService.findAllForAdmin).toHaveBeenCalledWith(query);
      expect(result).toBe(paginated);
    });

    it('delegates ad-campaign transactions to AdCampaignsService.findAllForAdminPaginated with the query as-is', async () => {
      const paginated = {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
        totalsByCurrency: {},
      };
      adCampaignsService.findAllForAdminPaginated.mockResolvedValue(
        paginated as never,
      );

      const query = { from: '2026-01-01', page: 1, limit: 20 };
      const result = await service.getAdCampaignTransactions(query);

      expect(adCampaignsService.findAllForAdminPaginated).toHaveBeenCalledWith(
        query,
      );
      expect(result).toBe(paginated);
    });
  });
});
