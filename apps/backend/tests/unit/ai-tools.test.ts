import { describe, expect, it } from "vitest";
import { asSchema } from "ai";
import {
    toMinimalTask,
    toMinimalHabit,
    toMinimalInboxItem,
    resolveDueWindow,
    taskLocalDay,
    type TaskRow,
} from "../../src/domains/ai/tools/projections";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildToolRegistry, clampLimit, MAX_LIST_LIMIT, safeExecute, slimSchema } from "../../src/domains/ai/tools/index";
import { AppError } from "../../src/platform/errors";
import { taskDraftSchema } from "../../src/domains/ai/tools/drafts";
import { approvalFor, needsTap } from "../../src/domains/ai/safety/approval";

const baseTask: TaskRow = {
    id: "t1",
    title: "Write report",
    state: "ACTIVE",
    isAllDay: false,
    dueDate: "2026-06-10T12:00:00.000Z",
    scheduledStart: null,
    scheduledEnd: null,
    durationEstimate: 30,
    priority: 2,
    effort: 3,
    projectId: "p1",
    waitingOn: null,
    interactionMode: "task",
    recurrenceRule: null,
    content: "SECRET full markdown body that must never be projected",
};

describe("toMinimalTask", () => {
    it("projects only the set fields: DROPS content, nulls, defaults and isAllDay", () => {
        expect(Object.keys(JSON.parse(JSON.stringify(toMinimalTask(baseTask, "UTC")))).sort()).toEqual(
            ["dueDate", "durationEstimate", "effort", "id", "priority", "projectId", "state", "title"],
        );
        expect(toMinimalTask({ ...baseTask, priority: 0, effort: null, projectId: null, durationEstimate: null, dueDate: null }, "UTC"))
            .toEqual({ id: "t1", title: "Write report", state: "ACTIVE" });
    });

    it("flags timetable blocks and repeats, and names an occurrence by its series id", () => {
        const occurrence = {
            ...baseTask,
            id: "t1::2026-06-10T18:00:00.000Z",
            seriesId: "t1",
            interactionMode: "timetable" as const,
            recurrenceRule: "FREQ=WEEKLY",
        };
        expect(toMinimalTask(occurrence, "UTC")).toMatchObject({ id: "t1", fixedBlock: true, repeats: true });
        // An active Fixed block just passes: no "ACTIVE" to read as not done yet.
        expect(toMinimalTask({ ...occurrence, state: "ACTIVE" }, "UTC").state).toBeUndefined();
        expect(toMinimalTask({ ...occurrence, state: "ARCHIVED" }, "UTC").state).toBe("ARCHIVED");
        expect(toMinimalTask(baseTask, "UTC").fixedBlock).toBeUndefined();
        expect(toMinimalTask(baseTask, "UTC").repeats).toBeUndefined();
    });

    it("writes timed values as the user's wall clock with offset, so the model never converts", () => {
        const task = { ...baseTask, scheduledStart: "2026-06-10T18:00:00.000Z", scheduledEnd: "2026-06-10T19:30:00.000Z" };

        expect(toMinimalTask(task, "America/Toronto")).toMatchObject({
            scheduledStart: "2026-06-10T14:00:00-04:00",
            scheduledEnd: "2026-06-10T15:30:00-04:00",
            dueDate: "2026-06-10T08:00:00-04:00",
        });
    });

    it("writes all-day values as the stored calendar date, in any zone", () => {
        const task = { ...baseTask, isAllDay: true, dueDate: "2026-06-10T12:00:00.000Z", scheduledEnd: "2026-06-12T23:59:59.999Z" };

        for (const tz of ["Pacific/Auckland", "America/Los_Angeles"]) {
            expect(toMinimalTask(task, tz)).toMatchObject({ dueDate: "2026-06-10", scheduledEnd: "2026-06-12" });
            expect(toMinimalTask(task, tz).scheduledStart).toBeUndefined();
        }
    });
});

