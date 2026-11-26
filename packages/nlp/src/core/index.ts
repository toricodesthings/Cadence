export const PARSER_VERSION = "3.4.0";

export const CONFIDENCE_TIERS = ["high", "medium", "low"] as const;
export type ConfidenceTier = (typeof CONFIDENCE_TIERS)[number];

export const WARNING_CODES = [
    "timed_deadline_needs_review",
    "low_confidence_entity",
    "multiple_dates_detected",
    "recurrence_with_deadline",
] as const;

export type WarningCode = (typeof WARNING_CODES)[number];

export const SOURCE_SURFACES = [
    "inline_add",
    "quick_add",
    "holding_capture",
    "holding_clarify",
    "clarify_sheet",
    "task_edit_title",
    "task_edit_note",
    "focus_view_composer",
    "inbox_card",
    "inbox",
] as const;

export type SourceSurface = (typeof SOURCE_SURFACES)[number];

export const DATE_STYLES = ["mdy", "dmy", "ymd"] as const;

export type DateStyle = (typeof DATE_STYLES)[number];

export type ParsedEntityType =
    | "due_date"
    | "scheduled_start"
    | "recurrence"
    | "priority"
    | "project"
    | "tag"
    | "waiting_on"
    | "duration"
    | "not_before"
    | "reminder";

export interface ParsedEntity {
    id: string;
    type: ParsedEntityType;
    sourceText: string;
    start: number;
    end: number;
    consumed?: { start: number; end: number };
    confidence: ConfidenceTier;
    normalizedValue: unknown;
    explanation: string;
}

export interface ParseResult {
    rawInput: string;
    cleanedTitle: string;
    parserVersion: string;
    sourceSurface: SourceSurface;
    entities: ParsedEntity[];
    warnings: WarningCode[];
    summary: string | null;
    overallConfidence: ConfidenceTier | null;
}

export interface CanonicalNlpEnvelope {
    rawInput: string;
    sourceSurface: SourceSurface;
    dateStyle: DateStyle;
    dismissedEntityIds: string[];
    userOverrides: Record<string, unknown>;
    resolved?: boolean;
}

export interface CanonicalNlpSnapshot extends ParseResult {
    dateStyle: DateStyle;
    dismissedEntityIds: string[];
    userOverrides: Record<string, unknown>;
}

export type LocalDate = string;
export type WallTime = string;

export interface NlpClock {
    today: LocalDate;
    now: WallTime;
    weekStart: "Sunday" | "Monday" | "Saturday";
}

// time-ok: LocalDate arithmetic, zone-free (nlp cannot import @cadence/domain)
const toUtc = (d: LocalDate): number => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
};
const fromUtc = (ms: number): LocalDate => new Date(ms).toISOString().slice(0, 10); // time-ok: UTC ms of a LocalDate, zone-free

export function addDaysLocal(d: LocalDate, n: number): LocalDate {
    return fromUtc(toUtc(d) + n * 86_400_000);
}
export function daysBetweenLocal(from: LocalDate, to: LocalDate): number {
    return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}
export function weekdayLocal(d: LocalDate): number {
    return new Date(toUtc(d)).getUTCDay();
}
export function endOfMonthLocal(d: LocalDate): LocalDate {
    const [y, m] = d.split("-").map(Number);
    return fromUtc(Date.UTC(y, m, 0));
}

export type TaskPriority = 0 | 1 | 2 | 3 | 4;

export interface RecurrenceValue {
    rrule: string;
    humanLabel: string;
}

export interface DateValue {
    date: LocalDate;
    time: WallTime | null;
    hasTime: boolean;
    endDate?: LocalDate;
    endTime?: WallTime;
    humanLabel: string;
}

export interface DurationValue {
    minutes: number;
    humanLabel: string;
}

export interface ResolutionContext {
    projects: Array<{ id: string; name: string }>;
    tags: Array<{ id: string; name: string }>;
}

export interface ParseOptions {
    input: string;
    sourceSurface: SourceSurface;
    clock: NlpClock;
    context?: ResolutionContext;
    dismissedEntityIds?: string[];
    dateStyle?: DateStyle;
}
