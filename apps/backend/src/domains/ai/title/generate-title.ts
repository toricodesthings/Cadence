// oxlint-disable-next-line triple-slash-reference -- the frontend typecheck compiles this file without backend src/types
/// <reference path="../../../types/text-modules.d.ts" />
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { deriveFallbackTitle, normalizeTitle } from "@cadence/domain/ai-title";
import { logger } from "../../../platform/log";
import { addStepSpend, type TurnSpend } from "../safety/rate-limit";
import type { Env } from "../../../types/env";
import titlePrompt from "../../../prompts/assistant/title.md";

const DEFAULT_TITLE_MODEL = "google/gemma-3-27b-it";
const TITLE_FALLBACK_MODEL = "mistralai/ministral-14b-2512";
const TITLE_TIMEOUT_MS = 4_000;
const INPUT_CHAR_CAP = 500;

export function getTitleModelId(env: Env): string {
    return env.AI_TITLE_MODEL?.trim() || DEFAULT_TITLE_MODEL;
}

export type TitleSpend = TurnSpend & { model: string; inputTokens?: number; outputTokens?: number };

export async function generateConversationTitle(
    env: Env,
    userText: string,
    hasImages = false,
    ctx: { requestId?: string; userHash?: string } = {},
): Promise<{ title: string; spend?: TitleSpend }> {
    const fallback = { title: deriveFallbackTitle(userText, hasImages) };

    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey || !userText.trim()) return fallback;

    try {
        const openrouter = createOpenRouter({ apiKey });
        const { text, usage, providerMetadata, response } = await generateText({
            model: openrouter(getTitleModelId(env), {
                models: [getTitleModelId(env), TITLE_FALLBACK_MODEL],
                user: ctx.userHash,
            }),
            instructions: titlePrompt.trimEnd(),
            prompt: userText.slice(0, INPUT_CHAR_CAP),
            temperature: 0.3,
            maxOutputTokens: 16,
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(TITLE_TIMEOUT_MS),
        });
        const spend: TitleSpend = {
            model: getTitleModelId(env),
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
            ...addStepSpend({}, { providerMetadata, response }),
        };
        logger.info("ai", "ai_title", { ...ctx, ...spend });
        return { title: normalizeTitle(text) || fallback.title, spend };
    } catch (error) {
        logger.warn("ai", "title_generation_failed", {
            reason: error instanceof Error ? error.message.slice(0, 117) : "unknown_error",
        });
        return fallback;
    }
}
