# ✦ Cadence Frontend — UI Refinement Plan 8 ✦

> **Date:** 2026-03-04
> **Scope:** cadence-frontend only — all changes are UI/UX focused
> **Guiding Document:** [`/docs/Design Manifesto.md`](/docs/Design%20Manifesto.md)
> **Prior Art:** `03-02-2026_implementation-plan-7.md`

---

## 0. Design Manifesto Alignment Check

Every change in this plan is evaluated against the five pillars of Cadence's identity:

| Pillar                    | Rule                                                               | How This Plan Honors It                                                                       |
| ------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **Anti-SaaS**             | No heavy cards, no dashboard metrics, no generic shadows           | Removes unnecessary separator lines; tightens layout without boxing content                   |
| **Twilight Sanctuary**    | Deep midnight sky, warm lantern glow, frosted glass                | Reworks the `bg-twilight` gradient for richer depth; fixes all muted-text contrast to WCAG AA |
| **Neurodivergent-First**  | Icon-heavy, navigatable, every option is a natural part of another | Tags as bubbles in sidebar; right-click ≡ three-dots; inline emoji on projects                |
| **Organic Precision**     | Generous rounded corners, spring physics, no celebration           | Maintains `rounded-2xl`+ everywhere; no new confetti or bounces                               |
| **No Emojis as UI Icons** | Clean SVGs (Lucide) only for UI chrome                             | Emojis are **user data** (project identification), not UI icons — compliant ✓                 |

---

## 1. Home Page (`app/routes/home.tsx` · `PlannerHeader.tsx`)

### 1.1 — Realtime Time Indicator in Header

**Current:** PlannerHeader shows a static greeting + date + weather. No live clock.

**Change:** Add a ticking `HH:MM` indicator beside the date line, updating every second. It should inherit the muted text style and feel like a quiet piece of context — not a screaming dashboard widget.

**Implementation:**

1. Create a tiny `useRealtimeClock()` hook:

   ```ts
   // app/hooks/use-realtime-clock.ts
   import { useState, useEffect } from "react";

   /** Returns a live HH:MM string that updates every second */
   export function useRealtimeClock(): string {
   	const fmt = () =>
   		new Date().toLocaleTimeString("en-US", {
   			hour: "numeric",
   			minute: "2-digit",
   			hour12: true,
   		});

   	const [time, setTime] = useState(fmt);

   	useEffect(() => {
   		const id = setInterval(() => setTime(fmt()), 1_000);
   		return () => clearInterval(id);
   	}, []);

   	return time;
   }
   ```

2. In `PlannerHeader.tsx`, import the hook and render it on the secondary context line:

   ```tsx
   const clock = useRealtimeClock();

   // Inside the <p> after the formatted date:
   <span className="mx-2 text-twilight-text-muted/90">·</span>
   <span className="tabular-nums">{clock}</span>
   ```

3. Use `tabular-nums` to prevent layout shift as digits change.

### 1.2 — Reduce Splitter Line & Tighten Spacing

**Current:** `home.tsx` line 110 renders a full `h-px` gradient separator with `my-6` margins, pushing the AddTaskInput ~48px below the header.

**Change:**

- Remove the standalone `<div className="h-px bg-gradient-to-r …" />` separator entirely — the greeting itself is the anchor; the AddTaskInput should flow naturally after it.
- Reduce the `PlannerHeader` bottom margin from `mb-10` → `mb-6`.
- This brings the main interaction area (AddTaskInput) ~36px higher.

**Files:** `home.tsx` (delete separator div), `PlannerHeader.tsx` (change `mb-10` → `mb-6`).

### 1.3 — Rotating Greeting Variations

**Current:** `greetings.ts` returns one string per time bracket (e.g., only "Good evening").

**Change:** Expand each bracket to an array of ≥4 greetings, randomly selected on mount. The greeting should still feel warm and personal — never corporate ("Welcome back to your productivity suite!").

**Implementation — rewrite `app/lib/utils/greetings.ts`:**

```ts
const GREETINGS: Record<string, string[]> = {
	morning: [
		"Good morning",
		"Rise and shine",
		"A new day awaits",
		"Morning glow",
		"Fresh start",
	],
	afternoon: [
		"Good afternoon",
		"Afternoon light",
		"The day rolls on",
		"Steady pace",
		"Sun's still up",
	],
	evening: [
		"Good evening",
		"Evening calm",
		"Winding down",
		"Twilight hour",
		"The night is young",
	],
	night: [
		"Good night",
		"Quiet hours",
		"Night owl mode",
		"Stars are out",
		"Moonlit focus",
	],
};

function pickRandom(arr: string[]): string {
	return arr[Math.floor(Math.random() * arr.length)];
}

export function getTimeBasedGreeting(): string {
	const hour = new Date().getHours();
	if (hour >= 5 && hour < 12) return pickRandom(GREETINGS.morning);
	if (hour >= 12 && hour < 18) return pickRandom(GREETINGS.afternoon);
	if (hour >= 18 && hour < 22) return pickRandom(GREETINGS.evening);
	return pickRandom(GREETINGS.night);
}
```

