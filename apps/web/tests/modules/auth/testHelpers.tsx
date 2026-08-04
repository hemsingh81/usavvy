import { StrictMode, type ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../../src/modules/auth/useAuth.js";

export function withProviders(ui: ReactElement, initialEntries: string[] = ["/"]) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider apiUrl="http://localhost:3000">{ui}</AuthProvider>
    </MemoryRouter>
  );
}

/** Wraps in StrictMode too — dev double-invokes effects, which a one-time-use mutation must survive. */
export function withProvidersStrict(ui: ReactElement, initialEntries: string[] = ["/"]) {
  return <StrictMode>{withProviders(ui, initialEntries)}</StrictMode>;
}
