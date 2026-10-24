import type { ParsedEntity, TaskPriority } from "../core/index.js";
import { isNegatedBefore, nounContinuesAfter } from "./guards.js";

const PRIORITY_KEYWORDS: Array<{
  pattern: RegExp;
  value: TaskPriority;
  label: string;
  /** Word cues can modify a noun ("urgent care"); shorthand (!!, p1) cannot. */
  wordCue?: boolean;
  /** Counts only at the end of the input or after a comma/dash ("call bank, important"). */
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
  { pattern: /\b(?:no\s+rush|whenever|can\s+wait)\b/i, value: 1, label: "Low priority", wordCue: true, trailing: true },
];

const AFTER_SEPARATOR = /[,\-—–]\s*$/;
const ONLY_PUNCTUATION = /^[\s.!?]*$/;

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

    // "This is not urgent": a denial, not an instruction — leave the words literal.
    if (isNegatedBefore(input, start)) continue;
    // "urgent care", "high priority support policy": the cue describes the next noun.
    if (wordCue && nounContinuesAfter(input, end)) continue;

    // "Important email to Sam": mid-sentence, the word describes the noun.
    if (trailing && !ONLY_PUNCTUATION.test(input.slice(end)) && !AFTER_SEPARATOR.test(input.slice(0, start))) continue;

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
    break; // Only one priority per input
  }

  return { entities, consumedRanges };
}