> **⚠️ CRITICAL: Prevent flickering during clock ticks**
> Since `PlannerHeader` will now re-render every second due to `useRealtimeClock`, calling `getTimeBasedGreeting()` directly in the render body will cause the greeting to randomly change every second!
> You MUST memoize the greeting inside `PlannerHeader.tsx`:
>
> ```tsx
> const greeting = useMemo(() => getTimeBasedGreeting(), []);
> ```
>
> This ensures the greeting stays stable and prevents disruptive flickering.

### 1.4 — Fix Muted Text Contrast (Home + Global)

**Current issue:** `text-twilight-text-muted/80` on the date line (PlannerHeader line 29) yields `#8899b0` at 80% opacity on `#0a1628`. This produces a contrast ratio of ~3.2:1 — below WCAG AA (4.5:1 for normal text).

**Change:**

- Raise all instances of `/80` on `text-twilight-text-muted` to `/90` minimum.
- **Better:** Remove the opacity modifier entirely and use the raw `text-twilight-text-muted` value (`#8899b0`), which achieves ~4.7:1 against `#0a1628`. This is the recommended approach.
- Audit all files for the problematic pattern `text-twilight-text-muted/80` and replace with `text-twilight-text-muted`.

**Files to audit (non-exhaustive grep results):**

- `PlannerHeader.tsx` — line 29
- `home.tsx` — SectionHeader line 27
- `GeneralPageHeader.tsx` — description text
- Any component using `text-twilight-text-muted/70` or lower — raise to `/90` minimum or drop the alpha.

**CSS variable safety net (already exists in `app.css`):**

```css
--alpha-muted-min: 0.9; /* NEVER go below these */
```

This variable exists but is not enforced in code. This plan recommends actually using it:

- Find-and-replace `text-twilight-text-muted/70` → `text-twilight-text-muted`
- Find-and-replace `text-twilight-text-muted/80` → `text-twilight-text-muted`
- Leave `/90` and `/100` alone if present.

---

## 2. Project View (`app/routes/project.tsx`)

### 2.1 — Emoji Picker for Projects

**Current:** Each project shows a `<FolderKanban>` icon. No user personalisation beyond color.

**Change:** Allow the user to attach an **emoji** to each project. The emoji renders in the project icon spot (sidebar + project page header). When no emoji is set, fall back to the `<FolderKanban>` icon.

**Backend requirements (`cadence-backend/src/db/schema.ts`):**

1. Add `emoji` column to `projects` table: `emoji: text("emoji")`
2. Update Zod validators in `routes/projects.ts` to accept `emoji: z.string().nullable().optional()`.
3. Generate and run a migration (`bun run db:generate`, `bun run db:migrate`).

**Frontend implementation:**

1. **Install emoji picker:**

   ```bash
   bun add emoji-mart @emoji-mart/data @emoji-mart/react
   ```

2. **Create `EmojiPickerPopover.tsx`** (`app/components/shared/EmojiPickerPopover.tsx`):

   > **⚠️ CRITICAL: Lazy load emoji data**
   > To prevent adding ~500KB to the main JavaScript JS bundle, do not synchronously import `@emoji-mart/data`. Instead, dynamically import it or use React's `Suspense` and `lazy` wrappers for the `Picker` component.

   ```tsx
   import React, { Suspense } from "react";
   import * as Popover from "../primitives/Popover";

   // Lazy load the picker to keep the main bundle thin
   const LazyPicker = React.lazy(async () => {
   	const [Picker, data] = await Promise.all([
   		import("@emoji-mart/react"),
   		import("@emoji-mart/data"),
   	]);
   	// emoji-mart expects data to be passed as a prop, combining them here
   	return {
   		default: (props: any) => (
   			<Picker.default data={data.default} {...props} />
   		),
   	};
   });

   interface EmojiPickerPopoverProps {
   	children: React.ReactNode;
   	onSelect: (emoji: string) => void;
   }

   export function EmojiPickerPopover({
   	children,
   	onSelect,
   }: EmojiPickerPopoverProps) {
   	return (
   		<Popover.Root>
   			<Popover.Trigger asChild>{children}</Popover.Trigger>
   			<Popover.Content
   				className="p-0 border-0 bg-transparent"
   				sideOffset={8}
   			>
   				<div className="rounded-2xl overflow-hidden glass min-w-[300px] min-h-[400px]">
   					<Suspense
   						fallback={
   							<div className="flex items-center justify-center p-8 text-twilight-text-muted">
   								Loading emojis...
   							</div>
   						}
   					>
   						<LazyPicker
   							onEmojiSelect={(emoji: any) => onSelect(emoji.native)}
   							theme="dark"
   							skinTonePosition="none"
   							previewPosition="none"
   							maxFrequentRows={2}
   						/>
   					</Suspense>
   				</div>
   			</Popover.Content>
   		</Popover.Root>
   	);
   }
   ```

