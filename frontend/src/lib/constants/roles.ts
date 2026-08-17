// Mirrors backend/src/users/schemas/user.schema.ts USER_ROLES — keep these in sync; see
// docs/ARCHITECTURE.md §1 on why this is hand-mirrored rather than a shared package.
export const USER_ROLES = ["customer", "restaurant_owner", "rider", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// Mirrors backend SELF_REGISTERABLE_ROLES — the choices offered on the register page.
export const SELF_REGISTERABLE_ROLES = ["customer", "restaurant_owner"] as const;
export type SelfRegisterableRole = (typeof SELF_REGISTERABLE_ROLES)[number];
