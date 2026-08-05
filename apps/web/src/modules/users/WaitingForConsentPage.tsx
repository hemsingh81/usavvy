/**
 * AC #2: calm, informational tone per DESIGN.md's minor-consent-gate component —
 * primary accent, full surface background, never the error/warning treatment. A minor
 * waiting on consent is a normal, expected state, not a flagged one.
 */
export function WaitingForConsentPage() {
  return (
    <main>
      <h1>Waiting for parental consent</h1>
      <div className="usavvy-banner-info" role="status">
        We&apos;ve sent an email to your parent or guardian. Once they grant consent, you&apos;ll be able to continue.
      </div>
    </main>
  );
}
