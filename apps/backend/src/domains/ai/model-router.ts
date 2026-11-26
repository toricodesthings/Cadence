import type { Env } from "../../types/env";

const DEFAULT_CHAT_MODEL = "google/gemini-3.8-flash";

export function getModelId(env: Env): string {
    return env.AI_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL;
}

const BASIC_MAX_WORDS = 12;

const BASIC_INTENT: RegExp[] = [
    /^(?:hi|hey|hello|yo|sup|thanks|thank you|ty|ok|okay|cool|nice|great|awesome|perfect|good (?:morning|afternoon|evening|night))(?: there| cadence)?[\s!.,?]*$/i,
    /^(?:help|what can you (?:do|help with)|who are you|what are you)\b/i,
    /^(?:how (?:do|can) i|how does|where (?:is|are|do i|can i)|what(?:'s| is| are) (?:a |an |the )?(?:focus view|routine|capture|fixed block|weekly reset|event|tag|list|section)s?\b)/i,
];

const COMPLEX_CUE =
    /\b(?:my|plan|reschedul\w*|reorgani[sz]\w*|prioriti[sz]\w*|summari[sz]\w*|analy[sz]\w*|compare|review|suggest\w*|recommend\w*|should|balance|workload|burnout|break ?down|help me|why|then|every|each|all|today|tomorrow|tonight|week|month|\w+day|in \d+\s*(?:days?|weeks?|months?))\b/i;

export function pickChatModel(
    env: Env,
    turn: { text: string; attachmentCount: number },
    previousModel?: string | null,
): string {
    const basic = env.AI_CHAT_MODEL_BASIC?.trim();
    const standard = getModelId(env);
    const text = turn.text.trim();
    const isBasic =
        !!basic &&
        (!previousModel || previousModel === basic) &&
        !!text &&
        turn.attachmentCount === 0 &&
        !text.includes("\n") &&
        text.split(/\s+/).length <= BASIC_MAX_WORDS &&
        BASIC_INTENT.some((intent) => intent.test(text)) &&
        !COMPLEX_CUE.test(text);
    return isBasic ? basic : standard;
}
