# ✦ CADENCE FRONTEND — PHASE 1 INTEGRATION PLAN ✦

> **Objective:** Wire every no-op UI element in `cadence-frontend` to the live `cadence-backend` API.
> The backend is **complete for Phase 1** (tasks, projects, inbox). The frontend dashboard is **80% built** visually.
> This plan turns the static shell into a fully functional todo list.
>
> **Out of Scope (Phase 2):** AI parsing, user metrics, memory transparency, Cron-driven features, Upcoming view, Completed/Trash views, Search, Notifications, and Settings — these either lack backend routes or lack frontend UI.

---

## 0. Guiding Principles

| Principle                    | Rule                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hono RPC First**           | All API calls go through the typed `hc<AppType>` client — never raw `fetch`. Compile-time route safety and autocomplete.                                              |
| **React Query Everywhere**   | Every server read is a `useQuery`. Every write is a `useMutation`. Zero `useEffect`-driven fetches.                                                                   |
| **Optimistic by Default**    | Every user mutation that modifies existing data **MUST** update the UI instantly via `onMutate`. The network call happens in the background. See §0.1 for full rules. |
| **Auth Token Injection**     | The `hc` client factory accepts a JWT. We retrieve it from `authClient.getSession()` and pass it once — every subsequent call is authenticated automatically.         |
| **Modular & DRY**            | One file = one responsibility. Shared logic is extracted to utility modules. No monolithic components. Multi-file concerns get their own subfolder.                   |
| **Descriptive Naming**       | Functions and variables read like sentences. No excessive abbreviations.                                                                                              |
| **Fractional Indexing**      | All drag-and-drop reordering uses fractional `orderIndex` values (midpoint between neighbors). No full-list renumbering.                                              |
| **Loading States for Reads** | Initial data fetches show skeleton loaders. Subsequent reads use stale-while-revalidate — cached data shown instantly while fresh data loads silently.                |
| **Never Block the User**     | No spinners on buttons. No disabled states during network calls. No "please wait" messages. The UI always responds immediately.                                       |

---

## 0.1 — The Optimistic UI Contract

Optimistic UI is not a nice-to-have — it is the **defining UX attribute** of Cadence. Every interaction that a user initiates must feel instantaneous. The network is a background reconciliation mechanism, not a gatekeeper.

### Why Optimistic?

Cadence is a productivity tool. Productivity tools live or die by perceived speed. When a user checks off a task, they expect the checkbox to fill immediately — not after a 200ms–800ms round-trip to a Cloudflare Worker and back to Neon Postgres. That delay, even when small, creates cognitive friction. Multiply it by 50 task interactions per day and the app feels sluggish.

Optimistic UI eliminates that friction entirely. The UI responds in the **same frame** as the user's click.

### The Three-Phase Lifecycle

Every mutation follows the same three-phase lifecycle:

```
┌──────────────┐     ┌──────────────────────────┐     ┌────────────────────┐
│   onMutate   │ ──▶ │   mutationFn (network)   │ ──▶ │     onSettled      │
│              │     │                          │     │                    │
│ 1. Snapshot  │     │  Fires the actual API    │     │  Invalidates the   │
│    the cache │     │  call in background       │     │  cache to fetch    │
│              │     │                          │     │  server truth      │
│ 2. Apply the │     │  ┌─ onSuccess ──────┐    │     │                    │
│    optimistic│     │  │ Server confirms  │    │     │  Cache is now in   │
│    update    │     │  │ the mutation     │    │     │  sync with server  │
│              │     │  └──────────────────┘    │     │                    │
│ User sees    │     │  ┌─ onError ────────┐    │     │                    │
│ the change   │     │  │ Rollback using   │    │     │                    │
│ IMMEDIATELY  │     │  │ the snapshot     │    │     │                    │
│              │     │  │ + show toast     │    │     │                    │
│              │     │  └──────────────────┘    │     │                    │
└──────────────┘     └──────────────────────────┘     └────────────────────┘
```

### Rules: When to Use What

| UX Strategy                      | When to Apply                                                            | Examples                                                                                  | User Experience                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **⚡ Optimistic Update**         | User modifies **existing** data they can see                             | Check off task, delete task, reorder task, edit title, move to project, create inbox item | Change appears **instantly** (same frame). Rolls back on failure + error toast.                                 |
| **⚡ Optimistic Insert**         | User creates **new** data that appears in a visible list                 | Add task, create project, add inbox item                                                  | New item appears in the list **instantly** with a temporary ID. Replaced by server ID on reconciliation.        |
| **⚡ Optimistic Remove**         | User deletes data from a visible list                                    | Delete task, delete inbox item, delete project                                            | Item disappears **instantly**. Rolls back on failure.                                                           |
| **💀 Skeleton Loader**           | First-ever load of a data set (cold cache)                               | Opening the app for the first time, navigating to a new date, first sidebar load          | Pulse-animated placeholder rows matching the shape of the final content. Shown for 0–2 seconds typically.       |
| **🔇 Silent Background Refetch** | Data exists in cache but may be stale                                    | Tab-switching back to app, returning from another page, `staleTime` expiry                | User sees cached data immediately. Fresh data replaces it silently in background. No visible loading indicator. |
| **⏳ Inline Micro-Spinner**      | A button triggers a one-off action with no list to optimistically update | (None in Phase 1 — all actions modify lists)                                              | Small spinner inside the button. Avoid in Phase 1 entirely.                                                     |

### The Rules of Optimistic Updates (Non-Negotiable)

1. **Every mutation hook MUST implement `onMutate`.** If a mutation modifies user-visible data, the cache must be patched before the network call fires. No exceptions.

2. **Every `onMutate` MUST snapshot the cache for rollback.** Use `snapshotTaskCache()` (or equivalent per domain). This snapshot is the safety net.

3. **Every `onError` MUST rollback AND notify.** Roll back the cache using the snapshot, then fire a toast so the user knows something failed. Never leave the UI in an inconsistent state.

4. **Every `onSettled` MUST invalidate.** Regardless of success or failure, `onSettled` triggers a background refetch to reconcile with server truth. This catches edge cases where the optimistic state slightly diverges from the server (e.g., server-generated timestamps).

5. **Never show a loading spinner for a mutation.** The optimistic update IS the loading state. The user sees the result instantly. The only visible indicator of a problem is the rollback + error toast on failure.

6. **Skeleton loaders are ONLY for initial reads.** Once data is cached, subsequent navigations show cached data immediately via stale-while-revalidate. Skeletons only appear on cold cache.

### What Failure Looks Like (from the user's perspective)

```
User clicks checkbox to complete a task:
  ├─ SUCCESS path (99% of the time):
  │   1. Checkbox fills instantly (optimistic, ~0ms)
  │   2. Network call succeeds silently (~200ms later)
  │   3. Cache reconciles silently
  │   4. User notices nothing — it just works
  │
  └─ FAILURE path (1% of the time):
      1. Checkbox fills instantly (optimistic, ~0ms)
      2. Network call fails (~500ms later)
      3. Checkbox UNCHECKS itself (rollback from snapshot)
      4. Toast slides in: "Couldn't complete task. Please try again."
      5. User retries — it works this time
```

This is the north star for every interaction in Cadence.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      React Components                        │
│  (TaskCard, TaskCheckbox, AddTaskInput, CalendarGrid, etc.)  │
│  Small, focused, single-responsibility                       │
└────────────┬────────────────────────────────────────────────┘
             │ call hooks
┌────────────▼────────────────────────────────────────────────┐
│                    Custom React Query Hooks                   │
│  app/hooks/tasks/   → useTasks, useCreateTask, etc.          │
│  app/hooks/projects/ → useProjects, useCreateProject, etc.   │
│  app/hooks/inbox/    → useInbox, useCreateInboxItem, etc.    │
│  app/hooks/use-api-client.ts → session-aware typed client    │
└────────────┬────────────────────────────────────────────────┘
             │ call api client
