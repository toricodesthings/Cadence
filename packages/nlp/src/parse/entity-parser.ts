import type { ParsedEntity, DurationValue } from "../core/index.js";

const DURATION_PATTERNS: Array<{
  pattern: RegExp;
  resolve: (match: RegExpMatchArray) => DurationValue;
}> = [
  // "30 min", "45 minutes", "30m"
  {
    pattern: /\b(\d+)\s*(?:min(?:ute)?s?|m)\b/i,
    resolve: (m) => ({
      minutes: parseInt(m[1], 10),
      humanLabel: `${m[1]} min`,
    }),
  },
  // "1 hour", "2 hours", "1.5 hours", "1h", "2hr"
  {
    pattern: /\b(\d+(?:\.\d+)?)\s*(?:hour|hours|hrs?|h)\b/i,
    resolve: (m) => {
      const hours = parseFloat(m[1]);
      const minutes = Math.round(hours * 60);
      return {
        minutes,
        humanLabel: hours === 1 ? "1 hour" : `${hours} hours`,
      };
    },
  },
  // "1h30m", "1h 30m"
  {
    pattern: /\b(\d+)\s*h\s*(\d+)\s*m?\b/i,
    resolve: (m) => {
      const minutes = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      return {
        minutes,
        humanLabel: `${m[1]}h ${m[2]}m`,
      };
    },
  },
];

const WAITING_PATTERN = /\bwaiting\s+(?:on|for)\s+(.+?)(?:\s*$|\s+(?:by|before|until|due|tomorrow|today|next))/i;
const WAITING_SIMPLE = /\bwaiting\s+(?:on|for)\s+(.+)/i;

export interface EntityParseResult {
  entities: ParsedEntity[];
  consumedRanges: Array<{ start: number; end: number }>;
}

/**
 * Parse duration estimates from natural language.
 */
export function parseDuration(input: string): EntityParseResult {
  const entities: ParsedEntity[] = [];
  const consumedRanges: Array<{ start: number; end: number }> = [];

  for (const { pattern, resolve } of DURATION_PATTERNS) {
    const match = input.match(pattern);
    if (!match) continue;

    const value = resolve(match);
    // Only accept reasonable durations (1 min – 8 hours)
    if (value.minutes < 1 || value.minutes > 480) continue;

    const sourceText = match[0];
    const start = match.index ?? 0;
    const end = start + sourceText.length;

    entities.push({
      id: `duration:${value.minutes}`,
      type: "duration",
      sourceText,
      start,
      end,
      confidence: "high",
      normalizedValue: value,
      explanation: `Detected duration: ${value.humanLabel}`,
    });

    consumedRanges.push({ start, end });
    break;
  }

  return { entities, consumedRanges };
}

/**
 * Parse "waiting on/for [person]" patterns.
 */
export function parseWaitingOn(input: string): EntityParseResult {
  const entities: ParsedEntity[] = [];
  const consumedRanges: Array<{ start: number; end: number }> = [];

  const match = input.match(WAITING_PATTERN) || input.match(WAITING_SIMPLE);
  if (match) {
    const person = match[1].trim();
    if (person.length > 0 && person.length < 100) {
      const sourceText = match[0];
      const start = match.index ?? 0;
      const end = start + sourceText.length;

      entities.push({
        id: `waiting_on:${person.toLowerCase().replace(/\s+/g, "_")}`,
        type: "waiting_on",
        sourceText,
        start,
        end,
        confidence: "high",
        normalizedValue: person,
        explanation: `Waiting on: ${person}`,
      });

      consumedRanges.push({ start, end });
    }
  }

  return { entities, consumedRanges };
}
