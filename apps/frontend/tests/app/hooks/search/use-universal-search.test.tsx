import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { useUniversalSearch } from "../../../../app/hooks/search/use-universal-search";

const data = vi.hoisted(() => ({ tasks: [] as Task[], notes: [] as { taskId: string; terms: string[]; headings: string[] }[], indexBuilds: vi.fn() }));
vi.mock("@cadence/search", async (original) => {
    const actual = await original<typeof import("@cadence/search")>();
    return { ...actual, createSearchIndex: (...args: Parameters<typeof actual.createSearchIndex>) => { data.indexBuilds(); return actual.createSearchIndex(...args); } };
});
vi.mock("../../../../app/hooks/tasks/use-tasks", () => ({ useTasks: () => ({ data: data.tasks }) }));
vi.mock("../../../../app/hooks/tasks/use-subtasks", () => ({ useSubtasksByTaskIds: () => ({}) }));
vi.mock("../../../../app/hooks/habits/use-habits", () => ({ useAllHabits: () => ({}) }));
vi.mock("../../../../app/hooks/inbox/use-inbox", () => ({ useInbox: () => ({}) }));
vi.mock("../../../../app/hooks/projects/use-projects", () => ({ useProjects: () => ({}) }));
vi.mock("../../../../app/hooks/sections/use-sections", () => ({ useSections: () => ({}) }));
vi.mock("../../../../app/hooks/tags/use-tags", () => ({ useTags: () => ({}) }));
vi.mock("../../../../app/hooks/search/use-search-notes", () => ({ useSearchNotes: () => ({ data: data.notes }) }));
vi.mock("../../../../app/stores/focus-view-store", () => {
    const savedViews: never[] = [];
    return { useFocusViewStore: (select: (state: { savedViews: never[] }) => unknown) => select({ savedViews }) };
});
vi.mock("../../../../app/lib/utils/user-zone", () => ({ today: () => "2026-10-12" }));

const task = (id: string, title: string, extra: Partial<Task> = {}) => ({ id, title, state: "ACTIVE", tagIds: [], content: "", ...extra }) as Task;
beforeEach(() => {
    data.tasks = [task("release", "Implement 0.31.0"), task("decoy", "Implement 0.31.01")];
    data.notes = [];
    data.indexBuilds.mockClear();
});

describe("universal search integration", () => {
    it("reuses the index across keystrokes and never matches a nearby version", async () => {
        const hook = renderHook(({ query }) => useUniversalSearch(query, true), { initialProps: { query: "implementation 0.31.0" } });
        expect(hook.result.current.results.tasks.map((item) => item.id)).toEqual(["task-release"]);
        const builds = data.indexBuilds.mock.calls.length;
        hook.rerender({ query: "0.31.0" });
        await waitFor(() => expect(hook.result.current.query).toBe("0.31.0"));
        expect(data.indexBuilds).toHaveBeenCalledTimes(builds);
        hook.rerender({ query: "0.33.0" });
        await waitFor(() => expect(hook.result.current.query).toBe("0.33.0"));
        expect(hook.result.current.results.tasks).toEqual([]);
    });
    it("opens a canonical heading and drops replaced or cleared note terms", async () => {
        data.tasks = [task("note", "Checklist", { content: "obsoleteword" })];
        data.notes = [{ taskId: "note", terms: ["deployment", "0.35.0"], headings: ["Deployment"] }];
        const hook = renderHook(({ query }) => useUniversalSearch(query, true), { initialProps: { query: "deployment" } });
        expect(hook.result.current.results.tasks[0]?.noteAction).toEqual({ taskId: "note", taskTitle: "Checklist", scrollToHeading: "Deployment" });
        data.notes = [{ taskId: "note", terms: [], headings: [] }];
        hook.rerender({ query: "obsoleteword" });
        await waitFor(() => expect(hook.result.current.query).toBe("obsoleteword"));
        expect(hook.result.current.results.tasks).toEqual([]);
        hook.rerender({ query: "deployment" });
        await waitFor(() => expect(hook.result.current.query).toBe("deployment"));
        expect(hook.result.current.results.tasks).toEqual([]);
    });
    it("refreshes changed documents and retains closed-task routing", async () => {
        const hook = renderHook(() => useUniversalSearch("0.31.0", true));
        data.tasks = [task("release", "Implement 0.31.0", { state: "COMPLETE" })];
        hook.rerender();
        expect(hook.result.current.results.tasks[0]?.route).toBe("/completed");
        data.tasks = [task("other-account", "Buy groceries")];
        hook.rerender();
        expect(hook.result.current.results.tasks).toEqual([]);
    });
    it("uses the series owner's canonical note for an occurrence", () => {
        data.tasks = [task("occurrence", "Weekly check", { seriesId: "series" })];
        data.notes = [{ taskId: "series", terms: ["deployment"], headings: [] }];
        const hook = renderHook(() => useUniversalSearch("deployment", true));
        expect(hook.result.current.results.tasks[0]?.noteAction?.taskId).toBe("occurrence");
    });
    it("retains navigation aliases and last-word prefix searching", () => {
        data.tasks = [task("passport", "Renew passport")];
        const navigation = renderHook(() => useUniversalSearch("habits", true));
        expect(navigation.result.current.results.pages[0]?.route).toBe("/routines");
        const search = renderHook(() => useUniversalSearch("renew pass", true));
        expect(search.result.current.results.tasks[0]?.id).toBe("task-passport");
    });
});
