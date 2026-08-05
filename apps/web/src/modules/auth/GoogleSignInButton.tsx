import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { getWebConfig } from "../../app/config.js";
import { useAuth, type Session } from "./useAuth.js";

export interface GoogleSignInButtonProps {
  onError: (message: string) => void;
  onSuccess: (session: Session) => void;
}

/**
 * Renders only when VITE_GOOGLE_CLIENT_ID is configured (Task 7) — omitted entirely
 * rather than rendering a button that fails on click, since Google sign-in needs a
 * real registered OAuth client even in dev (no mock adapter can stand in for it).
 */
export function GoogleSignInButton({ onError, onSuccess }: GoogleSignInButtonProps) {
  const { googleClientId } = getWebConfig();
  const { googleAuth } = useAuth();

  if (!googleClientId) {
    return null;
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <GoogleLogin
        onSuccess={(credentialResponse) => {
          if (!credentialResponse.credential) {
            onError("Google sign-in did not return a credential");
            return;
          }
          googleAuth(credentialResponse.credential).then(onSuccess).catch(() => onError("Google sign-in failed"));
        }}
        onError={() => onError("Google sign-in failed")}
      />
    </GoogleOAuthProvider>
  );
}
