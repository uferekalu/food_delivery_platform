import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { PromoCodesService } from './promo-codes.service';
import {
  PromoCode,
  PromoCodeDocument,
  PromoCodeSchema,
} from './schemas/promo-code.schema';

jest.setTimeout(30_000);

describe('PromoCodesService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let service: PromoCodesService;
  let promoCodeModel: Model<PromoCodeDocument>;

  beforeAll(async () => {
    // See backend/CLAUDE.md ("Testing") for why launchTimeout is set explicitly.
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: PromoCode.name, schema: PromoCodeSchema },
        ]),
      ],
      providers: [PromoCodesService],
    }).compile();

    service = moduleRef.get(PromoCodesService);
    promoCodeModel = moduleRef.get(getModelToken(PromoCode.name));
  }, 60_000);

  afterEach(async () => {
    await promoCodeModel.deleteMany({}).exec();
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  const restaurantId = '507f1f77bcf86cd799439011';
  const otherRestaurantId = '507f1f77bcf86cd799439012';

  it('rejects an unknown code', async () => {
    const result = await service.validate('NOPE', restaurantId, 50);
    expect(result).toEqual({ valid: false, reason: 'Invalid promo code' });
  });

  it('normalizes case when looking up a code', async () => {
    await service.create({
      code: 'welcome10',
      discountType: 'percentage',
      discountValue: 10,
    });
    const result = await service.validate('Welcome10', restaurantId, 50);
    expect(result.valid).toBe(true);
  });

  it('caps a percentage discount at maxDiscountAmount', async () => {
    await service.create({
      code: 'BIG50',
      discountType: 'percentage',
      discountValue: 50,
      maxDiscountAmount: 10,
    });
    const result = await service.validate('BIG50', restaurantId, 100); // 50% of 100 = 50, capped to 10
    expect(result).toMatchObject({ valid: true, discountAmount: 10 });
  });

  it('applies a fixed discount, capped at the subtotal', async () => {
    await service.create({
      code: 'FLAT20',
      discountType: 'fixed',
      discountValue: 20,
    });
    const smallOrder = await service.validate('FLAT20', restaurantId, 5);
    expect(smallOrder).toMatchObject({ valid: true, discountAmount: 5 }); // can't discount more than the order

    const bigOrder = await service.validate('FLAT20', restaurantId, 100);
    expect(bigOrder).toMatchObject({ valid: true, discountAmount: 20 });
  });

  it('rejects an order below minOrderAmount', async () => {
    await service.create({
      code: 'MIN30',
      discountType: 'fixed',
      discountValue: 5,
      minOrderAmount: 30,
    });
    const result = await service.validate('MIN30', restaurantId, 20);
    expect(result.valid).toBe(false);
  });

  it('rejects a code scoped to a different restaurant', async () => {
    await service.create({
      code: 'SCOPED',
      discountType: 'fixed',
      discountValue: 5,
      restaurantId: otherRestaurantId,
    });
    const result = await service.validate('SCOPED', restaurantId, 50);
    expect(result).toEqual({
      valid: false,
      reason: 'This promo code is not valid for this restaurant',
    });
  });

  it('accepts a restaurant-scoped code for the matching restaurant', async () => {
    await service.create({
      code: 'SCOPED2',
      discountType: 'fixed',
      discountValue: 5,
      restaurantId,
    });
    const result = await service.validate('SCOPED2', restaurantId, 50);
    expect(result.valid).toBe(true);
  });

  it('rejects an inactive code', async () => {
    await service.create({
      code: 'OFF',
      discountType: 'fixed',
      discountValue: 5,
      isActive: false,
    });
    const result = await service.validate('OFF', restaurantId, 50);
    expect(result.valid).toBe(false);
  });

  it('rejects an expired code', async () => {
    await service.create({
      code: 'EXPIRED',
      discountType: 'fixed',
      discountValue: 5,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const result = await service.validate('EXPIRED', restaurantId, 50);
    expect(result.valid).toBe(false);
  });

  it('rejects once usageLimit is reached, without redeem() being called', async () => {
    const promo = await service.create({
      code: 'ONCE',
      discountType: 'fixed',
      discountValue: 5,
      usageLimit: 1,
    });

    const beforeRedeem = await service.validate('ONCE', restaurantId, 50);
    expect(beforeRedeem.valid).toBe(true);

    await service.redeem(promo._id.toString());

    const afterRedeem = await service.validate('ONCE', restaurantId, 50);
    expect(afterRedeem).toEqual({
      valid: false,
      reason: 'This promo code has reached its usage limit',
    });
  });

  it('validate() alone does not increment usedCount', async () => {
    const promo = await service.create({
      code: 'READONLY',
      discountType: 'fixed',
      discountValue: 5,
    });
    await service.validate('READONLY', restaurantId, 50);
    await service.validate('READONLY', restaurantId, 50);
    const stored = await promoCodeModel.findById(promo._id).exec();
    expect(stored?.usedCount).toBe(0);
  });

  describe('update', () => {
    it('deactivates a code — a since-deactivated code then fails validate()', async () => {
      const promo = await service.create({
        code: 'DEACTIVATE',
        discountType: 'fixed',
        discountValue: 5,
      });

      const updated = await service.update(promo._id.toString(), {
        isActive: false,
      });
      expect(updated.isActive).toBe(false);

      const result = await service.validate('DEACTIVATE', restaurantId, 50);
      expect(result).toEqual({
        valid: false,
        reason: 'This promo code is no longer active',
      });
    });

    it('leaves fields not present in the DTO untouched', async () => {
      const promo = await service.create({
        code: 'PARTIAL',
        discountType: 'fixed',
        discountValue: 5,
        usageLimit: 10,
      });

      const updated = await service.update(promo._id.toString(), {
        discountValue: 8,
      });
      expect(updated.discountValue).toBe(8);
      expect(updated.usageLimit).toBe(10);
    });

    it('throws NotFoundException for an unknown id', async () => {
      await expect(
        service.update('507f1f77bcf86cd799439099', { isActive: false }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
