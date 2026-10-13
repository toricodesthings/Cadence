import { describe, expect, it, vi } from "vitest";
import { loadSnapshot } from "../../src/domains/ai/turn";

const tool = (result: unknown) => ({ execute: async () => result });

describe("loadSnapshot", () => {
    it("uses preloaded event projection without making another settings read", async () => {
        const readEvents = vi.fn(async () => ({ events: [] }));
        const tools = {
            get_schedule_window: tool({ tasks: [], routines: [] }), get_tasks: tool({ tasks: [] }),
            get_habit_status_today: tool({ statuses: [] }), get_inbox_items: tool({ items: [] }), get_events: { execute: readEvents },
        };
        const events = { today: "2026-09-26", shownOnCalendar: false, events: [{ id: "e1", daysUntil: 3 }] };
        const fresh = await loadSnapshot({ ...tools, get_events: tool(events) } as never, "2026-09-26");
        const reused = await loadSnapshot(tools as never, "2026-09-26", events as never);
        expect(reused).toBe(fresh);
        expect(readEvents).not.toHaveBeenCalled();
    });

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
