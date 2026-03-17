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

interface ParseQuickAddInputOptions {
    input: string;
    projects: Project[];
    tags: Tag[];
    ignoredTokenIds?: string[];
}

const DATE_PATTERNS = [
    { matcher: /\btoday\b/i, label: "Today", resolve: () => new Date() },
    { matcher: /\btomorrow\b/i, label: "Tomorrow", resolve: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
    { matcher: /\bnext week\b/i, label: "Next week", resolve: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
] as const;

const RECURRENCE_BY_DAY: Record<string, string> = {
    monday: "MO",
    tuesday: "TU",
    wednesday: "WE",
    thursday: "TH",
    friday: "FR",
    saturday: "SA",
    sunday: "SU",
};

const PRIORITY_BY_TOKEN: Record<string, TaskPriority> = {
    p1: 4,
    p2: 3,
    p3: 2,
    p4: 1,
};

function toDateOnly(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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

export function parseQuickAddInput({
    input,
    projects,
    tags,
    ignoredTokenIds = [],
}: ParseQuickAddInputOptions): QuickAddParseResult {
    let workingTitle = input;
    const ignored = new Set(ignoredTokenIds);
    const tokens: QuickAddParsedToken[] = [];
    let dueDate: string | null = null;
    let recurrenceRule: string | null = null;
    let priority: TaskPriority | null = null;
    let projectId: string | null = null;
    const tagIds = new Set<string>();

    for (const pattern of DATE_PATTERNS) {
        const match = workingTitle.match(pattern.matcher);
        if (!match) continue;
        const tokenId = `date:${match[0].toLowerCase()}`;
        if (ignored.has(tokenId)) continue;
        dueDate = toDateOnly(pattern.resolve());
        tokens.push({ id: tokenId, kind: "date", label: pattern.label, raw: match[0] });
        workingTitle = workingTitle.replace(match[0], " ");
        break;
    }

    const recurrenceMatch = workingTitle.match(/\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (recurrenceMatch) {
        const day = recurrenceMatch[1].toLowerCase();
        const tokenId = `recurrence:${day}`;
        if (!ignored.has(tokenId)) {
            recurrenceRule = `FREQ=WEEKLY;BYDAY=${RECURRENCE_BY_DAY[day]}`;
            tokens.push({
                id: tokenId,
                kind: "recurrence",
                label: `Every ${day[0].toUpperCase()}${day.slice(1)}`,
                raw: recurrenceMatch[0],
            });
            workingTitle = workingTitle.replace(recurrenceMatch[0], " ");
        }
    }

    const priorityMatch = workingTitle.match(/\bp[1-4]\b/i);
    if (priorityMatch) {
        const key = priorityMatch[0].toLowerCase();
        const tokenId = `priority:${key}`;
        if (!ignored.has(tokenId)) {
            priority = PRIORITY_BY_TOKEN[key];
            tokens.push({ id: tokenId, kind: "priority", label: key.toUpperCase(), raw: priorityMatch[0] });
            workingTitle = workingTitle.replace(priorityMatch[0], " ");
        }
    }

    for (const match of workingTitle.matchAll(/(^|\s)#([\p{L}\p{N}_-]+)/giu)) {
        const rawName = match[2];
        const tag = tags.find((item) => item.name.toLowerCase() === rawName.toLowerCase());
        if (!tag) continue;
        const tokenId = `tag:${tag.id}`;
        if (ignored.has(tokenId)) continue;
        tagIds.add(tag.id);
        tokens.push({ id: tokenId, kind: "tag", label: `#${tag.name}`, raw: match[0] });
        workingTitle = workingTitle.replace(match[0], " ");
    }

    for (const match of workingTitle.matchAll(/(^|\s)\/([\p{L}\p{N}_-]+)/giu)) {
        const rawName = match[2];
        const project = projects.find((item) => item.name.toLowerCase().replace(/\s+/g, "-") === rawName.toLowerCase());
        if (!project) continue;
        const tokenId = `project:${project.id}`;
        if (ignored.has(tokenId)) continue;
        projectId = project.id;
        tokens.push({ id: tokenId, kind: "project", label: `/${project.name}`, raw: match[0] });
        workingTitle = workingTitle.replace(match[0], " ");
        break;
    }

    const cleanedTitle = workingTitle.replace(/\s+/g, " ").trim();

    return {
        cleanedTitle,
        dueDate,
        recurrenceRule,
        priority,
        projectId,
        tagIds: Array.from(tagIds),
        tokens,
    };
}
