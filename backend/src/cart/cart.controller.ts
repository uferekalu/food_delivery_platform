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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { AddStoreCartItemDto } from './dto/add-store-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@ApiTags('cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentUser() user: AccessTokenPayload) {
    return this.cartService.getCart(user.sub);
  }

  @Post('items')
  addItem(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cartService.addItem(user.sub, dto);
  }

  // Store-catalog counterpart of POST /cart/items (docs/ROADMAP.md FDP-56).
  @Post('store-items')
  addStoreItem(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: AddStoreCartItemDto,
  ) {
    return this.cartService.addStoreItem(user.sub, dto);
  }

  @Patch('items/:cartItemId')
  updateItem(
    @CurrentUser() user: AccessTokenPayload,
    @Param('cartItemId') cartItemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(user.sub, cartItemId, dto);
  }

  @Delete('items/:cartItemId')
  removeItem(
    @CurrentUser() user: AccessTokenPayload,
    @Param('cartItemId') cartItemId: string,
  ) {
    return this.cartService.removeItem(user.sub, cartItemId);
  }

  @Delete()
  clearCart(@CurrentUser() user: AccessTokenPayload) {
    return this.cartService.clearCart(user.sub);
  }
}
