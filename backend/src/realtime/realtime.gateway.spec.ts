import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { RealtimeGateway } from './realtime.gateway';
import { Order } from '../orders/schemas/order.schema';
import { Restaurant } from '../restaurants/schemas/restaurant.schema';
import { Store } from '../stores/schemas/store.schema';

function fakeSocket() {
  return {
    handshake: { auth: {} as Record<string, unknown> },
    data: {} as Record<string, unknown>,
    disconnect: jest.fn(),
    join: jest.fn(),
  };
}

function fakeOrderQuery(orders: { _id: { toString(): string } }[]) {
  return { select: () => ({ exec: () => Promise.resolve(orders) }) };
}

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let jwtService: { verifyAsync: jest.Mock };
  let orderModel: { findById: jest.Mock; find: jest.Mock };
  let restaurantModel: { findById: jest.Mock };
  let storeModel: { findById: jest.Mock };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    orderModel = { findById: jest.fn(), find: jest.fn() };
    restaurantModel = { findById: jest.fn() };
    storeModel = { findById: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'test-secret' },
        },
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: getModelToken(Restaurant.name), useValue: restaurantModel },
        { provide: getModelToken(Store.name), useValue: storeModel },
      ],
    }).compile();

    gateway = moduleRef.get(RealtimeGateway);
    gateway.server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    } as never;
  });

  describe('handleConnection', () => {
    it('disconnects a client with no token', async () => {
      const client = fakeSocket();
      await gateway.handleConnection(client as never);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects a client with an invalid token', async () => {
      const client = fakeSocket();
      client.handshake.auth.token = 'garbage';
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));

      await gateway.handleConnection(client as never);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('attaches the verified payload for a valid token', async () => {
      const client = fakeSocket();
      client.handshake.auth.token = 'valid';
      const payload = { sub: 'user-1', email: 'a@b.com', role: 'customer' };
      jwtService.verifyAsync.mockResolvedValue(payload);

      await gateway.handleConnection(client as never);
      expect(client.data.user).toEqual(payload);
      expect(client.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('handleOrderSubscribe', () => {
    it('joins the room when the caller owns the order', async () => {
      const client = fakeSocket();
      client.data.user = { sub: 'customer-1', role: 'customer' };
      orderModel.findById.mockReturnValue({
        select: () => ({
          exec: () =>
            Promise.resolve({ customerId: { toString: () => 'customer-1' } }),
        }),
      });

      await gateway.handleOrderSubscribe(client as never, {
        orderId: 'order-1',
      });
      expect(client.join).toHaveBeenCalledWith('order:order-1');
    });

    it('does not join when the caller is a different customer', async () => {
      const client = fakeSocket();
      client.data.user = { sub: 'customer-2', role: 'customer' };
      orderModel.findById.mockReturnValue({
        select: () => ({
          exec: () =>
            Promise.resolve({ customerId: { toString: () => 'customer-1' } }),
        }),
      });

      await gateway.handleOrderSubscribe(client as never, {
        orderId: 'order-1',
      });
      expect(client.join).not.toHaveBeenCalled();
    });

    it('lets an admin join any order room', async () => {
      const client = fakeSocket();
      client.data.user = { sub: 'admin-1', role: 'admin' };
      orderModel.findById.mockReturnValue({
        select: () => ({
          exec: () =>
            Promise.resolve({ customerId: { toString: () => 'customer-1' } }),
        }),
      });

      await gateway.handleOrderSubscribe(client as never, {
        orderId: 'order-1',
      });
      expect(client.join).toHaveBeenCalledWith('order:order-1');
    });
  });

  describe('handleRestaurantSubscribe', () => {
    it('joins the room when the caller owns the restaurant', async () => {
      const client = fakeSocket();
      client.data.user = { sub: 'owner-1', role: 'restaurant_owner' };
      restaurantModel.findById.mockReturnValue({
        select: () => ({
          exec: () =>
            Promise.resolve({ ownerId: { toString: () => 'owner-1' } }),
        }),
      });

      await gateway.handleRestaurantSubscribe(client as never, {
        restaurantId: 'r-1',
      });
      expect(client.join).toHaveBeenCalledWith('restaurant:r-1');
    });

    it('does not join when the caller does not own the restaurant', async () => {
      const client = fakeSocket();
      client.data.user = { sub: 'intruder', role: 'restaurant_owner' };
      restaurantModel.findById.mockReturnValue({
        select: () => ({
          exec: () =>
            Promise.resolve({ ownerId: { toString: () => 'owner-1' } }),
        }),
      });

      await gateway.handleRestaurantSubscribe(client as never, {
        restaurantId: 'r-1',
      });
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('handleStoreSubscribe', () => {
    it('joins the room when the caller owns the store', async () => {
      const client = fakeSocket();
      client.data.user = { sub: 'owner-1', role: 'restaurant_owner' };
      storeModel.findById.mockReturnValue({
        select: () => ({
          exec: () =>
            Promise.resolve({ ownerId: { toString: () => 'owner-1' } }),
        }),
      });

      await gateway.handleStoreSubscribe(client as never, { storeId: 's-1' });
      expect(client.join).toHaveBeenCalledWith('store:s-1');
    });

    it('does not join when the caller does not own the store', async () => {
      const client = fakeSocket();
      client.data.user = { sub: 'intruder', role: 'restaurant_owner' };
      storeModel.findById.mockReturnValue({
        select: () => ({
          exec: () =>
            Promise.resolve({ ownerId: { toString: () => 'owner-1' } }),
        }),
      });

      await gateway.handleStoreSubscribe(client as never, { storeId: 's-1' });
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('handleRiderLocation', () => {
    it("broadcasts to every one of the rider's active-delivery order rooms", async () => {
      const client = fakeSocket();
      client.data.user = { sub: 'rider-1', role: 'rider' };
      orderModel.find.mockReturnValue(
        fakeOrderQuery([
          { _id: { toString: () => 'order-1' } },
          { _id: { toString: () => 'order-2' } },
        ]),
      );

      await gateway.handleRiderLocation(client as never, {
        lat: 6.5,
        lng: 3.4,
      });

      expect(orderModel.find).toHaveBeenCalledWith({
        riderId: 'rider-1',
        status: { $in: ['ASSIGNED_TO_RIDER', 'PICKED_UP', 'OUT_FOR_DELIVERY'] },
      });
      expect(gateway.server.to).toHaveBeenCalledWith('order:order-1');
      expect(gateway.server.to).toHaveBeenCalledWith('order:order-2');
      expect(gateway.server.emit).toHaveBeenCalledWith(
        'order:riderLocation',
        expect.objectContaining({ lat: 6.5, lng: 3.4 }),
      );
    });

    it('does nothing for a non-rider', async () => {
      const client = fakeSocket();
      client.data.user = { sub: 'customer-1', role: 'customer' };

      await gateway.handleRiderLocation(client as never, {
        lat: 6.5,
        lng: 3.4,
      });

      expect(orderModel.find).not.toHaveBeenCalled();
      expect(gateway.server.emit).not.toHaveBeenCalled();
    });

    it('does nothing when lat/lng are missing or malformed', async () => {
      const client = fakeSocket();
      client.data.user = { sub: 'rider-1', role: 'rider' };

      await gateway.handleRiderLocation(client as never, {});
      await gateway.handleRiderLocation(client as never, {
        lat: 'oops' as never,
        lng: 3.4,
      });

      expect(orderModel.find).not.toHaveBeenCalled();
    });

    it('queries but never emits when the rider has no active deliveries', async () => {
      const client = fakeSocket();
      client.data.user = { sub: 'rider-1', role: 'rider' };
      orderModel.find.mockReturnValue(fakeOrderQuery([]));

      await gateway.handleRiderLocation(client as never, {
        lat: 6.5,
        lng: 3.4,
      });

      expect(orderModel.find).toHaveBeenCalled();
      expect(gateway.server.emit).not.toHaveBeenCalled();
    });
  });

  describe('emitOrderStatusChanged', () => {
    it('emits to both the order room and the restaurant room for a restaurant order', () => {
      const order = {
        _id: { toString: () => 'order-1' },
        sellerType: 'restaurant',
        restaurantId: { toString: () => 'restaurant-1' },
        storeId: null,
      };

      gateway.emitOrderStatusChanged(order as never);

      expect(gateway.server.to).toHaveBeenCalledWith('order:order-1');
      expect(gateway.server.to).toHaveBeenCalledWith('restaurant:restaurant-1');
      expect(gateway.server.emit).toHaveBeenCalledWith(
        'order:statusChanged',
        order,
      );
      expect(gateway.server.emit).toHaveBeenCalledWith(
        'restaurant:orderUpdated',
        order,
      );
    });

    it('emits to both the order room and the store room for a store order (FDP-56)', () => {
      const order = {
        _id: { toString: () => 'order-1' },
        sellerType: 'store',
        restaurantId: null,
        storeId: { toString: () => 'store-1' },
      };

      gateway.emitOrderStatusChanged(order as never);

      expect(gateway.server.to).toHaveBeenCalledWith('order:order-1');
      expect(gateway.server.to).toHaveBeenCalledWith('store:store-1');
      expect(gateway.server.emit).toHaveBeenCalledWith(
        'order:statusChanged',
        order,
      );
      expect(gateway.server.emit).toHaveBeenCalledWith(
        'store:orderUpdated',
        order,
      );
    });
  });
});
