import { describe, expect, it } from "vitest";
import { loadSnapshot } from "../../src/domains/ai/agent";

const tool = (result: unknown) => ({ execute: async () => result });

describe("loadSnapshot", () => {
    it("merges routine times, keeps this week's events and drops a failed read", async () => {
        const tools = {
            get_schedule_window: tool({ range: {}, tasks: [{ id: "t1" }], routines: [{ id: "h1", targetTime: "07:30" }] }),
            get_tasks: tool({ ok: false, tool: "get_tasks", error: "failed" }),
            get_habit_status_today: tool({ date: "2026-09-26", statuses: [{ habitId: "h1", status: "PENDING" }] }),
            get_inbox_items: tool({ items: [] }),
            get_events: tool({ events: [{ id: "e1", daysUntil: 3 }, { id: "e2", daysUntil: 30 }] }),
        };
        const snapshot = JSON.parse(await loadSnapshot(tools as never, "2026-09-26"));
        expect(snapshot).toEqual({
            schedule: { tasks: [{ id: "t1" }] },
            routines: [{ habitId: "h1", status: "PENDING", targetTime: "07:30" }],
            capture: { items: [] },
            events: [{ id: "e1", daysUntil: 3 }],
        });
    });
});
