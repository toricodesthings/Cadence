/**
 * Consolidation: for each new fact, which known fact (if any) does it repeat, or give a new value for?
 * One small call over all of a reading's candidates. The model sees opaque keys (k1, k2…) and can only name
 * one of those or nothing, so it can't invent a merge, and any other reply means "new".
 *
 * Why not the decision model (as placement uses): on the eval it abstains whenever the value changed
 * ("works afternoons now" vs "works mornings"), which is the case that matters most; see tests/evals/memory.eval.ts.
 */
import { generateText, Output } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { logger } from "../../../platform/log";
import { getModelId } from "../model-router";
import { addStepSpend } from "../safety/rate-limit";
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

/** For each item, the id of the known fact it repeats or updates, or null. Never throws: any failure means "new". */
export async function consolidate(env: Env, userHash: string, items: ConsolidationItem[]): Promise<(string | null)[]> {
    const none: (string | null)[] = items.map(() => null);
    const withNear = items.map((item, i) => ({ item, i })).filter(({ item }) => item.near.length > 0);
    if (withNear.length === 0 || !env.OPENROUTER_API_KEY) return none;

    // Opaque keys per known fact; the same fact keeps one key across items.
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
        .map(({ item }, n) => `NEW ${n + 1}: ${item.content}\nKNOWN for it:\n${item.near.map((k) => `  ${keyOf(k.id)}: ${k.content}`).join("\n")}`)
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
        logger.info("ai", "ai_memory_match", {
            userHash,
            items: withNear.length,
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
            ms: Date.now() - startedAt,
            ...addStepSpend({}, { providerMetadata, response }),
        });
        const out = [...none];
        for (const m of output.matches) {
            const target = withNear[m.new - 1];
            const id = m.known ? byKey.get(m.known) : undefined;
            // Only a fact that was offered for that item can be named.
            if (target && id && target.item.near.some((k) => k.id === id)) out[target.i] = id;
        }
        return out;
    } catch (error) {
        logger.warn("ai", "memory_match_failed", { userHash, reason: error instanceof Error ? error.name : "unknown" });
        return none;
    }
}
