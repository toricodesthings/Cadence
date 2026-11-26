import { embed, embedMany } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { logger } from "../../../platform/log";
import { addStepSpend, type TurnSpend } from "../safety/rate-limit";
import { addDailySpend, spendWithinCap } from "../../../platform/daily-budget";
import { AppError } from "../../../platform/errors";
import type { Env } from "../../../types/env";

const EMBEDDING_DIMENSIONS = 512;

const EMBED_TIMEOUT_MS = 5_000;
const BATCH_TIMEOUT_MS = 30_000;

const DEFAULT_EMBEDDING_MODEL = "qwen/qwen3-embedding-8b";

export function getEmbeddingModelId(env: Env): string {
    return env.AI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

function getEmbeddingModel(env: Env, userHash?: string) {
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY || "dummy" });
    return openrouter.textEmbeddingModel(getEmbeddingModelId(env), {
        user: userHash,
        provider: { require_parameters: true },
        extraBody: { dimensions: EMBEDDING_DIMENSIONS },
    });
}

function assertDimensions(vector: number[]): number[] {
    if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${vector.length}`);
    }
    return vector;
}

export type EmbeddingSpend = TurnSpend & { model: string; inputTokens?: number };

export async function embedText(
    env: Env,
    text: string,
    ctx: { requestId?: string; userHash?: string } = {},
): Promise<{ embedding: number[]; spend: EmbeddingSpend }> {
    if (!(await spendWithinCap(env))) throw new AppError(503, "AI_SPEND_CAPPED", "Daily assistant spend cap reached");
    const { embedding, usage, providerMetadata, response } = await embed({
        model: getEmbeddingModel(env, ctx.userHash),
        value: text,
        abortSignal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });
    const spend: EmbeddingSpend = {
        model: getEmbeddingModelId(env),
        inputTokens: usage?.tokens,
        ...addStepSpend(
            {},
            { providerMetadata, response: { modelId: (response?.body as { model?: string } | undefined)?.model } },
        ),
    };
    logger.info("ai", "ai_embedding", { ...ctx, ...spend });
    await addDailySpend(env, spend.costUsd);
    return { embedding: assertDimensions(embedding), spend };
}

export async function embedTexts(
    env: Env,
    texts: string[],
    ctx: { userHash?: string; inTurn?: boolean } = {},
): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (!(await spendWithinCap(env))) throw new AppError(503, "AI_SPEND_CAPPED", "Daily assistant spend cap reached");
    const timeout = ctx.inTurn ? EMBED_TIMEOUT_MS : BATCH_TIMEOUT_MS;
    const { embeddings, usage, providerMetadata } = await embedMany({
        model: getEmbeddingModel(env, ctx.userHash),
        values: texts,
        abortSignal: AbortSignal.timeout(timeout),
    });
    const spend = addStepSpend({}, { providerMetadata });
    logger.info("ai", "ai_embedding", {
        userHash: ctx.userHash,
        model: getEmbeddingModelId(env),
        inputTokens: usage?.tokens,
        texts: texts.length,
        costUsd: spend.costUsd,
    });
    await addDailySpend(env, spend.costUsd);
    return embeddings.map(assertDimensions);
}
