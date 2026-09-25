/** Parser version — bumped on any behavior-changing parser update */
export const PARSER_VERSION = "3.1.0";

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
  | "duration";

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
}

export interface CanonicalNlpSnapshot extends ParseResult {
  dateStyle: DateStyle;
  dismissedEntityIds: string[];
  userOverrides: Record<string, unknown>;
}

/** A date's local calendar day as `YYYY-MM-DD`. */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** Optional ISO datetime if a time was also specified */
  datetime: string | null;
  /** Whether a specific time was mentioned */
  hasTime: boolean;
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
  referenceDate?: Date;
  context?: ResolutionContext;
  dismissedEntityIds?: string[];
  /** User's preferred date style for ambiguous dates */
  dateStyle?: DateStyle;
}
