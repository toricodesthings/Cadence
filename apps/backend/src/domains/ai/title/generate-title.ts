/**
 * Conversation auto-titler — a minimal, fast, cheap `generateText` call (NOT the
 * heavy ToolLoopAgent: no tools, no composed system stack, tiny output cap).
 *
 * Fault tolerance is the contract: this NEVER throws and ALWAYS resolves to a
 * usable, short title within {@link TITLE_TIMEOUT_MS}. On any failure — no API
 * key, network error, timeout, refusal, empty output — it falls back to a
 * deterministic title derived from the user's text, so a thread is never left
 * untitled. The system prompt itself is DB-backed (see title-prompt.ts).
 */
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { deriveFallbackTitle, normalizeTitle } from "@cadence/domain/ai-title";
import { logger } from "../../../platform/log";
import type { Env } from "../../../types/env";
import { getTitlePrompt } from "./title-prompt";

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

/**
 * Generate a short title for a new conversation from the user's first message.
 * Always returns a non-empty, length-clamped title. `locale` selects a
 * localized title prompt when one exists (falls back to 'en').
 */
export async function generateConversationTitle(env: Env, userText: string, locale?: string): Promise<string> {
    const fallback = deriveFallbackTitle(userText);

    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey || !userText.trim()) return fallback;

    try {
        const system = await getTitlePrompt(env, locale);
        const openrouter = createOpenRouter({ apiKey });
        // OpenRouter fails over server-side when the primary is rate-limited (small free-tier
        // models often are); SDK retries would only burn the 4s budget in backoff.
        const { text } = await generateText({
            model: openrouter(getTitleModelId(env), { models: [getTitleModelId(env), TITLE_FALLBACK_MODEL] }),
            instructions: system,
            prompt: userText.slice(0, INPUT_CHAR_CAP),
            temperature: 0.3,
            maxOutputTokens: 16,
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(TITLE_TIMEOUT_MS),
        });
        return normalizeTitle(text) || fallback;
    } catch (error) {
        logger.warn("ai", "title_generation_failed", {
            reason: error instanceof Error ? error.message.slice(0, 117) : "unknown_error",
        });
        return fallback;
    }
}
