import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AuthSessionResponse, MeResponse } from "@usavvy/shared-types";
import { createAuthApi } from "./api.js";

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string };
}

export interface AuthContextValue {
  session: Session | null;
  signup: (email: string, password: string) => Promise<{ userId: string }>;
  login: (email: string, password: string) => Promise<Session>;
  verifyEmail: (token: string) => Promise<Session>;
  googleAuth: (idToken: string) => Promise<Session>;
  logout: () => void;
  // Story 1.2: the first real consumer of /me — used to decide where post-auth
  // navigation lands (age declaration / waiting-for-consent / home). Takes an
  // explicit accessToken rather than reading `session` from context: `setSession`
  // is asynchronous, so a caller invoking this immediately after `login`/
  // `verifyEmail`/`googleAuth` resolves would otherwise read a stale pre-update
  // closure of `session` (a real bug found via this exact sequence in testing).
  getMe: (accessToken: string) => Promise<MeResponse>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface AuthProviderProps {
  apiUrl: string;
  children: ReactNode;
}

/**
 * MVP scope decision (documented, not a silent gap): the access AND refresh tokens
 * live in memory only, never `localStorage`. This doesn't defend against XSS itself —
 * live XSS can read in-memory React state as easily as `localStorage` (review
 * finding: an earlier version of this comment overstated the protection). What it
 * does avoid is a long-lived credential sitting in a location that persists across
 * reloads and is readable by any script on the page indefinitely, not just during an
 * active XSS window. A hard page refresh currently logs the learner out — acceptable
 * for now since nothing sensitive is reachable yet (the Board doesn't exist). Revisit
 * once real session persistence is needed.
 */
export function AuthProvider({ apiUrl, children }: AuthProviderProps) {
  const api = useMemo(() => createAuthApi(apiUrl), [apiUrl]);
  const [session, setSession] = useState<Session | null>(null);

  // Returns the new Session synchronously (not just setting state) so a caller can use
  // its accessToken immediately without waiting for a re-render.
  const applySession = useCallback((result: AuthSessionResponse): Session => {
    const next: Session = { accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user };
    setSession(next);
    return next;
  }, []);

  const signup = useCallback((email: string, password: string) => api.signup({ email, password }), [api]);

  const login = useCallback(
    async (email: string, password: string): Promise<Session> => applySession(await api.login({ email, password })),
    [api, applySession],
  );

  const verifyEmail = useCallback(
    async (token: string): Promise<Session> => applySession(await api.verifyEmail({ token })),
    [api, applySession],
  );

  const googleAuth = useCallback(
    async (idToken: string): Promise<Session> => applySession(await api.googleAuth({ idToken })),
    [api, applySession],
  );

  const logout = useCallback(() => setSession(null), []);

  const getMe = useCallback((accessToken: string): Promise<MeResponse> => api.me(accessToken), [api]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, signup, login, verifyEmail, googleAuth, logout, getMe }),
    [session, signup, login, verifyEmail, googleAuth, logout, getMe],
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
