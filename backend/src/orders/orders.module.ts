import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CartModule } from '../cart/cart.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { StoresModule } from '../stores/stores.module';
import { MenuItem, MenuItemSchema } from '../menu/schemas/menu-item.schema';
import { Product, ProductSchema } from '../stores/schemas/product.schema';
import { PromoCodesModule } from '../promo-codes/promo-codes.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { DeliveryZonesModule } from '../delivery-zones/delivery-zones.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Order, OrderSchema } from './schemas/order.schema';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PaymentProviderResolver } from '../payments/provider-resolver';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    CartModule,
    RestaurantsModule,
    StoresModule,
    PromoCodesModule,
    RealtimeModule,
    DeliveryZonesModule,
    NotificationsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, PaymentProviderResolver],
  exports: [OrdersService],
})
export class OrdersModule {}
