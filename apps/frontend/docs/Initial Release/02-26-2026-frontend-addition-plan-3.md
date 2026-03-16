# Cadence Frontend Implementation Plan #3 — Task Addition & Editing

## Objective

Implement proper task creation with inline deadline scheduling, a full-featured task editing dropdown, and all supporting backend infrastructure. When a user types in the "Add task" input and submits, they should be able to set a deadline (date, time, repetition, reminder) via a compact calendar popup with icon-only quick actions. Once a task exists, a rich context menu dropdown provides full editing capabilities.

---

## Current State Audit

### What Exists Today

| Layer    | Asset                        | Status                                                                                   |
| -------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| Backend  | `tasks` table schema         | ✅ Has `dueDate`, `scheduledStart`, `scheduledEnd`, `durationEstimate`, `timezoneLocked` |
| Backend  | `tasks` PATCH route          | ✅ Accepts partial updates to all fields                                                 |
| Backend  | `tasks` POST route           | ✅ Accepts `dueDate`, `scheduledStart`, `scheduledEnd`                                   |
| Backend  | Priority column              | ❌ Does not exist in schema                                                              |
| Backend  | Reminder fields              | ❌ Does not exist in schema                                                              |
| Backend  | Repetition/recurrence fields | ❌ Does not exist in schema                                                              |
| Backend  | Tags system                  | ❌ Does not exist (no table, no routes)                                                  |
| Backend  | Pin field                    | ❌ Does not exist in schema                                                              |
| Backend  | Duplicate task route         | ❌ No dedicated route (can be done client-side via POST)                                 |
| Frontend | `AddTaskInput.tsx`           | ✅ Creates task on Enter — title only, no deadline picker                                |
| Frontend | `TaskContextMenu.tsx`        | ✅ Has Delete (wired), Edit (stub), Move to project (stub)                               |
| Frontend | `TaskCard.tsx`               | ✅ Renders task with checkbox, title, time/due labels                                    |
| Frontend | `useCreateTask` hook         | ✅ Optimistic insert with `dueDate`, `scheduledStart` support                            |
| Frontend | `useUpdateTask` hook         | ✅ Optimistic patch for any field                                                        |
| Frontend | `useDeleteTask` hook         | ✅ Optimistic removal                                                                    |
| Frontend | Popover primitive            | ✅ Pre-themed Radix Popover                                                              |
| Frontend | DropdownMenu primitive       | ✅ Pre-themed Radix DropdownMenu with variant support                                    |
| Frontend | `useProjects` hook           | ✅ Fetches all user projects                                                             |

### What Needs to Be Built

| Category     | Item                                                   | Scope           |
| ------------ | ------------------------------------------------------ | --------------- |
| **Backend**  | Add `priority` column to `tasks` table                 | Schema + Routes |
| **Backend**  | Add `isPinned` column to `tasks` table                 | Schema + Routes |
| **Backend**  | Add `reminderAt` column to `tasks` table               | Schema + Routes |
| **Backend**  | Add `reminderSilenced` column to `tasks` table         | Schema + Routes |
| **Backend**  | Add `recurrenceRule` column to `tasks` table           | Schema + Routes |
| **Backend**  | Create `tags` table                                    | Schema + Routes |
| **Backend**  | Create `task_tags` join table                          | Schema + Routes |
| **Backend**  | Tag CRUD routes (`/api/tags`)                          | New route file  |
| **Backend**  | Task-tag association routes                            | Extend tasks    |
| **Backend**  | Duplicate task route (`POST /api/tasks/:id/duplicate`) | Extend tasks    |
| **Frontend** | `DeadlinePickerPopover` component                      | New component   |
| **Frontend** | Expand `TaskContextMenu` with all actions              | Modify existing |
| **Frontend** | `MoveToSubmenu` component                              | New component   |
| **Frontend** | `TagPickerSubmenu` component                           | New component   |
| **Frontend** | `PriorityPicker` inline component                      | New component   |
| **Frontend** | Update `Task` type with new fields                     | Modify existing |
| **Frontend** | New hooks for tags, duplicate, etc.                    | New hooks       |

---

## Backend Prerequisites

> **Full backend plan:** [`cadence-backend/docs/02-26-2026_backend-task-editing-plan.md`](../../cadence-backend/docs/02-26-2026_backend-task-editing-plan.md)
>
> The backend plan covers schema changes, validation schemas, route handlers, migration steps, and smoke tests in full detail. Below is a summary of what the frontend depends on.

### Schema Additions (5 new columns on `tasks`, 2 new tables)

