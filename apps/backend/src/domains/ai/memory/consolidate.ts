import { generateText, Output } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { logger } from "../../../platform/log";
import { getModelId } from "../model-router";
import { addStepSpend } from "../safety/rate-limit";
import { addDailySpend } from "../../../platform/daily-budget";
import type { Env } from "../../../types/env";
import type { NearFact } from "./memory-store";
import consolidatePrompt from "../../../prompts/memory/consolidate.md";

const TIMEOUT_MS = 15_000;

const CONSOLIDATE_INSTRUCTIONS = consolidatePrompt.trimEnd();

const replySchema = z.object({ matches: z.array(z.object({ new: z.number().int(), known: z.string().nullable() })) });

export interface ConsolidationItem {
    content: string;
    near: NearFact[];
}

export async function consolidate(env: Env, userHash: string, items: ConsolidationItem[]): Promise<(string | null)[]> {
    const none: (string | null)[] = items.map(() => null);
    const withNear = items.map((item, i) => ({ item, i })).filter(({ item }) => item.near.length > 0);
    if (withNear.length === 0 || !env.OPENROUTER_API_KEY) return none;

    const keys = new Map<string, string>();
    const byKey = new Map<string, string>();
    const keyOf = (id: string) => {
        let key = keys.get(id);
        if (!key) {
            key = `k${keys.size + 1}`;
            keys.set(id, key);
            byKey.set(key, id);
        }
        return key;
    };
    const prompt = withNear
        .map(
            ({ item }, n) =>
                `NEW ${n + 1}: ${item.content}\nKNOWN for it:\n${item.near.map((k) => `  ${keyOf(k.id)}: ${k.content}`).join("\n")}`,
        )
        .join("\n\n");

    try {
        const startedAt = Date.now();
        const { output, usage, providerMetadata, response } = await generateText({
            model: createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })(getModelId(env), { user: userHash }),
            instructions: CONSOLIDATE_INSTRUCTIONS,
            prompt,
            output: Output.object({ schema: replySchema }),
            temperature: 0,
            maxOutputTokens: 400,
            maxRetries: 1,
            abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const spend = addStepSpend({}, { providerMetadata, response });
        logger.info("ai", "ai_memory_match", {
            userHash,
            items: withNear.length,
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
            ms: Date.now() - startedAt,
            ...spend,
        });
        await addDailySpend(env, spend.costUsd);
        const out = [...none];
        for (const m of output.matches) {
            const target = withNear[m.new - 1];
            const id = m.known ? byKey.get(m.known) : undefined;
            if (target && id && target.item.near.some((k) => k.id === id)) out[target.i] = id;
        }
        return out;
    } catch (error) {
        logger.warn("ai", "memory_match_failed", { userHash, reason: error instanceof Error ? error.name : "unknown" });
        return none;
    }
}