describe("taskLocalDay", () => {
    it("puts a timed task on the day its start has in the user's zone", () => {
        const lateEvening = { isAllDay: false, dueDate: null, scheduledStart: "2026-06-11T02:30:00.000Z" }; // 22:30 on the 10th in Toronto

        expect(taskLocalDay(lateEvening, "America/Toronto")).toBe("2026-06-10");
        expect(taskLocalDay(lateEvening, "UTC")).toBe("2026-06-11");
    });

    it("keeps an all-day task on its stored date in every zone, and is null when undated", () => {
        const allDay = { isAllDay: true, dueDate: "2026-06-10T12:00:00.000Z", scheduledStart: null };

        expect(taskLocalDay(allDay, "Pacific/Kiritimati")).toBe("2026-06-10");
        expect(taskLocalDay(allDay, "Pacific/Pago_Pago")).toBe("2026-06-10");
        expect(taskLocalDay({ isAllDay: true, dueDate: null, scheduledStart: null }, "UTC")).toBeNull();
    });
});

describe("toMinimalHabit", () => {
    const habit = {
        id: "h1",
        title: "Meditate",
        recurrenceRule: "FREQ=DAILY",
        currentStreak: 4,
        longestStreak: 10,
        archived: false,
        pausedUntil: null,
    };

    it("derives adherence from the last 30 due days: done / (done + missed), 2dp", () => {
        expect(toMinimalHabit(habit, "2026-06-05", { done: 3, missed: 1 })).toMatchObject({ adherence: 0.75, missedLast30: 1 });
    });

    it("leaves adherence out when nothing was due, and a clean record has no missed count", () => {
        expect(toMinimalHabit(habit, "2026-06-05", { done: 0, missed: 0 }).adherence).toBeUndefined();
        expect(toMinimalHabit(habit, "2026-06-05", { done: 5, missed: 0 })).toMatchObject({ adherence: 1, missedLast30: undefined });
    });

    it("flags paused when currentDate is on/before pausedUntil", () => {
        expect(toMinimalHabit({ ...habit, pausedUntil: "2026-06-10" }, "2026-06-05").paused).toBe(true);
        expect(toMinimalHabit({ ...habit, pausedUntil: "2026-06-01" }, "2026-06-05").paused).toBe(false);
        expect(toMinimalHabit({ ...habit, pausedUntil: "2026-06-05" }, "2026-06-05T09:00Z").paused).toBe(true);
    });
});

describe("toMinimalInboxItem", () => {
    it("keeps rawText and capture status, projects shape", () => {
        expect(
            toMinimalInboxItem({
                id: "i1",
                rawText: "call mom tmrw",
                captureKind: "task",
                captureStatus: "clarifying",
                processed: false,
            }),
        ).toEqual({
            isNote: false,
            id: "i1",
            rawText: "call mom tmrw",
            captureKind: "task",
            captureStatus: "clarifying",
            processed: false,
        });
    });
});

