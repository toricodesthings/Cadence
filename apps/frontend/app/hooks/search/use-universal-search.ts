import { useMemo, useDeferredValue } from "react";
import { useTasks } from "../tasks/use-tasks";
import { useSubtasksByTaskIds } from "../tasks";
import { useAllHabits } from "../habits/use-habits";
import { useInbox } from "../inbox";
import { useProjects } from "../projects";
import { useSections } from "../sections";
import { useFocusViewStore } from "../../stores/focus-view-store";
import { getTaskTimelineAnchor, isPassiveTimetableTask } from "../../lib/utils/task/task-scheduling";
import type { FocusKind } from "./use-route-focus";

/** Type-safe null filter */
function nonNull<T>(value: T | null | undefined): value is T {
    return value != null;
}

// ── Result model ──────────────────────────────────────────────────

export type SearchResultKind = "task" | "habit" | "inbox" | "project" | "focus-view" | "page";

export interface SearchResult {
    id: string;
    kind: SearchResultKind;
    focusKind: FocusKind;
    title: string;
    context?: string;
    route: string;
    focusScope?: string;
    score: number;
    /** If set, opening this result should open the note room instead of navigating */
    noteAction?: {
        taskId: string;
        taskTitle: string;
        scrollToHeading?: string;
    };
}

// ── Route aliases ─────────────────────────────────────────────────

const ALIAS_MAP: Record<string, string[]> = {
    holding: ["/"],
    capture: ["/"],
    thought: ["/"],
    today: ["/today"],
    upcoming: ["/upcoming"],
    habit: ["/habits"],
    habits: ["/habits"],
    schedule: ["/schedule"],
    calendar: ["/schedule"],
    week: ["/weekly-review"],
    weekly: ["/weekly-review"],
    reset: ["/weekly-review"],
    done: ["/completed"],
    completed: ["/completed"],
    trash: ["/trash"],
};

// ── Static pages ──────────────────────────────────────────────────

const STATIC_PAGES: SearchResult[] = [
    { id: "page-capture", kind: "page", focusKind: "section", title: "Capture", context: "Inbox & captured work", route: "/", score: 0 },
    { id: "page-today", kind: "page", focusKind: "section", title: "Today", context: "Overdue & today's tasks", route: "/today", score: 0 },
    { id: "page-upcoming", kind: "page", focusKind: "section", title: "Upcoming", context: "Tomorrow & next week", route: "/upcoming", score: 0 },
    { id: "page-schedule", kind: "page", focusKind: "section", title: "Schedule", context: "Calendar workspace", route: "/schedule", score: 0 },
    { id: "page-habits", kind: "page", focusKind: "section", title: "Habits", context: "Track daily & weekly habits", route: "/habits", score: 0 },
    { id: "page-weekly", kind: "page", focusKind: "section", title: "Weekly Reset", context: "Weekly review ritual", route: "/weekly-review", score: 0 },
    { id: "page-completed", kind: "page", focusKind: "section", title: "Completed", context: "Finished work", route: "/completed", score: 0 },
    { id: "page-trash", kind: "page", focusKind: "section", title: "Trash", context: "Archived tasks", route: "/trash", score: 0 },
];

function describeFocusView(definition: {
    states: string[];
    projectIds: string[];
    tagIds: string[];
    needsDate: boolean;
    needsProject: boolean;
    priorityMin: number | null;
    effortMax: number | null;
    dueWindow: "overdue" | "today" | "this_week" | "this_month" | null;
    waitingOnly: boolean;
    missingStructureOnly: boolean;
}): string {
    const parts: string[] = [];
    if (definition.dueWindow) {
        parts.push(
            definition.dueWindow === "this_week"
                ? "This week"
                : definition.dueWindow === "this_month"
                    ? "This month"
                    : definition.dueWindow === "overdue"
                        ? "Overdue"
                        : "Today",
        );
    }
    if (definition.waitingOnly) parts.push("Waiting");
    if (definition.needsDate) parts.push("Needs a date");
    if (definition.needsProject) parts.push("Needs a project");
    if (definition.priorityMin !== null) parts.push(`P${definition.priorityMin}+`);
    if (definition.effortMax !== null) parts.push(`Effort ≤ ${definition.effortMax}`);
    if (definition.missingStructureOnly) parts.push("Missing structure");
    return parts.length > 0 ? parts.join(" · ") : "Saved focus view";
}

// ── Scoring ───────────────────────────────────────────────────────

