import type {
  ParseResult,
  ParseOptions,
  ParsedEntity,
  CanonicalNlpEnvelope,
  CanonicalNlpSnapshot,
  ConfidenceTier,
  WarningCode,
} from "../core/index.js";
import { PARSER_VERSION } from "../core/index.js";
import { parseDates } from "./date-parser.js";
import { parseRecurrence } from "./recurrence-parser.js";
import { parsePriority } from "./priority-parser.js";
import { parseDuration, parseWaitingOn } from "./entity-parser.js";
import { resolveProjectsAndTags } from "../resolve/index.js";

/**
 * Main parse entry point — shared across frontend preview and backend canonicalization.
 *
 * Parse order:
 * 0. Extract quoted "literal" segments — protected from NLP parsing
 * 1. Recurrence (before dates, since "every Monday" might confuse date parser)
 * 2. Duration estimates (before dates — chrono-node would otherwise consume duration phrases)
 * 3. Dates/times via chrono-node
 * 4. Priority keywords
 * 5. Waiting-on patterns
 * 6. Project/tag resolution (fuzzy via Fuse.js)
 * 7. Explicit shorthand (#tag, /project)
 */
export function parse(options: ParseOptions): ParseResult {
  const {
    input,
    sourceSurface,
    referenceDate = new Date(),
    context,
    dismissedEntityIds = [],
    dateStyle = "mdy",
  } = options;

  const dismissed = new Set(dismissedEntityIds);
  const allEntities: ParsedEntity[] = [];
  const consumedRanges: Array<{ start: number; end: number }> = [];
  const warnings: WarningCode[] = [];

  // 0. Extract quoted "literal" segments — protect from NLP parsing
  // e.g. "Heaven's Night" → replaced with placeholder, restored in cleaned title
  const quotedSegments: Array<{ start: number; end: number; text: string }> = [];
  const QUOTE_RE = /"([^"]+)"/g;
  let qMatch: RegExpExecArray | null;
  while ((qMatch = QUOTE_RE.exec(input)) !== null) {
    quotedSegments.push({
      start: qMatch.index,
      end: qMatch.index + qMatch[0].length,
      text: qMatch[1], // inner text without quotes
    });
  }

  // Mark quoted regions as consumed so no parser touches them
  for (const seg of quotedSegments) {
    consumedRanges.push({ start: seg.start, end: seg.end });
  }

  /** Keep a parser's undismissed entities (optionally skipping ones over consumed text) and consume its ranges. */
  const take = (
    result: { entities: ParsedEntity[]; consumedRanges: Array<{ start: number; end: number }> },
    skipOverlaps: boolean,
    onTake?: (entity: ParsedEntity) => void,
  ) => {
    for (const entity of result.entities) {
      if (skipOverlaps && consumedRanges.some((r) => entity.start < r.end && entity.end > r.start)) continue;
      if (dismissed.has(entity.id)) continue;
      onTake?.(entity);
      allEntities.push(entity);
      consumedRanges.push(...result.consumedRanges);
    }
  };

  // 1. Recurrence
  const recurrenceResult = parseRecurrence(input);
  take(recurrenceResult, false);

  // 2. Duration (before dates — chrono-node would otherwise consume duration phrases)
  take(parseDuration(input), true);

  // 3. Dates — skip any that overlap recurrence or duration matches
  const dateResult = parseDates(input, { referenceDate, dateStyle });
  take(dateResult, true, (entity) => {
    if (entity.type === "due_date" && (entity.normalizedValue as { hasTime?: boolean })?.hasTime) {
      warnings.push("timed_deadline_needs_review");
    }
    if (entity.confidence === "low") {
      warnings.push("low_confidence_entity");
    }
  });

  // Emit warning if multiple dates detected
  if (dateResult.entities.length > 1) {
    warnings.push("multiple_dates_detected");
  }

  // Emit warning if recurrence combined with deadline
  if (recurrenceResult.entities.length > 0 && dateResult.entities.some(e => e.type === "due_date")) {
    warnings.push("recurrence_with_deadline");
  }

  // 4. Priority
  take(parsePriority(input), false);

  // 5. Waiting on
  take(parseWaitingOn(input), false);

  // 6. Explicit #tag and /project shorthand
  const shorthandEntities = parseShorthand(input, context, dismissed);
  for (const entity of shorthandEntities) {
    allEntities.push(entity);
    consumedRanges.push({ start: entity.start, end: entity.end });
  }

  // 7. Fuzzy project/tag resolution (only if context is provided)
  if (context) {
    const fuzzyEntities = resolveProjectsAndTags(
      input,
      context,
      consumedRanges,
      dismissed,
    );
    allEntities.push(...fuzzyEntities);
  }

  // Build cleaned title by removing consumed entity text
  // For quoted segments, keep inner text (strip quotes only)
  const cleanedTitle = buildCleanedTitle(input, consumedRanges, quotedSegments);

  // Build summary
  const summary = buildSummary(allEntities);

  const overallConfidence = deriveOverallConfidence(allEntities, warnings);

  return {
    rawInput: input,
    cleanedTitle,
    parserVersion: PARSER_VERSION,
    sourceSurface,
    entities: allEntities,
    warnings,
    summary,
    overallConfidence,
  };
}

