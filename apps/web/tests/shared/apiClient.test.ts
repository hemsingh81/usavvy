import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequestBlob, ApiError } from "../../src/shared/apiClient.js";

describe("apiRequestBlob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a Blob on a successful response", async () => {
    const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiRequestBlob("http://localhost:3000", "/users/data-export/pdf", "a-token");

    expect(result).toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/users/data-export/pdf",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer a-token" }) }),
    );
  });

  it("throws ApiError with the parsed error envelope's message on a failed response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { code: "UNAUTHENTICATED", message: "authentication required" } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequestBlob("http://localhost:3000", "/users/data-export/pdf", "a-token")).rejects.toMatchObject(
      new ApiError("UNAUTHENTICATED", "authentication required"),
    );
  });

  it("throws a NETWORK_ERROR ApiError when the fetch itself fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequestBlob("http://localhost:3000", "/users/data-export/pdf", "a-token")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });
});

describe("ApiError", () => {
  it("carries an optional structured details payload (Story 2.4: DEPENDENCY_CONFLICT's conflict list)", () => {
    const conflicts = [{ topicId: "t1", requiredByTopicId: "t2" }];

    const error = new ApiError("DEPENDENCY_CONFLICT", "conflict", conflicts);

    expect(error.details).toEqual(conflicts);
  });

  it("defaults details to undefined when not given", () => {
    const error = new ApiError("NOT_FOUND", "missing");

    expect(error.details).toBeUndefined();
  });
});
