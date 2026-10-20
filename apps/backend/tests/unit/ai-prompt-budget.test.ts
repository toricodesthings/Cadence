import { afterEach, describe, expect, it, vi } from "vitest";
import { asSchema, generateText, type ToolSet } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { SETTINGS_DEFAULTS } from "@cadence/contracts/settings";
import { buildToolRegistry } from "../../src/domains/ai/tools/index";
import { chatInstructions, chatModelSettings, chatTools } from "../../src/domains/ai/agent";
import { composePrompt } from "../../src/domains/ai/prompt/prompt-composer";
import { PROMPT_BLOCKS } from "../../src/domains/ai/prompt/prompt-blocks";
import type { Env } from "../../src/types/env";

afterEach(() => vi.unstubAllGlobals());

describe("serialized prompt budget", () => {
    it("measures tools/system/context separately and retains all fields and facts", async () => {
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
        const candidate = composePrompt(PROMPT_BLOCKS, context, "fixture");
        // Character budgets detect accidental prompt bloat; they are not claimed token counts or prices.
        expect(toolChars).toBeLessThan(50_000);
        expect(candidate.instructions.length).toBeLessThan(22_000);
        expect(candidate.turnContext.length).toBeLessThan(3_500);
        for (const fact of context.memories) {
            expect(candidate.turnContext).toContain(fact.id);
            expect(candidate.turnContext).toContain(fact.content);
        }
        expect(candidate.turnContext).toContain("sensitive");
        expect(candidate.turnContext).toContain("not mentioned in over a year");
        expect(candidate.turnContext).toContain(context.snapshot);
        expect(definitions).toHaveLength(46);
        expect(definitions.every((d) => d.schema)).toBe(true);
        // Measure the actual native-provider serialization, not an estimate of schema bytes.
        const bodies: any[] = [];
        vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
            bodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({ id: "fixture", model: "anthropic/fixture", created: 0,
                choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { headers: { "content-type": "application/json" } });
        }));
        const modelId = "anthropic/fixture";
        const env = { AI_CHAT_MODEL: modelId } as Env;
        const model = createOpenRouter({ apiKey: "fixture" })(modelId, chatModelSettings(env, modelId, "fixture"));
        await generateText({ model, tools,
            instructions: chatInstructions(candidate.instructions, modelId),
            messages: [{ role: "user", content: `Fixture request\n\n${candidate.turnContext}` }] });
        expect(JSON.stringify(bodies[0].tools).length).toBeLessThan(50_000);
        expect(JSON.stringify(bodies[0].messages).length).toBeLessThan(22_000);
        if (process.env.AI_PROMPT_BUDGET_REPORT === "true") process.stdout.write(`${JSON.stringify({
            tools: JSON.stringify(bodies[0].tools).length,
            system: candidate.instructions.length, context: candidate.turnContext.length, wireBody: JSON.stringify(bodies[0]).length,
        })}\n`);
    });
});
