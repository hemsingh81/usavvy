import { describe, expect, it } from "vitest";
import { getActivityHistory } from "../../../src/modules/users/service.js";

describe("getActivityHistory", () => {
  it("returns [] (the only correct behavior today — no Epic 3/6/7 source data exists yet)", async () => {
    const result = await getActivityHistory();

    expect(result).toEqual([]);
  });
});
