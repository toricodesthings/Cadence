import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, getTestDb, startTestDb } from "../helpers/db";
vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
import { taskRoutes } from "../../src/domains/tasks/tasks.route";
import { projectRoutes } from "../../src/domains/projects/projects.route";
import { subtaskRoutes } from "../../src/domains/subtasks/subtasks.route";
import { noteRoutes } from "../../src/domains/notes/notes.route";
import { inboxRoutes } from "../../src/domains/inbox/inbox.route";
import { settingsRoutes } from "../../src/domains/settings/settings.route";
import { buildToolRegistry } from "../../src/domains/ai/tools";
import { withRls } from "../../src/platform/rls";
import { habits, projects, taskSections } from "../../src/db/schema";

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

describe("list destinations", () => {
    it("finds and pages lists and empty sections beyond both caps, then places an image draft in the matching section", async () => {
        const { university, course } = await withRls(getTestDb(), userId, async (tx) => {
            const [university] = await tx.insert(projects).values({ userId, name: "University Deadline", createdAt: "2000-01-01T00:00:00Z" }).returning();
            const others = await tx.insert(projects).values(Array.from({ length: 50 }, (_, i) => ({ userId, name: `List ${i}` }))).returning();
            // Other lists must not consume a focused list's section budget.
            await tx.insert(taskSections).values(Array.from({ length: 205 }, (_, i) => ({ userId, projectId: others[0].id, name: `Other ${i}`, orderIndex: -i - 1 })));
            const sections = await tx.insert(taskSections).values(Array.from({ length: 205 }, (_, i) => ({
                userId, projectId: university.id, name: i === 204 ? "COMP2000" : `Course ${i}`, orderIndex: i,
            }))).returning();
            return { university, course: sections[204] };
        });
        const otherUser = await createUser();
        await apiAs(otherUser, "/projects", projectRoutes)("POST", "", { name: "University Private" });

        const first = await call("get_projects", {});
        expect(first).toMatchObject({ more: true, nextOffset: 50, sectionsMore: true });
        const last = await call("get_projects", { offset: first.nextOffset });
        expect(last.projects.map((p: any) => p.id)).toEqual([university.id]);
        expect(last.more).toBeUndefined();
        expect(new Set([...first.projects, ...last.projects].map((p: any) => p.id)).size).toBe(51);

        const found = await call("get_projects", { query: "university" });
        expect(found.projects).toHaveLength(1);
        expect(found.projects[0].sections).toHaveLength(200);
        expect(found.projects[0].sections[0].name).toBe("Course 0");
        expect(found.sectionsMore).toBe(true);
        const focused = await call("get_projects", { projectId: university.id });
        expect(focused.nextSectionOffset).toBe(200);
        const tail = await call("get_projects", { projectId: university.id, sectionOffset: focused.nextSectionOffset });
        expect(tail.projects[0].sections).toHaveLength(5);
        expect(tail.sectionsMore).toBeUndefined();
        const matched = await call("get_projects", { projectId: university.id, sectionQuery: "comp2000" });
        expect(matched.projects[0].sections).toEqual([{ id: course.id, name: "COMP2000" }]);
        expect((await call("get_projects", { query: "%" })).projects).toEqual([]);
        expect((await call("get_projects", { projectId: university.id, sectionQuery: "_" })).projects[0].sections).toEqual([]);

        const { created } = await call("create_tasks", { tasks: [{
            title: "Assignment", dueDate: "2026-10-22", projectId: university.id, sectionId: course.id,
            fromImage: { title: "Assignment", dueDate: "Oct 22" },
        }] });
        expect((await api("GET", `/${created[0].taskId}`)).body.data).toMatchObject({
            projectId: university.id, sectionId: course.id, isAllDay: true, dueDate: expect.stringContaining("2026-10-22"),
        });
        expect((await call("get_task_detail", { taskId: created[0].taskId })).task.sectionId).toBe(course.id);
        expect((await call("get_tasks", { projectId: university.id })).tasks[0].sectionId).toBe(course.id);
    });

    it("rejects wrong-list sections atomically and keeps moves consistent", async () => {
        const { a, b, section } = await withRls(getTestDb(), userId, async (tx) => {
            const [a, b] = await tx.insert(projects).values([{ userId, name: "A" }, { userId, name: "B" }]).returning();
            const [section] = await tx.insert(taskSections).values({ userId, projectId: a.id, name: "COMP2000", orderIndex: 0 }).returning();
            return { a, b, section };
        });
        for (const projectId of [b.id, undefined, null]) {
            expect(await call("create_tasks", { tasks: [{ title: "Fine" }, { title: "Wrong", projectId, sectionId: section.id }] }))
                .toMatchObject({ ok: false, error: expect.stringContaining("Section does not belong") });
            expect(await allTasks()).toEqual([]);
        }
        const { created } = await call("create_tasks", { tasks: [{ title: "Essay", projectId: a.id, sectionId: section.id }] });
        const taskIds = [created[0].taskId];
        expect(await call("update_tasks", { taskIds, patch: { projectId: a.id } })).toEqual({ updated: 1 });
        expect((await allTasks())[0].sectionId).toBe(section.id);
        expect(await call("update_tasks", { taskIds, patch: { projectId: b.id, sectionId: section.id } })).toMatchObject({ ok: false });
        expect((await allTasks())[0]).toMatchObject({ projectId: a.id, sectionId: section.id });
        expect(await call("update_tasks", { taskIds, patch: { projectId: b.id } })).toEqual({ updated: 1 });
        expect((await allTasks())[0]).toMatchObject({ projectId: b.id, sectionId: null });
        expect(await call("update_tasks", { taskIds, patch: { sectionId: section.id } })).toMatchObject({ ok: false });
        expect(await call("update_tasks", { taskIds, patch: { projectId: a.id, sectionId: section.id } })).toEqual({ updated: 1 });
        expect(await call("update_tasks", { taskIds, patch: { projectId: null } })).toEqual({ updated: 1 });
        expect((await allTasks())[0]).toMatchObject({ projectId: null, sectionId: null });
    });

    it("allows unscoped sections only without a list and rejects another user's section", async () => {
        const otherUser = await createUser();
        const [foreign] = await withRls(getTestDb(), otherUser, (tx) => tx.insert(taskSections)
            .values({ userId: otherUser, name: "Private", orderIndex: 0 }).returning());
        const [unscoped] = await withRls(getTestDb(), userId, (tx) => tx.insert(taskSections)
            .values({ userId, name: "General", orderIndex: 0 }).returning());
        expect(await call("create_tasks", { tasks: [{ title: "Wrong", sectionId: foreign.id }] })).toMatchObject({ ok: false });
        expect(await allTasks()).toEqual([]);
        const { created } = await call("create_tasks", { tasks: [{ title: "General task", sectionId: unscoped.id }] });
        expect((await api("GET", `/${created[0].taskId}`)).body.data).toMatchObject({ projectId: null, sectionId: unscoped.id });
        const { projectId } = await call("create_project", { name: "New list" });
        expect(await call("update_tasks", { taskIds: [created[0].taskId], patch: { projectId, sectionId: unscoped.id } })).toMatchObject({ ok: false });
    });
});

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

