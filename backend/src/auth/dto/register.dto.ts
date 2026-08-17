import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SELF_REGISTERABLE_ROLES } from '../../users/schemas/user.schema';
import type { SelfRegisterableRole } from '../../users/schemas/user.schema';

export class RegisterDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, example: 'Str0ngPassw0rd!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt silently truncates beyond 72 bytes — reject longer input explicitly
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'password must contain at least one lowercase letter, one uppercase letter, and one number',
  })
  password: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    enum: SELF_REGISTERABLE_ROLES,
    default: 'customer',
    description:
      'Only customer/restaurant_owner are self-selectable — admin and rider are never open signup.',
  })
  @IsOptional()
  @IsIn(SELF_REGISTERABLE_ROLES)
  role?: SelfRegisterableRole;
}
