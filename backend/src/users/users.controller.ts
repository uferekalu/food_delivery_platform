import {
  Body,
  Controller,
  NotFoundException,
  Param,
  Patch,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { UsersService } from './users.service';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
}
