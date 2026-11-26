import type { ParsedEntity, RecurrenceValue } from "../core/index.js";
import { nounContinuesAfter } from "./guards.js";

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
    {
        pattern: /\b(every\s*day|daily)\b/i,
        resolve: () => ({
            rrule: "FREQ=DAILY",
            humanLabel: "Every day",
        }),
    },
    {
        pattern: /\b(every\s*weekday|weekdays)\b/i,
        resolve: () => ({
            rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
            humanLabel: "Every weekday",
        }),
    },
    {
        pattern: /\b(every\s*weekend)\b/i,
        resolve: () => ({
            rrule: "FREQ=WEEKLY;BYDAY=SA,SU",
            humanLabel: "Every weekend",
        }),
    },
    {
        pattern:
            /\bevery\s+other\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i,
        resolve: (match) => {
            const byDay = WEEKDAY_MAP[match[1].toLowerCase()];
            return {
                rrule: `FREQ=WEEKLY;INTERVAL=2;BYDAY=${byDay}`,
                humanLabel: `Every other ${WEEKDAY_LABELS[byDay]}`,
            };
        },
    },
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
    {
        pattern: /\bevery\s*week\b/i,
        resolve: () => ({
            rrule: "FREQ=WEEKLY",
            humanLabel: "Every week",
        }),
    },
    {
        pattern: /\bevery\s+(\d+)\s+(day|days|week|weeks|month|months)\b/i,
        resolve: (match) => {
            const interval = parseInt(match[1], 10);
            const unit = match[2].toLowerCase().replace(/s$/, "");
            const freq = unit === "day" ? "DAILY" : unit === "week" ? "WEEKLY" : "MONTHLY";
            return {
                rrule: `FREQ=${freq};INTERVAL=${interval}`,
                humanLabel: `Every ${interval} ${unit}${interval > 1 ? "s" : ""}`,
            };
        },
    },
    {
        pattern: /\bevery\s+month\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
        resolve: (match) => {
            const day = parseInt(match[1], 10);
            if (day < 1 || day > 31) return null;
            return {
                rrule: `FREQ=MONTHLY;BYMONTHDAY=${day}`,
                humanLabel: `Monthly on the ${day}${["th", "st", "nd", "rd"][day % 10 > 3 || Math.floor(day / 10) === 1 ? 0 : day % 10]}`,
            };
        },
    },
    {
        pattern: /\b(every\s*month|monthly)\b/i,
        resolve: () => ({
            rrule: "FREQ=MONTHLY",
            humanLabel: "Every month",
        }),
    },
    {
        pattern: /\b(every\s*year|yearly|annually)\b/i,
        resolve: () => ({
            rrule: "FREQ=YEARLY",
            humanLabel: "Every year",
        }),
    },
    {
        pattern: /\b(biweekly|every\s+other\s+week)\b/i,
        resolve: () => ({
            rrule: "FREQ=WEEKLY;INTERVAL=2",
            humanLabel: "Every other week",
        }),
    },
];

const DAY_NAME = "(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)s?";

const DAY_EXCEPTION = new RegExp(
    `^\\s*(?:,\\s*)?(?:except|but(?:\\s+not)?|excluding|other\\s+than)\\s+(?:the\\s+)?(weekends?|weekdays?|${DAY_NAME}(?:\\s*(?:,|and|or)\\s*${DAY_NAME})*)\\b`,
    "i",
);

const EXCEPTION_MARKER = /^\s*(?:,\s*)?(?:except|but(?:\s+not)?|excluding|other\s+than)\b/i;

const EXCEPTION_PHRASE =
    /^\s*(?:,\s*)?(?:except|but\s+not|excluding|other\s+than)\s+\S.*?(?=\s(?:at|on|by|before|after|until|till|tomorrow|today|tonight|next|this|every|remind|waiting|p[1-4])\b|[,;]|$)/i;

const ALL_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

function excludedDays(text: string): string[] | undefined {
    const lower = text.toLowerCase().trim();
    if (/^weekends?$/.test(lower)) return ["SA", "SU"];
    if (/^weekdays?$/.test(lower)) return ["MO", "TU", "WE", "TH", "FR"];
    const days = lower
        .split(/\s*(?:,|and|or)\s*/i)
        .map((d) => d.trim())
        .map((d) => WEEKDAY_MAP[d] ?? WEEKDAY_MAP[d.replace(/s$/, "")])
        .filter((d): d is string => Boolean(d));
    return days.length > 0 ? days : undefined;
}

function applyDayException(value: RecurrenceValue, exceptionText: string): RecurrenceValue | null {
    if (value.rrule !== "FREQ=DAILY") return null;
    const excluded = excludedDays(exceptionText);
    if (!excluded) return null;
    const remaining = ALL_DAYS.filter((d) => !excluded.includes(d));
    if (remaining.length === 0) return null;
    return {
        rrule: `FREQ=WEEKLY;BYDAY=${remaining.join(",")}`,
        humanLabel: `${value.humanLabel} except ${exceptionText.trim()}`,
    };
}

export interface RecurrenceParseResult {
    entities: ParsedEntity[];
    consumedRanges: Array<{ start: number; end: number }>;
    protectedRanges: Array<{ start: number; end: number }>;
}

export function parseRecurrence(input: string): RecurrenceParseResult {
    const entities: ParsedEntity[] = [];
    const consumedRanges: Array<{ start: number; end: number }> = [];
    const protectedRanges: Array<{ start: number; end: number }> = [];

    for (const { pattern, resolve } of RECURRENCE_PATTERNS) {
        const match = input.match(pattern);
        if (!match) continue;

        let value = resolve(match);
        if (!value) continue;

        const sourceText = match[0];
        const start = match.index ?? 0;
        let end = start + sourceText.length;

        const exception = DAY_EXCEPTION.exec(input.slice(end));
        if (exception) {
            const converted = applyDayException(value, exception[1]);
            if (!converted) {
                protectedRanges.push(protectedExceptionRange(input, start, end));
                break;
            }
            value = converted;
            end += exception[0].length;
        } else if (EXCEPTION_MARKER.test(input.slice(end))) {
            protectedRanges.push(protectedExceptionRange(input, start, end));
            break;
        }

        if (/^(?:daily|monthly|yearly|annually|biweekly)$/i.test(sourceText) && nounContinuesAfter(input, end))
            continue;

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
        break;
    }

    return { entities, consumedRanges, protectedRanges };
}

function protectedExceptionRange(input: string, start: number, ruleEnd: number): { start: number; end: number } {
    const phrase = EXCEPTION_PHRASE.exec(input.slice(ruleEnd));
    return { start, end: phrase ? ruleEnd + phrase[0].length : ruleEnd };
}
