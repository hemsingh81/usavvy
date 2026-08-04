---
name: 'Usavvy'
type: review
purpose: version-verification
altitude: initiative
reviews: '../ARCHITECTURE-SPINE.md'
status: complete
created: '2026-08-04'
---

# Version Verification Review — Usavvy Architecture Spine Stack

Verification pass against the Stack table and Design Paradigm / AD-section technology mentions in `ARCHITECTURE-SPINE.md`, performed via live web search on 2026-08-04. Each entry checked for: (a) still actively maintained / not deprecated, (b) the pinned version is a real, current, sensible choice as of now, (c) genuinely free/open-source for local dev use with no paid tier required.

## Findings

### 1. Node.js — pinned "22 LTS"
**Verdict: questionable**
Node 22 is real and still supported, but it moved from Active LTS to **Maintenance LTS** in October 2025 (critical fixes only, EOL 2027-04-30). Node 24 became **Active LTS** in October 2025 and is now the recommended baseline for new 2026 projects, with EOL 2028-04-30 — a full year more runway and full (not maintenance-only) support. Pinning 22 wasn't a fabricated or guessed-forward version, but it's no longer the sensible default for a project starting now; Node 24 LTS is.

### 2. TypeScript — pinned "5.x (strict)"
**Verdict: questionable**
TypeScript 6.0 shipped 2026-03-23 (the final JS-based release, flipping strict/ESM/es2025 to defaults) and 7.0 (Go-native compiler, ~10x faster) reached RC on 2026-06-18. As of the spine's own creation date (2026-08-04), "5.x" is one full major behind current stable. Not broken or deprecated — 5.x remains functional and widely deployed — but not the current default a from-scratch spine should assert without a stated reason.

### 3. Fastify — pinned "5.x"
**Verdict: confirmed-current**
Latest is 5.11.2 (published within days of the spine's date); no Fastify 6 exists or is imminent. Free/OSS (MIT). Good pin.

### 4. React — pinned "19.x"
**Verdict: confirmed-current**
Latest patch is 19.2.7 (June 2026); no React 20 has been announced. Free/OSS (MIT). Good pin.

### 5. Vite — pinned "6.x"
**Verdict: stale**
Vite has moved to major version **8** (8.2.0, released days before the spine's date). Vite 7 shipped June 2025, Vite 8 (Rolldown/Oxc-based) shipped April 2026. Vite 6.x now receives only backported security patches, not features. The pin is two majors behind current.

### 6. pnpm — pinned "9.x (workspaces)"
**Verdict: stale**
pnpm 9.x reached **upstream end-of-life on 2026-04-30** — before the spine's own 2026-08-04 creation date — and is no longer receiving security updates. Current is pnpm 11.x (11.18.0); pnpm 10 remains supported until 2027-04-30 as a fallback. This is the clearest case of a version that was already dead on the day the spine was written.

### 7. PostgreSQL — pinned "17.x + pgvector extension"
**Verdict: questionable (PostgreSQL) / confirmed-current (pgvector)**
PostgreSQL 18 was released 2025-09-25 — nearly a year before the spine's date — with meaningful gains (new I/O subsystem, ~3x read throughput in places, `uuidv7()`, retained planner stats across `pg_upgrade`). PG 17.x is still fully supported (maintenance releases continuing, e.g. 17.10) so it isn't deprecated, just one major behind current stable at time of writing, with no stated reason to stay behind.
pgvector itself is actively maintained — latest release 0.8.0 (2026-07-06), with 2026-era work on iterative scans, parallel HNSW builds, halfvec quantization. Confirmed-current, no issues.

### 8. Drizzle ORM — pinned "latest stable"
**Verdict: confirmed-current**
Pin is self-updating by design. Project is actively maintained (v1.0 beta releases in progress per the Drizzle team's own release notes as of 2026). Free/OSS. No issues.

### 9. Vitest / React Testing Library / Playwright — pinned "latest stable"
**Verdict: confirmed-current (all three)**
- Vitest: stable 4.1.10, with a 5.0 beta in flight — active development, no red flags.
- React Testing Library: 16.3.2, confirmed React 19-compatible — active development.
- Playwright: 1.61.1 stable (Microsoft), releases continuing through mid-2026 — active development.
All three free/OSS (MIT), no paid tier required for any local dev use. Good pins as stated ("latest stable" tracks correctly).

### 10. MinIO — pinned "latest (S3-compatible, local dev)"
**Verdict: stale — flag seriously**
This is the most significant finding of the review. MinIO's open-source/community edition has effectively been discontinued during the period leading up to the spine's own creation date:
- Free Docker Hub/Quay image publishing **stopped 2025-10-23** — no more official prebuilt community images.
- Admin Web UI functionality was stripped from the FOSS build starting **May 2025**, pushed behind the commercial "AIStor Enterprise" product (list price ~$96,000/yr).
- The community repo was placed in maintenance mode **December 2025**, archived **February 2026**, briefly unarchived, then archived for good on **2026-04-25** — before the spine's 2026-08-04 date. No new features, compatibility fixes, or promised security patches going forward.
- It is still technically AGPLv3/open-source (no relicensing occurred, unlike the 2021 AGPL controversy), and old builds still run for local dev — but the spine's framing of "latest" is inaccurate since there is no more "latest" being published, and the trajectory (stripped features, no maintenance, commercial-upsell pressure) works against the "genuinely free for local dev" claim the spine implicitly makes.
- Actively maintained alternatives exist as drop-in S3-compatible replacements (SeaweedFS, Garage, RustFS), which AD-6's `StoragePort` abstraction already makes a cheap adapter swap. Recommend the team re-evaluate the dev `storage/minio` adapter choice against one of these before it hardens into build-time assumptions.

## Summary Table

| # | Technology | Pinned version | Verdict |
| --- | --- | --- | --- |
| 1 | Node.js | 22 LTS | questionable — Node 24 is now the sensible Active-LTS default |
| 2 | TypeScript | 5.x | questionable — TS 6.0 stable since March 2026 |
| 3 | Fastify | 5.x | confirmed-current |
| 4 | React | 19.x | confirmed-current |
| 5 | Vite | 6.x | stale — two majors behind (current is 8.x) |
| 6 | pnpm | 9.x | stale — pnpm 9 reached EOL 2026-04-30, before spine's date |
| 7 | PostgreSQL | 17.x | questionable — PG 18 released Sept 2025, one major behind |
| 7b | pgvector | extension, unpinned | confirmed-current |
| 8 | Drizzle ORM | latest stable | confirmed-current |
| 9 | Vitest | latest stable | confirmed-current |
| 9b | React Testing Library | latest stable | confirmed-current |
| 9c | Playwright | latest stable | confirmed-current |
| 10 | MinIO | latest | stale — community edition archived/discontinued as of April 2026 |
