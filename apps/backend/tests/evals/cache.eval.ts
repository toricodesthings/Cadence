/**
 * Small paid wire/economics probe: pnpm eval:cache. Twelve main calls, a real
 * six-minute gap, then controls for consent/schema changes, >20 blocks and deploys.
 * eval:cache:matched repeats the four main strata three times in rotating order.
 * eval:cache:resume reuses a prior probe for actual >60-minute expiry (three calls).
 * Synthetic data only; no tool execution, user writes, keepalive or discarded warmups.
 * This is mechanism evidence, not a weighted production acceptance corpus.
 */
import { expect, it } from "vitest";
import { generateText, type ModelMessage } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE_VARIANTS, chatInstructions, chatModelSettings, type CacheVariant } from "../../src/domains/ai/agent";
import { getModelId } from "../../src/domains/ai/model-router";
import { addStepSpend } from "../../src/domains/ai/safety/rate-limit";
import type { Env } from "../../src/types/env";
import { evaluationVars } from "./run-options";
import { summarizeCacheTrials, type CacheTrial } from "./cache-economics";
import { cacheFixture, waitForCacheDeadline } from "./cache-fixture";

const vars = evaluationVars();
const env = { OPENROUTER_API_KEY: vars.OPENROUTER_API_KEY, AI_CHAT_MODEL: vars.AI_CHAT_MODEL } as Env;
const profile = vars.AI_EVAL_CACHE_PROFILE ?? "probe";
if (profile !== "probe" && profile !== "matched") throw new Error("Invalid AI_EVAL_CACHE_PROFILE");
const repetitions = profile === "matched" ? 3 : 1;
const modelId = getModelId(env);
const mainStages = ["cold", "warm", "other-conversation", "6-minute-return"];
const stages = profile === "matched" ? mainStages : [...mainStages, "memory-off", "over-20-blocks", "deployment-change"];
const countPerVariant = stages.length * repetitions;

type Observation = CacheTrial & {
    at: string; generationId: string | null; gapMs: number | null; elapsedMs: number;
    input: number | null; cached: number | null; written: number | null; output: number | null;
    write5m: number | null; write1h: number | null;
};
const numeric = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

