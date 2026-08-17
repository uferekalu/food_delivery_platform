import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { MenuService } from './menu.service';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

@ApiTags('menu')
@Controller('restaurants/:restaurantId/menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Public()
  @Get()
  getMenu(@Param('restaurantId') restaurantId: string) {
    return this.menuService.getMenu(restaurantId);
  }

  @Roles('restaurant_owner', 'admin')
  @Post('categories')
  createCategory(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateMenuCategoryDto,
  ) {
    return this.menuService.createCategory(restaurantId, user, dto);
  }

  @Roles('restaurant_owner', 'admin')
  @Patch('categories/:categoryId')
  updateCategory(
    @Param('restaurantId') restaurantId: string,
    @Param('categoryId') categoryId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateMenuCategoryDto,
  ) {
    return this.menuService.updateCategory(restaurantId, categoryId, user, dto);
  }

  @Roles('restaurant_owner', 'admin')
  @Delete('categories/:categoryId')
  deleteCategory(
    @Param('restaurantId') restaurantId: string,
    @Param('categoryId') categoryId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.menuService.deleteCategory(restaurantId, categoryId, user);
  }

  @Roles('restaurant_owner', 'admin')
  @Post('items')
  createItem(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateMenuItemDto,
  ) {
    return this.menuService.createItem(restaurantId, user, dto);
  }

  @Roles('restaurant_owner', 'admin')
  @Patch('items/:itemId')
  updateItem(
    @Param('restaurantId') restaurantId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.menuService.updateItem(restaurantId, itemId, user, dto);
  }

  @Roles('restaurant_owner', 'admin')
  @Delete('items/:itemId')
  deleteItem(
    @Param('restaurantId') restaurantId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.menuService.deleteItem(restaurantId, itemId, user);
  }

  @Roles('restaurant_owner', 'admin')
  @Patch('items/:itemId/availability')
  toggleAvailability(
    @Param('restaurantId') restaurantId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.menuService.toggleItemAvailability(restaurantId, itemId, user);
  }
}
