import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "../../src/shared/Switch.js";

describe("Switch", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders with the given label", () => {
    render(<Switch label="Voice" checked={false} onCheckedChange={() => undefined} />);

    expect(screen.getByRole("switch", { name: "Voice" })).toBeInTheDocument();
  });

  it("reflects the checked prop", () => {
    render(<Switch label="Voice" checked={true} onCheckedChange={() => undefined} />);

    expect(screen.getByRole("switch", { name: "Voice" })).toHaveAttribute("aria-checked", "true");
  });

  it("calls onCheckedChange with the new value when clicked", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch label="Voice" checked={false} onCheckedChange={onCheckedChange} />);

    await user.click(screen.getByRole("switch", { name: "Voice" }));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