| Column / Table           | Type                   | Frontend Impact                                              |
| ------------------------ | ---------------------- | ------------------------------------------------------------ |
| `tasks.priority`         | `integer` (0-4)        | Sortable priority: 0=none, 1=low, 2=medium, 3=high, 4=urgent |
| `tasks.isPinned`         | `boolean`              | Pinned tasks render above unpinned in list                   |
| `tasks.reminderAt`       | `timestamp` (nullable) | Exact datetime for notification — null means no reminder     |
| `tasks.reminderSilenced` | `boolean`              | Suppresses notification without clearing the time            |
| `tasks.recurrenceRule`   | `text` (nullable)      | iCalendar RRULE string (e.g. `FREQ=DAILY;INTERVAL=1`)        |
| `tags` table             | CRUD table             | User-defined labels with `name` and `color` fields           |
| `task_tags` table        | Join table             | Many-to-many relationship between tasks and tags             |

### New API Endpoints (consumed by frontend hooks)

| Method   | Path                         | Purpose                         | Frontend Hook      |
| -------- | ---------------------------- | ------------------------------- | ------------------ |
| `POST`   | `/api/tasks/:id/duplicate`   | Duplicate task + copy tags      | `useDuplicateTask` |
| `GET`    | `/api/tasks/:id/tags`        | List tags on a task             | (inline fetch)     |
| `POST`   | `/api/tasks/:id/tags`        | Associate tag with task         | `useAddTaskTag`    |
| `DELETE` | `/api/tasks/:id/tags/:tagId` | Remove tag from task            | `useRemoveTaskTag` |
| `GET`    | `/api/tags`                  | List all user tags              | `useTags`          |
| `POST`   | `/api/tags`                  | Create tag                      | `useCreateTag`     |
| `PATCH`  | `/api/tags/:id`              | Update tag name/color           | (future)           |
| `DELETE` | `/api/tags/:id`              | Delete tag (cascades task_tags) | (future)           |

### Updated Existing Endpoints

- `POST /api/tasks` and `PATCH /api/tasks/:id` now accept: `priority`, `isPinned`, `reminderAt`, `reminderSilenced`, `recurrenceRule`
- `GET /api/tasks` now accepts filters: `?priority=3`, `?isPinned=true`

---

## Phase 1: Frontend Type Updates

### 1.1 — Update `Task` Interface (`cadence-frontend/app/types/task.ts`)

```typescript
export type TaskState = "ACTIVE" | "DONE" | "ARCHIVED";
export type TaskPriority = 0 | 1 | 2 | 3 | 4;
// 0 = none, 1 = low, 2 = medium, 3 = high, 4 = urgent

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

	// ── NEW FIELDS ──
	priority: TaskPriority;
	isPinned: boolean;
	reminderAt: string | null;
	reminderSilenced: boolean;
	recurrenceRule: string | null;
}

export interface CreateTaskInput {
	title: string;
	orderIndex: number;
	projectId?: string;
	scheduledStart?: string;
	scheduledEnd?: string;
	dueDate?: string;
	isAllDay?: boolean;

	// ── NEW FIELDS ──
	priority?: TaskPriority;
	isPinned?: boolean;
	reminderAt?: string;
	reminderSilenced?: boolean;
	recurrenceRule?: string;
}

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
		| "priority"
		| "isPinned"
		| "reminderAt"
		| "reminderSilenced"
		| "recurrenceRule"
	>
>;
```

### 1.2 — Create `Tag` Types (`cadence-frontend/app/types/tag.ts`) — NEW FILE

```typescript
export interface Tag {
	id: string;
	userId: string;
	name: string;
	color: string;
	createdAt: string;
}

export interface CreateTagInput {
	name: string;
	color?: string;
}
```

### 1.3 — Priority Constants (`cadence-frontend/app/lib/utils/priority.ts`) — NEW FILE

```typescript
import type { TaskPriority } from "../../types/task";

export const PRIORITY_CONFIG: Record<
	TaskPriority,
	{
		label: string;
		icon: string; // Lucide icon name
		color: string; // Tailwind-compatible color token
		sortWeight: number; // Higher = sorted to top
	}
> = {
	0: {
		label: "None",
		icon: "Minus",
		color: "text-twilight-text-muted/40",
		sortWeight: 0,
	},
	1: { label: "Low", icon: "ArrowDown", color: "text-blue-400", sortWeight: 1 },
	2: {
		label: "Medium",
		icon: "ArrowRight",
		color: "text-lantern",
		sortWeight: 2,
	},
	3: {
		label: "High",
		icon: "ArrowUp",
		color: "text-orange-400",
		sortWeight: 3,
	},
	4: {
		label: "Urgent",
		icon: "AlertCircle",
		color: "text-red-400",
		sortWeight: 4,
	},
};

export function getPriorityConfig(priority: TaskPriority) {
	return PRIORITY_CONFIG[priority];
}
```

---

## Phase 2: Frontend Hook Additions

