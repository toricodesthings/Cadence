/**
 * §13.1 & §13.3 Acceptance: Ranking determinism and explainability
 *
 * - Same inputs → same output order and scores (deterministic)
 * - Route dampening affects scores predictably
 * - Low-stimulation mode keeps tasks closer to manual order
 * - Reasons are always present and correct
 */
import { describe, it, expect } from "vitest";
import {
    rankTasks,
    type RankableTask,
    type RankedTask,
} from "@cadence/nlp/ranking";

const NOW = new Date("2026-03-26T10:00:00");

/** Helper: format a Date as YYYY-MM-DDT12:00:00 to avoid UTC date-shift when parsed back */
function localDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T12:00:00`;
}

const TODAY = localDateStr(NOW);
const YESTERDAY = localDateStr(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 1));
const TOMORROW = localDateStr(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 1));
const IN_2_DAYS = localDateStr(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 2));

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
        isAllDay: false,
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
        const a = rankTasks(tasks, { now: NOW, routeContext: "today" });
        const b = rankTasks(tasks, { now: NOW, routeContext: "today" });
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
        const ref = rankTasks(tasks, { now: NOW });
        const refIds = ref.map((r) => r.task.id);
        for (let i = 0; i < 100; i++) {
            const result = rankTasks(tasks, { now: NOW });
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
        const result = rankTasks(tasks, { now: NOW });
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
        const result = rankTasks(tasks, { now: NOW });
        const high = result.find((r) => r.task.id === "high")!;
        expect(high.reasons).toContain("high_priority");
    });

    it("quick-win tasks get quick_win reason", () => {
        const tasks = [
            makeTask({ id: "quick", effort: 1, orderIndex: 0 }),
        ];
        const result = rankTasks(tasks, { now: NOW });
        expect(result[0].reasons).toContain("quick_win");
    });

    it("pinned tasks get pinned reason", () => {
        const tasks = [makeTask({ id: "pinned", isPinned: true })];
        const result = rankTasks(tasks, { now: NOW });
        expect(result[0].reasons).toContain("pinned");
    });

    it("waiting tasks get negative score adjustment", () => {
        const waiting = makeTask({ id: "w", waitingOn: "Bob", orderIndex: 0 });
        const normal = makeTask({ id: "n", orderIndex: 1 });
        const result = rankTasks([waiting, normal], { now: NOW });
        const w = result.find((r) => r.task.id === "w")!;
        const n = result.find((r) => r.task.id === "n")!;
        expect(w.score).toBeLessThan(n.score);
        expect(w.reasons).toContain("waiting");
    });

    it("not-before tasks get penalty when deferred to the future", () => {
        const tasks = [
            makeTask({ id: "deferred", notBefore: TOMORROW }),
        ];
        const result = rankTasks(tasks, { now: NOW });
        expect(result[0].score).toBeLessThan(0);
        expect(result[0].reasons).toContain("not_yet");
    });

    it("scheduled-now tasks score higher than unscheduled", () => {
        const tasks = [
            makeTask({ id: "now", scheduledStart: "2026-03-26T10:15:00", orderIndex: 1 }),
            makeTask({ id: "plain", orderIndex: 0 }),
        ];
        const result = rankTasks(tasks, { now: NOW });
        expect(result[0].task.id).toBe("now");
        expect(result[0].reasons).toContain("scheduled_now");
    });
});

describe("rankTasks route dampening", () => {
    it("today route uses full scores (dampen = 1.0)", () => {
        const tasks = [makeTask({ id: "a", dueDate: TODAY })];
        const today = rankTasks(tasks, { now: NOW, routeContext: "today" });
        const inbox = rankTasks(tasks, { now: NOW, routeContext: "inbox" });
        // inbox dampen = 0.4, today = 1.0
        expect(today[0].score).toBeGreaterThan(inbox[0].score);
    });

    it("inbox route dampens scores significantly", () => {
        const tasks = [makeTask({ id: "a", dueDate: TODAY })];
        const today = rankTasks(tasks, { now: NOW, routeContext: "today" });
        const inbox = rankTasks(tasks, { now: NOW, routeContext: "inbox" });
        expect(inbox[0].score).toBeCloseTo(today[0].score * 0.4, 5);
    });
});

describe("rankTasks low-stimulation mode", () => {
    it("halves score deltas in low-stimulation mode", () => {
        const tasks = [makeTask({ id: "a", dueDate: TODAY })];
        const normal = rankTasks(tasks, { now: NOW, routeContext: "today" });
        const lowStim = rankTasks(tasks, { now: NOW, routeContext: "today", lowStimulation: true });
        expect(lowStim[0].score).toBeCloseTo(normal[0].score * 0.5, 5);
    });

    it("preserves relative ordering in low-stimulation mode", () => {
        const tasks = [
            makeTask({ id: "high", priority: 4, orderIndex: 2 }),
            makeTask({ id: "overdue", dueDate: YESTERDAY, orderIndex: 1 }),
            makeTask({ id: "plain", orderIndex: 0 }),
        ];
        const normal = rankTasks(tasks, { now: NOW });
        const lowStim = rankTasks(tasks, { now: NOW, lowStimulation: true });
        expect(normal.map((r) => r.task.id)).toEqual(lowStim.map((r) => r.task.id));
    });
});
