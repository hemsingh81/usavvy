import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HomePage } from "./HomePage.js";
import { getWebConfig } from "./config.js";
import { AuthProvider, LoginPage, SignUpPage, VerifyEmailPage } from "../modules/auth/index.js";

export function App() {
  // AD-17: same config-error handling as HomePage — a misconfigured VITE_API_URL must
  // not blank-screen the app.
  let apiUrl: string;
  try {
    apiUrl = getWebConfig().apiUrl;
  } catch (error) {
    return (
      <main>
        <h1>Usavvy</h1>
        <p role="alert">Configuration error — {error instanceof Error ? error.message : String(error)}</p>
      </main>
    );
  }

  return (
    <AuthProvider apiUrl={apiUrl}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage apiUrl={apiUrl} />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
