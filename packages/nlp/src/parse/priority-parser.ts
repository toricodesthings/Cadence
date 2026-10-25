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
/** What may follow a trailing cue and still leave it trailing: punctuation, "please", a day ("call bank important tomorrow"). */
const TRAILING_REST =
  /^(?:[\s.!?,]|\b(?:please|today|tonight|tomorrow|this\s+week|next\s+week|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b)*$/i;
/** "what's important", "if it can wait", "call me whenever", "nothing important", "Ms. Important": the cue is the sentence's object, not its priority. */
const OBJECT_BEFORE =
  /(?:^|[^\p{L}'])(?:what|what's|whats|if|whether|that|it|me|you|nothing|anything|something|everything|ms|mr|mrs|dr)\.?(?:\s+(?:is|was|isn't))?\s*$/iu;

/** "boss says it's urgent", "what's most important", "whether it can wait": the clause reports or asks, so the cue isn't the writer's own. */
const CLAUSE_BEFORE =
  /(?:^|[^\p{L}'])(?:what|what's|whats|which|whether|says|said|thinks|thought|marked|called|wants|told\s+(?:me|us))\b[^,.;:!?\n—–]*$/iu;
const NOTHING_BEFORE = /(?:^|[^\p{L}'])(?:nothing|anything|something|everything)\s+$/iu;
/** The sentence holding the cue ends in a question mark: "is the dentist thing urgent?". */
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

    // "This is not urgent": a denial, not an instruction — leave the words literal.
    if (isNegatedBefore(input, start)) continue;
    if (/\p{L}/u.test(sourceText)) {
      const before = input.slice(Math.max(0, start - 80), start);
      if (CLAUSE_BEFORE.test(before) || NOTHING_BEFORE.test(before) || ASKED_AFTER.test(input.slice(end))) continue;
    }
    if (trailing) {
      // "Important email to Sam": mid-sentence, the word describes the noun.
      const before = input.slice(0, start);
      if (OBJECT_BEFORE.test(before)) continue;
      if (!TRAILING_REST.test(input.slice(end)) && !AFTER_SEPARATOR.test(before)) continue;
      if (!TRAILING_REST.test(input.slice(end)) && nounContinuesAfter(input, end)) continue;
    } else if (wordCue && nounContinuesAfter(input, end)) {
      // "urgent care", "high priority support policy": the cue describes the next noun.
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
    break; // Only one priority per input
  }

  return { entities, consumedRanges };
}
