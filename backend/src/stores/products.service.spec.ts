import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { ProductsService } from './products.service';
import { StoresService } from './stores.service';
import { Store, StoreDocument, StoreSchema } from './schemas/store.schema';
import {
  ProductCategory,
  ProductCategoryDocument,
  ProductCategorySchema,
} from './schemas/product-category.schema';
import {
  Product,
  ProductDocument,
  ProductSchema,
} from './schemas/product.schema';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';

jest.setTimeout(30_000);

describe('ProductsService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let productsService: ProductsService;
  let storesService: StoresService;
  let storeModel: Model<StoreDocument>;
  let categoryModel: Model<ProductCategoryDocument>;
  let productModel: Model<ProductDocument>;

  const owner: AccessTokenPayload = {
    sub: 'owner-id',
    email: 'owner@example.com',
    role: 'restaurant_owner',
  };
  const stranger: AccessTokenPayload = {
    sub: 'stranger-id',
    email: 'stranger@example.com',
    role: 'restaurant_owner',
  };

  beforeAll(async () => {
    // See backend/CLAUDE.md ("Testing") for why launchTimeout is set explicitly.
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Store.name, schema: StoreSchema },
          { name: ProductCategory.name, schema: ProductCategorySchema },
          { name: Product.name, schema: ProductSchema },
        ]),
      ],
      providers: [ProductsService, StoresService],
    }).compile();

    productsService = moduleRef.get(ProductsService);
    storesService = moduleRef.get(StoresService);
    storeModel = moduleRef.get(getModelToken(Store.name));
    categoryModel = moduleRef.get(getModelToken(ProductCategory.name));
    productModel = moduleRef.get(getModelToken(Product.name));
  }, 60_000);

  afterEach(async () => {
    await Promise.all([
      storeModel.deleteMany({}).exec(),
      categoryModel.deleteMany({}).exec(),
      productModel.deleteMany({}).exec(),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  async function createTestStore(name = 'Market Square Supermarket') {
    return storesService.create(owner.sub, {
      name,
      type: 'groceries',
      currency: 'NGN',
      country: 'Nigeria',
      address: { line1: '1 Main St', city: 'Lagos', state: 'Lagos' },
      complianceDocumentUrl: 'https://example.com/doc.pdf',
    });
  }

  it('rejects a stranger creating a category on a store they do not own', async () => {
    const store = await createTestStore();
    await expect(
      productsService.createCategory(store._id.toString(), stranger, {
        name: 'Frozen goods',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects creating a product under a category that does not belong to the store', async () => {
    const storeA = await createTestStore('Store A');
    const storeB = await createTestStore('Store B');
    const categoryOnB = await productsService.createCategory(
      storeB._id.toString(),
      owner,
      { name: 'Dairy' },
    );

    await expect(
      productsService.createProduct(storeA._id.toString(), owner, {
        categoryId: categoryOnB._id.toString(),
        name: 'Cross-store product',
        price: 10,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('supports nested subcategories, returned as flat lists from getCatalog', async () => {
    const store = await createTestStore();
    const storeId = store._id.toString();

    const frozen = await productsService.createCategory(storeId, owner, {
      name: 'Frozen goods',
    });
    const frozenVeg = await productsService.createCategory(storeId, owner, {
      name: 'Frozen Fruits & Vegetables',
      parentCategoryId: frozen._id.toString(),
    });
    await productsService.createProduct(storeId, owner, {
      categoryId: frozenVeg._id.toString(),
      name: 'Frozen Potato',
      price: 3,
    });

    const catalog = await productsService.getCatalog(storeId);
    expect(catalog.categories).toHaveLength(2);
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0].categoryId.toString()).toBe(
      frozenVeg._id.toString(),
    );
  });

  it('rejects filing a product directly under a category that has subcategories', async () => {
    const store = await createTestStore();
    const storeId = store._id.toString();

    const frozen = await productsService.createCategory(storeId, owner, {
      name: 'Frozen goods',
    });
    await productsService.createCategory(storeId, owner, {
      name: 'Frozen Fruits & Vegetables',
      parentCategoryId: frozen._id.toString(),
    });

    await expect(
      productsService.createProduct(storeId, owner, {
        categoryId: frozen._id.toString(),
        name: 'Should not be allowed here',
        price: 3,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a discountedPrice that is not lower than price', async () => {
    const store = await createTestStore();
    const storeId = store._id.toString();
    const category = await productsService.createCategory(storeId, owner, {
      name: 'Dairy',
    });

    await expect(
      productsService.createProduct(storeId, owner, {
        categoryId: category._id.toString(),
        name: 'Milk',
        price: 10,
        discountedPrice: 10,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('cascade-deletes a category through every descendant category and product', async () => {
    const store = await createTestStore();
    const storeId = store._id.toString();

    const health = await productsService.createCategory(storeId, owner, {
      name: 'Health & Medicines',
    });
    const wellness = await productsService.createCategory(storeId, owner, {
      name: 'Sexual Wellness',
      parentCategoryId: health._id.toString(),
    });
    const condoms = await productsService.createCategory(storeId, owner, {
      name: 'Condoms & Lubricants',
      parentCategoryId: wellness._id.toString(),
    });
    await productsService.createProduct(storeId, owner, {
      categoryId: condoms._id.toString(),
      name: 'Kiss Lube Gel 120Ml',
      price: 5250,
    });

    await productsService.deleteCategory(storeId, health._id.toString(), owner);

    const catalog = await productsService.getCatalog(storeId);
    expect(catalog.categories).toHaveLength(0);
    expect(catalog.products).toHaveLength(0);
  });

  it('prevents moving a category under one of its own subcategories', async () => {
    const store = await createTestStore();
    const storeId = store._id.toString();

    const parent = await productsService.createCategory(storeId, owner, {
      name: 'Parent',
    });
    const child = await productsService.createCategory(storeId, owner, {
      name: 'Child',
      parentCategoryId: parent._id.toString(),
    });

    await expect(
      productsService.updateCategory(storeId, parent._id.toString(), owner, {
        parentCategoryId: child._id.toString(),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('toggles product availability', async () => {
    const store = await createTestStore();
    const storeId = store._id.toString();
    const category = await productsService.createCategory(storeId, owner, {
      name: 'Dairy',
    });
    const product = await productsService.createProduct(storeId, owner, {
      categoryId: category._id.toString(),
      name: 'Milk',
      price: 10,
    });
    expect(product.isAvailable).toBe(true);

    const toggled = await productsService.toggleProductAvailability(
      storeId,
      product._id.toString(),
      owner,
    );
    expect(toggled.isAvailable).toBe(false);
  });
});
