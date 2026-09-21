// Mirrors backend/src/users/schemas/user.schema.ts USER_ROLES — keep these in sync; see
// docs/ARCHITECTURE.md §1 on why this is hand-mirrored rather than a shared package.
export const USER_ROLES = ["customer", "restaurant_owner", "rider", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// Mirrors backend SELF_REGISTERABLE_ROLES — the choices offered on the register page.
export const SELF_REGISTERABLE_ROLES = ["customer", "restaurant_owner"] as const;
export type SelfRegisterableRole = (typeof SELF_REGISTERABLE_ROLES)[number];

// Mirrors backend ROLE_CHANGE_TARGETS (docs/ROADMAP.md FDP-139) — the only two roles
// PATCH /users/:id/role ever accepts as a target. restaurant_owner/rider are permanently
// excluded: an owner is set at self-registration, a rider only through its own apply-then-
// verify flow, never through the generic admin role-change control.
export const ROLE_CHANGE_TARGETS = ["customer", "admin"] as const;
export type RoleChangeTarget = (typeof ROLE_CHANGE_TARGETS)[number];

// Mirrors backend USER_STATUSES (docs/ROADMAP.md FDP-89).
export const USER_STATUSES = ["active", "suspended"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
