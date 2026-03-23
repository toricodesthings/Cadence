import { describe, expect, it } from "vitest";
import {
    createSeedHabit,
    createSeedInboxItem,
    createSeedProject,
    createSeedTask,
    createSeedTaskNote,
    createSeedNlpMetadata,
    createSeedSavedFocusView,
    seedDate,
    seedDateTime,
} from "../../src/domains/debug/debug-seed";
import { getTaskEffectiveAnchor, getTaskScheduleKind } from "../../../frontend/app/lib/utils/task/task-scheduling";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ANCHOR = new Date(Date.UTC(2026, 2, 9, 12, 0, 0, 0));

describe("debug seed helpers", () => {
    it("builds canonical all-day deadline tasks for frontend deadline views", () => {
        const task = createSeedTask(USER_ID, {
            title: "Call landlord about hallway leak",
            state: "ACTIVE",
            orderIndex: 2,
            isAllDay: true,
            dueDate: seedDate(ANCHOR, 0),
            priority: 4,
            isPinned: true,
            reminderAt: seedDateTime(ANCHOR, 0, 16, 0),
            effort: 1,
        });

        expect(task.dueDate).toBe("2026-03-09T12:00:00.000Z");
        expect(task.scheduledStart).toBeNull();
        expect(task.scheduledEnd).toBeNull();
        expect(getTaskScheduleKind(task)).toBe("deadline");
        expect(getTaskEffectiveAnchor(task)).toBe("2026-03-09");
    });

    it("builds canonical all-day duration tasks for frontend schedule spans", () => {
        const task = createSeedTask(USER_ID, {
            title: "Stage weekend reset window",
            state: "ACTIVE",
            orderIndex: 7,
            isAllDay: true,
            dueDate: seedDate(ANCHOR, 2),
            scheduledEnd: seedDate(ANCHOR, 3),
            priority: 1,
            effort: 2,
        });

        expect(task.dueDate).toBe("2026-03-11T12:00:00.000Z");
        expect(task.scheduledStart).toBeNull();
        expect(task.scheduledEnd).toBe("2026-03-12T23:59:59.999Z");
        expect(getTaskScheduleKind(task)).toBe("duration");
        expect(getTaskEffectiveAnchor(task)).toBe("2026-03-11");
    });

    it("builds canonical timed tasks for frontend calendar blocks", () => {
        const task = createSeedTask(USER_ID, {
            title: "Draft launch announcement",
            state: "ACTIVE",
            orderIndex: 1,
            isAllDay: false,
            scheduledStart: seedDateTime(ANCHOR, 0, 14, 0),
            scheduledEnd: seedDateTime(ANCHOR, 0, 15, 30),
            durationEstimate: 90,
            priority: 3,
            isPinned: true,
            reminderAt: seedDateTime(ANCHOR, 0, 13, 30),
            effort: 2,
        });

        expect(task.dueDate).toBeNull();
        expect(task.scheduledStart).toBe("2026-03-09T14:00:00.000Z");
        expect(task.scheduledEnd).toBe("2026-03-09T15:30:00.000Z");
        expect(getTaskScheduleKind(task)).toBe("timed");
        expect(getTaskEffectiveAnchor(task)).toBe("2026-03-09");
    });

    it("builds recurring timetable seed tasks without mutating the timed anchor", () => {
        const task = createSeedTask(USER_ID, {
            title: "Calculus II lecture",
            state: "ACTIVE",
            orderIndex: 13,
            isAllDay: false,
            scheduledStart: "2026-03-10T09:30:00.000Z",
            scheduledEnd: "2026-03-10T10:45:00.000Z",
            durationEstimate: 75,
            timezoneLocked: true,
            recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260502T235959Z",
            priority: 2,
            effort: 2,
        });

        expect(task.scheduledStart).toBe("2026-03-10T09:30:00.000Z");
        expect(task.scheduledEnd).toBe("2026-03-10T10:45:00.000Z");
        expect(task.timezoneLocked).toBe(true);
        expect(task.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260502T235959Z");
        expect(getTaskScheduleKind(task)).toBe("timed");
        expect(getTaskEffectiveAnchor(task)).toBe("2026-03-10");
    });

    it("uses shared insert-contract defaults for non-task seed entities", () => {
        const project = createSeedProject(USER_ID, {
            name: "Ops Sandbox",
        });
        const inboxItem = createSeedInboxItem(USER_ID, {
            rawText: "Capture this for triage",
        });
        const habit = createSeedHabit(USER_ID, {
            title: "Morning review",
            recurrenceRule: "FREQ=DAILY",
        });

        expect(project).toMatchObject({
            userId: USER_ID,
            name: "Ops Sandbox",
            colorAccent: "luminous-amber",
        });
        expect(inboxItem).toMatchObject({
            userId: USER_ID,
            rawText: "Capture this for triage",
            processed: false,
        });
        expect(habit).toMatchObject({
            userId: USER_ID,
            title: "Morning review",
            recurrenceRule: "FREQ=DAILY",
            reminderEnabled: false,
            colorAccent: "lantern",
            archived: false,
            totalCompletions: 0,
            totalSkips: 0,
            currentStreak: 0,
            longestStreak: 0,
        });
    });

    it("builds task notes with computed excerpt and word count", () => {
        const TASK_ID = "22222222-2222-4222-8222-222222222222";
        const note = createSeedTaskNote(USER_ID, TASK_ID, {
            body: "## Key Points\n\n- Retention up 14%\n- New funnel live\n\nCheck with design.",
        });

        expect(note).toMatchObject({
            userId: USER_ID,
            taskId: TASK_ID,
            version: 1,
        });
        expect(note.excerpt.length).toBeLessThanOrEqual(120);
        expect(note.wordCount).toBeGreaterThan(0);
        expect(note.headingCount).toBe(1);
    });

    it("builds NLP metadata with enum-typed defaults", () => {
        const TASK_ID = "22222222-2222-4222-8222-222222222222";
        const meta = createSeedNlpMetadata(USER_ID, TASK_ID, {
            rawInput: "call landlord today p4",
            cleanedTitle: "Call landlord",
        });

        expect(meta).toMatchObject({
            userId: USER_ID,
            taskId: TASK_ID,
            parserVersion: "2.0.0",
            sourceSurface: "quick_add",
            confidenceTier: "medium",
            isCurrent: true,
        });
    });

    it("builds saved focus views with enum-typed defaults", () => {
        const view = createSeedSavedFocusView(USER_ID, {
            name: "Deep Work Only",
            isPinned: true,
            source: "composed",
        });

        expect(view).toMatchObject({
            userId: USER_ID,
            name: "Deep Work Only",
            isPinned: true,
            source: "composed",
            orderIndex: 0,
        });
        expect(view.definition).toEqual({});
    });
});
