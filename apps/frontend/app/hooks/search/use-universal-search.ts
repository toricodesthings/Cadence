import { createSearchIndex, type SearchDocument } from "@cadence/search";
import { noteHeadings } from "@cadence/search/terms";
import { useSearchNotes } from "./use-search-notes";
import { useTags } from "../tags/use-tags";
import { useMemo, useDeferredValue } from "react";
import { useTasks } from "../tasks/use-tasks";
import { useSubtasksByTaskIds } from "../tasks/use-subtasks";
import { useAllHabits } from "../habits/use-habits";
import { useInbox } from "../inbox/use-inbox";
import { useProjects } from "../projects/use-projects";
import { useSections } from "../sections/use-sections";
import { useFocusViewStore } from "../../stores/focus-view-store";
import { getTaskTimelineAnchor, isPassiveTimetableTask } from "../../lib/utils/task/task-scheduling";
import { today as getToday } from "../../lib/utils/user-zone";
import type { Task } from "@cadence/contracts/task";
import type { FocusKind } from "./use-route-focus";

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
    habit: ["/routines"],
    habits: ["/routines"],
    routine: ["/routines"],
    routines: ["/routines"],
    schedule: ["/schedule"],
    calendar: ["/schedule"],
    events: ["/events"],
    event: ["/events"],
    anniversaries: ["/events"],
    birthdays: ["/events"],
    week: ["/weekly-review"],
    weekly: ["/weekly-review"],
    reset: ["/weekly-review"],
    done: ["/completed"],
    completed: ["/completed"],
    trash: ["/trash"],
};

// ── Static pages ──────────────────────────────────────────────────

const STATIC_PAGES: SearchResult[] = [
    { id: "page-capture", kind: "page", focusKind: "section", title: "Capture", context: "Thoughts & tasks with no day", route: "/", score: 0 },
    { id: "page-today", kind: "page", focusKind: "section", title: "Today", context: "Overdue & today's tasks", route: "/today", score: 0 },
    { id: "page-upcoming", kind: "page", focusKind: "section", title: "Upcoming", context: "Tomorrow & next week", route: "/upcoming", score: 0 },
    { id: "page-schedule", kind: "page", focusKind: "section", title: "Schedule", context: "Calendar workspace", route: "/schedule", score: 0 },
    { id: "page-events", kind: "page", focusKind: "section", title: "Events", context: "Yearly milestones & recurring dates", route: "/events", score: 0 },
    { id: "page-habits", kind: "page", focusKind: "section", title: "Routines", context: "Things you keep up", route: "/routines", score: 0 },
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
    effortMin: number | null;
    effortMax: number | null;
    durationMaxMinutes: number | null;
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
    if (definition.needsProject) parts.push("Needs a list");
    if (definition.priorityMin !== null) parts.push(`P${definition.priorityMin}+`);
    if (definition.effortMin !== null) parts.push(`Effort ≥ ${definition.effortMin}`);
    if (definition.effortMax !== null) parts.push(`Effort ≤ ${definition.effortMax}`);
    if (definition.durationMaxMinutes !== null) parts.push(`≤ ${definition.durationMaxMinutes} min`);
    if (definition.missingStructureOnly) parts.push("Missing structure");
    return parts.length > 0 ? parts.join(" · ") : "Saved focus view";
}

// ── Route resolution ──────────────────────────────────────────────

function resolveTaskRoute(task: Task): { route: string; context: string; scope?: string } {
    if (task.state === "COMPLETE") return { route: "/completed", context: "Completed" };
    if (task.state === "ARCHIVED") return { route: "/trash", context: "Trash" };

    if (isPassiveTimetableTask(task)) {
        if (task.projectId) return { route: `/project/${task.projectId}`, context: "List · Schedule anchor" };
        return { route: "/schedule", context: "Schedule anchor" };
    }

    const today = getToday();
    const effectiveDate = getTaskTimelineAnchor(task);

    if (task.projectId) return { route: `/project/${task.projectId}`, context: "List" };
    if (effectiveDate && effectiveDate <= today) return { route: "/today", context: "Today", scope: effectiveDate < today ? "today-overdue" : "today" };
    if (effectiveDate && effectiveDate > today) return { route: "/upcoming", context: "Upcoming" };
    return { route: "/", context: "Capture", scope: "holding-unmanaged" };
}

// ── Main hook ─────────────────────────────────────────────────────

