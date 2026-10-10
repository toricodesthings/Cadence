/**
 * Prompt caching on the wire: what the real OpenRouter provider sends for each
 * chat model, and how the cache usage it reports comes back for metering.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText, tool } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { chatInstructions, chatModelSettings } from "../../src/domains/ai/agent";
import { readMeteredTokens } from "../../src/domains/ai/safety/rate-limit";
import type { Env } from "../../src/types/env";

const env = { AI_CHAT_MODEL: "anthropic/claude-haiku-5.5", OPENROUTER_API_KEY: "k" } as Env;
const usage = { prompt_tokens: 20_000, completion_tokens: 10, total_tokens: 20_010, prompt_tokens_details: { cached_tokens: 15_000, cache_write_tokens: 500 } };

/** Run one call through the real provider; returns the request body it sent and the SDK's usage. */
async function send(modelId: string) {
    const bodies: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({
            id: "gen-1",
            model: modelId,
            created: 0,
            choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
            usage,
        }), { headers: { "content-type": "application/json" } });
    }));
    const model = createOpenRouter({ apiKey: "k" })(modelId, chatModelSettings(env, modelId, "user-hash"));
    const result = await generateText({
        model,
        instructions: chatInstructions("STATIC SYSTEM PROMPT", modelId),
        tools: { get_tasks: tool({ description: "Read tasks", inputSchema: z.object({}) }) },
        messages: [{ role: "user", content: "add milk" }],
    });
    return { body: bodies[0], usage: result.usage };
}

afterEach(() => vi.unstubAllGlobals());

describe("prompt caching on the wire", () => {
    it("Claude: a breakpoint after the tools + system prompt, automatic caching for the tail, Anthropic's own endpoint", async () => {
        const { body } = await send("anthropic/claude-haiku-5.5");

        expect(body.messages[0]).toEqual({
            role: "system",
            content: [{ type: "text", text: "STATIC SYSTEM PROMPT", cache_control: { type: "ephemeral" } }],
        });
        expect(body.cache_control).toEqual({ type: "ephemeral" });
        expect(body.provider).toEqual({ order: ["Anthropic"], allow_fallbacks: true });
        expect(body.tools[0].function.name).toBe("get_tasks");
    });

    it("other models: no breakpoints (they cache implicitly), the DeepInfra route", async () => {
        const { body } = await send("deepseek/deepseek-v4.1-flash");

        expect(JSON.stringify(body)).not.toContain("cache_control");
        expect(body.messages[0]).toMatchObject({ role: "system" });
        expect(body.provider).toEqual({ order: ["DeepInfra"], allow_fallbacks: true });
    });

    it("cache usage comes back split out, and the budget meters it at its price", async () => {
        const { usage: reported } = await send("anthropic/claude-haiku-5.5");

        expect(reported.inputTokenDetails).toMatchObject({ cacheReadTokens: 15_000, cacheWriteTokens: 500 });
        // 4,500 plain + 1,500 read + 625 written + 10 out, not the raw 20,010.
        expect(readMeteredTokens({ metadata: { totalUsage: reported } })).toBe(6_635);
    });
});
