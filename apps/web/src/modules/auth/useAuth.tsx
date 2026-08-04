import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AuthSessionResponse } from "@usavvy/shared-types";
import { createAuthApi } from "./api.js";

interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string };
}

export interface AuthContextValue {
  session: Session | null;
  signup: (email: string, password: string) => Promise<{ userId: string }>;
  login: (email: string, password: string) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  googleAuth: (idToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface AuthProviderProps {
  apiUrl: string;
  children: ReactNode;
}

/**
 * MVP scope decision (documented, not a silent gap): the access AND refresh tokens
 * live in memory only, never `localStorage` (an XSS-exfiltrable long-lived token in
 * `localStorage` is a real, avoidable risk). A hard page refresh currently logs the
 * learner out — acceptable for now since nothing sensitive is reachable yet (the
 * Board doesn't exist). Revisit once real session persistence is needed.
 */
export function AuthProvider({ apiUrl, children }: AuthProviderProps) {
  const api = useMemo(() => createAuthApi(apiUrl), [apiUrl]);
  const [session, setSession] = useState<Session | null>(null);

  const applySession = useCallback((result: AuthSessionResponse) => {
    setSession({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user });
  }, []);

  const signup = useCallback((email: string, password: string) => api.signup({ email, password }), [api]);

  const login = useCallback(
    async (email: string, password: string) => {
      applySession(await api.login({ email, password }));
    },
    [api, applySession],
  );

  const verifyEmail = useCallback(
    async (token: string) => {
      applySession(await api.verifyEmail({ token }));
    },
    [api, applySession],
  );

  const googleAuth = useCallback(
    async (idToken: string) => {
      applySession(await api.googleAuth({ idToken }));
    },
    [api, applySession],
  );

  const logout = useCallback(() => setSession(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, signup, login, verifyEmail, googleAuth, logout }),
    [session, signup, login, verifyEmail, googleAuth, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