describe("tool registry", () => {
    it("every backend tool has a frontend descriptor, and the frontend lists no removed tool", () => {
        const backend = Object.keys(buildToolRegistry({} as never, "u", { timezone: "UTC", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" })).sort();
        const registry = readFileSync(join(__dirname, "../../../frontend/app/components/assistant/tool-registry.tsx"), "utf8");
        // Live tools are `name: { … }` rows; retired names (history only) are `name: "label"`.
        const frontend = [...registry.matchAll(/^    (\w+): \{/gm)].map((m) => m[1]).sort();

        expect(frontend).toEqual(backend);
        expect(backend).toHaveLength(43);
    });

    it("sends the model schemas without regex patterns, but still validates calls in full", async () => {
        const tools = buildToolRegistry({} as never, "u", { timezone: "UTC", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" }) as any;
        const schema = asSchema(tools.reschedule_tasks.inputSchema);

        expect(JSON.stringify(await schema.jsonSchema)).not.toContain("pattern");
        expect((await schema.validate!({ taskIds: ["not-a-uuid"], targetDate: "2026-10-01" })).success).toBe(false);
        expect((await schema.validate!({ taskIds: ["6f1c1a52-8f0e-4c1a-9d8e-2b7f3c4d5e6f"], targetDate: "2026-10-01T14:00" })).success).toBe(false);
        expect((await schema.validate!({ taskIds: ["6f1c1a52-8f0e-4c1a-9d8e-2b7f3c4d5e6f"], targetDate: "2026-10-01" })).success).toBe(true);
    });

    it("drops the placeholders a fill-every-field model sends, and keeps real values", async () => {
        const tools = buildToolRegistry({} as never, "u", { timezone: "UTC", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" }) as any;
        const projects = asSchema(tools.get_projects.inputSchema);
        const tasks = asSchema(tools.get_tasks.inputSchema);
        const nil = "00000000-0000-0000-0000-000000000000";
        const id = "6f1c1a52-8f0e-4c1a-9d8e-2b7f3c4d5e6f";

        // JSON drops the symbol that carries what was ignored, as persisting the call does.
        const plain = (result: unknown) => JSON.parse(JSON.stringify(result));
        expect(plain(await projects.validate!({ query: "University", projectId: nil, offset: 0, sectionQuery: "", sectionOffset: 0 })))
            .toEqual({ success: true, value: { query: "University" } });
        const sent = await tasks.validate!({ query: "COMP3005", state: "ACTIVE", projectId: id, tagId: nil, focusViewId: nil, minPriority: 0, limit: 0 }) as any;
        expect(sent.success).toBe(true);
        expect(plain(sent.value)).toEqual({ query: "COMP3005", state: "ACTIVE", projectId: id, limit: 20 });
        // Optional fields offer null as "not used"; null where it can't clear is dropped without remark.
        const model = await tasks.jsonSchema as any;
        expect(model.properties.query.type).toEqual(["string", "null"]);
        expect(model.properties.state.enum).toContain(null);
        const nulled = await tasks.validate!({ query: "COMP3005", projectId: null, sort: null }) as any;
        expect(plain(nulled.value)).toEqual({ query: "COMP3005", limit: 20 });
        expect(nulled.value[Object.getOwnPropertySymbols(nulled.value)[0]]).toBeUndefined();
        // Inside an array of drafts too: luna's real first call, every optional field null.
        const created = await asSchema(tools.create_tasks.inputSchema).validate!({ tasks: [{
            title: "Call mom", dueDate: null, scheduledStart: "2026-09-24T18:00:00-04:00", scheduledEnd: null, projectId: null, sectionId: null,
            recurrenceRule: null, tagIds: null, priority: null, effort: null, durationEstimate: null, subtasks: null, fixed: null, note: null,
            tagNames: null, reminderAt: null, hideUntil: null, fromImage: null, inboxItemId: null,
        }] }) as any;
        expect(created.success).toBe(true);
        expect(created.value.tasks[0]).toMatchObject({ title: "Call mom", scheduledStart: "2026-09-24T18:00:00-04:00" });
        // From a capture: null reminder/hide-until/fixed set nothing, so the capture rule holds.
        const fromCapture = await asSchema(tools.create_tasks.inputSchema).validate!({ tasks: [{ title: "Buy ink", fixed: null, reminderAt: null, hideUntil: null, note: "", inboxItemId: id }] }) as any;
        expect(fromCapture.success).toBe(true);
        // A real mistake still fails.
        expect((await tasks.validate!({ state: "DONE", minPriority: 0 })).success).toBe(false);

        // In a patch, null and [] change nothing and `clear` empties a field; a rejected "" goes, a valid 0 stays.
        const updateTasks = asSchema(tools.update_tasks.inputSchema);
        const update = await updateTasks.validate!({ taskIds: [id], patch: { title: "", dueDate: null, priority: 0, addTagIds: [], clear: ["reminderAt"] } }) as any;
        expect(plain(update.value)).toEqual({ taskIds: [id], patch: { priority: 0, reminderAt: null, clear: ["reminderAt"] } });
        // Luna's real "undo": every patch field null. It used to wipe dates, list and recurrence; now it changes nothing and says so.
        const wipe = await updateTasks.validate!({ taskIds: [id], patch: {
            dueDate: null, scheduledStart: null, scheduledEnd: null, projectId: null, sectionId: null, waitingOn: null,
            recurrenceRule: null, effort: null, durationEstimate: null, reminderAt: null, checkInAt: null, hideUntil: null,
        } }) as any;
        expect(wipe.success).toBe(false);
        expect(String(wipe.error?.message)).toContain("Nothing to change");
        // The model's patch: a `clear` list of what can be emptied, and no field says null clears.
        const patch = (await updateTasks.jsonSchema as any).properties.patch.properties;
        expect(patch.clear.items.enum).toEqual(expect.arrayContaining(["dueDate", "reminderAt", "projectId", "sectionId", "recurrenceRule"]));
        expect(patch.clear.items.enum).not.toContain("title");
        expect(JSON.stringify(patch)).not.toMatch(/null (clears|removes|shows|stops)/);
        expect(patch.dueDate.description).toBe("A deadline, only when one is given.");

        // The tool's result tells the model what was dropped.
        const help = asSchema(tools.get_cadence_help.inputSchema);
        const [topic] = (await help.jsonSchema as any).properties.topic.enum;
        const input = (await help.validate!({ topic, listId: nil }) as any).value;
        expect((await tools.get_cadence_help.execute(input, {})).ignored).toContain("listId");
    });

    it("runs an unexpected tool failure once more, but not one of our own errors", async () => {
        let runs = 0;
        expect(await safeExecute("t", "u", async () => (++runs === 1 ? Promise.reject(new Error("socket")) : "ok"))).toBe("ok");
        expect(runs).toBe(2);
        runs = 0;
        const out = await safeExecute("t", "u", async () => { runs++; throw new AppError(404, "NOT_FOUND", "Task not found"); });
        expect(runs).toBe(1);
        expect(out).toMatchObject({ ok: false, error: "Task not found. Nothing was changed." });
    });

    it("slims schemas: no bounds, nullable unions and literal unions folded", () => {
        expect(slimSchema({
            type: "object",
            properties: {
                minimum: { type: "string", minLength: 1, maxLength: 9 },
                due: { anyOf: [{ type: "string", format: "date" }, { type: "null" }], description: "d" },
                kind: { anyOf: [{ type: "string", enum: ["a"] }, { type: "null" }] },
                priority: { anyOf: [0, 1, 2].map((n) => ({ type: "number", const: n })) },
                ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 20 },
            },
        })).toEqual({
            type: "object",
            properties: {
                minimum: { type: "string" },
                due: { type: ["string", "null"], format: "date", description: "d" },
                kind: { anyOf: [{ type: "string", enum: ["a"] }, { type: "null" }] },
                priority: { type: "number", enum: [0, 1, 2] },
                ids: { type: "array", items: { type: "string" } },
            },
        });
    });

    it("takes only the repeat rules the Routines picker can show", async () => {
        const tools = buildToolRegistry({} as never, "u", { timezone: "UTC", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" }) as any;
        const schema = asSchema(tools.create_habit.inputSchema);
        const ok = async (recurrenceRule: string, targetTime?: string) => (await schema.validate!({ title: "Gym", recurrenceRule, targetTime })).success;
        for (const rule of ["FREQ=DAILY", "FREQ=DAILY;INTERVAL=3", "FREQ=WEEKLY;BYDAY=MO,WE,FR", "FREQ=WEEKLY;INTERVAL=2;BYDAY=SA"]) expect(await ok(rule)).toBe(true);
        for (const rule of ["FREQ=HOURLY", "FREQ=WEEKLY", "FREQ=MONTHLY;BYMONTHDAY=1", "FREQ=WEEKLY;INTERVAL=3;BYDAY=MO"]) expect(await ok(rule)).toBe(false);
        expect(await ok("FREQ=DAILY", "7:30")).toBe(false);
        expect(await ok("FREQ=DAILY", "07:30")).toBe(true);
    });
});

describe("which calls wait for a tap", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
    const approval = (mode: "ask" | "auto" | "full", toolName: string, input: unknown = {}) => approvalFor(mode)({ toolCall: { toolName, input } });

    it("Ask waits on every write but never on reads or capture", () => {
        expect(approval("ask", "create_tag")).toBe("user-approval");
        expect(approval("ask", "get_tasks")).toBeUndefined();
        expect(approval("ask", "capture_to_inbox")).toBeUndefined();
    });

    it("Auto waits on more than 5 tasks, permanent deletes, removed steps and note rewrites", () => {
        expect(approval("auto", "set_task_state", { taskIds: ids(5) })).toBeUndefined();
        expect(approval("auto", "set_task_state", { taskIds: ids(6) })).toBe("user-approval");
        expect(approval("auto", "create_tasks", { tasks: ids(6) })).toBe("user-approval");
        expect(approval("auto", "delete_tasks", { tasks: ids(1) })).toBe("user-approval");
        expect(needsTap("delete_event", { eventId: "e" })).toBe(true);
        expect(needsTap("delete_section", { sectionId: "s" })).toBe(true);
        expect(needsTap("update_event", { eventId: "e", patch: { emoji: "🎂" } })).toBe(false);
        expect(needsTap("edit_subtasks", { add: ["a"] })).toBe(false);
        expect(needsTap("edit_subtasks", { remove: [{ subtaskId: "s" }] })).toBe(true);
        expect(needsTap("update_tasks", { taskIds: ids(1), patch: { appendNote: "more" } })).toBe(false);
        expect(needsTap("update_tasks", { taskIds: ids(1), patch: { note: "rewritten" } })).toBe(true);
        for (const name of ["delete_project", "delete_tag", "delete_captures", "delete_habit", "delete_focus_view"]) expect(needsTap(name, {})).toBe(true);
        expect(needsTap("update_captures", { items: ids(5) })).toBe(false);
        expect(needsTap("update_captures", { items: ids(6) })).toBe(true);
        expect(needsTap("create_tasks", { tasks: ids(6) })).toBe(true);
        expect(needsTap("reorder_tasks", { taskIds: ids(2), to: "top" })).toBe(false);
    });

    it("Full never waits, even on a permanent delete", () => {
        expect(approval("full", "delete_tasks", { tasks: ids(20) })).toBeUndefined();
    });
});

describe("task drafts", () => {
    const tasksSchema = taskDraftSchema.array().min(1).max(20);
    const draft = { title: "Plan trip", subtasks: Array.from({ length: 30 }, (_, i) => `Step ${i + 1}`) };

    it("take up to 20 tasks of 30 steps each, and no more", () => {
        expect(tasksSchema.safeParse(Array(20).fill(draft)).success).toBe(true);
        expect(tasksSchema.safeParse(Array(21).fill(draft)).success).toBe(false);
        expect(tasksSchema.safeParse([{ ...draft, subtasks: [...draft.subtasks, "One more"] }]).success).toBe(false);
    });

    it("keep quotes for known fields and drop others without failing the call", () => {
        const parsed = taskDraftSchema.parse({ title: "Pay rent", note: "Amouage", fromImage: { note: "Amouage", project: "Home" } });
        expect(parsed.fromImage).toEqual({ note: "Amouage" });
        expect(taskDraftSchema.safeParse({ title: "Pay rent", fromImage: { subtasks: "x".repeat(300) } }).success).toBe(true);
        expect(taskDraftSchema.safeParse({ title: "Pay rent", fromImage: { dueDate: "x".repeat(301) } }).success).toBe(false);
    });
});

describe("resolveDueWindow (user's local dates)", () => {
    const today = "2026-06-05"; // a Friday

    it.each([
        ["overdue", "Sunday", { to: "2026-06-04" }],
        ["today", "Sunday", { from: "2026-06-05", to: "2026-06-05" }],
        ["this_week", "Sunday", { from: "2026-05-31", to: "2026-06-06" }],
        ["this_week", "Monday", { from: "2026-06-01", to: "2026-06-07" }],
        ["this_month", "Sunday", { from: "2026-06-01", to: "2026-06-30" }],
    ] as const)("%s (week starts %s) → %j", (window, weekStart, expected) => {
        expect(resolveDueWindow(window, today, weekStart)).toEqual(expected);
    });

    it("handles month ends that roll a year", () => {
        expect(resolveDueWindow("this_month", "2026-12-31")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    });
});

describe("clampLimit", () => {
    it("clamps to [1, MAX_LIST_LIMIT] and floors non-integers", () => {
        expect(clampLimit(999)).toBe(MAX_LIST_LIMIT);
        expect(clampLimit(0)).toBe(1);
        expect(clampLimit(-5)).toBe(1);
        expect(clampLimit(12.9)).toBe(12);
    });

    it("uses the fallback when undefined or non-finite", () => {
        expect(clampLimit(undefined)).toBe(20);
        expect(clampLimit(undefined, 50)).toBe(50);
        expect(clampLimit(Number.NaN, 30)).toBe(30);
    });
});