┌────────────▼────────────────────────────────────────────────┐
│                API Client Layer  (app/lib/api/)               │
│  client.ts   → hc<AppType> factory + type export             │
│  helpers.ts  → shared error parsing, response unwrapping     │
└────────────┬────────────────────────────────────────────────┘
             │ HTTPS
┌────────────▼────────────────────────────────────────────────┐
│             Cadence Backend (Hono on CF Workers)              │
│  /api/tasks · /api/projects · /api/inbox · /health           │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. File Structure (New & Modified)

> **Organizing principle:** If a concern spans more than one file, it gets a folder.
> If the logic is reusable, it gets extracted to a utility.
> Components are small and focused — each file under 150 lines.

```
cadence-frontend/app/
│
├── lib/
│   ├── api/                          🆕  FOLDER — API client layer
│   │   ├── client.ts                 🆕  hc<AppType> factory, type export
│   │   ├── helpers.ts                🆕  parseApiError(), unwrapResponse()
│   │   └── query-keys.ts             🆕  Centralized query key constants
│   │
│   ├── utils/                        🆕  FOLDER — Pure utility functions
│   │   ├── date-format.ts            🆕  formatDateLabel(), toISODate(), etc.
│   │   ├── color-resolver.ts         🆕  resolveAccentColor() → maps backend tokens to hex
│   │   └── order-index.ts            🆕  computeFractionalIndex() for drag-and-drop
│   │
│   └── auth-client.ts                ── (no changes)
│
├── types/
│   ├── task.ts                       🆕  Task, TaskState, CreateTaskInput, UpdateTaskInput
│   ├── project.ts                    🆕  Project, CreateProjectInput
│   ├── inbox.ts                      🆕  InboxItem
│   └── api.ts                        🆕  ApiResponse<T>, ApiError (shared envelope types)
│
│
├── hooks/
│   ├── use-api-client.ts             🆕  React hook wrapping hc with live session token
│   │
│   ├── tasks/                        🆕  FOLDER — all task-related hooks
│   │   ├── use-tasks.ts              🆕  useTasks(filters) → query
│   │   ├── use-create-task.ts        🆕  useCreateTask() → optimistic mutation
│   │   ├── use-update-task.ts        🆕  useUpdateTask() → optimistic mutation
│   │   ├── use-delete-task.ts        🆕  useDeleteTask() → optimistic mutation
│   │   ├── use-reorder-task.ts       🆕  useReorderTask() → fractional index mutation
│   │   ├── use-batch-state.ts        🆕  useBatchStateTransition() → batch mutation
│   │   ├── optimistic-helpers.ts     🆕  snapshotTaskCache(), rollbackTaskCache() — DRY
│   │   └── index.ts                  🆕  barrel re-export all hooks
│   │
│   ├── projects/                     🆕  FOLDER — all project-related hooks
│   │   ├── use-projects.ts           🆕  useProjects() → query
│   │   ├── use-create-project.ts     🆕  useCreateProject() → mutation
│   │   ├── use-update-project.ts     🆕  useUpdateProject() → mutation
│   │   ├── use-delete-project.ts     🆕  useDeleteProject() → mutation
│   │   └── index.ts                  🆕  barrel re-export
│   │
│   └── inbox/                        🆕  FOLDER — all inbox-related hooks
│       ├── use-inbox.ts              🆕  useInbox() → query
│       ├── use-create-inbox-item.ts  🆕  useCreateInboxItem() → optimistic mutation
│       ├── use-delete-inbox-item.ts  🆕  useDeleteInboxItem() → optimistic mutation
│       └── index.ts                  🆕  barrel re-export
│
├── components/
│   ├── tasks/                        🆕  FOLDER — task-related UI (decomposed from TaskCard.tsx)
│   │   ├── TaskCard.tsx              🆕  Presentational card (checkbox, title, metadata)
│   │   ├── TaskCheckbox.tsx          🆕  Extracted checkbox with toggle logic
│   │   ├── TaskContextMenu.tsx       🆕  Extracted dropdown (Edit, Delete, Move)
│   │   ├── TaskList.tsx              🆕  DnD-enabled sortable list wrapper
│   │   ├── SortableTaskCard.tsx      🆕  useSortable() wrapper around TaskCard
│   │   ├── AddTaskInput.tsx          🆕  Extracted add-task input with mutation
│   │   ├── TaskListSkeleton.tsx      🆕  Loading placeholder
│   │   └── EmptyState.tsx            🆕  Extracted from home.tsx
│   │
│   ├── sidebar/                      🆕  FOLDER — sidebar UI (decomposed from Sidebar.tsx)
│   │   ├── Sidebar.tsx               ✏️  Root layout (IconRail + SidebarPanel)
│   │   ├── IconRail.tsx              🆕  Extracted from Sidebar.tsx
│   │   ├── SidebarPanel.tsx          🆕  Extracted from Sidebar.tsx — now uses live project data
│   │   ├── NavLink.tsx               🆕  Extracted reusable nav item
│   │   ├── ProjectLink.tsx           🆕  Extracted reusable project list item
│   │   ├── CreateProjectPopover.tsx  🆕  Popover form for creating projects
│   │   └── Tip.tsx                   🆕  Extracted tooltip wrapper (reused in IconRail)
│   │
│   ├── calendar/                     🆕  FOLDER — calendar UI (decomposed from MiniCalendar.tsx)
│   │   ├── CalendarView.tsx          ✏️  Refactored — drives date filter via URL params
│   │   ├── CalendarGrid.tsx          🆕  Extracted grid of day cells
│   │   ├── CalendarHeader.tsx        🆕  Extracted month/year nav + Today button
│   │   └── CalendarDayCell.tsx       🆕  Extracted cell with dot indicator logic
│   │
│   ├── feedback/                     🆕  FOLDER — notification UI
│   │   └── Toaster.tsx               🆕  Themed Sonner wrapper (twilight glass aesthetic)
│
│   ├── layout/                       FOLDER (existing MainLayout.tsx moves here)
│   │   ├── MainLayout.tsx            ✏️  Moved, now includes Sonner Toaster
│   │   └── TodayHeader.tsx           🆕  Extracted from home.tsx
│   │
│   └── shared/                       🆕  FOLDER — truly generic reusable primitives
│       └── ScrollAreaWrapper.tsx      🆕  Extracted repeated ScrollArea pattern
│
├── routes/
│   ├── home.tsx                      ✏️  MODIFY — compose from modular components
│   └── auth.tsx                      ── (no changes)
│
└── providers.tsx                     ✏️  MODIFY — tune QueryClient, add global 401 handling
```

### Summary of Organizational Rules Applied

| Rule                                | How It's Applied                                                                                                                                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Multi-file concerns get folders** | `hooks/tasks/`, `hooks/projects/`, `hooks/inbox/`, `lib/api/`, `lib/utils/`, `components/tasks/`, `components/sidebar/`, `components/calendar/`, `components/feedback/`                                                                                                                                  |
| **No monolithic components**        | `TaskCard.tsx` decomposed into `TaskCard`, `TaskCheckbox`, `TaskContextMenu`. `Sidebar.tsx` decomposed into `IconRail`, `SidebarPanel`, `NavLink`, `ProjectLink`, `Tip`, `CreateProjectPopover`. `MiniCalendar.tsx` decomposed into `CalendarView`, `CalendarGrid`, `CalendarHeader`, `CalendarDayCell`. |
| **DRY principle**                   | Shared optimistic cache logic extracted to `optimistic-helpers.ts`. Shared API error parsing in `helpers.ts`. Shared query keys in `query-keys.ts`. Shared date formatting in `date-format.ts`.                                                                                                          |
| **Hooks in dedicated /hooks**       | All React Query hooks live in `app/hooks/` organized by domain subfolder.                                                                                                                                                                                                                                |
| **Barrel exports**                  | Each hook folder has an `index.ts` for clean imports: `import { useTasks, useCreateTask } from "~/hooks/tasks"`                                                                                                                                                                                          |

