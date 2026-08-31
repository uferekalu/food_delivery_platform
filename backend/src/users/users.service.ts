import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RestaurantsService } from '../restaurants/restaurants.service';
import type { RestaurantDocument } from '../restaurants/schemas/restaurant.schema';
import {
  USER_ROLES,
  User,
  UserDocument,
  UserRole,
} from './schemas/user.schema';
import { SavedAddress } from './schemas/saved-address.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateSavedAddressDto } from './dto/create-saved-address.dto';
import { UpdateSavedAddressDto } from './dto/update-saved-address.dto';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  role?: UserRole;
  phone?: string;
  isPhoneVerified?: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly restaurantsService: RestaurantsService,
  ) {}

  create(input: CreateUserInput): Promise<UserDocument> {
    return this.userModel.create(input);
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  findByPhone(phone: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ phone: phone.trim() }).exec();
  }

  async markPhoneVerified(id: string, phone: string): Promise<void> {
    await this.userModel
      .updateOne({ _id: id }, { phone, isPhoneVerified: true })
      .exec();
  }

  /** Includes `passwordHash`, which is excluded from queries by default (`select: false`). */
  findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase().trim() })
      .select('+passwordHash')
      .exec();
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  /** Includes `passwordHash` — used by change-password to verify the current one. */
  findByIdWithPassword(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select('+passwordHash').exec();
  }

  async markEmailVerified(id: string): Promise<void> {
    await this.userModel
      .updateOne({ _id: id }, { isEmailVerified: true })
      .exec();
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.userModel.updateOne({ _id: id }, { passwordHash }).exec();
  }

  /** Feeds the admin analytics overview (docs/ROADMAP.md FDP-20) — how the user base breaks
   * down by role. */
  async countByRole(): Promise<Record<UserRole, number>> {
    const rows = await this.userModel
      .aggregate<{ _id: UserRole; count: number }>([
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ])
      .exec();
    const counts = Object.fromEntries(
      USER_ROLES.map((role) => [role, 0]),
    ) as Record<UserRole, number>;
    for (const row of rows) counts[row._id] = row.count;
    return counts;
  }

  async updateRole(id: string, role: UserRole): Promise<UserDocument | null> {
    // Mongoose 9 deprecated `new: true` in favor of `returnDocument: 'after'`.
    return this.userModel
      .findByIdAndUpdate(id, { role }, { returnDocument: 'after' })
      .exec();
  }

  async updateProfile(
    id: string,
    dto: UpdateProfileDto,
  ): Promise<UserDocument> {
    const user = await this.findByIdOrThrow(id);
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;
    if (dto.phone !== undefined) user.phone = dto.phone;
    return user.save();
  }

  async listAddresses(id: string): Promise<SavedAddress[]> {
    const user = await this.findByIdOrThrow(id);
    return user.savedAddresses;
  }

  async addAddress(
    id: string,
    dto: CreateSavedAddressDto,
  ): Promise<SavedAddress> {
    const user = await this.findByIdOrThrow(id);
    // The first address a user saves becomes their default regardless of what was passed —
    // there's never a valid state with saved addresses but no default.
    const makeDefault =
      dto.isDefault === true || user.savedAddresses.length === 0;
    if (makeDefault) this.clearDefaults(user.savedAddresses);

    user.savedAddresses.push({
      label: dto.label,
      address: dto.address,
      isDefault: makeDefault,
    } as SavedAddress);
    await user.save();
    return user.savedAddresses[user.savedAddresses.length - 1];
  }

  async updateAddress(
    id: string,
    addressId: string,
    dto: UpdateSavedAddressDto,
  ): Promise<SavedAddress> {
    const user = await this.findByIdOrThrow(id);
    const address = this.findAddressOrThrow(user.savedAddresses, addressId);

    if (dto.label !== undefined) address.label = dto.label;
    if (dto.address !== undefined) address.address = dto.address;
    if (dto.isDefault === true) this.clearDefaults(user.savedAddresses);
    if (dto.isDefault !== undefined) address.isDefault = dto.isDefault;

    // Don't allow unsetting the only/last default with nothing to take its place.
    if (
      !user.savedAddresses.some((a) => a.isDefault) &&
      user.savedAddresses.length > 0
    ) {
      address.isDefault = true;
    }

    await user.save();
    return address;
  }

  async removeAddress(id: string, addressId: string): Promise<void> {
    const user = await this.findByIdOrThrow(id);
    const address = this.findAddressOrThrow(user.savedAddresses, addressId);
    const wasDefault = address.isDefault;

    user.savedAddresses = user.savedAddresses.filter(
      (a) => a._id.toString() !== addressId,
    );
    // Promote another address to default so there's never a non-empty list with no default.
    if (wasDefault && user.savedAddresses.length > 0) {
      user.savedAddresses[0].isDefault = true;
    }
    await user.save();
  }

  async listFavorites(id: string): Promise<RestaurantDocument[]> {
    const user = await this.findByIdOrThrow(id);
    if (user.favoriteRestaurantIds.length === 0) return [];
    return this.restaurantsService.findByIds(
      user.favoriteRestaurantIds.map((restaurantId) => restaurantId.toString()),
    );
  }

  async addFavorite(id: string, restaurantId: string): Promise<void> {
    // Throws if the restaurant doesn't exist — favoriting a bad id shouldn't silently succeed.
    await this.restaurantsService.findByIdOrThrow(restaurantId);
    await this.userModel
      .updateOne(
        { _id: id },
        {
          $addToSet: {
            favoriteRestaurantIds: new Types.ObjectId(restaurantId),
          },
        },
      )
      .exec();
  }

  async removeFavorite(id: string, restaurantId: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        { $pull: { favoriteRestaurantIds: new Types.ObjectId(restaurantId) } },
      )
      .exec();
  }

  private async findByIdOrThrow(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private findAddressOrThrow(
    addresses: SavedAddress[],
    addressId: string,
  ): SavedAddress {
    const address = addresses.find((a) => a._id.toString() === addressId);
    if (!address) throw new NotFoundException('Saved address not found');
    return address;
  }

  private clearDefaults(addresses: SavedAddress[]): void {
    addresses.forEach((a) => {
      a.isDefault = false;
    });
  }
}
