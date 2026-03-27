/**
 * Shared Action Grammar (RC Plan §7)
 *
 * This module defines the canonical action model that every surface must respect.
 * Context menus, dropdown menus, keyboard shortcuts, and quick actions all derive
 * from these definitions so that the same verbs appear in the same order everywhere.
 */

// ── Section order (§7.3) ──

export type ActionSection =
    | "open"       // Open / Focus
    | "time"       // Time / Schedule
    | "state"      // State / Status
    | "organize"   // Organize
    | "convert"    // Convert / Duplicate
    | "destructive"; // Destructive

export const SECTION_ORDER: ActionSection[] = [
    "open",
    "time",
    "state",
    "organize",
    "convert",
    "destructive",
];

// ── Object types covered by the grammar (§7.2) ──

export type ActionObjectType =
    | "task"
    | "capture"
    | "habit"
    | "project"
    | "schedule_cell"
    | "event";

// ── Single action definition ──

export interface ActionDefinition {
    /** Unique key for the action within its object type */
    id: string;
    /** Human-visible label */
    label: string;
    /** Short label for compact contexts (e.g. pills) */
    shortLabel?: string;
    /** §7.3 section this action belongs to */
    section: ActionSection;
    /** Keyboard shortcut hint (display only; binding lives in keyboard system) */
    shortcutHint?: string;
    /** Lucide icon name or null */
    icon?: string;
    /** Whether this is a danger action (red styling) */
    danger?: boolean;
    /** Whether this action is disabled */
    disabled?: boolean;
    /** Reason shown when disabled */
    disabledReason?: string;
    /** Whether this appears in quick-action row by default */
    quickAction?: boolean;
    /** Priority within its section (lower = earlier) */
    order?: number;
}

// ── Grouped actions for rendering ──

export interface ActionGroup {
    section: ActionSection;
    label: string;
    actions: ActionDefinition[];
}

/** Build ordered action groups from a flat action list, following §7.3 section order */
export function groupActions(actions: ActionDefinition[]): ActionGroup[] {
    const sectionLabels: Record<ActionSection, string> = {
        open: "Open",
        time: "Schedule",
        state: "Status",
        organize: "Organize",
        convert: "More",
        destructive: "",
    };

    const groups: ActionGroup[] = [];

    for (const section of SECTION_ORDER) {
        const sectionActions = actions
            .filter((a) => a.section === section)
            .sort((a, b) => (a.order ?? 50) - (b.order ?? 50));

        if (sectionActions.length > 0) {
            groups.push({
                section,
                label: sectionLabels[section],
                actions: sectionActions,
            });
        }
    }

    return groups;
}

/** Extract only quick actions (max 3 as per §7.1) */
export function getQuickActions(actions: ActionDefinition[], max = 3): ActionDefinition[] {
    return actions
        .filter((a) => a.quickAction && !a.disabled)
        .sort((a, b) => (a.order ?? 50) - (b.order ?? 50))
        .slice(0, max);
}

// ── Canonical action sets per object type (§10.2) ──

export const TASK_ACTIONS: ActionDefinition[] = [
    { id: "open", label: "Open", section: "open", shortcutHint: "Enter", icon: "ExternalLink", order: 0 },
    { id: "reschedule", label: "Reschedule", section: "time", shortcutHint: "r", icon: "Calendar", quickAction: true, order: 0 },
    { id: "schedule_today", label: "Today", shortLabel: "Today", section: "time", shortcutHint: "1", icon: "Sun", order: 1 },
    { id: "schedule_tomorrow", label: "Tomorrow", shortLabel: "Tomorrow", section: "time", shortcutHint: "2", icon: "Moon", order: 2 },
    { id: "schedule_next_week", label: "Next week", section: "time", shortcutHint: "3", icon: "ArrowRight", order: 3 },
    { id: "schedule_this_evening", label: "This evening", section: "time", icon: "Sunset", order: 4 },
    { id: "remove_date", label: "Remove date", section: "time", icon: "CalendarX", danger: true, order: 10 },
    { id: "complete", label: "Complete", section: "state", shortcutHint: "Space", icon: "CheckCircle2", quickAction: true, order: 0 },
    { id: "toggle_pin", label: "Pin", section: "state", shortcutHint: "p", icon: "Pin", order: 1 },
    { id: "set_priority", label: "Priority", section: "state", icon: "Flag", order: 2 },
    { id: "set_effort", label: "Effort", section: "state", icon: "Gauge", order: 3 },
    { id: "set_reminder", label: "Set reminder", section: "state", icon: "Bell", order: 4 },
    { id: "move_project", label: "Move to project", section: "organize", icon: "FolderInput", order: 0 },
    { id: "move_section", label: "Move to section", section: "organize", icon: "Layers", order: 1 },
    { id: "add_tag", label: "Add tag", section: "organize", icon: "Tag", order: 2 },
    { id: "rename", label: "Rename", section: "convert", shortcutHint: "e", icon: "Pencil", order: 0 },
    { id: "duplicate", label: "Duplicate", section: "convert", icon: "Copy", order: 1 },
    { id: "add_subtask", label: "Add subtask", section: "convert", icon: "ListPlus", order: 2 },
    { id: "archive", label: "Archive", section: "destructive", shortcutHint: "Del", icon: "Archive", danger: true, order: 0 },
];

