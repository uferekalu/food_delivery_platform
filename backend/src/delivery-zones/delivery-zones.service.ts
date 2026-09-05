import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Types } from 'mongoose';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { StoresService } from '../stores/stores.service';
import type { Address } from '../common/schemas/address.schema';
import { haversineDistanceKm } from '../common/utils/geo';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  DeliveryZone,
  DeliveryZoneDocument,
} from './schemas/delivery-zone.schema';
import { CreateDeliveryZoneDto } from './dto/create-delivery-zone.dto';
import { UpdateDeliveryZoneDto } from './dto/update-delivery-zone.dto';

export type DeliveryZoneSellerType = 'restaurant' | 'store';

// A minimal structural shape both RestaurantDocument and StoreDocument already satisfy — lets
// calculateFee accept either without a restaurant-specific type (docs/ROADMAP.md FDP-90).
export interface DeliveryZoneSeller {
  _id: Types.ObjectId;
  address: Address;
}

// Fallback used whenever real distance can't be computed (the seller or delivery address is
// missing lat/lng, or no zone covers the computed distance) — same flat rate FDP-11 shipped
// with, kept so checkout never breaks for an unzoned/ungeocoded address.
export const FALLBACK_DELIVERY_FEE_RATE = 0.1;

// Same fix as OrdersService's round2 (docs/ROADMAP.md FDP-65) — `+ Number.EPSILON` before
// rounding corrects IEEE-754 double-precision cases (e.g. 1.5 * 0.15 === 0.22499999999999998)
// that a plain `Math.round(value * 100) / 100` silently rounds down a full cent.
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class DeliveryZonesService {
  constructor(
    @InjectModel(DeliveryZone.name)
    private readonly zoneModel: Model<DeliveryZoneDocument>,
    private readonly restaurantsService: RestaurantsService,
    private readonly storesService: StoresService,
  ) {}

  // `restaurantId`/`storeId` fields store as plain strings, not real ObjectId instances, under
  // this project's Mongoose 9 setup (see backend/CLAUDE.md's "Stack specifics" note) — always
  // filter with the string id, never a raw ObjectId.
  private sellerFilter(
    sellerType: DeliveryZoneSellerType,
    sellerId: string,
  ): Record<string, string> {
    return sellerType === 'restaurant'
      ? { restaurantId: sellerId }
      : { storeId: sellerId };
  }

  async list(
    sellerType: DeliveryZoneSellerType,
    sellerId: string,
    requester: AccessTokenPayload,
  ): Promise<DeliveryZoneDocument[]> {
    await this.assertOwnership(sellerType, sellerId, requester);
    return this.zoneModel
      .find(this.sellerFilter(sellerType, sellerId))
      .sort({ maxDistanceKm: 1 })
      .exec();
  }

  async create(
    sellerType: DeliveryZoneSellerType,
    sellerId: string,
    requester: AccessTokenPayload,
    dto: CreateDeliveryZoneDto,
  ): Promise<DeliveryZoneDocument> {
    await this.assertOwnership(sellerType, sellerId, requester);
    return this.zoneModel.create({
      ...dto,
      ...this.sellerFilter(sellerType, sellerId),
    });
  }

  async update(
    sellerType: DeliveryZoneSellerType,
    sellerId: string,
    zoneId: string,
    requester: AccessTokenPayload,
    dto: UpdateDeliveryZoneDto,
  ): Promise<DeliveryZoneDocument> {
    await this.assertOwnership(sellerType, sellerId, requester);
    const zone = await this.findOrThrow(sellerType, sellerId, zoneId);
    Object.assign(zone, dto);
    return zone.save();
  }

  async delete(
    sellerType: DeliveryZoneSellerType,
    sellerId: string,
    zoneId: string,
    requester: AccessTokenPayload,
  ): Promise<void> {
    await this.assertOwnership(sellerType, sellerId, requester);
    await this.findOrThrow(sellerType, sellerId, zoneId);
    await this.zoneModel
      .deleteOne({ _id: zoneId, ...this.sellerFilter(sellerType, sellerId) })
      .exec();
  }

  /**
   * Real distance-based delivery fee: `zone.baseFee + zone.perKmFee * distanceKm` for the
   * first active zone (ordered nearest-first) whose `maxDistanceKm` covers the haversine
   * distance between the seller and the delivery address. Falls back to a flat percentage
   * of the subtotal when either coordinate is missing or no zone covers the distance, so
   * checkout never breaks for a seller/address without usable geo data. Works identically for
   * a restaurant or a store (docs/ROADMAP.md FDP-90) — `seller` only needs `_id`/`address`.
   */
  async calculateFee(
    sellerType: DeliveryZoneSellerType,
    seller: DeliveryZoneSeller,
    deliveryAddress: Address,
    subtotal: number,
  ): Promise<number> {
    const sellerCoords = this.coordsOf(seller.address);
    const customerCoords = this.coordsOf(deliveryAddress);

    if (sellerCoords && customerCoords) {
      const distanceKm = haversineDistanceKm(sellerCoords, customerCoords);
      const zones = await this.zoneModel
        .find({
          ...this.sellerFilter(sellerType, seller._id.toString()),
          isActive: true,
        })
        .sort({ maxDistanceKm: 1 })
        .exec();
      const zone = zones.find((z) => distanceKm <= z.maxDistanceKm);
      if (zone) {
        return round2(zone.baseFee + zone.perKmFee * distanceKm);
      }
    }

    return round2(subtotal * FALLBACK_DELIVERY_FEE_RATE);
  }

  private coordsOf(address: Address): { lat: number; lng: number } | null {
    if (address.lat == null || address.lng == null) return null;
    return { lat: address.lat, lng: address.lng };
  }

  private async findOrThrow(
    sellerType: DeliveryZoneSellerType,
    sellerId: string,
    zoneId: string,
  ): Promise<DeliveryZoneDocument> {
    const zone = await this.zoneModel
      .findOne({ _id: zoneId, ...this.sellerFilter(sellerType, sellerId) })
      .exec();
    if (!zone) throw new NotFoundException('Delivery zone not found');
    return zone;
  }

  private async assertOwnership(
    sellerType: DeliveryZoneSellerType,
    sellerId: string,
    requester: AccessTokenPayload,
  ): Promise<void> {
    if (sellerType === 'restaurant') {
      const restaurant =
        await this.restaurantsService.findByIdOrThrow(sellerId);
      this.restaurantsService.assertOwnerOrAdmin(restaurant, requester);
    } else {
      const store = await this.storesService.findByIdOrThrow(sellerId);
      this.storesService.assertOwnerOrAdmin(store, requester);
    }
  }
}