3. **In `project.tsx`**, replace the FolderKanban icon area (lines 209–217) with a clickable emoji/icon:

   ```tsx
   <EmojiPickerPopover
   	onSelect={(emoji) => updateProject.mutate({ id: projectId!, emoji })}
   >
   	<button
   		className="w-12 h-12 rounded-2xl flex items-center justify-center glow-lantern text-2xl cursor-pointer hover:scale-105 transition-transform"
   		style={{
   			backgroundColor: project
   				? `${resolveAccentColor(project.colorAccent)}20`
   				: "rgba(255,255,255,0.1)",
   		}}
   		aria-label="Set project emoji"
   	>
   		{project?.emoji ? (
   			<span>{project.emoji}</span>
   		) : (
   			<FolderKanban
   				size={22}
   				style={{
   					color: project
   						? resolveAccentColor(project.colorAccent)
   						: "var(--color-twilight-text)",
   				}}
   			/>
   		)}
   	</button>
   </EmojiPickerPopover>
   ```

4. **In `SidebarPanel.tsx`**, update `<ProjectLink>` to accept and display an optional emoji:

   ```tsx
   <ProjectLink
   	key={project.id}
   	id={project.id}
   	label={project.name}
   	emoji={project.emoji} // NEW
   	color={resolveAccentColor(project.colorAccent)}
   	href={`/project/${project.id}`}
   />
   ```

   Inside `ProjectLink.tsx`, render `emoji ?? <FolderKanban>` as the leading element.

5. **Update `types/project.ts`** (or wherever the `Project` interface lives) to add `emoji?: string | null`.

### 2.2 — Expanded Color Palette for Projects

**Current:** `color-resolver.ts` has 6 colors: luminous-amber, moonlit-blue, sapphire, ember-red, forest-green, violet.

**Change:** Expand to 14+ colors, presented in a grid picker inside the project creation/edit dialog.

**New palette (append to `ACCENT_MAP`):**

```ts
const ACCENT_MAP: Record<string, string> = {
	"luminous-amber": "#e8a44a",
	"moonlit-blue": "#7eb8d4",
	sapphire: "#4a90d9",
	"ember-red": "#d97756",
	"forest-green": "#5dba72",
	violet: "#9b72cf",
	// ── NEW ──
	rose: "#f472b6",
	coral: "#fb923c",
	teal: "#2dd4bf",
	cyan: "#22d3ee",
	indigo: "#818cf8",
	lime: "#a3e635",
	fuchsia: "#e879f9",
	sky: "#38bdf8",
};
```

**UI for color selection:**

- Create a `ColorPicker` component: a grid of clickable circles, selected = ring + scale.
- Display inside `CreateProjectPopover` and a new "Edit project" dialog (or existing rename dialog extended).
- Each circle: `w-6 h-6 rounded-full` with the hex value as `backgroundColor`.
- Selected circle: `ring-2 ring-offset-2 ring-offset-twilight ring-lantern scale-110`.

---

## 3. Inbox (`app/routes/inbox.tsx` · `InboxList.tsx` · `InboxItemCard.tsx`)

### 3.1 — Board View for Inbox

**Current:** Inbox is a flat list. No concept of "sections" or columns.

**Change:** Add a toggle between "List" and "Board" view. Board view displays items in a horizontal Kanban-like layout with **user-defined sections** (e.g., "Ideas," "To Process," "Maybe Later"). Items can be dragged between sections.

**Implementation plan:**

1. **Add a `ViewToggle` to Inbox** (reuse the existing `ViewToggle` component from the home page, or create a simpler one with `LayoutList` + `Columns3` icons).

2. **Inbox sections model:**
   - **Backend schema (`schema.ts`):**
     ```ts
     export const inboxSections = pgTable("inbox_sections", {
     	id: uuid("id").primaryKey().defaultRandom(),
     	userId: text("user_id").notNull(),
     	name: text("name").notNull(),
     	orderIndex: integer("order_index").notNull().default(0),
     	createdAt: timestamp("created_at").notNull().defaultNow(),
     });
     ```
     Add `sectionId: uuid("section_id").references(() => inboxSections.id, { onDelete: 'set null' })` and `orderIndex: integer("order_index").notNull().default(0)` to the `inbox_items` table.
   - **Backend API:** Add `GET /inbox/sections`, `POST /inbox/sections`, `PATCH /inbox/sections/:id`, `DELETE /inbox/sections/:id`.
   - Frontend types:
     ```ts
     export interface InboxSection {
     	id: string;
     	userId: string;
     	name: string;
     	orderIndex: number;
     }
     ```

3. **`InboxBoard.tsx`** — new component:
   - Columns rendered from `inboxSections` + an "Unsorted" default column.
   - Each column is a vertical drop zone (reuse `@dnd-kit` patterns from `KanbanBoard.tsx`).
   - Items within a column use the existing `InboxItemCard` with minor width adjustments.
   - Add section button: inline text input at the bottom of the board header row.

