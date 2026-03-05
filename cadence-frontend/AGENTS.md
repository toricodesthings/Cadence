# Cadence Frontend — Copilot Instructions

## Project Overview

Cadence is a dark-themed productivity/todo app. This repo is the **SPA frontend** (`ssr: false`) built with React Router v7, deployed to **Cloudflare Workers** as static assets via `wrangler`. The backend is a separate Hono API (`cadence-backend`) deployed on CF Workers + Neon Postgres.

## Tech Stack & Key Integrations

- **React 19 + React Router v7** — SPA mode, file-based routes in `app/routes/`
- **Tailwind CSS v4** — configured via `@theme` block in `app/app.css`, no `tailwind.config`
- **Radix UI primitives** — used directly (not shadcn/ui) for dialogs, dropdowns, tooltips, collapsibles, scroll areas
- **TanStack React Query** — all server data fetching and mutations; configured in `app/providers.tsx`
- **Hono RPC client** (`hc<AppType>`) — type-safe API calls; types imported from `cadence-backend` (see `app/lib/api/client.ts`)
- **Neon Auth** (`@neondatabase/auth`) — authentication via `NeonAuthUIProvider`; session from `authClient.useSession()`
- **Sonner** — toast notifications (error/success/info), themed via `components/feedback/Toaster.tsx`
- **dnd-kit** — drag-and-drop reordering with fractional `orderIndex` values
- **Lucide React** — icon library

## Commands

**Always use `bun`, never `npm`.** Bun is the project's package manager and script runner.

| Action             | Command                   |
| ------------------ | ------------------------- |
| Dev server         | `bun run dev` (port 5173) |
| Build              | `bun run build`           |
| Preview on Workers | `bun run preview`         |
| Deploy production  | `bun run deploy`          |
| Deploy dev env     | `bun run deploy:dev`      |
| Type check         | `bun run typecheck`       |
| Regen Worker types | `bun run cf-typegen`      |

## Coding Principles (Non-Negotiable)

1. **DRY** — Extract shared logic into reusable hooks, utilities, or helper modules. If code appears in two places, it belongs in a shared module. See `app/hooks/tasks/optimistic-helpers.ts` for the pattern.
2. **Grouped folder structure** — Multi-file concerns get their own domain folder named after the primary label (e.g., `hooks/tasks/`, `components/sidebar/`). Single-file utilities stay flat.
3. **Hooks in `app/hooks/`** — All reusable hooks, especially React Query hooks, live here organized by domain subfolder with barrel `index.ts` re-exports.
4. **Lib for logic** — API clients, auth, utilities, flows, and any non-UI library code lives in `app/lib/`. This is not for components or hooks.
5. **UI consistency via `app/app.css`** — This file is the single source of truth for the design system (colors, motion, glass utilities). Use semantic tokens; never hardcode hex values.
6. **Radix primitives in `app/components/primitives/`** — All Radix UI primitives are pre-themed and exported here as the "base layer". Domain components **MUST import from `primitives/` — never from `@radix-ui/*` directly**. Each primitive file wraps a single Radix package (e.g., `DropdownMenu.tsx`, `Tooltip.tsx`, `Popover.tsx`, `ScrollArea.tsx`, `Separator.tsx`, `Collapsible.tsx`) with a `forwardRef` pattern, pre-applying Cadence's twilight glass styling, animation classes, and z-indexing. Variants are supported via props (e.g., `variant="danger"` on `DropdownMenu.Item`). A barrel `index.ts` re-exports all primitives.
7. **`app/components/` root hosts layout chunks** — Top-level files in `app/components/` (not in subfolders) are major layout pieces: `MainLayout.tsx`.
8. **Bun everywhere** — Use `bun` for all commands. Never `npm`.
9. **Cloudflare Worker compatibility** — All code must run on the CF Workers runtime. No Node.js-only APIs (`fs`, `path`, `crypto` from Node). The SPA is served via `wrangler` with `worker.ts` as the edge entry point. Test deploys with `bun run preview`.

## Architecture & Conventions

### File Organization

