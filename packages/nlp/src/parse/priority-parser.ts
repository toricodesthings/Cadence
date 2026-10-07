import type { ParsedEntity, TaskPriority } from "../core/index.js";
import { isNegatedBefore, nounContinuesAfter } from "./guards.js";

const PRIORITY_KEYWORDS: Array<{
  pattern: RegExp;
  value: TaskPriority;
  label: string;
  /** Word cues can modify a noun ("urgent care"); shorthand (!!, p1) cannot. */
  wordCue?: boolean;
}> = [
  { pattern: /(?<!\S)!!(?!\S)/, value: 4, label: "Urgent" },
  { pattern: /\bp1\b/i, value: 4, label: "P1 (Urgent)" },
  { pattern: /\bp2\b/i, value: 3, label: "P2 (High)" },
  { pattern: /\bp3\b/i, value: 2, label: "P3 (Medium)" },
  { pattern: /\bp4\b/i, value: 1, label: "P4 (Low)" },
  { pattern: /\burgent\b/i, value: 4, label: "Urgent", wordCue: true },
  { pattern: /\bhigh\s*prio(?:rity)?\b/i, value: 3, label: "High priority", wordCue: true },
  { pattern: /\blow\s*prio(?:rity)?\b/i, value: 1, label: "Low priority", wordCue: true },
];

export interface PriorityParseResult {
  entities: ParsedEntity[];
  consumedRanges: Array<{ start: number; end: number }>;
}

export function parsePriority(input: string): PriorityParseResult {
  const entities: ParsedEntity[] = [];
  const consumedRanges: Array<{ start: number; end: number }> = [];

  for (const { pattern, value, label, wordCue } of PRIORITY_KEYWORDS) {
    const match = input.match(pattern);
    if (!match) continue;

    const sourceText = match[0];
    const start = match.index ?? 0;
    const end = start + sourceText.length;

    // "This is not urgent": a denial, not an instruction — leave the words literal.
    if (isNegatedBefore(input, start)) continue;
    // "urgent care", "high priority support policy": the cue describes the next noun.
    if (wordCue && nounContinuesAfter(input, end)) continue;

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
