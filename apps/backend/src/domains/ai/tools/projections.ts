import type { HabitRow as HabitRecord } from "@cadence/contracts/habit";
import type { InboxItemRow as InboxItemRecord } from "@cadence/contracts/inbox";
import type { ProjectRow as ProjectRecord } from "@cadence/contracts/project";
import type { SubtaskRow as SubtaskRecord } from "@cadence/contracts/subtask";
import type { TagRow as TagRecord } from "@cadence/contracts/tag";
import type { TaskRow as TaskRecord } from "@cadence/contracts/task";
import { isPausedOn } from "@cadence/domain/repeats";
import { addDays, monthRange, toZonedIso, weekRange, type WeekStart } from "@cadence/domain/time";
import { NOTE_READ_LIMIT } from "./drafts";
import { TAG_COLOR_NAMES, TAG_PALETTE } from "@cadence/contracts/constants";

export interface MinimalTask {
    id: string;
    title: string;
    state?: string;
    dueDate?: string;
    endDate?: string;
    scheduledStart?: string;
    scheduledEnd?: string;
    durationEstimate?: number;
    priority?: number;
    effort?: number;
    projectId?: string;
    sectionId?: string;
    list?: string;
    section?: string;
    waitingOn?: string;
    fixedBlock?: true;
    repeats?: true;
    tags?: string[];
    pinned?: true;
    reminderAt?: string;
    checkInAt?: string;
    hiddenUntil?: string;
    takesAbout?: number;
    effortGuess?: "low" | "medium" | "high";
    took?: number | string;
    shared?: true;
    createdBy?: string;
    takenBy?: string;
    updatedAt?: string;
}

export type TaskRow = Pick<
    TaskRecord,
    | "id"
    | "title"
    | "state"
    | "dueDate"
    | "scheduledStart"
    | "scheduledEnd"
    | "durationEstimate"
    | "priority"
    | "effort"
    | "projectId"
    | "waitingOn"
    | "interactionMode"
    | "recurrenceRule"
> &
    Partial<
        Pick<
            TaskRecord,
            "endDate" | "sectionId" | "content" | "isPinned" | "reminderAt" | "waitingReminder" | "notBefore"
        >
    > & {
        seriesId?: string;
        tagNames?: string[];
        listName?: string | null;
        sectionName?: string | null;
        shared?: boolean;
        createdByName?: string | null;
        takenByName?: string | null;
        updatedAt?: Date | string | null;
    };

const EFFORT_WORDS = { 1: "low", 2: "medium", 3: "high" } as const;

const unset = <T>(value: T | null | undefined): T | undefined => value ?? undefined;
const nonEmpty = <T>(list: T[] | null | undefined): T[] | undefined => (list?.length ? list : undefined);

export function toMinimalTask(
    row: TaskRow,
    timezone: string,
    hint?: { takesAbout?: number; took?: number | string; effortGuess?: 1 | 2 | 3 },
): MinimalTask {
    const show = (value: string | null | undefined) => (value ? toZonedIso(value, timezone) : undefined);
    const fixedBlock = row.interactionMode === "timetable";
    return {
        id: row.seriesId ?? row.id,
        title: row.title,
        state: fixedBlock && row.state === "ACTIVE" ? undefined : row.state,
        dueDate: row.recurrenceRule && row.scheduledStart ? undefined : unset(row.dueDate),
        endDate: unset(row.endDate),
        scheduledStart: show(row.scheduledStart),
        scheduledEnd: show(row.scheduledEnd),
        durationEstimate: unset(row.durationEstimate),
        priority: row.priority || undefined,
        effort: unset(row.effort),
        projectId: unset(row.projectId),
        sectionId: unset(row.sectionId),
        list: unset(row.listName),
        section: unset(row.sectionName),
        waitingOn: unset(row.waitingOn),
        fixedBlock: fixedBlock || undefined,
        repeats: !!row.recurrenceRule || undefined,
        tags: nonEmpty(row.tagNames),
        pinned: row.isPinned || undefined,
        reminderAt: show(row.reminderAt),
        checkInAt: show(row.waitingReminder),
        hiddenUntil: unset(row.notBefore),
        takesAbout: hint?.takesAbout,
        took: hint?.took,
        effortGuess: hint?.effortGuess && EFFORT_WORDS[hint.effortGuess],
        shared: row.shared || undefined,
        createdBy: unset(row.createdByName),
        takenBy: unset(row.takenByName),
        updatedAt:
            row.shared && row.updatedAt
                ? typeof row.updatedAt === "string"
                    ? row.updatedAt
                    : row.updatedAt.toISOString()
                : undefined,
    };
}

export type MinimalSubtask = Pick<SubtaskRecord, "id" | "title" | "isComplete">;

export function toMinimalSubtask(row: MinimalSubtask): MinimalSubtask {
    return { id: row.id, title: row.title, isComplete: row.isComplete };
}

