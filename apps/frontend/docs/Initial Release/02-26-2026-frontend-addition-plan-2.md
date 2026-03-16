# Cadence Frontend Implementation Plan #2

## Objective

Create the foundational components and routes to achieve a 1:1 structural match with the planned Cadence dashboard layout. This includes the implementation of currently no-op UIs, dialogs/modals for global actions, and all non-existing sidebar routes.

## Phase 1: Route Creation

Implement the missing pages based on the main layout structure. These pages will initially contain placeholder structures with empty states or "coming soon" UIs matching the app's aesthetic.

- **`app/routes/upcoming.tsx`**: Upcoming view for tasks.
- **`app/routes/inbox.tsx`**: Inbox capture view for new tasks.
- **`app/routes/completed.tsx`**: Logbook/history of completed tasks.
- **`app/routes/trash.tsx`**: Deleted items layout.
- **`app/routes/project.tsx`**: Detailed project view.

_Action items:_

1. Add routes into `app/routes.ts`.
2. Create the TSX component files inside `app/routes/` and wrap them in `MainLayout`.
3. Build placeholder views using empty states that respect the overarching dark `twilight` theme.

## Phase 2: Primitive UIs

Integrate or create any required generic UI primitives that are missing from the current `components/primitives` directory.

- **Dialog/Modal Primitive**: Create `Dialog.tsx` wrapping `@radix-ui/react-dialog` to support full-page and overlay modals used by sidebar tools.

## Phase 3: Global Actions (Sidebar Buttons)

Implement the interactions associated with the `IconRail` utility buttons. At a minimum, these should trigger opening a dialog or slide-out menu.

- **Search**: Wire up the Search button to open a command palette or search dialog. (No-op UI for now).
- **Quick Add**: Wire up the Quick Add button (`+`) to open a task creation modal. (No-op UI).
- **Notification**: Map the Notification icon (`Bell`) to a side-panel or popover displaying recent alerts. (No-op UI).
- **Settings**: Map the Settings icon (`Settings`) to a large, full-screen-like Dialog component (covering majority of the screen) that hosts user preferences and application configuration.

_Action items:_

1. Implement primitive `Dialog` components mimicking generic Radix patterns.
2. Update `IconRail.tsx` to handle state for the Quick Add, Search, Notification, and Settings dialogs.
3. Build the Dialog overlay structures inside `IconRail.tsx` or as isolated sibling components within the `MainLayout`.

## Phase 4: API Connection & Data Integration

In order to make these no-op views completely functional, we will connect them using our existing TanStack Query and Hono RPC Client hooks from the `app/hooks/` namespace.

### `app/routes/upcoming.tsx`

- **Data Hook:** Call `useTasks({ state: "ACTIVE" })` (or with a custom date range using `scheduledRange: { start: tomorrow }`).
- **Implementation:** Group active tasks by their `scheduledDate` chronologically.
- **Components:** Render multiple instances of `TaskList` with group headers corresponding to each unique date.

### `app/routes/inbox.tsx`

- **Data Hook:** Call `useInbox()` to retrieve unprocessed user entries.
- **Implementation:** Since Inbox items (`InboxItem`) differ from regular `Task` models, create a specialized `InboxList.tsx` and `InboxCard.tsx` component hierarchy that displays the `rawText`.
- **Interactions:** Implement the `useDeleteInboxItem()` hook or a mutation to "process" (promote) items into active tasks or to delete them directly from the log.

### `app/routes/completed.tsx`

- **Data Hook:** Call `useTasks({ state: "COMPLETED" })` directly.
- **Components:** Re-use `TaskList` to render the array. Ensure that the integrated `TaskCheckbox` and `TaskCard` handle the visual and behavioral state appropriately (i.e. visually checked, and supporting a context menu action to un-complete or delete permanently).

### `app/routes/trash.tsx`

- **Data Hook:** Call `useTasks({ state: "DELETED" })`.
- **Components:** Re-use `TaskList`.
- **Interactions:** Ensure that the context menu inside `TaskCard` is disabled or modified dynamically to show a "Restore Task" (via `useUpdateTask`) vs "Permanently Delete" prompt.

### `app/routes/project.tsx`

- **Data hook:** Fetch tasks tied dynamically to the route parameter using `useTasks({ state: "ACTIVE", projectId: projectId })`. Additionally pull `useProjects()` to display the selected project's metadata (e.g., name, color accent) in the screen header.
- **Components:** Use `AddTaskInput` defaulting new tasks' `projectId` field onto payload submissions. Follow up below with the identical `TaskList` mechanism for the Active tasks inside the project.

## Deliverables

- Fully working React Router 7 setup for 5 new main panel areas.
- Functional global action dialog states tied to the sidebar rail buttons.
- Fully connected backend and data fetching loops in the upcoming, inbox, completed, trash, and project views.
