import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { RealtimeGateway } from './realtime.gateway';
import { Order } from '../orders/schemas/order.schema';
import { Restaurant } from '../restaurants/schemas/restaurant.schema';

function fakeSocket() {
  return {
    handshake: { auth: {} as Record<string, unknown> },
    data: {} as Record<string, unknown>,
    disconnect: jest.fn(),
    join: jest.fn(),
  };
}

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let jwtService: { verifyAsync: jest.Mock };
  let orderModel: { findById: jest.Mock };
  let restaurantModel: { findById: jest.Mock };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    orderModel = { findById: jest.fn() };
    restaurantModel = { findById: jest.fn() };

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

  describe('emitOrderStatusChanged', () => {
    it('emits to both the order room and the restaurant room', () => {
      const order = {
        _id: { toString: () => 'order-1' },
        restaurantId: { toString: () => 'restaurant-1' },
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
  });
});
