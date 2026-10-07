import * as chrono from "chrono-node";
import {
  addDaysLocal,
  daysBetweenLocal,
  endOfMonthLocal,
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

/** Ranges of noun phrases that merely look like dates; only a date overlapping one is skipped. */
function guardRanges(input: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const p of FALSE_POSITIVE_GUARDS) {
    const m = p.exec(input);
    if (m) ranges.push({ start: m.index, end: m.index + m[0].length });
  }
  return ranges;
}

/** "in the next 2 days" / "within 3 days": a flexible window, offered as a deadline but never applied. */
const WINDOW_RE = /\b(?:within\s+(?:the\s+)?(?:next\s+)?|in\s+the\s+next\s+)(\d+|one|two|three|four|five|six|seven)\s+days?\b/i;
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

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
  const guards = guardRanges(input);

  const windowMatch = WINDOW_RE.exec(input);
  const windowSpan = windowMatch && {
    start: windowMatch.index,
    end: windowMatch.index + windowMatch[0].length,
  };
  if (windowMatch && windowSpan) {
    const n = NUMBER_WORDS[windowMatch[1].toLowerCase()] ?? Number(windowMatch[1]);
    const day = addDaysLocal(clock.today, n);
    const sourceText = windowMatch[0];
    entities.push({
      id: `due_date:${sourceText.toLowerCase().replace(/\s+/g, "_")}`,
      type: "due_date",
      sourceText,
      ...windowSpan,
      confidence: "low",
      normalizedValue: { date: day, time: null, hasTime: false, humanLabel: formatHumanLabel(day, null, clock.today) },
      explanation: `Possible deadline: ${formatHumanLabel(day, null, clock.today)}`,
    });
    consumedRanges.push(windowSpan);
  }

  // "end of this month" / "end of next month": the last day, offered as a deadline.
  const eom = /\b(?:(?:by|before)\s+)?(?:the\s+)?end\s+of\s+(this|next|the)\s+month\b/i.exec(input);
  const eomSpan = eom && { start: eom.index, end: eom.index + eom[0].length };
  if (eom && eomSpan && !/^before\b/i.test(eom[0])) {
    const base = /next/i.test(eom[1]) ? addDaysLocal(endOfMonthLocal(clock.today), 1) : clock.today;
    const day = endOfMonthLocal(base);
    const label = formatHumanLabel(day, null, clock.today);
    entities.push({
      id: `due_date:${eom[0].toLowerCase().replace(/\s+/g, "_")}`,
      type: "due_date",
      sourceText: eom[0],
      ...eomSpan,
      confidence: "medium",
      normalizedValue: { date: day, time: null, hasTime: false, humanLabel: label },
      explanation: `Detected deadline: ${label}`,
    });
    consumedRanges.push(eomSpan);
  }

  // Chrono cannot read Feb 29 outside a leap year, so it is read here: the next real one.
  const leapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  for (const m of input.matchAll(/\bfeb(?:ruary)?\.?\s+29(?:st|nd|rd|th)?\b/gi)) {
    let year = Number(clock.today.slice(0, 4));
    while (!leapYear(year) || `${year}-02-29` < clock.today) year++;
    const date = new Date(Date.UTC(year, 1, 29, 12));
    const index = m.index ?? 0;
    if (results.some((r) => index < r.index + r.text.length && index + m[0].length > r.index)) continue;
    results.push({ text: m[0], index, start: { date: () => date, isCertain: () => false }, end: null } as unknown as (typeof results)[number]);
  }
  results.sort((a, b) => a.index - b.index);

  /** A day-part word or an explicit am/pm or 24-hour time settles the hour; a bare "at 5" does not. */
  const settlesMeridiem = (text: string) =>
    /\d\s*(?:a\.?m|p\.?m)\b|\b(?:tonight|morning|afternoon|evening|night|noon|midnight)\b|\b(?:minutes?|mins?|hours?|hrs?)\b/i.test(text) || /(?:^|\D)(?:0\d|1[3-9]|2[0-3]):\d\d/.test(text) || /\bat\s+(?:1[3-9]|2[0-3])\b/i.test(text);

  /** A pending "not Friday," waiting for what replaces it ("Monday instead"). */
  let negated: { start: number; end: number } | null = null;

  for (const result of results) {
    let sourceText = result.text;
    let start = result.index;
    // "Plan the day at 7am": "the day" is the task's own words, only "at 7am" is a time. A bare "morning" is not a date.
    const lead0 = /^(?:the\s+)?day\s+(?=at\s+\d)/i.exec(sourceText);
    if (lead0) {
      sourceText = sourceText.slice(lead0[0].length);
      start += lead0[0].length;
    } else if (/^(?:the\s+)?day$/i.test(sourceText) || /^(?:in\s+the\s+)?(?:morning|afternoon|evening|night)$/i.test(sourceText)) {
      continue;
    }
    const end = start + sourceText.length;

    // Skip a date inside a look-alike noun phrase, or already read as a window or an end of month
    if (guards.some((g) => start < g.end && end > g.start)) continue;
    if (windowSpan && start < windowSpan.end && end > windowSpan.start) continue;
    if (eomSpan && start < eomSpan.end && end > eomSpan.start) continue;

    const lead = input.slice(Math.max(0, start - 28), start);

    // "not Friday": that day is ruled out, never applied
    const not = /\bnot\s+(?:on\s+)?$/i.exec(lead);
    if (not) {
      negated = { start: start - not[0].length, end };
      continue;
    }

    const parsed = result.start.date();
    let day: LocalDate = `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())}`;
    const hasTime = result.start.isCertain("hour") || result.start.isCertain("minute");

    const hide = /\b(?:(?:hide|hidden|snooze)(?:\s+it)?\s+until|not\s+before)\s+$/i.exec(lead);
    const remind = /\b(?:remind(?:\s+me)?|reminder)(?:\s+(?:at|on|for))?\s+$/i.exec(lead);
    // The cue word goes with the date, so the title doesn't end in a dangling "before" or "remind me".
    const dueMatch = /\b(?:by|before|due(?:\s+(?:at|by|on))?)\s+$/i.exec(lead);
    const onCue = hide || remind || dueMatch ? null : /\bon\s+$/i.exec(lead);
    const cue = hide ?? remind ?? dueMatch ?? onCue;
    // "by Friday" includes Friday; "before Friday" / "before March" ends the day before.
    // A time keeps its own boundary ("before 6 PM" is due at 6 PM).
    if (dueMatch && !hasTime && /\bbefore\s+$/i.test(lead)) day = addDaysLocal(day, -1);

    const entityType = hide ? "not_before" as const : remind ? "reminder" as const : dueMatch ? "due_date" as const : "scheduled_start" as const;

    let consumedStart = cue ? start - cue[0].length : start;
    let consumedEnd = end;
    // "Monday instead" completes a "not Friday,": the whole correction goes with the date
    if (negated && /^[\s,;]*(?:but\s+)?$/i.test(input.slice(negated.end, start))) {
      consumedStart = Math.min(consumedStart, negated.start);
      const instead = /^\s+instead\b/i.exec(input.slice(end));
      if (instead) consumedEnd = end + instead[0].length;
    }
    negated = null;
    // "remind me tomorrow at 9 to call mom": the "to" belongs to the reminder
    if (remind) consumedEnd += /^\s+to(?=\s)/i.exec(input.slice(end))?.[0].length ?? 0;

    const time: WallTime | null = hasTime && entityType !== "not_before" ? `${pad(parsed.getUTCHours())}:${pad(parsed.getUTCMinutes())}` : null;
    const endParsed = result.end;
    const endDate = endParsed && hasTime && endParsed.isCertain("hour") ? endParsed.date() : null;

    // A bare hour could be morning or evening: offer both, apply neither
    const hour = parsed.getUTCHours();
    const ambiguous = time !== null && (entityType === "scheduled_start" || entityType === "reminder") && hour >= 1 && hour <= 11 && !settlesMeridiem(`${lead.slice(-12)}${sourceText}`);
    const variants: Array<{ shift: number; suffix: string }> = ambiguous ? [{ shift: 0, suffix: ":am" }, { shift: 12, suffix: ":pm" }] : [{ shift: 0, suffix: "" }];

    // "maybe Friday", "sometime next week": a hope, not a plan. A bare week or month is a period, not a day,
    // unless it anchors a start ("starting next week").
    const hedged = /\b(?:maybe|perhaps|possibly|probably|sometime|someday|might|whenever|around)\s+(?:\w+\s+){0,2}$/i.test(lead);
    const anchors = /\b(?:starting|starts?|beginning|from)\s+$/i.test(lead);
    const vague = !anchors && /^(?:(?:this|next|the)\s+(?:week|month|year)|(?:in\s+)?a\s+(?:week|month))$/i.test(sourceText.trim());

    for (const variant of variants) {
      let confidence: ConfidenceTier;
      if (ambiguous || hedged || vague) {
        confidence = "low";
      } else if ((entityType === "due_date" && hasTime) || (entityType === "reminder" && !time)) {
        // A timed deadline has nowhere to live; a reminder needs a time to anchor on
        confidence = "low";
      } else if (isHighConfidenceDate(sourceText)) {
        confidence = "high";
      } else {
        confidence = "medium";
      }

      const shownTime = time === null ? null : `${pad(hour + variant.shift)}:${pad(parsed.getUTCMinutes())}`;
      const dateValue: DateValue = {
        date: day,
        time: shownTime,
        hasTime: shownTime !== null,
        humanLabel: formatHumanLabel(day, shownTime, clock.today),
      };
      if (endDate && shownTime) {
        dateValue.endDate = `${endDate.getUTCFullYear()}-${pad(endDate.getUTCMonth() + 1)}-${pad(endDate.getUTCDate())}`;
        dateValue.endTime = `${pad(endDate.getUTCHours() + (ambiguous ? variant.shift : 0))}:${pad(endDate.getUTCMinutes())}`;
      }

      entities.push({
        id: `${entityType}:${sourceText.toLowerCase().replace(/\s+/g, "_")}${variant.suffix}`,
        type: entityType,
        sourceText,
        start,
        end,
        confidence,
        normalizedValue: dateValue,
        explanation: entityType === "due_date" ? `Detected deadline: ${dateValue.humanLabel}` : entityType === "not_before" ? `Hidden until: ${dateValue.humanLabel}` : entityType === "reminder" ? `Reminder: ${dateValue.humanLabel}` : `Detected date: ${dateValue.humanLabel}`,
      });
      consumedRanges.push({ start: consumedStart, end: consumedEnd });
    }
  }

  // Two clear dates in the same role compete: neither is applied, both stay visible to choose from.
  for (const type of ["due_date", "scheduled_start", "not_before", "reminder"] as const) {
    const clear = entities.filter((e) => e.type === type && e.confidence !== "low");
    if (clear.length > 1) for (const e of clear) e.confidence = "low";
  }

  return { entities, consumedRanges };
}
