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
 * The only intents the cheap model is trusted with: small talk and how-to help.
 * Anything that reads or changes the user's data — even one plain add or check-off —
 * is the standard model's, as is anything this list doesn't recognise. The list
 * grows on evidence, never on a guess.
 */
const BASIC_INTENT: RegExp[] = [
    // Nothing to do but answer: "hi", "thanks!", "good morning".
    /^(?:hi|hey|hello|yo|sup|thanks|thank you|ty|ok|okay|cool|nice|great|awesome|perfect|good (?:morning|afternoon|evening|night))(?: there| cadence)?[\s!.,?]*$/i,
    // Help with Cadence itself, answered from the guide: "what can you do?", "how do I add a routine?".
    /^(?:help|what can you (?:do|help with)|who are you|what are you)\b/i,
    /^(?:how (?:do|can) i|how does|where (?:is|are|do i|can i)|what(?:'s| is| are) (?:a |an |the )?(?:focus view|routine|capture|fixed block|weekly reset|event|tag|list|section)s?\b)/i,
];

/**
 * Work on the user's data, planning and judgment: the standard model's job even when
 * the wording opens like a help question ("how do I fit the gym in this week").
 */
const COMPLEX_CUE =
    /\b(?:my|plan|reschedul\w*|reorgani[sz]\w*|prioriti[sz]\w*|summari[sz]\w*|analy[sz]\w*|compare|review|suggest\w*|recommend\w*|should|balance|workload|burnout|break ?down|help me|why|then|every|each|all|today|tomorrow|tonight|week|month|\w+day|in \d+\s*(?:days?|weeks?|months?))\b/i;

/**
 * Picks the chat model for one turn from the new message. The cheap model
 * (`AI_CHAT_MODEL_BASIC`) takes only a short, single-line, image-free greeting or
 * how-to question ({@link BASIC_INTENT}) that trips no {@link COMPLEX_CUE}, and only
 * while the thread has used nothing else (`previousModel`, the conversation's model:
 * none or the basic one). Everything else goes to the standard model, and once a
 * thread has used it, it never switches back: each model keeps its own prompt cache,
 * and a switch drops the reasoning replayed from earlier turns. A miss costs money,
 * never correctness, so the fallthrough is always the standard model.
 */
export function pickChatModel(env: Env, turn: { text: string; imageCount: number }, previousModel?: string | null): string {
    const basic = env.AI_CHAT_MODEL_BASIC?.trim();
    const standard = getModelId(env);
    const text = turn.text.trim();
    const isBasic =
        !!basic &&
        (!previousModel || previousModel === basic) &&
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