### 2.1 — `useDuplicateTask` Hook (`cadence-frontend/app/hooks/tasks/use-duplicate-task.ts`) — NEW FILE

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { invalidateTaskCaches } from "./optimistic-helpers";
import type { Task } from "../../types/task";
import { toast } from "sonner";

/** Duplicate a task — server generates new ID, appends "(copy)" to title */
export function useDuplicateTask() {
	const client = useApiClient();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (taskId: string) => {
			const res = await client.api.tasks[":id"].duplicate.$post({
				param: { id: taskId },
			});
			return unwrapResponse<Task>(res);
		},

		onSuccess: () => {
			toast.success("Task duplicated");
		},

		onError: (err) => {
			toast.error(err.message || "Failed to duplicate task");
		},

		onSettled: () => invalidateTaskCaches(queryClient),
	});
}
```

> **Note:** Duplicate is NOT optimistic — we don't know the server-generated ID or exact `orderIndex` adjustments ahead of time. Instead, we invalidate and let the cache refetch. A brief silent refetch is acceptable for this rare action.

### 2.2 — Tag Hook Layer (`cadence-frontend/app/hooks/tags/`) — NEW FOLDER

#### `use-tags.ts`

```typescript
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Tag } from "../../types/tag";

/** Fetch all user tags */
export function useTags() {
	const client = useApiClient();

	return useQuery({
		queryKey: queryKeys.tags.all,
		queryFn: async () => {
			const res = await client.api.tags.$get();
			return unwrapResponse<Tag[]>(res);
		},
	});
}
```

#### `use-create-tag.ts`

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import type { Tag, CreateTagInput } from "../../types/tag";
import { toast } from "sonner";

/** Create a tag with optimistic insertion */
export function useCreateTag() {
	const client = useApiClient();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (input: CreateTagInput) => {
			const res = await client.api.tags.$post({ json: input });
			return unwrapResponse<Tag>(res);
		},

		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.tags.all });
			const snapshot = queryClient.getQueryData<Tag[]>(queryKeys.tags.all);

			const optimisticTag: Tag = {
				id: `temp-${Date.now()}`,
				userId: "",
				name: input.name,
				color: input.color ?? "default",
				createdAt: new Date().toISOString(),
			};

			queryClient.setQueryData<Tag[]>(queryKeys.tags.all, (old) =>
				old ? [...old, optimisticTag] : [optimisticTag],
			);

			return { snapshot };
		},

		onError: (err, _input, context) => {
			if (context?.snapshot) {
				queryClient.setQueryData(queryKeys.tags.all, context.snapshot);
			}
			toast.error(err.message || "Failed to create tag");
		},

		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.tags.all }),
	});
}
```

#### `use-task-tags.ts`

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { toast } from "sonner";

/** Add a tag to a task */
export function useAddTaskTag() {
	const client = useApiClient();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			taskId,
			tagId,
		}: {
			taskId: string;
			tagId: string;
		}) => {
			const res = await client.api.tasks[":id"].tags.$post({
				param: { id: taskId },
				json: { tagId },
			});
			return unwrapResponse<unknown>(res);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
		},
		onError: (err) => toast.error(err.message || "Failed to add tag"),
	});
}