---

## 3. Detailed Implementation

### 3.1 — API Client Layer (`app/lib/api/`)

#### 3.1.1 `client.ts` — Hono RPC Factory

```typescript
import { hc } from "hono/client";
import type { AppType } from "../../../../cadence-backend/src/index";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";

/** Create a typed Hono RPC client with optional auth token injection */
export function createApiClient(token?: string) {
	return hc<AppType>(BASE_URL, {
		headers: token ? { Authorization: `Bearer ${token}` } : {},
	});
}

export type ApiClient = ReturnType<typeof createApiClient>;
```

#### 3.1.2 `helpers.ts` — Shared Response Utilities

```typescript
import type { ApiError } from "../../types/api";

/** Extract a structured error message from a failed API response */
export async function parseApiError(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as ApiError;
		return body.error?.message ?? "An unexpected error occurred";
	} catch {
		return `Request failed with status ${response.status}`;
	}
}

/** Unwrap a successful API response, throwing on non-ok status */
export async function unwrapResponse<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const message = await parseApiError(response);
		throw new Error(message);
	}
	const json = await response.json();
	return (json as { data: T }).data;
}
```

> **Why extract this?** Every single hook does `if (!res.ok) throw ...` then `(await res.json()).data`. That's duplicated 15+ times. `unwrapResponse` eliminates it entirely.

#### 3.1.3 `query-keys.ts` — Centralized Key Constants

```typescript
/** Centralized query key factory — single source of truth for cache targeting */
export const queryKeys = {
	tasks: {
		all: ["tasks"] as const,
		list: (filters: Record<string, unknown>) => ["tasks", filters] as const,
		detail: (id: string) => ["tasks", id] as const,
	},
	projects: {
		all: ["projects"] as const,
		detail: (id: string) => ["projects", id] as const,
	},
	inbox: {
		all: ["inbox"] as const,
	},
} as const;
```

> **Why?** Typo-proofing. Instead of scattering `["tasks"]` across 6 hooks, every invalidation references `queryKeys.tasks.all`. Change it in one place, it updates everywhere.

---

### 3.2 — Utility Modules (`app/lib/utils/`)

#### 3.2.1 `date-format.ts` — Date Helpers

```typescript
/** Format a Date to ISO date string "YYYY-MM-DD" */
export function toISODate(date: Date): string {
	return date.toISOString().split("T")[0];
}

/** Format a date for display: "Thursday, February 26" */
export function formatDateLabel(date: Date): string {
	return date.toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
	});
}

/** Build an ISO datetime range for a full calendar month */
export function getMonthDateRange(year: number, month: number) {
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	return {
		start: `${year}-${String(month + 1).padStart(2, "0")}-01T00:00:00Z`,
		end: `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}T23:59:59Z`,
	};
}
```

#### 3.2.2 `color-resolver.ts` — Accent Color Mapping

```typescript
/** Map backend color accent tokens to hex values from the CSS theme */
const ACCENT_MAP: Record<string, string> = {
	"luminous-amber": "#e8a44a",
	"moonlit-blue": "#7eb8d4",
	sapphire: "#4a90d9",
	"ember-red": "#d97756",
	"forest-green": "#5dba72",
	violet: "#9b72cf",
};

export function resolveAccentColor(accent: string): string {
	return ACCENT_MAP[accent] ?? ACCENT_MAP["luminous-amber"];
}
```

#### 3.2.3 `order-index.ts` — Fractional Indexing

```typescript
import type { Task } from "../../types/task";

/** Compute the fractional orderIndex for inserting at the end of a task list */
export function computeNextOrderIndex(tasks: Task[]): number {
	if (tasks.length === 0) return 1;
	return Math.max(...tasks.map((t) => t.orderIndex)) + 1;
}

/** Compute the fractional orderIndex for inserting between two neighbors */
export function computeMidpointIndex(
	prevIndex: number | undefined,
	nextIndex: number | undefined,
	fallback: number,
): number {
	if (prevIndex !== undefined && nextIndex !== undefined) {
		return (prevIndex + nextIndex) / 2;
	}
	if (prevIndex !== undefined) return prevIndex + 1;
	if (nextIndex !== undefined) return nextIndex - 1;
	return fallback;
}
```

---

### 3.3 — Frontend Type Definitions (`app/types/`)

Separate files per domain — no god file.

#### 3.3.1 `task.ts`

```typescript
export type TaskState = "ACTIVE" | "DONE" | "ARCHIVED";

export interface Task {
	id: string;
	userId: string;
	projectId: string | null;
	title: string;
	content: string | null;
	state: TaskState;
	orderIndex: number;
	isAllDay: boolean;
	dueDate: string | null;
	scheduledStart: string | null;
	scheduledEnd: string | null;
	durationEstimate: number | null;
	timezoneLocked: boolean;
	createdAt: string;
	updatedAt: string;
}

/** Input shape for creating a task via the API */
export interface CreateTaskInput {
	title: string;
	orderIndex: number;
	projectId?: string;
	scheduledStart?: string;
	scheduledEnd?: string;
	dueDate?: string;
	isAllDay?: boolean;
}

/** Input shape for updating a task — all fields optional */
export type UpdateTaskInput = Partial<
	Pick<
		Task,
		| "title"
		| "content"
		| "state"
		| "projectId"
		| "isAllDay"
		| "dueDate"
		| "scheduledStart"
		| "scheduledEnd"
		| "durationEstimate"
		| "timezoneLocked"
	>
>;
```

#### 3.3.2 `project.ts`

```typescript
export interface Project {
	id: string;
	userId: string;
	name: string;
	colorAccent: string;
	createdAt: string;
}

export interface CreateProjectInput {
	name: string;
	colorAccent?: string;
}
```

#### 3.3.3 `inbox.ts`

```typescript
export interface InboxItem {
	id: string;
	userId: string;
	rawText: string;
	processed: boolean;
	createdAt: string;
}
```

#### 3.3.4 `api.ts`

```typescript
/** Standard API success envelope */
export interface ApiResponse<T> {
	data: T;
	meta?: { total?: number; limit?: number; offset?: number };
}

/** Standard API error envelope */
export interface ApiError {
	error: { code: string; message: string };
}
```

---

### 3.4 — Toast Notifications (Sonner)

