import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { StoresService } from '../stores/stores.service';
import { MenuItem, MenuItemDocument } from '../menu/schemas/menu-item.schema';
import { Product, ProductDocument } from '../stores/schemas/product.schema';
import { Cart, CartDocument } from './schemas/cart.schema';
import type { CartItem } from './schemas/cart-item.schema';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { AddStoreCartItemDto } from './dto/add-store-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

// Structural, not imported from orders/schemas/order.schema — OrdersModule already depends on
// CartModule (it clears/reads the cart when creating an order), so a real import the other way
// would be circular. An OrderDocument satisfies this shape, so OrdersService can pass one
// straight through to reorderFromOrder below with no adapting.
export interface ReorderSourceOrder {
  sellerType: 'restaurant' | 'store';
  restaurantId: Types.ObjectId | null;
  storeId: Types.ObjectId | null;
  items: {
    menuItemId: Types.ObjectId | null;
    productId: Types.ObjectId | null;
    name: string;
    qty: number;
    notes: string;
    selectedModifiers: { groupName: string; optionName: string }[];
  }[];
}

export interface ReorderResult {
  cart: CartResponse;
  // Names of order lines that couldn't be carried over (item deleted, no longer available, or
  // its modifiers no longer resolve against the item's current modifierGroups) — the frontend
  // surfaces these so the customer knows their cart doesn't fully match the original order.
  skippedItems: string[];
}

export interface CartResponse {
  sellerType: 'restaurant' | 'store' | null;
  restaurantId: string | null;
  restaurantName: string | null;
  storeId: string | null;
  storeName: string | null;
  currency: string | null;
  items: CartItem[];
  subtotal: number;
}

