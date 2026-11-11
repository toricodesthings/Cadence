import { describe, expect, it } from "vitest";
import { DEFAULT_DEFINITION } from "@cadence/nlp/focus-views";
import { applyFocusView } from "@cadence/nlp/focus-views/apply";

const task = (id: string, state: string, waitingOn: string | null) => ({
    id, state, waitingOn, projectId: null, dueDate: null, scheduledStart: null, priority: 0, effort: null,
});

describe("Waiting only", () => {
    it("reads the state, not the name", () => {
        const waitingOnly = { ...DEFAULT_DEFINITION, states: [], waitingOnly: true };
        const ctx = { clock: { today: "2026-11-11", now: "10:00", weekStart: "Sunday" as const }, dayOf: () => "2026-11-11" };
        const shown = applyFocusView([task("released", "ACTIVE", "Sam"), task("nobody", "WAITING", null)], waitingOnly, ctx);
        expect(shown.map((t) => t.id)).toEqual(["nobody"]);
    });
});
