import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrdersService } from '../orders/orders.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
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
      targetId = order.restaurantId.toString();
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
   * reviewed, or if the order isn't eligible at all (not delivered / had no rider). */
  async getEligibility(
    requester: AccessTokenPayload,
    orderId: string,
  ): Promise<{ restaurant: boolean; rider: boolean }> {
    const order = await this.ordersService.findOne(requester.sub, orderId);
    if (order.status !== 'DELIVERED') {
      return { restaurant: false, rider: false };
    }

    const [restaurantReview, riderReview] = await Promise.all([
      this.reviewModel.findOne({ orderId, targetType: 'restaurant' }).exec(),
      order.riderId
        ? this.reviewModel.findOne({ orderId, targetType: 'rider' }).exec()
        : null,
    ]);

    return {
      restaurant: !restaurantReview,
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
    } else {
      await this.ridersService.updateRatingStats(
        targetId,
        avgRating,
        reviewCount,
      );
    }
  }
}
