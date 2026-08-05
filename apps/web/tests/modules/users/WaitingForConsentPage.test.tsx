import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WaitingForConsentPage } from "../../../src/modules/users/WaitingForConsentPage.js";

describe("WaitingForConsentPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a calm informational status, not an error banner", () => {
    render(<WaitingForConsentPage />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/parent or guardian/i);
    expect(status).toHaveClass("usavvy-banner-info");
  });
});