/** Remove a tag from a task */
export function useRemoveTaskTag() {
	const client = useApiClient();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			taskId,
			tagId,
		}: {
			taskId: string;
			tagId: string;
		}) => {
			const res = await client.api.tasks[":id"].tags[":tagId"].$delete({
				param: { id: taskId, tagId },
			});
			return unwrapResponse<unknown>(res);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
		},
		onError: (err) => toast.error(err.message || "Failed to remove tag"),
	});
}
```

#### `index.ts`

```typescript
export { useTags } from "./use-tags";
export { useCreateTag } from "./use-create-tag";
export { useAddTaskTag, useRemoveTaskTag } from "./use-task-tags";
```

### 2.3 — Update Task Hook Barrel (`cadence-frontend/app/hooks/tasks/index.ts`)

Add the new duplicate export:

```typescript
export { useDuplicateTask } from "./use-duplicate-task";
```

### 2.4 — Update `useCreateTask` Optimistic Task

In `hooks/tasks/use-create-task.ts`, extend the optimistic task object to include new fields:

```typescript
const optimisticTask: Task = {
	// ...existing fields...
	priority: input.priority ?? 0,
	isPinned: input.isPinned ?? false,
	reminderAt: input.reminderAt ?? null,
	reminderSilenced: input.reminderSilenced ?? false,
	recurrenceRule: input.recurrenceRule ?? null,
};
```

And extend the `mutationFn` json body:

```typescript
...(input.priority !== undefined && { priority: input.priority }),
...(input.reminderAt && { reminderAt: input.reminderAt }),
...(input.recurrenceRule && { recurrenceRule: input.recurrenceRule }),
```

### 2.5 — Update Query Keys (`cadence-frontend/app/lib/api/query-keys.ts`)

```typescript
export const queryKeys = {
	tasks: {
		/* ...existing... */
	},
	projects: {
		/* ...existing... */
	},
	inbox: {
		/* ...existing... */
	},

	// ── NEW ──
	tags: {
		all: ["tags"] as const,
	},
} as const;
```

---

## Phase 3: Frontend Component Additions

### 3.1 — File Structure (New & Modified)

```
cadence-frontend/app/
│
├── components/
│   ├── tasks/
│   │   ├── AddTaskInput.tsx                  ✏️  MODIFY — add DeadlinePickerPopover trigger
│   │   ├── TaskCard.tsx                      ✏️  MODIFY — show priority indicator + pin icon + tags
│   │   ├── TaskContextMenu.tsx               ✏️  MODIFY — full dropdown with all actions
│   │   ├── DeadlinePickerPopover.tsx         🆕  Compact calendar popup with quick actions
│   │   ├── DeadlineQuickActions.tsx          🆕  Icon-only quick action bar (today/tomorrow/next week/custom)
│   │   ├── TimePickerInput.tsx              🆕  Minimal time selector (hour:minute AM/PM)
│   │   ├── RecurrencePicker.tsx             🆕  Repetition rule selector (daily, weekly, custom)
│   │   ├── PriorityPicker.tsx               🆕  Icon-only priority selector (inline in dropdown)
│   │   ├── MoveToSubmenu.tsx                🆕  Project picker submenu inside context menu
│   │   ├── TagPickerSubmenu.tsx             🆕  Tag picker submenu with create-inline
│   │   └── ... (existing files unchanged)
│   │
│   └── ... (other folders unchanged)
│
├── hooks/
│   ├── tasks/
│   │   ├── use-duplicate-task.ts             🆕  POST /:id/duplicate mutation
│   │   └── ... (existing files modified)
│   │
│   └── tags/                                 🆕  FOLDER — tag domain hooks
│       ├── use-tags.ts                       🆕  GET /api/tags query
│       ├── use-create-tag.ts                 🆕  POST /api/tags mutation
│       ├── use-task-tags.ts                  🆕  Task-tag association mutations
│       └── index.ts                          🆕  Barrel export
│
├── types/
│   ├── task.ts                               ✏️  MODIFY — add new fields
│   └── tag.ts                                🆕  Tag, CreateTagInput
│
└── lib/
    └── utils/
        └── priority.ts                       🆕  Priority config (labels, icons, colors)
```

### 3.2 — `DeadlinePickerPopover.tsx` — The Core Add-Task Calendar Popup

**Purpose:** A compact, icon-driven popover that appears next to the AddTaskInput. It provides quick deadline setting with zero friction.

**Layout (icon-only, compact):**

```
┌─────────────────────────────────────────────────────┐
│  Quick actions (icon row):                          │
│  [📅 Today] [⏭ Tomorrow] [📆 Next Week] [🗓 Custom] │
│                                                     │
│  ── Separator ──                                    │
│                                                     │
│  [🕐 Time]  [🔁 Repeat]  [🔔 Reminder]              │
│                                                     │
│  ── When "Custom" or "Time" clicked: ──             │
│                                                     │
│  ┌─────────────────────────────┐                    │
│  │    Mini Calendar Grid       │                    │
│  │    (reuse CalendarGrid)     │                    │
│  └─────────────────────────────┘                    │
│                                                     │
│  ┌─────────────────────────────┐                    │
│  │    Time Picker (optional)   │                    │
│  └─────────────────────────────┘                    │
│                                                     │
│  [Set Deadline]                                     │
└─────────────────────────────────────────────────────┘
```

**UX Strategy:**

| Interaction                      | UX                                                                   |
| -------------------------------- | -------------------------------------------------------------------- |
| Click "Today" icon               | ⚡ Instant — sets dueDate to today, closes popover                   |
| Click "Tomorrow" icon            | ⚡ Instant — sets dueDate to tomorrow, closes popover                |
| Click "Next Week" icon           | ⚡ Instant — sets dueDate to next Monday, closes popover             |
| Click "Custom"                   | Expands inline mini-calendar for date picking                        |
| Click "Time" icon                | Expands inline time picker (hour:minute AM/PM)                       |
| Click "Repeat" icon              | Expands recurrence picker (daily, weekdays, weekly, monthly, custom) |
| Click "Reminder" icon            | Sets reminderAt = dueDate - 30min (default), shows time pill         |
| Press "Set Deadline" (in custom) | Confirms selection, closes popover                                   |

**Props interface:**

```typescript
interface DeadlinePickerPopoverProps {
	/** Current deadline state (for editing existing tasks) */
	currentDeadline?: {
		dueDate?: string | null;
		scheduledStart?: string | null;
		reminderAt?: string | null;
		recurrenceRule?: string | null;
	};
	/** Called when user makes a deadline selection */
	onDeadlineSet: (deadline: {
		dueDate?: string;
		scheduledStart?: string;
		scheduledEnd?: string;
		isAllDay?: boolean;
		reminderAt?: string;
		recurrenceRule?: string;
	}) => void;
	/** Trigger element (the calendar icon button) */
	children: React.ReactNode;
}
```

**Usage in AddTaskInput:**

The AddTaskInput will be modified to include a calendar icon button to the right of the input field. Clicking it opens the `DeadlinePickerPopover`. When a deadline is selected, it's stored in local state and included in the `createTask.mutate()` call on Enter.

```tsx
// Inside AddTaskInput, next to the input field:
<DeadlinePickerPopover onDeadlineSet={handleDeadlineSet}>
	<button className="icon-button" aria-label="Set deadline">
		<Calendar size={16} />
	</button>
