import { describe, expect, it } from "vitest";
import { asSchema, type ToolSet } from "ai";
import { SETTINGS_DEFAULTS } from "@cadence/contracts/settings";
import { buildToolRegistry } from "../../src/domains/ai/tools/index";
import { chatTools } from "../../src/domains/ai/agent";
import { composePrompt } from "../../src/domains/ai/prompt/prompt-composer";
import { PROMPT_BLOCKS } from "../../src/domains/ai/prompt/prompt-blocks";
import type { Env } from "../../src/types/env";

describe("serialized prompt budget", () => {
    it("measures tools/system/context separately and retains all fields and facts in the packaging candidate", async () => {
        const tools: ToolSet = chatTools(buildToolRegistry({} as Env, "fixture", {
            timezone: "America/Toronto", today: "2026-10-13", currentDate: "2026-10-13T18:00:00Z", nullableOptionals: false,
        }), true);
        const definitions = await Promise.all(Object.entries(tools).map(async ([name, t]) => ({ name, description: t.description, schema: await asSchema(t.inputSchema).jsonSchema })));
        const toolChars = JSON.stringify(definitions).length;
        const context = {
            timezone: "America/Toronto", now: "2026-10-13 14:00 -04:00 (Tuesday)", locale: "en-CA", weekStart: "Monday" as const,
            approvalMode: "full" as const, workloadHigh: false, persona: { ...SETTINGS_DEFAULTS.assistant, memoryMode: "basic" as const }, memoryOff: false,
            snapshot: JSON.stringify({ schedule: { tasks: Array.from({ length: 5 }, (_, i) => ({ id: `task-${i}`, title: `Fixture task ${i}`, dueDate: "2026-10-13", state: "ACTIVE" })) }, overdue: { tasks: [] }, routines: [], capture: { items: [] }, events: [] }),
            memories: Array.from({ length: 4 }, (_, i) => ({ id: `fact-${i}`, content: `Fixture personal fact ${i}`, saidOn: "2026-08-12", sensitive: i === 2, stale: i === 3 })),
        };
        const baseline = composePrompt(PROMPT_BLOCKS, context, "fixture");
        const candidate = composePrompt(PROMPT_BLOCKS, context, "fixture", "static-memory");
        // Character budgets detect accidental prompt bloat; they are not claimed token counts or prices.
        expect(toolChars).toBeLessThan(50_000);
        expect(baseline.instructions.length).toBeLessThan(20_000);
        expect(candidate.instructions.length).toBeLessThan(22_000);
        expect(baseline.turnContext.length).toBeLessThan(5_000);
        expect(candidate.turnContext.length).toBeLessThan(baseline.turnContext.length * 0.75);
        for (const fact of context.memories) {
            expect(candidate.turnContext).toContain(fact.id);
            expect(candidate.turnContext).toContain(fact.content);
        }
        expect(candidate.turnContext).toContain("sensitive");
        expect(candidate.turnContext).toContain("not mentioned in over a year");
        expect(candidate.turnContext).toContain(context.snapshot);
        expect(definitions).toHaveLength(46);
        expect(definitions.every((d) => d.schema)).toBe(true);
    });
});