- **Routes** (`app/routes/`) — page components, thin orchestrators that compose from `app/components/`
- **Components root** (`app/components/*.tsx`) — major layout chunks (MainLayout, Sidebar, etc.)
- **Components domain folders** (`app/components/tasks/`, `sidebar/`, `calendar/`, `feedback/`) — multi-file UI concerns grouped by domain; see `docs/02-26-2026_frontend-integration-plan.md` §2
- **Primitives** (`app/components/primitives/`) — Pre-themed Radix UI wrappers. **Only** these files import `@radix-ui/*` packages. Domain components import from here.
- **Hooks** (`app/hooks/`) — domain-organized React Query hooks (`tasks/`, `projects/`, `inbox/`); each folder has barrel `index.ts`
- **Lib** (`app/lib/`) — API client factory, auth client, utilities, flows — all non-UI logic
- **Types** (`app/types/`) — shared TypeScript interfaces per domain
- **Path alias**: `~/` maps to `./app/` (configured in `tsconfig.json`)

### Design System — "Twilight" Theme

All colors are CSS custom properties defined in `app/app.css` under `@theme`. Use semantic token names, never raw hex:

- **Backgrounds**: `twilight-void` → `twilight-deep` → `twilight-base` → `twilight-surface` → `twilight-elevated`
- **Text**: `twilight-text` (primary) · `twilight-text-soft` (secondary) · `twilight-text-muted` (tertiary)
- **Borders**: `twilight-border` (6% white) · `twilight-border-light` (10% white)
- **Accents**: `lantern` (amber, primary CTA) · `moonlit` (blue, secondary) · `sapphire` (info)
- **Glass effects**: use `.glass` or `.glass-surface` utility classes
- **Glows**: `.glow-lantern`, `.glow-moonlit`
- **Typography**: `font-sans` (Inter) for body, `font-display` (Outfit) for headings
- **Motion tokens**: CSS variables `--duration-fast/normal/smooth/expressive` and `--ease-out-expo/quart`

### Data Fetching Rules (Non-Negotiable)

1. **All API calls** go through `hc<AppType>` (Hono RPC) — never raw `fetch`
2. **Every server read** is a `useQuery`; **every write** is a `useMutation` — zero `useEffect`-driven fetches
3. **Optimistic UI is mandatory** for mutations modifying visible data:
   - `onMutate`: snapshot cache → apply optimistic update (user sees change instantly)
   - `onError`: rollback from snapshot + show error toast
   - `onSettled`: `invalidateQueries` to reconcile with server
4. **Never show spinners on mutations** — the optimistic update IS the loading state
5. **Skeleton loaders only for cold-cache initial reads**; subsequent reads use stale-while-revalidate
6. Centralize query keys in `app/lib/api/query-keys.ts`

### Component Patterns

- Components are small, single-responsibility (target <150 lines)
- Radix primitives are wrapped in `app/components/primitives/` and imported from there — domain components **MUST NOT** import `@radix-ui/*` directly. This ensures consistent styling and animation behavior.
- Interactive elements get `cursor-pointer` and subtle `scale(0.98)` on `:active` (global in `app.css`)
- Animations: Radix `data-[state=open/closed]` with `animate-in`/`animate-out` + `tw-animate-css`
- Focus ring: `box-shadow: 0 0 0 2px rgba(232, 164, 74, 0.5)` (lantern glow, handled globally)

### Drag-and-Drop Reordering

Uses **fractional indexing** (`orderIndex`): new position = midpoint of neighbors. Never renumber the full list. See `app/lib/utils/order-index.ts` for `computeMidpointIndex()`.

### Auth Flow

- `NeonAuthUIProvider` wraps the app in `providers.tsx` with Google + GitHub social login
- `MainLayout` handles auth gating via `requireAuth` prop + `authClient.useSession()`
- API client injects JWT from session: `createApiClient(token)`

### Environment Variables

Prefixed with `VITE_` for client access. Defined in `wrangler.jsonc` per environment:

- `VITE_NEON_AUTH_URL` — Neon Auth endpoint
- `VITE_API_BASE_URL` — backend API (`localhost:8787` in dev)

### Testing

- **Vitest** — test files live in `tests/` folder
- No test infrastructure is wired up yet; this is planned

## Key Reference Files

- [docs/02-26-2026_frontend-integration-plan.md](docs/02-26-2026_frontend-integration-plan.md) — detailed Phase 1 integration spec (architecture, optimistic UI contract, file structure, hook implementations)
- [app/app.css](app/app.css) — complete theme tokens and utility classes
- [app/providers.tsx](app/providers.tsx) — React Query + Auth provider setup
- [app/lib/api/client.ts](app/lib/api/client.ts) — Hono RPC client factory pattern