We use the [`sonner`](https://sonner.emilkowal.dev/) package instead of a custom Zustand store. Sonner provides a battle-tested toast system with built-in animations, auto-dismiss, stacking, and promise support.

#### 3.4.1 `components/feedback/Toaster.tsx`

A themed wrapper around Sonner's `<Toaster>` component, styled with `unstyled: true` mode to match Cadence's twilight glass aesthetic:

- **Success:** Forest green tint (`#111c16` bg, `#5dba72` icon)
- **Error:** Ember red tint (`#251010` bg, `#d97756` icon)
- **Info:** Moonlit blue tint (`#0b1b24` bg, `#7eb8d4` icon)

#### Usage in mutation hooks

```typescript
import { toast } from "sonner";

// Inside mutation hook onError callback — called AFTER rollbackTaskCache()
onError: (err) => {
  toast.error(err.message || "Something went wrong");
},
```

`<Toaster />` is rendered once in `MainLayout.tsx` as a sibling to the main content.

---

### 3.5 — React Query Configuration

#### 3.5.1 `providers.tsx` — QueryClient Tuning

```typescript
import {
	QueryClient,
	QueryClientProvider,
	QueryCache,
} from "@tanstack/react-query";

const [queryClient] = useState(
	() =>
		new QueryClient({
			queryCache: new QueryCache({
				onError: (error) => {
					// Global 401 handling — force sign-out on expired token
					if (
						error.message.includes("401") ||
						error.message.includes("UNAUTHORIZED")
					) {
						authClient.signOut();
						navigate("/auth/sign-in", { replace: true });
					}
				},
			}),
			defaultOptions: {
				queries: {
					staleTime: 1000 * 60 * 2, // 2 minutes
					gcTime: 1000 * 60 * 10, // 10 minutes — keep for back-nav
					refetchOnWindowFocus: true, // Sync on tab return
					retry: 2,
					retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
				},
				mutations: {
					retry: 1,
				},
			},
		}),
);
```

---

### 3.6 — Hook Layer (`app/hooks/`)

#### 3.6.1 `use-api-client.ts` — Session-Aware Client

```typescript
import { useMemo } from "react";
import { authClient } from "../lib/auth-client";
import { createApiClient } from "../lib/api/client";

/** Returns a typed Hono client pre-authenticated with the current session's JWT */
export function useApiClient() {
	const { data: session } = authClient.useSession();
	const token = session?.session?.token;
	return useMemo(() => createApiClient(token), [token]);
}
```

#### 3.6.2 `hooks/tasks/optimistic-helpers.ts` — Shared Optimistic Cache Logic

> **This is the DRY extraction.** Every task mutation needs to snapshot the cache, patch it, and roll it back on error. Instead of duplicating this in 5 hooks, we extract it.

```typescript
import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/api/query-keys";
import type { Task } from "../../types/task";

/** Snapshot all task query caches for rollback */
export function snapshotTaskCache(queryClient: QueryClient) {
	return queryClient.getQueriesData<Task[]>({ queryKey: queryKeys.tasks.all });
}

/** Rollback task caches from a previous snapshot */
export function rollbackTaskCache(
	queryClient: QueryClient,
	snapshot: ReturnType<typeof snapshotTaskCache>,
) {
	for (const [key, data] of snapshot) {
		queryClient.setQueryData(key, data);
	}
}

/** Invalidate all task caches — used by every mutation's onSettled */
export function invalidateTaskCaches(queryClient: QueryClient) {
	return queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
}

/** Cancel in-flight task fetches before optimistic update */
export function cancelTaskQueries(queryClient: QueryClient) {
	return queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
}
```

#### 3.6.3 `hooks/tasks/use-tasks.ts`

```typescript
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Task, TaskState } from "../../types/task";

interface UseTasksOptions {
	state?: TaskState;
	projectId?: string;
	scheduledDate?: string;
	scheduledRange?: { start: string; end: string };
	limit?: number;
	offset?: number;
}

/** Fetch tasks with server-side filtering — drives Today, Upcoming, and Project views */
export function useTasks(options: UseTasksOptions = {}) {
	const client = useApiClient();

	return useQuery({
		queryKey: queryKeys.tasks.list(options),
		queryFn: async () => {
			const res = await client.api.tasks.$get({
				query: {
					...(options.state && { state: options.state }),
					...(options.projectId && { projectId: options.projectId }),
					...(options.scheduledDate && {
						scheduledDate: options.scheduledDate,
					}),
					...(options.limit && { limit: String(options.limit) }),
					...(options.offset && { offset: String(options.offset) }),
				},
			});
			return unwrapResponse<Task[]>(res);
		},
	});
}
```

#### 3.6.4 `hooks/tasks/use-create-task.ts`

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import {
	snapshotTaskCache,
	rollbackTaskCache,
	invalidateTaskCaches,
	cancelTaskQueries,
} from "./optimistic-helpers";
import type { Task, CreateTaskInput } from "../../types/task";

/** Create a task with optimistic insertion into all active task caches */
export function useCreateTask() {
	const client = useApiClient();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (input: CreateTaskInput) => {
			const res = await client.api.tasks.$post({
				json: {
					title: input.title,
					orderIndex: input.orderIndex,
					state: "ACTIVE",
					isAllDay: input.isAllDay ?? true,
					...(input.projectId && { projectId: input.projectId }),
					...(input.scheduledStart && { scheduledStart: input.scheduledStart }),
					...(input.scheduledEnd && { scheduledEnd: input.scheduledEnd }),
					...(input.dueDate && { dueDate: input.dueDate }),
				},
			});
			return unwrapResponse<Task>(res);
		},

		onMutate: async (input) => {
			await cancelTaskQueries(queryClient);
			const snapshot = snapshotTaskCache(queryClient);

			// Build an optimistic task with a temporary ID
			const optimisticTask: Task = {
				id: `temp-${Date.now()}`,
				userId: "",
				projectId: input.projectId ?? null,
				title: input.title,
				content: null,
				state: "ACTIVE",
				orderIndex: input.orderIndex,
				isAllDay: input.isAllDay ?? true,
				dueDate: input.dueDate ?? null,
				scheduledStart: input.scheduledStart ?? null,
				scheduledEnd: input.scheduledEnd ?? null,
				durationEstimate: null,
				timezoneLocked: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			queryClient.setQueriesData<Task[]>(
				{ queryKey: queryKeys.tasks.all },
				(old) => (old ? [...old, optimisticTask] : [optimisticTask]),
			);

			return { snapshot };
		},

		onError: (_err, _input, context) => {
			if (context?.snapshot) rollbackTaskCache(queryClient, context.snapshot);
		},

		onSettled: () => invalidateTaskCaches(queryClient),
	});
}
```

#### 3.6.5 `hooks/tasks/use-update-task.ts`

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import {
	snapshotTaskCache,
	rollbackTaskCache,
	invalidateTaskCaches,
	cancelTaskQueries,
} from "./optimistic-helpers";
import type { Task, UpdateTaskInput } from "../../types/task";

/** Update any task field with optimistic patching across all caches */
export function useUpdateTask() {
	const client = useApiClient();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			id,
			...updates
		}: { id: string } & UpdateTaskInput) => {
			const res = await client.api.tasks[":id"].$patch({
				param: { id },
				json: updates,
			});
			return unwrapResponse<Task>(res);
		},

		onMutate: async ({ id, ...updates }) => {
			await cancelTaskQueries(queryClient);
			const snapshot = snapshotTaskCache(queryClient);

			queryClient.setQueriesData<Task[]>(
				{ queryKey: queryKeys.tasks.all },
				(old) => old?.map((t) => (t.id === id ? { ...t, ...updates } : t)),
			);

			return { snapshot };
		},

		onError: (_err, _input, context) => {
			if (context?.snapshot) rollbackTaskCache(queryClient, context.snapshot);
		},

		onSettled: () => invalidateTaskCaches(queryClient),
	});
}
```

> **This single hook powers:** checking off tasks, editing titles, setting due dates, scheduling, moving between projects, and all other field mutations.

#### 3.6.6 `hooks/tasks/use-delete-task.ts`

```typescript
/** Delete a task with optimistic removal from all caches */
export function useDeleteTask() {
	const client = useApiClient();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			const res = await client.api.tasks[":id"].$delete({ param: { id } });
			return unwrapResponse<Task>(res);
		},

		onMutate: async (id) => {
			await cancelTaskQueries(queryClient);
			const snapshot = snapshotTaskCache(queryClient);

			queryClient.setQueriesData<Task[]>(
				{ queryKey: queryKeys.tasks.all },
				(old) => old?.filter((t) => t.id !== id),
			);

			return { snapshot };
		},

		onError: (_err, _input, context) => {
			if (context?.snapshot) rollbackTaskCache(queryClient, context.snapshot);
		},

		onSettled: () => invalidateTaskCaches(queryClient),
	});
}
```

#### 3.6.7 `hooks/tasks/use-reorder-task.ts`