function deriveOverallConfidence(
  entities: ParsedEntity[],
  warnings: WarningCode[] = [],
): ConfidenceTier | null {
  if (warnings.includes("timed_deadline_needs_review")) {
    return "low";
  }

  if (entities.length === 0) {
    return null;
  }

  if (entities.some((entity) => entity.confidence === "low")) {
    return "low";
  }

  if (entities.some((entity) => entity.confidence === "medium")) {
    return "medium";
  }

  return "high";
}

/**
 * Parse explicit #tag and /project shorthand.
 */
function parseShorthand(
  input: string,
  context: ParseOptions["context"],
  dismissed: Set<string>,
): ParsedEntity[] {
  const entities: ParsedEntity[] = [];

  if (!context) return entities;

  // #tag
  for (const match of input.matchAll(/(^|\s)#([\p{L}\p{N}_-]+)/giu)) {
    const rawName = match[2];
    const tag = context.tags.find(
      (t) => t.name.toLowerCase() === rawName.toLowerCase(),
    );
    if (!tag) continue;
    const id = `tag:${tag.id}`;
    if (dismissed.has(id)) continue;

    const fullMatch = match[0];
    const start = (match.index ?? 0) + (fullMatch.length - match[0].trimStart().length);
    const end = (match.index ?? 0) + fullMatch.length;

    entities.push({
      id,
      type: "tag",
      sourceText: fullMatch.trim(),
      start,
      end,
      confidence: "high",
      normalizedValue: { id: tag.id, resolvedId: tag.id, name: tag.name },
      explanation: `Tag: #${tag.name}`,
    });
  }

  // /project
  for (const match of input.matchAll(/(^|\s)\/([\p{L}\p{N}_-]+)/giu)) {
    const rawName = match[2];
    const project = context.projects.find(
      (p) =>
        p.name.toLowerCase().replace(/\s+/g, "-") === rawName.toLowerCase(),
    );
    if (!project) continue;
    const id = `project:${project.id}`;
    if (dismissed.has(id)) continue;

    const fullMatch = match[0];
    const start = (match.index ?? 0) + (fullMatch.length - match[0].trimStart().length);
    const end = (match.index ?? 0) + fullMatch.length;

    entities.push({
      id,
      type: "project",
      sourceText: fullMatch.trim(),
      start,
      end,
      confidence: "high",
      normalizedValue: { id: project.id, resolvedId: project.id, name: project.name },
      explanation: `List: ${project.name}`,
    });
    break; // Only one project
  }

  return entities;
}

/**
 * Build a clean title by removing consumed entity text ranges.
 * Quoted segments are special: the surrounding quotes are removed but
 * the inner text is preserved in the title (it was protected from NLP).
 */
function buildCleanedTitle(
  input: string,
  ranges: Array<{ start: number; end: number }>,
  quotedSegments: Array<{ start: number; end: number; text: string }> = [],
): string {
  if (ranges.length === 0 && quotedSegments.length === 0) return input.trim();

  const quotedSet = new Set(quotedSegments.map((s) => `${s.start}:${s.end}`));

  // Sort ranges by start position descending to splice from end
  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  let result = input;
  for (const { start, end } of sorted) {
    const key = `${start}:${end}`;
    if (quotedSet.has(key)) {
      // Quoted segment — strip quotes but keep inner text
      const seg = quotedSegments.find((s) => s.start === start && s.end === end);
      result = result.slice(0, start) + (seg?.text ?? "") + result.slice(end);
    } else {
      result = result.slice(0, start) + " " + result.slice(end);
    }
  }
  return result.replace(/\s+/g, " ").trim();
}

/**
 * Build a one-line summary of what was recognized.
 */
function buildSummary(entities: ParsedEntity[]): string | null {
  const highConfidence = entities.filter((e) => e.confidence === "high");
  if (highConfidence.length === 0) return null;

  const parts: string[] = [];
  for (const entity of highConfidence) {
    switch (entity.type) {
      case "due_date":
      case "scheduled_start":
      case "recurrence":
      case "duration":
        parts.push((entity.normalizedValue as { humanLabel: string }).humanLabel);
        break;
      case "priority":
        parts.push(`P${5 - (entity.normalizedValue as number)}`);
        break;
      case "project":
        parts.push((entity.normalizedValue as { name: string }).name);
        break;
      case "tag":
        parts.push(`#${(entity.normalizedValue as { name: string }).name}`);
        break;
      case "waiting_on":
        parts.push(`Waiting on ${(entity.normalizedValue as { person: string }).person}`);
        break;
    }
  }

  return parts.length > 0 ? `Cadence understood: ${parts.join(" · ")}` : null;
}

export function parseCanonicalNlpEnvelope(
  envelope: CanonicalNlpEnvelope,
  options: Omit<ParseOptions, "input" | "sourceSurface" | "dateStyle" | "dismissedEntityIds"> = {},
): CanonicalNlpSnapshot {
  const parsed = parse({
    input: envelope.rawInput,
    sourceSurface: envelope.sourceSurface,
    dateStyle: envelope.dateStyle,
    dismissedEntityIds: envelope.dismissedEntityIds,
    referenceDate: options.referenceDate,
    context: options.context,
  });

  return {
    ...parsed,
    dateStyle: envelope.dateStyle,
    dismissedEntityIds: envelope.dismissedEntityIds,
    userOverrides: envelope.userOverrides,
  };
}
