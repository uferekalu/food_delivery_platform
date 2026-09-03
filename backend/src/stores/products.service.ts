import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StoresService } from './stores.service';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  ProductCategory,
  ProductCategoryDocument,
} from './schemas/product-category.schema';
import { Product, ProductDocument } from './schemas/product.schema';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

export interface StoreCatalog {
  categories: ProductCategoryDocument[];
  products: ProductDocument[];
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(ProductCategory.name)
    private readonly categoryModel: Model<ProductCategoryDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly storesService: StoresService,
  ) {}

  // Returned as two flat lists rather than a pre-built tree — the frontend already needs to
  // walk parentCategoryId to render breadcrumbs/nested navigation, and a flat shape is simpler
  // to cache/diff on the client than a server-shaped tree (docs/ROADMAP.md FDP-56).
  async getCatalog(storeId: string): Promise<StoreCatalog> {
    const [categories, products] = await Promise.all([
      this.categoryModel
        .find({ storeId })
        .sort({ sortOrder: 1, name: 1 })
        .exec(),
      this.productModel
        .find({ storeId })
        .sort({ sortOrder: 1, name: 1 })
        .exec(),
    ]);
    return { categories, products };
  }

  async createCategory(
    storeId: string,
    requester: AccessTokenPayload,
    dto: CreateProductCategoryDto,
  ): Promise<ProductCategoryDocument> {
    await this.assertOwnership(storeId, requester);
    if (dto.parentCategoryId) {
      await this.findCategoryOrThrow(storeId, dto.parentCategoryId);
    }
    return this.categoryModel.create({
      ...dto,
      storeId,
      parentCategoryId: dto.parentCategoryId ?? null,
    });
  }

  async updateCategory(
    storeId: string,
    categoryId: string,
    requester: AccessTokenPayload,
    dto: UpdateProductCategoryDto,
  ): Promise<ProductCategoryDocument> {
    await this.assertOwnership(storeId, requester);
    const category = await this.findCategoryOrThrow(storeId, categoryId);

    if (dto.parentCategoryId !== undefined) {
      const newParentId = dto.parentCategoryId ?? null;
      if (newParentId) {
        if (newParentId === categoryId) {
          throw new BadRequestException('A category cannot be its own parent');
        }
        await this.findCategoryOrThrow(storeId, newParentId);
        if (await this.isDescendant(storeId, newParentId, categoryId)) {
          throw new BadRequestException(
            'Cannot move a category under one of its own subcategories',
          );
        }
      }
      category.parentCategoryId = newParentId as never;
    }
    if (dto.name !== undefined) category.name = dto.name;
    if (dto.sortOrder !== undefined) category.sortOrder = dto.sortOrder;

    return category.save();
  }

  /** Cascades through every descendant category (and every product filed under any of them) —
   * unlike the flat MenuCategory, a category here can have subcategories, so a shallow delete
   * would silently orphan them. */
  async deleteCategory(
    storeId: string,
    categoryId: string,
    requester: AccessTokenPayload,
  ): Promise<void> {
    await this.assertOwnership(storeId, requester);
    await this.findCategoryOrThrow(storeId, categoryId);

    const categoryIds = await this.collectDescendantIds(storeId, categoryId);
    categoryIds.push(categoryId);

    await this.productModel
      .deleteMany({ storeId, categoryId: { $in: categoryIds } })
      .exec();
    await this.categoryModel
      .deleteMany({ storeId, _id: { $in: categoryIds } })
      .exec();
  }

  async createProduct(
    storeId: string,
    requester: AccessTokenPayload,
    dto: CreateProductDto,
  ): Promise<ProductDocument> {
    await this.assertOwnership(storeId, requester);
    await this.findLeafCategoryOrThrow(storeId, dto.categoryId);
    this.assertDiscountBelowPrice(dto.price, dto.discountedPrice);
    return this.productModel.create({ ...dto, storeId });
  }

  async updateProduct(
    storeId: string,
    productId: string,
    requester: AccessTokenPayload,
    dto: UpdateProductDto,
  ): Promise<ProductDocument> {
    await this.assertOwnership(storeId, requester);
    if (dto.categoryId) {
      await this.findLeafCategoryOrThrow(storeId, dto.categoryId);
    }
    const product = await this.findProductOrThrow(storeId, productId);
    this.assertDiscountBelowPrice(
      dto.price ?? product.price,
      dto.discountedPrice !== undefined
        ? dto.discountedPrice
        : product.discountedPrice,
    );
    Object.assign(product, dto);
    return product.save();
  }

  async deleteProduct(
    storeId: string,
    productId: string,
    requester: AccessTokenPayload,
  ): Promise<void> {
    await this.assertOwnership(storeId, requester);
    await this.findProductOrThrow(storeId, productId);
    await this.productModel.deleteOne({ _id: productId, storeId }).exec();
  }

  async toggleProductAvailability(
    storeId: string,
    productId: string,
    requester: AccessTokenPayload,
  ): Promise<ProductDocument> {
    await this.assertOwnership(storeId, requester);
    const product = await this.findProductOrThrow(storeId, productId);
    product.isAvailable = !product.isAvailable;
    return product.save();
  }

  private async assertOwnership(
    storeId: string,
    requester: AccessTokenPayload,
  ): Promise<void> {
    const store = await this.storesService.findByIdOrThrow(storeId);
    this.storesService.assertOwnerOrAdmin(store, requester);
  }

  private assertDiscountBelowPrice(
    price: number,
    discountedPrice: number | null | undefined,
  ): void {
    if (discountedPrice != null && discountedPrice >= price) {
      throw new BadRequestException('discountedPrice must be lower than price');
    }
  }

  private async findCategoryOrThrow(
    storeId: string,
    categoryId: string,
  ): Promise<ProductCategoryDocument> {
    const category = await this.categoryModel
      .findOne({ _id: categoryId, storeId })
      .exec();
    if (!category) throw new NotFoundException('Product category not found');
    return category;
  }

  /** A product can only be filed directly under a category that currently has no
   * subcategories — mirrors the real store pages this schema was designed from, where a
   * category is either a browsing node (has children) or a product-holding leaf, never
   * ambiguously both at once. */
  private async findLeafCategoryOrThrow(
    storeId: string,
    categoryId: string,
  ): Promise<ProductCategoryDocument> {
    const category = await this.findCategoryOrThrow(storeId, categoryId);
    const hasChildren = await this.categoryModel
      .exists({ storeId, parentCategoryId: categoryId })
      .exec();
    if (hasChildren) {
      throw new BadRequestException(
        'This category has subcategories — file products under one of those instead',
      );
    }
    return category;
  }

  private async findProductOrThrow(
    storeId: string,
    productId: string,
  ): Promise<ProductDocument> {
    const product = await this.productModel
      .findOne({ _id: productId, storeId })
      .exec();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  /** Breadth-first walk down from `rootId`, one query per level — a store's category tree is
   * shallow (2-3 levels deep in practice) and small enough that this is simpler and clearer than
   * a single aggregation pipeline. */
  private async collectDescendantIds(
    storeId: string,
    rootId: string,
  ): Promise<string[]> {
    const result: string[] = [];
    let frontier = [rootId];
    while (frontier.length > 0) {
      const children = await this.categoryModel
        .find({ storeId, parentCategoryId: { $in: frontier } })
        .select('_id')
        .exec();
      const childIds = children.map((c) => c._id.toString());
      result.push(...childIds);
      frontier = childIds;
    }
    return result;
  }

  private async isDescendant(
    storeId: string,
    candidateId: string,
    ancestorId: string,
  ): Promise<boolean> {
    const descendantIds = await this.collectDescendantIds(storeId, ancestorId);
    return descendantIds.includes(candidateId);
  }
}
