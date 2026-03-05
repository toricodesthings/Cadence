# ✦ Cadence Backend

> **The hyper-accelerated, trustless edge API for Cadence.**

A standalone Hono API deployed on Cloudflare Workers, serving both `cadence-frontend` (React Router) and `cadence-mobile` (Expo) with full type-safe RPC parity.

---

## Stack

| Layer      | Technology                              |
| ---------- | --------------------------------------- |
| Runtime    | Cloudflare Workers                      |
| Framework  | Hono v4 (typed RPC via `hc`)            |
| ORM        | Drizzle ORM                             |
| Database   | Neon Postgres via Cloudflare Hyperdrive |
| Auth       | Neon Auth (JWT verification at edge)    |
| Validation | Zod + `@hono/zod-validator`             |

## Project Structure

```
src/
├── index.ts              # Hono app entry, middleware, route mounting
├── types/                # Zod schemas & TS interfaces (centralized)
│   ├── env.ts            # Cloudflare bindings interface
│   ├── auth.ts           # JWT payload schema
│   ├── task.ts           # Task validation schemas
│   ├── project.ts        # Project validation schemas
│   ├── inbox.ts          # Inbox item schemas
│   └── common.ts         # Pagination, UUID params, API envelope
├── lib/                  # Shared utilities (DRY)
│   ├── db.ts             # Drizzle client from Hyperdrive
│   ├── auth.ts           # JWT verification middleware
│   ├── rls.ts            # Postgres RLS context injection
│   └── errors.ts         # Error handling utilities
├── routes/               # Thin route controllers
│   ├── tasks.ts          # Task CRUD + reorder + batch state
│   ├── projects.ts       # Project CRUD
│   ├── inbox.ts          # Inbox creation + listing
│   └── health.ts         # Liveness probe
└── db/
    └── schema.ts         # Drizzle schema (source of truth)
```

## Coding Standards

- **UCURD Ordering** — DB operation files organize as: Utility → Create → Update → Read → Delete
- **DRY** — Shared logic lives in `src/lib/`
- **Clean Functions** — One function = one job, max 3–4 params (object if more)
- **Centralized Types** — All Zod schemas and interfaces in `src/types/`

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) or Node.js 20+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- Neon database (provisioned, schema migrated)
- Cloudflare account with Hyperdrive configured

### Install

```bash
bun install
```

### Local Development

```bash
bun run dev
```

### Generate Cloudflare Bindings Types

```bash
bun run cf-typegen
```

### Database Commands

```bash
bun run db:generate   # Generate migration SQL from schema.ts
bun run db:migrate    # Apply migrations
bun run db:studio     # Open Drizzle Studio GUI
```

### Deploy

```bash
bun run deploy
```

## Environment

Set via `wrangler secret put`:

| Secret               | Description                                  |
| -------------------- | -------------------------------------------- |
| `NEON_AUTH_JWKS_URL` | Neon Auth JWKS endpoint for JWT verification |

Bindings in `wrangler.jsonc`:

| Binding        | Type       | Purpose                     |
| -------------- | ---------- | --------------------------- |
| `HYPERDRIVE`   | Hyperdrive | Pooled Neon DB connection   |
| `RATE_LIMITER` | Rate Limit | Per-user edge rate limiting |

## API Routes

All `/api/*` routes require `Authorization: Bearer <JWT>`.

| Method   | Path                     | Description              |
| -------- | ------------------------ | ------------------------ |
| `GET`    | `/health`                | Liveness probe (public)  |
| `GET`    | `/api/tasks`             | List tasks (filterable)  |
| `POST`   | `/api/tasks`             | Create a task            |
| `GET`    | `/api/tasks/:id`         | Get single task          |
| `PATCH`  | `/api/tasks/:id`         | Update a task            |
| `PATCH`  | `/api/tasks/:id/reorder` | Drag-and-drop reorder    |
| `PATCH`  | `/api/tasks/batch/state` | Batch state transition   |
| `DELETE` | `/api/tasks/:id`         | Delete a task            |
| `GET`    | `/api/projects`          | List projects            |
| `POST`   | `/api/projects`          | Create a project         |
| `GET`    | `/api/projects/:id`      | Get single project       |
| `PATCH`  | `/api/projects/:id`      | Update a project         |
| `DELETE` | `/api/projects/:id`      | Delete a project         |
| `GET`    | `/api/inbox`             | List pending inbox items |
| `POST`   | `/api/inbox`             | Submit inbox dump        |
| `DELETE` | `/api/inbox/:id`         | Delete inbox item        |

## Documentation

- [Phase 1 Implementation Plan](../docs/BackendImplementation.md)
- [Design Plans](../docs/)

## Security

- JWT verified at edge via Neon Auth JWKS
- Postgres RLS on every table
- Zod validation on every endpoint
- Parameterized queries via Drizzle ORM
- Cloudflare native rate limiting per-user
- TLS 1.3 end-to-end
