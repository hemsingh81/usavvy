/**
 * AD-7: roles are config-seeded, DB-assigned per user, role-level only in v1 (no
 * per-user permission overrides). This is the *only* place an authorization decision
 * is made — every route calls `can()` rather than comparing role strings itself.
 */
export const ROLES = ["superadmin", "admin", "mentor", "student"] as const;
export type Role = (typeof ROLES)[number];

type Action = "read" | "create" | "update" | "delete";
type Resource = "self" | "courseHierarchy";

/**
 * Versioned seed data. Only entries this codebase's routes actually exercise are
 * listed — don't pre-populate permissions for resources that don't exist yet (AD-1's
 * scaffold-on-demand philosophy, applied to config data as well as code). Every role
 * can read its own `/me` record. Story 2.1 (FR-C-1): `courseHierarchy` writes are
 * `admin`/`superadmin` only — the architecture's own rule that the PRD's Content-Ops
 * persona maps to the `admin` RBAC role. Reading the hierarchy is intentionally NOT
 * gated through `can()` at all (a future catalog/browse story needs every role to
 * read it), so there's no `courseHierarchy: ["read"]` entry here.
 */
const PERMISSION_MATRIX: Record<Role, Partial<Record<Resource, Action[]>>> = {
  superadmin: { self: ["read"], courseHierarchy: ["create", "update", "delete"] },
  admin: { self: ["read"], courseHierarchy: ["create", "update", "delete"] },
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
