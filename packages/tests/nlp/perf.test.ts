import { describe, expect, it } from "vitest";
import { parse } from "@cadence/nlp";
import { resolveDraft } from "@cadence/domain/nlp-draft";
import { CLOCK, ZONE } from "./corpus";

// A named, honest measurement: warm parse + draft of a 200-character title against 500 lists and 2,000 tags.
describe("parse performance (this machine, node, warm)", () => {
    it("stays far from a regression for a 200-character input with 500 lists / 2,000 tags", () => {
        const context = {
            projects: Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, name: `List ${i} ${["Work", "Home", "Garden", "Study"][i % 4]}` })),
            tags: Array.from({ length: 2000 }, (_, i) => ({ id: `t${i}`, name: `tag${i}` })),
        };
        const input = "Prepare the quarterly review deck with the finance team tomorrow at 3pm for 45 minutes p2 in List 42 Work tag it tag7 waiting on Priya and follow the notes from the August planning thread over the weekend";
        expect(input.length).toBeGreaterThanOrEqual(190);
        const times: number[] = [];
        for (let i = 0; i < 120; i++) {
            const t0 = performance.now();
            const r = parse({ input, sourceSurface: "inline_add", clock: CLOCK, context });
            resolveDraft(input, r.entities, {}, { zone: ZONE, capabilities: new Set(["dueDate", "scheduledStart", "scheduledEnd", "priority", "projectId", "tagIds", "waitingOn", "durationMinutes"]) });
            times.push(performance.now() - t0);
        }
        const warm = times.slice(20).sort((a, b) => a - b);
        const p95 = warm[Math.floor(warm.length * 0.95)];
        console.info(`parse+draft p50 ${warm[Math.floor(warm.length / 2)].toFixed(2)}ms p95 ${p95.toFixed(2)}ms`);
        // The 25ms budget is a measurement on an idle machine (see docs); under parallel CI load this only guards against an order-of-magnitude regression.
        expect(p95).toBeLessThan(250);
    }, 60_000); // 120 runs under the four-zone parallel matrix can pass 5s of wall time; p95 is the check
});
