import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement ResizeObserver — Radix's Switch (Story 1.4) reads it via an
// internal useSize hook. A minimal no-op stub is enough for tests; real layout
// measurement isn't meaningful in jsdom regardless.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
