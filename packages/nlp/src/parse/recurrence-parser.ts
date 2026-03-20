import type { ParsedEntity, RecurrenceValue } from "../core/index.js";

interface RecurrencePattern {
  pattern: RegExp;
  resolve: (match: RegExpMatchArray) => RecurrenceValue | null;
}

const WEEKDAY_MAP: Record<string, string> = {
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA",
  sunday: "SU",
  mon: "MO",
  tue: "TU",
  wed: "WE",
  thu: "TH",
  fri: "FR",
  sat: "SA",
  sun: "SU",
};

const WEEKDAY_LABELS: Record<string, string> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
};

const RECURRENCE_PATTERNS: RecurrencePattern[] = [
  // "every day" / "daily"
  {
    pattern: /\b(every\s*day|daily)\b/i,
    resolve: () => ({
      rrule: "FREQ=DAILY",
      humanLabel: "Every day",
    }),
  },
  // "every weekday" / "weekdays"
  {
    pattern: /\b(every\s*weekday|weekdays)\b/i,
    resolve: () => ({
      rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      humanLabel: "Every weekday",
    }),
  },
  // "every weekend"
  {
    pattern: /\b(every\s*weekend)\b/i,
    resolve: () => ({
      rrule: "FREQ=WEEKLY;BYDAY=SA,SU",
      humanLabel: "Every weekend",
    }),
  },
  // "every [day of week]" — e.g. "every Monday", "every tue"
  {
    pattern: /\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i,
    resolve: (match) => {
      const day = match[1].toLowerCase();
      const byDay = WEEKDAY_MAP[day];
      if (!byDay) return null;
      return {
        rrule: `FREQ=WEEKLY;BYDAY=${byDay}`,
        humanLabel: `Every ${WEEKDAY_LABELS[byDay]}`,
      };
    },
  },
  // "every [day] and [day]" — e.g. "every monday and wednesday"
  {
    pattern:
      /\bevery\s+((?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)(?:\s*(?:,|and)\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun))+)\b/i,
    resolve: (match) => {
      const dayStr = match[1].toLowerCase();
      const dayNames = dayStr.split(/\s*(?:,|and)\s*/i).filter(Boolean);
      const byDays = dayNames.map((d) => WEEKDAY_MAP[d.trim()]).filter(Boolean);
      if (byDays.length === 0) return null;
      return {
        rrule: `FREQ=WEEKLY;BYDAY=${byDays.join(",")}`,
        humanLabel: `Every ${byDays.map((b) => WEEKDAY_LABELS[b]).join(", ")}`,
      };
    },
  },
  // "every week"
  {
    pattern: /\bevery\s*week\b/i,
    resolve: () => ({
      rrule: "FREQ=WEEKLY",
      humanLabel: "Every week",
    }),
  },
  // "every N days/weeks/months"
  {
    pattern: /\bevery\s+(\d+)\s+(day|days|week|weeks|month|months)\b/i,
    resolve: (match) => {
      const interval = parseInt(match[1], 10);
      const unit = match[2].toLowerCase().replace(/s$/, "");
      const freq =
        unit === "day"
          ? "DAILY"
          : unit === "week"
            ? "WEEKLY"
            : "MONTHLY";
      return {
        rrule: `FREQ=${freq};INTERVAL=${interval}`,
        humanLabel: `Every ${interval} ${unit}${interval > 1 ? "s" : ""}`,
      };
    },
  },
  // "every month" / "monthly"
  {
    pattern: /\b(every\s*month|monthly)\b/i,
    resolve: () => ({
      rrule: "FREQ=MONTHLY",
      humanLabel: "Every month",
    }),
  },
  // "every year" / "yearly" / "annually"
  {
    pattern: /\b(every\s*year|yearly|annually)\b/i,
    resolve: () => ({
      rrule: "FREQ=YEARLY",
      humanLabel: "Every year",
    }),
  },
  // "biweekly" / "every other week"
  {
    pattern: /\b(biweekly|every\s+other\s+week)\b/i,
    resolve: () => ({
      rrule: "FREQ=WEEKLY;INTERVAL=2",
      humanLabel: "Every other week",
    }),
  },
];

export interface RecurrenceParseResult {
  entities: ParsedEntity[];
  consumedRanges: Array<{ start: number; end: number }>;
}

/**
 * Parse recurrence expressions from natural language text.
 * Uses rule tables, not rrule.fromText().
 */
export function parseRecurrence(input: string): RecurrenceParseResult {
  const entities: ParsedEntity[] = [];
  const consumedRanges: Array<{ start: number; end: number }> = [];

  for (const { pattern, resolve } of RECURRENCE_PATTERNS) {
    const match = input.match(pattern);
    if (!match) continue;

    const value = resolve(match);
    if (!value) continue;

    const sourceText = match[0];
    const start = match.index ?? 0;
    const end = start + sourceText.length;

    entities.push({
      id: `recurrence:${value.rrule.toLowerCase().replace(/[;=,]/g, "_")}`,
      type: "recurrence",
      sourceText,
      start,
      end,
      confidence: "high",
      normalizedValue: value,
      explanation: `Detected recurrence: ${value.humanLabel}`,
    });

    consumedRanges.push({ start, end });
    break; // Only one recurrence per input
  }

  return { entities, consumedRanges };
}
