// Mirrors backend/src/users/schemas/user.schema.ts USER_ROLES — keep these in sync; see
// docs/ARCHITECTURE.md §1 on why this is hand-mirrored rather than a shared package.
export const USER_ROLES = ['customer', 'restaurant_owner', 'rider', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];
