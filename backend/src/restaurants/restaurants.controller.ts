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
import { NearbyQueryDto } from '../common/dto/nearby-query.dto';
import { ReverifyBusinessRegistrationDto } from '../common/dto/reverify-business-registration.dto';

@ApiTags('restaurants')
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Public()
  @Get()
  findAll(@Query() query: ListRestaurantsDto) {
    return this.restaurantsService.findAllApproved(query);
  }

  // Also declared before `:slug` — same reason as `mine` below (docs/ROADMAP.md FDP-96).
  @Public()
  @Get('nearby')
  findNearby(@Query() query: NearbyQueryDto) {
    return this.restaurantsService.findNearby(query);
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

  // Also declared before `:slug` — same reason as `mine` above. Every restaurant regardless of
  // approval status — for admin pickers that must be able to target ANY restaurant, not just
  // already-approved ones (e.g. scoping an admin-created promo code before a restaurant has
  // been approved yet — a real bug the user hit, docs/ROADMAP.md FDP-116). `findAll` above is
  // public and approval-filtered, wrong for this.
  @Roles('admin')
  @Get('admin')
  findAllForAdmin() {
    return this.restaurantsService.findAllForAdmin();
  }

  // Also declared before `:slug` — same reason as `mine` above. `:slug` is public but only ever
  // resolves an *approved* restaurant (RestaurantsService.findBySlug); an admin reviewing a
  // pending application needs to see it before it's approved, so this looks up by id instead
  // and has no approval filter.
  @Roles('admin')
  @Get('admin/:id')
  findByIdForAdmin(@Param('id') id: string) {
    return this.restaurantsService.findByIdOrThrow(id);
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.restaurantsService.findBySlug(slug);
  }

  @Roles('restaurant_owner', 'admin')
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

  // Automated business verification (docs/ROADMAP.md FDP-115) — lets an owner correct a mistyped
  // registration number and re-run the automated CAC/RC check without recreating the restaurant.
  @Roles('restaurant_owner', 'admin')
  @Patch(':id/reverify-business')
  reverifyBusiness(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ReverifyBusinessRegistrationDto,
  ) {
    return this.restaurantsService.reverifyBusiness(
      id,
      user,
      dto.businessRegistrationNumber,
    );
  }
}
