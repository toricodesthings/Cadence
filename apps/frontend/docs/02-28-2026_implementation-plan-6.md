# Cadence Implementation Plan #6 — UI/UX Refinement & Design Unification

**Date:** February 28, 2026  
**Scope:** `cadence-frontend` — design-only; no backend changes  
**Depends on:** Plans #1–#5 completed

---

## Objective

Bring visual and interaction consistency across all pages, eliminate UX friction points, and push the calendar and planner views closer to the Design Manifesto's "Twilight Sanctuary" feeling. This is a **polish pass**, not a feature plan — every change targets aesthetics, comfort, or cohesion.

---

## Current State Audit — Design Gaps

| Area | Problem | Manifesto Violation |
|------|---------|---------------------|
| **Inbox & Upcoming calendar panel** | Fixed `w-[320px]` side-panel with hard `border-l`, sits *below* the toolbar instead of spanning full height like the Planner page | Pages feel inconsistent; calendar panel in Planner overlays toolbar, but Inbox/Upcoming do not |
| **Inbox & Upcoming headers** | `GeneralPageHeader` uses `text-4xl font-bold` + 14×14 icon box, while Planner uses `text-3xl font-semibold` greeting. Completed page uses yet another ad-hoc header (`text-2xl`, `w-12 h-12` icon) | Three different header patterns across four pages — no unified system |
| **Focus ring on AddTaskInput** | Global `*:focus-visible` applies a `box-shadow: 0 0 0 2px rgba(232,164,74,0.5)` ring to the `<input>`. But the parent `<div>` container already has its own focused styling (amber border, subtle glow). Result: a loud, double-highlighted amber ring that detracts from the cozy aesthetic | §1.2: "No harsh borders," §4.3: "When focused, they gain a gentle warm glow instead of a stark ring" |
| **Calendar ScheduleHeader** | Feels robotic — tiny 12px buttons, cramped segmented control, seasonal icon + heading + controls + nav arrows all packed into one flat strip. Too much information density with no visual hierarchy | §1.1: "Cadence breathes," §3.2: "Generous spacing" |
| **Calendar grid (Month View)** | Day cells are functional but sterile — stiff grid, uniform hover states, no atmospheric depth. Day-of-week headers are tiny `text-[11px]` uppercase labels that feel data-table-like | §1.1: "No sterile data tables," §1.2: "Organic Precision" |
| **Week/Day view day headers** | `text-[10px] uppercase tracking-widest` label + `text-[18px]` date number feel mechanical and small. The header row is cramped (`py-2`) | §3.2: "Generous padding (`p-4` or `p-5`)" |
| **Planner page main content area** | Generally well-aligned with Manifesto. However, the greeting + task list could benefit from slightly more warmth (atmospheric hints) and the transition between header and task list is abrupt | §1.2: "Warm, luminous accents," §5: "Organic physics" |
| **Information repetition in calendar** | ScheduleHeader shows "February 2026" + seasonal icon. The month-view grid also shows month context in day cells. Week view repeats the date in both the header and column headers | DRY principle — "No repetitions of information" |
| **Button sizing** | Calendar nav buttons (`w-8 h-8`), "Today" button (`px-3.5 py-1.5`), and "Add Task" button are all different sizes with different radii (`rounded-xl`). Inconsistent tap targets | §6.1: "Minimum 44×44px tap targets for mobile" |

---

## Task 1: Unify Page Layout — Calendar Side Panel

### Problem

The Planner (`home.tsx`) renders its calendar panel as a `sidePanel` prop on `MainLayout`, which places it at the outermost flex level — **beside** the entire main area (toolbar included), spanning full viewport height. This creates a clean, integrated feel where the calendar is a permanent fixture.

Inbox (`inbox.tsx`) and Upcoming (`upcoming.tsx`) render their calendar panel *inside* the `<main>` content area, *below* the toolbar. The panel has a hard `border-l border-twilight-border` and is `hidden xl:block` — it doesn't participate in the overall layout.

### Changes

#### 1.1 — Inbox & Upcoming: Adopt the `sidePanel` Pattern

**Files:** `app/routes/inbox.tsx`, `app/routes/upcoming.tsx`

Both pages should adopt the same `sidePanel` approach as `home.tsx`:

- Extract the calendar `<div className="w-[320px] ...">` from inside the page content.
- Pass it as the `sidePanel` prop to `<MainLayout>`.
- Include the same resize handle (`w-1 cursor-col-resize`) and resize state logic used in `home.tsx`.
- The panel should span full viewport height (overlaying the toolbar), matching the Planner.

**Before (Inbox):**
```tsx
<MainLayout requireAuth>
  <div className="h-full flex">
    <div className="flex-1 min-w-0">{/* content */}</div>
    <div className="w-[320px] shrink-0 border-l border-twilight-border hidden xl:block">
      <CalendarView />
    </div>
  </div>
</MainLayout>
```

**After (Inbox):**
```tsx
<MainLayout requireAuth sidePanel={sidePanel}>
  <ScrollAreaWrapper>
    <div className="max-w-2xl mx-auto px-8 py-8">{/* content */}</div>
  </ScrollAreaWrapper>
</MainLayout>
```

Where `sidePanel` uses the same resize-handle + CalendarView pattern from `home.tsx`.

#### 1.2 — Extract Resizable Side Panel into a Shared Component

**New file:** `app/components/shared/ResizableSidePanel.tsx`

To avoid duplicating the resize handle + width state + mouse listeners across 3 pages, extract a shared `<ResizableSidePanel>` component:

```tsx
interface ResizableSidePanelProps {
  children: React.ReactNode;
  defaultWidth?: number;  // default 320
  minWidth?: number;      // default 260
  maxWidth?: number;      // default 480
}
```

This component renders:
- The drag handle (`w-1 cursor-col-resize` with lantern hover indicator)
- The panel container with `shrink-0 border-l border-twilight-border overflow-hidden`
- All mouse-drag resize logic (currently in `home.tsx`)

All three pages (`home.tsx`, `inbox.tsx`, `upcoming.tsx`) refactor to use `<ResizableSidePanel>`.

#### 1.3 — Completed & Trash Pages: Add Calendar Panel

**Files:** `app/routes/completed.tsx`, `app/routes/trash.tsx`

These pages currently have no right-side calendar panel at all. Add `<ResizableSidePanel>` wrapping `<CalendarView />` so every task-list page has a consistent layout.

---

## Task 2: Unify Page Headers

### Problem

Four distinct header patterns exist across pages:

| Page | Component | Title size | Icon size | Layout |
|------|-----------|-----------|-----------|--------|
| Planner | `PlannerHeader` | `text-3xl` | None | Greeting + date line, stacked |
| Inbox / Upcoming | `GeneralPageHeader` | `text-4xl font-bold` | `w-14 h-14` box | Icon + title side-by-side |
| Completed | Inline ad-hoc | `text-2xl font-semibold` | `w-12 h-12` box | Icon + title side-by-side |
| Schedule | `ScheduleHeader` | `text-xl font-semibold` | Seasonal 20px icon | Flat toolbar strip |

