# Cadence Habits Implementation Plan (v2 - Senior Audit)

## 1. Executive Summary & Design Philosophy

The Habits feature in Cadence extends the core task management capabilities to accommodate indefinitely repeating actions without cluttering the primary planner state.

**Strict Design Manifesto Enforcement:**
Habits must remain a frictionless, atmospheric sanctuary for personal growth. They must **never** be presented as stressful corporate metrics, nagging checklists, or sterile data tables. The UI abstracts complexity into a calming, organic experience. Habits have their own dedicated weekly view space, styled purely by implied constraints, but they also integrate organically into the broader task planner as unobtrusive, marked entities.

### Immediate Rejections (Anti-Patterns)

- **No SaaS Dashboards:** No charts, no progress bars taking up half the screen.
- **No Aggressive Gamification:** "Streaks" are recorded but presented warmly in natural language (e.g., "You've kept an 8-day streak alive"), rather than a hard red fire emoji with a number.
- **No Grid Spreadsheets:** The weekly view uses fluid spacing and subtle 1px dashed or faded lines.

---

## 2. Backend Architecture & Schema Expansion

To track recurring tasks with indefinite bounds and historical completion adherence, extending `cadence-backend/src/db/schema.ts` is required. We separate `habits` from regular `tasks` to strictly enforce the unique metrics and logging requirements.

### 2.1 Database Schema Extensions

```typescript
import {
	pgTable,
	uuid,
	text,
	timestamp,
	boolean,
	integer,
	pgEnum,
	index,
} from "drizzle-orm/pg-core";
import { users } from "./schema"; // Assuming same file

export const habitStatusEnum = pgEnum("habit_status", [
	"COMPLETED",
	"SKIPPED",
	"PENDING",
]);

// 9. Habits
export const habits = pgTable(
	"habits",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: uuid("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),

		// Core Data
		title: text("title").notNull(),
		description: text("description"), // Optional

		// Recurrence & Scheduling
		// Use RRULE standard natively to support "Every Weekday", "Every 3 Days", etc.
		recurrenceRule: text("recurrence_rule").notNull(),
		targetTime: text("target_time"), // e.g., "19:00" string for time-specific habits, null for all-day

		// Reminders
		reminderEnabled: boolean("reminder_enabled").default(false).notNull(),

		// Tracking Metrics (Calculated server-side iteratively to avoid expensive COUNT(*) queries)
		totalCompletions: integer("total_completions").default(0).notNull(),
		totalSkips: integer("total_skips").default(0).notNull(),
		currentStreak: integer("current_streak").default(0).notNull(),
		longestStreak: integer("longest_streak").default(0).notNull(),

		// UI Identity
		colorAccent: text("color_accent").default("lantern").notNull(), // Ties to Tailwind: text-lantern, ext.

		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => {
		return {
			userIdIdx: index("habits_user_id_idx").on(table.userId),
		};
	},
);

// 10. Habit Logs
// Explicitly tracks the historical interaction with a habit on a given target date.
export const habitLogs = pgTable(
	"habit_logs",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		habitId: uuid("habit_id")
			.references(() => habits.id, { onDelete: "cascade" })
			.notNull(),
		userId: uuid("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),

		status: habitStatusEnum("status").default("PENDING").notNull(),

		// The localized day/date the action was due, truncated to YYYY-MM-DD for consistency
		targetDate: timestamp("target_date", {
			withTimezone: true,
			mode: "string",
		}).notNull(),
		completedAt: timestamp("completed_at", {
			withTimezone: true,
			mode: "string",
		}),

		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => {
		return {
			habitDateIdx: index("habit_logs_habit_date_idx").on(
				table.habitId,
				table.targetDate,
			),
		};
	},
);
```

### 2.2 API Contract Design

- `POST /api/habits`: Create a habit.
- `GET /api/habits`: Fetch all habits and their base stats.
- `GET /api/habits/weekly?start=YYYY-MM-DD&end=YYYY-MM-DD`:
  - **Critical Backend Logic:** The backend must parse the `recurrenceRule` (using a library like `rrule`) against the input bounds and return hydrated objects combining the base Habit and any existing `habit_logs` for that week. Unlogged target dates return virtual logs with `status: PENDING`.
- `POST /api/habits/:id/resolve`:
  - Body: `{ targetDate: timestamp, status: 'COMPLETED' | 'SKIPPED' }`
  - **Streak Calculation Engine:** Wrapped in a transaction. When marking completed, checks if yesterday (relative to recurrence rules) was completed. Updates `currentStreak`, evaluates `longestStreak`. Updates `totalCompletions`.

---

