import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import { slugify } from '../common/utils/slugify';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { Restaurant, RestaurantDocument } from './schemas/restaurant.schema';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { ListRestaurantsDto } from './dto/list-restaurants.dto';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class RestaurantsService {
  constructor(
    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<RestaurantDocument>,
  ) {}

  async create(
    ownerId: string,
    dto: CreateRestaurantDto,
  ): Promise<RestaurantDocument> {
    const slug = await this.generateUniqueSlug(dto.name);
    return this.restaurantModel.create({ ...dto, ownerId, slug });
  }

  async findAllApproved(
    query: ListRestaurantsDto,
  ): Promise<PaginatedResult<RestaurantDocument>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const filter: QueryFilter<RestaurantDocument> = { isApproved: true };
    if (query.cuisine) filter.cuisineTypes = query.cuisine;
    if (query.search) filter.$text = { $search: query.search };

    const [items, total] = await Promise.all([
      this.restaurantModel
        .find(filter)
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.restaurantModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Public lookup — deliberately requires `isApproved`, same as `findAllApproved`. A pending
   * restaurant's page must not be reachable just by knowing/guessing its slug before an admin
   * has approved it. The owner previews their own pending restaurant via `findMine` instead.
   */
  async findBySlug(slug: string): Promise<RestaurantDocument> {
    const restaurant = await this.restaurantModel
      .findOne({ slug: slug.toLowerCase(), isApproved: true })
      .exec();
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    return restaurant;
  }

  findMine(ownerId: string): Promise<RestaurantDocument[]> {
    return this.restaurantModel
      .find({ ownerId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByIdOrThrow(id: string): Promise<RestaurantDocument> {
    const restaurant = await this.restaurantModel.findById(id).exec();
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    return restaurant;
  }

  async update(
    id: string,
    requester: AccessTokenPayload,
    dto: UpdateRestaurantDto,
  ): Promise<RestaurantDocument> {
    const restaurant = await this.findByIdOrThrow(id);
    this.assertOwnerOrAdmin(restaurant, requester);
    Object.assign(restaurant, dto);
    return restaurant.save();
  }

  async toggleOpen(
    id: string,
    requester: AccessTokenPayload,
  ): Promise<RestaurantDocument> {
    const restaurant = await this.findByIdOrThrow(id);
    this.assertOwnerOrAdmin(restaurant, requester);
    restaurant.isOpen = !restaurant.isOpen;
    return restaurant.save();
  }

  async approve(id: string): Promise<RestaurantDocument> {
    const restaurant = await this.findByIdOrThrow(id);
    restaurant.isApproved = true;
    return restaurant.save();
  }

  /** Throws unless the requester owns this restaurant or is a platform admin. */
  assertOwnerOrAdmin(
    restaurant: RestaurantDocument,
    requester: AccessTokenPayload,
  ): void {
    if (requester.role === 'admin') return;
    if (restaurant.ownerId.toString() !== requester.sub) {
      throw new ForbiddenException(
        'You do not have permission to modify this restaurant',
      );
    }
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'restaurant';
    let slug = base;
    let suffix = 0;

    while (await this.restaurantModel.exists({ slug })) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
    return slug;
  }
}