### Changes

#### 2.1 — Align `GeneralPageHeader` Styling to Match Planner Feel

**File:** `app/components/layout/GeneralPageHeader.tsx`

The `GeneralPageHeader` currently uses `text-4xl font-bold` which is heavier than the Planner's warm `text-3xl font-semibold`. The `w-14 h-14` icon container with `ring-1 ring-white/5` also feels more corporate than cozy.

**Adjustments:**
- Reduce title from `text-4xl font-bold` → `text-3xl font-semibold` to match Planner warmth.
- Reduce icon container from `w-14 h-14` → `w-12 h-12`. Keep `rounded-2xl`.
- Drop `ring-1 ring-white/5` from icon container — it creates a boxy, SaaS feel.
- Reduce icon size from `28` → `24`.
- Keep the italic description — it adds character.
- Keep `mb-10` bottom spacing.

#### 2.2 — Completed Page: Use `GeneralPageHeader`

**File:** `app/routes/completed.tsx`

Replace the inline ad-hoc header with `<GeneralPageHeader>`:
```tsx
<GeneralPageHeader
  icon={CheckCircle2}
  title="Completed"
  description="Look back at your achievements"
  iconColorClass="text-nav-completed"
  iconBgClass="bg-nav-completed/10"
  iconGlowClass="glow-lantern"
/>
```

This eliminates the third unique header pattern.

#### 2.3 — Trash Page: Same Treatment

If the Trash page has its own ad-hoc header, replace it with `<GeneralPageHeader>` as well.

---

## Task 3: Fix Focus Ring Behavior

### Problem

The global CSS rule in `app.css`:
```css
*:focus-visible {
  @apply outline-none;
  box-shadow: 0 0 0 2px rgba(232, 164, 74, 0.5);
}
```

This universally applies a lantern-amber `box-shadow` ring to **every** element that receives focus-visible. For most interactive elements (buttons, links), this is correct and desirable. But for **composite input containers** like `AddTaskInput`, it creates a problem:

1. User clicks the `<input>` inside the styled container.
2. The container applies its own focused state via React state (`border-[rgba(232,164,74,0.2)]`, amber glow shadow).
3. The `<input>` itself also receives a `box-shadow: 0 0 0 2px rgba(232,164,74,0.5)` from the global rule.
4. Result: **Double highlight** — a harsh amber ring on the input sitting inside an already-amber-glowing container. This is visually loud and detracting.

### Changes

#### 3.1 — Suppress Focus Ring on Inputs Inside Styled Containers

**File:** `app/app.css`

Add a scoped override for inputs that live inside containers that manage their own focus state:

```css
/* Inputs inside containers that handle their own focus styling should not
   receive the global lantern ring — the parent container IS the focus indicator */
[role="form"] input:focus-visible,
[data-focus-container] input:focus-visible,
[data-focus-container] textarea:focus-visible,
[data-focus-container] select:focus-visible {
  box-shadow: none;
}
```

Then add `data-focus-container` to the `AddTaskInput` wrapper `<div>` (which already has `role="form"`). The `role="form"` selector alone should be sufficient for `AddTaskInput` since it already uses that attribute.

This preserves the global focus ring on standalone buttons, links, and inputs that don't have parent containers providing focus feedback, while suppressing it in composite components.

#### 3.2 — Audit Other Composite Focus Containers

Check these components for similar double-focus issues:
- `CalendarEventPopover` — title input inside a `glass-surface` popover (confirmed issue — popover already provides strong visual context, inner input ring is redundant; see also Task 4.5)
- `CreateProjectPopover` — project name input inside a popover
- `GhostTaskInput` — inline calendar input (confirmed issue — see also Task 4.6)
- Sidebar `ProjectLink` rename dialog — inline input

For each, verify whether the input receives the global focus ring and if it conflicts with the container's own styling. If so, apply `data-focus-container` to the wrapping element.

#### 3.3 — Consider a Lighter Focus Ring for Text Inputs Generally

As a secondary refinement, the global `*:focus-visible` ring is ideal for buttons (small, discrete targets) but can feel heavy on full-width text inputs. Consider an alternative for text inputs specifically:

```css
input[type="text"]:focus-visible,
input:not([type]):focus-visible,
textarea:focus-visible {
  box-shadow: 0 0 0 1px rgba(232, 164, 74, 0.3);
}
```

This would make standalone text inputs (like search fields) receive a thinner, softer glow rather than the thick 2px ring, while buttons and interactive elements keep the full ring.

---

## Task 4: Calendar Schedule Page — Design Overhaul

### Problem

The Schedule page's `ScheduleHeader`, month grid, and week/day views currently feel stiff and robotic — functional but missing the atmospheric warmth and comfort that the Design Manifesto requires. The header crams too many controls into a flat strip. The grid feels like a spreadsheet. The overall experience lacks the "settling into a warm room" quality.

### 4.1 — ScheduleHeader Redesign

**File:** `app/components/calendar/ScheduleHeader.tsx`

**Current:** Single flat row: `[icon] [heading] ————— [Add Task] [Day|Week|Month|Year] [Today] [< >]`

**Problems:**
- Everything is on one horizontal line — busy and flat.
- 12px text on all buttons — feels cramped and data-dense.
- "Add Task" button visually competes with the view switcher.
- Seasonal icon + heading text on the left tells the same info as the calendar grid itself.
- Navigation arrows are generic and small.

