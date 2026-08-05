import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Avatar } from "../../src/shared/Avatar.js";

describe("Avatar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the first two initials of a multi-word label, uppercased", () => {
    render(<Avatar label="ananya sharma" />);

    expect(screen.getByText("AS")).toBeInTheDocument();
  });

  it("renders the first two characters of a single-word label, uppercased", () => {
    render(<Avatar label="ananya" />);

    expect(screen.getByText("AN")).toBeInTheDocument();
  });

  it("is hidden from assistive tech (decorative — the display name text next to it carries the meaning)", () => {
    const { container } = render(<Avatar label="Ananya" />);

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it("the same label always produces the same background color across separate renders (determinism, not a fixed literal value)", () => {
    const { container: first } = render(<Avatar label="ananya@example.com" />);
    const firstColor = (first.firstElementChild as HTMLElement).style.backgroundColor;
    cleanup();

    const { container: second } = render(<Avatar label="ananya@example.com" />);
    const secondColor = (second.firstElementChild as HTMLElement).style.backgroundColor;

    expect(firstColor).toBe(secondColor);
    expect(firstColor).not.toBe("");
  });

  it("two different labels can produce different colors", () => {
    const { container: first } = render(<Avatar label="ananya@example.com" />);
    const firstColor = (first.firstElementChild as HTMLElement).style.backgroundColor;
    cleanup();

    const { container: second } = render(<Avatar label="ravi@example.com" />);
    const secondColor = (second.firstElementChild as HTMLElement).style.backgroundColor;

    expect(firstColor).not.toBe(secondColor);
  });
});
