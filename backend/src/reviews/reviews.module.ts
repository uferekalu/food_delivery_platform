import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersModule } from '../orders/orders.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { RidersModule } from '../riders/riders.module';
import { Review, ReviewSchema } from './schemas/review.schema';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Review.name, schema: ReviewSchema }]),
    OrdersModule,
    RestaurantsModule,
    RidersModule,
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