4. **Maintain inbox identity:** Inbox is the place to **unload thoughts**. The AddTaskInput or a dedicated "Quick Capture" input should sit prominently above both views:
   ```tsx
   <div className="relative group mb-6">
   	<textarea
   		className="w-full min-h-[56px] rounded-2xl bg-white/[0.04] border border-twilight-border
                      px-5 py-4 text-[15px] text-twilight-text placeholder:text-twilight-text-muted/80
                      resize-none outline-none focus:border-lantern/30 transition-colors"
   		placeholder="Dump a thought, idea, or task… press Enter to capture"
   		rows={1}
   	/>
   </div>
   ```
   This makes the inbox feel like a clean notepad: immediate, low-friction.

### 3.2 — Inbox "Brain Dump" Personality

**Current:** Description says "Capture everything, process later" — but the UI is bare.

**Change:**

- Replace the `GeneralPageHeader` icon from the generic `<Inbox>` to something warmer — the Manifesto says "like settling into a warm room." Use `<BrainCircuit>` (lucide) or `<Sparkles>` for the icon, in a soft violet glow.
- Description text: make it more inviting: _"Unload your thoughts — they\u2019ll wait for you here."_
- Empty state illustration: change from the generic ringed circle to a more atmospheric message:
  > _"Nothing waiting. Your mind is clear."_
  > With a subtle animated `<Sparkles>` icon fading in/out.

---

## 4. Sidebar — Tags System (`SidebarPanel.tsx`)

### 4.1 — Tags Section in Sidebar

**Current:** Sidebar has navlinks + projects + secondary nav. No tags section. Tags only exist as a submenu inside TaskContextMenu.

**Change:** Add a "Tags" collapsible section below Projects, showing all user tags as wrapped **bubble chips**. Clicking a tag filters the current page by that tag.

**Implementation:**

1. **New `TagBubble` component** (`app/components/sidebar/TagBubble.tsx`):

   ```tsx
   interface TagBubbleProps {
   	tag: Tag;
   	isActive: boolean;
   	onClick: () => void;
   }

   export function TagBubble({ tag, isActive, onClick }: TagBubbleProps) {
   	const bgColor =
   		tag.color === "default" ? "rgba(255,255,255,0.06)" : `${tag.color}15`;
   	const textColor =
   		tag.color === "default" ? "var(--color-twilight-text-soft)" : tag.color;

   	return (
   		<button
   			onClick={onClick}
   			className={`
                   inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium
                   transition-all duration-200 cursor-pointer shrink-0
                   ${
   									isActive
   										? "ring-1 ring-offset-1 ring-offset-twilight-deep shadow-[0_0_8px_rgba(232,164,74,0.1)]"
   										: "hover:brightness-125"
   								}
               `}
   			style={{
   				backgroundColor: bgColor,
   				color: textColor,
   				...(isActive ? { ringColor: textColor } : {}),
   			}}
   			aria-pressed={isActive}
   			aria-label={`Filter by tag: ${tag.name}`}
   		>
   			<span
   				className="w-1.5 h-1.5 rounded-full"
   				style={{ backgroundColor: textColor }}
   			/>
   			{tag.name}
   		</button>
   	);
   }
   ```

2. **Tags section in `SidebarPanel.tsx`:**

   ```tsx
   // After the Projects Collapsible and before the bottom Separator:
   <Separator.Root className="h-px bg-twilight-border my-5" />

   <Collapsible.Root open={tagsOpen} onOpenChange={setTagsOpen}>
       <div className="flex items-center justify-between px-3 mb-2">
           <Collapsible.Trigger asChild>
               <button className="text-[12px] font-semibold text-twilight-text-muted uppercase tracking-[0.12em]">
                   Tags
               </button>
           </Collapsible.Trigger>
           {/* Create tag inline button */}
           <button onClick={() => setShowCreateTag(true)} aria-label="Create tag">
               <Plus size={14} className="text-twilight-text-muted hover:text-twilight-text" />
           </button>
       </div>
       <Collapsible.Content>
           {/* Mini search */}
           {tags.length > 5 && (
               <div className="px-3 mb-2">
                   <input
                       type="text"
                       value={tagSearch}
                       onChange={(e) => setTagSearch(e.target.value)}
                       placeholder="Search tags…"
                       className="w-full bg-white/[0.04] rounded-lg px-2.5 py-1.5 text-[12px] outline-none
                                  placeholder:text-twilight-text-muted/70 border border-transparent
                                  focus:border-twilight-border-interactive transition-colors"
                   />
               </div>
           )}
           {/* Tag bubbles — flex-wrap for natural flow */}
           <div className="flex flex-wrap gap-1.5 px-3">
               {filteredTags.map(tag => (
                   <TagBubble
                       key={tag.id}
                       tag={tag}
                       isActive={activeTagFilter === tag.id}
                       onClick={() => toggleTagFilter(tag.id)}
                   />
               ))}
           </div>
           {/* Inline create tag input (shown when + is clicked) */}
           {showCreateTag && (
               <CreateTagInline
                   onCreated={() => setShowCreateTag(false)}
                   onCancel={() => setShowCreateTag(false)}
               />
           )}
       </Collapsible.Content>
   </Collapsible.Root>
   ```

