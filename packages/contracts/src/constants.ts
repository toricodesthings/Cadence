import type { TaskPriority } from "./task";

export const TASK_PRIORITY_NAMES = ["none", "low", "medium", "high", "urgent"] as const;
export type TaskPriorityName = (typeof TASK_PRIORITY_NAMES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
    0: "None",
    1: "Low",
    2: "Medium",
    3: "High",
    4: "Urgent",
};

export const TAG_PALETTE = [
    "default",
    "#ff7b72",
    "#d2a8ff",
    "#79c0ff",
    "#a5d6ff",
    "#7ee787",
    "#f2cc60",
    "#ff9800",
    "#f472b6",
    "#fb923c",
    "#2dd4bf",
    "#22d3ee",
    "#818cf8",
    "#a3e635",
    "#e879f9",
    "#38bdf8",
] as const;
export type TagPaletteColor = (typeof TAG_PALETTE)[number];

export const TAG_COLOR_NAMES = [
    "default",
    "red",
    "purple",
    "blue",
    "light-blue",
    "green",
    "yellow",
    "orange",
    "rose",
    "coral",
    "teal",
    "cyan",
    "indigo",
    "lime",
    "fuchsia",
    "sky",
] as const satisfies { length: (typeof TAG_PALETTE)["length"] };
export type TagColorName = (typeof TAG_COLOR_NAMES)[number];

export const ACCENT_COLORS = [
    "luminous-amber",
    "moonlit-blue",
    "sapphire",
    "ember-red",
    "forest-green",
    "violet",
    "rose",
    "teal",
    "sky",
    "indigo",
    "fuchsia",
    "emerald",
    "orange",
    "cyan",
] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number];
