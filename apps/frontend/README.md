# Cadence Frontend

The frontend is a React Router v7 SPA deployed to Cloudflare Workers. It consumes typed RPC contracts from [`@cadence/backend`](../backend) through the workspace instead of brittle filesystem-relative imports.

## Stack

- React 19 + React Router v7 in SPA mode
- Tailwind CSS v4 with the Twilight design tokens in `app/app.css`
- Radix UI primitives wrapped under `app/components/primitives`
- TanStack Query for reads and optimistic mutations
- Hono RPC client via `hc<AppType>`
- Cloudflare Workers via `wrangler`

## Commands

Run from the repository root:

```bash
pnpm dev:frontend
pnpm --filter @cadence/frontend typecheck
pnpm --filter @cadence/frontend build
pnpm --filter @cadence/frontend preview
pnpm deploy:frontend
pnpm deploy:frontend:dev
pnpm --filter @cadence/frontend cf-typegen
```

Or run them from this directory with `pnpm <script>`.

## Conventions

- Import backend RPC contracts from `@cadence/backend`, not `../../..` paths.
- Keep route files thin and push reusable logic into `app/hooks`, `app/lib`, and domain component folders.
- All Radix usage should flow through `app/components/primitives`.
- Mutations remain optimistic-first: snapshot, update immediately, rollback on error, reconcile on settle.

## Structure

```text
app/
├── components/  UI grouped by domain
├── hooks/       React Query hooks and reusable app hooks
├── lib/         API client, auth, utilities, validation helpers
├── routes/      Route entry points
├── stores/      Zustand state
└── types/       Frontend-local types
```

## Related Docs

- [Workspace root](../../README.md)
- [Backend app](../backend/README.md)
