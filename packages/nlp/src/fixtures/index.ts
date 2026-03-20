/**
 * Golden test fixtures for NLP parser validation (Section 17).
 * Each fixture specifies input, expected entities, and expected cleaned title.
 */

export interface GoldenFixture {
  input: string;
  description: string;
  expectedEntities: Array<{
    type: string;
    confidence: "high" | "medium" | "low";
    /** Partial match on normalizedValue */
    valueContains?: Record<string, unknown>;
  }>;
  expectedCleanedTitle?: string;
  /** If true, this input should NOT produce any entities */
  shouldBeEmpty?: boolean;
}

// ── Date/time fixtures ──

export const DATE_FIXTURES: GoldenFixture[] = [
  {
    input: "Pay rent tomorrow",
    description: "Simple tomorrow",
    expectedEntities: [
      { type: "scheduled_start", confidence: "high", valueContains: { humanLabel: "Tomorrow" } },
    ],
    expectedCleanedTitle: "Pay rent",
  },
  {
    input: "Pay rent next Friday 9am",
    description: "Day + time",
    expectedEntities: [
      { type: "scheduled_start", confidence: "high", valueContains: { hasTime: true } },
    ],
  },
  {
    input: "Call doctor today at 3pm",
    description: "Today with time",
    expectedEntities: [
      { type: "scheduled_start", confidence: "high", valueContains: { hasTime: true } },
    ],
  },
  {
    input: "Submit report in 3 days",
    description: "Relative days",
    expectedEntities: [
      { type: "scheduled_start", confidence: "high" },
    ],
  },
  {
    input: "Meet Sarah next week",
    description: "Next week",
    expectedEntities: [
      { type: "scheduled_start", confidence: "high" },
    ],
  },
];

// ── Recurrence fixtures ──

export const RECURRENCE_FIXTURES: GoldenFixture[] = [
  {
    input: "Review sprint board every weekday 8:30",
    description: "Weekday recurrence with time",
    expectedEntities: [
      { type: "recurrence", confidence: "high", valueContains: { rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" } },
    ],
  },
  {
    input: "Water plants every Monday",
    description: "Weekly day recurrence",
    expectedEntities: [
      { type: "recurrence", confidence: "high", valueContains: { rrule: "FREQ=WEEKLY;BYDAY=MO" } },
    ],
    expectedCleanedTitle: "Water plants",
  },
  {
    input: "Take vitamins daily",
    description: "Daily recurrence",
    expectedEntities: [
      { type: "recurrence", confidence: "high", valueContains: { rrule: "FREQ=DAILY" } },
    ],
    expectedCleanedTitle: "Take vitamins",
  },
  {
    input: "Review goals every month",
    description: "Monthly recurrence",
    expectedEntities: [
      { type: "recurrence", confidence: "high" },
    ],
  },
  {
    input: "Team sync every other week",
    description: "Biweekly recurrence",
    expectedEntities: [
      { type: "recurrence", confidence: "high", valueContains: { rrule: "FREQ=WEEKLY;INTERVAL=2" } },
    ],
  },
];

// ── Priority fixtures ──

export const PRIORITY_FIXTURES: GoldenFixture[] = [
  {
    input: "Fix login bug p1",
    description: "p1 priority",
    expectedEntities: [
      { type: "priority", confidence: "high", valueContains: {} },
    ],
    expectedCleanedTitle: "Fix login bug",
  },
  {
    input: "Update docs p3",
    description: "p3 priority",
    expectedEntities: [
      { type: "priority", confidence: "high" },
    ],
  },
  {
    input: "Deploy hotfix urgent",
    description: "Urgent keyword",
    expectedEntities: [
      { type: "priority", confidence: "high" },
    ],
  },
];

// ── Combined fixtures (pass/fail bar from Section 3) ──

export const COMBINED_FIXTURES: GoldenFixture[] = [
  {
    input: "Pay rent next Friday 9am",
    description: "First-time user: date + time",
    expectedEntities: [
      { type: "scheduled_start", confidence: "high" },
    ],
  },
  {
    input: "Review sprint board every weekday 8:30 /work #planning p2",
    description: "Power user: recurrence + project + tag + priority",
    expectedEntities: [
      { type: "recurrence", confidence: "high" },
      { type: "priority", confidence: "high" },
    ],
  },
  {
    input: "Ask Maya if legal needs this before launch maybe next week",
    description: "ADHD brain dump — loose date, no forced structure",
    expectedEntities: [
      { type: "scheduled_start", confidence: "medium" },
    ],
  },
  {
    input: "waiting on John to review the PR",
    description: "Waiting on pattern",
    expectedEntities: [
      { type: "waiting_on", confidence: "high" },
    ],
  },
  {
    input: "Quick 15m task: reply to email",
    description: "Duration detection",
    expectedEntities: [
      { type: "duration", confidence: "high" },
    ],
  },
];

// ── False positive fixtures ──

export const FALSE_POSITIVE_FIXTURES: GoldenFixture[] = [
  {
    input: "monthly report",
    description: "Should NOT parse 'monthly' as recurrence",
    shouldBeEmpty: true,
    expectedEntities: [],
  },
  {
    input: "Friday's notes from meeting",
    description: "Should NOT parse possessive day as date",
    shouldBeEmpty: true,
    expectedEntities: [],
  },
];

export const ALL_FIXTURES = [
  ...DATE_FIXTURES,
  ...RECURRENCE_FIXTURES,
  ...PRIORITY_FIXTURES,
  ...COMBINED_FIXTURES,
  ...FALSE_POSITIVE_FIXTURES,
];
