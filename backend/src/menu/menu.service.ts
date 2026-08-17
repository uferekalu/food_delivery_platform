import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RestaurantsService } from '../restaurants/restaurants.service';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  MenuCategory,
  MenuCategoryDocument,
} from './schemas/menu-category.schema';
import { MenuItem, MenuItemDocument } from './schemas/menu-item.schema';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

@Injectable()
export class MenuService {
  constructor(
    @InjectModel(MenuCategory.name)
    private readonly categoryModel: Model<MenuCategoryDocument>,
    @InjectModel(MenuItem.name)
    private readonly itemModel: Model<MenuItemDocument>,
    private readonly restaurantsService: RestaurantsService,
  ) {}

  async getMenu(restaurantId: string) {
    const [categories, items] = await Promise.all([
      this.categoryModel
        .find({ restaurantId })
        .sort({ sortOrder: 1, name: 1 })
        .exec(),
      this.itemModel
        .find({ restaurantId })
        .sort({ sortOrder: 1, name: 1 })
        .exec(),
    ]);

    return categories.map((category) => ({
      ...category.toObject(),
      items: items.filter(
        (item) => item.categoryId.toString() === category._id.toString(),
      ),
    }));
  }

  async createCategory(
    restaurantId: string,
    requester: AccessTokenPayload,
    dto: CreateMenuCategoryDto,
  ): Promise<MenuCategoryDocument> {
    await this.assertOwnership(restaurantId, requester);
    return this.categoryModel.create({ ...dto, restaurantId });
  }

  async updateCategory(
    restaurantId: string,
    categoryId: string,
    requester: AccessTokenPayload,
    dto: UpdateMenuCategoryDto,
  ): Promise<MenuCategoryDocument> {
    await this.assertOwnership(restaurantId, requester);
    const category = await this.findCategoryOrThrow(restaurantId, categoryId);
    Object.assign(category, dto);
    return category.save();
  }

  async deleteCategory(
    restaurantId: string,
    categoryId: string,
    requester: AccessTokenPayload,
  ): Promise<void> {
    await this.assertOwnership(restaurantId, requester);
    await this.findCategoryOrThrow(restaurantId, categoryId);
    await this.itemModel.deleteMany({ restaurantId, categoryId }).exec();
    await this.categoryModel
      .deleteOne({ _id: categoryId, restaurantId })
      .exec();
  }

  async createItem(
    restaurantId: string,
    requester: AccessTokenPayload,
    dto: CreateMenuItemDto,
  ): Promise<MenuItemDocument> {
    await this.assertOwnership(restaurantId, requester);
    await this.findCategoryOrThrow(restaurantId, dto.categoryId);
    return this.itemModel.create({ ...dto, restaurantId });
  }

  async updateItem(
    restaurantId: string,
    itemId: string,
    requester: AccessTokenPayload,
    dto: UpdateMenuItemDto,
  ): Promise<MenuItemDocument> {
    await this.assertOwnership(restaurantId, requester);
    if (dto.categoryId)
      await this.findCategoryOrThrow(restaurantId, dto.categoryId);
    const item = await this.findItemOrThrow(restaurantId, itemId);
    Object.assign(item, dto);
    return item.save();
  }

  async deleteItem(
    restaurantId: string,
    itemId: string,
    requester: AccessTokenPayload,
  ): Promise<void> {
    await this.assertOwnership(restaurantId, requester);
    await this.findItemOrThrow(restaurantId, itemId);
    await this.itemModel.deleteOne({ _id: itemId, restaurantId }).exec();
  }

  async toggleItemAvailability(
    restaurantId: string,
    itemId: string,
    requester: AccessTokenPayload,
  ): Promise<MenuItemDocument> {
    await this.assertOwnership(restaurantId, requester);
    const item = await this.findItemOrThrow(restaurantId, itemId);
    item.isAvailable = !item.isAvailable;
    return item.save();
  }

  private async assertOwnership(
    restaurantId: string,
    requester: AccessTokenPayload,
  ): Promise<void> {
    const restaurant =
      await this.restaurantsService.findByIdOrThrow(restaurantId);
    this.restaurantsService.assertOwnerOrAdmin(restaurant, requester);
  }

  private async findCategoryOrThrow(
    restaurantId: string,
    categoryId: string,
  ): Promise<MenuCategoryDocument> {
    const category = await this.categoryModel
      .findOne({ _id: categoryId, restaurantId })
      .exec();
    if (!category) throw new NotFoundException('Menu category not found');
    return category;
  }

  private async findItemOrThrow(
    restaurantId: string,
    itemId: string,
  ): Promise<MenuItemDocument> {
    const item = await this.itemModel
      .findOne({ _id: itemId, restaurantId })
      .exec();
    if (!item) throw new NotFoundException('Menu item not found');
    return item;
  }
}
