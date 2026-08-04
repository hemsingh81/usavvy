# Usavvy

AI-avatar interactive learning platform. Backend is a set of independently-deployable
microservices (`services/*`), each internally hexagonal (ports-and-adapters); frontend is
a single React SPA (`apps/web`) that talks only to `gateway`. See
`_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md`
for the full set of architectural decisions.

## Prerequisites

- Node.js 24 LTS
- pnpm 11.x (`npm install -g pnpm` if you don't have it)
- Docker (for the stateful dependencies — Postgres, Redis, SeaweedFS)

## Quick start

```sh
pnpm install
pnpm infra:up   # Postgres+pgvector, Redis, SeaweedFS — the only containerized services
pnpm dev        # gateway + core + web, running natively for fast HMR
```

Then open `http://localhost:5173` — the home page calls `gateway`'s `/health`, which in
turn calls `core`'s `/health` over a real HTTP request, and displays the aggregated
result.

To bring the stateful dependencies down: `pnpm infra:down`.

## Ports (local dev defaults)

| Service | Port |
| --- | --- |
| `apps/web` (Vite dev server) | 5173 |
| `services/gateway` | 3000 |
| `services/core` | 3001 |
| Postgres | 5432 |
| Redis | 6379 |
| SeaweedFS (S3 gateway) | 8333 |

## Configuration

Every service validates its own config at boot from environment variables (via
`packages/config`'s composable zod schema, AD-12) — nothing reads `process.env` directly
inside business logic. The defaults above match `infra/docker-compose.yml`'s credentials,
so **no `.env` file is required for local dev out of the box**.

To override anything, create a `.env` file inside the relevant `services/<name>/`
directory (each service's `dev` script loads it automatically via Node's
`--env-file-if-exists`, no extra tooling needed) — for example
`services/core/.env`:

```
PORT=3001
DATABASE_URL=postgres://usavvy:usavvy@localhost:5432/usavvy_core
STORAGE_ENDPOINT=http://localhost:8333
NOTIFICATION_ADAPTER=mock
```

See each service's `src/config.ts` for its full schema and defaults.

## Project structure

```
apps/web/            React 19 + Vite 8 SPA — talks only to gateway
services/gateway/     BFF: JWT verification, routing/aggregation, CORS
services/core/        auth/users, RBAC, NotificationPort (other services are scaffolded
                       per-epic as their stories start — see AD-1's scaffold-on-demand rule)
packages/shared-types/ DTOs and schemas shared by every service and the frontend
packages/config/       composable, zod-validated config-schema builder (AD-12)
packages/service-kernel/ structured logger, DB-ping, storage-ping — shared by every service
infra/                 docker-compose.yml for Postgres/Redis/SeaweedFS (AD-11)
```

## Common commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | run all scaffolded services + web, natively, concurrently |
| `pnpm test` | run every workspace package's test suite |
| `pnpm typecheck` | `tsc --noEmit` across every workspace package |
| `pnpm lint` | ESLint across the repo |
| `pnpm build` | production build for every workspace package |

A Husky pre-commit hook runs `lint` + `typecheck` automatically.
