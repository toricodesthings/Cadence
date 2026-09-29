/**
 * Conversation auto-titler — a minimal, fast, cheap `generateText` call (NOT the
 * heavy ToolLoopAgent: no tools, no composed system stack, tiny output cap).
 *
 * Fault tolerance is the contract: this NEVER throws and ALWAYS resolves to a
 * usable, short title within {@link TITLE_TIMEOUT_MS}. On any failure — no API
 * key, network error, timeout, refusal, empty output — it falls back to a
 * deterministic title derived from the user's text, so a thread is never left
 * untitled. The system prompt is title-prompt.md (edit and push to change it).
 */
/// <reference path="../../../types/text-modules.d.ts" />
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { deriveFallbackTitle, normalizeTitle } from "@cadence/domain/ai-title";
import { logger } from "../../../platform/log";
import { addStepSpend, type TurnSpend } from "../safety/rate-limit";
import type { Env } from "../../../types/env";
import titlePrompt from "./title-prompt.md";

/** Cheaper/faster than the chat model — titles are tiny. Overridable via AI_TITLE_MODEL. */
const DEFAULT_TITLE_MODEL = "google/gemma-3-27b-it";
/** Served by OpenRouter when the title model is unavailable or rate-limited. */
const TITLE_FALLBACK_MODEL = "mistralai/ministral-14b-2512";
/** Hard ceiling so a slow/hung title call can never extend the chat stream. */
const TITLE_TIMEOUT_MS = 4_000;
/** Titling never needs more than the opening line(s) of the first message. */
const INPUT_CHAR_CAP = 500;

export function getTitleModelId(env: Env): string {
    return env.AI_TITLE_MODEL?.trim() || DEFAULT_TITLE_MODEL;
}

/** What the title call cost: saved on the first assistant row (`metadata.titleSpend`) and logged as `ai_title`. */
export type TitleSpend = TurnSpend & { model: string; inputTokens?: number; outputTokens?: number };

/**
 * Generate a short title for a new conversation from the user's first message.
 * Always returns a non-empty, length-clamped title; `spend` is set only when the model ran.
 */
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
        // OpenRouter fails over server-side when the primary is rate-limited (small free-tier
        // models often are); SDK retries would only burn the 4s budget in backoff.
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
        // Same fields as `ai_turn` (model, tokens, costUsd, servedModel) so both filter alike.
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
