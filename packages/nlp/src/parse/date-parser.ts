import * as chrono from "chrono-node";
import {
  addDaysLocal,
  daysBetweenLocal,
  weekdayLocal,
  type LocalDate,
  type WallTime,
  type NlpClock,
} from "../core/index.js";
import type {
  ParsedEntity,
  DateValue,
  ConfidenceTier,
  DateStyle,
} from "../core/index.js";

/** Date phrases that should always be high-confidence */
const HIGH_CONFIDENCE_PATTERNS = [
  /\btoday\b/i,
  /\btomorrow\b/i,
  /\byesterday\b/i,
  /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)\b/i,
  /\bthis\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|weekend)\b/i,
  /\bin\s+\d+\s+(day|days|week|weeks|month|months)\b/i,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}/i,
  /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
  /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\bat\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b/i,
  /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i,
];

/**
 * Phrases that look like dates but shouldn't be parsed as such.
 * These appear in natural task titles and would produce false positives.
 */
const FALSE_POSITIVE_GUARDS = [
  /\bmonthly\s+report\b/i,
  /\bfriday'?s?\s+notes?\b/i,
  /\bweekly\s+standup\b/i,
  /\bdaily\s+digest\b/i,
  /\bsummer\b/i,
  /\bspring\b/i,
  /\bfall\b/i,
  /\bwinter\b/i,
  // Possessive day names (e.g., "Monday's meeting notes")
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)'s\s+\w/i,
  // Titles with apostrophe-s containing day/month names (e.g., "Heaven's Night")
  /\w+'s\s+(night|day|morning|evening|dawn|dusk)\b/i,
  // Compound nouns with day/month words (e.g., "Black Friday deal")
  /\b(black|good|casual)\s+friday\b/i,
  /\bmay\s+day\b/i,
  /\bsunday\s+(best|school|league|roast|brunch)\b/i,
  /\bsaturday\s+(night|morning)\s+(live|fever)\b/i,
  // Song/movie/book titles with date words
  /\b\w+day\s+(night|morning)\b/i,
  // Common compound nouns / proper names with month words
  /\bmarch\s+(madness|of\s+the)\b/i,
  /\bmay\s+(flower|pole|queen)\b/i,
  /\bjune\s+bug\b/i,
  /\baugust\s+(rush|wilson|moon)\b/i,
  // Adjective-style day references ("daily standup", "weekly sync", "monthly review")
  /\b(daily|weekly|monthly|yearly|annual)\s+\w+/i,
  // "morning routine", "evening walk", "afternoon nap" — descriptive, not scheduling
  /\b(morning|evening|afternoon|night)\s+(routine|walk|nap|jog|meditation|yoga|workout|ritual|commute|shift)\b/i,
  // "one day", "some day", "any day" — vague, not real dates
  /\b(one|some|any|each|every)\s+day\b/i,
  // "day off", "day shift", "day trip" — noun phrases, not dates
  /\bday\s+(off|shift|trip|care|dream|job)\b/i,
  // "yesterday's meeting" — possessive past references in titles
  /\byesterday'?s\s+\w+/i,
  // "Happy Friday", "Thank God it's Friday" — social phrases
  /\bhappy\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\btgif\b/i,
];

function isHighConfidenceDate(text: string): boolean {
  return HIGH_CONFIDENCE_PATTERNS.some((p) => p.test(text));
}

function isFalsePositive(fullInput: string): boolean {
  return FALSE_POSITIVE_GUARDS.some((p) => p.test(fullInput));
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatHumanLabel(day: LocalDate, time: WallTime | null, today: LocalDate): string {
  const diff = daysBetweenLocal(today, day);
  let label: string;
  if (diff === 0) label = "Today";
  else if (diff === 1) label = "Tomorrow";
  else label = `${DAYS[weekdayLocal(day)]}, ${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;

  if (time) {
    const [hours, minutes] = time.split(":").map(Number);
    const h = hours % 12 || 12;
    const m = minutes > 0 ? `:${String(minutes).padStart(2, "0")}` : "";
    label += ` at ${h}${m} ${hours >= 12 ? "PM" : "AM"}`;
  }
  return label;
}

const pad = (n: number) => String(n).padStart(2, "0");

export interface DateParseOptions {
  clock: NlpClock;
  dateStyle?: DateStyle;
}

export interface DateParseResult {
  entities: ParsedEntity[];
  /** Ranges of characters consumed by date parsing */
  consumedRanges: Array<{ start: number; end: number }>;
}

/**
 * Parse date and time expressions from natural language text.
 * Uses chrono-node for robust date extraction.
 */
export function parseDates(
  input: string,
  options: DateParseOptions,
): DateParseResult {
  const { clock, dateStyle = "mdy" } = options;
  // A floating date: its UTC fields are the user's wall clock, so chrono never touches the machine zone.
  const [y, mo, d] = clock.today.split("-").map(Number);
  const [h, mi] = clock.now.split(":").map(Number);
  const reference = { instant: new Date(Date.UTC(y, mo - 1, d, h, mi)), timezone: 0 };

  // Pick the right chrono parser based on date style
  const parser =
    dateStyle === "dmy" ? chrono.en.GB : chrono.en;

  const results = parser.parse(input, reference, {
    forwardDate: true,
  });

  const entities: ParsedEntity[] = [];
  const consumedRanges: Array<{ start: number; end: number }> = [];

  for (const result of results) {
    const sourceText = result.text;
    const start = result.index;
    const end = start + sourceText.length;

    // Skip false positives
    if (isFalsePositive(input)) continue;

    const parsed = result.start.date();
    let day: LocalDate = `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())}`;
    const hasTime =
      result.start.isCertain("hour") || result.start.isCertain("minute");

    // Check for "by/before/due at" language → needs review (Section 5.8)
    const beforeText = input.slice(Math.max(0, start - 10), start).toLowerCase();
    const dueMatch = /\b(by|before|due\s+(at|by)?)\s*$/i.exec(beforeText);
    const hasDueLanguage = Boolean(dueMatch);
    // "by Friday" includes Friday; "before Friday" / "before March" ends the day before.
    // A time keeps its own boundary ("before 6 PM" is due at 6 PM).
    if (!hasTime && /\bbefore\s*$/i.test(beforeText)) {
      day = addDaysLocal(day, -1);
    }

    let confidence: ConfidenceTier;
    if (hasDueLanguage && hasTime) {
      // Timed deadline without schema support → needs review
      confidence = "low";
    } else if (isHighConfidenceDate(sourceText)) {
      confidence = "high";
    } else {
      confidence = "medium";
    }

    const time: WallTime | null = hasTime ? `${pad(parsed.getUTCHours())}:${pad(parsed.getUTCMinutes())}` : null;
    const dateValue: DateValue = {
      date: day,
      time,
      hasTime,
      humanLabel: formatHumanLabel(day, time, clock.today),
    };

    // Determine entity type based on context
    const entityType = hasDueLanguage ? "due_date" as const : "scheduled_start" as const;

    entities.push({
      id: `${entityType}:${sourceText.toLowerCase().replace(/\s+/g, "_")}`,
      type: entityType,
      sourceText,
      start,
      end,
      confidence,
      normalizedValue: dateValue,
      explanation: hasDueLanguage
        ? `Detected deadline: ${dateValue.humanLabel}`
        : `Detected date: ${dateValue.humanLabel}`,
    });

    // The deadline word goes with the date, so the title doesn't end in a dangling "before".
    const consumedStart = dueMatch ? start - (beforeText.length - dueMatch.index) : start;
    consumedRanges.push({ start: consumedStart, end });
  }

  return { entities, consumedRanges };
}
