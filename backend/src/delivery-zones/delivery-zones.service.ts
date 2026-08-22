import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RestaurantsService } from '../restaurants/restaurants.service';
import type { RestaurantDocument } from '../restaurants/schemas/restaurant.schema';
import type { Address } from '../common/schemas/address.schema';
import { haversineDistanceKm } from '../common/utils/geo';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { DeliveryZone, DeliveryZoneDocument } from './schemas/delivery-zone.schema';
import { CreateDeliveryZoneDto } from './dto/create-delivery-zone.dto';
import { UpdateDeliveryZoneDto } from './dto/update-delivery-zone.dto';

// Fallback used whenever real distance can't be computed (restaurant or delivery address is
// missing lat/lng, or no zone covers the computed distance) — same flat rate FDP-11 shipped
// with, kept so checkout never breaks for an unzoned/ungeocoded address.
export const FALLBACK_DELIVERY_FEE_RATE = 0.1;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class DeliveryZonesService {
  constructor(
    @InjectModel(DeliveryZone.name)
    private readonly zoneModel: Model<DeliveryZoneDocument>,
    private readonly restaurantsService: RestaurantsService,
  ) {}

  async list(
    restaurantId: string,
    requester: AccessTokenPayload,
  ): Promise<DeliveryZoneDocument[]> {
    await this.assertOwnership(restaurantId, requester);
    return this.zoneModel
      .find({ restaurantId })
      .sort({ maxDistanceKm: 1 })
      .exec();
  }

  async create(
    restaurantId: string,
    requester: AccessTokenPayload,
    dto: CreateDeliveryZoneDto,
  ): Promise<DeliveryZoneDocument> {
    await this.assertOwnership(restaurantId, requester);
    return this.zoneModel.create({ ...dto, restaurantId });
  }

  async update(
    restaurantId: string,
    zoneId: string,
    requester: AccessTokenPayload,
    dto: UpdateDeliveryZoneDto,
  ): Promise<DeliveryZoneDocument> {
    await this.assertOwnership(restaurantId, requester);
    const zone = await this.findOrThrow(restaurantId, zoneId);
    Object.assign(zone, dto);
    return zone.save();
  }

  async delete(
    restaurantId: string,
    zoneId: string,
    requester: AccessTokenPayload,
  ): Promise<void> {
    await this.assertOwnership(restaurantId, requester);
    await this.findOrThrow(restaurantId, zoneId);
    await this.zoneModel.deleteOne({ _id: zoneId, restaurantId }).exec();
  }

  /**
   * Real distance-based delivery fee: `zone.baseFee + zone.perKmFee * distanceKm` for the
   * first active zone (ordered nearest-first) whose `maxDistanceKm` covers the haversine
   * distance between the restaurant and the delivery address. Falls back to a flat percentage
   * of the subtotal when either coordinate is missing or no zone covers the distance, so
   * checkout never breaks for a restaurant/address without usable geo data.
   */
  async calculateFee(
    restaurant: RestaurantDocument,
    deliveryAddress: Address,
    subtotal: number,
  ): Promise<number> {
    const restaurantCoords = this.coordsOf(restaurant.address);
    const customerCoords = this.coordsOf(deliveryAddress);

    if (restaurantCoords && customerCoords) {
      const distanceKm = haversineDistanceKm(restaurantCoords, customerCoords);
      // `restaurant._id` is a real ObjectId instance — the rest of this codebase always
      // queries/compares ref fields via `.toString()` (see backend/CLAUDE.md's ownership
      // pattern), never a raw ObjectId, because `@Prop({ type: Types.ObjectId })` fields end up
      // stored as plain strings under this Mongoose version (`Types.ObjectId !==
      // Schema.Types.ObjectId` as of Mongoose 9) — passing the ObjectId instance directly here
      // silently matched zero documents.
      const zones = await this.zoneModel
        .find({ restaurantId: restaurant._id.toString(), isActive: true })
        .sort({ maxDistanceKm: 1 })
        .exec();
      const zone = zones.find((z) => distanceKm <= z.maxDistanceKm);
      if (zone) {
        return round2(zone.baseFee + zone.perKmFee * distanceKm);
      }
    }

    return round2(subtotal * FALLBACK_DELIVERY_FEE_RATE);
  }

  private coordsOf(
    address: Address,
  ): { lat: number; lng: number } | null {
    if (address.lat == null || address.lng == null) return null;
    return { lat: address.lat, lng: address.lng };
  }

  private async findOrThrow(
    restaurantId: string,
    zoneId: string,
  ): Promise<DeliveryZoneDocument> {
    const zone = await this.zoneModel
      .findOne({ _id: zoneId, restaurantId })
      .exec();
    if (!zone) throw new NotFoundException('Delivery zone not found');
    return zone;
  }

  private async assertOwnership(
    restaurantId: string,
    requester: AccessTokenPayload,
  ): Promise<void> {
    const restaurant =
      await this.restaurantsService.findByIdOrThrow(restaurantId);
    this.restaurantsService.assertOwnerOrAdmin(restaurant, requester);
  }
}
