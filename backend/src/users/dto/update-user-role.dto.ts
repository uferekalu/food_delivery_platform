import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

// Deliberately narrower than the full USER_ROLES list (docs/ROADMAP.md FDP-139) — this endpoint
// only ever toggles a customer to/from admin. `restaurant_owner` and `rider` are never valid
// targets here: an owner is set at self-registration, a rider only through its own
// apply-then-verify flow (POST /riders/apply + PATCH /riders/:id/verify) — changing either
// through this generic endpoint was an unintentional footgun, not a supported path.
export const ROLE_CHANGE_TARGETS = ['customer', 'admin'] as const;
export type RoleChangeTarget = (typeof ROLE_CHANGE_TARGETS)[number];

export class UpdateUserRoleDto {
  @ApiProperty({ enum: ROLE_CHANGE_TARGETS })
  @IsIn(ROLE_CHANGE_TARGETS)
  role: RoleChangeTarget;
}