const EMPTY_CART: CartResponse = {
  sellerType: null,
  restaurantId: null,
  restaurantName: null,
  storeId: null,
  storeName: null,
  currency: null,
  items: [],
  subtotal: 0,
};

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>,
    @InjectModel(MenuItem.name)
    private readonly menuItemModel: Model<MenuItemDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly restaurantsService: RestaurantsService,
    private readonly storesService: StoresService,
  ) {}

  async getCart(userId: string): Promise<CartResponse> {
    const cart = await this.cartModel.findOne({ userId }).exec();
    return await this.toResponse(cart);
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartResponse> {
    const menuItem = await this.menuItemModel.findById(dto.menuItemId).exec();
    if (!menuItem) throw new NotFoundException('Menu item not found');
    if (!menuItem.isAvailable) {
      throw new BadRequestException('This item is currently unavailable');
    }

    const restaurant = await this.restaurantsService.findByIdOrThrow(
      menuItem.restaurantId.toString(),
    );
    if (!restaurant.isApproved || !restaurant.isOpen) {
      throw new BadRequestException(
        'This restaurant is not currently accepting orders',
      );
    }

    const resolvedModifiers = this.resolveModifiers(
      menuItem,
      dto.selectedModifiers ?? [],
    );
    const qty = dto.qty ?? 1;

    let cart = await this.cartModel.findOne({ userId }).exec();

    // A cart has exactly one seller (docs/PRODUCT_GUIDE.md §4) — that seller can be this same
    // restaurant, a different restaurant, or (docs/ROADMAP.md FDP-56) a store; any mismatch
    // requires `replace: true` to start over.
    const switchingSeller =
      cart &&
      (cart.sellerType !== 'restaurant' ||
        cart.restaurantId?.toString() !== menuItem.restaurantId.toString());
    if (cart && switchingSeller) {
      if (!dto.replace) {
        throw new ConflictException(
          'Your cart has items from a different restaurant. Pass replace: true to start a new cart.',
        );
      }
      cart.items = [];
      cart.sellerType = 'restaurant';
      cart.restaurantId = menuItem.restaurantId;
      cart.storeId = null;
    }

    if (!cart) {
      cart = new this.cartModel({
        userId,
        sellerType: 'restaurant',
        restaurantId: menuItem.restaurantId,
        storeId: null,
        items: [],
      });
    }

    const newLineNotes = dto.notes?.trim() ?? '';
    const existingLine = cart.items.find(
      (item) =>
        item.menuItemId?.toString() === menuItem._id.toString() &&
        item.notes === newLineNotes &&
        this.sameModifiers(item.selectedModifiers, resolvedModifiers),
    );

    if (existingLine) {
      existingLine.qty = Math.min(20, existingLine.qty + qty);
    } else {
      cart.items.push({
        menuItemId: menuItem._id,
        name: menuItem.name,
        price: menuItem.price,
        imageUrl: menuItem.imageUrl,
        qty,
        selectedModifiers: resolvedModifiers,
        notes: newLineNotes,
      } as CartItem);
    }

    await cart.save();
    return await this.toResponse(cart);
  }

  /** Store-catalog counterpart of `addItem` (docs/ROADMAP.md FDP-56) — same shape, resolved
   * against Product/Store instead of MenuItem/Restaurant. Products have no modifiers, so lines
   * here never carry `selectedModifiers`. */
  async addStoreItem(
    userId: string,
    dto: AddStoreCartItemDto,
  ): Promise<CartResponse> {
    const product = await this.productModel.findById(dto.productId).exec();
    if (!product) throw new NotFoundException('Product not found');
    if (!product.isAvailable) {
      throw new BadRequestException('This item is currently unavailable');
    }

    const store = await this.storesService.findByIdOrThrow(
      product.storeId.toString(),
    );
    if (!store.isApproved || !store.isOpen) {
      throw new BadRequestException(
        'This store is not currently accepting orders',
      );
    }

    const qty = dto.qty ?? 1;

    let cart = await this.cartModel.findOne({ userId }).exec();

    const switchingSeller =
      cart &&
      (cart.sellerType !== 'store' ||
        cart.storeId?.toString() !== product.storeId.toString());
    if (cart && switchingSeller) {
      if (!dto.replace) {
        throw new ConflictException(
          'Your cart has items from a different store. Pass replace: true to start a new cart.',
        );
      }
      cart.items = [];
      cart.sellerType = 'store';
      cart.storeId = product.storeId;
      cart.restaurantId = null;
    }

    if (!cart) {
      cart = new this.cartModel({
        userId,
        sellerType: 'store',
        storeId: product.storeId,
        restaurantId: null,
        items: [],
      });
    }

    const newLineNotes = dto.notes?.trim() ?? '';
    // Price snapshotted at add-to-cart time (same "price protection while shopping" reasoning
    // as addItem) — a discountedPrice, if active, is what's actually charged.
    const price = product.discountedPrice ?? product.price;
    const existingLine = cart.items.find(
      (item) =>
        item.productId?.toString() === product._id.toString() &&
        item.notes === newLineNotes,
    );

    if (existingLine) {
      existingLine.qty = Math.min(20, existingLine.qty + qty);
    } else {
      cart.items.push({
        productId: product._id,
        name: product.name,
        price,
        imageUrl: product.imageUrl,
        qty,
        selectedModifiers: [],
        notes: newLineNotes,
      } as unknown as CartItem);
    }

    await cart.save();
    return await this.toResponse(cart);
  }

  /** "Buy again" (docs/ROADMAP.md FDP-97) — rebuilds the customer's cart from a past order's
   * items. Never trusts the order's frozen snapshot for anything that can drift after the order
   * was placed: price is re-read from the current MenuItem/Product (an order's price is a
   * point-in-time receipt, not a quote), and modifiers are re-resolved against the item's
   * *current* modifierGroups via resolveModifiers, same as a fresh addItem. A line whose item
   * was deleted, is no longer available, or whose old modifier picks no longer resolve (a
   * required group added since, an option removed) is silently dropped rather than failing the
   * whole reorder — its name is returned in `skippedItems` so the caller can tell the customer.
   * Mirrors addItem/addStoreItem's own replace-confirmation gate: an already-non-empty cart
   * needs `replace: true`, exactly like adding an item from a different seller. */
  async reorderFromOrder(
    userId: string,
    order: ReorderSourceOrder,
    replace = false,
  ): Promise<ReorderResult> {
    let cart = await this.cartModel.findOne({ userId }).exec();
    if (cart && cart.items.length > 0 && !replace) {
      throw new ConflictException(
        'Your cart already has items. Pass replace: true to start a new cart from this order.',
      );
    }

    const skippedItems: string[] = [];

    if (order.sellerType === 'restaurant') {
      const restaurant = await this.restaurantsService.findByIdOrThrow(
        (
          order.restaurantId as NonNullable<typeof order.restaurantId>
        ).toString(),
      );
      if (!restaurant.isApproved || !restaurant.isOpen) {
        throw new BadRequestException(
          'This restaurant is not currently accepting orders',
        );
      }

      if (!cart) {
        cart = new this.cartModel({
          userId,
          sellerType: 'restaurant',
          restaurantId: order.restaurantId,
          storeId: null,
          items: [],
        });
      } else {
        cart.items = [];
        cart.sellerType = 'restaurant';
        cart.restaurantId = order.restaurantId;
        cart.storeId = null;
      }

      for (const line of order.items) {
        const menuItem = line.menuItemId
          ? await this.menuItemModel.findById(line.menuItemId).exec()
          : null;
        if (!menuItem || !menuItem.isAvailable) {
          skippedItems.push(line.name);
          continue;
        }

        let resolvedModifiers: {
          groupName: string;
          optionName: string;
          priceDelta: number;
        }[];
        try {
          resolvedModifiers = this.resolveModifiers(
            menuItem,
            line.selectedModifiers.map(({ groupName, optionName }) => ({
              groupName,
              optionName,
            })),
          );
        } catch {
          skippedItems.push(line.name);
          continue;
        }

        cart.items.push({
          menuItemId: menuItem._id,
          name: menuItem.name,
          price: menuItem.price,
          imageUrl: menuItem.imageUrl,
          qty: line.qty,
          selectedModifiers: resolvedModifiers,
          notes: line.notes,
        } as CartItem);
      }
    } else {
      const store = await this.storesService.findByIdOrThrow(
        (order.storeId as NonNullable<typeof order.storeId>).toString(),
      );
      if (!store.isApproved || !store.isOpen) {
        throw new BadRequestException(
          'This store is not currently accepting orders',
        );
      }

      if (!cart) {
        cart = new this.cartModel({
          userId,
          sellerType: 'store',
          storeId: order.storeId,
          restaurantId: null,
          items: [],
        });
      } else {
        cart.items = [];
        cart.sellerType = 'store';
        cart.storeId = order.storeId;
        cart.restaurantId = null;
      }

      for (const line of order.items) {
        const product = line.productId
          ? await this.productModel.findById(line.productId).exec()
          : null;
        if (!product || !product.isAvailable) {
          skippedItems.push(line.name);
          continue;
        }

        cart.items.push({
          productId: product._id,
          name: product.name,
          price: product.discountedPrice ?? product.price,
          imageUrl: product.imageUrl,
          qty: line.qty,
          selectedModifiers: [],
          notes: line.notes,
        } as unknown as CartItem);
      }
    }

    if (cart.items.length === 0) {
      throw new BadRequestException(
        "None of this order's items are available to reorder",
      );
    }

    await cart.save();
    return { cart: await this.toResponse(cart), skippedItems };
  }

  async updateItem(
    userId: string,
    cartItemId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartResponse> {
    const cart = await this.findCartOrThrow(userId);
    const item = cart.items.find((i) => i._id.toString() === cartItemId);
    if (!item) throw new NotFoundException('Cart item not found');

    if (dto.qty !== undefined) item.qty = dto.qty;
    if (dto.notes !== undefined) item.notes = dto.notes.trim();

    await cart.save();
    return await this.toResponse(cart);
  }

  async removeItem(userId: string, cartItemId: string): Promise<CartResponse> {
    const cart = await this.findCartOrThrow(userId);
    const before = cart.items.length;
    cart.items = cart.items.filter((i) => i._id.toString() !== cartItemId);
    if (cart.items.length === before)
      throw new NotFoundException('Cart item not found');

    if (cart.items.length === 0) {
      await this.cartModel.deleteOne({ _id: cart._id }).exec();
      return EMPTY_CART;
    }

    await cart.save();
    return await this.toResponse(cart);
  }

  async clearCart(userId: string): Promise<void> {
    await this.cartModel.deleteOne({ userId }).exec();
  }

  private async findCartOrThrow(userId: string): Promise<CartDocument> {
    const cart = await this.cartModel.findOne({ userId }).exec();
    if (!cart) throw new NotFoundException('Cart is empty');
    return cart;
  }

  /** Validates the client's group/option picks against the item's current modifierGroups
   * (min/max selections per group, and that the referenced group/option actually exists), and
   * resolves each pick's priceDelta server-side — see SelectedModifier schema for why. */
  private resolveModifiers(
    menuItem: MenuItemDocument,
    selections: { groupName: string; optionName: string }[],
  ) {
    const resolved: {
      groupName: string;
      optionName: string;
      priceDelta: number;
    }[] = [];

    for (const group of menuItem.modifierGroups) {
      const picksForGroup = selections.filter(
        (s) => s.groupName === group.name,
      );
      if (
        picksForGroup.length < group.min ||
        picksForGroup.length > group.max
      ) {
        throw new BadRequestException(
          `"${group.name}" requires between ${group.min} and ${group.max} selection(s)`,
        );
      }
      for (const pick of picksForGroup) {
        const option = group.options.find((o) => o.name === pick.optionName);
        if (!option) {
          throw new BadRequestException(
            `"${pick.optionName}" is not a valid option for "${group.name}"`,
          );
        }
        resolved.push({
          groupName: group.name,
          optionName: option.name,
          priceDelta: option.priceDelta,
        });
      }
    }

    const knownGroupNames = new Set(menuItem.modifierGroups.map((g) => g.name));
    const unknownGroup = selections.find(
      (s) => !knownGroupNames.has(s.groupName),
    );
    if (unknownGroup) {
      throw new BadRequestException(
        `"${unknownGroup.groupName}" is not a modifier group on this item`,
      );
    }

    return resolved;
  }

  private sameModifiers(
    a: { groupName: string; optionName: string }[],
    b: { groupName: string; optionName: string }[],
  ): boolean {
    if (a.length !== b.length) return false;
    const key = (m: { groupName: string; optionName: string }) =>
      `${m.groupName}::${m.optionName}`;
    const sortedA = a.map(key).sort();
    const sortedB = b.map(key).sort();
    return sortedA.every((value, index) => value === sortedB[index]);
  }

  // Fetches the seller on every response (not just add-time) so the cart UI always has a
  // currency/name to render with — cheaper than a second frontend request, and cart reads are
  // low-volume enough that the extra lookup isn't worth denormalizing into the Cart document.
  private async toResponse(cart: CartDocument | null): Promise<CartResponse> {
    if (!cart) return EMPTY_CART;
    const subtotal = cart.items.reduce((sum, item) => {
      const modifiersTotal = item.selectedModifiers.reduce(
        (s, m) => s + m.priceDelta,
        0,
      );
      return sum + (item.price + modifiersTotal) * item.qty;
    }, 0);

    if (cart.sellerType === 'store') {
      // storeId is guaranteed set whenever sellerType is 'store' — both are only ever written
      // together, in addStoreItem above.
      const store = await this.storesService.findByIdOrThrow(
        (cart.storeId as NonNullable<typeof cart.storeId>).toString(),
      );
      return {
        sellerType: 'store',
        restaurantId: null,
        restaurantName: null,
        storeId: cart.storeId!.toString(),
        storeName: store.name,
        currency: store.currency,
        items: cart.items,
        subtotal,
      };
    }

    const restaurant = await this.restaurantsService.findByIdOrThrow(
      (cart.restaurantId as NonNullable<typeof cart.restaurantId>).toString(),
    );
    return {
      sellerType: 'restaurant',
      restaurantId: cart.restaurantId!.toString(),
      restaurantName: restaurant.name,
      storeId: null,
      storeName: null,
      currency: restaurant.currency,
      items: cart.items,
      subtotal,
    };
  }
}
