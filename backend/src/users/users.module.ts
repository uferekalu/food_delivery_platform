import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import {
  RefreshToken,
  RefreshTokenSchema,
} from '../auth/schemas/refresh-token.schema';
import { User, UserSchema } from './schemas/user.schema';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      // Suspending a user (docs/ROADMAP.md FDP-89) revokes every one of their refresh tokens
      // immediately — registered here too (alongside AuthModule's own registration of the same
      // schema/collection) so UsersService can do that directly without a circular dependency on
      // AuthModule (which already depends on UsersModule, not the other way around).
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
    RestaurantsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
