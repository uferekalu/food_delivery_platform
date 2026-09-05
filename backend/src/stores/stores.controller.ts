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
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { ListStoresDto } from './dto/list-stores.dto';
import { NearbyStoresQueryDto } from './dto/nearby-stores-query.dto';

@ApiTags('stores')
@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Public()
  @Get()
  findAll(@Query() query: ListStoresDto) {
    return this.storesService.findAllApproved(query);
  }

  // Also declared before `:slug` — same reason as `mine` below (docs/ROADMAP.md FDP-96).
  @Public()
  @Get('nearby')
  findNearby(@Query() query: NearbyStoresQueryDto) {
    return this.storesService.findNearby(query);
  }

  // Must be declared before GET /stores/:slug — same route-matching-order reasoning as
  // RestaurantsController.
  @Roles('restaurant_owner', 'admin')
  @Get('mine')
  findMine(@CurrentUser() user: AccessTokenPayload) {
    return this.storesService.findMine(user.sub);
  }

  @Roles('admin')
  @Get('pending')
  findPendingApproval() {
    return this.storesService.findPendingApproval();
  }

  @Roles('admin')
  @Get('admin/:id')
  findByIdForAdmin(@Param('id') id: string) {
    return this.storesService.findByIdOrThrow(id);
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.storesService.findBySlug(slug);
  }

  @Roles('restaurant_owner', 'admin')
  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateStoreDto) {
    return this.storesService.create(user.sub, dto);
  }

  @Roles('restaurant_owner', 'admin')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.storesService.update(id, user, dto);
  }

  @Roles('restaurant_owner', 'admin')
  @Patch(':id/toggle-open')
  toggleOpen(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.storesService.toggleOpen(id, user);
  }
}
