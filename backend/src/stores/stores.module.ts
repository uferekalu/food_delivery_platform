import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Store, StoreSchema } from './schemas/store.schema';
import {
  ProductCategory,
  ProductCategorySchema,
} from './schemas/product-category.schema';
import { Product, ProductSchema } from './schemas/product.schema';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Store.name, schema: StoreSchema },
      { name: ProductCategory.name, schema: ProductCategorySchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [StoresController, ProductsController],
  providers: [StoresService, ProductsService],
  exports: [StoresService, ProductsService],
})
export class StoresModule {}
