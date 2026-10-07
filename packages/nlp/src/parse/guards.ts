/**
 * Shared source-scope guards: a cue only counts when the words around it read as an
 * instruction. A negated cue ("not urgent") or a cue modifying a noun ("urgent care")
 * is literal text, not a field value — abstaining keeps the title whole instead of
 * deleting meaning-bearing words.
 */

/** Words that turn the cue right after them into a denial, not an instruction. */
const NEGATION_BEFORE =
    /(?:^|[\s,;:!?])(?:not|never|hardly|barely|no\s+longer|isn'?t|aren'?t|wasn'?t|weren'?t|don'?t|doesn'?t|didn'?t|won'?t|can'?t|cannot)(?:\s+(?:really|so|that|very|quite|actually))*\s*$/i;

/** True when the text right before `start` negates whatever cue begins at `start`. */
export function isNegatedBefore(text: string, start: number): boolean {
    return NEGATION_BEFORE.test(text.slice(Math.max(0, start - 48), start));
}

/**
 * A word right after a cue that continues the phrase (a noun the cue describes) rather
 * than starting the next cue. Known cue words and punctuation don't qualify.
 */
const NOUN_FOLLOWS =
    /^\s+(?!(?:at|on|from|until|till|starting|for|by|before|after|and|or|in|this|next|today|tomorrow|tonight|every|except|but|excluding|p[1-4]|waiting)\b)[a-z]/i;

/** True when a non-cue word follows `end`, so the cue likely modifies that noun. */
export function nounContinuesAfter(text: string, end: number): boolean {
    return NOUN_FOLLOWS.test(text.slice(end));
}
