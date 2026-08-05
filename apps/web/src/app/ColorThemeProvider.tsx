import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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
    // Review finding: logging out left the previous learner's theme applied — session
    // going to null must reset to the no-attribute default, not just skip re-fetching.
    if (!session) {
      setColorTheme(undefined);
      return;
    }
    let cancelled = false;
    const { apiUrl } = getWebConfig();
    createUsersApi(apiUrl)
      .getPreferences(session.accessToken)
      .then((result) => {
        if (cancelled) return;
        // Review finding: this fetch races PreferencesPage's own load-and-possibly-save
        // sequence. Only seed the initial value — never overwrite a theme that's already
        // been set by then (by that page's own more current load, or by a user's actual
        // choice), or a slow-resolving stale response could silently revert a just-saved
        // theme back to what the server held before the save.
        setColorTheme((current) => (current === undefined ? result.colorTheme : current));
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

  const value = useMemo<ColorThemeContextValue>(() => ({ colorTheme, setColorTheme }), [colorTheme]);

  return <ColorThemeContext.Provider value={value}>{children}</ColorThemeContext.Provider>;
}

export function useColorTheme(): ColorThemeContextValue {
  const context = useContext(ColorThemeContext);
  if (!context) {
    throw new Error("useColorTheme must be used within a ColorThemeProvider");
  }
  return context;
}
