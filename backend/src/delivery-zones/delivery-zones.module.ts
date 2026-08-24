import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import {
  DeliveryZone,
  DeliveryZoneSchema,
} from './schemas/delivery-zone.schema';
import { DeliveryZonesService } from './delivery-zones.service';
import { DeliveryZonesController } from './delivery-zones.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DeliveryZone.name, schema: DeliveryZoneSchema },
    ]),
    RestaurantsModule,
  ],
  controllers: [DeliveryZonesController],
  providers: [DeliveryZonesService],
  exports: [DeliveryZonesService],
})
export class DeliveryZonesModule {}
