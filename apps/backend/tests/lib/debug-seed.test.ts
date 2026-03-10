import { describe, expect, it } from "vitest";
import {
    createSeedHabit,
    createSeedInboxItem,
    createSeedProject,
    createSeedTask,
    seedDate,
    seedDateTime,
} from "../../src/lib/debug-seed";
import { getTaskEffectiveAnchor, getTaskScheduleKind } from "../../../frontend/app/lib/utils/task-scheduling";

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

        expect(task.dueDate).toBe("2026-03-09T00:00:00.000Z");
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

        expect(task.dueDate).toBe("2026-03-11T00:00:00.000Z");
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
});
