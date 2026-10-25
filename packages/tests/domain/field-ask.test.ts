import { describe, expect, it } from "vitest";
import { fieldAskOpen, settleFieldAsk } from "@cadence/domain/field-ask";

describe("field-question back-off", () => {
    it("is open until a question is typed past, then waits 7 days, and 30 after two misses in a row", () => {
        expect(fieldAskOpen(undefined, "2026-10-23")).toBe(true);
        expect(fieldAskOpen({ lastOn: "2026-10-22", misses: 0 }, "2026-10-23")).toBe(true);
        expect(fieldAskOpen({ lastOn: "2026-10-20", misses: 1 }, "2026-10-26")).toBe(false);
        expect(fieldAskOpen({ lastOn: "2026-10-20", misses: 1 }, "2026-10-27")).toBe(true);
        expect(fieldAskOpen({ lastOn: "2026-10-01", misses: 2 }, "2026-10-30")).toBe(false);
        expect(fieldAskOpen({ lastOn: "2026-10-01", misses: 2 }, "2026-10-31")).toBe(true);
    });

    it("a tapped option answers the waiting question, anything else is a miss, and nothing waiting changes nothing", () => {
        const waiting = { priority: { lastOn: "2026-10-23", misses: 1, labels: ["Essay draft", "None in particular"] } };
        expect(settleFieldAsk(waiting, "  essay   DRAFT ")).toEqual({ state: { priority: { lastOn: "2026-10-23", misses: 0 } }, answered: "priority" });
        expect(settleFieldAsk(waiting, "the essay draft I think")?.answered).toBe("priority");
        expect(settleFieldAsk(waiting, "actually, move my dentist")).toEqual({ state: { priority: { lastOn: "2026-10-23", misses: 2 } } });
        expect(settleFieldAsk({ priority: { lastOn: "2026-10-23", misses: 0 } }, "hi")).toBeNull();
        expect(settleFieldAsk(waiting, "")).toBeNull();
        expect(settleFieldAsk(null, "hi")).toBeNull();
    });
});
