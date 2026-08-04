import { describe, expect, it } from "vitest";
import { can, ROLES } from "../src/rbac.js";

describe("can", () => {
  it.each(ROLES)("allows %s to read self", (role) => {
    expect(can(role, "read", "self")).toBe(true);
  });

  it("denies an action not present in the seeded permission array (fails closed, not open)", () => {
    // @ts-expect-error -- deliberately passing an action outside the typed Action union
    expect(can("student", "delete", "self")).toBe(false);
  });

  it("denies a resource with no matrix entry at all for the role", () => {
    // @ts-expect-error -- deliberately passing a resource outside the typed Resource union
    expect(can("student", "read", "other-users-profile")).toBe(false);
  });
});
