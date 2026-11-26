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
export { parsePriority };
import { parseDuration, parseRelativeReminder, parseWaitingOn } from "./entity-parser.js";
export { parseDuration };
import { resolveProjectsAndTags } from "../resolve/index.js";
import { buildCleanedTitle, quotedSegmentsOf } from "../title/index.js";

export function parse(options: ParseOptions): ParseResult {
    const { input, sourceSurface, clock, context, dismissedEntityIds = [], dateStyle = "mdy" } = options;

    const dismissed = new Set(dismissedEntityIds);
    const allEntities: ParsedEntity[] = [];
    const consumedRanges: Array<{ start: number; end: number }> = [];
    const warnings: WarningCode[] = [];

    const quotedSegments = quotedSegmentsOf(input);

    for (const seg of quotedSegments) {
        consumedRanges.push({ start: seg.start, end: seg.end });
    }

    const literalRanges = [
        ...quotedSegments,
        ...Array.from(
            input.matchAll(/\x60[^\x60]*\x60|https?:\/\/\S+|www\.\S+|\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi),
            (m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }),
        ),
    ];
    const text = blanked(input, literalRanges);

    const take = (
        result: { entities: ParsedEntity[]; consumedRanges: Array<{ start: number; end: number }> },
        skipOverlaps: boolean,
        onTake?: (entity: ParsedEntity) => void,
    ) => {
        result.entities.forEach((entity, i) => {
            if (skipOverlaps && consumedRanges.some((r) => entity.start < r.end && entity.end > r.start)) return;
            if (dismissed.has(entity.id)) return;
            onTake?.(entity);
            entity.consumed = result.consumedRanges[i] ?? { start: entity.start, end: entity.end };
            allEntities.push(entity);
            if (entity.confidence !== "low") consumedRanges.push(entity.consumed);
        });
    };

    const recurrenceResult = parseRecurrence(text);
    take(recurrenceResult, false);

    take(parseRelativeReminder(text), true);
    take(parseDuration(text), true);

    const dateText = blanked(text, [...consumedRanges, ...recurrenceResult.protectedRanges]);
    const dateResult = parseDates(dateText, { clock, dateStyle });

    const recurrenceEntity = allEntities.find((e) => e.type === "recurrence");
    if (recurrenceEntity) endSeriesAtUntil(recurrenceEntity, text, dateResult, consumedRanges);

    take(dateResult, true, (entity) => {
        if (entity.type === "due_date" && (entity.normalizedValue as { hasTime?: boolean })?.hasTime) {
            warnings.push("timed_deadline_needs_review");
        }
        if (entity.confidence === "low") {
            warnings.push("low_confidence_entity");
        }
    });

    if (recurrenceEntity) claimStartCues(allEntities, text, consumedRanges);

    if (dateResult.entities.length > 1) {
        warnings.push("multiple_dates_detected");
    }

    if (recurrenceResult.entities.length > 0 && dateResult.entities.some((e) => e.type === "due_date")) {
        warnings.push("recurrence_with_deadline");
    }

    take(parsePriority(text), false);

    take(parseWaitingOn(text), false);

    const shorthandEntities = parseShorthand(text, context, dismissed);
    for (const entity of shorthandEntities) {
        entity.consumed = { start: entity.start, end: entity.end };
        allEntities.push(entity);
        consumedRanges.push({ start: entity.start, end: entity.end });
    }

    if (context) {
        const fuzzyEntities = resolveProjectsAndTags(text, context, consumedRanges, dismissed);
        allEntities.push(...fuzzyEntities);
        for (const entity of fuzzyEntities) {
            entity.consumed = { start: entity.start, end: entity.end };
            if (entity.confidence !== "low") consumedRanges.push({ start: entity.start, end: entity.end });
        }
    }

    const cleanedTitle = buildCleanedTitle(input, consumedRanges, quotedSegments);

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

type Range = { start: number; end: number };

function blanked(text: string, ranges: Range[]): string {
    return ranges.reduce((acc, r) => acc.slice(0, r.start) + " ".repeat(r.end - r.start) + acc.slice(r.end), text);
}