function scoreMatch(query: string, target: string): number {
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    if (t === q) return 100;
    if (t.startsWith(q)) return 90;
    const words = t.split(/\s+/);
    if (words.some(w => w === q)) return 80;
    if (words.some(w => w.startsWith(q))) return 70;
    if (t.includes(q)) return 60;
    return 0;
}

function scoreItem(query: string, fields: { title: string; meta?: string[] }): number {
    const titleScore = scoreMatch(query, fields.title);
    if (titleScore > 0) return titleScore;
    for (const m of fields.meta ?? []) {
        const metaScore = scoreMatch(query, m);
        if (metaScore > 0) return Math.max(metaScore - 20, 10);
    }
    return 0;
}

function extractMarkdownHeadings(input: string | null | undefined) {
    if (!input) return [];
    return input
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^#{1,6}\s+/.test(line))
        .map((line) => line.replace(/^#{1,6}\s+/, "").trim())
        .filter(Boolean);
}

// ── Route resolution ──────────────────────────────────────────────

function resolveTaskRoute(task: {
    state: string;
    projectId: string | null;
    dueDate: string | null;
    scheduledStart: string | null;
    interactionMode: "task" | "timetable";
    recurrenceRule: string | null;
    scheduledEnd: string | null;
    isAllDay: boolean;
}): { route: string; context: string; scope?: string } {
    if (task.state === "COMPLETE") return { route: "/completed", context: "Completed" };
    if (task.state === "ARCHIVED") return { route: "/trash", context: "Trash" };

    if (isPassiveTimetableTask(task)) {
        if (task.projectId) return { route: `/project/${task.projectId}`, context: "Project · Schedule anchor" };
        return { route: "/schedule", context: "Schedule anchor" };
    }

    const today = new Date().toISOString().split("T")[0];
    const effectiveDate = getTaskTimelineAnchor(task) ?? task.dueDate ?? task.scheduledStart;

    if (task.projectId) return { route: `/project/${task.projectId}`, context: "Project" };
    if (effectiveDate && effectiveDate <= today) return { route: "/today", context: "Today", scope: effectiveDate < today ? "today-overdue" : "today" };
    if (effectiveDate && effectiveDate > today) return { route: "/upcoming", context: "Upcoming" };
    return { route: "/", context: "Capture", scope: "holding-unmanaged" };
}

// ── Main hook ─────────────────────────────────────────────────────

const MAX_RESULTS_PER_GROUP = 8;

export function useUniversalSearch(rawQuery: string, enabled: boolean) {
    const query = useDeferredValue(rawQuery.trim());

    const { data: tasks = [] } = useTasks({ enabled });
    const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
    const { data: subtasksByTaskId = {} } = useSubtasksByTaskIds(taskIds);
    const { data: habits = [] } = useAllHabits();
    const { data: inboxItems = [] } = useInbox();
    const { data: projects = [] } = useProjects();
    const { data: sections = [] } = useSections();
    const savedFocusViews = useFocusViewStore((state) => state.savedViews);

    const projectMap = useMemo(() => {
        const map = new Map<string, { name: string; emoji: string | null }>();
        for (const p of projects) map.set(p.id, { name: p.name, emoji: p.emoji });
        return map;
    }, [projects]);

    const results = useMemo(() => {
        if (!query) return { pages: STATIC_PAGES.slice(0, 5), tasks: [], habits: [], captures: [], projects: [], focusViews: [] };

        const q = query.toLowerCase();

        // Check alias map
        const aliasRoutes = ALIAS_MAP[q];

        // Score pages
        const pageResults: SearchResult[] = STATIC_PAGES
            .map(p => {
                let s = scoreMatch(query, p.title);
                if (aliasRoutes?.includes(p.route)) s = Math.max(s, 85);
                return { ...p, score: s };
            })
            .filter(p => p.score > 0)
            .sort((a, b) => b.score - a.score);

        // Score tasks
        const taskResults = tasks
            .map(t => {
                const proj = t.projectId ? projectMap.get(t.projectId) : null;
                const matchedSubtasks = subtasksByTaskId[t.id] ?? [];
                const sectionName = t.sectionId ? sections.find((section) => section.id === t.sectionId)?.name : null;
                const headings = extractMarkdownHeadings(t.content);
                const meta = [
                    t.content ?? "",
                    proj?.name ?? "",
                    sectionName ?? "",
                    ...headings,
                    ...matchedSubtasks.map((subtask) => subtask.title),
                ].filter(Boolean);
                const s = scoreItem(query, { title: t.title, meta });
                if (s === 0) return null;
                const { route, context, scope } = resolveTaskRoute(t);
                const matchedHeading = headings.find((heading) => scoreMatch(query, heading) > 0);
                const matchedSubtask = matchedSubtasks.find((subtask) => scoreMatch(query, subtask.title) > 0);
                const matchedInNotes = scoreMatch(query, t.content ?? "") > 0;
                const matchedSection = sectionName && scoreMatch(query, sectionName) > 0 ? sectionName : null;
                // Boost active, penalize completed/archived
                let adjusted = s;
                if (t.state === "ACTIVE") adjusted += 5;
                if (t.state === "COMPLETE" || t.state === "ARCHIVED") adjusted -= 15;
                return {
                    id: `task-${t.id}`,
                    kind: "task" as const,
                    focusKind: "task" as const,
                    title: t.title,
                    context:
                        matchedSubtask
                            ? `${context} · Subtask: ${matchedSubtask.title}`
                            : matchedHeading
                                ? `${context} · Heading: ${matchedHeading}`
                                : matchedSection
                                    ? `${context} · Section: ${matchedSection}`
                                    : matchedInNotes
                                        ? `${context} · Notes`
                                        : context,
                    route,
                    focusScope: scope,
                    score: adjusted,
                    // When match is in heading or notes, allow opening into note room
                    noteAction: matchedHeading
                        ? { taskId: t.id, taskTitle: t.title, scrollToHeading: matchedHeading }
                        : matchedInNotes
                            ? { taskId: t.id, taskTitle: t.title }
                            : undefined,
                } satisfies SearchResult;
            })
            .filter(nonNull)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_RESULTS_PER_GROUP);

        // Score habits
        const habitResults = habits
            .map(h => {
                const s = scoreItem(query, { title: h.title, meta: [h.description ?? "", h.notes ?? ""].filter(Boolean) });
                if (s === 0) return null;
                return {
                    id: `habit-${h.id}`,
                    kind: "habit" as const,
                    focusKind: "habit" as const,
                    title: h.title,
                    context: h.archived ? "Habits · Archived" : "Habits",
                    route: "/habits",
                    score: h.archived ? s - 10 : s,
                } satisfies SearchResult;
            })
            .filter(nonNull)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_RESULTS_PER_GROUP);

        // Score captures
        const captureResults = inboxItems
            .map(item => {
                const s = scoreMatch(query, item.rawText);
                if (s === 0) return null;
                return {
                    id: `inbox-${item.id}`,
                    kind: "inbox" as const,
                    focusKind: "inbox" as const,
                    title: item.rawText.length > 80 ? item.rawText.slice(0, 80) + "…" : item.rawText,
                    context: "Holding · Needs processing",
                    route: "/",
                    focusScope: "holding-captures",
                    score: s,
                } satisfies SearchResult;
            })
            .filter(nonNull)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_RESULTS_PER_GROUP);

        // Score projects
        const projectResults = projects
            .map(p => {
                const s = scoreItem(query, { title: p.name, meta: [p.emoji ?? ""].filter(Boolean) });
                if (s === 0) return null;
                return {
                    id: `project-${p.id}`,
                    kind: "project" as const,
                    focusKind: "section" as const,
                    title: p.emoji ? `${p.emoji} ${p.name}` : p.name,
                    context: "Project",
                    route: `/project/${p.id}`,
                    score: s,
                } satisfies SearchResult;
            })
            .filter(nonNull)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_RESULTS_PER_GROUP);

        const focusViewResults = savedFocusViews
            .map((view) => {
                const score = scoreItem(query, {
                    title: view.name,
                    meta: [describeFocusView(view.definition), view.source === "preset" ? "Preset view" : "Custom view"],
                });
                if (score === 0) return null;
                return {
                    id: `focus-view-${view.id}`,
                    kind: "focus-view" as const,
                    focusKind: "section" as const,
                    title: view.name,
                    context: `${view.isPinned ? "Pinned" : "Saved"} · ${describeFocusView(view.definition)}`,
                    route: "/today",
                    focusScope: "focus-view",
                    score,
                } satisfies SearchResult;
            })
            .filter(nonNull)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_RESULTS_PER_GROUP);

        return { pages: pageResults, tasks: taskResults, habits: habitResults, captures: captureResults, projects: projectResults, focusViews: focusViewResults };
    }, [query, tasks, subtasksByTaskId, sections, habits, inboxItems, projects, projectMap, savedFocusViews]);

    const allResults = useMemo(() => {
        const all = [
            ...results.tasks,
            ...results.habits,
            ...results.captures,
            ...results.projects,
            ...results.focusViews,
            ...results.pages,
        ];
        return all.sort((a, b) => b.score - a.score);
    }, [results]);

    return { results, allResults, query };
}