3. **Tag filtering state:**
   - Create a Zustand store `tag-filter-store.ts`:

     ```ts
     import { create } from "zustand";

     interface TagFilterState {
     	activeTagId: string | null;
     	setActiveTag: (id: string | null) => void;
     	toggleTag: (id: string) => void;
     }

     export const useTagFilterStore = create<TagFilterState>((set) => ({
     	activeTagId: null,
     	setActiveTag: (id) => set({ activeTagId: id }),
     	toggleTag: (id) =>
     		set((state) => ({
     			activeTagId: state.activeTagId === id ? null : id,
     		})),
     }));
     ```

   - In `home.tsx`, `project.tsx`, `inbox.tsx`, `upcoming.tsx`: consume `useTagFilterStore` and filter tasks client-side by checking `task.tags?.includes(activeTagId)`.
   - This requires tasks to carry their tag IDs. Either:
     - (a) Backend enriches each task response with `tagIds: string[]`, **or**
     - (b) Frontend fetches all task-tag associations in bulk with a `useAllTaskTags()` hook.
   - **Recommended:** Option (a) — Enforce this in the backend. Update `cadence-backend/src/routes/tasks.ts` to ensure `GET /tasks` includes the associated tags for every task (using Drizzle's `with: { tags: { with: { tag: true } } }` syntax) and maps the response to include a flat `tags: Tag[]` or `tagIds: string[]` array. This completely mitigates frontend N+1 tag query issues.

### 4.2 — Tags in Task Edit Panel

**Current:** Tags exist in the `TaskContextMenu` (via `TagPickerSubmenu`), but **not** in the `TaskEditPanel`.

**Change:** Add a "Tags" MetaRow inside the collapsible metadata section of `TaskEditPanel.tsx`. Clicking it opens an inline tag picker (same `TagPickerSubmenu` pattern but displayed as a popover/dropdown).

**Implementation:**

```tsx
// Inside the collapsible metadata <div className="flex flex-col">
// After the "Project" MetaRow:

<MetaRow icon={Tag} label="Tags">
	<TagPickerDropdown
		taskId={task.id}
		activeTagIds={taskTags.map((t) => t.id)}
		onAdd={(tagId) => addTaskTag.mutate({ taskId: task.id, tagId })}
		onRemove={(tagId) => removeTaskTag.mutate({ taskId: task.id, tagId })}
	/>
</MetaRow>
```

Where `TagPickerDropdown` is a Popover-based version of `TagPickerSubmenu` (since we're not inside a DropdownMenu context here).

### 4.3 — Tag Color & Name Requirements

**Current:** `CreateTagInput` has `color?: string` (optional). Name is required.

**Verify:** Name is indeed required in the backend validator. Color defaults to `"default"` (a muted gray). Users can pick any of the 8 preset colors in `TagPickerSubmenu`.

**Change:**

- Allow **custom hex color** entry: add a tiny text input next to the color swatches that accepts `#HEX` values.
- Expand the color presets to include the same palette used for projects (14 colors).
- Ensure the inline create tag UI in the sidebar also has color selection.

### 4.4 — Mini Search for Tags

Already specified in §4.1 above. The search input appears automatically when more than 5 tags exist. It filters the `tags` array client-side by `tag.name.toLowerCase().includes(query)`.

---

## 5. Schedule View (`app/routes/schedule.tsx` · `ScheduleHeader.tsx`)

### 5.1 — Month Icon Placement Fix

**Current:** In `ScheduleHeader.tsx` line 93, the month icon (`<CurrentIcon>`) is rendered **inside the subtitle** (line 2), which sits below the month name. This means the icon is in the wrong visual position.

**Change:** Move the icon to **the left of the main heading** (`<h2>`), inline with the month name.

```tsx
// BEFORE:
<h2 className="font-display text-2xl …">{mainHeading}</h2>
<p className="mt-0.5 text-[13px] …">
    <CurrentIcon size={13} className="text-lantern/70 shrink-0" />
    <span>{subtitleLabel}</span>
</p>

// AFTER:
<div className="flex items-center gap-2.5">
    <CurrentIcon size={20} className="text-lantern/70 shrink-0" />
    <h2 className="font-display text-2xl font-semibold text-twilight-text tracking-tight leading-tight">
        {mainHeading}
    </h2>
</div>
<p className="mt-0.5 text-[13px] text-twilight-text-muted pl-[30px]">
    {subtitleLabel}
</p>
```

The icon now sits to the left of "March 2026" and reflects the month (e.g., `Wind` for March). The subtitle text is indented to align with the heading text.

### 5.2 — Subheader: Date & Time, No Month Repeat

**Current:** `buildSubtitleLabel` for month/year view returns the full "Monday, March 4, 2026" — repeating the month that's already in the heading.

**Change:** For `month` and `year` views, return only the day-of-week + day number + live time:

```ts
// In ScheduleHeader.tsx:
function buildSubtitleLabel(
	viewMode: CalendarViewMode,
	currentDate: string,
): string {
	if (viewMode === "day") {
		const d = new Date(currentDate + "T00:00:00");
		return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric" });
	}
	if (viewMode === "week") {
		// … existing week range logic (unchanged)
	}
	// Month / Year: just weekday + day number
	const d = new Date(currentDate + "T00:00:00");
	return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric" });
}
```

Then append the **live time** from the `useRealtimeClock` hook:

```tsx
const clock = useRealtimeClock();

<p className="mt-0.5 text-[13px] text-twilight-text-muted pl-[30px]">
	{subtitleLabel}
	<span className="mx-1.5 text-twilight-text-muted/60">·</span>
	<span className="tabular-nums">{clock}</span>
</p>;
```

### 5.3 — Comprehensive Task Creation Popover

**Current:** `CalendarEventPopover` has fields for: title, time picker, priority picker, all-day toggle. Missing: **effort level**.

**Change:** Add an effort level selector to `CalendarEventPopover`:

```tsx
// After the priority selector row:
<div className="flex items-center gap-2">
	<Gauge size={14} className="text-twilight-text-muted" />
	<div className="flex bg-white/[0.04] p-0.5 rounded-xl gap-0.5 flex-1">
		{([1, 2, 3] as const).map((level) => (
			<button
				key={level}
				type="button"
				onClick={() => setEffort(effort === level ? null : level)}
				className={`flex-1 px-2 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors
                    ${
											effort === level
												? "bg-lantern/15 text-lantern"
												: "text-twilight-text-muted hover:text-twilight-text"
										}`}
			>
				{level === 1 ? "Low" : level === 2 ? "Med" : "High"}
			</button>
		))}
	</div>
</div>
```

Update the `useCreateTask` call in the popover's `onSubmit` to include `effort`.

---

## 6. Task Edit Panel — Overflow Fix (`TaskEditPanel.tsx`)

### 6.1 — Problem

The collapsible metadata section (`showDetails = true`) can grow to 400px+ when all rows are visible (State, Waiting On, Not Before, Effort, Deadline, Reminder, Priority, Project, Pinned, Recurrence, Tags). On viewports < 800px tall, or when used in the schedule side-sheet (`w-96`), the panel overflows with no scroll, clipping the notes textarea.

### 6.2 — Solution

Make the **metadata section** independently scrollable with a max-height, while preserving the notes area as the primary content.

**Implementation:**

```tsx
// Current (line 260):
<motion.div className="overflow-hidden shrink-0 border-b border-twilight-border overflow-y-auto">

// Change to:
<motion.div className="overflow-hidden shrink-0 border-b border-twilight-border">
    <div className="flex flex-col max-h-[45vh] overflow-y-auto scrollbar-thin">
        {/* All MetaRow components here */}
    </div>
</motion.div>
```

- `max-h-[45vh]` ensures the metadata section never consumes more than 45% of the viewport.
- `scrollbar-thin` (already defined in `app.css`) provides a subtle themed scrollbar.
- The notes textarea below remains `flex-1` and fills remaining space.

**Additional fix:** The outer `<motion.div>` wrapper already has `h-full flex flex-col`. Ensure the notes area is `<div className="flex-1 flex flex-col min-h-0 …">` — the `min-h-0` is crucial for flex children to shrink.

### 6.3 — Markdown Support for Notes

**Current:** The notes area is a simple `<textarea>` that displays unformatted plain text.

**Change:** Implement full Markdown support (bold, italics, links, lists, code blocks, checkboxes) for the notes section, toggling between an "Edit mode" (textarea) and a "Preview mode" (rendered HTML) seamlessly.

**Implementation:**

1. **Install Markdown processors & Tailwind Typography:**

   ```bash
   bun add react-markdown remark-gfm
   bun add -D @tailwindcss/typography
   ```

2. **Add Typography plugin to `tailwind.config.ts`:**

   ```ts
   import typography from "@tailwindcss/typography";
   export default {
   	plugins: [typography /* ...other plugins */],
   };
   ```

3. **Create `MarkdownEditor.tsx`:**
   Abstract the notes area into a new component that handles the read/write mode toggle:
   - When the user clicks the rendered markdown, switch to a `textarea` auto-focused on the exact content.
   - When the textarea loses focus (`onBlur`), save the content and switch back to rendered markdown.
   - Example structure:

     ```tsx
     import ReactMarkdown from "react-markdown";
     import remarkGfm from "remark-gfm";

     // Render mode:
     <div
     	onClick={() => setIsEditing(true)}
     	className="prose prose-invert prose-p:text-twilight-text prose-a:text-lantern prose-code:text-moonlit cursor-text min-h-[100px]"
     >
     	{notes ? (
     		<ReactMarkdown remarkPlugins={[remarkGfm]}>{notes}</ReactMarkdown>
     	) : (
     		<span className="text-twilight-text-muted">Add notes...</span>
     	)}
     </div>;
     ```

4. **Integration in `TaskEditPanel.tsx`:**
   Replace the current `TextareaAutosize` block with the new `MarkdownEditor` component. Ensure `remarkGfm` is included so checkboxes (like `- [ ] To-do item`) render correctly natively within the notes!

---

## 7. Right-Click Context Menu on Tasks

### 7.1 — Problem

Right-clicking a task opens the browser's native context menu, not the Cadence task menu. The three-dots button and the right-click should trigger the **same menu**.

### 7.2 — Solution

Wrap each task item in a Radix `ContextMenu.Root` (or use the existing `DropdownMenu` with `onContextMenu` trigger). The most natural approach for Radix is:

1. **Install `@radix-ui/react-context-menu`**:

   ```bash
   bun add @radix-ui/react-context-menu
   ```

2. **Create `TaskContextMenuWrapper.tsx`** that wraps a task's row:

   ```tsx
   import * as ContextMenu from "@radix-ui/react-context-menu";
   // Reuse identical menu content from TaskContextMenu

   export function TaskContextMenuWrapper({
   	task,
   	children,
   	onAddSubtask,
   }: {
   	task: Task;
   	children: React.ReactNode;
   	onAddSubtask?: () => void;
   }) {
   	return (
   		<ContextMenu.Root>
   			<ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
   			<ContextMenu.Portal>
   				<ContextMenu.Content className="/* reuse DropdownMenu.Content styles */">
   					{/* Render the SAME menu items as TaskContextMenu */}
   				</ContextMenu.Content>
   			</ContextMenu.Portal>
   		</ContextMenu.Root>
   	);
   }
   ```

3. **Refactor `TaskContextMenu.tsx`** to export the menu **items** as a separate `TaskMenuItems` component, so both the DropdownMenu (three-dots trigger) and the ContextMenu (right-click trigger) render identical content.

4. **Wrap task rows** in `TaskList.tsx` and `KanbanBoard.tsx` with `<TaskContextMenuWrapper>`.

5. Style the ContextMenu.Content identically to DropdownMenu.Content (same glass surface, same rounded-2xl, same animations).

---

## 8. Global UI / Canvas Background

### 8.1 — Enhanced Twilight Background

**Current `bg-twilight` in `app.css`:**

```css
.bg-twilight {
	background:
		radial-gradient(ellipse 120% 80% at 10% 0%, rgba(126, 184, 212, 0.03) …),
		radial-gradient(ellipse 80% 60% at 90% 10%, rgba(232, 164, 74, 0.03) …),
		radial-gradient(ellipse 100% 60% at 50% 100%, rgba(7, 14, 26, 0.8) …),
		linear-gradient(
			180deg,
			var(--color-twilight-deep) 0%,
			var(--color-twilight-void) 100%
		);
}
```

**Problem:** The gradients are very subtle (0.03 opacity). The background reads as nearly flat dark. The Manifesto calls for _"a rich, layered environment…deep midnight blues…warm at the edges, deep and enveloping at the center."_

**Change:** Increase gradient intensity and add a **fifth layer** — a subtle star-like noise texture or a faint warm bloom at the bottom-right:

```css
.bg-twilight {
	background:
        /* Moonlit mist — top-left cool glow */
		radial-gradient(
			ellipse 100% 70% at 8% 0%,
			rgba(126, 184, 212, 0.06) 0%,
			transparent 55%
		),
		/* Lantern warmth — top-right amber blush */
		radial-gradient(
				ellipse 70% 50% at 92% 8%,
				rgba(232, 164, 74, 0.05) 0%,
				transparent 50%
			),
		/* Horizon amber — bottom-center warm glow like distant sunset */
		radial-gradient(
				ellipse 80% 40% at 50% 100%,
				rgba(232, 164, 74, 0.04) 0%,
				transparent 50%
			),
		/* Depth vignette — darkens edges for that "vast night" feeling */
		radial-gradient(
				ellipse 60% 60% at 50% 50%,
				transparent 40%,
				rgba(7, 14, 26, 0.5) 100%
			),
		/* Base gradient — deep to deeper */
		linear-gradient(
				175deg,
				var(--color-twilight-deep) 0%,
				#081020 40%,
				var(--color-twilight-void) 100%
			);
}
```

Key improvements:

- Doubled moonlit glow opacity (0.03 → 0.06)
- Added horizon-amber at bottom — like "the last glow of sunset on the horizon" (Manifesto §7)
- Added a vignette layer — darkens edges, creates depth illusion
- The base gradient is now a 3-stop sweep with a deeper midpoint (`#081020`), creating a richer midnight feel

### 8.2 — WCAG Contrast Audit Checklist

| Element                                   | Current            | Target | Fix                                                                          |
| ----------------------------------------- | ------------------ | ------ | ---------------------------------------------------------------------------- |
| `text-twilight-text-muted/80`             | ~3.2:1             | ≥4.5:1 | Remove `/80`, use raw `text-twilight-text-muted`                             |
| `text-twilight-text-muted/70`             | ~2.8:1             | ≥4.5:1 | Raise to `/90` or remove alpha                                               |
| `text-moonlit/60` (home.tsx L177)         | ~2.5:1             | ≥4.5:1 | Raise to `text-moonlit/80` minimum                                           |
| `text-twilight-text-muted/90`             | ~4.2:1             | ≥4.5:1 | At boundary — acceptable for large text, raise to full for body text         |
| `placeholder:text-twilight-text-muted/70` | N/A (placeholders) | ≥3:1   | Raise to `/80` (placeholders are exempt from AA but should still be legible) |

**Global rule:** Add a lint comment at the top of `app.css`:

```css
/*
 * CONTRAST FLOOR: Never use text opacity below /90 on twilight backgrounds.
 * --alpha-muted-min: 0.9 (defined in @theme)
 * Grep for "/70" and "/80" on text-twilight-text-muted periodically.
 */
```

---

## 9. Implementation Priority & Ordering

Tasks are ordered by **impact × effort**, highest value first.

| #   | Task                                     | Impact      | Effort | Files Touched                                     |
| --- | ---------------------------------------- | ----------- | ------ | ------------------------------------------------- |
| 1   | Contrast fixes (§1.4, §8.2)              | 🔴 Critical | Low    | Global grep-replace across ~15 files              |
| 2   | Twilight background enhancement (§8.1)   | 🟠 High     | Low    | `app.css` only                                    |
| 3   | Remove splitter + tighten spacing (§1.2) | 🟠 High     | Low    | `home.tsx`, `PlannerHeader.tsx`                   |
| 4   | Rotating greetings (§1.3)                | 🟡 Medium   | Low    | `greetings.ts`                                    |
| 5   | Realtime clock (§1.1)                    | 🟡 Medium   | Low    | New hook + `PlannerHeader.tsx`                    |
| 6   | TaskEditPanel overflow fix (§6.1/6.2)    | 🔴 Critical | Low    | `TaskEditPanel.tsx`                               |
| 7   | Markdown notes support (§6.3)            | 🟠 High     | Medium | New `MarkdownEditor.tsx` + `tailwind.config.ts`   |
| 8   | Right-click context menu (§7)            | 🟠 High     | Medium | New wrapper + refactor `TaskContextMenu.tsx`      |
| 9   | Schedule header icon fix (§5.1)          | 🟡 Medium   | Low    | `ScheduleHeader.tsx`                              |
| 10  | Schedule subheader (§5.2)                | 🟡 Medium   | Low    | `ScheduleHeader.tsx`                              |
| 11  | Tags in sidebar (§4.1)                   | 🟠 High     | Medium | New components + `SidebarPanel.tsx` + store       |
| 12  | Tags in TaskEditPanel (§4.2)             | 🟡 Medium   | Low    | `TaskEditPanel.tsx`                               |
| 13  | Tag search (§4.4)                        | 🟢 Low      | Low    | Inline in sidebar                                 |
| 14  | Emoji picker for projects (§2.1)         | 🟡 Medium   | Medium | New component + `project.tsx` + backend migration |
| 15  | Expanded project colors (§2.2)           | 🟡 Medium   | Low    | `color-resolver.ts` + `CreateProjectPopover`      |
| 16  | CalendarEventPopover effort field (§5.3) | 🟡 Medium   | Low    | `CalendarEventPopover.tsx`                        |
| 17  | Inbox board view (§3.1)                  | 🟠 High     | High   | New components + backend + hooks                  |
| 18  | Inbox personality refresh (§3.2)         | 🟡 Medium   | Low    | `inbox.tsx`, `InboxItemCard.tsx`                  |

---

## 10. Verification Checklist

Before marking any task complete, verify:

- [ ] **WCAG AA**: All text on `#0a1628`–`#0f1d32` backgrounds achieves ≥ 4.5:1 contrast ratio
- [ ] **No `transition: all`**: Only `transform` and `opacity` are animated (Manifesto §5)
- [ ] **No div-buttons**: Every `onClick` is on a `<button>` or `<a>` (Manifesto §6.1)
- [ ] **Touch targets**: 44×44px minimum on mobile (Manifesto §6.1)
- [ ] **`prefers-reduced-motion`**: All new animations honor it (Manifesto §5)
- [ ] **No emojis as UI icons**: Emojis are user data only; all UI chrome uses Lucide (Manifesto §6.2)
- [ ] **No hardcoded colors**: All new colors added to `app.css` or `color-resolver.ts` (Manifesto §7)
- [ ] **Frosted glass surfaces**: New panels/popovers use `.glass` or `.glass-surface` (Manifesto §4.3)
- [ ] **String truncation**: All user-generated strings (tags, project names) use `truncate` or `line-clamp-*` (Manifesto §6.1)
- [ ] **Focus-visible**: All new interactive elements have visible focus indicators (Manifesto §6.1)
- [ ] **Optimistic UI**: Tag toggles, emoji changes, color changes all update instantly before API round-trip

---

_"White space is not wasted space — it\u2019s the night sky between the lanterns."_
— Cadence Design Manifesto §3.2
