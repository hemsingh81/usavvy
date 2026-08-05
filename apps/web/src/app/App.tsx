import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HomePage } from "./HomePage.js";
import { getWebConfig } from "./config.js";
import { ColorThemeProvider } from "./ColorThemeProvider.js";
import { NotificationsProvider } from "./useNotifications.js";
import { AppHeader } from "./AppHeader.js";
import { AuthProvider, LoginPage, SignUpPage, VerifyEmailPage } from "../modules/auth/index.js";
import {
  AccountDeletionPage,
  AgeDeclarationPage,
  DataExportPage,
  OnboardingWizardPage,
  ParentalConsentPage,
  PreferencesPage,
  ProfilePage,
  WaitingForConsentPage,
} from "../modules/users/index.js";

// Review finding: no catch-all route meant an unmatched URL blank-screened instead of
// showing a distinguishable state (AD-17).
function NotFoundPage() {
  return (
    <main>
      <h1>Page not found</h1>
      <p role="alert">There's nothing at this address.</p>
    </main>
  );
}

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
      <ColorThemeProvider>
        <NotificationsProvider>
          <BrowserRouter>
            <AppHeader />
            <Routes>
              <Route path="/" element={<HomePage apiUrl={apiUrl} />} />
              <Route path="/signup" element={<SignUpPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/age-declaration" element={<AgeDeclarationPage />} />
              <Route path="/waiting-for-consent" element={<WaitingForConsentPage />} />
              <Route path="/parental-consent" element={<ParentalConsentPage />} />
              <Route path="/onboarding" element={<OnboardingWizardPage />} />
              <Route path="/preferences" element={<PreferencesPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/account-deletion" element={<AccountDeletionPage />} />
              <Route path="/data-export" element={<DataExportPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </BrowserRouter>
        </NotificationsProvider>
      </ColorThemeProvider>
    </AuthProvider>
  );
}
