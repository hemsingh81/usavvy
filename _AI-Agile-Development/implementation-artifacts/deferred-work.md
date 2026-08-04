# Deferred Work

## Deferred from: code review of story-1-0 (2026-08-04)

- `eslint-plugin-boundaries` not yet enforced — deferred, already noted as Story 1.0's own Task 6 follow-up; land once real module code exists across services to meaningfully lint.
- Pre-commit hook doesn't run `pnpm test` (only lint+typecheck) — deferred, spec literally only required lint+typecheck; revisit if regressions start slipping through to `review`.
- `gateway`'s `WEB_ORIGIN` supports only a single origin — deferred, speculative ahead of any real multi-environment deployment; AD-11 keeps this local-only for now.
- No CI workflow wiring lint/typecheck/test into PRs — deferred, matches the architecture spine's already-recorded Deferred item (CI/CD pipeline, no deployment target yet).
- AC #1's docker-compose-hosted stack itself unverified in the dev-story session (no reachable Docker daemon in that sandbox) — deferred, addressed by the Docker deployment done immediately after this review.