const MAX_RESULTS_PER_GROUP = 8;
const EMPTY_TASKS: Task[] = [];
const EMPTY_SUBTASKS: NonNullable<ReturnType<typeof useSubtasksByTaskIds>["data"]> = {};
const EMPTY_HABITS: NonNullable<ReturnType<typeof useAllHabits>["data"]> = [];
const EMPTY_INBOX: NonNullable<ReturnType<typeof useInbox>["data"]> = [];
const EMPTY_PROJECTS: NonNullable<ReturnType<typeof useProjects>["data"]> = [];
const EMPTY_SECTIONS: NonNullable<ReturnType<typeof useSections>["data"]> = [];
const EMPTY_TAGS: NonNullable<ReturnType<typeof useTags>["data"]> = [];
const EMPTY_NOTES: NonNullable<ReturnType<typeof useSearchNotes>["data"]> = [];


export function useUniversalSearch(rawQuery: string, enabled: boolean) {
    const query = useDeferredValue(rawQuery.trim());

    const { data: tasks = EMPTY_TASKS } = useTasks({ enabled });
    const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
    const { data: subtasksByTaskId = EMPTY_SUBTASKS } = useSubtasksByTaskIds(taskIds);
    const { data: habits = EMPTY_HABITS } = useAllHabits();
    const { data: activeCaptures = EMPTY_INBOX } = useInbox();
    const { data: keptCaptures = EMPTY_INBOX } = useInbox("kept");
    const inboxItems = useMemo(() => [...new Map([...activeCaptures, ...keptCaptures].map(item => [item.id, item])).values()], [activeCaptures, keptCaptures]);
    const { data: projects = EMPTY_PROJECTS } = useProjects();
    const { data: sections = EMPTY_SECTIONS } = useSections();
    const { data: tags = EMPTY_TAGS } = useTags();
    const { data: searchNotes = EMPTY_NOTES } = useSearchNotes(enabled);
    const savedFocusViews = useFocusViewStore((state) => state.savedViews);

    const indexed = useMemo(() => {
        const projectMap = new Map(projects.map((p) => [p.id, p]));
        const sectionMap = new Map(sections.map((section) => [section.id, section.name]));
        const tagMap = new Map(tags.map((tag) => [tag.id, tag.name]));
        const noteMap = new Map(searchNotes.map((note) => [note.taskId, note]));
        const taskMap = new Map(tasks.map((task) => [task.id, task]));
        const documents: SearchDocument[] = [];
        const items = new Map<string, SearchResult>();
        const taskDetails = new Map<string, { id: string; headings: string[]; subtaskTitles: string[]; sectionName?: string }>();
        const add = (result: SearchResult, fields: Omit<SearchDocument, "id" | "title"> = {}, title = result.title) => {
            items.set(result.id, result);
            documents.push({ id: result.id, title, ...fields });
        };
        for (const page of STATIC_PAGES) add(page);
        for (const task of tasks) {
            const { route, context, scope } = resolveTaskRoute(task);
            const owner = task.seriesId ?? task.id;
            const dedicated = noteMap.get(owner);
            const legacy = taskMap.get(owner)?.content ?? task.content ?? "";
            const notes = dedicated ? dedicated.terms.join(" ") : legacy;
            const headings = dedicated?.headings ?? noteHeadings(legacy);
            const subs = subtasksByTaskId[task.id] ?? [];
            const sectionName = task.sectionId ? sectionMap.get(task.sectionId) : undefined;
            add({
                id: `task-${task.id}`, kind: "task", focusKind: "task", title: task.title,
                context, route, focusScope: scope,
                score: task.state === "ACTIVE" ? 5 : task.state === "COMPLETE" || task.state === "ARCHIVED" ? -15 : 0,
            }, {
                notes, list: task.projectId ? projectMap.get(task.projectId)?.name : undefined,
                section: sectionName, subtasks: subs.map((sub) => sub.title).join(" "),
                tags: task.tagIds.map((id) => tagMap.get(id) ?? "").join(" "),
            });
            // Retain the original heading text for navigation; compact note tokens aren't display text.
            taskDetails.set(`task-${task.id}`, { id: task.id, headings, subtaskTitles: subs.map((sub) => sub.title), sectionName });
        }
        for (const habit of habits) add({
            id: `habit-${habit.id}`, kind: "habit", focusKind: "habit", title: habit.title,
            context: habit.archived ? "Routines · Archived" : "Routines", route: "/routines", score: habit.archived ? -10 : 0,
        }, { notes: `${habit.description ?? ""} ${habit.notes ?? ""}` });
        for (const item of inboxItems) {
            if (!["clarifying", "kept"].includes(item.captureStatus)) continue;
            const title = (item.analysis?.userOverrides as { title?: string } | undefined)?.title ?? item.rawText;
            add({ id: `inbox-${item.id}`, kind: "inbox", focusKind: "inbox",
                title: title.length > 80 ? title.slice(0, 80) + "…" : title,
                context: item.captureStatus === "kept" ? "Capture · Note" : "Capture · Thought",
                route: "/", focusScope: "holding-captures", score: 0,
            }, { notes: item.rawText }, title);
        }
        for (const project of projects) add({
            id: `project-${project.id}`, kind: "project", focusKind: "section",
            title: project.emoji ? `${project.emoji} ${project.name}` : project.name,
            context: "List", route: `/project/${project.id}`, score: 0,
        }, {}, project.name);
        for (const view of savedFocusViews) add({
            id: `focus-view-${view.id}`, kind: "focus-view", focusKind: "section", title: view.name,
            context: `${view.isPinned ? "Pinned" : "Saved"} · ${describeFocusView(view.definition)}`,
            route: "/today", focusScope: "focus-view", score: 0,
        }, { notes: `${describeFocusView(view.definition)} ${view.source === "preset" ? "Preset view" : "Custom view"}` });
        return { engine: createSearchIndex(documents), items, taskDetails };
    }, [tasks, subtasksByTaskId, sections, tags, searchNotes, habits, inboxItems, projects, savedFocusViews]);

    const results = useMemo(() => {
        const grouped: Record<"pages" | "tasks" | "habits" | "captures" | "projects" | "focusViews", SearchResult[]> = {
            pages: [], tasks: [], habits: [], captures: [], projects: [], focusViews: [],
        };
        if (!query) return { ...grouped, pages: STATIC_PAGES.slice(0, 5) };
        const keys = { page: "pages", task: "tasks", habit: "habits", inbox: "captures", project: "projects", "focus-view": "focusViews" } as const;
        const hits = indexed.engine.search(query, { prefix: true, fuzzy: true });
        const aliasRoutes = ALIAS_MAP[query.toLowerCase()];
        for (const page of STATIC_PAGES) {
            if (aliasRoutes?.includes(page.route) && !hits.some((hit) => hit.id === page.id)) {
                hits.push({ id: page.id, score: 1085, approximate: false, fields: ["title"] });
            }
        }
        for (const hit of hits) {
            const item = indexed.items.get(hit.id)!;
            const result = { ...item, score: item.score + hit.score };
            grouped[keys[item.kind]].push(result);
        }
        for (const key of Object.keys(grouped) as (keyof typeof grouped)[]) {
            grouped[key] = grouped[key].sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS_PER_GROUP);
        }
        const hitMap = new Map(hits.map((hit) => [hit.id, hit]));
        for (const result of grouped.tasks) {
            const hit = hitMap.get(result.id)!;
            const item = result;
            const detail = indexed.taskDetails.get(result.id);
            if (detail && !hit.fields.includes("title")) {
                if (hit.fields.includes("subtasks")) {
                    const subtask = createSearchIndex(detail.subtaskTitles.map((title, i) => ({ id: String(i), title })))
                        .search(query, { prefix: true, fuzzy: true })[0];
                    result.context += subtask ? ` · Subtask: ${detail.subtaskTitles[Number(subtask.id)]}` : " · Subtask";
                }
                else if (hit.fields.includes("section")) result.context += ` · Section: ${detail.sectionName}`;
                else if (hit.fields.includes("notes")) {
                    const heading = detail.headings.length ? createSearchIndex(detail.headings.map((title, i) => ({ id: String(i), title })))
                        .search(query, { prefix: true, fuzzy: true })[0] : undefined;
                    const matchedHeading = heading ? detail.headings[Number(heading.id)] : undefined;
                    result.context += matchedHeading ? ` · Heading: ${matchedHeading}` : " · Notes";
                    result.noteAction = { taskId: detail.id, taskTitle: item.title, ...(matchedHeading && { scrollToHeading: matchedHeading }) };
                } else if (hit.fields.includes("tags")) result.context += " · Tag";
            }
        }
        return grouped;
    }, [query, indexed]);

    const allResults = useMemo(() => Object.values(results).flat().sort((a, b) => b.score - a.score), [results]);
    return { results, allResults, query };
}