**Proposed layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  February 2026                        [Today]     [<]  [>]     │
│  ❄ Saturday, the 28th                                          │
│                                                                │
│  [Day]  [Week]  [Month]  [Year]                  [+ Add Task]  │
└─────────────────────────────────────────────────────────────────┘
```

**Specific changes:**
- **Two-line heading** (replaces single-line):
  - Line 1: Month + year in `font-display text-2xl font-semibold` — the anchor.
  - Line 2: Seasonal icon + full day label (e.g., "Saturday, the 28th") in `text-sm text-twilight-text-muted` — contextual, warm.
- **Separate control rows:** Heading/nav on top row, view switcher + Add Task on second row. This breaks the visual density.
- **Navigation arrows:** Increase to `w-9 h-9` with `rounded-xl`, icons at 18px. Add soft hover state `hover:bg-white/[0.06]`.
- **"Today" button:** Slightly larger, `px-4 py-2 text-[13px] rounded-xl`. Keep subtle.
- **View mode segmented control:** Increase button padding to `px-4 py-2 text-[13px]` for better tap targets. Maintain `glass rounded-xl` container. Move to the left side of the second row for visual flow (eyes scan left-to-right; the view context comes first, then the action).
- **"Add Task" CTA:** Increase to `px-4 py-2 text-[13px]`. Move to right end of second row, separated from nav controls. Slightly more prominent: `bg-lantern/15 border border-lantern/20 hover:bg-lantern/25`.
- **Padding:** Increase from `px-8 py-4` → `px-8 py-5` for more breathing room.
- **Bottom border:** Keep `border-b border-twilight-border`, but add a very faint warm gradient underneath: `bg-gradient-to-b from-lantern/[0.02] to-transparent h-px` below the border — like the faintest line of lantern light at the bottom of the header. (Optional — test visually.)

#### 4.2 — Month View Grid Enhancement

**Files:** `app/components/calendar/CalendarGrid.tsx`, `app/components/calendar/CalendarDayCell.tsx`

**Day-of-Week Headers (Full variant):**
- Current: `text-[11px] text-twilight-text-muted`
- Change: `text-[12px] font-display font-medium text-twilight-text-muted/60 tracking-wide`
- Use short names: Mon, Tue, Wed, Thu, Fri, Sat, Sun (not single letters, not full words)
- Add `pb-4` for more spacing before the grid

**Day Cells (Full variant):**
- Current cell date number: `font-display text-base tracking-tight` — fine but monotone.
- Change: Make date numbers `text-[15px] font-display font-medium` — slightly smaller, more refined.
- **Hover enhancement:** Current `hover:bg-white/[0.025]` is nearly invisible. Change to `hover:bg-white/[0.04]` and add a very subtle `hover:border-white/[0.08]` transition for more tactile feedback.
- **Today cell:** Current `bg-lantern/10 ring-1 ring-lantern/20` — good, but the circular date badge inside (`w-7 h-7 rounded-full bg-lantern text-twilight-void`) is standard. Add a tiny `shadow-[0_0_8px_rgba(232,164,74,0.15)]` to the badge for a lantern-glow effect.
- **Weekend/off-day differentiation:** Currently no visual distinction. Add a very soft tint to Saturday/Sunday cells: `bg-white/[0.01]` — barely perceptible, but it creates rhythm.
- **Cell corner radius:** Keep `rounded-2xl`.

#### 4.3 — Week/Day View Headers + Grid  

**Files:** `app/components/calendar/WeekView.tsx`, `app/components/calendar/DayView.tsx`

**Day column headers:**
- Current: `text-[10px] uppercase tracking-widest font-semibold` (day name) + `text-[18px] font-display font-semibold` (date number) in a cramped `py-2` block.
- Change:
  - Day name: `text-[11px] uppercase tracking-widest font-medium text-twilight-text-muted/70` — slightly larger, softer weight.
  - Date number: `text-[20px] font-display font-semibold` — bigger for visual hierarchy.
  - Container: `py-3` — more breathing room.
  - Today circle: Keep, but add `shadow-[0_0_8px_rgba(232,164,74,0.15)]` glow.

**Time gutter:**
- Current: `text-[10px] text-twilight-text-muted/50` — extremely faint.
- Change: `text-[11px] text-twilight-text-muted/60 font-medium` — slightly more legible while staying unobtrusive.

**Grid lines:**
- Current: `border-white/[0.07]` for hour lines, `border-white/[0.04] border-dashed` for half-hours.
- These are good. Keep as-is.

**All-day section:**
- Add a subtle label "All day" in the left gutter area: `text-[10px] text-twilight-text-muted/40 uppercase tracking-widest` — like Google Calendar.

#### 4.4 — Remove Information Repetition

**ScheduleHeader × Grid interplay:**
- The header already shows "February 2026" + the contextual day label. The month grid's day cells show dates which are of course necessary, but ensure the header isn't displaying redundant information that the grid already communicates.
- In Week view, both the ScheduleHeader and the column headers show the same dates. Consider making the ScheduleHeader show just the week range (e.g., "Feb 23 – Mar 1") in the subtitle instead of repeating individual dates.
- In Day view, the ScheduleHeader shows the full day label and the DayView component shows a separate day header. Suppress the DayView's own date header — let the ScheduleHeader be the single source.

#### 4.5 — CalendarEventPopover Redesign (Task Adder Panel)

**File:** `app/components/calendar/CalendarEventPopover.tsx`

The `CalendarEventPopover` is the floating panel that appears when a user clicks empty space on the calendar grid or clicks the "Add Task" toolbar button. It currently works, but feels utilitarian and disconnected from the Manifesto's warmth and the "max 2-click" philosophy.

**Current problems:**

| Issue | Detail |
|-------|--------|
| **Visual stiffness** | The popover header reads "New Task" in `text-[12px] uppercase tracking-wider` — corporate and cold. The close button is a tiny `w-7 h-7` X icon. |
| **Time selectors** | Native `<select>` dropdowns styled as `bg-white/[0.04] rounded-lg px-2 py-1 text-[13px] border border-white/[0.06]`. These render browser-native option menus that are jarring on dark themes — white, unstyled OS dropdown menus breaking the twilight glass aesthetic. |
| **Priority picker layout** | The `PriorityPicker` renders its own "Priority" label (`text-[10px] uppercase`) and a row of `h-9 w-9` icon buttons with `rounded-md` — inconsistent with the rest of the popover's `rounded-2xl`/`rounded-xl` language. The `border-twilight-border bg-twilight-surface-muted` on inactive states is a non-existent utility (`twilight-surface-muted` is not defined in the theme), likely rendering as transparent. |
| **Focus ring double-fire** | The title input inside the `glass-surface` popover receives the global `*:focus-visible` ring when clicked. Since the entire popover is already a visually distinct floating surface (glass + border + shadow), the amber ring on the input is redundant and harsh. |
| **Footer** | Cancel + "Add Task" buttons with a `border-t border-twilight-border` divider feels form-like. The distinction between Cancel (text) and Add Task (amber fill) is correct, but the footer could be less rigid. |
| **Fixed dimensions** | Hardcoded `width: 340px` — acceptable for desktop, but should feel proportional, not mechanical. |
| **No description field** | There's no way to add a quick description/note during creation. While not critical, a collapsible "Add notes" option would serve power users. |

**Proposed changes:**

**Header:**
- Replace "New Task" with a warmer contextual label: show the date naturally, e.g., "Saturday, Feb 28" in `text-[13px] font-display font-medium text-twilight-text-soft`. The user already knows they're creating a task — telling them "New Task" is redundant.
- Close button: increase to `w-8 h-8 rounded-xl`, icon at 15px. Match the `btn-icon` standard from Task 6.1.

**Title input:**
- Keep the current styling but add `data-focus-container` to the popover root element to suppress the global focus ring (cross-ref Task 3).
- Add a subtle bottom-border placeholder under the input: `border-b border-twilight-border/30` that warms to `border-lantern/20` on focus. This gives the input a "writing line" feel — like an elegant stationery surface — without a full box border.

**Time selectors — replace native `<select>` with custom dropdowns:**
- Native `<select>` elements render OS-native dropdown menus that are un-stylable and break the dark theme completely (white dropdown on dark UI).
- Replace with a custom time picker component (or Radix `Select` primitive from `app/components/primitives/`):
  - **Trigger:** A styled button showing the current time label, e.g., `3:00 PM`, in `text-[13px] font-medium text-twilight-text-soft`. On hover: `bg-white/[0.06] rounded-lg`. On click: opens a scrollable dropdown.
  - **Dropdown:** `glass-surface rounded-xl` container with `max-h-[240px] overflow-y-auto` listing 30-minute slots. Each slot is `px-3 py-2 text-[13px] hover:bg-white/[0.06] rounded-lg`. Active time gets `bg-lantern/10 text-lantern`.
  - **Dropdown behavior:** Auto-scrolls to the currently selected time on open. Keyboard navigable (up/down arrows + Enter).
  - This brings time selection fully into the twilight aesthetic.

**Priority picker alignment:**
- Fix the non-existent `bg-twilight-surface-muted` class in `PriorityPicker` — change to `bg-twilight-surface` or `bg-white/[0.04]`.
- Change priority buttons from `rounded-md` → `rounded-lg` to align with the popover's rounded language.
- The "Priority" label inside `PriorityPicker` is redundant when the `Flag` icon is already shown in the popover row. Remove the internal label when used inside `CalendarEventPopover` (add an `inline` or `compact` prop to `PriorityPicker`).
- Increase button size from `h-9 w-9` → `h-8 w-8` (or keep `h-9 w-9` but ensure consistent spacing).

**Footer refinement:**
- Soften the `border-t` from `border-twilight-border` → `border-twilight-border/50` for a less rigid divider.
- Add `bg-white/[0.02]` to the footer area for a subtle surface distinction — the footer should feel like a gently separated action zone, not a hard line.
- Add a keyboard shortcut hint to the Add Task button: `⏎` displayed as a small `text-[10px] text-lantern/50 ml-1` badge — reinforcing that Enter submits.

**Optional: collapsible notes field:**
- Between the priority row and the footer, offer a toggle-able "Add a note…" link in `text-[12px] text-twilight-text-muted/60 italic`.
- Clicking it reveals a `<textarea>` (2–3 rows, auto-grow) with `bg-transparent text-[13px] text-twilight-text outline-none`.
- This maps to the `content` field on the task model. Not essential for v1 of this refinement but provides a natural extension point.

#### 4.6 — GhostTaskInput Polish

**File:** `app/components/calendar/GhostTaskInput.tsx`

The `GhostTaskInput` is a minimal inline pill that spawns directly on the calendar grid when clicking empty space. It's extremely compact by design (`text-[11px]`, `py-[3px]`), which is correct for its "ghost chip" role. Minor polish:

- **Border:** Current `border-lantern/25` — good. On focus, warm it to `border-lantern/40` for a slightly more visible active state.
- **Shadow:** Current `shadow-[0_4px_16px_rgba(0,0,0,0.25)]` — functional but cold. Add a warm component: `shadow-[0_4px_16px_rgba(0,0,0,0.2),0_0_12px_rgba(232,164,74,0.06)]` — the faintest lantern halo around the ghost chip.
- **Focus ring:** Same as other composite inputs — add `data-focus-container` to suppress the global ring on the inner `<input>`.
- **Placeholder:** Current "Task name…" — consider "What's on your mind?" or keep minimal. This is a taste call.

---

## Task 5: Planner Page — Warmth & Atmosphere Pass

### Problem

The Planner (Today) page is the most polished page, but it can still be pushed closer to the "warm, quiet room overlooking a vast, peaceful night landscape" feeling from the Manifesto.

### 5.1 — PlannerHeader Atmosphere

**File:** `app/components/layout/PlannerHeader.tsx`

- **Greeting:** Currently `text-3xl` — good. But the greeting text feels slightly generic. It already uses time-based greetings and the user's name in lantern color — this is well-aligned.
- **Date line:** Currently `text-sm text-twilight-text-muted tracking-wide`. Consider `text-[13px]` and slightly warmer color: `text-twilight-text-muted/80` instead of the default muted. The weather data integration is excellent and atmospheric.
- **Spacing below header:** `mb-10` before AddTaskInput — good. Keep.

### 5.2 — AddTaskInput Refinement

**File:** `app/components/tasks/AddTaskInput.tsx`

The input container is well-designed. Minor refinements:
- **Focused state border:** Current `border-[rgba(232,164,74,0.2)]` — good but the hardcoded rgba should use the design system. Change to `border-lantern/20`.
- **Focused background:** `bg-white/[0.02]` — very subtle. Consider `bg-white/[0.03]` for slightly more definition when active.
- **Shadow:** Current `shadow-[0_0_0_1px_rgba(232,164,74,0.08),0_4px_24px_rgba(232,164,74,0.04)]` — this is the "gentle warm glow" from the Manifesto, which is correct. Pair this with the focus ring fix from Task 3 and the input will feel right.

### 5.3 — TaskCard Atmospheric Hints

**File:** `app/components/tasks/TaskCard.tsx`

- **Hover state:** Current `hover:bg-white/[0.025]` is very faint. Increase to `hover:bg-white/[0.035]` for more tactile feedback, and add a subtle warm tint on hover for tasks with no priority or "none" priority: `hover:bg-lantern/[0.02]`.
- **Selected state:** Current `bg-white/[0.04] ring-1 ring-lantern/15` — good. Keep.
- **Title typography:** Current `text-[15px] leading-snug` — correct per Manifesto. Keep.
- **Priority bar glow:** Currently only urgent has a glow (`.priority-urgent-bar`). Consider adding a very subtle glow for high-priority tasks too: `shadow-[0_0_4px_rgba(245,158,11,0.1)]`.

### 5.4 — Transition Between Sections

The jump from `PlannerHeader` → `AddTaskInput` → `TaskList` is functional but abrupt. Consider:
- Add a very subtle separator between the header and the task input area: a `h-px bg-gradient-to-r from-transparent via-twilight-border/30 to-transparent` divider with `my-6` spacing. This creates a "section" feel without adding a harsh line.
- Or, alternatively, keep the current clean flow if the focus-ring fix from Task 3 resolves the visual distraction enough.

---

## Task 6: Global Interactive Refinements

### 6.1 — Consistent Button Size Minimums

**File:** `app/app.css`

Currently, button sizes vary wildly (some `w-8 h-8`, some `px-3.5 py-1.5`). While exact uniformity isn't needed, establish a minimum tap target guideline:

- Navigation icon buttons: minimum `w-9 h-9` (36px — close to the 44px mobile target)
- Text buttons: minimum `px-4 py-2` and `text-[13px]`
- Add a utility class in `app.css`:
  ```css
  .btn-icon {
    @apply w-9 h-9 rounded-xl flex items-center justify-center transition-colors;
  }
  ```

Apply across ScheduleHeader, CalendarHeader (sidebar), and any other icon-only buttons.

### 6.2 — Cursor Consistency

Ensure every interactive element surface has `cursor-pointer`. Audit:
- `CalendarDayCell` (full variant) — has `cursor-pointer` ✓
- `ScheduleHeader` buttons — have `cursor-pointer` ✓
- `NavLink` — has via parent ✓
- Week/Day grid cells — currently `cursor-crosshair` which is correct for "click to create" behavior ✓

### 6.3 — Hover Transition Timing

Some components use `transition-colors duration-200`, others use `transition-all`, and some rely on the global transition. Standardize:
- All hover-only transitions: `transition-colors duration-200` (use the global rule).
- Background + border transitions: `transition-[background-color,border-color] duration-200`.
- Do not use `transition-all` — per Manifesto §5 (hardware acceleration), only animate specific properties.

Audit and fix any components using `transition-all`:
- `CalendarDayCell.tsx` — uses `transition-all` on the container. Change to `transition-[background-color,border-color,box-shadow]`.
- `ScheduleHeader` — "Add Task" button uses `transition-all`. Change to `transition-colors`.

---

## Task 7: WCAG Contrast Compliance Pass (CRITICAL)

### Problem — Measured Contrast Ratios

A full WCAG 2.1 AA audit was performed using sRGB-linearized luminance calculations against every background in the Twilight theme. The results expose **systemic contrast failures** across the entire application wherever alpha-reduced `text-twilight-text-muted` is used.

#### Measured Full-Opacity Ratios (All Pass ✅)

| Text Token | On `base` (#0f1d32) | On `surface` (#152540) | On `elevated` (#1c2f50) |
|---|---|---|---|
| `text` (#e8edf5) | 14.38:1 | 13.03:1 | 11.36:1 |
| `text-soft` (#b8c5d4) | 9.64:1 | 8.74:1 | 7.62:1 |
| `text-muted` (#8899b0) | 5.82:1 | 5.28:1 | 4.60:1 |
| `lantern` (#e8a44a) | 7.92:1 | 7.18:1 | 6.26:1 |
| `moonlit` (#7eb8d4) | 7.80:1 | 7.07:1 | 6.17:1 |

#### Measured Alpha-Reduced Ratios — text-muted on `base` (#0f1d32) (CRITICAL FAILURES)

| Alpha | Blended Hex | Ratio | AA Normal (4.5:1) | AA Large (3:1) |
|---|---|---|---|---|
| `/30` | #334257 | **1.66:1** | ❌ FAIL | ❌ FAIL |
| `/40` | #3f4e64 | **2.00:1** | ❌ FAIL | ❌ FAIL |
| `/50` | #4b5b71 | **2.44:1** | ❌ FAIL | ❌ FAIL |
| `/60` | #57677d | **2.93:1** | ❌ FAIL | ❌ FAIL |
| `/70` | #63738a | **3.50:1** | ❌ FAIL | ✅ Pass |
| `/80` | #6f8096 | **4.19:1** | ❌ FAIL | ✅ Pass |
| `/90` | #7b8ca3 | **4.93:1** | ✅ Pass | ✅ Pass |
| `/100` | #8899b0 | **5.82:1** | ✅ Pass | ✅ Pass |

#### Measured Alpha-Reduced Ratios — text-muted on `surface` (#152540) (Worse)

| Alpha | Ratio | AA Normal | AA Large |
|---|---|---|---|
| `/70` | **3.31:1** | ❌ FAIL | ✅ Pass |
| `/80` | **3.87:1** | ❌ FAIL | ✅ Pass |
| `/90` | **4.53:1** | ✅ Pass | ✅ Pass |

#### Measured Border Contrast (WCAG 1.4.11 — Non-Text Elements Need 3:1)

| Border | Ratio | Status |
|---|---|---|
| `white/0.06` on base | **1.17:1** | ❌ CATASTROPHIC FAIL |
| `white/0.10` on base | **1.33:1** | ❌ CATASTROPHIC FAIL |

These borders are used as the primary boundary indicator on glass surfaces, cards, and inputs throughout the entire app. They are effectively invisible and fail WCAG 1.4.11 for non-text UI elements.

### 7.1 — Establish Minimum Alpha Floor in Design System

**File:** `app/app.css`

Based on the measured ratios, enforce these minimums:

| Token | Minimum Alpha | Rationale |
|---|---|---|
| `text-twilight-text-muted` | **`/90`** for normal text (≤18px) | 4.93:1 passes AA on `base`; 4.53:1 on `surface` |
| `text-twilight-text-muted` | **`/70`** for large text only (≥18px bold or ≥24px) | 3.50:1 passes AA Large |
| `text-twilight-text-soft` | **`/70`** for normal text | 5.34:1 on `base` |
| Border tokens | **`white/0.15`** minimum | Must be raised to approach 3:1 |

Add CSS custom properties for standard opacity levels to encourage correct usage:

```css
/* Contrast-safe text opacity presets — NEVER go below these */
--alpha-muted-min: 0.9;      /* text-muted minimum for normal text */
--alpha-muted-large: 0.7;    /* text-muted minimum for large text (≥18px bold) */
--alpha-soft-min: 0.7;       /* text-soft minimum for normal text */
```

### 7.2 — Fix All Failing Text Instances

**Sweep every component file** and fix alpha-reduced text. Here is the exhaustive list:

| File | Current Class | Fix |
|---|---|---|
| `EmptyState.tsx` | `text-twilight-text-muted/40` | → `text-twilight-text-muted` (full opacity — motivational text should be readable) |
| `EmptyState.tsx` | `text-twilight-text-muted/50` | → `text-twilight-text-muted/90` |
| `TaskCard.tsx` | `text-twilight-text-muted/40` | → `text-twilight-text-muted/90` (deadline label) |
| `TaskCard.tsx` | `text-twilight-text-muted/60` | → `text-twilight-text-muted/90` |
| `AddTaskInput.tsx` | `placeholder:text-twilight-text-muted/40` | → `placeholder:text-twilight-text-muted/70` (placeholders are exempt from WCAG but should still be legible per §1.4.3 Note 1; `/70` = 3.50:1 is acceptable for placeholder hint text) |
| `InboxItemCard.tsx` | `text-twilight-text-muted/40` | → `text-twilight-text-muted/90` |
| `SidebarPanel.tsx` | `text-twilight-text-muted/50` | → `text-twilight-text-muted/90` |
| `TaskEditPanel.tsx` | `text-twilight-text-muted/30` | → `text-twilight-text-muted/90` |
| `project.tsx` | `placeholder:text-twilight-text-muted/40` | → `placeholder:text-twilight-text-muted/70` |
| `auth.tsx` | `text-twilight-text-muted/60` | → `text-twilight-text-muted/90` |
| `CalendarGrid.tsx` | `text-twilight-text-muted/50` | → `text-twilight-text-muted/90` |
| `TimeGutter.tsx` | `text-twilight-text-muted/50` | → `text-twilight-text-muted/70` (large-text context OK) |
| `CalendarTaskChip.tsx` | `text-twilight-text-muted/70` | → `text-twilight-text-muted/90` |
| `GhostTaskInput.tsx` | `placeholder:text-twilight-text-muted/50` | → `placeholder:text-twilight-text-muted/70` |

### 7.3 — Fix Interactive Element Contrast

| File | Element | Fix |
|---|---|---|
| `TaskCheckbox.tsx` | Unchecked circle border `border-twilight-text-muted/30` (1.6:1) | → `border-twilight-text-muted/70` (3.5:1 — passes WCAG 1.4.11 for non-text UI) |
| `TaskCheckbox.tsx` | Checkmark SVG `stroke="#0a1628"` | → `stroke="currentColor"` with `text-twilight-void` class — decoupled from hardcoded bg |

### 7.4 — Raise Border Visibility

**File:** `app/app.css`

The Manifesto describes borders as "the faintest edge of moonlight on glass" (`rgba(255,255,255,0.06)`). However, at 1.17:1 this is **decorative only** and fails WCAG 1.4.11 when borders are the **sole boundary indicator** for interactive elements (inputs, buttons, containers that need visual definition).

**Strategy:** Keep `white/0.06` for purely decorative borders (e.g., cards floating over clearly distinct backgrounds). But for **functional borders** — input fields, buttons, interactive containers — establish a higher floor:

```css
--color-twilight-border: rgba(255, 255, 255, 0.10);         /* decorative (current) */
--color-twilight-border-interactive: rgba(255, 255, 255, 0.20); /* inputs, buttons — ~1.8:1, combined with other visual cues */
```

For interactive elements, borders are just ONE cue among several (background color, shadow, padding). WCAG 1.4.11 allows that the element's overall visual presentation provides sufficient contrast, not just the border alone. So `white/0.20` combined with glass background differences is acceptable. But audit each input/button to confirm.

---

## Task 8: Accessibility Hardening

### Problem

The codebase has several WCAG 2.1 Level AA violations beyond contrast: keyboard-inaccessible elements, missing ARIA attributes, semantic HTML violations, touch target failures, and sub-minimum font sizes.

### 8.1 — Fix Keyboard-Inaccessible Interactive Elements

**Critical violations** where keyboard/screen-reader users cannot access functionality:

| File | Element | Issue | Fix |
|---|---|---|---|
| `InboxItemCard.tsx` | Action buttons (move, trash) | `pointer-events-none group-hover:pointer-events-auto` makes buttons completely non-interactive for keyboard users | Add `focus-within:pointer-events-auto` to the group container, or better: remove `pointer-events-none` entirely and use `opacity-0 group-hover:opacity-100 focus-visible:opacity-100` instead |
| `TaskCard.tsx` | Drag handle | `opacity-0 group-hover:opacity-30` — invisible and unfocusable for keyboard users | Add `focus-visible:opacity-30` so keyboard users can see and activate the handle |
| `CalendarTaskChip.tsx` | Edit/delete hover buttons | `opacity-0 group-hover:opacity-100` — keyboard users cannot access these actions at all | Add `focus-visible:opacity-100` and ensure the buttons are reachable via Tab |

### 8.2 — Add Missing ARIA Attributes

| File | Element | Fix |
|---|---|---|
| `CalendarHeader.tsx` | Prev/next month buttons | Add `aria-label="Previous month"` / `aria-label="Next month"` |
| `TimePickerInput.tsx` | Arrow buttons (`▲`/`▼`) | Add `aria-label="Increment hour"` / `aria-label="Decrement hour"` (etc. for minutes/period) |
| `CreateProjectPopover.tsx` | Color picker circle buttons | Add `aria-label="Select {color name}"` — currently only have `title` which isn't announced by all screen readers |
| `CalendarEventPopover.tsx` | Start/end time `<select>` elements | Add `aria-label="Start time"` / `aria-label="End time"` — or visible `<label>` elements (note: these will be replaced by custom dropdowns per Task 4.5, but add labels now for intermediate accessibility) |

### 8.3 — Fix Semantic HTML Violations

| File | Issue | Fix |
|---|---|---|
| `AddTaskInput.tsx` | Uses `role="form"` on a `<div>` with manual `onKeyDown` Enter-checking | Change to a proper `<form>` element with `onSubmit`. This gives screen readers correct form landmark semantics and enables native Enter-to-submit |
| `TaskCard.tsx` | Uses `role="button"` on a `<div>` with manual `onKeyDown` | Refactor to use `<button>` element or Radix `Slot` pattern. Native button provides keyboard activation (`Enter`/`Space`), focus management, and correct role semantics for free |

### 8.4 — Fix Touch Target Size Violations (WCAG 2.5.5)

Minimum interactive target size is 44×44px on mobile, 24×24px on desktop (WCAG 2.5.8 Level AA).

| File | Element | Current Size | Fix |
|---|---|---|---|
| `CalendarTaskChip.tsx` | Edit/delete hover buttons | `w-4 h-4` (16×16px) | → `w-6 h-6` (24px minimum) with padding zone via `p-1` around the icon |
| `TimePickerInput.tsx` | Arrow increment/decrement | Raw `▲`/`▼` text characters (~12px) | Wrap in `<button>` elements with `w-8 h-8` minimum, `aria-label`, and proper icon sizing |

### 8.5 — Fix Sub-Minimum Font Sizes

WCAG doesn't mandate a strict minimum, but the Manifesto says "generous padding" and accessibility best practice treats anything below 12px as problematic for readability.

| File | Current | Fix |
|---|---|---|
| `YearView.tsx` | `text-[8px]`, `text-[9px]` for day labels and numbers | → `text-[10px]` minimum. The Year view is a compressed overview, but 8px is too small even for decorative text. Consider `text-[11px]` for day numbers |
| `WeekView.tsx` | `text-[10px]` for day column header labels | → `text-[11px]` (already addressed in Task 4.3, confirm fix) |
| `TimeGutter.tsx` | `text-[10px]` for hour labels | → `text-[11px]` (already addressed in Task 4.3, confirm fix) |
| `CalendarDayCell.tsx` | `text-[10px]` for "+N more" overflow | → `text-[11px]` |
| `GhostTaskInput.tsx` | `text-[11px]` | Acceptable (≥11px is the practical minimum for short labels) |

---

## Task 9: Design Token Cleanup & Consistency

### Problem

The design system has undefined tokens being referenced, raw hex values in component code, leftover shadcn/UI tokens, and `text-white` instead of `twilight-text`. These are AGENTS.md and Manifesto violations.

### 9.1 — Define Missing CSS Tokens

**File:** `app/app.css` — inside the `@theme` block

These tokens are used in **5 components** but have no CSS variable, causing classes to resolve to `transparent`:

```css
--color-twilight-surface-muted: #0d1a2e;   /* between deep and base — subtle recessed surface */
--color-twilight-surface-hover: #1a2d4a;    /* between surface and elevated — hover state surface */
```

**Affected components:** `PriorityPicker.tsx`, `RecurrencePicker.tsx`, `TagPickerSubmenu.tsx`, `TimePickerInput.tsx`, `DeadlineQuickActions.tsx`

### 9.2 — Replace All `text-white` with `twilight-text`

The Manifesto says: "Never harsh pure white." `#ffffff` is cold. `twilight-text` (`#e8edf5`) is a warm silver-blue designed specifically for dark backgrounds.

