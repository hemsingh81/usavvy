import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { ColorThemeProvider, useColorTheme } from "../../src/app/ColorThemeProvider.js";

const useAuthMock = vi.fn();

vi.mock("../../src/modules/auth/index.js", () => ({
  useAuth: () => useAuthMock(),
}));

const DEFAULT_PREFERENCES = {
  voiceEnabled: true,
  speechRate: 1,
  boardTheme: "dark",
  explanationStyle: "concise",
  captionsEnabled: false,
  reducedMotion: false,
  colorTheme: "midnight",
};

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);
}

describe("ColorThemeProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthMock.mockReset();
    delete document.documentElement.dataset.colorTheme;
  });

  it("throws when used outside a ColorThemeProvider", () => {
    expect(() => renderHook(() => useColorTheme())).toThrow(/must be used within a ColorThemeProvider/);
  });

  it("applies the fetched colorTheme to document.documentElement.dataset.colorTheme once a session exists", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(await jsonResponse(DEFAULT_PREFERENCES)));

    renderHook(() => useColorTheme(), { wrapper: ({ children }) => <ColorThemeProvider>{children}</ColorThemeProvider> });

    await waitFor(() => expect(document.documentElement.dataset.colorTheme).toBe("midnight"));
  });

  it("does not fetch, and leaves the default with no data-color-theme attribute, when there is no session", () => {
    useAuthMock.mockReturnValue({ session: null });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useColorTheme(), { wrapper: ({ children }) => <ColorThemeProvider>{children}</ColorThemeProvider> });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.colorTheme).toBeUndefined();
  });

  it("setColorTheme updates the DOM attribute directly", async () => {
    useAuthMock.mockReturnValue({ session: null });

    const { result } = renderHook(() => useColorTheme(), { wrapper: ({ children }) => <ColorThemeProvider>{children}</ColorThemeProvider> });

    result.current.setColorTheme("high-contrast");

    await waitFor(() => expect(document.documentElement.dataset.colorTheme).toBe("high-contrast"));
  });

  it("a mount-time fetch failure doesn't crash the app and silently keeps the default", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    renderHook(() => useColorTheme(), { wrapper: ({ children }) => <ColorThemeProvider>{children}</ColorThemeProvider> });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.documentElement.dataset.colorTheme).toBeUndefined();
  });
});
