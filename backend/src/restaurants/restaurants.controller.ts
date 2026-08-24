import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { RestaurantsService } from './restaurants.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { ListRestaurantsDto } from './dto/list-restaurants.dto';

@ApiTags('restaurants')
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Public()
  @Get()
  findAll(@Query() query: ListRestaurantsDto) {
    return this.restaurantsService.findAllApproved(query);
  }

  // Must be declared before GET /restaurants/:slug — Express/Nest matches routes for the
  // same method in declaration order, and "mine" would otherwise be swallowed as a :slug value.
  @Roles('restaurant_owner', 'admin')
  @Get('mine')
  findMine(@CurrentUser() user: AccessTokenPayload) {
    return this.restaurantsService.findMine(user.sub);
  }

  // Also declared before `:slug` — same reason as `mine` above.
  @Roles('admin')
  @Get('pending')
  findPendingApproval() {
    return this.restaurantsService.findPendingApproval();
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.restaurantsService.findBySlug(slug);
  }

  @Roles('restaurant_owner')
  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateRestaurantDto,
  ) {
    return this.restaurantsService.create(user.sub, dto);
  }

  @Roles('restaurant_owner', 'admin')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateRestaurantDto,
  ) {
    return this.restaurantsService.update(id, user, dto);
  }

  @Roles('restaurant_owner', 'admin')
  @Patch(':id/toggle-open')
  toggleOpen(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.restaurantsService.toggleOpen(id, user);
  }

  @Roles('admin')
  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.restaurantsService.approve(id);
  }
}