| File | Line(s) | Fix |
|---|---|---|
| `MainLayout.tsx` | ~63 (branding text) | `text-white` → `text-twilight-text` |
| `IconRail.tsx` | ~231, ~315 (settings dialog) | `text-white` → `text-twilight-text` |
| `Dialog.tsx` | ~87 (`DialogTitle`) | `text-white` → `text-twilight-text` |
| `DeadlineQuickActions.tsx` | ~31 (active state) | `text-white` → `text-twilight-text` (combined with 9.4 solid-fill fix) |
| `RecurrencePicker.tsx` | ~36 (active state) | `text-white` → `text-twilight-text` (combined with 9.4 solid-fill fix) |

### 9.3 — Remove Shadcn/UI Leftover Tokens from Dialog.tsx

**File:** `app/components/primitives/Dialog.tsx`

The close button uses dead shadcn classes that don't exist in the Twilight theme:

```
ring-offset-background  →  remove (no --ring-offset-background defined)
focus:ring-ring          →  focus-visible:ring-lantern/50
bg-accent               →  bg-white/[0.06]
text-muted-foreground   →  text-twilight-text-muted
```

### 9.4 — Replace Solid Accent Fills with Translucent Treatments

The Manifesto §3.4 says ambient, translucent treatments over solid SaaS pill badges.

