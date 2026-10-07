/** Parser version — bumped on any behavior-changing parser update */
export const PARSER_VERSION = "3.4.0";

// ── Confidence Model (Section 9) ──

export type ConfidenceTier = "high" | "medium" | "low";

// ── Warning Codes (§11.4) ──

export const WARNING_CODES = [
  "timed_deadline_needs_review",
  "low_confidence_entity",
  "multiple_dates_detected",
  "recurrence_with_deadline",
] as const;

export type WarningCode = (typeof WARNING_CODES)[number];

// ── Source Surfaces (Section 8.3) ──

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

// ── Date styles (how ambiguous numeric dates read) ──

export const DATE_STYLES = ["mdy", "dmy", "ymd"] as const;

export type DateStyle = (typeof DATE_STYLES)[number];

// ── Parsed Entity Types ──

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

// ── Parsed Entity (Section 8.3) ──

export interface ParsedEntity {
  /** Unique ID for this entity, for dismissal tracking */
  id: string;
  type: ParsedEntityType;
  /** The original text fragment that was matched */
  sourceText: string;
  /** Start offset in the raw input */
  start: number;
  /** End offset in the raw input */
  end: number;
  /** The words removed from the title if this entity is applied (a deadline word goes with its date). */
  consumed?: { start: number; end: number };
  confidence: ConfidenceTier;
  /** Type-specific normalized value */
  normalizedValue: unknown;
  /** Human-readable explanation of what was detected */
  explanation: string;
}

// ── Parse Result (Section 8.3) ──

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

// ── Canonical NLP Envelope (Section 8.4B) ──

export interface CanonicalNlpEnvelope {
  rawInput: string;
  sourceSurface: SourceSurface;
  dateStyle: DateStyle;
  dismissedEntityIds: string[];
  userOverrides: Record<string, unknown>;
  /** The sender already chose every field; the receiver stores the envelope and does not reinterpret it. */
  resolved?: boolean;
}

export interface CanonicalNlpSnapshot extends ParseResult {
  dateStyle: DateStyle;
  dismissedEntityIds: string[];
  userOverrides: Record<string, unknown>;
}

// ── Zone-free clock (the caller builds it from the user's zone) ──

/** `YYYY-MM-DD` */
export type LocalDate = string;
/** `HH:MM` */
export type WallTime = string;

/** The user's "now" as plain strings. nlp never reads the machine clock or zone. */
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
/** 0 = Sunday */
export function weekdayLocal(d: LocalDate): number {
  return new Date(toUtc(d)).getUTCDay();
}
export function endOfMonthLocal(d: LocalDate): LocalDate {
  const [y, m] = d.split("-").map(Number);
  return fromUtc(Date.UTC(y, m, 0));
}

// ── Priority mapping ──

export type TaskPriority = 0 | 1 | 2 | 3 | 4;

// ── Recurrence intent ──

export interface RecurrenceValue {
  rrule: string;
  humanLabel: string;
}

// ── Date value ──

export interface DateValue {
  date: LocalDate;
  /** Wall time on `date` when one was typed; callers combine with the zone (atLocal). */
  time: WallTime | null;
  /** Whether a specific time was mentioned */
  hasTime: boolean;
  /** End of an explicit range ("2pm to 3pm"), on `endDate`; absent when no end was typed. */
  endDate?: LocalDate;
  endTime?: WallTime;
  /** Human-readable label */
  humanLabel: string;
}

// ── Duration value ──

export interface DurationValue {
  minutes: number;
  humanLabel: string;
}

// ── Entity resolution context ──

export interface ResolutionContext {
  projects: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
}

// ── Parse options ──

export interface ParseOptions {
  input: string;
  sourceSurface: SourceSurface;
  /** The user's today / now / week start, from their zone. */
  clock: NlpClock;
  context?: ResolutionContext;
  dismissedEntityIds?: string[];
  /** User's preferred date style for ambiguous dates */
  dateStyle?: DateStyle;
}
