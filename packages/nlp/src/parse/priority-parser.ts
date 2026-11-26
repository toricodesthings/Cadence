import type { ParsedEntity, TaskPriority } from "../core/index.js";
import { isNegatedBefore, nounContinuesAfter } from "./guards.js";

const PRIORITY_KEYWORDS: Array<{
    pattern: RegExp;
    value: TaskPriority;
    label: string;
    wordCue?: boolean;
    trailing?: boolean;
}> = [
    { pattern: /(?<!\S)!!(?!\S)/, value: 4, label: "Urgent" },
    { pattern: /\bp1\b/i, value: 4, label: "P1 (Urgent)" },
    { pattern: /\bp2\b/i, value: 3, label: "P2 (High)" },
    { pattern: /\bp3\b/i, value: 2, label: "P3 (Medium)" },
    { pattern: /\bp4\b/i, value: 1, label: "P4 (Low)" },
    { pattern: /\burgent\b/i, value: 4, label: "Urgent", wordCue: true },
    { pattern: /\basap\b/i, value: 4, label: "Urgent" },
    { pattern: /\b(?:high|top)\s*prio(?:rity)?\b/i, value: 3, label: "High priority", wordCue: true },
    { pattern: /\blow\s*prio(?:rity)?\b/i, value: 1, label: "Low priority", wordCue: true },
    { pattern: /\bimportant\b/i, value: 3, label: "High priority", wordCue: true, trailing: true },
    {
        pattern: /\b(?:no\s+rush|whenever|can\s+wait)\b/i,
        value: 1,
        label: "Low priority",
        wordCue: true,
        trailing: true,
    },
];

const AFTER_SEPARATOR = /[,\-—–]\s*$/;
const TRAILING_REST =
    /^(?:[\s.!?,]|\b(?:please|today|tonight|tomorrow|this\s+week|next\s+week|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b)*$/i;
const OBJECT_BEFORE =
    /(?:^|[^\p{L}'])(?:what|what's|whats|if|whether|that|it|me|you|nothing|anything|something|everything|ms|mr|mrs|dr)\.?(?:\s+(?:is|was|isn't))?\s*$/iu;

const CLAUSE_BEFORE =
    /(?:^|[^\p{L}'])(?:what|what's|whats|which|whether|says|said|thinks|thought|marked|called|wants|told\s+(?:me|us))\b[^,.;:!?\n—–]*$/iu;
const NOTHING_BEFORE = /(?:^|[^\p{L}'])(?:nothing|anything|something|everything)\s+$/iu;
const ASKED_AFTER = /^[^.!?\n]*\?/;

export interface PriorityParseResult {
    entities: ParsedEntity[];
    consumedRanges: Array<{ start: number; end: number }>;
}

export function parsePriority(input: string): PriorityParseResult {
    const entities: ParsedEntity[] = [];
    const consumedRanges: Array<{ start: number; end: number }> = [];

    for (const { pattern, value, label, wordCue, trailing } of PRIORITY_KEYWORDS) {
        const match = input.match(pattern);
        if (!match) continue;

        const sourceText = match[0];
        const start = match.index ?? 0;
        const end = start + sourceText.length;

        if (isNegatedBefore(input, start)) continue;
        if (/\p{L}/u.test(sourceText)) {
            const before = input.slice(Math.max(0, start - 80), start);
            if (CLAUSE_BEFORE.test(before) || NOTHING_BEFORE.test(before) || ASKED_AFTER.test(input.slice(end)))
                continue;
        }
        if (trailing) {
            const before = input.slice(0, start);
            if (OBJECT_BEFORE.test(before)) continue;
            if (!TRAILING_REST.test(input.slice(end)) && !AFTER_SEPARATOR.test(before)) continue;
            if (!TRAILING_REST.test(input.slice(end)) && nounContinuesAfter(input, end)) continue;
        } else if (wordCue && nounContinuesAfter(input, end)) {
            continue;
        }

        entities.push({
            id: `priority:${value}`,
            type: "priority",
            sourceText,
            start,
            end,
            confidence: "high",
            normalizedValue: value,
            explanation: `Detected priority: ${label}`,
        });

        consumedRanges.push({ start, end });
        break;
    }

    return { entities, consumedRanges };
}
