import type { ParsedEntity, DurationValue } from "../core/index.js";
import { isNegatedBefore } from "./guards.js";

const DURATION_PATTERNS: Array<{
  pattern: RegExp;
  resolve: (match: RegExpMatchArray) => DurationValue;
}> = [
  // "an hour", "one hour"
  {
    pattern: /(?<!\bhalf\s)(?<!\bof\s)\b(?:an?|one)\s+hour\b(?!\s+and\s+a\s+half)/i,
    resolve: () => ({ minutes: 60, humanLabel: "1 hour" }),
  },
  // "two hours" … "six hours"
  {
    pattern: /\b(two|three|four|five|six)\s+hours?\b/i,
    resolve: (m) => {
      const hours = { two: 2, three: 3, four: 4, five: 5, six: 6 }[m[1].toLowerCase() as "two"];
      return { minutes: hours * 60, humanLabel: `${hours} hours` };
    },
  },
  // "half hour", "half an hour"
  {
    pattern: /\bhalf\s+(?:an?\s+)?hour\b/i,
    resolve: () => ({
      minutes: 30,
      humanLabel: "30 min",
    }),
  },
  // "quarter hour", "quarter of an hour"
  {
    pattern: /\bquarter\s+(?:of\s+)?(?:an?\s+)?hour\b/i,
    resolve: () => ({
      minutes: 15,
      humanLabel: "15 min",
    }),
  },
  // "30 min", "45 minutes", "30m", "90 mins"
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

const WAITING_PATTERN = /\bwaiting\s+(?:on|for)\s+(.+?)(?:\s*$|\s*[,;]|\s+(?:for|about|regarding|and|so|then|by|before|until|due|tomorrow|today|tonight|next|this|on|at|p[1-4])\b)/i;
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
    // "in 30 minutes" / "within 2 hours" is when something starts, not how long it takes
    if (/\b(?:in|within|after)\s+$/i.test(input.slice(0, match.index ?? 0))) continue;

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

    // "takes 45 minutes", "for half an hour": the cue word goes with the estimate
    const cue = /\b(?:takes?|taking|about|around|for)\s+$/i.exec(input.slice(0, start));
    consumedRanges.push({ start: cue ? start - cue[0].length : start, end });
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
  // "Not waiting on Sam anymore": a release, not a dependency — leave it literal.
  if (match && isNegatedBefore(input, match.index ?? 0)) return { entities, consumedRanges };
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
        normalizedValue: { person },
        explanation: `Waiting on: ${person}`,
      });

      consumedRanges.push({ start, end });
    }
  }

  return { entities, consumedRanges };
}

const UNIT_MINUTES: Record<string, number> = { m: 1, h: 60, d: 1440 };
const RELATIVE_REMINDER =
  /\b(?:remind(?:\s+me)?|reminder|alert(?:\s+me)?|notify(?:\s+me)?)\s+(\d+|an?|one|half\s+an?)\s*(min(?:ute)?s?|m|hours?|hrs?|h|days?|d)\s+(?:before|ahead|early|prior)\b/i;

/**
 * "remind me 30 minutes before": a nudge measured back from the task's timed start. The value carries only the
 * offset; the draft turns it into an instant once it knows the start (no start, nothing applies).
 */
export function parseRelativeReminder(input: string): EntityParseResult {
  const match = RELATIVE_REMINDER.exec(input);
  if (!match) return { entities: [], consumedRanges: [] };
  const amount = /^half/i.test(match[1]) ? 0.5 : /^\d/.test(match[1]) ? parseInt(match[1], 10) : 1;
  const beforeMinutes = Math.round(amount * UNIT_MINUTES[match[2][0].toLowerCase()]);
  if (beforeMinutes < 1 || beforeMinutes > 7 * 1440) return { entities: [], consumedRanges: [] };
  const start = match.index;
  const end = start + match[0].length;
  const humanLabel = beforeMinutes % 1440 === 0 ? `${beforeMinutes / 1440} day${beforeMinutes === 1440 ? "" : "s"} before`
    : beforeMinutes % 60 === 0 ? `${beforeMinutes / 60} hour${beforeMinutes === 60 ? "" : "s"} before`
    : `${beforeMinutes} min before`;
  return {
    entities: [{
      id: `reminder:before:${beforeMinutes}`,
      type: "reminder",
      sourceText: match[0],
      start,
      end,
      confidence: "high",
      normalizedValue: { beforeMinutes, humanLabel },
      explanation: `Reminder ${humanLabel}`,
    }],
    consumedRanges: [{ start, end }],
  };
}
