# Cadence

Cadence is organized as a `pnpm` workspace powered by Turborepo. The repo is structured around deployable apps first, with room for shared packages as the web, backend, mobile, and future desktop clients converge.

## Workspace Layout

```text
apps/
├── backend/   Cloudflare Worker API (Hono + Drizzle + Neon)
├── frontend/  React Router SPA deployed to Cloudflare Workers
├── mobile/    Expo app, still behind the web/backend feature set
└── desktop/   Reserved for the future Tauri app

packages/
└── ...        Shared packages will live here as the monorepo grows
```

## Tooling

- Package manager: `pnpm`
- Task runner: Turborepo
- Node: `>=20`
- Deployment targets: Cloudflare Workers for `frontend` and `backend`

## Getting Started

```bash
corepack enable
pnpm install
```

## Common Commands

```bash
pnpm dev
pnpm dev:frontend
pnpm dev:backend
pnpm dev:mobile
pnpm build
pnpm typecheck
pnpm lint
pnpm cf-typegen
pnpm db:generate
pnpm db:migrate
pnpm db:studio
pnpm deploy:frontend
pnpm deploy:frontend:dev
pnpm deploy:backend
```

## Conventions

- Deployable products live in `apps/`.
- Shared cross-app code should move into `packages/`.
- Cross-app typing should go through workspace package imports, not `../../..` filesystem imports.
- `frontend` and `mobile` consume backend RPC types through `@cadence/backend`.
- `frontend` and `backend` are the production-critical apps today. `mobile` is active but incomplete.

## App Docs

- [Frontend](./apps/frontend/README.md)
- [Backend](./apps/backend/README.md)
- [Mobile](./apps/mobile/README.md)
- [Desktop placeholder](./apps/desktop/README.md)
