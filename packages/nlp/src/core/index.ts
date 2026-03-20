/** Parser version — bumped on any behavior-changing parser update */
export const PARSER_VERSION = "2.0.0";

// ── Confidence Model (Section 9) ──

export type ConfidenceTier = "high" | "medium" | "low";

// ── Source Surfaces (Section 8.3) ──

export const SOURCE_SURFACES = [
  "inline-add",
  "inline_add",
  "quick-add-task",
  "quick_add",
  "holding-capture",
  "holding-clarify",
  "clarify_sheet",
  "task-edit-title",
  "task-edit-note",
  "focus-view-composer",
  "inbox_card",
  "inbox",
] as const;

export type SourceSurface = (typeof SOURCE_SURFACES)[number];

// ── Parsed Entity Types ──

export type ParsedEntityType =
  | "due_date"
  | "scheduled_start"
  | "scheduled_end"
  | "time_range"
  | "recurrence"
  | "priority"
  | "project"
  | "tag"
  | "section"
  | "waiting_on"
  | "duration"
  | "intent";

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
  warnings: string[];
  summary: string | null;
  overallConfidence: ConfidenceTier | null;
}

// ── Dismissal Model (Section 8.4) ──

export interface DismissalRecord {
  rawInput: string;
  sourceSurface: SourceSurface;
  parserVersion: string;
  dismissedEntityIds: string[];
  userOverrides: Record<string, unknown>;
}

// ── Canonical NLP Envelope (Section 8.4B) ──

export interface CanonicalNlpEnvelope {
  rawInput: string;
  sourceSurface: SourceSurface;
  dateStyle: "mdy" | "dmy" | "ymd";
  dismissedEntityIds: string[];
  userOverrides: Record<string, unknown>;
}

export interface CanonicalNlpSnapshot extends ParseResult {
  dateStyle: "mdy" | "dmy" | "ymd";
  dismissedEntityIds: string[];
  userOverrides: Record<string, unknown>;
}

// ── Priority mapping ──

export type TaskPriority = 0 | 1 | 2 | 3 | 4;

export const PRIORITY_LABELS: Record<number, string> = {
  0: "None",
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

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
  sections?: Array<{ id: string; name: string }>;
}

// ── Parse options ──

export interface ParseOptions {
  input: string;
  sourceSurface: SourceSurface;
  referenceDate?: Date;
  context?: ResolutionContext;
  dismissedEntityIds?: string[];
  /** User's preferred date style for ambiguous dates */
  dateStyle?: "mdy" | "dmy" | "ymd";
}