it.skipIf(!env.OPENROUTER_API_KEY)("compares isolated cache TTL variants across real gaps and prefix changes", async () => {
    if (!modelId.startsWith("anthropic/")) throw new Error("Cache TTL probes require the configured Anthropic chat model; no model substitution is made");
    const run = crypto.randomUUID();
    const namespaces = Array.from({ length: repetitions }, (_, i) => i === 0 ? run : crypto.randomUUID());
    const personas = [{}, { emoji: true, assistantName: "Fixture B" }, { customInstructions: "Use short sentences.", nickname: "Fixture C" }];
    const observations: Observation[] = [];
    const controls: Observation[] = [];
    const conversations = new Map<string, ModelMessage[]>();
    const lastRequest = new Map<string, number>();
    const prefixes = new Map<string, string>();
    const started = new Date().toISOString();
    const directory = join(__dirname, "../../../../output/evals");
    mkdirSync(directory, { recursive: true });
    const report = () => writeFileSync(join(directory, `cache-${run}.json`), JSON.stringify({
        evidence: "isolated synthetic wire probe; actual waits and exact observed charges; not weighted production savings or browser latency",
        started, at: new Date().toISOString(), modelId, profile, repetitions, expectedPerVariant: countPerVariant,
        limitations: ["Production weights are applied by eval:cache:report", ">60-minute returns are measured separately by eval:cache:resume",
            "No outage induced; fallback provider/model observations stay separate", "No browser receipt/render measurements",
            "Unknown TTL-specific write counters remain null; aggregate writes are never split by inference"],
        totalKnownCostUsd: [...observations, ...controls].reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
        unknownCostCalls: [...observations, ...controls].filter((r) => r.costUsd === null).length,
        mainCorpus: summarizeCacheTrials(observations.filter((r) => mainStages.includes(r.stage)), mainStages.length * repetitions),
        variants: summarizeCacheTrials(observations, countPerVariant), observations, controls,
    }, null, 2));

    async function call(variant: CacheVariant, stage: string, messages: ModelMessage[], memoryOn = true, epoch = "a", short = false, repetition = 0) {
        const namespace = namespaces[repetition];
        const key = `${namespace}:${variant}`;
        const f = cacheFixture(env, namespace, variant, memoryOn, epoch, personas[repetition]);
        const prefixKey = `${key}:${memoryOn}:${epoch}`;
        expect(prefixes.get(prefixKey) ?? f.instructions).toBe(f.instructions);
        prefixes.set(prefixKey, f.instructions);
        const requestAt = Date.now();
        const before = performance.now();
        const previous = lastRequest.get(key);
        const row: Observation = { variant, stage, repetition, at: new Date(requestAt).toISOString(), gapMs: previous === undefined ? null : requestAt - previous,
            elapsedMs: 0, generationId: null, provider: null, servedModel: null, costUsd: null, complete: false,
            input: null, cached: null, written: null, output: null, write5m: null, write1h: null };
        (short ? controls : observations).push(row);
        try {
            const result = await generateText({
                model: createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })(modelId, chatModelSettings(env, modelId, stage === "other-conversation" ? "synthetic-b" : "synthetic-a", variant)),
                instructions: chatInstructions(short ? `Short control ${run}. Reply Ready.` : f.instructions, modelId, variant),
                tools: short ? undefined : f.tools, toolChoice: "none", messages,
                include: { responseBody: true },
                maxOutputTokens: 64, maxRetries: 0, abortSignal: AbortSignal.timeout(30_000),
            });
            const body = result.response.body as { provider?: string; usage?: { cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } } } | undefined;
            row.generationId = result.response.id ?? null;
            row.servedModel = result.response.modelId ?? null;
            const metadataProvider = result.providerMetadata?.openrouter?.provider;
            row.provider = body?.provider ?? (typeof metadataProvider === "string" && metadataProvider ? metadataProvider : null);
            row.costUsd = numeric(addStepSpend({}, result).costUsd);
            row.input = numeric(result.usage.inputTokens);
            row.cached = numeric(result.usage.inputTokenDetails?.cacheReadTokens);
            row.written = numeric(result.usage.inputTokenDetails?.cacheWriteTokens);
            row.output = numeric(result.usage.outputTokens);
            row.write5m = numeric(body?.usage?.cache_creation?.ephemeral_5m_input_tokens);
            row.write1h = numeric(body?.usage?.cache_creation?.ephemeral_1h_input_tokens);
            expect(result.toolCalls).toHaveLength(0);
            row.complete = true;
            return result.response.messages;
        } finally {
            row.elapsedMs = performance.now() - before;
            if (!short) lastRequest.set(key, requestAt);
            report();
            console.log(JSON.stringify({ variant, stage, costUsd: row.costUsd, cached: row.cached, written: row.written, complete: row.complete }));
        }
    }

    for (const stage of stages) {
        if (stage === "6-minute-return") {
            console.log("Waiting six actual minutes without cache keepalives");
            await waitForCacheDeadline(Date.now() + 360_000);
        }
        for (let repetition = 0; repetition < repetitions; repetition++) {
            // Rotate the provider-call order: each variant occupies every position once.
            const order = [...CACHE_VARIANTS.slice(repetition), ...CACHE_VARIANTS.slice(0, repetition)];
            for (const variant of order) {
                const key = `${namespaces[repetition]}:${variant}`;
                const primary = ["cold", "warm", "6-minute-return", "over-20-blocks"].includes(stage);
                const memoryOn = stage !== "memory-off";
                const f = cacheFixture(env, namespaces[repetition], variant, memoryOn, stage === "deployment-change" ? "b" : "a", personas[repetition]);
                const history = primary ? conversations.get(key) ?? [] : [];
                if (stage === "over-20-blocks") for (let i = 0; i < 11; i++) history.push({ role: "user", content: `Synthetic exchange ${i}` }, { role: "assistant", content: "Ready." });
                history.push({ role: "user", content: `Reply with exactly Ready. Do not call tools. Synthetic ${stage}.\n\n${f.context}` });
                const response = await call(variant, stage, history, memoryOn, stage === "deployment-change" ? "b" : "a", false, repetition);
                if (primary) conversations.set(key, [...history, ...response]);
            }
        }
    }
    // A below-threshold control is observed, not asserted by a local cache simulator.
    if (profile === "probe") for (let i = 0; i < 2; i++) await call("5m-5m", "short-prompt", [{ role: "user", content: "Reply Ready." }], false, "a", true);
    expect(observations.every((r) => r.complete)).toBe(true);
    expect(observations).toHaveLength(countPerVariant * CACHE_VARIANTS.length);
}, 720_000);
