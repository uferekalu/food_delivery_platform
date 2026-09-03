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
import { ProductsService } from './products.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@ApiTags('stores')
@Controller('stores/:storeId/catalog')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get()
  getCatalog(@Param('storeId') storeId: string) {
    return this.productsService.getCatalog(storeId);
  }

  @Roles('restaurant_owner', 'admin')
  @Post('categories')
  createCategory(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateProductCategoryDto,
  ) {
    return this.productsService.createCategory(storeId, user, dto);
  }

  @Roles('restaurant_owner', 'admin')
  @Patch('categories/:categoryId')
  updateCategory(
    @Param('storeId') storeId: string,
    @Param('categoryId') categoryId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateProductCategoryDto,
  ) {
    return this.productsService.updateCategory(storeId, categoryId, user, dto);
  }

  @Roles('restaurant_owner', 'admin')
  @Delete('categories/:categoryId')
  deleteCategory(
    @Param('storeId') storeId: string,
    @Param('categoryId') categoryId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.productsService.deleteCategory(storeId, categoryId, user);
  }

  @Roles('restaurant_owner', 'admin')
  @Post('products')
  createProduct(
    @Param('storeId') storeId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.createProduct(storeId, user, dto);
  }

  @Roles('restaurant_owner', 'admin')
  @Patch('products/:productId')
  updateProduct(
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.updateProduct(storeId, productId, user, dto);
  }

  @Roles('restaurant_owner', 'admin')
  @Delete('products/:productId')
  deleteProduct(
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.productsService.deleteProduct(storeId, productId, user);
  }

  @Roles('restaurant_owner', 'admin')
  @Patch('products/:productId/availability')
  toggleAvailability(
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.productsService.toggleProductAvailability(
      storeId,
      productId,
      user,
    );
  }
}