```typescript
/** Reorder a task via fractional index — component handles optimistic array reorder */
export function useReorderTask() {
	const client = useApiClient();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			id,
			orderIndex,
		}: {
			id: string;
			orderIndex: number;
		}) => {
			const res = await client.api.tasks[":id"].reorder.$patch({
				param: { id },
				json: { orderIndex },
			});
			return unwrapResponse<Task>(res);
		},
		onSettled: () => invalidateTaskCaches(queryClient),
	});
}
```

#### 3.6.8 `hooks/tasks/use-batch-state.ts`

```typescript
/** Batch-transition multiple tasks to a new state (DONE, ARCHIVED, ACTIVE) */
export function useBatchStateTransition() {
	const client = useApiClient();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			taskIds,
			state,
		}: {
			taskIds: string[];
			state: TaskState;
		}) => {
			const res = await client.api.tasks.batch.state.$patch({
				json: { taskIds, state },
			});
			return unwrapResponse<Task[]>(res);
		},
		onSettled: () => invalidateTaskCaches(queryClient),
	});
}
```

#### 3.6.9 `hooks/tasks/index.ts` — Barrel Export

```typescript
export { useTasks } from "./use-tasks";
export { useCreateTask } from "./use-create-task";
export { useUpdateTask } from "./use-update-task";
export { useDeleteTask } from "./use-delete-task";
export { useReorderTask } from "./use-reorder-task";
export { useBatchStateTransition } from "./use-batch-state";
```

> **Usage at component level:** `import { useTasks, useCreateTask } from "~/hooks/tasks";`

#### 3.6.10 `hooks/projects/` — Same Pattern

Each hook in its own file. All follow the same `mutationFn` → `unwrapResponse` → `invalidate` pattern. The `index.ts` barrel-exports:

```typescript
export { useProjects } from "./use-projects";
export { useCreateProject } from "./use-create-project";
export { useUpdateProject } from "./use-update-project";
export { useDeleteProject } from "./use-delete-project";
```

#### 3.6.11 `hooks/inbox/` — Same Pattern

```typescript
export { useInbox } from "./use-inbox";
export { useCreateInboxItem } from "./use-create-inbox-item";
export { useDeleteInboxItem } from "./use-delete-inbox-item";
```

`useCreateInboxItem` includes optimistic insertion. `useDeleteInboxItem` includes optimistic removal.

---

### 3.7 — Component Decomposition

#### 3.7.1 `components/tasks/` — The Task UI System

**Before:** One `TaskCard.tsx` file (148 lines) containing `TaskCard` + `AddTaskInput` with all logic inlined.

**After:** Eight focused components, each under 80 lines. **Every user interaction is annotated with its UX strategy:**

| File                   | Responsibility                                                          | UX Strategy                                                                                          | Lines (est.) |
| ---------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------ |
| `TaskCard.tsx`         | Renders a single task row. Composes `TaskCheckbox` + `TaskContextMenu`. | — (presentational container)                                                                         | ~60          |
| `TaskCheckbox.tsx`     | Circular checkbox. Calls `useUpdateTask({ id, state })`.                | **⚡ Optimistic Update** — checkbox fills instantly on click, reverts on failure                     | ~35          |
| `TaskContextMenu.tsx`  | Radix DropdownMenu with Delete, Edit stub, Move stub.                   | **⚡ Optimistic Remove** — task vanishes instantly on Delete, reverts on failure                     | ~50          |
| `TaskList.tsx`         | DnD wrapper with `SortableContext`. Handles `onDragEnd`.                | **⚡ Optimistic Reorder** — list order updates instantly on drop, reconciles on settle               | ~70          |
| `SortableTaskCard.tsx` | Thin wrapper: `useSortable()` transforms → `TaskCard`.                  | — (DnD plumbing only)                                                                                | ~30          |
| `AddTaskInput.tsx`     | Text input. Fires `useCreateTask` on Enter.                             | **⚡ Optimistic Insert** — new task appears in list instantly with temp ID, input clears immediately | ~40          |
| `TaskListSkeleton.tsx` | 3-5 pulse-animated placeholder rows matching TaskCard shape.            | **💀 Skeleton Loader** — shown ONLY on cold cache (first load). Never shown after data is cached.    | ~25          |
| `EmptyState.tsx`       | The "Nothing scheduled" message. Extracted from `home.tsx`.             | — (presentational, no network)                                                                       | ~20          |

**Interaction-by-interaction UX contract:**

| User Action                       | What the User Sees (instantly)                       | What Happens in Background                                                     | On Failure                        |
| --------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------- |
| **Clicks checkbox**               | Checkbox fills/empties in same frame                 | `PATCH /api/tasks/:id` fires with `{ state: "DONE" }` or `{ state: "ACTIVE" }` | Checkbox reverts + error toast    |
| **Presses Enter in AddTaskInput** | New task row appears at bottom of list, input clears | `POST /api/tasks` fires with title + orderIndex                                | Task row vanishes + error toast   |
| **Clicks Delete in context menu** | Task row disappears from list                        | `DELETE /api/tasks/:id` fires                                                  | Task row reappears + error toast  |
| **Drags task to new position**    | Task slides to new position in list (DnD animation)  | `PATCH /api/tasks/:id/reorder` fires with new fractional orderIndex            | List order reverts + error toast  |
| **First page load (cold cache)**  | `TaskListSkeleton` (3-5 pulse rows) for ~200ms-1s    | `GET /api/tasks` fires                                                         | Error boundary / retry            |
| **Returns to tab (warm cache)**   | Cached tasks shown immediately, no loading indicator | Silent `GET /api/tasks` refetch in background                                  | Stale data remains, no disruption |

**TaskCheckbox.tsx example:**

```tsx
import { useUpdateTask } from "~/hooks/tasks";
import type { Task } from "~/types/task";

interface TaskCheckboxProps {
	task: Task;
}

/** Circular checkbox that toggles task between ACTIVE and DONE states */
export function TaskCheckbox({ task }: TaskCheckboxProps) {
	const updateTask = useUpdateTask();
	const isDone = task.state === "DONE";

	const handleToggle = () => {
		updateTask.mutate({
			id: task.id,
			state: isDone ? "ACTIVE" : "DONE",
		});
	};

	return (
		<button
			onClick={handleToggle}
			className={`mt-0.5 w-5 h-5 rounded-full border-[1.5px] shrink-0
        flex items-center justify-center transition-all duration-200 cursor-pointer
        ${
					isDone
						? "bg-lantern border-lantern"
						: "border-twilight-text-muted/30 hover:border-lantern/50"
				}`}
			aria-label={isDone ? "Mark incomplete" : "Mark complete"}
		>
			{isDone && (
				<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
					<path
						d="M2 5L4 7L8 3"
						stroke="#0a1628"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			)}
		</button>
	);
}
```

**AddTaskInput.tsx example:**

```tsx
import { useState } from "react";
import { Plus } from "lucide-react";
import { useCreateTask } from "~/hooks/tasks";
import { computeNextOrderIndex } from "~/lib/utils/order-index";
import type { Task } from "~/types/task";

interface AddTaskInputProps {
	scheduledDate: string;
	tasks: Task[];
}

/** Input field for quick task creation — submits on Enter */
export function AddTaskInput({ scheduledDate, tasks }: AddTaskInputProps) {
	const [value, setValue] = useState("");
	const createTask = useCreateTask();

	const handleSubmit = () => {
		if (!value.trim()) return;

		createTask.mutate({
			title: value.trim(),
			orderIndex: computeNextOrderIndex(tasks),
			scheduledStart: `${scheduledDate}T09:00:00Z`,
			isAllDay: true,
		});

		setValue("");
	};

	return (
		<div className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-dashed border-twilight-border hover:border-twilight-border-light transition-colors group">
			<Plus
				size={17}
				className="text-twilight-text-muted group-hover:text-lantern/50 transition-colors shrink-0"
			/>
			<input
				type="text"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				placeholder="Add a task…"
				className="flex-1 bg-transparent text-[15px] text-twilight-text placeholder:text-twilight-text-muted/40 outline-none"
				onKeyDown={(e) => {
					if (e.key === "Enter") handleSubmit();
				}}
			/>
		</div>
	);
}
```