export const CAPTURE_ACTIONS: ActionDefinition[] = [
    { id: "clarify", label: "Clarify", section: "open", shortcutHint: "Enter", icon: "Search", quickAction: true, order: 0 },
    { id: "place_today", label: "Today", shortLabel: "Today", section: "time", shortcutHint: "1", icon: "Sun", quickAction: true, order: 0 },
    { id: "place_tomorrow", label: "Tomorrow", shortLabel: "Tomorrow", section: "time", shortcutHint: "2", icon: "Moon", order: 1 },
    { id: "place_later", label: "Later", shortLabel: "Later", section: "time", shortcutHint: "3", icon: "Clock", order: 2 },
    { id: "keep_note", label: "Keep as note", section: "convert", shortcutHint: "k", icon: "StickyNote", order: 0 },
    { id: "discard", label: "Discard", section: "destructive", shortcutHint: "Backspace", icon: "Trash2", danger: true, order: 0 },
];

export const HABIT_ACTIONS: ActionDefinition[] = [
    { id: "open", label: "Open detail", section: "open", shortcutHint: "Enter", icon: "ExternalLink", order: 0 },
    { id: "complete", label: "Complete", section: "state", shortcutHint: "Space", icon: "CheckCircle2", quickAction: true, order: 0 },
    { id: "skip", label: "Skip", section: "state", icon: "SkipForward", order: 1 },
    { id: "snooze", label: "Snooze", section: "time", shortcutHint: "s", icon: "AlarmClockOff", quickAction: true, order: 0 },
    { id: "resume", label: "Resume today", section: "state", icon: "Play", order: 2 },
    { id: "pause", label: "Pause for now", section: "state", icon: "Pause", order: 3 },
    { id: "adjust_cadence", label: "Adjust cadence", section: "organize", icon: "Settings2", order: 0 },
    { id: "edit", label: "Edit", section: "convert", shortcutHint: "e", icon: "Pencil", order: 0 },
    { id: "archive", label: "Archive", section: "destructive", icon: "Archive", danger: true, order: 0 },
    { id: "delete", label: "Delete", section: "destructive", icon: "Trash2", danger: true, order: 1 },
];

export const SCHEDULE_CELL_ACTIONS: ActionDefinition[] = [
    { id: "add_task", label: "Add task here", section: "open", icon: "CheckSquare", quickAction: true, order: 0 },
    { id: "add_event", label: "Add event here", section: "open", icon: "CalendarPlus", order: 1 },
    { id: "block_focus", label: "Block focus time", section: "time", icon: "Shield", order: 0 },
    { id: "jump_to_day", label: "Jump to day", section: "open", icon: "ArrowRight", order: 2 },
];

export const EVENT_ACTIONS: ActionDefinition[] = [
    { id: "open", label: "Open", section: "open", icon: "ExternalLink", order: 0 },
    { id: "open_in_schedule", label: "Open in schedule", section: "open", icon: "Calendar", order: 1 },
    { id: "edit", label: "Edit", section: "convert", shortcutHint: "e", icon: "Pencil", quickAction: true, order: 0 },
    { id: "toggle_reminder", label: "Toggle reminder", section: "state", icon: "Bell", order: 0 },
    { id: "delete", label: "Delete", section: "destructive", icon: "Trash2", danger: true, order: 0 },
];

export const PROJECT_ACTIONS: ActionDefinition[] = [
    { id: "open", label: "Open", section: "open", icon: "ExternalLink", order: 0 },
    { id: "new_task", label: "New task", section: "open", icon: "Plus", quickAction: true, order: 1 },
    { id: "add_section", label: "Add section", section: "organize", icon: "Layers", order: 0 },
    { id: "edit", label: "Edit project", section: "convert", shortcutHint: "e", icon: "Pencil", quickAction: true, order: 0 },
    { id: "open_menu", label: "Project settings", section: "convert", icon: "Settings2", order: 1 },
    { id: "archive", label: "Archive", section: "destructive", icon: "Archive", danger: true, order: 0 },
    { id: "delete", label: "Delete project", section: "destructive", icon: "Trash2", danger: true, order: 1 },
];
