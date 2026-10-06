/**
 * §13.1 & §13.3 Acceptance: Ranking determinism and explainability
 *
 * - Same inputs → same output order and scores (deterministic)
 * - Reasons are always present and correct
 */
import { describe, it, expect } from "vitest";
import {
    rankTasks,
    type RankableTask,
} from "@cadence/nlp/ranking";

const NOW = new Date("2026-03-26T10:00:00Z");
const TODAY = "2026-03-26";
const YESTERDAY = "2026-03-25";
const TOMORROW = "2026-03-27";
const OPTS = { now: NOW, clock: { today: TODAY, now: "10:00", weekStart: "Sunday" as const }, dayOf: (i: string) => i.slice(0, 10) };

function makeTask(overrides: Partial<RankableTask> = {}): RankableTask {
    return {
        id: "t1",
        priority: 0,
        isPinned: false,
        orderIndex: 0,
        state: "ACTIVE",
        dueDate: null,
        scheduledStart: null,
        scheduledEnd: null,
        effort: null,
        waitingOn: null,
        notBefore: null,
        durationEstimate: null,
        ...overrides,
    };
}

describe("rankTasks determinism", () => {
    it("produces identical output for identical input", () => {
        const tasks: RankableTask[] = [
            makeTask({ id: "a", dueDate: TODAY, priority: 3 }),
            makeTask({ id: "b", isPinned: true, orderIndex: 1 }),
            makeTask({ id: "c", effort: 1, orderIndex: 2 }),
            makeTask({ id: "d", orderIndex: 3 }),
        ];
        const a = rankTasks(tasks, { ...OPTS, routeContext: "today" });
        const b = rankTasks(tasks, { ...OPTS, routeContext: "today" });
        expect(a.map((r) => r.task.id)).toEqual(b.map((r) => r.task.id));
        expect(a.map((r) => r.score)).toEqual(b.map((r) => r.score));
    });

    it("is stable across 100 iterations", () => {
        const tasks: RankableTask[] = [
            makeTask({ id: "a", dueDate: YESTERDAY, priority: 4 }),
            makeTask({ id: "b", dueDate: TODAY, isPinned: true }),
            makeTask({ id: "c", effort: 1, durationEstimate: 10 }),
            makeTask({ id: "d", waitingOn: "Alice" }),
            makeTask({ id: "e", notBefore: TOMORROW, orderIndex: 4 }),
        ];
        const ref = rankTasks(tasks, OPTS);
        const refIds = ref.map((r) => r.task.id);
        for (let i = 0; i < 100; i++) {
            const result = rankTasks(tasks, OPTS);
            expect(result.map((r) => r.task.id)).toEqual(refIds);
        }
    });
});

describe("rankTasks scoring signals", () => {
    it("overdue tasks score higher than due-today tasks", () => {
        const tasks = [
            makeTask({ id: "overdue", dueDate: YESTERDAY }),
            makeTask({ id: "due_today", dueDate: TODAY, orderIndex: 1 }),
        ];
        const result = rankTasks(tasks, OPTS);
        // Overdue gets +40, due_today gets +30
        expect(result[0].task.id).toBe("overdue");
        expect(result[0].reasons).toContain("overdue");
        expect(result[1].reasons).toContain("due_today");
        expect(result[0].score).toBeGreaterThan(result[1].score);
    });

    it("high priority tasks get priority reason", () => {
        const tasks = [
            makeTask({ id: "high", priority: 4, orderIndex: 1 }),
            makeTask({ id: "low", priority: 0, orderIndex: 0 }),
        ];
        const result = rankTasks(tasks, OPTS);
        const high = result.find((r) => r.task.id === "high")!;
        expect(high.reasons).toContain("high_priority");
    });

    it("quick-win tasks get quick_win reason", () => {
        const tasks = [
            makeTask({ id: "quick", effort: 1, orderIndex: 0 }),
        ];
        const result = rankTasks(tasks, OPTS);
        expect(result[0].reasons).toContain("quick_win");
    });

    it("pinned tasks get pinned reason", () => {
        const tasks = [makeTask({ id: "pinned", isPinned: true })];
        const result = rankTasks(tasks, OPTS);
        expect(result[0].reasons).toContain("pinned");
    });

    it("waiting tasks get negative score adjustment", () => {
        const waiting = makeTask({ id: "w", waitingOn: "Bob", orderIndex: 0 });
        const normal = makeTask({ id: "n", orderIndex: 1 });
        const result = rankTasks([waiting, normal], OPTS);
        const w = result.find((r) => r.task.id === "w")!;
        const n = result.find((r) => r.task.id === "n")!;
        expect(w.score).toBeLessThan(n.score);
        expect(w.reasons).toContain("waiting");
    });

    it("not-before tasks get penalty when deferred to the future", () => {
        const tasks = [
            makeTask({ id: "deferred", notBefore: TOMORROW }),
        ];
        const result = rankTasks(tasks, OPTS);
        expect(result[0].score).toBeLessThan(0);
        expect(result[0].reasons).toContain("not_yet");
    });

    it("scheduled-now tasks score higher than unscheduled", () => {
        const tasks = [
            makeTask({ id: "now", scheduledStart: "2026-03-26T10:15:00Z", orderIndex: 1 }),
            makeTask({ id: "plain", orderIndex: 0 }),
        ];
        const result = rankTasks(tasks, OPTS);
        expect(result[0].task.id).toBe("now");
        expect(result[0].reasons).toContain("scheduled_now");
    });
});

describe("rankTasks days", () => {
    it("derives a scheduled task's day through the injected dayOf", () => {
        const t = makeTask({ id: "s", scheduledStart: "2026-03-27T02:00:00Z" });
        const toronto = (i: string) => (i.startsWith("2026-03-27T02") ? "2026-03-26" : i.slice(0, 10));
        expect(rankTasks([t], { ...OPTS, dayOf: toronto })[0].reasons).toContain("due_today");
        expect(rankTasks([t], OPTS)[0].reasons).not.toContain("due_today");
    });

    it("flags due_soon by whole days", () => {
        expect(rankTasks([makeTask({ dueDate: "2026-03-29" })], OPTS)[0].reasons).toContain("due_soon");
        expect(rankTasks([makeTask({ dueDate: "2026-03-30" })], OPTS)[0].reasons).not.toContain("due_soon");
    });
});
