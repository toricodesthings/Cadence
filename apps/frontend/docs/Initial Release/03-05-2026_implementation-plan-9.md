# Implementation Plan 9: Settings UI & Backend Architecture

This document dictates the production-ready implementation plan for the Cadence Settings system. It is designed to be highly specific, actionable by AI agents, and strictly adherent to the "Twilight Sanctuary" Design Manifesto.

## 1. Backend Architecture (`cadence-backend`)

The settings system relies on a single `jsonb` column in the `users` table. This approach allows maximum flexibility for adding new toggles without constant schema migrations.

### 1.1 Schema Definition

Target: `cadence-backend/src/db/schema.ts`

Modify the `users` table to include the `settings` column:

```typescript
import { jsonb } from 'drizzle-orm/pg-core';

// Inside the users table definition:
settings: jsonb('settings').$type<UserSettings>().notNull().default({
  tasks: { defaultDueDate: null, hideTrash: false, hideCompleted: false },
  dateTime: { weekStart: 'Sunday', timezone: 'local', timeDisplay: '12h' },
  notifications: { email: true },
  shortcuts: {}
}),
```

Define the associated Zod schema and TypeScript types in a shared location or adjacent to the schema:

```typescript
import { z } from "zod";

export const UserSettingsSchema = z.object({
	tasks: z.object({
		defaultDueDate: z
			.enum(["None", "Today", "Tomorrow", "Next Week"])
			.nullable(),
		hideTrash: z.boolean(),
		hideCompleted: z.boolean(),
	}),
	dateTime: z.object({
		weekStart: z.enum(["Sunday", "Monday", "Saturday"]),
		timezone: z.string(), // E.g., 'America/New_York' or 'local'
		timeDisplay: z.enum(["12h", "24h"]),
	}),
	notifications: z.object({
		email: z.boolean(),
	}),
	shortcuts: z.record(z.string(), z.string()), // key: action, value: keystroke
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;
```

### 1.2 Migration Generation

Target: Terminal (Backend)
Run `bun run db:generate` to output the Drizzle migration for the new JSONB column.

### 1.3 API Endpoints

Target: `cadence-backend/src/api/routes/user.ts` (or equivalent auth/user router)

- **`GET /api/user/settings`**:
  - Retrieves the `settings` column for the authenticated user via Neon Auth.
- **`PATCH /api/user/settings`**:
  - Validates full or partial update using a `deepPartial` version of `UserSettingsSchema`.
  - Performs a deep merge against existing settings using a utility like `lodash.merge` or a custom deep merge before writing back to the DB.
  - Returns the updated settings object.

---

## 2. Frontend State & Synchronization (`cadence-frontend`)

### 2.1 API Client Updates

Target: `cadence-frontend/app/lib/api.ts` (or equivalent API service file)

Add methods:

- `getSettings(): Promise<UserSettings>`
- `updateSettings(payload: DeepPartial<UserSettings>): Promise<UserSettings>`

### 2.2 React Query Hooks

Target: `cadence-frontend/app/hooks/useSettings.ts`

