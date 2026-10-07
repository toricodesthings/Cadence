import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { RRule as moduleRule } from "rrule/dist/esm/index.js";

const { RRule: commonjsRule } = createRequire(import.meta.url)("rrule") as { RRule: typeof moduleRule };

describe.each([["CommonJS", commonjsRule], ["ES module", moduleRule]] as const)("rrule sparse-search patch (%s)", (_name, Rule) => {
    it("counts a day selected by positive and negative positions only once", () => {
        const rule = new Rule({ freq: Rule.DAILY, dtstart: new Date("2026-10-07T00:00:00Z"), bysetpos: [1, -1], count: 2 });
        expect(rule.all().map((date) => date.toISOString())).toEqual(["2026-10-07T00:00:00.000Z", "2026-10-08T00:00:00.000Z"]);
    });

    it.each(["between", "before", "until"] as const)("bounds %s even when no candidate reaches the result callback", (method) => {
        const end = new Date("2026-10-08T00:00:00Z");
        const start = new Date("2026-10-07T00:00:00Z");
        const rule = new Rule({ freq: Rule.DAILY, dtstart: start, bymonth: [2], bymonthday: [30], ...(method === "until" ? { until: end } : {}) });
        let inspected = 0;
        Object.defineProperty(rule.options, "bymonth", { get() {
            // Deterministic guard: without the patch this search continues to
            // year 9999. Fail promptly instead of running a CPU-exhaustion PoC.
            if (++inspected > 1000) throw new Error("Search escaped its year boundary");
            return [2];
        } });
        if (method === "between") expect(rule.between(start, end, true)).toEqual([]);
        else if (method === "before") expect(rule.before(end, true)).toBeNull();
        else expect(rule.all()).toEqual([]);
        expect(inspected).toBeLessThan(1000);
    });
});