#### 3.7.2 `components/sidebar/` — The Sidebar System

**Before:** One `Sidebar.tsx` file (228 lines) containing `Sidebar`, `SidebarPanel`, `IconRail`, `NavLink`, `ListLink`, and `Tip` — all with hardcoded data.

**After:** Seven focused files with annotated UX strategies:

| File                       | Responsibility                                                                           | UX Strategy                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Sidebar.tsx`              | Root layout: `<aside>` wrapping `<IconRail />` + `<SidebarPanel />`                      | — (composition only)                                                                                                                        |
| `IconRail.tsx`             | Logo, Search, Quick Add, Notifications, Settings icon buttons                            | — (navigation only, no data)                                                                                                                |
| `SidebarPanel.tsx`         | Primary nav + live projects list + bottom nav. Fetches `useProjects()` and `useInbox()`. | **🔇 Silent Background** — projects and inbox count load from cache instantly after first fetch. No loading spinners in sidebar ever.       |
| `NavLink.tsx`              | Reusable navigation item (icon + label + optional count)                                 | — (presentational)                                                                                                                          |
| `ProjectLink.tsx`          | Reusable project list item (color dot + label + optional count)                          | — (presentational)                                                                                                                          |
| `CreateProjectPopover.tsx` | Radix Popover with name input + color picker. Calls `useCreateProject()`.                | **⚡ Optimistic Insert** — new project appears in sidebar list instantly on submit, popover closes immediately. Reverts + toast on failure. |
| `Tip.tsx`                  | Reusable Radix Tooltip wrapper                                                           | — (presentational)                                                                                                                          |

**SidebarPanel.tsx wiring example:**

```tsx
import { useProjects } from "~/hooks/projects";
import { useInbox } from "~/hooks/inbox";
import { resolveAccentColor } from "~/lib/utils/color-resolver";

export function SidebarPanel() {
	const location = useLocation();
	const [listsOpen, setListsOpen] = useState(true);
	const { data: projects } = useProjects();
	const { data: inboxItems } = useInbox();

	const inboxCount = inboxItems?.length ?? 0;

	const navItems = [
		{ icon: CalendarDays, label: "Today", href: "/" },
		{ icon: CalendarRange, label: "Upcoming", href: "/upcoming" },
		{ icon: Inbox, label: "Inbox", href: "/inbox", count: inboxCount },
	];

	const projectLinks = (projects ?? []).map((p) => ({
		label: p.name,
		color: resolveAccentColor(p.colorAccent),
		href: `/project/${p.id}`,
	}));

	// ... render with live data
}
```

#### 3.7.3 `components/calendar/` — The Calendar System

**Before:** One `MiniCalendar.tsx` (112 lines) with all logic and rendering inlined.

**After:** Four focused files with annotated UX strategies:

| File                  | Responsibility                                                                                         | UX Strategy                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CalendarView.tsx`    | Container: manages `year`/`month` state, coordinates header + grid. Drives date filter via URL params. | **🔇 Silent Background** — month task dots fetch silently. If cached, dot indicators appear instantly. If cold, dots appear after ~200ms with no loading indicator (absence = no tasks, which is a valid visual state). |
| `CalendarHeader.tsx`  | Month/year display + prev/next/today navigation buttons                                                | — (local state only, instant)                                                                                                                                                                                           |
| `CalendarGrid.tsx`    | 7-column grid rendering `CalendarDayCell` for each day                                                 | — (presentational, renders from parent data)                                                                                                                                                                            |
| `CalendarDayCell.tsx` | Single day cell — handles selection, today highlighting, and task-presence dot indicator               | **Instant local** — date selection updates URL param instantly (no network). Dot indicator is data-driven from parent query.                                                                                            |

**CalendarView.tsx URL-driven date selection:**

```tsx
import { useSearchParams } from "react-router";
import { useTasks } from "~/hooks/tasks";
import { toISODate, getMonthDateRange } from "~/lib/utils/date-format";

export function CalendarView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  // Fetch month's tasks for dot indicators
  const monthRange = getMonthDateRange(year, month);
  const { data: monthTasks } = useTasks({
    state: "ACTIVE",
    scheduledRange: monthRange,
  });

  // Build set of dates that have tasks
  const datesWithTasks = new Set(
    (monthTasks ?? [])
      .filter((t) => t.scheduledStart)
      .map((t) => new Date(t.scheduledStart!).getDate())
  );

  const handleSelectDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSearchParams({ date: dateStr });
  };

  return (
    <div className="glass rounded-2xl p-6">
      <CalendarHeader year={year} month={month} onNavigate={...} />
      <CalendarGrid
        year={year}
        month={month}
        selectedDate={searchParams.get("date") ?? toISODate(today)}
        datesWithTasks={datesWithTasks}
        onSelectDate={handleSelectDate}
      />
    </div>
  );
}
```

Then in `home.tsx`:

```tsx
const [searchParams] = useSearchParams();
const selectedDate = searchParams.get("date") ?? toISODate(new Date());
const { data: tasks, isLoading } = useTasks({
	state: "ACTIVE",
	scheduledDate: selectedDate,
});
```

#### 3.7.4 `components/feedback/` — Toast System (Sonner)

The toast system is the **only user-visible indicator of mutation failure**. Because all mutations are optimistic, the user never sees a loading state — they only see the result. Toasts exist to handle the rare failure case where the optimistic update must be rolled back.

| File          | Responsibility                                                                                                      | UX Strategy                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Toaster.tsx` | Themed Sonner wrapper (`unstyled: true`), positioned bottom-right with twilight glass colors and Lucide React icons | **Optimistic Failure Path** — only appears when a mutation fails and the UI has rolled back. This is the user's signal that their action didn't persist. |

Mutations surface errors via:

```typescript
import { toast } from "sonner";

// Inside mutation hook — called AFTER rollbackTaskCache()
onError: (err) => {
  toast.error(err.message || "Something went wrong");
},
```

**Important:** The toast appears ~200ms–800ms AFTER the user's action, because that's how long the network call takes to fail. From the user's perspective:

1. They click → UI updates instantly (optimistic)
2. ~500ms later, the UI silently reverts AND a toast appears explaining the failure
3. The toast auto-dismisses after 5 seconds (Sonner default, configurable via `duration`)

#### 3.7.5 `components/layout/` — Layout Components

| File              | Responsibility                                             |
| ----------------- | ---------------------------------------------------------- |
| `MainLayout.tsx`  | Existing layout — now also renders `<Toaster />` (Sonner)  |
| `TodayHeader.tsx` | Extracted from `home.tsx` — shows "Today" + formatted date |

#### 3.7.6 `components/shared/` — Generic Reusables

| File                    | Responsibility                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `ScrollAreaWrapper.tsx` | Extracts the repeated `ScrollArea.Root > Viewport > Scrollbar > Thumb` pattern used in 3+ places |

---

### 3.8 — Page Composition (`routes/home.tsx`)

After decomposition, the home route becomes a pure composition file:

```tsx
import { useSearchParams } from "react-router";
import { MainLayout } from "~/components/layout/MainLayout";
import { TodayHeader } from "~/components/layout/TodayHeader";
import { AddTaskInput } from "~/components/tasks/AddTaskInput";
import { TaskList } from "~/components/tasks/TaskList";
import { TaskListSkeleton } from "~/components/tasks/TaskListSkeleton";
import { EmptyState } from "~/components/tasks/EmptyState";
import { CalendarView } from "~/components/calendar/CalendarView";
import { ScrollAreaWrapper } from "~/components/shared/ScrollAreaWrapper";
import { useTasks } from "~/hooks/tasks";
import { toISODate } from "~/lib/utils/date-format";

