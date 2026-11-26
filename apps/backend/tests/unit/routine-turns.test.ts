import { describe, expect, it } from "vitest";
import { reanchoredOrder, turnFor, turnOrderOf } from "../../src/domains/habits/routine-turns";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const C = "00000000-0000-4000-8000-000000000003";

describe("routine turn calculation", () => {
    it("alternates over daily, weekday, and every-3-days rules with 2 and 3 people", () => {
        const daily = { recurrenceRule: "FREQ=DAILY", createdAt: "2026-01-01T00:00:00Z", turnsFrom: "2026-03-02" };
        expect(turnFor(daily, [A, B], "2026-03-02", "UTC")).toBe(A);
        expect(turnFor(daily, [A, B], "2026-03-03", "UTC")).toBe(B);
        expect(turnFor(daily, [A, B], "2026-03-04", "UTC")).toBe(A);
        expect(turnFor(daily, [A, B, C], "2026-03-04", "UTC")).toBe(C);
        expect(turnFor(daily, [A, B, C], "2026-03-05", "UTC")).toBe(A);

        const weekdays = {
            recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
            createdAt: "2026-01-01T00:00:00Z",
            turnsFrom: "2026-03-02",
        };
        expect(turnFor(weekdays, [A, B, C], "2026-03-02", "UTC")).toBe(A);
        expect(turnFor(weekdays, [A, B, C], "2026-03-06", "UTC")).toBe(B);
        expect(turnFor(weekdays, [A, B, C], "2026-03-09", "UTC")).toBe(C);

        const every3 = {
            recurrenceRule: "FREQ=DAILY;INTERVAL=3",
            createdAt: "2026-03-01T00:00:00Z",
            turnsFrom: "2026-03-01",
        };
        expect(turnFor(every3, [A, B], "2026-03-01", "UTC")).toBe(A);
        expect(turnFor(every3, [A, B], "2026-03-04", "UTC")).toBe(B);
        expect(turnFor(every3, [A, B], "2026-03-07", "UTC")).toBe(A);
    });

    it("turnOrderOf drops departed ids and appends new participants", () => {
        expect(turnOrderOf({ userId: A, turnOrder: [B, C] }, [A, B])).toEqual([B, A]);
        expect(turnOrderOf({ userId: A, turnOrder: null }, [A, B, C])).toEqual([A, B, C]);
    });

    it("reanchoredOrder rotates so today's turn holder stays first", () => {
        const habit = {
            userId: A,
            recurrenceRule: "FREQ=DAILY",
            createdAt: "2026-01-01T00:00:00Z",
            turnOrder: [A, B],
            turnsFrom: "2026-03-01",
        };
        expect(reanchoredOrder(habit, [A, B], [A, B, C], "2026-03-02", "UTC")).toEqual([B, C, A]);
        expect(reanchoredOrder(habit, [A, B, C], [A, C], "2026-03-02", "UTC")).toEqual([A, C]);
    });
});
