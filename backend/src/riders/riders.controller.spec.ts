import { Test, TestingModule } from '@nestjs/testing';
import { RidersController } from './riders.controller';
import { RidersService } from './riders.service';
import { OrdersService } from '../orders/orders.service';

/** `queue()`'s PII-redaction fix (docs/ROADMAP.md FDP-109) — an unverified, self-promoted rider
 * could previously read every unassigned order's full delivery address and customer id just by
 * applying (`RidersService.apply` grants the `rider` role immediately; verification is a
 * separate admin step). The queue stays visible either way (a deliberate product choice, see
 * `RidersService.assertVerified`'s doc comment), but only a verified rider sees the real address. */
describe('RidersController.queue (docs/ROADMAP.md FDP-109)', () => {
  let controller: RidersController;
  let ridersService: { findMine: jest.Mock };
  let ordersService: { findUnassignedForRiders: jest.Mock };

  const order = {
    toObject: () => ({
      _id: 'order-1',
      orderNumber: 'ORD-1',
      customerId: 'customer-1',
      deliveryAddress: {
        line1: '221B Baker Street',
        city: 'Lagos',
        state: 'Lagos',
        lat: 6.5,
        lng: 3.4,
      },
      deliveryFee: 15,
    }),
    deliveryAddress: { city: 'Lagos', state: 'Lagos' },
  };

  beforeEach(async () => {
    ridersService = { findMine: jest.fn() };
    ordersService = {
      findUnassignedForRiders: jest.fn().mockResolvedValue([order]),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [RidersController],
      providers: [
        { provide: RidersService, useValue: ridersService },
        { provide: OrdersService, useValue: ordersService },
      ],
    }).compile();

    controller = moduleRef.get(RidersController);
  });

  it('returns the full order (including exact address and customerId) to a verified rider', async () => {
    ridersService.findMine.mockResolvedValue({ isVerified: true });

    const result = await controller.queue({
      sub: 'rider-1',
      email: 'r@example.com',
      role: 'rider',
    });

    expect(result).toEqual([order]);
  });

  it('redacts the delivery address to city/state and strips customerId for an unverified rider', async () => {
    ridersService.findMine.mockResolvedValue({ isVerified: false });

    const result = await controller.queue({
      sub: 'rider-1',
      email: 'r@example.com',
      role: 'rider',
    });

    expect(result).toEqual([
      expect.objectContaining({
        orderNumber: 'ORD-1',
        deliveryFee: 15,
        deliveryAddress: { city: 'Lagos', state: 'Lagos' },
      }),
    ]);
    expect(
      (result[0] as { deliveryAddress: object }).deliveryAddress,
    ).not.toHaveProperty('line1');
    expect(
      (result[0] as { deliveryAddress: object }).deliveryAddress,
    ).not.toHaveProperty('lat');
    // Set to `undefined` (not deleted) — an object literal spread-then-override, same as the
    // controller's own shape; JSON.stringify (the real HTTP response) drops an `undefined`
    // property either way, so this is checking the value, not key presence.
    expect((result[0] as { customerId?: string }).customerId).toBeUndefined();
  });
});