## 3. Frontend Architecture & Optimistic UI

### 3.1 Directory Structure Additions

```text
app/
  components/
    habits/
      HabitsCanvas.tsx       # The weekly overlay logic
      HabitItem.tsx          # Single habit component, handles hover states
      CreateHabitDialog.tsx  # Bottom sheet / modal
      HabitToastResolver.tsx # Global check for missed habits
  routes/
    _app.habits.tsx          # Dedicated /habits page
```

### 3.2 React Query & Optimistic Updates

Because Cadence targets instantaneous interactions:

1. `useHabitsWeekly(start, end)` queries the resolved list.
2. `useResolveHabitLog()` mutation MUST employ **Optimistic UI**. When a user checks off a habit:
   - Cancel outgoing queries.
   - Snaps the cached `habit_logs` status to `COMPLETED` instantly.
   - Emits a gentle `framer-motion` layout transition.
   - On error, roll back and trigger a silent toast.

---

## 4. UI/UX Component Specifications

### 4.1 The Habits Page Canvas (`HabitsCanvas.tsx`)

- **Aesthetic:** Driven by the "Twilight Sanctuary" theme. The background runs deep `bg-twilight-void` or `bg-twilight-base`.
- **Layout:** The week operates on an implied grid (`grid-cols-7`). Days are defined by faint vertical lines (`border-twilight-border-light`).
- **Anchoring:**
  - Time-specific habits are absolutely positioned vertically (requires a time-to-pixels unified calculation hook shared with regular Planner).
  - All-day habits float nicely padded in an `All-Day Pinned` zone at the top.
- **Micro-Interaction:** Hovering a habit triggers `bg-twilight-surface-hover` and `ring-1 ring-twilight-border-interactive`.

### 4.2 Habit Item (`HabitItem.tsx`)

- **Visuals:** Uses `backdrop-blur-xl` and `bg-twilight-surface/60`. No heavy shadows; use the `glow-lantern` utility delicately on hover if active.
- **Expanded State:** Controlled by `framer-motion` `<AnimatePresence>`. Clicking it opens a small accordion-like drop revealing the natural language stats ("You've sparked this habit 12 times...").
- **Swipe Gestures:** On mobile touch, implement `-x` dragging (pan handlers). Swiping right checks it off; swiping left skips it. Haptic feedback loops when crossing the threshold point.

### 4.3 Habit Creation (`CreateHabitDialog.tsx`)

- **Trigger:** A glowing FAB (`bg-twilight-surface glass-surface`) anchored bottom-right.
- **UX:** One central glowing `input[type="text"]` with a `focus-visible:ring-lantern`.
- Progressive disclosure: Selecting days is just a horizontal row of clickable chips. Native iOS-style smooth animations.

### 4.4 Planner View Integration

- In the primary `/planner`, habits inject into the same daily flow.
- Distinguishable trait: Tasks are standard blocks. Habits adopt a specific left-border highlight (`border-l-2 border-lantern`) and utilize a faint `Repeat` Lucide icon. They do not overpower one-off tasks.

---

## 5. Global Reminders & Intelligent Toast

Rather than annoying push notifications (which are usually disabled), Cadence handles "missed habits" through an ambient system logic.

1. **Resolution Hook (`HabitToastResolver.tsx`)**
   - Renders silently high up in the component tree inside `_app.tsx`.
   - On mount, it fetches `/api/habits/unresolved`.
   - The backend checks for habits assigned to "Yesterday" or "Earlier Today" whose target time has elapsed and have no `habit_logs` entry.
2. **The Output:**
   - Triggers `sonner` via a custom component.
   - Uses a warm, personalized string: _"Evening. Did you manage to read for 10 minutes today?"_
   - Includes inline buttons: `[Yes] [Missed it]`.
   - Clicking immediately optimizes to DB and drops the toast.

---

## 6. Security & Production Readiness Checklist

[x] **Type Safety**: Full end-to-end typed Hono RPC routes.
[x] **Authorization**: Backend queries must enforce `userId: c.var.user.id` on every query block and update.
[x] **Database Scale**: The recurrence rule parser runs on the backend, only passing necessary DTOs down. We do NOT pre-generate a infinite timeline of `habit_logs`. We virtualize them in the GET request, and only instantiate rows in `habit_logs` when specifically mutated.
[x] **Timezone Handling**: **Strict Requirement.** The `targetDate` insertion must securely use the user's localized timezone offset, avoiding UTC boundary errors where an evening habit registers on the next day's streak. The frontend must send the `Intl.DateTimeFormat().resolvedOptions().timeZone` flag to the backend on requests when calculating offsets.
