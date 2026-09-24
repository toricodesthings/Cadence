import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";
vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
import { taskRoutes } from "../../src/domains/tasks/tasks.route";
import { projectRoutes } from "../../src/domains/projects/projects.route";
import { subtaskRoutes } from "../../src/domains/subtasks/subtasks.route";
import { noteRoutes } from "../../src/domains/notes/notes.route";
import { inboxRoutes } from "../../src/domains/inbox/inbox.route";
import { buildToolRegistry } from "../../src/domains/ai/tools";

let userId: string;
let call: (name: string, input: unknown, toolCallId?: string) => Promise<any>;
let api: ReturnType<typeof apiAs>;
let subApi: ReturnType<typeof apiAs>;

beforeAll(startTestDb);
beforeEach(async () => {
    userId = await createUser();
    api = apiAs(userId, "/tasks", taskRoutes);
    subApi = apiAs(userId, "", subtaskRoutes);
    const tools = buildToolRegistry({} as never, userId, { timezone: "America/New_York", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" }) as any;
    let seq = 0;
    call = (name, input, toolCallId = `call_${++seq}`) => tools[name].execute(input, { toolCallId, messages: [] });
});

const allTasks = async () => (await api("GET", "?limit=100")).body.data as any[];
const steps = async (taskId: string) => (await subApi("GET", `/tasks/${taskId}/subtasks`)).body.data as any[];

describe("create_tasks", () => {
    it("creates 20 tasks of 30 steps each in one go, steps in order", async () => {
        const drafts = Array.from({ length: 20 }, (_, t) => ({
            title: `Task ${t}`,
            subtasks: Array.from({ length: 30 }, (_, s) => `Step ${s}`),
        }));

        const { created } = await call("create_tasks", { tasks: drafts });

        expect(created).toHaveLength(20);
        expect(created[0].subtaskIds).toHaveLength(30);
        expect(await allTasks()).toHaveLength(20);
        expect((await steps(created[19].taskId)).map((s) => s.title)).toEqual(drafts[19].subtasks);
    });

    it("creates nothing when one task names another user's list", async () => {
        const otherId = await createUser();
        const theirs = (await apiAs(otherId, "/projects", projectRoutes)("POST", "", { name: "Theirs" })).body.data;

        const result = await call("create_tasks", { tasks: [{ title: "Fine", subtasks: ["a"] }, { title: "Sneaky", projectId: theirs.id }] });

        expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Nothing was changed") });
        expect(await allTasks()).toHaveLength(0);
    });

    it("reads a clock time as timed and a bare date as all-day, marks Fixed blocks, and writes the note", async () => {
        const { created } = await call("create_tasks", {
            tasks: [
                { title: "Class", scheduledStart: "2026-09-24T09:00:00-04:00", scheduledEnd: "2026-09-24T10:00:00-04:00", fixed: true, recurrenceRule: "FREQ=WEEKLY" },
                { title: "Essay", dueDate: "2026-10-03", note: "Three sources." },
            ],
        });
        const [klass, essay] = await Promise.all(created.map(async (c: any) => (await api("GET", `/${c.taskId}`)).body.data));
        const note = (await apiAs(userId, "", noteRoutes)("GET", `/tasks/${essay.id}/note`)).body.data;

        expect(klass).toMatchObject({ isAllDay: false, interactionMode: "timetable" });
        expect(essay).toMatchObject({ isAllDay: true });
        expect(note.body).toBe("Three sources.");
    });

    it("runs once per tool call: a replayed call writes nothing new", async () => {
        const input = { tasks: [{ title: "Once" }] };
        await call("create_tasks", input, "call_same");
        const replay = await call("create_tasks", input, "call_same");

        expect(replay).toEqual({ deduped: true });
        expect(await allTasks()).toHaveLength(1);
    });
});

describe("edit_subtasks", () => {
    it("adds after the last step, ticks, renames and removes in one go", async () => {
        const { created } = await call("create_tasks", { tasks: [{ title: "Trip", subtasks: ["Book", "Pack", "Go"] }] });
        const [book, pack, go] = created[0].subtaskIds;

        const result = await call("edit_subtasks", {
            taskId: created[0].taskId,
            add: ["Come home"],
            update: [{ subtaskId: book, isComplete: true }, { subtaskId: pack, title: "Pack light" }],
            remove: [{ subtaskId: go, title: "Go" }],
        });

        expect(result).toMatchObject({ added: [expect.any(String)], updated: 2, removed: 1 });
        expect((await steps(created[0].taskId)).map((s) => [s.title, s.isComplete])).toEqual([
            ["Book", true],
            ["Pack light", false],
            ["Come home", false],
        ]);
    });

    it("changes nothing when one subtask belongs to another task", async () => {
        const { created } = await call("create_tasks", { tasks: [{ title: "A", subtasks: ["a1"] }, { title: "B", subtasks: ["b1"] }] });
        const [a, b] = created;

        const result = await call("edit_subtasks", {
            taskId: a.taskId,
            add: ["a2"],
            remove: [{ subtaskId: b.subtaskIds[0], title: "b1" }],
        });

        expect(result).toMatchObject({ ok: false });
        expect((await steps(a.taskId)).map((s) => s.title)).toEqual(["a1"]);
        expect((await steps(b.taskId)).map((s) => s.title)).toEqual(["b1"]);
    });
});

describe("update_tasks, set_task_state, delete_tasks", () => {
    it("moves several tasks into a list and tags them without reading their tags first", async () => {
        const list = (await apiAs(userId, "/projects", projectRoutes)("POST", "", { name: "Work" })).body.data;
        const tag = (await call("create_tag", { name: "q4" })).tagId;
        const { created } = await call("create_tasks", { tasks: [{ title: "One" }, { title: "Two" }] });
        const ids = created.map((c: any) => c.taskId);

        expect(await call("update_tasks", { taskIds: ids, patch: { projectId: list.id, addTagIds: [tag] } })).toEqual({ updated: 2 });
        const rows = await allTasks();
        expect(rows.every((row) => row.projectId === list.id && row.tagIds.includes(tag))).toBe(true);

        await call("update_tasks", { taskIds: [ids[0]], patch: { removeTagIds: [tag] } });
        expect((await allTasks()).find((row) => row.id === ids[0]).tagIds).toEqual([]);
    });

    it("refuses a stale note version and a whole rewrite of a long note, but adds to it", async () => {
        const { created } = await call("create_tasks", { tasks: [{ title: "Notes", note: "x".repeat(1_200) }] });
        const taskId = created[0].taskId;

        expect(await call("update_tasks", { taskIds: [taskId], patch: { note: "short", noteVersion: 1 } })).toMatchObject({ ok: false });
        expect(await call("update_tasks", { taskIds: [taskId], patch: { appendNote: "More", noteVersion: 0 } })).toMatchObject({
            ok: false,
            error: expect.stringContaining("modified"),
        });
        expect(await call("update_tasks", { taskIds: [taskId], patch: { appendNote: "More", noteVersion: 1 } })).toEqual({ updated: 1 });
        const note = (await apiAs(userId, "", noteRoutes)("GET", `/tasks/${taskId}/note`)).body.data;
        expect(note.body.endsWith("\nMore")).toBe(true);
    });

    it("puts tasks on hold, sends them to Trash, and deletes for good", async () => {
        const { created } = await call("create_tasks", { tasks: [{ title: "Hold" }, { title: "Trash" }, { title: "Gone" }] });
        const [hold, trash, gone] = created.map((c: any) => c.taskId);

        await call("set_task_state", { taskIds: [hold], state: "WAITING", waitingOn: "Maya" });
        await call("set_task_state", { taskIds: [trash], state: "ARCHIVED" });
        expect(await call("delete_tasks", { tasks: [{ taskId: gone, title: "Gone" }] })).toEqual({ deleted: 1 });

        const rows = await allTasks();
        expect(rows.find((row) => row.id === hold)).toMatchObject({ state: "WAITING", waitingOn: "Maya" });
        expect(rows.find((row) => row.id === trash)).toMatchObject({ state: "ARCHIVED" });
        expect(rows.find((row) => row.id === gone)).toBeUndefined();
    });
});

describe("structure_inbox_item", () => {
    it("places a capture as a task with its steps and note, and never adds a date it wasn't given", async () => {
        const inbox = apiAs(userId, "/inbox", inboxRoutes);
        const item = (await inbox("POST", "", { rawText: "pay rent friday" })).body.data;

        const { taskId } = await call("structure_inbox_item", { inboxItemId: item.id, title: "Pay rent", subtasks: ["Log in to bank"], note: "Landlord's new account." });

        expect((await api("GET", `/${taskId}`)).body.data).toMatchObject({ title: "Pay rent", dueDate: null, scheduledStart: null });
        expect((await steps(taskId)).map((s) => s.title)).toEqual(["Log in to bank"]);
    });
});