function endSeriesAtUntil(
    recurrenceEntity: ParsedEntity,
    text: string,
    dateResult: ReturnType<typeof parseDates>,
    consumedRanges: Range[],
) {
    const untilCue = /^\s+(?:until|till|through)\s+/i.exec(text.slice(recurrenceEntity.end));
    if (!untilCue) return;
    const from = recurrenceEntity.end + untilCue[0].length;
    const at = dateResult.entities.findIndex(
        (e) => e.start === from && e.confidence !== "low" && !e.id.endsWith(":am") && !e.id.endsWith(":pm"),
    );
    if (at < 0) return;
    const [until] = dateResult.entities.splice(at, 1);
    dateResult.consumedRanges.splice(at, 1);
    const value = recurrenceEntity.normalizedValue as { rrule: string; humanLabel: string };
    const day = (until.normalizedValue as { date: string }).date;
    recurrenceEntity.normalizedValue = {
        rrule: `${value.rrule};UNTIL=${day.replaceAll("-", "")}`,
        humanLabel: `${value.humanLabel} until ${(until.normalizedValue as { humanLabel: string }).humanLabel}`,
    };
    recurrenceEntity.consumed = { start: recurrenceEntity.consumed?.start ?? recurrenceEntity.start, end: until.end };
    consumedRanges.push({ start: recurrenceEntity.end, end: until.end });
}

function claimStartCues(entities: ParsedEntity[], text: string, consumedRanges: Range[]) {
    for (const entity of entities) {
        if (entity.type !== "scheduled_start" || entity.confidence === "low" || !entity.consumed) continue;
        const cue = /\b(?:starting|starts?|beginning|from)\s+$/i.exec(text.slice(0, entity.consumed.start));
        if (cue) {
            entity.consumed = { start: entity.consumed.start - cue[0].length, end: entity.consumed.end };
            consumedRanges.push(entity.consumed);
        }
    }
}

function deriveOverallConfidence(entities: ParsedEntity[], warnings: WarningCode[] = []): ConfidenceTier | null {
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

function parseShorthand(input: string, context: ParseOptions["context"], dismissed: Set<string>): ParsedEntity[] {
    if (!context) return [];
    const tags = shorthand(
        input,
        /(^|\s)#([\p{L}\p{N}_-]+)/giu,
        (name) => context.tags.find((t) => t.name.toLowerCase() === name),
        "tag",
        (t) => `Tag: #${t.name}`,
        dismissed,
    );
    const projects = shorthand(
        input,
        /(^|\s)\/([\p{L}\p{N}_-]+)/giu,
        (name) => context.projects.find((p) => p.name.toLowerCase().replace(/\s+/g, "-") === name),
        "project",
        (p) => `List: ${p.name}`,
        dismissed,
    ).slice(0, 1);
    return [...tags, ...projects];
}

function shorthand<T extends { id: string; name: string }>(
    input: string,
    sigil: RegExp,
    find: (name: string) => T | undefined,
    type: "tag" | "project",
    explanation: (item: T) => string,
    dismissed: Set<string>,
): ParsedEntity[] {
    const entities: ParsedEntity[] = [];
    for (const match of input.matchAll(sigil)) {
        const item = find(match[2].toLowerCase());
        if (!item) continue;
        const id = `${type}:${item.id}`;
        if (dismissed.has(id)) continue;

        const fullMatch = match[0];
        const start = (match.index ?? 0) + (fullMatch.length - match[0].trimStart().length);
        const end = (match.index ?? 0) + fullMatch.length;

        entities.push({
            id,
            type,
            sourceText: fullMatch.trim(),
            start,
            end,
            confidence: "high",
            normalizedValue: { id: item.id, resolvedId: item.id, name: item.name },
            explanation: explanation(item),
        });
    }
    return entities;
}

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
    options: Omit<ParseOptions, "input" | "sourceSurface" | "dateStyle" | "dismissedEntityIds">,
): CanonicalNlpSnapshot {
    const parsed = parse({
        input: envelope.rawInput,
        sourceSurface: envelope.sourceSurface,
        dateStyle: envelope.dateStyle,
        dismissedEntityIds: envelope.dismissedEntityIds,
        clock: options.clock,
        context: options.context,
    });

    return {
        ...parsed,
        dateStyle: envelope.dateStyle,
        dismissedEntityIds: envelope.dismissedEntityIds,
        userOverrides: envelope.userOverrides,
    };
}