| File | Current | Fix |
|---|---|---|
| `DeadlineQuickActions.tsx` | `bg-lantern text-white` (active) | → `bg-lantern/20 text-lantern border border-lantern/30` |
| `RecurrencePicker.tsx` | `bg-lantern text-white` (active) | → `bg-lantern/20 text-lantern border border-lantern/30` |

### 9.5 — Replace Toaster Hardcoded Hex Values

**File:** `app/components/feedback/Toaster.tsx`

Contains **~15 hardcoded hex values.** Every color must map to a Twilight token:

| Hardcoded Hex | Twilight Token |
|---|---|
| `#c7cdd8` | `twilight-text-soft` |
| `#8891a0` | `twilight-text-muted` |
| `#e8a44a` | `lantern` |
| `#0f1726` | `twilight-base` (approx) |
| `#1e293b` | `twilight-elevated` (approx) |
| `#5dba72` | Define new `--color-feedback-success: #5dba72` |
| `#d97756` | Define new `--color-feedback-error: #d97756` |
| `#7eb8d4` | `moonlit` |
| All surface/bg hex values | Map to `twilight-surface`, `twilight-deep`, etc. |

Additionally, toast surfaces should use the `glass-surface` utility for atmospheric consistency.

### 9.6 — Fix auth.tsx Duplicate Tailwind Classes

