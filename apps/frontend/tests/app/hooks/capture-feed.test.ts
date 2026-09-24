import { describe, it, expect, vi } from "vitest";
import type { InboxItem } from "@cadence/contracts/inbox";
import type { Task } from "@cadence/contracts/task";
vi.mock("../../../app/hooks/inbox/use-inbox", () => ({ useInbox: vi.fn() }));
vi.mock("../../../app/hooks/tasks/use-tasks", () => ({ useTasks: vi.fn() }));
import { captureFeed } from "../../../app/hooks/inbox/use-capture-feed";
describe("Capture count", () => {
    it("counts only recent thoughts and active undated tasks without lists", () => {
        const now = new Date("2026-09-23T12:00:00Z").getTime();
        const items = [
            { id: "new", captureStatus: "clarifying", createdAt: "2026-09-23T10:00:00Z" },
            { id: "old", captureStatus: "clarifying", createdAt: "2026-09-01T10:00:00Z" },
            { id: "kept", captureStatus: "kept", createdAt: "2026-09-23T10:00:00Z" },
            { id: "discarded", captureStatus: "discarded", createdAt: "2026-09-23T10:00:00Z" },
        ] as InboxItem[];
        const base = { state: "ACTIVE", projectId: null, dueDate: null, scheduledStart: null, interactionMode: "task" };
        const tasks = [{ ...base, id: "plain" }, { ...base, id: "dated", dueDate: "2026-09-24" }, { ...base, id: "listed", projectId: "list" }, { ...base, id: "done", state: "COMPLETE" }, { ...base, id: "fixed", interactionMode: "timetable" }] as Task[];
        const feed = captureFeed(items, tasks, now);
        expect(feed.count).toBe(2);
        expect(feed.thoughts.map(i => i.id)).toEqual(["new"]);
        expect(feed.older.map(i => i.id)).toEqual(["old"]);
        expect(feed.tasks.map(t => t.id)).toEqual(["plain"]);
    });
});
