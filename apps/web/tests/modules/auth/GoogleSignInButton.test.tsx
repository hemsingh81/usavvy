import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { GoogleSignInButton } from "../../../src/modules/auth/GoogleSignInButton.js";
import { withProviders } from "./testHelpers.js";

describe("GoogleSignInButton", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("renders nothing when VITE_GOOGLE_CLIENT_ID is not configured (omitted, not a button that 503s on click)", () => {
    const { container } = render(withProviders(<GoogleSignInButton onError={() => undefined} onSuccess={() => undefined} />));

    expect(container).toBeEmptyDOMElement();
  });
});
