/**
 * React hook that bridges @cadence/nlp with the existing QuickAddParsedToken system.
 *
 * Provides real-time NLP parsing for task input fields, returning tokens,
 * a cleaned title, and structured metadata — all while maintaining backward
 * compatibility with the existing QuickAddActionTray and DeadlinePickerPopover.
 *
 * Section 16.1: NLP code is lazy-loaded — never in the main shell bundle.
 * The parse module is dynamically imported and cached after first use.
 */
import { useState, useEffect, useMemo, useCallback, useContext } from "react";
import { StartupRenderContext } from "./core/use-workspace-startup";
import type { ParseResult, ParsedEntity } from "@cadence/nlp/core";
import type { SourceSurface } from "@cadence/nlp/core";
import type { TaskPriority } from "@cadence/contracts/task";
import { resolveDraft, type DraftDecisions, type DraftField, type DraftFields } from "@cadence/domain/nlp-draft";
import type { Zone } from "@cadence/domain/time";
import type { QuickAddParsedToken, QuickAddParseResult } from "../lib/utils/quick-add-parser";
import { nlpClock } from "../lib/utils/date-format";
import { getUserZone } from "../lib/utils/user-zone";

// Lazy module cache — loaded once, shared across all hook instances
let parseModuleCache: { parse: typeof import("@cadence/nlp/parse")["parse"] } | null = null;
let parseModulePromise: Promise<void> | null = null;

function ensureParseModule(): Promise<void> {
    if (parseModuleCache) return Promise.resolve();
    if (parseModulePromise) return parseModulePromise;
    parseModulePromise = import("@cadence/nlp/parse").then((mod) => {
        parseModuleCache = { parse: mod.parse };
    });
    return parseModulePromise;
}

type ParseFn = typeof import("@cadence/nlp/parse")["parse"];

/** The parser for event handlers (chrono-node never rides on the first screen). */
export async function loadParse(): Promise<ParseFn> {
    await ensureParseModule();
    return parseModuleCache!.parse;
}

/**
 * The parser for synchronous use in render: null until loaded. Loads only while `needed`,
 * and workspace startup waits for it.
 */
export function useParseModule(needed: boolean): ParseFn | null {
    const [parse, setParse] = useState<ParseFn | null>(() => parseModuleCache?.parse ?? null);
    const trackRender = useContext(StartupRenderContext);
    useEffect(() => {
        if (!needed || parse) return;
        let active = true;
        let pending = true;
        const settle = () => { if (pending) { pending = false; trackRender(-1); } };
        trackRender(1);
        void ensureParseModule().then(() => { if (active) setParse(() => parseModuleCache!.parse); }).catch(() => {}).finally(settle);
        return () => { active = false; settle(); };
    }, [needed, parse, trackRender]);
    return parse;
}

const ALL_FIELDS: ReadonlySet<DraftField> = new Set<DraftField>([
    "dueDate", "scheduledStart", "scheduledEnd", "recurrenceRule", "priority", "projectId", "tagIds", "waitingOn", "durationMinutes",
]);

/** What a full task can store from typed words (a surface that stores less passes its own set). */
export const TASK_FIELDS: ReadonlySet<DraftField> = new Set<DraftField>([...ALL_FIELDS, "notBefore", "reminderAt"]);

interface UseNlpParseOptions {
    input: string;
    projects: Array<{ id: string; name: string }>;
    tags: Array<{ id: string; name: string }>;
    ignoredTokenIds?: string[];
    dismissedEntityIds?: string[];
    /** Suggested entity ids the user chose to use. */
    acceptedEntityIds?: string[];
    /** Fields set by hand; a present key (even null) beats the words. */
    manual?: DraftDecisions["manual"];
    /** "Keep as written": no interpretation for this draft. */
    literal?: boolean;
    /** What the surface can store; the rest stays in the title. */
    capabilities?: ReadonlySet<DraftField>;
    /** The surface stores a month and day only (a yearly event). */
    monthDayOnly?: boolean;
    sourceSurface?: SourceSurface;
    dateStyle?: "mdy" | "dmy" | "ymd";
    confidenceThreshold?: "high" | "medium" | "low";
    /** Accepted for old callers; presentation never changes what is understood. */
    lowStimulationMode?: boolean;
    enabled?: boolean;
}

export interface NlpParseOutput extends QuickAddParseResult {
    /** Full NLP parse result for metadata storage */
    parseResult: ParseResult;
    /** Human-readable summary like "Cadence understood: ..." */
    summary: string;
    /** Waiting-on person extracted from input */
    waitingOn: string | null;
    /** Duration estimate in minutes */
    durationMinutes: number | null;
    /** §11.5: Human-readable label for the detected date (not raw ISO) */
    dueHumanLabel: string | null;
    /** Timed start (an Instant) when a date entity carries a time of day */
    scheduledStart: string | null;
    /** End of a typed range ("2pm to 3pm"), an Instant */
    scheduledEnd: string | null;
    /** Recognized but not applied: the user may choose these */
    suggestions: ParsedEntity[];
    /** Language this surface cannot store (kept in the title) */
    unfit: ParsedEntity[];
    /** Recognized and applied to the draft */
    applied: ParsedEntity[];
    /** False only while the parser module is still loading and the text needs it */
    ready: boolean;
    /** Every field of the draft as it will save */
    fields: DraftFields;
}

