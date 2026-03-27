import type { TaskPriority } from "../../types/task";
import type { Project } from "../../types/project";
import type { Tag } from "../../types/tag";

export type QuickAddTokenKind = "date" | "priority" | "project" | "tag" | "recurrence";

export interface QuickAddParsedToken {
    id: string;
    kind: QuickAddTokenKind;
    label: string;
    raw: string;
}

export interface QuickAddParseResult {
    cleanedTitle: string;
    dueDate: string | null;
    recurrenceRule: string | null;
    priority: TaskPriority | null;
    projectId: string | null;
    tagIds: string[];
    tokens: QuickAddParsedToken[];
}

export function resolveQuickAddActions(
    quickAdd: {
        preset?: "minimal" | "planner" | "power";
        actions?: Array<"date" | "priority" | "project" | "tag">;
    } | null | undefined,
) {
    const preset = quickAdd?.preset ?? "planner";
    const presetActions: Record<typeof preset, Array<"date" | "priority" | "project" | "tag">> = {
        minimal: ["date"],
        planner: ["date", "priority", "project"],
        power: ["date", "priority", "project", "tag"],
    };

    if (quickAdd?.actions?.length) {
        return quickAdd.actions;
    }

    return presetActions[preset];
}