**File:** `app/routes/auth.tsx`

`mt-8 mt-2` on the same element — last wins (`mt-2`), making `mt-8` dead code. Remove `mt-8` if `mt-2` is intended, or vice versa.

---

## Task 10: Remaining Corporate Pattern Elimination

### Problem

Several components still carry SaaS-like patterns that contradict the Manifesto's anti-corporate directive. These were not caught by the earlier Task 1–6 focused review.

### 10.1 — Style the ErrorBoundary

**File:** `app/root.tsx`

The `ErrorBoundary` currently renders with generic unstyled markup (`container mx-auto px-4 py-16`, bare `<h1>`, bare `<a>`). Users who hit an error see a completely off-brand page — no atmospheric background, no glass surface, no twilight tokens.

**Fix:**
- Add `bg-twilight min-h-screen flex items-center justify-center` to the outer container.
- Wrap the content in a `glass-surface rounded-2xl p-8 max-w-md` panel.
- Apply `text-twilight-text font-display text-2xl font-semibold` to the heading.
- Apply `text-twilight-text-soft text-sm` to the error message.
- Style the reload link as `text-lantern hover:text-lantern/80 transition-colors`.
- Add the radial gradient background from `bg-twilight` so even the error state feels like part of the sanctuary.

### 10.2 — Settings Dialog De-SaaS-ification

