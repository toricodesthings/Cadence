const NEGATION_BEFORE =
    /(?:^|[\s,;:!?])(?:not|pas|nicht|never|hardly|barely|no\s+longer|isn'?t|aren'?t|wasn'?t|weren'?t|don'?t|doesn'?t|didn'?t|won'?t|can'?t|cannot)(?:\s+(?:really|so|that|very|quite|actually))*\s*$/i;

export function isNegatedBefore(text: string, start: number): boolean {
    return NEGATION_BEFORE.test(text.slice(Math.max(0, start - 48), start));
}

const NOUN_FOLLOWS =
    /^\s+(?!(?:at|on|from|until|till|starting|for|by|before|after|and|or|in|this|next|today|tomorrow|tonight|every|except|but|excluding|p[1-4]|waiting)\b)[a-z]/i;

export function nounContinuesAfter(text: string, end: number): boolean {
    return NOUN_FOLLOWS.test(text.slice(end));
}
