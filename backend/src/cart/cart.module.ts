import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { StoresModule } from '../stores/stores.module';
import { MenuItem, MenuItemSchema } from '../menu/schemas/menu-item.schema';
import { Product, ProductSchema } from '../stores/schemas/product.schema';
import { Cart, CartSchema } from './schemas/cart.schema';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Cart.name, schema: CartSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    RestaurantsModule,
    StoresModule,
  ],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