</DeadlinePickerPopover>
```

When a deadline is set, show a small pill/badge below or beside the input:

```
[ + Add a task…                          📅 ]
  [ Due Tomorrow × ]  [ 🔁 Daily × ]
```

Each pill is dismissible (×), clearing that portion of the deadline config.

### 3.3 — `DeadlineQuickActions.tsx` — Icon-Only Quick Action Bar

**Purpose:** Horizontal row of icon-only buttons for the most common deadline selections.

```typescript
interface DeadlineQuickActionsProps {
	onSelect: (preset: "today" | "tomorrow" | "next_week" | "custom") => void;
	activePreset?: string;
}
```

**Icons used (from `lucide-react`):**

| Action    | Icon             | Tooltip text  |
| --------- | ---------------- | ------------- |
| Today     | `CalendarCheck`  | "Today"       |
| Tomorrow  | `CalendarPlus`   | "Tomorrow"    |
| Next Week | `CalendarRange`  | "Next week"   |
| Custom    | `CalendarSearch` | "Pick a date" |

Each button is wrapped in the existing `Tip` tooltip component for accessibility.

### 3.4 — `TimePickerInput.tsx` — Minimal Time Selector

**Purpose:** A simple hour:minute AM/PM input for setting task time.

**Layout:**

```
┌──────┐ : ┌──────┐  ┌────┐
│  09  │   │  00  │  │ AM │
└──────┘   └──────┘  └────┘
```

- Two number inputs (hour, minute) with scroll-to-change.
- AM/PM toggle button.
- Returns ISO time string fragment.

### 3.5 — `RecurrencePicker.tsx` — Repetition Rule Selector

**Purpose:** Dropdown-style picker for recurrence with common presets and a custom option.

**Presets:**

| Label    | RRULE                              |
| -------- | ---------------------------------- |
| Daily    | `FREQ=DAILY;INTERVAL=1`            |
| Weekdays | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |
| Weekly   | `FREQ=WEEKLY;INTERVAL=1`           |
| Biweekly | `FREQ=WEEKLY;INTERVAL=2`           |
| Monthly  | `FREQ=MONTHLY;INTERVAL=1`          |
| None     | `null` (clears recurrence)         |

### 3.6 — `PriorityPicker.tsx` — Inline Priority Selector

**Purpose:** Used inside the TaskContextMenu dropdown. Renders as a sub-section with 5 icon buttons (None, Low, Medium, High, Urgent).

```
┌─────────────────────────────┐
│  Priority:                   │
│  [─] [↓] [→] [↑] [⚠]       │
│  None  Low Med High Urgent   │
└─────────────────────────────┘
```

Each icon uses colors from `PRIORITY_CONFIG`. The active priority is highlighted.

**UX Strategy:** ⚡ Optimistic — clicking a priority icon immediately fires `useUpdateTask({ id, priority: N })` and the menu stays open. The TaskCard re-renders instantly with the new priority indicator.

### 3.7 — `MoveToSubmenu.tsx` — Project Picker

**Purpose:** DropdownMenu sub-menu that lists all user projects. Clicking a project moves the task.

```typescript
interface MoveToSubmenuProps {
	task: Task;
}
```

- Calls `useProjects()` to list available projects.
- Shows current project with a check icon.
- "No project" option at top to unassign.
- Clicking a project fires `useUpdateTask({ id, projectId })`.

**UX Strategy:** ⚡ Optimistic — task instantly reflects new project assignment on click.

### 3.8 — `TagPickerSubmenu.tsx` — Tag Association Picker

**Purpose:** DropdownMenu sub-menu that lists all user tags with checkboxes. Users can also create new tags inline.

- Calls `useTags()` to list available tags.
- Shows currently applied tags with check marks.
- "Create new tag" option at bottom with inline text input.
- Clicking a tag toggles it via `useAddTaskTag` / `useRemoveTaskTag`.

**UX Strategy:** Non-optimistic for tag associations (requires server ID). Silent refetch after mutation.

### 3.9 — Expanded `TaskContextMenu.tsx` — Full Editing Dropdown

**Current state:** Edit (stub), Move to project (stub), Delete (wired).

**New structure:**

```
┌───────────────────────────────┐
│  ── Quick Access ──            │
│                                │
│  Deadline:                     │
│  [Today] [Tomorrow] [Next Wk]  │
│  [Custom...]                   │
│                                │
│  🔔 Silence reminder  [toggle] │
│                                │
│  Priority:                     │
│  [─] [↓] [→] [↑] [⚠]          │
│                                │
│  ── Separator ──               │
│                                │
│  📋 Duplicate                   │
│  📌 Pin / Unpin                 │
│  📂 Move to    ▸  (submenu)    │
│  🏷 Add tags    ▸  (submenu)    │
│  📋 Copy                       │
│                                │
│  ── Separator ──               │
│                                │
│  🗑 Delete                      │
└───────────────────────────────┘
```

**Action-by-action breakdown:**

| Action               | Hook Used                          | UX Strategy                                                                                     |
| -------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Deadline → Today     | `useUpdateTask`                    | ⚡ Optimistic — dueDate updates instantly, menu closes                                          |
| Deadline → Tomorrow  | `useUpdateTask`                    | ⚡ Optimistic — dueDate updates instantly, menu closes                                          |
| Deadline → Next Week | `useUpdateTask`                    | ⚡ Optimistic — dueDate updates instantly, menu closes                                          |
| Deadline → Custom    | Opens DeadlinePickerPopover nested | Opens popover, menu stays open until confirmed                                                  |
| Silence reminder     | `useUpdateTask`                    | ⚡ Optimistic — toggle icon swaps instantly                                                     |
| Set priority         | `useUpdateTask`                    | ⚡ Optimistic — priority icon/color updates instantly, menu stays open                          |
| Duplicate            | `useDuplicateTask`                 | 🔇 Silent refetch — duplicate appears after ~200ms                                              |
| Pin / Unpin          | `useUpdateTask`                    | ⚡ Optimistic — pin icon toggles instantly                                                      |
| Move to (submenu)    | `useUpdateTask`                    | ⚡ Optimistic — task moves instantly                                                            |
| Add tags (submenu)   | `useAddTaskTag`                    | 🔇 Silent refetch — tag badge appears after ~200ms                                              |
| Copy                 | Clipboard API                      | Copies task data as structured JSON to clipboard. No network call. Toast: "Copied to clipboard" |
| Delete               | `useDeleteTask`                    | ⚡ Optimistic — task vanishes instantly                                                         |

### 3.10 — Updated `TaskCard.tsx` — Visual Enhancements

Add visual indicators for the new task properties:

```
┌──────────────────────────────────────────────────────────┐
│ ⠿  ○  Buy groceries                            [📌] [⋯] │
│        🔴 High  ·  Due Feb 28  ·  🔁 Daily  ·  #errand   │
└──────────────────────────────────────────────────────────┘
```

| Visual Element     | Source Field          | Rendering                                              |
| ------------------ | --------------------- | ------------------------------------------------------ |
| Priority indicator | `task.priority`       | Colored dot/icon before title (from `PRIORITY_CONFIG`) |
| Pin icon           | `task.isPinned`       | 📌 icon in top-right if pinned                         |
| Recurrence badge   | `task.recurrenceRule` | 🔁 icon + short label ("Daily", "Weekly", etc.)        |
| Reminder indicator | `task.reminderAt`     | 🔔 icon (muted if `reminderSilenced`)                  |
| Tag chips          | from task-tag join    | Small colored pills with tag name                      |

---

## Phase 4: Updated `AddTaskInput.tsx` Flow

### Current Flow

```
User types → Presses Enter → Task created with title only
```

### New Flow

```
User types → Optionally clicks 📅 to set deadline → Presses Enter → Task created with title + deadline
```

**State management within AddTaskInput:**

```typescript
const [value, setValue] = useState("");
const [deadline, setDeadline] = useState<{
	dueDate?: string;
	scheduledStart?: string;
	scheduledEnd?: string;
	isAllDay?: boolean;
	reminderAt?: string;
	recurrenceRule?: string;
} | null>(null);

