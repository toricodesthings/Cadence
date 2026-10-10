import type { Env } from "../../types/env";

/** Default standard chat model: cost-effective, low-latency. Overridable via AI_CHAT_MODEL. */
const DEFAULT_CHAT_MODEL = "google/gemini-3.8-flash";

/** The standard model: every turn the router doesn't rate basic (config, never hard-coded in prose). */
export function getModelId(env: Env): string {
    return env.AI_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL;
}

/** Longest message, in words, that can still be a basic request. */
const BASIC_MAX_WORDS = 12;

/**
 * The only intents the cheap model is trusted with: a greeting, one task checked
 * off, one plain add, one look at what's on. Everything else — including anything
 * this list doesn't recognise — is the standard model's. The list grows on
 * evidence, never on a guess.
 */
const BASIC_INTENT: RegExp[] = [
    // Nothing to do but answer: "hi", "thanks!", "good morning".
    /^(?:hi|hey|hello|yo|sup|thanks|thank you|ty|ok|okay|cool|nice|great|awesome|perfect|good (?:morning|afternoon|evening|night))(?: there| cadence)?[\s!.,?]*$/i,
    // One task off the list: "complete the report", "check off laundry", "done with dishes".
    /^(?:complete|finish|check off|tick off|cross off)\s+\S/i,
    /^(?:mark|set)\b.*\b(?:done|complete|completed|finished)\b/i,
    /^(?:done|finished)\b/i,
    // One thing in: "add milk to groceries", "remind me to call mom", "note: renew passport".
    /^(?:add|create|new task|remind me to|capture|note)\b/i,
    // One look at the list, not a judgment about it: "what's on today?", "show my tasks".
    /^(?:what(?:'s|s| is| are)?|show|list|any)\b.*\b(?:today|tomorrow|now|next|due|overdue|left|on|schedule|agenda|tasks?|habits?|routines?|lists?|inbox|captures?)\b/i,
];

/**
 * Planning, judgment, bulk edits and date arithmetic — the standard model's job
 * even when the wording matches a basic intent above ("add all my overdue tasks…",
 * "add gym next tuesday").
 */
const COMPLEX_CUE =
    /\b(?:plan|reschedul\w*|reorgani[sz]\w*|prioriti[sz]\w*|summari[sz]\w*|analy[sz]\w*|compare|review|suggest\w*|recommend\w*|should|balance|workload|burnout|break ?down|help me|why|how (?:should|can|could|would|do)|then|every|each|all|next\s+(?:week|month|year|\w+day)|in \d+\s*(?:days?|weeks?|months?))\b/i;

/**
 * Picks the chat model for one turn from the new message. The cheap model
 * (`AI_CHAT_MODEL_BASIC`) needs a short, single-line, image-free message that matches
 * a {@link BASIC_INTENT} and trips no {@link COMPLEX_CUE}; everything else — an
 * unrecognised phrasing, an approval-only turn, no basic model configured — goes to
 * the standard model. Misjudging costs money, so the fallthrough is always the
 * expensive side. A thread that has used the standard model (`previousModel`, the
 * conversation's last) stays on it: each model keeps its own prompt cache, and a
 * switch drops the reasoning replayed from earlier turns, so flipping back and
 * forth costs more than the cheap turn saves.
 */
export function pickChatModel(env: Env, turn: { text: string; imageCount: number }, previousModel?: string | null): string {
    const basic = env.AI_CHAT_MODEL_BASIC?.trim();
    const standard = getModelId(env);
    const text = turn.text.trim();
    const isBasic =
        !!basic &&
        previousModel !== standard &&
        !!text &&
        turn.imageCount === 0 &&
        !text.includes("\n") &&
        text.split(/\s+/).length <= BASIC_MAX_WORDS &&
        BASIC_INTENT.some((intent) => intent.test(text)) &&
        !COMPLEX_CUE.test(text);
    // ponytail: English regex allowlist on the new message only. A miss costs money,
    // never correctness. Add a classifier if the bill says so.
    return isBasic ? basic : standard;
}
