/**
 * AD-7: roles are config-seeded, DB-assigned per user, role-level only in v1 (no
 * per-user permission overrides). This is the *only* place an authorization decision
 * is made — every route calls `can()` rather than comparing role strings itself.
 */
export const ROLES = ["superadmin", "admin", "mentor", "student"] as const;
export type Role = (typeof ROLES)[number];

type Action = "read";
type Resource = "self";

/**
 * Versioned seed data. Only entries this codebase's routes actually exercise are
 * listed — don't pre-populate permissions for resources that don't exist yet (AD-1's
 * scaffold-on-demand philosophy, applied to config data as well as code). Every role
 * can read its own `/me` record.
 */
const PERMISSION_MATRIX: Record<Role, Partial<Record<Resource, Action[]>>> = {
  superadmin: { self: ["read"] },
  admin: { self: ["read"] },
  mentor: { self: ["read"] },
  student: { self: ["read"] },
};

/**
 * Fails closed: a role/action/resource combination with no matching matrix entry is
 * denied, never allowed by default.
 */
export function can(role: Role, action: Action, resource: Resource): boolean {
  const allowed = PERMISSION_MATRIX[role]?.[resource];
  return allowed?.includes(action) ?? false;
}
