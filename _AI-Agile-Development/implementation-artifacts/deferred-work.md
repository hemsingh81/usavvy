# Deferred Work

## Deferred from: code review of story-1-0 (2026-08-04)

- `eslint-plugin-boundaries` not yet enforced — deferred, already noted as Story 1.0's own Task 6 follow-up; land once real module code exists across services to meaningfully lint.
- Pre-commit hook doesn't run `pnpm test` (only lint+typecheck) — deferred, spec literally only required lint+typecheck; revisit if regressions start slipping through to `review`.
- `gateway`'s `WEB_ORIGIN` supports only a single origin — deferred, speculative ahead of any real multi-environment deployment; AD-11 keeps this local-only for now.
- No CI workflow wiring lint/typecheck/test into PRs — deferred, matches the architecture spine's already-recorded Deferred item (CI/CD pipeline, no deployment target yet).
- ~~AC #1's docker-compose-hosted stack itself unverified in the dev-story session (no reachable Docker daemon in that sandbox)~~ — **Resolved 2026-08-05:** full stack (`docker compose up` + `pnpm dev`) verified end-to-end with a working Docker daemon. Found and fixed two real environment bugs in the process — see Story 1.0's Change Log.

## Deferred from: code review of story-1-1 (2026-08-05)

- No rate limiting on `/auth/*` — already an explicit, documented scope decision in Story 1.1's own Dev Notes (NFR-18 scopes rate-limiting to generation endpoints specifically); revisit if a security pass calls for it.
- No logout/revoke endpoint — the issued refresh token stays valid for its full 30-day lifetime regardless of client-side logout. No AC/task in Epic 1's story list currently calls for one; recommend a future story.
- No resend-verification or forgot-password endpoint — a learner who loses the one 24h verification email is stuck with no self-service recovery. Not in Story 1.1's ACs; recommend a future story.
- `createAuthApi().refresh()` exists and is tested but isn't wired into `useAuth`'s exposed context (no auto-refresh-on-expiry) — no current UI path calls a protected endpoint after initial auth, so nothing exercises the gap yet; the right retry policy is a design choice for whenever a protected page exists.
- No refresh-token-reuse detection (stolen-token signal) — a natural extension of the single-active-refresh-token MVP simplification already documented in Story 1.1's Dev Notes, not a new gap.
- No expired/used verification-token cleanup — needs `JobQueuePort` (AD-15), entirely unwired in this story; genuine follow-up once background jobs exist.
