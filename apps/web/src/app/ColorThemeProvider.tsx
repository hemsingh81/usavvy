import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ColorTheme } from "@usavvy/shared-types";
import { getWebConfig } from "./config.js";
import { useAuth } from "../modules/auth/index.js";
import { createUsersApi } from "../modules/users/api.js";

export interface ColorThemeContextValue {
  colorTheme: ColorTheme | undefined;
  setColorTheme: (theme: ColorTheme) => void;
}

const ColorThemeContext = createContext<ColorThemeContextValue | undefined>(undefined);

/**
 * Story 1.9 (FR-A-9). Mirrors AuthProvider's shape. Owns the `data-color-theme`
 * attribute on <html> so tokens.css's preset override blocks apply app-wide, not just
 * on the Preferences page (AC #2). On mount, fetches the learner's saved theme once —
 * a failed fetch is non-critical enrichment (same as HomePage's own getMe call) and
 * silently keeps the default rather than blocking render.
 */
export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [colorTheme, setColorTheme] = useState<ColorTheme | undefined>(undefined);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const { apiUrl } = getWebConfig();
    createUsersApi(apiUrl)
      .getPreferences(session.accessToken)
      .then((result) => {
        if (cancelled) return;
        setColorTheme(result.colorTheme);
      })
      .catch(() => {
        // Non-critical enrichment — keep the default (no data-color-theme attribute).
      });
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    if (colorTheme === undefined) {
      delete document.documentElement.dataset.colorTheme;
      return;
    }
    document.documentElement.dataset.colorTheme = colorTheme;
  }, [colorTheme]);

  return <ColorThemeContext.Provider value={{ colorTheme, setColorTheme }}>{children}</ColorThemeContext.Provider>;
}

export function useColorTheme(): ColorThemeContextValue {
  const context = useContext(ColorThemeContext);
  if (!context) {
    throw new Error("useColorTheme must be used within a ColorThemeProvider");
  }
  return context;
}
