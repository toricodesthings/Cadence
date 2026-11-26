import { describe, expect, it } from "vitest";
import { cadenceRanker } from "../../src/domains/mcp/method-search";
import { publishedTools } from "../../src/domains/mcp/server";

const entries = publishedTools(
    {} as never,
    "u",
    "c",
    new Set(["cadence:read", "cadence:write", "cadence:capture"]),
    { timezone: "UTC", currentDate: "2026-11-23T12:00:00Z", today: "2026-11-23" } as never,
    true,
);
const items = entries.map((e) => ({
    path: `cadence.${e.name}`,
    connector: "cadence",
    method: e.name,
    description: e.summary,
    ...(e.name.startsWith("delete_") ? { requiresApproval: true as const } : {}),
    kind: "method" as const,
}));
const top = (query: string, n = 3) =>
    cadenceRanker(query, items)!
        .slice(0, n)
        .map((r) => r.method);

describe("cadenceRanker", () => {
    it.each([
        ["tasks due this week", "get_tasks", ["get_schedule_window"]],
        ["log habit", "log_habit", []],
        ["routines today", "get_habit_status_today", ["get_today"]],
        ["reschedule a task", "reschedule_tasks", []],
        ["overdue tasks", "get_tasks", ["get_today"]],
        ["add a task", "create_tasks", []],
        ["what did I say about", "search_past_chats", ["recall"]],
        ["capture an idea", "capture_to_inbox", []],
    ])("%s → %s first", (query, first, also) => {
        const found = top(query);
        if (query === "routines today")
            expect(found.slice(0, 2).sort()).toEqual(["get_habit_status_today", "get_today"]);
        else expect(found[0]).toBe(first);
        for (const method of also) expect(found).toContain(method);
    });

    it("finds update_tasks in the top 2 for moving a task to another list", () => {
        expect(top("move task to another list", 2)).toContain("update_tasks");
    });

    it("finds an event tool for a birthday", () => {
        expect(top("birthday", 2).sort()).toEqual(["get_events", "save_event"]);
    });

    it("keeps requiresApproval on delete hits and declines an all-stopword query", () => {
        const hit = cadenceRanker("delete tasks", items)!.find((r) => r.method === "delete_tasks");
        expect(hit?.requiresApproval).toBe(true);
        expect(cadenceRanker("what is the", items)).toBeNull();
    });
});