describe("events and routine emoji", () => {
    it("adds, reads, changes and deletes events in the user's settings, and only theirs", async () => {
        const settings = apiAs(userId, "/settings", settingsRoutes);
        const { eventId } = await call("create_event", { label: "Mom's birthday", monthDay: "03-14", emoji: "🎂", startedOn: "1966-03-14" });
        await call("create_event", { label: "Anniversary", monthDay: "09-30" });
        // Replaying a call adds nothing.
        await call("create_event", { label: "Dup", monthDay: "01-01" }, "fixed");
        await call("create_event", { label: "Dup", monthDay: "01-01" }, "fixed");

        const { events } = await call("get_events", {});
        expect(events.map((e: any) => e.label)).toEqual(["Anniversary", "Dup", "Mom's birthday"]);
        expect(events[0]).toMatchObject({ next: "2026-09-30", daysUntil: 7 });
        expect(events[2]).toMatchObject({ id: eventId, emoji: "🎂", next: "2027-03-14", years: 61 });

        expect(await call("update_event", { eventId, patch: { emoji: "🌷", notify: false } })).toMatchObject({ emoji: "🌷", notify: false, label: "Mom's birthday" });
        expect(await call("delete_event", { eventId })).toEqual({ deleted: "Mom's birthday" });
        const items = (await settings("GET", "")).body.data.calendar.personalEvents.items;
        expect(items.map((e: any) => e.label)).toEqual(["Anniversary", "Dup"]);
        expect(items[0]).toMatchObject({ emoji: null, notify: true, startedOn: null });

        expect((await call("update_event", { eventId, patch: { label: "x" } })).ok).toBe(false);
        const other = await createUser();
        const otherTools = buildToolRegistry({} as never, other, { timezone: "UTC", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" }) as any;
        expect((await otherTools.get_events.execute({}, { toolCallId: "o1", messages: [] })).events).toEqual([]);
    });

    it("sets and clears a routine's emoji, and never another user's", async () => {
        const [habit] = await withRls(getTestDb(), userId, (tx) => tx.insert(habits).values({ userId, title: "Stretch", recurrenceRule: "FREQ=DAILY" }).returning());
        expect(await call("set_habit_emoji", { habitId: habit.id, emoji: "🧘" })).toEqual({ title: "Stretch", emoji: "🧘" });
        expect((await call("get_habits", {})).habits[0].emoji).toBe("🧘");
        await call("set_habit_emoji", { habitId: habit.id, emoji: null });
        expect((await call("get_habits", {})).habits[0].emoji).toBeUndefined();

        const other = await createUser();
        const otherTools = buildToolRegistry({} as never, other, { timezone: "UTC", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" }) as any;
        expect((await otherTools.set_habit_emoji.execute({ habitId: habit.id, emoji: "💀" }, { toolCallId: "o2", messages: [] })).ok).toBe(false);
    });
});

describe("sections", () => {
    it("adds sections in order, sorts tasks in and out, renames, reorders, and deletes keeping the tasks", async () => {
        const { projectId } = await call("create_project", { name: "Semester" });
        await call("create_sections", { projectId, names: ["Existing"] });
        const { sections } = await call("create_sections", { projectId, names: ["Readings", "Labs"] });
        const [readings, labs] = sections.map((s: any) => s.sectionId);
        const { created } = await call("create_tasks", { tasks: [{ title: "Ch 1", projectId }, { title: "Lab 1", projectId }] });
        const [ch1, lab1] = created.map((t: any) => t.taskId);

        await call("update_tasks", { taskIds: [ch1], patch: { sectionId: readings } });
        await call("update_tasks", { taskIds: [lab1], patch: { sectionId: labs } });
        await call("update_tasks", { taskIds: [ch1], patch: { sectionId: labs } });
        await call("update_tasks", { taskIds: [ch1], patch: { sectionId: null } });
        expect((await api("GET", `/${ch1}`)).body.data.sectionId).toBeNull();

        await call("update_section", { sectionId: labs, name: "Lab work", position: 1 });
        const names = async () => (await call("get_projects", { projectId })).projects[0].sections.map((s: any) => s.name);
        expect(await names()).toEqual(["Lab work", "Existing", "Readings"]);
        await call("update_section", { sectionId: labs, position: 99 });
        expect(await names()).toEqual(["Existing", "Readings", "Lab work"]);

        expect(await call("delete_section", { sectionId: labs })).toEqual({ deleted: "Lab work", tasksUnsectioned: 1 });
        expect((await api("GET", `/${lab1}`)).body.data).toMatchObject({ projectId, sectionId: null });
        expect(await names()).toEqual(["Existing", "Readings"]);
    });

    it("never touches another user's list or section", async () => {
        const { projectId } = await call("create_project", { name: "Mine" });
        const { sections } = await call("create_sections", { projectId, names: ["A"] });
        const other = await createUser();
        const otherTools = buildToolRegistry({} as never, other, { timezone: "UTC", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" }) as any;
        const run = (name: string, input: unknown) => otherTools[name].execute(input, { toolCallId: `o-${name}`, messages: [] });
        expect((await run("create_sections", { projectId, names: ["X"] })).ok).toBe(false);
        expect((await run("update_section", { sectionId: sections[0].sectionId, name: "X" })).ok).toBe(false);
        expect((await run("delete_section", { sectionId: sections[0].sectionId })).ok).toBe(false);
        expect((await call("get_projects", { projectId })).projects[0].sections.map((s: any) => s.name)).toEqual(["A"]);
    });
});
