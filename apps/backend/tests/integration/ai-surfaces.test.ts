/**
 * Every surface the assistant manages, through its tools against the real
 * database: task filters and paging, the task fields beyond dates (reminder,
 * check-in, hide until, Fixed), copying and ordering, lists, tags, routines,
 * focus views and the schedule window. User in Toronto; "today" is 2026-09-23.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, getTestDb, startTestDb } from "../helpers/db";
vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
import { taskRoutes } from "../../src/domains/tasks/tasks.route";
import { subtaskRoutes } from "../../src/domains/subtasks/subtasks.route";
import { habitRoutes } from "../../src/domains/habits/habits.route";
import { buildToolRegistry } from "../../src/domains/ai/tools";
import { withRls } from "../../src/platform/rls";
import { habits, tags, tasks } from "../../src/db/schema";
import { eq } from "drizzle-orm";

const TZ = "America/Toronto";
let userId: string;
let call: (name: string, input: unknown) => Promise<any>;
let api: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    userId = await createUser({ zone: TZ });
    api = apiAs(userId, "/tasks", taskRoutes);
    const tools = buildToolRegistry({} as never, userId, { timezone: TZ, currentDate: "2026-09-23T16:00:00Z", today: "2026-09-23", weekStart: "Monday" }) as any;
    let seq = 0;
    call = async (name, input) => {
        const result = await tools[name].execute(input, { toolCallId: `call_${++seq}`, messages: [] });
        if (result?.ok === false) throw new Error(result.error);
        return result;
    };
});

const task = async (id: string) => (await api("GET", `/${id}`)).body.data;
const make = async (drafts: object[]) => ((await call("create_tasks", { tasks: drafts })).created as { taskId: string }[]).map((c) => c.taskId);
const titles = (rows: { title: string }[]) => rows.map((row) => row.title);

describe("get_tasks filters and pages", () => {
    it("filters by tag, priority, pin, section and an exact local date range, and rows carry their tags", async () => {
        const { projectId, sections } = await call("create_project", { name: "Work", sections: ["Now"] });
        const [late, early, pinned, loose] = await make([
            // 11:30 PM Toronto on the 25th is the 26th in UTC: still the 25th for the user.
            { title: "Late", scheduledStart: "2026-09-25T23:30:00-04:00", priority: 4, tagNames: ["Deep"], projectId, sectionId: sections[0].sectionId },
            { title: "Early", dueDate: "2026-09-24", priority: 2, tagNames: ["deep"], projectId },
            { title: "Pinned", priority: 3 },
            { title: "Loose" },
        ]);
        await call("update_tasks", { taskIds: [pinned], patch: { isPinned: true } });
        const [{ id: deep }] = (await call("get_tags", { query: "dee" })).tags;

        const tagged = await call("get_tasks", { tagId: deep, sort: "date" });
        expect(titles(tagged.tasks)).toEqual(["Early", "Late"]);
        expect(tagged.tasks[0].tagIds).toEqual([deep]);
        expect(titles((await call("get_tasks", { minPriority: 3 })).tasks)).toEqual(["Late", "Pinned"]);
        expect((await call("get_tasks", { pinned: true })).tasks).toMatchObject([{ id: pinned, pinned: true }]);
        expect(titles((await call("get_tasks", { from: "2026-09-25", to: "2026-09-25" })).tasks)).toEqual(["Late"]);
        expect(titles((await call("get_tasks", { projectId, noSection: true })).tasks)).toEqual(["Early"]);
        expect(titles((await call("get_tasks", { noDate: true })).tasks).sort()).toEqual(["Loose", "Pinned"]);
        expect([late, early, loose]).toHaveLength(3);
    });

    it("pages past 50 without gaps or repeats, in the list's own order", async () => {
        await withRls(getTestDb(), userId, (tx) =>
            tx.insert(tasks).values(Array.from({ length: 57 }, (_, i) => ({ userId, title: `T${i}`, orderIndex: i }))));
        const first = await call("get_tasks", { sort: "list", limit: 50 });
        expect(first).toMatchObject({ count: 50, more: true, nextOffset: 50 });
        const rest = await call("get_tasks", { sort: "list", limit: 50, offset: 50 });
        expect(rest.more).toBeUndefined();
        expect(titles([...first.tasks, ...rest.tasks])).toEqual(Array.from({ length: 57 }, (_, i) => `T${i}`));
    });
});

describe("task fields beyond dates", () => {
    it("sets and clears a reminder, a Waiting check-in, a hide-until day and Fixed; tags by name on update", async () => {
        const [id] = await make([{ title: "Call bank", reminderAt: "2026-09-24T09:00:00-04:00", hideUntil: "2026-09-24" }]);
        expect(await task(id)).toMatchObject({ reminderAt: "2026-09-24T13:00:00.000Z", notBefore: "2026-09-24" });
        expect((await call("get_task_detail", { taskId: id })).task).toMatchObject({ reminderAt: "2026-09-24T09:00:00-04:00", hiddenUntil: "2026-09-24" });

        await call("set_task_state", { taskIds: [id], state: "WAITING", waitingOn: "Bank", checkInAt: "2026-09-28T10:00:00-04:00" });
        expect(await task(id)).toMatchObject({ state: "WAITING", waitingOn: "Bank", waitingReminder: "2026-09-28T14:00:00.000Z" });

        await call("update_tasks", { taskIds: [id], patch: { reminderAt: null, hideUntil: null, checkInAt: null, fixed: true, addTagNames: ["Admin"] } });
        const after = await task(id);
        expect(after).toMatchObject({ reminderAt: null, notBefore: null, waitingReminder: null, interactionMode: "timetable" });
        expect(after.tagIds).toHaveLength(1);
        await call("update_tasks", { taskIds: [id], patch: { fixed: false } });
        expect((await task(id)).interactionMode).toBe("task");
    });

    it("copies tasks, renamed or on another day at the same time", async () => {
        const [standup] = await make([{ title: "Standup", scheduledStart: "2026-09-23T09:00:00-04:00", scheduledEnd: "2026-09-23T09:15:00-04:00", tagNames: ["Team"] }]);
        const { created } = await call("duplicate_tasks", { tasks: [{ taskId: standup, targetDate: "2026-09-25" }, { taskId: standup, title: "Retro" }] });
        const [moved, renamed] = await Promise.all(created.map((c: any) => task(c.taskId)));
        expect(moved).toMatchObject({ title: "Standup (copy)", scheduledStart: "2026-09-25T13:00:00.000Z", scheduledEnd: "2026-09-25T13:15:00.000Z" });
        expect(moved.tagIds).toHaveLength(1);
        expect(renamed).toMatchObject({ title: "Retro", scheduledStart: "2026-09-23T13:00:00.000Z" });
    });

    it("reorders tasks within their list and a task's checklist steps", async () => {
        const { projectId } = await call("create_project", { name: "Home" });
        const ids = await make(["A", "B", "C", "D"].map((title, i) => ({ title, projectId, priority: 0, durationEstimate: i + 1 })));
        // Set the starting order through the REST reorder so it matches the app.
        await api("PATCH", `/${ids[0]}/reorder`, { orderIndex: 0, orderedTaskIds: ids });
        const order = async () => titles((await call("get_tasks", { projectId, sort: "list" })).tasks);

        await call("reorder_tasks", { taskIds: [ids[3], ids[2]], to: "top" });
        expect(await order()).toEqual(["D", "C", "A", "B"]);
        await call("reorder_tasks", { taskIds: [ids[0]], beforeTaskId: ids[2] });
        expect(await order()).toEqual(["D", "A", "C", "B"]);
        await call("reorder_tasks", { taskIds: [ids[3]], to: "bottom" });
        expect(await order()).toEqual(["A", "C", "B", "D"]);

        const [withSteps] = await make([{ title: "Trip", subtasks: ["Pack", "Book", "Go"] }]);
        const subs = (await call("get_task_detail", { taskId: withSteps })).subtasks;
        await call("edit_subtasks", { taskId: withSteps, order: [subs[2].id, subs[0].id] });
        const listed = (await apiAs(userId, "", subtaskRoutes)("GET", `/tasks/${withSteps}/subtasks`)).body.data;
        expect(titles(listed)).toEqual(["Go", "Pack", "Book"]);
    });
});

describe("lists and tags", () => {
    it("renames a list, then deletes lists keeping or trashing their tasks", async () => {
        const { projectId } = await call("create_project", { name: "Old", emoji: "📦" });
        expect(await call("update_project", { projectId, patch: { name: "New", emoji: null } })).toMatchObject({ name: "New", emoji: null });
        const [kept] = await make([{ title: "Keep me", projectId }]);
        expect(await call("delete_project", { projectId, name: "New" })).toEqual({ deleted: "New", tasksUnlisted: 1, tasksTrashed: 0 });
        expect(await task(kept)).toMatchObject({ projectId: null, state: "ACTIVE" });

        const second = await call("create_project", { name: "Scrap" });
        const [open, done] = await make([{ title: "Open", projectId: second.projectId }, { title: "Done", projectId: second.projectId }]);
        await call("set_task_state", { taskIds: [done], state: "COMPLETE" });
        expect(await call("delete_project", { projectId: second.projectId, name: "Scrap", tasks: "trash" })).toEqual({ deleted: "Scrap", tasksUnlisted: 1, tasksTrashed: 1 });
        expect((await task(open)).state).toBe("ARCHIVED");
        expect((await task(done)).state).toBe("COMPLETE");
    });

    it("searches and pages tags, renames one and deletes one off every task", async () => {
        await withRls(getTestDb(), userId, (tx) => tx.insert(tags).values(Array.from({ length: 55 }, (_, i) => ({ userId, name: `tag${String(i).padStart(2, "0")}` }))));
        const first = await call("get_tags", {});
        expect(first).toMatchObject({ more: true, nextOffset: 50 });
        expect((await call("get_tags", { offset: 50 })).tags.map((t: any) => t.name)).toEqual(["tag50", "tag51", "tag52", "tag53", "tag54"]);
        const [{ id }] = (await call("get_tags", { query: "tag54" })).tags;

        expect(await call("update_tag", { tagId: id, patch: { name: "Urgent", color: "rose" } })).toMatchObject({ name: "Urgent", color: "rose" });
        const [tagged] = await make([{ title: "Tagged", tagIds: [id] }]);
        expect(await call("delete_tag", { tagId: id, name: "Urgent" })).toEqual({ deleted: "Urgent" });
        expect((await task(tagged)).tagIds).toEqual([]);
    });
});

describe("routines", () => {
    it("creates with colour, day times, list and tags; reorders; pages; deletes for good", async () => {
        const habitsApi = apiAs(userId, "/habits", habitRoutes);
        const [{ tagId }] = [await call("create_tag", { name: "Health" })];
        const gym = await call("create_habit", {
            title: "Gym", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE", targetTime: "07:00", dayTimes: { WE: "18:00" }, colorAccent: "rose", tagIds: [tagId],
        });
        const read = await call("create_habit", { title: "Read", recurrenceRule: "FREQ=DAILY" });
        const [first] = (await call("get_habits", {})).habits;
        expect(first).toMatchObject({ id: gym.habitId, dayTimes: { WE: "18:00" }, colorAccent: "rose", tagIds: [tagId] });

        await call("update_habit", { habitId: read.habitId, patch: { position: 1, dayTimes: null } });
        expect((await call("get_habits", {})).habits.map((h: any) => h.title)).toEqual(["Read", "Gym"]);
        const page = await call("get_habits", { limit: 1 });
        expect(page).toMatchObject({ more: true, nextOffset: 1 });

        expect(await call("delete_habit", { habitId: gym.habitId, title: "Gym" })).toEqual({ deleted: "Gym" });
        expect((await habitsApi("GET", `/${gym.habitId}`)).status).toBe(404);
    });
});

describe("routine history", () => {
    it("names the days each routine was done, skipped, missed or is still open, and adherence counts the missed ones", async () => {
        const anki = await call("create_habit", { title: "French ANKI", recurrenceRule: "FREQ=DAILY" });
        const gym = await call("create_habit", { title: "Workout", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,TH,FR" });
        // Both existed well before the window.
        await withRls(getTestDb(), userId, (tx) => tx.update(habits).set({ createdAt: "2026-09-01T12:00:00.000Z" }).where(eq(habits.userId, userId)));
        await call("log_habit", { habitId: anki.habitId, status: "COMPLETED", targetDate: "2026-09-20" });
        await call("log_habit", { habitId: anki.habitId, status: "SKIPPED", targetDate: "2026-09-21" });
        await call("log_habit", { habitId: gym.habitId, status: "COMPLETED", targetDate: "2026-09-21" });

        const { range, routines } = await call("get_habit_history", { start: "2026-09-20", end: "2026-09-30" });
        // Reads stop at today (Wednesday the 23rd).
        expect(range).toEqual({ start: "2026-09-20", end: "2026-09-23" });
        expect(routines).toEqual([
            { habitId: anki.habitId, title: "French ANKI", due: 4, done: ["2026-09-20"], skipped: ["2026-09-21"], missed: ["2026-09-22"], open: ["2026-09-23"] },
            // Workout isn't due on Sunday the 20th or Wednesday the 23rd.
            { habitId: gym.habitId, title: "Workout", due: 2, done: ["2026-09-21"], missed: ["2026-09-22"] },
        ]);

        const listed = (await call("get_habits", {})).habits;
        const ankiRow = listed.find((h: any) => h.id === anki.habitId);
        // Since the 1st: one day done, one skipped (neutral), the rest due and never logged.
        expect(ankiRow.adherence).toBeLessThan(0.1);
        expect(ankiRow.missedLast30).toBeGreaterThan(15);
    });
});

describe("focus views", () => {
    it("creates, reads, applies, changes and deletes a saved view", async () => {
        const { projectId } = await call("create_project", { name: "Client" });
        await make([
            { title: "Big client thing", projectId, priority: 4, effort: 3 },
            { title: "Quick client thing", projectId, priority: 3, effort: 1 },
            { title: "Other", priority: 4, effort: 1 },
        ]);
        const { focusViewId } = await call("create_focus_view", { name: "Client quick wins", filters: { projectIds: [projectId], effortMax: 1 }, pinned: true });
        expect((await call("get_focus_views", {})).views).toEqual([
            { id: focusViewId, name: "Client quick wins", pinned: true, filters: { projectIds: [projectId], effortMax: 1 } },
        ]);
        const shown = await call("get_tasks", { focusViewId });
        expect(shown.view).toEqual({ name: "Client quick wins" });
        expect(titles(shown.tasks)).toEqual(["Quick client thing"]);

        await call("update_focus_view", { focusViewId, name: "Client", filters: { effortMax: null, priorityMin: 4 } });
        expect(titles((await call("get_tasks", { focusViewId })).tasks)).toEqual(["Big client thing"]);
        expect(await call("delete_focus_view", { focusViewId, name: "Client" })).toEqual({ deleted: "Client" });
        expect((await call("get_focus_views", {})).views).toEqual([]);
    });
});

describe("get_schedule_window", () => {
    it("keeps repeating tasks even when more than 50 one-offs share the range, sorted by day and time, and pages", async () => {
        await withRls(getTestDb(), userId, (tx) =>
            tx.insert(tasks).values(Array.from({ length: 60 }, (_, i) => ({ userId, title: `One-off ${i}`, orderIndex: i, dueDate: `2026-09-${String(24 + (i % 5)).padStart(2, "0")}` }))));
        await make([{ title: "Daily standup", scheduledStart: "2026-09-24T09:00:00-04:00", scheduledEnd: "2026-09-24T09:15:00-04:00", recurrenceRule: "FREQ=DAILY" }]);

        const first = await call("get_schedule_window", { start: "2026-09-24", end: "2026-09-28" });
        expect(first).toMatchObject({ more: true, nextOffset: 50 });
        const rest = await call("get_schedule_window", { start: "2026-09-24", end: "2026-09-28", offset: 50 });
        const all = [...first.tasks, ...rest.tasks];
        expect(all).toHaveLength(65);
        expect(all.filter((t: any) => t.title === "Daily standup")).toHaveLength(5);
        const days = all.map((t: any) => (t.dueDate ?? t.scheduledStart).slice(0, 10));
        expect(days).toEqual([...days].sort());
    });
});

describe("finding a task the user half-remembers", () => {
    it("matches list and section names word by word, and rows say where each task lives", async () => {
        const { projectId, sections } = await call("create_project", { name: "University", sections: ["COMP3005", "COMP2000"] });
        const [comp3005, comp2000] = sections.map((s: { sectionId: string }) => s.sectionId);
        const [target] = await make([
            { title: "Assignment 1", dueDate: "2026-09-23", projectId, sectionId: comp3005 },
            { title: "Assignment 1", dueDate: "2026-09-24", projectId, sectionId: comp2000 },
        ]);

        // "the comp assignment due today": no title holds "comp", the section does.
        const today = await call("get_tasks", { query: "comp assignment", dueWindow: "today" });
        expect(today.tasks).toMatchObject([{ id: target, title: "Assignment 1", list: "University", section: "COMP3005" }]);
        expect((await call("get_tasks", { query: "Assignment 1 COMP 3005" })).tasks).toMatchObject([{ id: target }]);
        expect((await call("get_tasks", { query: "comp assignment" })).count).toBe(2);
        expect((await call("get_projects", { query: "comp 3005" })).projects).toMatchObject([{ id: projectId }]);
        // Today at a glance reads the schedule window: its rows carry the names too.
        const window = await call("get_schedule_window", { start: "2026-09-23", end: "2026-09-23" });
        expect(window.tasks).toMatchObject([{ id: target, list: "University", section: "COMP3005" }]);
    });
});

describe("batch writes the model can undo, and a check-off it can't guess", () => {
    it("rejects an id that matches no task, and says where each moved task came from", async () => {
        const [water, stretch] = await make([{ title: "Water plants", dueDate: "2026-09-23" }, { title: "Stretch" }]);
        await expect(call("reschedule_tasks", { taskIds: [water, "6f1c1a52-8f0e-4c1a-9d8e-2b7f3c4d5e6f"], targetDate: "2026-09-24" }))
            .rejects.toThrow("1 of these taskIds match no task");
        expect((await task(water)).dueDate).toBe("2026-09-23"); // nothing moved
        const moved = await call("reschedule_tasks", { taskIds: [water, stretch], targetDate: "2026-09-24" });
        expect(moved.tasks).toEqual(expect.arrayContaining([{ id: water, title: "Water plants", from: "2026-09-23" }, { id: stretch, title: "Stretch", from: null }]));
        expect((await call("set_task_state", { taskIds: [water], state: "COMPLETE" })).tasks).toEqual([{ id: water, title: "Water plants", was: "ACTIVE" }]);

        // A validated `clear` reaches the database as an emptied field, and the service never sees the `clear` key.
        await call("update_tasks", { taskIds: [stretch], patch: { reminderAt: "2026-09-24T09:00:00-04:00" } });
        expect((await task(stretch)).reminderAt).toBeTruthy();
        await call("update_tasks", { taskIds: [stretch], patch: { reminderAt: null, clear: ["reminderAt"] } });
        expect((await task(stretch)).reminderAt).toBeNull();
    });

    it("holds Done on one of two same-titled tasks until the user said which, unless they tapped the card", async () => {
        const { projectId, sections } = await call("create_project", { name: "University", sections: ["COMP3005", "COMP2000"] });
        const [a, b] = await make(sections.map((s: { sectionId: string }) => ({ title: "Assignment 1", dueDate: "2026-09-23", projectId, sectionId: s.sectionId })));
        let seq = 0;
        const as = (approvalMode: string) => {
            const tools = buildToolRegistry({} as never, userId, { timezone: TZ, currentDate: "2026-09-23T16:00:00Z", today: "2026-09-23", approvalMode } as never) as any;
            return (name: string, input: unknown) => tools[name].execute(input, { toolCallId: `mode_${++seq}`, messages: [] });
        };

        const held = await as("full")("set_task_state", { taskIds: [a], state: "COMPLETE" });
        expect(held).toMatchObject({ updated: 0, sameTitle: expect.arrayContaining([{ id: a, title: "Assignment 1", list: "University", section: "COMP3005", day: "2026-09-23" }, expect.objectContaining({ id: b, section: "COMP2000" })]) });
        expect((await as("auto")("set_task_state", { taskIds: [a, b], state: "COMPLETE" })).updated).toBe(0); // "the" one, both sent
        expect((await task(a)).state).toBe("ACTIVE");
        expect((await as("full")("set_task_state", { taskIds: [a], state: "COMPLETE", sameTitleOk: true })).updated).toBe(1);
        expect((await as("ask")("set_task_state", { taskIds: [b], state: "ARCHIVED" })).updated).toBe(1); // tapped
    });
});
