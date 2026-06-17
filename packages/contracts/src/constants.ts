import type { TaskPriority } from "./task";

// Tier 2 — shared *semantic* constants (framework-neutral data only). Presentation
// (Tailwind classes, icon names, CSS var names) stays in the consuming app and is
// layered on top of these. See packages/AGENTS.md §1.

/** Human-readable label for each task priority level (0–4). */
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
    0: "None",
    1: "Low",
    2: "Medium",
    3: "High",
    4: "Urgent",
};

/** Sort weight per priority — higher sorts to the top. */
export const TASK_PRIORITY_SORT_WEIGHT: Record<TaskPriority, number> = {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
};

/**
 * Canonical tag colour palette. `"default"` is the themeable sentinel; the rest
 * are raw hex values shared across every client.
 */
export const TAG_PALETTE = [
    "default",
    "#ff7b72", // red
    "#d2a8ff", // purple
    "#79c0ff", // blue
    "#a5d6ff", // light blue
    "#7ee787", // green
    "#f2cc60", // yellow
    "#ff9800", // orange
    "#f472b6", // rose
    "#fb923c", // coral
    "#2dd4bf", // teal
    "#22d3ee", // cyan
    "#818cf8", // indigo
    "#a3e635", // lime
    "#e879f9", // fuchsia
    "#38bdf8", // sky
] as const;
export type TagPaletteColor = (typeof TAG_PALETTE)[number];
