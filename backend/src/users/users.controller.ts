import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { UsersService } from './users.service';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateSavedAddressDto } from './dto/create-saved-address.dto';
import { UpdateSavedAddressDto } from './dto/update-saved-address.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import type { UserDocument } from './schemas/user.schema';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me')
  async updateProfile(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    const updated = await this.usersService.updateProfile(user.sub, dto);
    return {
      id: updated._id.toString(),
      email: updated.email,
      name: updated.name,
      role: updated.role,
      isEmailVerified: updated.isEmailVerified,
      avatarUrl: updated.avatarUrl,
      phone: updated.phone,
    };
  }

  @Get('me/addresses')
  listAddresses(@CurrentUser() user: AccessTokenPayload) {
    return this.usersService.listAddresses(user.sub);
  }

  @Post('me/addresses')
  addAddress(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateSavedAddressDto,
  ) {
    return this.usersService.addAddress(user.sub, dto);
  }

  @Patch('me/addresses/:addressId')
  updateAddress(
    @CurrentUser() user: AccessTokenPayload,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateSavedAddressDto,
  ) {
    return this.usersService.updateAddress(user.sub, addressId, dto);
  }

  @Delete('me/addresses/:addressId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAddress(
    @CurrentUser() user: AccessTokenPayload,
    @Param('addressId') addressId: string,
  ) {
    return this.usersService.removeAddress(user.sub, addressId);
  }

  @Get('me/favorites')
  listFavorites(@CurrentUser() user: AccessTokenPayload) {
    return this.usersService.listFavorites(user.sub);
  }

  @Post('me/favorites/:restaurantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  addFavorite(
    @CurrentUser() user: AccessTokenPayload,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.usersService.addFavorite(user.sub, restaurantId);
  }

  @Delete('me/favorites/:restaurantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFavorite(
    @CurrentUser() user: AccessTokenPayload,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.usersService.removeFavorite(user.sub, restaurantId);
  }

  /**
   * The only way any user reaches `admin` or `rider` after registration (both are excluded
   * from self-service signup — see SELF_REGISTERABLE_ROLES). The very first admin has to be
   * bootstrapped via `npm run seed:admin` (see backend/CLAUDE.md) since this endpoint itself
   * requires an existing admin to call it.
   */
  @Roles('admin')
  @Patch(':id/role')
  async updateRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
    const user = await this.usersService.updateRole(id, dto.role);
    if (!user) throw new NotFoundException('User not found');
    return { id: user._id.toString(), email: user.email, role: user.role };
  }

  /** Admin user management (docs/ROADMAP.md FDP-89). */
  @Roles('admin')
  @Get()
  async listAll(@Query() query: ListUsersDto) {
    const result = await this.usersService.listAll(query);
    return { ...result, items: result.items.map(toAdminUserView) };
  }

  @Roles('admin')
  @Patch(':id/suspend')
  async suspend(
    @CurrentUser() requester: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: SuspendUserDto,
  ) {
    const user = await this.usersService.suspend(id, requester.sub, dto.reason);
    return toAdminUserView(user);
  }

  @Roles('admin')
  @Patch(':id/reactivate')
  async reactivate(@Param('id') id: string) {
    const user = await this.usersService.reactivate(id);
    return toAdminUserView(user);
  }
}

function toAdminUserView(user: UserDocument) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    suspendedAt: user.suspendedAt,
    suspendedReason: user.suspendedReason,
    isEmailVerified: user.isEmailVerified,
    isPhoneVerified: user.isPhoneVerified,
    // `@Schema({ timestamps: true })` adds this at runtime but not to the generated TS class.
    createdAt: (user as unknown as { createdAt: Date }).createdAt,
  };
}