const handleSubmit = () => {
	if (!value.trim()) return;

	createTask.mutate({
		title: value.trim(),
		orderIndex: computeNextOrderIndex(tasks),
		scheduledStart: deadline?.scheduledStart ?? `${dateToUse}T09:00:00Z`,
		isAllDay: deadline?.isAllDay ?? true,
		dueDate: deadline?.dueDate,
		reminderAt: deadline?.reminderAt,
		recurrenceRule: deadline?.recurrenceRule,
		...(projectId && { projectId }),
	});

	setValue("");
	setDeadline(null); // Reset deadline after submission
};
```

**Visual change to AddTaskInput:**

```
┌──────────────────────────────────────────────────────────────┐
│  +  Add a task…                                          [📅] │
│     [ Due Tomorrow × ]  [ 🔁 Daily × ]  [ 🔔 Reminder × ]   │
└──────────────────────────────────────────────────────────────┘
```

- The `📅` calendar icon triggers the `DeadlinePickerPopover`.
- Below the input, small pills show what deadline properties are set.
- Each pill has an `×` to clear that specific property.

---

## Phase 5: Copy-Paste Task Across Projects

### Implementation Strategy

**Copy** serializes the task to the clipboard as a structured JSON payload:

```typescript
const handleCopy = async (task: Task) => {
	const payload = {
		type: "cadence-task",
		title: task.title,
		content: task.content,
		priority: task.priority,
		dueDate: task.dueDate,
		recurrenceRule: task.recurrenceRule,
		isAllDay: task.isAllDay,
	};
	await navigator.clipboard.writeText(JSON.stringify(payload));
	toast.success("Task copied to clipboard");
};
```

**Paste** is handled globally via a keyboard listener (Ctrl/Cmd+V) on task list views. If the clipboard contains a valid `cadence-task` payload, we call `useCreateTask` to insert it into the current view's context (inheriting the current project or date):

```typescript
// In TaskList.tsx or a layout-level effect:
useEffect(() => {
	const handlePaste = async (e: ClipboardEvent) => {
		const text = e.clipboardData?.getData("text/plain");
		if (!text) return;
		try {
			const payload = JSON.parse(text);
			if (payload.type !== "cadence-task") return;
			e.preventDefault();
			createTask.mutate({
				title: payload.title,
				content: payload.content,
				priority: payload.priority,
				dueDate: payload.dueDate,
				recurrenceRule: payload.recurrenceRule,
				isAllDay: payload.isAllDay ?? true,
				orderIndex: computeNextOrderIndex(tasks),
				...(projectId && { projectId }), // Inherit current project context
			});
		} catch {
			// Not a Cadence task — ignore
		}
	};
	document.addEventListener("paste", handlePaste);
	return () => document.removeEventListener("paste", handlePaste);
}, [tasks, projectId]);
```

---

## Backend API Quick Reference

> Full API reference with validators, route order, and response shapes: [`cadence-backend/docs/02-26-2026_backend-task-editing-plan.md` §8](../../cadence-backend/docs/02-26-2026_backend-task-editing-plan.md)

---

## Implementation Order

> **Backend steps 1–5** are tracked separately in [`cadence-backend/docs/02-26-2026_backend-task-editing-plan.md` §10](../../cadence-backend/docs/02-26-2026_backend-task-editing-plan.md). Complete those first (~1h 45m).

| Step                           | Files Created / Modified                                                                                                | Deliverable                                      | Estimated Effort |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------- |
| **1. Frontend Types**          | `types/task.ts` (extend), `types/tag.ts` (new)                                                                          | Updated TS interfaces                            | 10 min           |
| **2. Frontend Utils**          | `lib/utils/priority.ts` (new)                                                                                           | Priority config constants                        | 5 min            |
| **3. Frontend Query Keys**     | `lib/api/query-keys.ts` (extend)                                                                                        | Tags query key                                   | 2 min            |
| **4. Frontend Tag Hooks**      | `hooks/tags/use-tags.ts`, `use-create-tag.ts`, `use-task-tags.ts`, `index.ts`                                           | Full tag hook layer (4 files)                    | 25 min           |
| **5. Frontend Duplicate Hook** | `hooks/tasks/use-duplicate-task.ts`, update barrel                                                                      | Duplicate mutation hook                          | 10 min           |
| **6. Update useCreateTask**    | `hooks/tasks/use-create-task.ts`                                                                                        | Support new fields in optimistic task            | 10 min           |
| **7. DeadlinePickerPopover**   | `components/tasks/DeadlinePickerPopover.tsx`, `DeadlineQuickActions.tsx`, `TimePickerInput.tsx`, `RecurrencePicker.tsx` | Full deadline picker UI system (4 files)         | 1.5 hours        |
| **8. PriorityPicker**          | `components/tasks/PriorityPicker.tsx`                                                                                   | Inline priority selector                         | 20 min           |
| **9. MoveToSubmenu**           | `components/tasks/MoveToSubmenu.tsx`                                                                                    | Project picker sub-menu                          | 20 min           |
| **10. TagPickerSubmenu**       | `components/tasks/TagPickerSubmenu.tsx`                                                                                 | Tag picker sub-menu with inline create           | 30 min           |
| **11. Expand TaskContextMenu** | `components/tasks/TaskContextMenu.tsx`                                                                                  | Full editing dropdown with all actions           | 45 min           |
| **12. Update AddTaskInput**    | `components/tasks/AddTaskInput.tsx`                                                                                     | Integrate DeadlinePickerPopover + deadline pills | 30 min           |
| **13. Update TaskCard**        | `components/tasks/TaskCard.tsx`                                                                                         | Priority, pin, recurrence, reminder indicators   | 25 min           |
| **14. Copy-Paste Handler**     | `components/tasks/TaskList.tsx`                                                                                         | Clipboard copy/paste for tasks                   | 15 min           |
| **15. Smoke Testing**          | —                                                                                                                       | Full flow verification                           | 30 min           |

**Frontend total estimated:** ~5 hours across **~15 files** (12 new, 3 modified). Backend is ~1h 45m tracked separately.

---

## Testing Checklist

### Task Creation with Deadline

- [ ] Type task title → press Enter without deadline → task creates as all-day (existing behavior maintained)
- [ ] Click 📅 icon → select "Today" → deadline pill shows "Due Today" → press Enter → task created with today's dueDate
- [ ] Click 📅 icon → select "Tomorrow" → deadline pill shows → press Enter → task persists with tomorrow's date
- [ ] Click 📅 icon → select "Next Week" → next Monday calculated correctly
- [ ] Click 📅 icon → select "Custom" → mini calendar appears → pick date → confirm → pill shows selected date
- [ ] Click 🕐 icon → pick time → isAllDay becomes false, scheduledStart reflects chosen time
- [ ] Click 🔁 icon → select "Daily" → recurrenceRule = "FREQ=DAILY;INTERVAL=1" persists
- [ ] Click 🔔 icon → reminder set to 30min before deadline → reminderAt persists
- [ ] Dismiss deadline pill (×) → that property clears from local state

### Task Context Menu (Editing Dropdown)

- [ ] **Duplicate:** Click → new task appears with "(copy)" suffix → separate server ID
- [ ] **Delete:** Click → task vanishes optimistically → persists on refresh
- [ ] **Pin:** Click → pin icon appears on TaskCard → isPinned = true on server
- [ ] **Unpin:** Click already-pinned → icon removes → isPinned = false on server
- [ ] **Copy:** Click → clipboard contains valid JSON → toast confirms
- [ ] **Move to (submenu):** Lists all projects → click project → task's projectId updates optimistically
- [ ] **Move to → No project:** Unassigns task from project → projectId = null
- [ ] **Add tags (submenu):** Lists all tags → toggle tag on → tag chip appears on TaskCard
- [ ] **Add tags → Create new tag:** Type name → tag created → auto-applied to task

### Quick Access (in Context Menu)

- [ ] **Deadline → Today:** dueDate updates optimistically → reflected in TaskCard
- [ ] **Deadline → Tomorrow:** dueDate updates optimistically
- [ ] **Deadline → Next Week:** dueDate updates optimistically
- [ ] **Deadline → Custom:** Opens DeadlinePickerPopover within context menu
- [ ] **Silence reminder toggle:** reminderSilenced toggles → bell icon changes to muted
- [ ] **Priority → Urgent:** priority updates to 4 → red indicator on TaskCard
- [ ] **Priority → None:** priority updates to 0 → indicator removes

### Copy-Paste Flow

- [ ] Copy a task → navigate to another project → Ctrl/Cmd+V → task pasted with current project's projectId
- [ ] Copy a task → paste on Today view → task inherits selected date
- [ ] Paste non-task clipboard content → nothing happens (graceful no-op)

### Visual Indicators on TaskCard

- [ ] Priority > 0 → colored priority icon visible next to title
- [ ] isPinned = true → pin icon visible in top-right
- [ ] recurrenceRule set → 🔁 badge visible in metadata row
- [ ] reminderAt set + not silenced → 🔔 icon visible
- [ ] reminderAt set + silenced → 🔕 icon visible (muted variant)
- [ ] Tags assigned → small colored pills visible below title

---

## Dependency Check

| Package                         | Purpose                    | Installed? |
| ------------------------------- | -------------------------- | ---------- |
| `@radix-ui/react-popover`       | DeadlinePickerPopover      | ✅         |
| `@radix-ui/react-dropdown-menu` | TaskContextMenu + submenus | ✅         |
| `@radix-ui/react-tooltip`       | Icon button tooltips       | ✅         |
| `lucide-react`                  | All icons                  | ✅         |
| `sonner`                        | Toast notifications        | ✅         |
| `@tanstack/react-query`         | All mutations + queries    | ✅         |

**No new dependencies required.** All primitives and libraries are already installed.