**File:** `app/components/sidebar/IconRail.tsx` (~line 220+)

The settings dialog uses flat, corporate styling:
- Active tab: `bg-twilight-border` → should be `bg-white/[0.06]` with `text-lantern` for active indicator
- Pane background: `bg-black/20` → should use `glass-surface` with `rounded-xl`
- Overall: Add `glass rounded-2xl` to the dialog panel itself

### 10.3 — Replace `rounded-md` with `rounded-xl` Globally

The Manifesto says "small radii feel corporate." All `rounded-md` instances:

| File | Element |
|---|---|
| `PriorityPicker.tsx` | Active priority button |
| `RecurrencePicker.tsx` | Recurrence preset buttons |
| `TagPickerSubmenu.tsx` | Inline input container |
| `TimePickerInput.tsx` | Outer container |
| `ProjectLink.tsx` | Action button |

All → `rounded-xl`.

### 10.4 — TagPickerSubmenu: Use ScrollArea Primitive

**File:** `app/components/tasks/TagPickerSubmenu.tsx`

Uses raw `overflow-y-auto` instead of the `ScrollArea` primitive from `app/components/primitives/`. Per AGENTS.md, all scroll containers should use the project's `ScrollArea` wrapper for consistent styling and behavior.

Add `max-h-[200px]` constraint to prevent unbounded expansion.

### 10.5 — Ambient Glow Usage Expansion

The `glow-lantern` and `glow-moonlit` utilities are defined in `app.css` but **rarely used.** The Manifesto (§2.3) calls for ambient glow on hover/focus states rather than simple opacity bumps.

**Priority spots to add `glow-lantern` on hover/focus:**
- `TaskCard.tsx` — hovered task cards (replace `hover:bg-white/[0.025]` with a combination of `hover:bg-white/[0.03]` + subtle `hover:shadow-[0_0_12px_rgba(232,164,74,0.04)]`)
- Sidebar `NavLink` active state — the current active indicator could benefit from an ambient glow
- `CalendarDayCell.tsx` today cell — already has the ring, add the `glow-lantern` shadow for warmth

---

## Execution Steps for Agents

### Phase A: Design System Foundation (Do First — Unblocks Everything)

1. **Step 1:** Define missing CSS tokens in `app/app.css` — add `--color-twilight-surface-muted`, `--color-twilight-surface-hover`, `--color-twilight-border-interactive`, `--color-feedback-success`, `--color-feedback-error`, and contrast-safe alpha preset comments (Task 9.1, Task 7.1, Task 7.4).
2. **Step 2:** WCAG contrast sweep — fix all alpha-reduced text classes across all components (Task 7.2, Task 7.3). This is a mechanical find-and-replace pass across ~14 files.
3. **Step 3:** Design token cleanup — replace all `text-white` with `text-twilight-text` (Task 9.2), remove shadcn leftovers from `Dialog.tsx` (Task 9.3), replace solid `bg-lantern text-white` fills with translucent treatments (Task 9.4), fix Toaster hex values (Task 9.5), fix auth.tsx duplicate classes (Task 9.6).