export type MinimalTag = Pick<TagRecord, "id" | "name" | "color">;

export function toMinimalTag(row: MinimalTag): MinimalTag {
    const palette = TAG_PALETTE.indexOf(row.color as (typeof TAG_PALETTE)[number]);
    return { id: row.id, name: row.name, color: palette >= 0 ? TAG_COLOR_NAMES[palette]! : row.color };
}

export type ProjectRow = Pick<ProjectRecord, "id" | "name" | "emoji" | "colorAccent">;

export type MinimalProject = ProjectRow & {
    openTasks?: number;
    sections: { id: string; name: string; openTasks?: number }[];
    shared?: { role: "owner" | "edit" | "view"; people: { name: string | null; role: "owner" | "edit" | "view" }[] };
};

export function toMinimalProject(
    row: ProjectRow,
    sections: { id: string; name: string; projectId: string | null }[] = [],
    counts?: Map<string, number>,
    shared?: MinimalProject["shared"],
): MinimalProject {
    const open = (key: string) => (counts ? { openTasks: counts.get(key) ?? 0 } : {});
    return {
        id: row.id,
        name: row.name,
        emoji: row.emoji,
        colorAccent: row.colorAccent,
        ...open(row.id),
        ...(shared && { shared }),
        sections: sections
            .filter((s) => s.projectId === row.id)
            .map(({ id, name }) => ({ id, name, ...open(`${row.id}|${id}`) })),
    };
}

export interface MinimalHabit {
    id: string;
    title: string;
    emoji?: string;
    recurrenceRule: string;
    targetTime?: string;
    dayTimes?: Record<string, string>;
    colorAccent?: string;
    projectId?: string;
    tagIds?: string[];
    steps?: { id: string; title: string }[];
    times?: string[];
    currentStreak: number;
    longestStreak: number;
    adherence?: number;
    missedLast30?: number;
    archived: boolean;
    paused: boolean;
}

export type HabitRow = Pick<
    HabitRecord,
    "id" | "title" | "recurrenceRule" | "currentStreak" | "longestStreak" | "archived" | "pausedUntil"
> &
    Partial<
        Pick<HabitRecord, "emoji" | "targetTime" | "steps" | "targetTimes" | "times" | "colorAccent" | "projectId">
    > & { tagIds?: string[] };

export function toMinimalHabit(
    row: HabitRow,
    currentDate: string,
    recent?: { done: number; missed: number },
): MinimalHabit {
    const counted = recent ? recent.done + recent.missed : 0;
    const paused = isPausedOn(row.pausedUntil, currentDate, currentDate);
    const times = nonEmpty(row.times);
    return {
        id: row.id,
        title: row.title,
        emoji: unset(row.emoji),
        recurrenceRule: row.recurrenceRule,
        targetTime: times ? undefined : row.targetTime || undefined,
        dayTimes: !times && row.targetTimes && Object.keys(row.targetTimes).length ? row.targetTimes : undefined,
        times,
        colorAccent: row.colorAccent && row.colorAccent !== "lantern" ? row.colorAccent : undefined,
        projectId: unset(row.projectId),
        tagIds: nonEmpty(row.tagIds),
        steps: nonEmpty(row.steps)?.map(({ id, title }) => ({ id, title })),
        currentStreak: row.currentStreak,
        longestStreak: row.longestStreak,
        adherence: counted ? Math.round((recent!.done / counted) * 100) / 100 : undefined,
        missedLast30: recent?.missed || undefined,
        archived: row.archived,
        paused,
    };
}

export type InboxItemRow = Pick<InboxItemRecord, "id" | "rawText" | "captureKind" | "captureStatus" | "processed"> &
    Partial<Pick<InboxItemRecord, "placedTaskId">>;

export type MinimalInboxItem = Omit<InboxItemRow, "placedTaskId"> & {
    isNote: boolean;
    truncated?: true;
    taskId?: string;
};

export function toMinimalInboxItem(row: InboxItemRow): MinimalInboxItem {
    return {
        isNote: row.captureStatus === "kept",
        id: row.id,
        rawText: row.rawText.slice(0, NOTE_READ_LIMIT),
        ...(row.rawText.length > NOTE_READ_LIMIT && { truncated: true as const }),
        captureKind: row.captureKind,
        captureStatus: row.captureStatus,
        processed: row.processed,
        taskId: row.placedTaskId ?? undefined,
    };
}

export function resolveDueWindow(
    window: "overdue" | "today" | "this_week" | "this_month",
    today: string,
    weekStartsOn: WeekStart = "Sunday",
): { from?: string; to: string } {
    if (window === "overdue") return { to: addDays(today, -1) };
    if (window === "today") return { from: today, to: today };
    const { start, end } = window === "this_week" ? weekRange(today, weekStartsOn) : monthRange(today);
    return { from: start, to: end };
}
