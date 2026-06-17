import type { TaskPriority } from "@cadence/contracts/task";
import { TASK_PRIORITY_LABELS, TASK_PRIORITY_SORT_WEIGHT } from "@cadence/contracts/constants";

// Presentation-only layer (Tailwind classes + Lucide icon names). The semantic
// `label` / `sortWeight` are single-sourced from @cadence/contracts/constants.
const PRIORITY_PRESENTATION: Record<
    TaskPriority,
    { icon: string; color: string; barColor: string }
> = {
    0: { icon: "Minus", color: "text-twilight-text-muted/40", barColor: "" },
    1: {
        icon: "ArrowDown",
        color: "text-[var(--color-priority-low)]",
        barColor: "bg-[var(--color-priority-low)]",
    },
    2: {
        icon: "ArrowRight",
        color: "text-[var(--color-priority-medium)]",
        barColor: "bg-[var(--color-priority-medium)]",
    },
    3: {
        icon: "ArrowUp",
        color: "text-[var(--color-priority-high)]",
        barColor: "bg-[var(--color-priority-high)]",
    },
    4: {
        icon: "AlertTriangle",
        color: "text-[var(--color-priority-urgent)]",
        barColor: "bg-[var(--color-priority-urgent)] priority-urgent-bar",
    },
};

export const PRIORITY_CONFIG: Record<
    TaskPriority,
    {
        label: string;
        icon: string; // Lucide icon name
        color: string; // Tailwind text class using CSS var
        barColor: string; // Tailwind bg class using CSS var for priority bar
        sortWeight: number; // Higher = sorted to top
    }
> = {
    0: { label: TASK_PRIORITY_LABELS[0], sortWeight: TASK_PRIORITY_SORT_WEIGHT[0], ...PRIORITY_PRESENTATION[0] },
    1: { label: TASK_PRIORITY_LABELS[1], sortWeight: TASK_PRIORITY_SORT_WEIGHT[1], ...PRIORITY_PRESENTATION[1] },
    2: { label: TASK_PRIORITY_LABELS[2], sortWeight: TASK_PRIORITY_SORT_WEIGHT[2], ...PRIORITY_PRESENTATION[2] },
    3: { label: TASK_PRIORITY_LABELS[3], sortWeight: TASK_PRIORITY_SORT_WEIGHT[3], ...PRIORITY_PRESENTATION[3] },
    4: { label: TASK_PRIORITY_LABELS[4], sortWeight: TASK_PRIORITY_SORT_WEIGHT[4], ...PRIORITY_PRESENTATION[4] },
};

export function getPriorityConfig(priority: TaskPriority) {
    return PRIORITY_CONFIG[priority];
}
