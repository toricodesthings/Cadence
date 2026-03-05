import type { TaskPriority } from "../../types/task";

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
    0: {
        label: "None",
        icon: "Minus",
        color: "text-twilight-text-muted/40",
        barColor: "",
        sortWeight: 0,
    },
    1: {
        label: "Low",
        icon: "ArrowDown",
        color: "text-[var(--color-priority-low)]",
        barColor: "bg-[var(--color-priority-low)]",
        sortWeight: 1,
    },
    2: {
        label: "Medium",
        icon: "ArrowRight",
        color: "text-[var(--color-priority-medium)]",
        barColor: "bg-[var(--color-priority-medium)]",
        sortWeight: 2,
    },
    3: {
        label: "High",
        icon: "ArrowUp",
        color: "text-[var(--color-priority-high)]",
        barColor: "bg-[var(--color-priority-high)]",
        sortWeight: 3,
    },
    4: {
        label: "Urgent",
        icon: "AlertTriangle",
        color: "text-[var(--color-priority-urgent)]",
        barColor: "bg-[var(--color-priority-urgent)] priority-urgent-bar",
        sortWeight: 4,
    },
};

export function getPriorityConfig(priority: TaskPriority) {
    return PRIORITY_CONFIG[priority];
}
