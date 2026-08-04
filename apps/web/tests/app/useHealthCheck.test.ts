import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { useHealthCheck } from "../../src/app/useHealthCheck.js";

describe("useHealthCheck", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("starts in the loading state", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    const { result } = renderHook(() => useHealthCheck("http://localhost:3000"));

    expect(result.current).toEqual({ kind: "loading" });
  });

  it("resolves to ok when core is ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ gateway: { status: "ok" }, core: { status: "ok", db: true, storage: true } }),
      } as unknown as Response),
    );

    const { result } = renderHook(() => useHealthCheck("http://localhost:3000"));

    await waitFor(() => expect(result.current).toEqual({ kind: "ok" }));
  });

  it("resolves to degraded when core reports unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ gateway: { status: "ok" }, core: { status: "unreachable" } }),
      } as unknown as Response),
    );

    const { result } = renderHook(() => useHealthCheck("http://localhost:3000"));

    await waitFor(() => expect(result.current).toEqual({ kind: "degraded", detail: "core service unreachable" }));
  });

  it("resolves to error, not a hang, when the gateway body fails schema validation (Review finding)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ gateway: { status: "ok" }, core: { status: "some-made-up-status" } }),
      } as unknown as Response),
    );

    const { result } = renderHook(() => useHealthCheck("http://localhost:3000"));

    await waitFor(() => expect(result.current.kind).toBe("error"));
  });

  it("passes an AbortSignal so a hung gateway cannot wait forever (Review finding: no timeout)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ gateway: { status: "ok" }, core: { status: "ok", db: true, storage: true } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useHealthCheck("http://localhost:3000"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
