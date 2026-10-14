/**
 * Prompt caching on the wire: what the real OpenRouter provider sends for each
 * chat model, and how the cache usage it reports comes back for metering.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText, tool, type ModelMessage } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { chatInstructions, chatModelSettings, type CacheVariant } from "../../src/domains/ai/agent";
import { addStepSpend, readMeteredTokens } from "../../src/domains/ai/safety/rate-limit";
import { cacheFixture, waitForCacheDeadline } from "../evals/cache-fixture";
import type { Env } from "../../src/types/env";

const env = { AI_CHAT_MODEL: "anthropic/claude-haiku-5.5", OPENROUTER_API_KEY: "k" } as Env;
const usage = { prompt_tokens: 20_000, completion_tokens: 10, total_tokens: 20_010, prompt_tokens_details: { cached_tokens: 15_000, cache_write_tokens: 500 } };

/** Run one call through the real provider; returns the request body it sent and the SDK's usage. */
async function send(modelId: string, variant?: CacheVariant, messages: ModelMessage[] = [{ role: "user", content: "add milk" }], response: { model?: string; provider?: string; usage?: typeof usage } = {}) {
    const bodies: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({
            id: "gen-1",
            model: modelId,
            provider: "Anthropic",
            created: 0,
            choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
            usage,
            ...response,
        }), { headers: { "content-type": "application/json" } });
    }));
    const model = createOpenRouter({ apiKey: "k" })(modelId, chatModelSettings(env, modelId, "user-hash", variant));
    const result = await generateText({
        model,
        instructions: chatInstructions("STATIC SYSTEM PROMPT", modelId, variant),
        tools: { get_tasks: tool({ description: "Read tasks", inputSchema: z.object({}) }) },
        messages,
        include: { responseBody: true },
    });
    return { body: bodies[0], usage: result.usage, responseBody: result.response.body, servedModel: result.response.modelId, spend: addStepSpend({}, result) };
}

afterEach(() => vi.unstubAllGlobals());

describe("prompt caching on the wire", () => {
    it("rechecks the real deadline after early wakeups or a backwards clock adjustment", async () => {
        let now = 0;
        const pauses: number[] = [];
        await waitForCacheDeadline(120_000, () => now, async (ms) => {
            pauses.push(ms);
            now += pauses.length === 1 ? 10_000 : ms;
        });
        expect(now).toBe(120_000);
        expect(pauses).toEqual([60_000, 60_000, 50_000]);
    });
    it.each(["5m-5m", "1h-5m", "1h-1h"] as const)("keeps routing/reasoning/tools constant for the %s benchmark variant", async (variant) => {
        const { body } = await send("anthropic/claude-haiku-5.5", variant);
        expect(body.messages[0].content[0].cache_control).toEqual(variant === "5m-5m" ? { type: "ephemeral" } : { type: "ephemeral", ttl: "1h" });
        expect(body.cache_control).toEqual(variant === "1h-1h" ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" });
        expect(body.provider).toEqual({ order: ["Anthropic"], allow_fallbacks: true });
        expect(body.reasoning).toEqual({ effort: "medium" });
        expect(body.tools.map((t: any) => t.function.name)).toEqual(["get_tasks"]);
        // One explicit system breakpoint, then the advancing automatic tail: long TTL precedes short TTL.
        expect(body.messages.at(-1).role).toBe("user");
    });

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

    it.each(["5m-5m", "1h-5m", "1h-1h"] as const)("keeps a static breakpoint reachable beyond the tail's 20-block lookup window (%s)", async (variant) => {
        const messages: ModelMessage[] = [];
        for (let i = 0; i < 12; i++) messages.push({ role: "user", content: `Exchange ${i}` }, { role: "assistant", content: "ok" });
        messages.push({ role: "user", content: "continue" });
        const { body } = await send("anthropic/claude-haiku-5.5", variant, messages);
        expect(body.messages).toHaveLength(26);
        expect(body.messages[0].content[0].cache_control).toBeDefined();
        expect(body.messages.slice(1).flatMap((m: any) => Array.isArray(m.content) ? m.content : []).filter((p: any) => p.cache_control)).toHaveLength(0);
        // One explicit system breakpoint + the automatic tail = 2 of the 4 slots.
        expect(JSON.stringify(body).match(/"cache_control":/g)).toHaveLength(2);
        expect(body.messages.at(-1).content).toBe("continue");
        // Wire preservation only: provider lookup/hit behavior is measured by eval:cache.
    });

    it("cache usage comes back split out, and the budget meters it at its price", async () => {
        const { usage: reported, responseBody } = await send("anthropic/claude-haiku-5.5");

        expect(reported.inputTokenDetails).toMatchObject({ cacheReadTokens: 15_000, cacheWriteTokens: 500 });
        // 4,500 plain + 1,500 read + 625 written + 10 out, not the raw 20,010.
        expect(readMeteredTokens({ metadata: { totalUsage: reported } })).toBe(6_635);
        // The paid cache probe needs the raw allowlisted usage/provider fields; SDK bodies are opt-in.
        expect(responseBody).toMatchObject({ provider: "Anthropic", usage: { prompt_tokens_details: { cache_write_tokens: 500 } } });
    });

    it.each(["5m-5m", "1h-5m", "1h-1h"] as const)("keeps fallback enabled and records the actual fallback without inventing a cache charge (%s)", async (variant) => {
        const result = await send("anthropic/claude-haiku-5.5", variant, undefined, { model: "google/gemini-3.7-flash", provider: "Google",
            usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110, prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } } });
        expect(result.body.provider).toEqual({ order: ["Anthropic"], allow_fallbacks: true });
        expect(result.body.models).toContain("google/gemini-3.7-flash");
        expect(result.servedModel).toBe("google/gemini-3.7-flash");
        expect(result.responseBody).toMatchObject({ provider: "Google" });
        expect(result.spend.costUsd).toBeUndefined();
        expect(result.usage.inputTokenDetails).toMatchObject({ cacheReadTokens: 0, cacheWriteTokens: 0 });
    });

    it("shares the static prefix across user settings while keeping personal settings in turn context", () => {
        const baseline = cacheFixture(env, "fixture", "5m-5m", true);
        const other = cacheFixture(env, "fixture", "5m-5m", true, "a", { assistantName: "Other fixture", customInstructions: "Use short sentences." });
        expect(other.instructions).toBe(baseline.instructions);
        expect(other.instructions).not.toContain("Other fixture");
        expect(other.context).toContain("Other fixture");
        expect(other.context).toContain("Use short sentences.");
        expect(Object.keys(other.tools)).toEqual(Object.keys(baseline.tools));
        expect(Object.values(other.tools).every((t) => t.execute === undefined)).toBe(true);
        const off = cacheFixture(env, "fixture", "5m-5m", false);
        expect(off.tools).not.toHaveProperty("recall");
        expect(off.instructions).not.toBe(baseline.instructions);
    });
});