### Phase B: Layout & Structure

4. **Step 4:** Create `ResizableSidePanel` shared component. Refactor `home.tsx` to use it (Task 1.2, 1.1).
5. **Step 5:** Refactor `inbox.tsx` and `upcoming.tsx` to use `sidePanel` prop pattern with `ResizableSidePanel` (Task 1.1).
6. **Step 6:** Add calendar panel to `completed.tsx` and `trash.tsx` (Task 1.3).
7. **Step 7:** Unify page headers — update `GeneralPageHeader` styling, refactor `completed.tsx` and `trash.tsx` to use it (Task 2).

### Phase C: Focus, Accessibility & Keyboard

8. **Step 8:** Fix focus ring — add CSS overrides in `app.css`, add `data-focus-container` attributes to `AddTaskInput`, `CalendarEventPopover`, `GhostTaskInput`, and other composite containers (Task 3).
9. **Step 9:** Accessibility hardening — fix keyboard-inaccessible elements in `InboxItemCard`, `TaskCard`, `CalendarTaskChip` (Task 8.1), add ARIA labels (Task 8.2), fix semantic HTML (Task 8.3), fix touch targets (Task 8.4), fix sub-minimum font sizes (Task 8.5).

### Phase D: Calendar Design Overhaul

10. **Step 10:** Redesign `ScheduleHeader` — new two-row layout, bigger controls, less density (Task 4.1).
11. **Step 11:** Calendar grid polish — day headers, cell hover states, today glow, weekend tint (Task 4.2).
12. **Step 12:** Week/Day view tweaks — larger day headers, time gutter legibility, all-day label (Task 4.3).
13. **Step 13:** Remove information repetition across calendar views (Task 4.4).
14. **Step 14:** `CalendarEventPopover` redesign — contextual header, custom time picker (replace native `<select>`), priority picker alignment, footer refinement, optional notes field (Task 4.5).
15. **Step 15:** `GhostTaskInput` polish — focus border warmth, lantern halo shadow, focus ring suppression (Task 4.6).
16. **Step 16:** `PriorityPicker` fixes — use newly defined `bg-twilight-surface-muted`, align border radius to `rounded-xl`, add `compact` mode prop (Task 4.5 cross-ref, Task 10.3).

### Phase E: Warmth & Atmosphere Pass

17. **Step 17:** Planner warmth — `TaskCard` hover glow refinements, `AddTaskInput` border token fixes, section separator (Task 5).
18. **Step 18:** Corporate pattern elimination — style `ErrorBoundary` in `root.tsx` (Task 10.1), de-SaaS the settings dialog in `IconRail.tsx` (Task 10.2), replace all `rounded-md` → `rounded-xl` (Task 10.3).
19. **Step 19:** ScrollArea + ambient glow — fix `TagPickerSubmenu` to use `ScrollArea` primitive (Task 10.4), expand `glow-lantern` usage to TaskCard, NavLink, CalendarDayCell (Task 10.5).

### Phase F: Global Audit & QA

20. **Step 20:** Global audit — `transition-all` → specific properties, button size minimums, `btn-icon` utility, `cursor-pointer` consistency (Task 6).
21. **Step 21:** Final WCAG pass — run every page through contrast checker, keyboard-only navigation test, screen reader walkthrough. Verify no regressions from Tasks 7–10.

---

## Design Principles Checklist (Per-Change Validation)

Before merging any change from this plan, verify:

### Visual & Brand
- [ ] No hardcoded hex colors in component code — all colors via CSS variables / Tailwind tokens
- [ ] No `text-white` — use `text-twilight-text` for warm silver-blue
- [ ] No `transition-all` on any element — specify properties explicitly
- [ ] No `shadow-sm`, `shadow-md`, or `shadow-lg` (SaaS tropes)
- [ ] No `rounded-md` or `rounded-sm` — use `rounded-xl`+ on all interactive elements
- [ ] No solid opaque accent fills (`bg-lantern text-white`) — use translucent `bg-lantern/20 text-lantern`
- [ ] No shadcn/UI leftover tokens (`ring-offset-background`, `ring-ring`, `bg-accent`, `text-muted-foreground`)
- [ ] `rounded-2xl` or `rounded-3xl` on containers; `rounded-xl` on buttons; `rounded-full` on pills/dots
- [ ] Glass effects (`backdrop-blur`) used on floating surfaces (popovers, toasts, dialogs)
- [ ] Ambient glow (`glow-lantern` / `glow-moonlit`) used on important hover/focus states

### Contrast & WCAG Compliance
- [ ] **ALL text passes WCAG AA** — `text-muted` never below `/90` (4.93:1) for normal text
- [ ] **ALL text-muted large text** never below `/70` (3.50:1) for ≥18px bold or ≥24px
- [ ] **ALL text-soft** never below `/70` (5.34:1) for normal text
- [ ] Placeholder text minimum `/70` (technically exempt from WCAG but must be legible)
- [ ] Interactive element borders minimum `white/0.15` when border is the primary visual boundary
- [ ] No alpha-reduced text below `/70` on any background darker than `#0f1d32`

### Accessibility (WCAG 2.1 AA)
- [ ] Every interactive element has a visible `:focus-visible` indicator
- [ ] No `outline-none` without a replacement focus indicator
- [ ] No `pointer-events-none` on elements that should be keyboard-accessible — use `opacity-0 focus-visible:opacity-100` pattern instead
- [ ] Every `<button>` with icon-only content has `aria-label`
- [ ] No `role="button"` on `<div>` — use native `<button>` elements
- [ ] No `role="form"` on `<div>` — use native `<form>` elements
- [ ] Touch targets minimum 44×44px on mobile, 24×24px on desktop
- [ ] No font size below `text-[11px]` (10px absolute minimum for compressed views only)
- [ ] Color-only indicators always have text or shape alternatives

### Interaction & Motion
- [ ] Focus states are visible but warm (lantern glow), not harsh rings
- [ ] Hover states provide tactile feedback (`bg-white/[0.03–0.06]` range)
- [ ] `cursor-pointer` on all interactive elements
- [ ] `prefers-reduced-motion` respected (no new animation bypasses this)
- [ ] Animate only `transform` and `opacity`; never layout properties

### Typography & Spacing
- [ ] Font hierarchy: `font-display` (Outfit) for headings, `font-sans` (Inter) for body
- [ ] Spacing is generous — no cramped rows (`py-2` minimum, prefer `py-3` or `py-4`)
- [ ] Consistent header patterns across all pages (using `GeneralPageHeader` or `PlannerHeader`)
