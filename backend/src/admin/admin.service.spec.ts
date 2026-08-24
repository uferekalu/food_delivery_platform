import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { OrdersService } from '../orders/orders.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { RidersService } from '../riders/riders.service';
import { UsersService } from '../users/users.service';

describe('AdminService', () => {
  let service: AdminService;
  let ordersService: jest.Mocked<Pick<OrdersService, 'getAnalyticsSummary'>>;
  let restaurantsService: jest.Mocked<
    Pick<RestaurantsService, 'countByApproval'>
  >;
  let ridersService: jest.Mocked<Pick<RidersService, 'countByVerification'>>;
  let usersService: jest.Mocked<Pick<UsersService, 'countByRole'>>;

  beforeEach(async () => {
    ordersService = { getAnalyticsSummary: jest.fn() };
    restaurantsService = { countByApproval: jest.fn() };
    ridersService = { countByVerification: jest.fn() };
    usersService = { countByRole: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: OrdersService, useValue: ordersService },
        { provide: RestaurantsService, useValue: restaurantsService },
        { provide: RidersService, useValue: ridersService },
        { provide: UsersService, useValue: usersService },
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
      riders: { verified: 2, pending: 1 },
      users: { customer: 20, restaurant_owner: 3, rider: 3, admin: 1 },
    });
  });
});
