/**
 * Conversation-title helpers — pure, deterministic, shared FE+BE.
 *
 * Used in three places:
 *   - the frontend's OPTIMISTIC title (shown the instant the user sends, before
 *     the server responds — see AssistantSidePanel),
 *   - the backend's LAST-RESORT fallback when title generation fails/times out
 *     (so a thread is never left untitled),
 *   - normalizing the model's raw output into a tidy, short title.
 *
 * No I/O, no framework — safe to import from either app.
 */

/** Hard ceilings so a title is always a calm, glanceable few words. */
export const TITLE_MAX_CHARS = 48;
export const TITLE_MAX_WORDS = 6;

/** The string shown when there is genuinely nothing to title (empty input). */
export const UNTITLED_CONVERSATION = "New conversation";

/** The title of a thread that opened with a photo and no words. */
export const PHOTO_CONVERSATION = "Photo";

/** Capitalize the first character without touching the rest. */
function upperFirst(s: string): string {
    return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

/** Clamp to the word/char budget, appending an ellipsis only when truncated. */
function clamp(text: string): string {
    const byWords = text.split(" ").slice(0, TITLE_MAX_WORDS).join(" ");
    if (byWords.length <= TITLE_MAX_CHARS) {
        return byWords.length < text.length ? `${byWords}…` : byWords;
    }
    return `${byWords.slice(0, TITLE_MAX_CHARS).trimEnd()}…`;
}

/**
 * Deterministic fallback title derived from the user's first message. Never
 * throws; an empty/whitespace message yields {@link PHOTO_CONVERSATION} when it
 * carried images, else {@link UNTITLED_CONVERSATION}.
 */
export function deriveFallbackTitle(text: string, hasImages = false): string {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return hasImages ? PHOTO_CONVERSATION : UNTITLED_CONVERSATION;
    return upperFirst(clamp(clean));
}

/**
 * Normalize a model-produced title: drop wrapping quotes/backticks, trailing
 * sentence punctuation, and surrounding whitespace, then clamp to budget.
 * Returns "" when nothing usable remains (caller should fall back).
 */
export function normalizeTitle(raw: string): string {
    const stripped = raw
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^["'`“”]+|["'`“”]+$/g, "")
        .replace(/[.,;:!?]+$/g, "")
        .trim();
    if (!stripped) return "";
    return clamp(stripped);
}