export default function Home() {
	const [searchParams] = useSearchParams();
	const selectedDate = searchParams.get("date") ?? toISODate(new Date());

	const { data: tasks, isLoading } = useTasks({
		state: "ACTIVE",
		scheduledDate: selectedDate,
	});

	return (
		<MainLayout requireAuth>
			<div className="h-full flex">
				{/* Task list */}
				<div className="flex-1 min-w-0">
					<ScrollAreaWrapper>
						<div className="max-w-2xl mx-auto px-8 py-8">
							<TodayHeader />
							<AddTaskInput scheduledDate={selectedDate} tasks={tasks ?? []} />

							{isLoading ? (
								<TaskListSkeleton />
							) : tasks && tasks.length > 0 ? (
								<TaskList tasks={tasks} />
							) : (
								<EmptyState />
							)}
						</div>
					</ScrollAreaWrapper>
				</div>

				{/* Calendar panel */}
				<div className="w-[320px] shrink-0 border-l border-twilight-border">
					<ScrollAreaWrapper>
						<div className="p-5">
							<CalendarView />
						</div>
					</ScrollAreaWrapper>
				</div>
			</div>
		</MainLayout>
	);
}
```

> **~40 lines.** Zero business logic. Pure composition. Every piece is testable and reusable independently.

---

## 4. Error Handling Strategy

| Layer             | Method                        | What Happens                                                              | User Impact                                                                                              |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Per-mutation**  | `onError` callback            | Rolls back optimistic cache via snapshot + fires `addToast()`             | User sees the UI revert + a brief error toast. **This is the ONLY way a user learns a mutation failed.** |
| **Global 401**    | QueryCache `onError`          | Expired JWT triggers `authClient.signOut()` + redirect to `/auth/sign-in` | User is redirected to login. Any unsaved optimistic state is lost (acceptable — session is invalid).     |
| **Global render** | `ErrorBoundary` in `root.tsx` | Catches catastrophic rendering errors (already implemented)               | User sees a full-page error boundary with a retry option.                                                |
| **API parsing**   | `unwrapResponse()`            | Throws with server-provided error message (from `parseApiError()`)        | Error message is surfaced in the toast via `onError`.                                                    |

> **Critical Rule:** Never swallow errors silently. If a mutation fails, the user MUST be informed via (1) a visible UI rollback and (2) an error toast. Silent failures erode trust.

---

## 5. Performance & Perceived Speed

The performance strategy is structured around **perceived speed** — how fast the app _feels_ to the user, not just how fast the network is.

| Optimization                  | Technique                                                                    | Perceived Speed Impact                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **⚡ Optimistic mutations**   | `onMutate` cache patching with `snapshotTaskCache()` / `rollbackTaskCache()` | **All writes feel instant (0ms perceived latency).** This is the single biggest UX win.          |
| **💀 Skeleton loaders**       | `TaskListSkeleton` on cold cache only                                        | First load feels intentional and polished, not broken. Subsequent loads skip skeletons entirely. |
| **🔇 Stale-while-revalidate** | `staleTime: 2min` + `refetchOnWindowFocus`                                   | Returning to the app shows cached data instantly. Fresh data loads silently in background.       |
| **Minimal payload**           | `scheduledDate` filter on Today view                                         | Only today's tasks hit the wire. Faster initial load, less memory.                               |
| **Single-row reorder**        | `computeMidpointIndex()` + `PATCH /:id/reorder`                              | One DB write per drag. No batch renumbering.                                                     |
| **Memoized client**           | `useMemo` on `token` change only                                             | Prevents unnecessary `hc` re-instantiation on every render.                                      |
| **Lazy calendar dots**        | Month task dots fetched only when month changes                              | No unnecessary network for months the user hasn't viewed.                                        |
| **Query deduplication**       | React Query built-in dedup                                                   | `SidebarPanel` and `Home` both reading tasks? One request.                                       |
| **Barrel exports**            | `~/hooks/tasks` index.ts                                                     | Tree-shaking friendly, clean import paths.                                                       |

---

## 6. Implementation Order

| Step                         | Files Created / Modified                                                                                                                                                                   | Deliverable                                      | Estimated Effort |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ---------------- |
| **1. Types**                 | `types/task.ts`, `types/project.ts`, `types/inbox.ts`, `types/api.ts`                                                                                                                      | Frontend type definitions                        | 15 min           |
| **2. API Client Layer**      | `lib/api/client.ts`, `lib/api/helpers.ts`, `lib/api/query-keys.ts`                                                                                                                         | Typed client factory + shared utilities          | 20 min           |
| **3. Utility Module**        | `lib/utils/date-format.ts`, `lib/utils/color-resolver.ts`, `lib/utils/order-index.ts`                                                                                                      | Pure utility functions                           | 15 min           |
| **4. Session Hook**          | `hooks/use-api-client.ts`                                                                                                                                                                  | Session-aware client hook                        | 10 min           |
| **5. Task Hooks**            | `hooks/tasks/optimistic-helpers.ts`, `hooks/tasks/use-tasks.ts`, `use-create-task.ts`, `use-update-task.ts`, `use-delete-task.ts`, `use-reorder-task.ts`, `use-batch-state.ts`, `index.ts` | Full task hook layer (8 files)                   | 1 hour           |
| **6. Project Hooks**         | `hooks/projects/use-projects.ts`, `use-create-project.ts`, `use-update-project.ts`, `use-delete-project.ts`, `index.ts`                                                                    | Full project hook layer (5 files)                | 30 min           |
| **7. Inbox Hooks**           | `hooks/inbox/use-inbox.ts`, `use-create-inbox-item.ts`, `use-delete-inbox-item.ts`, `index.ts`                                                                                             | Full inbox hook layer (4 files)                  | 20 min           |
| **8. Toast System (Sonner)** | `components/feedback/Toaster.tsx` — themed Sonner wrapper. Hooks use `import { toast } from "sonner"` directly.                                                                            | Error/success notification system                | 15 min           |
| **9. Shared Components**     | `components/shared/ScrollAreaWrapper.tsx`, `components/layout/TodayHeader.tsx`                                                                                                             | Extracted reusable primitives                    | 15 min           |
| **10. QueryClient Tuning**   | `providers.tsx`                                                                                                                                                                            | Optimized defaults + global 401 handling         | 10 min           |
| **11. Task Components**      | `components/tasks/TaskCheckbox.tsx`, `TaskContextMenu.tsx`, `TaskCard.tsx`, `SortableTaskCard.tsx`, `TaskList.tsx`, `AddTaskInput.tsx`, `TaskListSkeleton.tsx`, `EmptyState.tsx`           | Full task UI system (8 files)                    | 1.5 hours        |
| **12. Sidebar Components**   | `components/sidebar/Tip.tsx`, `NavLink.tsx`, `ProjectLink.tsx`, `IconRail.tsx`, `SidebarPanel.tsx`, `CreateProjectPopover.tsx`, `Sidebar.tsx`                                              | Full sidebar system (7 files)                    | 1 hour           |
| **13. Calendar Components**  | `components/calendar/CalendarDayCell.tsx`, `CalendarHeader.tsx`, `CalendarGrid.tsx`, `CalendarView.tsx`                                                                                    | Full calendar system (4 files)                   | 45 min           |
| **14. Home Route**           | `routes/home.tsx`                                                                                                                                                                          | Compose everything into the Today page           | 20 min           |
| **15. Smoke Testing**        | —                                                                                                                                                                                          | Full CRUD flow verification against live backend | 30 min           |

**Total estimated:** ~7.5 hours of focused implementation across **~45 files**.

---

## 7. Testing Checklist

### 7.1 — Optimistic Mutation Behavior (⚡ Zero Latency Expected)

> **How to test:** Use the Network tab throttling (Slow 3G) to make the delay visible. The UI change must happen BEFORE the network response arrives.

- [ ] **Create Task (⚡ Optimistic Insert):** Type title, press Enter → task row appears in list **instantly** (before network completes) → input clears immediately → task persists on page refresh
- [ ] **Check Off Task (⚡ Optimistic Update):** Click checkbox → checkbox fills **in the same frame** as the click (0ms perceived) → task state = DONE on server after background call
- [ ] **Uncheck Task (⚡ Optimistic Update):** Click done task's checkbox → checkbox empties **instantly** → state reverts to ACTIVE on server
- [ ] **Delete Task (⚡ Optimistic Remove):** Context menu → Delete → task row vanishes from list **instantly** → does not reappear on refresh
- [ ] **Reorder Tasks (⚡ Optimistic Reorder):** Drag task to new position → task slides to new position **during the drag** (DnD animation) → `orderIndex` persists on refresh
- [ ] **Create Project (⚡ Optimistic Insert):** Sidebar "+" → popover → enter name → project appears in sidebar list **instantly** → popover closes immediately
- [ ] **Create Inbox Item (⚡ Optimistic Insert):** Submit text → item appears at top of inbox list **instantly** → persists on refresh
- [ ] **Delete Inbox Item (⚡ Optimistic Remove):** Delete → item vanishes **instantly** → does not reappear

### 7.2 — Optimistic Rollback Behavior (Failure Path)

> **How to test:** Stop the backend server (`Ctrl+C` on the `bun run dev` process), then attempt each mutation. Restart the server after testing.

- [ ] **Create Task Rollback:** Add a task while backend is down → task appears optimistically → ~500ms later, task vanishes from list → error toast: "Failed to create task"
- [ ] **Check Off Rollback:** Check a task while backend is down → checkbox fills → ~500ms later, checkbox unchecks itself → error toast
- [ ] **Delete Rollback:** Delete a task while backend is down → task vanishes → ~500ms later, task reappears in original position → error toast
- [ ] **Reorder Rollback:** Reorder while backend is down → task moves → on next refetch, task reverts to original position → error toast
- [ ] **Create Project Rollback:** Create project while backend is down → project appears in sidebar → ~500ms later, project vanishes → error toast

### 7.3 — Loading States (💀 Skeleton / 🔇 Silent)

- [ ] **Cold Cache — First Load (💀):** Clear browser cache → open app → `TaskListSkeleton` (pulse-animated rows) appears for ~200ms-1s → replaced by real task list
- [ ] **Warm Cache — Tab Return (🔇):** Navigate away, come back → cached tasks shown **instantly** with NO loading indicator → fresh data loads silently in background
- [ ] **Calendar Dot Indicators (🔇):** Navigate to a new month → dot indicators appear after brief silent fetch → no loading spinner on the calendar itself
- [ ] **Sidebar Data (🔇):** Projects and inbox count load from cache after first fetch → NO loading spinners in sidebar ever
- [ ] **Empty State:** No tasks for selected date → `EmptyState` component shown (not a skeleton, not a spinner)

### 7.4 — Auth & Infrastructure

- [ ] **Auth Required:** Unauthenticated user redirected to sign-in page
- [ ] **Session Expiry:** Expired JWT triggers auto sign-out + redirect (via global QueryCache `onError`)
- [ ] **Calendar Date Select:** Click date in MiniCalendar → URL param updates → task list filters to that date's tasks
- [ ] **Toast Auto-Dismiss:** Error toasts disappear after 5 seconds without user interaction
- [ ] **Toast Close Button:** User can manually dismiss a toast before auto-dismiss

---

## 8. Phase 2 Deferred Items

| Feature                                  | Reason Deferred                     |
| ---------------------------------------- | ----------------------------------- |
| **Upcoming View** (`/upcoming`)          | No route/page exists                |
| **Completed View** (`/completed`)        | No route/page exists                |
| **Trash View** (`/trash`)                | No route/page; backend hard-deletes |
| **Project Detail Page** (`/project/:id`) | No route exists                     |
| **Inbox Page** (`/inbox`)                | No route/page exists                |
| **Search**                               | No backend search endpoint          |
| **Notifications**                        | No backend support                  |
| **Settings / Preferences**               | No backend support                  |
| **AI Inbox Processing**                  | Phase 2 backend                     |
| **User Metrics**                         | Phase 2 backend                     |
| **AI Memories**                          | Phase 2 backend                     |
| **Task Inline Edit Dialog**              | UI not built                        |
| **Set Priority**                         | No backend column for priority      |
| **Quick Add (Sidebar)**                  | Deferred to modular Quick Add modal |
| **Drag-to-Calendar**                     | Calendar is read-only in Phase 1    |

---

## Appendix A: Backend API Quick Reference

All routes prefixed with `/api/` require `Authorization: Bearer <JWT>`.

| Method   | Path                     | Body / Query                                                                                                                         | Returns                 |
| -------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `GET`    | `/health`                | —                                                                                                                                    | `{ status, timestamp }` |
| `GET`    | `/api/tasks`             | `?state=&projectId=&scheduledDate=&limit=&offset=`                                                                                   | `{ data: Task[] }`      |
| `POST`   | `/api/tasks`             | `{ title, orderIndex, state?, isAllDay?, dueDate?, scheduledStart?, scheduledEnd?, durationEstimate?, timezoneLocked?, projectId? }` | `{ data: Task }`        |
| `GET`    | `/api/tasks/:id`         | —                                                                                                                                    | `{ data: Task }`        |
| `PATCH`  | `/api/tasks/:id`         | Partial task fields                                                                                                                  | `{ data: Task }`        |
| `PATCH`  | `/api/tasks/:id/reorder` | `{ orderIndex }`                                                                                                                     | `{ data: Task }`        |
| `PATCH`  | `/api/tasks/batch/state` | `{ taskIds: string[], state }`                                                                                                       | `{ data: Task[] }`      |
| `DELETE` | `/api/tasks/:id`         | —                                                                                                                                    | `{ data: Task }`        |
| `GET`    | `/api/projects`          | —                                                                                                                                    | `{ data: Project[] }`   |
| `POST`   | `/api/projects`          | `{ name, colorAccent? }`                                                                                                             | `{ data: Project }`     |
| `GET`    | `/api/projects/:id`      | —                                                                                                                                    | `{ data: Project }`     |
| `PATCH`  | `/api/projects/:id`      | Partial project fields                                                                                                               | `{ data: Project }`     |
| `DELETE` | `/api/projects/:id`      | —                                                                                                                                    | `{ data: Project }`     |
| `GET`    | `/api/inbox`             | —                                                                                                                                    | `{ data: InboxItem[] }` |
| `POST`   | `/api/inbox`             | `{ rawText }`                                                                                                                        | `{ data: InboxItem }`   |
| `DELETE` | `/api/inbox/:id`         | —                                                                                                                                    | `{ data: InboxItem }`   |

---

## Appendix B: Dependency Check

All required packages are **already installed**:

| Package                   | Purpose                    | Installed? |
| ------------------------- | -------------------------- | ---------- |
| `@tanstack/react-query`   | Server state management    | ✅         |
| `hono` (dev)              | `hc` typed RPC client      | ✅         |
| `sonner`                  | Toast notifications        | ✅         |
| `@dnd-kit/core`           | Drag and drop engine       | ✅         |
| `@dnd-kit/sortable`       | Sortable list primitives   | ✅         |
| `@dnd-kit/utilities`      | DnD helper utilities       | ✅         |
| `@radix-ui/react-popover` | Create project popover     | ✅         |
| `@radix-ui/react-dialog`  | Task edit dialog (Phase 2) | ✅         |
| `lucide-react`            | Icons                      | ✅         |
| `framer-motion` (dev)     | Animations                 | ✅         |

**One new dependency added:** `sonner` for toast notifications (replaces custom Zustand toast store).
