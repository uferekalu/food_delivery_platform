import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { USER_ROLES } from '../schemas/user.schema';
import type { UserRole } from '../schemas/user.schema';

export class UpdateUserRoleDto {
  @ApiProperty({ enum: USER_ROLES })
  @IsIn(USER_ROLES)
  role: UserRole;
}
