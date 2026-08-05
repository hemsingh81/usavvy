import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/app/App.js";

describe("App", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    window.history.pushState({}, "", "/");
  });

  it("renders a distinguishable configuration-error state instead of blank-screening on an invalid VITE_API_URL (Review finding, moved from HomePage)", () => {
    vi.stubEnv("VITE_API_URL", "not-a-valid-url");

    render(<App />);

    expect(screen.getByRole("alert")).toHaveTextContent(/configuration error/i);
  });

  it("renders the home page's health check at /", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ gateway: { status: "ok" }, core: { status: "ok", db: true, storage: true } }),
      } as unknown as Response),
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText("System OK")).toBeInTheDocument());
  });

  it("renders the sign-up page at /signup", () => {
    window.history.pushState({}, "", "/signup");

    render(<App />);

    expect(screen.getByRole("heading", { name: "Sign up" })).toBeInTheDocument();
  });

  it("renders the login page at /login", () => {
    window.history.pushState({}, "", "/login");

    render(<App />);

    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });

  it("renders a distinguishable not-found state instead of blank-screening on an unknown route (review finding)", () => {
    window.history.pushState({}, "", "/this-route-does-not-exist");

    render(<App />);

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});
