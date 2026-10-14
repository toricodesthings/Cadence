/** Reuse an existing probe's private epoch-b prefix after a real >60-minute gap: only three new calls. */
import { expect, it } from "vitest";
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE_VARIANTS, chatInstructions, chatModelSettings, type CacheVariant } from "../../src/domains/ai/agent";
import { getModelId } from "../../src/domains/ai/model-router";
import { addStepSpend } from "../../src/domains/ai/safety/rate-limit";
import type { Env } from "../../src/types/env";
import { evaluationVars } from "./run-options";
import { cacheFixture } from "./cache-fixture";

const vars = evaluationVars();
const resumeId = vars.AI_EVAL_CACHE_RESUME;
if (resumeId && !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(resumeId)) throw new Error("Invalid AI_EVAL_CACHE_RESUME: expected a probe UUID");
const env = { OPENROUTER_API_KEY: vars.OPENROUTER_API_KEY, AI_CHAT_MODEL: vars.AI_CHAT_MODEL } as Env;

it.skipIf(!env.OPENROUTER_API_KEY || !resumeId)("measures expiry of all three existing prefixes after at least 61 real minutes", async () => {
    const directory = join(__dirname, "../../../../output/evals");
    const source = JSON.parse(readFileSync(join(directory, `cache-${resumeId}.json`), "utf8")) as {
        modelId: string;
        observations: { variant: CacheVariant; stage: string; at: string; complete: boolean }[];
    };
    const modelId = getModelId(env);
    if (!modelId.startsWith("anthropic/") || source.modelId !== modelId) throw new Error("The configured model must match the original cache probe");
    const anchors = CACHE_VARIANTS.map((variant) => {
        const row = source.observations.find((r) => r.variant === variant && r.stage === "deployment-change" && r.complete);
        if (!row || !Number.isFinite(Date.parse(row.at))) throw new Error(`Missing completed epoch-b checkpoint for ${variant}`);
        return { variant, at: Date.parse(row.at) };
    });
    const deadline = Math.max(...anchors.map((r) => r.at)) + 61 * 60_000;
    const rows: Record<string, unknown>[] = [];
    const report = () => writeFileSync(join(directory, `cache-${resumeId}-expiry.json`), JSON.stringify({
        evidence: "real >60-minute private-prefix expiry; new synthetic conversation; no keepalive or artificial clock",
        source: `cache-${resumeId}.json`, modelId, waitingUntil: new Date(deadline).toISOString(), expectedCalls: 3,
        rows, knownCostUsd: rows.reduce((sum: number, r) => sum + (typeof r.costUsd === "number" ? r.costUsd : 0), 0),
        unknownCosts: rows.filter((r) => typeof r.costUsd !== "number").length,
    }, null, 2));
    report();
    const waitMs = deadline - Date.now();
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    for (const anchor of anchors) {
        const f = cacheFixture(env, resumeId!, anchor.variant, true, "b");
        const at = Date.now();
        expect(at - anchor.at).toBeGreaterThanOrEqual(61 * 60_000);
        const row: Record<string, unknown> = { variant: anchor.variant, at: new Date(at).toISOString(), gapMs: at - anchor.at,
            complete: false, costUsd: null, provider: null, servedModel: null, generationId: null, cached: null, written: null };
        rows.push(row);
        try {
            const started = performance.now();
            const result = await generateText({
                model: createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })(modelId, chatModelSettings(env, modelId, "synthetic-return", anchor.variant)),
                instructions: chatInstructions(f.instructions, modelId, anchor.variant), tools: f.tools, toolChoice: "none",
                messages: [{ role: "user", content: `Reply with exactly Ready. Do not call tools. Synthetic 61-minute-return.\n\n${f.context}` }],
                include: { responseBody: true }, maxOutputTokens: 64, maxRetries: 0, abortSignal: AbortSignal.timeout(30_000),
            });
            const body = result.response.body as { provider?: string } | undefined;
            Object.assign(row, { complete: true, costUsd: addStepSpend({}, result).costUsd ?? null,
                provider: body?.provider ?? null, servedModel: result.response.modelId ?? null, generationId: result.response.id ?? null,
                input: result.usage.inputTokens ?? null, cached: result.usage.inputTokenDetails?.cacheReadTokens ?? null,
                written: result.usage.inputTokenDetails?.cacheWriteTokens ?? null, output: result.usage.outputTokens ?? null,
                elapsedMs: performance.now() - started });
            expect(result.toolCalls).toHaveLength(0);
        } finally { report(); }
    }
    expect(rows).toHaveLength(3);
}, 4_000_000);
