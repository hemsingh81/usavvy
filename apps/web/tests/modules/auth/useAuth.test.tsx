import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../../../src/modules/auth/useAuth.js";

describe("useAuth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when used outside an AuthProvider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(/must be used within an AuthProvider/);
  });

  it("starts with no session, and login populates it from the server response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ accessToken: "a", refreshToken: "b", user: { id: "u1", email: "e@example.com", role: "student" } }),
      } as unknown as Response),
    );

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider apiUrl="http://localhost:3000">{children}</AuthProvider>,
    });

    expect(result.current.session).toBeNull();

    await result.current.login("e@example.com", "a-long-enough-password");

    await waitFor(() => expect(result.current.session).toEqual({ accessToken: "a", refreshToken: "b", user: { id: "u1", email: "e@example.com", role: "student" } }));
  });

  it("logout clears the session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ accessToken: "a", refreshToken: "b", user: { id: "u1", email: "e@example.com", role: "student" } }),
      } as unknown as Response),
    );

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider apiUrl="http://localhost:3000">{children}</AuthProvider>,
    });

    await result.current.login("e@example.com", "a-long-enough-password");
    await waitFor(() => expect(result.current.session).not.toBeNull());

    result.current.logout();

    await waitFor(() => expect(result.current.session).toBeNull());
  });
});
