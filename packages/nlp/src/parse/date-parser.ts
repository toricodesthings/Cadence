import * as chrono from "chrono-node";
import type {
  ParsedEntity,
  DateValue,
  ConfidenceTier,
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

function isFalsePositive(text: string, fullInput: string): boolean {
  return FALSE_POSITIVE_GUARDS.some((p) => p.test(fullInput));
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(d: Date): string {
  return d.toISOString();
}

function formatHumanLabel(d: Date, hasTime: boolean): string {
  const now = new Date();
  const todayStr = formatDate(now);
  const dateStr = formatDate(d);

  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = formatDate(tomorrowDate);

  let label: string;
  if (dateStr === todayStr) {
    label = "Today";
  } else if (dateStr === tomorrowStr) {
    label = "Tomorrow";
  } else {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    label = `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
  }

  if (hasTime) {
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const h = hours % 12 || 12;
    const m = minutes > 0 ? `:${String(minutes).padStart(2, "0")}` : "";
    label += ` at ${h}${m} ${ampm}`;
  }

  return label;
}

export interface DateParseOptions {
  referenceDate?: Date;
  dateStyle?: "mdy" | "dmy" | "ymd";
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
  options: DateParseOptions = {},
): DateParseResult {
  const { referenceDate = new Date(), dateStyle = "mdy" } = options;

  // Pick the right chrono parser based on date style
  const parser =
    dateStyle === "dmy" ? chrono.en.GB : chrono.en;

  const results = parser.parse(input, referenceDate, {
    forwardDate: true,
  });

  const entities: ParsedEntity[] = [];
  const consumedRanges: Array<{ start: number; end: number }> = [];

  for (const result of results) {
    const sourceText = result.text;
    const start = result.index;
    const end = start + sourceText.length;

    // Skip false positives
    if (isFalsePositive(sourceText, input)) continue;

    const parsedDate = result.start.date();
    const hasTime =
      result.start.isCertain("hour") || result.start.isCertain("minute");

    // Check for "by/before/due at" language → needs review (Section 5.8)
    const beforeText = input.slice(Math.max(0, start - 10), start).toLowerCase();
    const hasDueLanguage = /\b(by|before|due\s+(at|by)?)\s*$/i.test(beforeText);

    let confidence: ConfidenceTier;
    if (hasDueLanguage && hasTime) {
      // Timed deadline without schema support → needs review
      confidence = "low";
    } else if (isHighConfidenceDate(sourceText)) {
      confidence = "high";
    } else {
      confidence = "medium";
    }

    const dateValue: DateValue = {
      date: formatDate(parsedDate),
      datetime: hasTime ? formatDateTime(parsedDate) : null,
      hasTime,
      humanLabel: formatHumanLabel(parsedDate, hasTime),
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

    consumedRanges.push({ start, end });
  }

  return { entities, consumedRanges };
}
