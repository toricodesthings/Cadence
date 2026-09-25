import type { TaskPriority } from "@cadence/contracts/task";
import { TASK_PRIORITY_LABELS } from "@cadence/contracts/constants";

// Presentation-only layer (Tailwind classes; icons live in task-choice-options). The semantic
// `label` is single-sourced from @cadence/contracts/constants.
const PRIORITY_PRESENTATION: Record<
    TaskPriority,
    { color: string; barColor: string }
> = {
    0: { color: "text-twilight-text-muted/40", barColor: "" },
    1: {
        color: "text-[var(--color-priority-low)]",
        barColor: "bg-[var(--color-priority-low)]",
    },
    2: {
        color: "text-[var(--color-priority-medium)]",
        barColor: "bg-[var(--color-priority-medium)]",
    },
    3: {
        color: "text-[var(--color-priority-high)]",
        barColor: "bg-[var(--color-priority-high)]",
    },
    4: {
        color: "text-[var(--color-priority-urgent)]",
        barColor: "bg-[var(--color-priority-urgent)] priority-urgent-bar",
    },
};

export const PRIORITY_CONFIG: Record<
    TaskPriority,
    {
        label: string;
        color: string; // Tailwind text class using CSS var
        barColor: string; // Tailwind bg class using CSS var for priority bar
    }
> = {
    0: { label: TASK_PRIORITY_LABELS[0], ...PRIORITY_PRESENTATION[0] },
    1: { label: TASK_PRIORITY_LABELS[1], ...PRIORITY_PRESENTATION[1] },
    2: { label: TASK_PRIORITY_LABELS[2], ...PRIORITY_PRESENTATION[2] },
    3: { label: TASK_PRIORITY_LABELS[3], ...PRIORITY_PRESENTATION[3] },
    4: { label: TASK_PRIORITY_LABELS[4], ...PRIORITY_PRESENTATION[4] },
};