/** Maps an entity to a chip-style token (id, label, raw words). */
function entityToToken(entity: ParsedEntity): QuickAddParsedToken | null {
    const kind = {
        scheduled_start: "date", due_date: "date", recurrence: "recurrence", priority: "priority", project: "project", tag: "tag",
    }[entity.type as string] as QuickAddParsedToken["kind"] | undefined;
    if (!kind) return null;
    const label = kind === "date" ? (entity.normalizedValue as { humanLabel?: string })?.humanLabel ?? entity.sourceText
        : kind === "recurrence" ? entity.explanation ?? entity.sourceText
        : kind === "priority" ? entity.sourceText.toUpperCase()
        : kind === "project" ? `/${entity.sourceText}`
        : `#${entity.sourceText}`;
    return { id: entity.id, kind, label, raw: entity.sourceText };
}

const emptyResult = (input: string, sourceSurface: SourceSurface): ParseResult => ({
    rawInput: input,
    cleanedTitle: input.trim(),
    parserVersion: "",
    sourceSurface,
    entities: [],
    warnings: [],
    summary: null,
    overallConfidence: null,
});

/** The draft for `options` right now: parse, then the shared domain policy. No debounce, no stale state. */
export function computeNlp(parse: ParseFn | null, options: UseNlpParseOptions, zone: Zone = getUserZone()): NlpParseOutput {
    const {
        input, projects, tags, sourceSurface = "inline_add", dateStyle = "mdy", confidenceThreshold = "medium",
        ignoredTokenIds = [], dismissedEntityIds = [], acceptedEntityIds = [], manual, literal, capabilities = ALL_FIELDS, monthDayOnly, enabled = true,
    } = options;
    const dismissed = [...ignoredTokenIds, ...dismissedEntityIds];
    const parsed = enabled && parse && input.trim()
        ? parse({
            input, sourceSurface, clock: nlpClock(), dateStyle,
            context: { projects: projects.map((p) => ({ id: p.id, name: p.name })), tags: tags.map((t) => ({ id: t.id, name: t.name })) },
            dismissedEntityIds: dismissed,
        })
        : emptyResult(input, sourceSurface);
    const draft = resolveDraft(input, parsed.entities, { dismissed, accepted: acceptedEntityIds, manual, literal }, { zone, capabilities, threshold: confidenceThreshold, monthDayOnly });
    const f = draft.fields;
    const applied = parsed.entities.filter((e) => draft.applied.includes(e.id));
    const tokens = applied.map(entityToToken).filter((t): t is QuickAddParsedToken => t !== null);
    const dateEntity = applied.find((e) => e.type === "due_date" || e.type === "scheduled_start");

    return {
        cleanedTitle: draft.title,
        dueDate: f.dueDate,
        recurrenceRule: f.recurrenceRule,
        priority: f.priority > 0 ? (f.priority as TaskPriority) : null,
        projectId: f.projectId,
        tagIds: f.tagIds,
        tokens,
        parseResult: { ...parsed, cleanedTitle: draft.title },
        summary: parsed.summary ?? "",
        waitingOn: f.waitingOn,
        durationMinutes: f.durationMinutes,
        dueHumanLabel: (dateEntity?.normalizedValue as { humanLabel?: string } | undefined)?.humanLabel ?? null,
        scheduledStart: f.scheduledStart,
        scheduledEnd: f.scheduledEnd,
        suggestions: draft.suggestions,
        unfit: draft.unfit,
        applied,
        ready: !enabled || !input.trim() || parse !== null,
        fields: f,
    };
}

/**
 * The live draft of a parsed field. It is computed during render, so what is shown is what Enter saves;
 * `finalize` covers the one gap (the parser module still loading) by waiting for it and recomputing.
 */
export function useNlpParse(options: UseNlpParseOptions): NlpParseOutput & { finalize: () => Promise<NlpParseOutput> } {
    const { enabled = true, input } = options;
    const parse = useParseModule(enabled && Boolean(input.trim()));
    const zone = getUserZone();
    const key = JSON.stringify([
        input, options.projects, options.tags, options.ignoredTokenIds, options.dismissedEntityIds, options.acceptedEntityIds,
        options.manual, options.literal, options.monthDayOnly, options.sourceSurface, options.dateStyle, options.confidenceThreshold, enabled, zone,
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` covers every option by value
    const output = useMemo(() => computeNlp(parse, options, zone), [parse, key]);

    const finalize = useCallback(async () => {
        const loaded = enabled && input.trim() ? await loadParse().catch(() => null) : null;
        return computeNlp(loaded, options, getUserZone());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return { ...output, finalize };
}