Implement an abstracted hook for settings management utilizing Optimistic UI:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useSettings() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["settings"],
		queryFn: api.getSettings,
	});

	const mutation = useMutation({
		mutationFn: api.updateSettings,
		onMutate: async (newSettings) => {
			await queryClient.cancelQueries(["settings"]);
			const previousSettings = queryClient.getQueryData(["settings"]);

			// Optimistically update to the new value using deep merge concept
			queryClient.setQueryData(["settings"], (old: any) => ({
				...old,
				...newSettings, // Note: For nested objects, ensure proper recursive spread or deep merge here
			}));

			return { previousSettings };
		},
		onError: (err, newSettings, context) => {
			queryClient.setQueryData(["settings"], context?.previousSettings);
			// Toast error here
		},
		onSettled: () => {
			queryClient.invalidateQueries(["settings"]);
		},
	});

	return {
		settings: query.data,
		updateSettings: mutation.mutate,
		isLoading: query.isLoading,
	};
}
```

---

## 3. UI Primitives (`cadence-frontend/app/components/primitives/`)

Ensure these Radix primitives are fully styled according to the "Twilight Sanctuary" Design Manifesto.

### 3.1 `Switch.tsx`

- **Dependencies**: `@radix-ui/react-switch`
- **Styling**:
  - Root (Unchecked): `bg-white/10 border border-white/5`
  - Root (Checked): `bg-lantern-amber`
  - Thumb: `bg-[#e8edf5] shadow-sm transform transition-transform`

### 3.2 `Select.tsx`

- **Dependencies**: `@radix-ui/react-select`
- **Styling**:
  - Trigger: `bg-white/5 backdrop-blur-md border border-white/10 text-warm-white`
  - Content/Viewport: `bg-[#0a1628]/95 backdrop-blur-2xl border border-white/10 rounded-xl`
  - Item (Hover/Focus): `data-[highlighted]:bg-white/10 data-[highlighted]:text-lantern-amber`

### 3.3 `Input.tsx` (If missing or needs refinement)

- **Styling**: Soft frosted glass `bg-white/5 border border-white/10 focus-visible:ring-1 focus-visible:ring-lantern-amber/50 focus-visible:border-lantern-amber/50 rounded-lg`. MUST have an optional `<Search>` icon prefix slot.

---

## 4. Settings Interface (`cadence-frontend/app/components/settings/`)

The layout resembles Discord's full-screen overlay mode.

### 4.1 State Management (Query Params)

Summoning the dialog should use a query parameter: `?settings=<tab_name>`.
This allows deep-linking and easy agent-driven state mutation. If `settings` param is null, dialog is closed.

### 4.2 `SettingsDialog.tsx`

The primary wrapper component.

- **Root Element**: Intercepts the URL query param. Renders a full screen fixed overlay with high z-index.
- **Overlay**: `fixed inset-0 bg-black/80 backdrop-blur-sm z-50`.
- **Layout Grid**:
  - `max-w-7xl mx-auto w-full h-full flex`
  - **Sidebar (Left)**: `w-[280px] bg-transparent py-14 pr-6 flex flex-col gap-1 border-r border-white/5`
  - **Content (Right)**: `flex-1 py-14 pl-10 overflow-y-auto`
  - **Close Button**: Fixed positioned on the top right of the content grid, styled as a subtle circle `bg-white/5 hover:bg-white/10` featuring an `X` icon and an `ESC` label underneath.

### 4.3 `SettingsSidebar.tsx`

- **Search**: `Input` component with a `Search` icon at the zenith.
- **Navigation Links**: Buttons representing each tab.
  - Active styling: `bg-white/10 text-warm-white font-medium`
  - Inactive styling: `text-warm-white/60 hover:bg-white/5 hover:text-warm-white`

### 4.4 Tab Implementations

All tabs reside in `cadence-frontend/app/components/settings/tabs/`.
Each tab utilizes standard `SettingsSection` and `SettingsRow` wrapper components to maintain a unified layout (Title, Description, and Action [Toggle/Select/Button]).

1. **`AccountTab.tsx`**
   - **Avatar Profile Card**: Replicates Discord's banner + avatar + badge layout. `bg-[#132035] rounded-2xl border border-white/5`.
   - **Fields**: Map over elements (Display Name, Username, Email). Use a `Reveal` generic text button for sensitive fields.

2. **`NotificationsTab.tsx`**
   - **Email Toggle**: `Switch` primitive. Triggers `updateSettings({ notifications: { email: value } })`. Muted sub-text explaining current no-op nature contextually.

3. **`DateTimeTab.tsx`**
   - **Week Start**: `Select` primitive `['Sunday', 'Monday', 'Saturday']`.
   - **Timezone**: `Select` primitive.
   - **Time Display Pattern**: `Select` primitive `['12h', '24h']`.

4. **`AITab.tsx`**
   - Renders fields (e.g., Default Model, Context Size) but explicitly wraps the entire section in a disabled state `opacity-50 pointer-events-none`.
   - Adds a `Badge` labeled "Coming Soon".

5. **`AppearanceTab.tsx`**
   - Disabled state identical to AI Tab. Shows static theme previews.

6. **`ShortcutsTab.tsx`**
   - A scrollable table or list of `<kbd>` elements detailing standard keybinds.

7. **`TasksTab.tsx`**
   - **Default Due Date**: `Select` primitive modifying `tasks.defaultDueDate`.
   - **Visibility Toggles**: Two `Switch` instances side-by-side or stacked for `tasks.hideTrash` and `tasks.hideCompleted`.

8. **`IntegrationsTab.tsx`**
   - Greyed out list of cards (Calendar, Obsidian, Notion) marked "Coming Soon".

9. **`DataPrivacyTab.tsx`**
   - Static non-interactive buttons for "Export Data" and "Delete Account", greyed out.

---

## 5. Execution Steps for Agents

1. **Schema Update**: Inject `settings` JSONB to `cadence-backend/src/db/schema.ts` and generate migration.
2. **Backend API**: Implement `GET` and `PATCH` for settings in backend routes using Zod validation.
3. **Frontend API & Hooks**: Setup `api.ts` updates and `useSettings.ts` React Query hook.
4. **Primitives**: Create/update `Switch.tsx`, `Select.tsx`, and `Input.tsx` in `primitives/` conforming to Twilight aesthetics.
5. **Layout & Dialog**: Create `SettingsDialog.tsx` routing via URL query parameters, featuring the grid and close button logic.
6. **Tabs**: Iterate through creating the individual tab components, wiring up internal states with `useSettings` where interactive, and utilizing mock/disabled designs everywhere else.
