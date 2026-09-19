import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrdersService } from '../orders/orders.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { StoresService } from '../stores/stores.service';
import { RidersService } from '../riders/riders.service';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import type { PaginatedResult } from '../restaurants/restaurants.service';
import { Review, ReviewDocument } from './schemas/review.schema';
import type { ReviewTargetType } from './schemas/review.schema';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    private readonly ordersService: OrdersService,
    private readonly restaurantsService: RestaurantsService,
    private readonly storesService: StoresService,
    private readonly ridersService: RidersService,
  ) {}

  /**
   * `targetId` is always derived from the order server-side, never taken from the client —
   * otherwise a customer could rate a restaurant/rider they never actually ordered from.
   * `OrdersService.findOne` already enforces "the caller owns this order" (404/403 otherwise),
   * so reusing it here gets that check for free instead of re-implementing it.
   */
  async create(
    requester: AccessTokenPayload,
    dto: CreateReviewDto,
  ): Promise<ReviewDocument> {
    const order = await this.ordersService.findOne(requester.sub, dto.orderId);
    if (order.status !== 'DELIVERED') {
      throw new BadRequestException(
        'You can only review an order after it has been delivered',
      );
    }

    let targetId: string;
    if (dto.targetType === 'restaurant') {
      // A store order has no restaurant to review — a clear rejection rather than a crash on a
      // null restaurantId.
      if (!order.restaurantId) {
        throw new BadRequestException(
          'This order was not placed with a restaurant',
        );
      }
      targetId = order.restaurantId.toString();
    } else if (dto.targetType === 'store') {
      // docs/ROADMAP.md FDP-136 — the store-review counterpart of the restaurant branch above.
      if (!order.storeId) {
        throw new BadRequestException('This order was not placed with a store');
      }
      targetId = order.storeId.toString();
    } else {
      if (!order.riderId) {
        throw new BadRequestException(
          'This order was not delivered by a rider',
        );
      }
      targetId = order.riderId.toString();
    }

    const existing = await this.reviewModel
      .findOne({ orderId: dto.orderId, targetType: dto.targetType })
      .exec();
    if (existing) {
      throw new BadRequestException(
        `You already reviewed the ${dto.targetType} for this order`,
      );
    }

    const review = await this.reviewModel.create({
      targetType: dto.targetType,
      targetId,
      orderId: dto.orderId,
      authorId: requester.sub,
      rating: dto.rating,
      comment: dto.comment?.trim() ?? '',
      images: dto.images ?? [],
    });

    await this.recomputeTargetRating(dto.targetType, targetId);
    return review;
  }

  findForTarget(
    query: ListReviewsDto,
  ): Promise<PaginatedResult<ReviewDocument>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter = { targetType: query.targetType, targetId: query.targetId };

    return Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('authorId', 'name avatarUrl')
        .exec(),
      this.reviewModel.countDocuments(filter).exec(),
    ]).then(([items, total]) => ({
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    }));
  }

  /** Which target types the caller can still review for this order — false once already
   * reviewed, or if the order isn't eligible at all (not delivered / had no rider / the
   * restaurant-vs-store leg that doesn't apply to this order). Exactly one of
   * `restaurant`/`store` can ever be true for a given order (docs/ROADMAP.md FDP-136) — before
   * this fix, `restaurant` was computed purely from "does a restaurant review already exist for
   * this order", which is vacuously true (no review, so `true`) for every store order too,
   * since a store order's `restaurantId` was never checked — the frontend then rendered a
   * "Rate this restaurant" form on a delivered grocery/pharmacy order that would always be
   * rejected server-side if actually submitted. */
  async getEligibility(
    requester: AccessTokenPayload,
    orderId: string,
  ): Promise<{ restaurant: boolean; store: boolean; rider: boolean }> {
    const order = await this.ordersService.findOne(requester.sub, orderId);
    if (order.status !== 'DELIVERED') {
      return { restaurant: false, store: false, rider: false };
    }

    const [restaurantReview, storeReview, riderReview] = await Promise.all([
      order.restaurantId
        ? this.reviewModel.findOne({ orderId, targetType: 'restaurant' }).exec()
        : null,
      order.storeId
        ? this.reviewModel.findOne({ orderId, targetType: 'store' }).exec()
        : null,
      order.riderId
        ? this.reviewModel.findOne({ orderId, targetType: 'rider' }).exec()
        : null,
    ]);

    return {
      restaurant: !!order.restaurantId && !restaurantReview,
      store: !!order.storeId && !storeReview,
      rider: !!order.riderId && !riderReview,
    };
  }

  private async recomputeTargetRating(
    targetType: ReviewTargetType,
    targetId: string,
  ): Promise<void> {
    const [stats] = await this.reviewModel
      .aggregate<{ avg: number; count: number }>([
        // `targetId` is stored as a plain string, not a real ObjectId, under this Mongoose
        // version — see the "Mongoose 9 ObjectId Quirk" note; matching the string directly
        // (not wrapping in `new Types.ObjectId(...)`) is what actually finds these documents.
        { $match: { targetType, targetId } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
      ])
      .exec();

    const avgRating = stats ? round1(stats.avg) : 0;
    const reviewCount = stats ? stats.count : 0;

    if (targetType === 'restaurant') {
      await this.restaurantsService.updateRatingStats(
        targetId,
        avgRating,
        reviewCount,
      );
    } else if (targetType === 'store') {
      await this.storesService.updateRatingStats(
        targetId,
        avgRating,
        reviewCount,
      );
    } else {
      await this.ridersService.updateRatingStats(
        targetId,
        avgRating,
        reviewCount,
      );
    }
  }
}
