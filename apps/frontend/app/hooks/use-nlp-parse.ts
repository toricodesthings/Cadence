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

let parseModuleCache: { parse: (typeof import("@cadence/nlp/parse"))["parse"] } | null = null;
let parseModulePromise: Promise<void> | null = null;

function ensureParseModule(): Promise<void> {
    if (parseModuleCache) return Promise.resolve();
    if (parseModulePromise) return parseModulePromise;
    parseModulePromise = import("@cadence/nlp/parse").then((mod) => {
        parseModuleCache = { parse: mod.parse };
    });
    return parseModulePromise;
}

export type ParseFn = (typeof import("@cadence/nlp/parse"))["parse"];

export async function loadParse(): Promise<ParseFn> {
    await ensureParseModule();
    return parseModuleCache!.parse;
}

export function useParseModule(needed: boolean): ParseFn | null {
    const [parse, setParse] = useState<ParseFn | null>(() => parseModuleCache?.parse ?? null);
    const trackRender = useContext(StartupRenderContext);
    useEffect(() => {
        if (!needed || parse) return;
        let active = true;
        let pending = true;
        const settle = () => {
            if (pending) {
                pending = false;
                trackRender(-1);
            }
        };
        trackRender(1);
        void ensureParseModule()
            .then(() => {
                if (active) setParse(() => parseModuleCache!.parse);
            })
            .catch(() => undefined)
            .finally(settle);
        return () => {
            active = false;
            settle();
        };
    }, [needed, parse, trackRender]);
    return parse;
}

const ALL_FIELDS: ReadonlySet<DraftField> = new Set<DraftField>([
    "dueDate",
    "scheduledStart",
    "scheduledEnd",
    "recurrenceRule",
    "priority",
    "projectId",
    "tagIds",
    "waitingOn",
    "durationMinutes",
]);

export const TASK_FIELDS: ReadonlySet<DraftField> = new Set<DraftField>([...ALL_FIELDS, "notBefore", "reminderAt"]);

interface UseNlpParseOptions {
    input: string;
    projects: Array<{ id: string; name: string }>;
    tags: Array<{ id: string; name: string }>;
    ignoredTokenIds?: string[];
    dismissedEntityIds?: string[];
    acceptedEntityIds?: string[];
    manual?: DraftDecisions["manual"];
    literal?: boolean;
    capabilities?: ReadonlySet<DraftField>;
    monthDayOnly?: boolean;
    sourceSurface?: SourceSurface;
    dateStyle?: "mdy" | "dmy" | "ymd";
    lowStimulationMode?: boolean;
    enabled?: boolean;
}

export interface NlpParseOutput extends QuickAddParseResult {
    parseResult: ParseResult;
    summary: string;
    waitingOn: string | null;
    durationMinutes: number | null;
    dueHumanLabel: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    suggestions: ParsedEntity[];
    unfit: ParsedEntity[];
    applied: ParsedEntity[];
    ready: boolean;
    fields: DraftFields;
}

function entityToToken(entity: ParsedEntity): QuickAddParsedToken | null {
    const kind = {
        scheduled_start: "date",
        due_date: "date",
        recurrence: "recurrence",
        priority: "priority",
        project: "project",
        tag: "tag",
    }[entity.type as string] as QuickAddParsedToken["kind"] | undefined;
    if (!kind) return null;
    const label =
        kind === "date"
            ? ((entity.normalizedValue as { humanLabel?: string })?.humanLabel ?? entity.sourceText)
            : kind === "recurrence"
              ? (entity.explanation ?? entity.sourceText)
              : kind === "priority"
                ? entity.sourceText.toUpperCase()
                : kind === "project"
                  ? `/${entity.sourceText}`
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

export function computeNlp(
    parse: ParseFn | null,
    options: UseNlpParseOptions,
    zone: Zone = getUserZone(),
): NlpParseOutput {
    const {
        input,
        projects,
        tags,
        sourceSurface = "inline_add",
        dateStyle = "mdy",
        ignoredTokenIds = [],
        dismissedEntityIds = [],
        acceptedEntityIds = [],
        manual,
        literal,
        capabilities = ALL_FIELDS,
        monthDayOnly,
        enabled = true,
    } = options;
    const dismissed = [...ignoredTokenIds, ...dismissedEntityIds];
    const parsed =
        enabled && parse && input.trim()
            ? parse({
                  input,
                  sourceSurface,
                  clock: nlpClock(),
                  dateStyle,
                  context: {
                      projects: projects.map((p) => ({ id: p.id, name: p.name })),
                      tags: tags.map((t) => ({ id: t.id, name: t.name })),
                  },
                  dismissedEntityIds: dismissed,
              })
            : emptyResult(input, sourceSurface);
    const draft = resolveDraft(
        input,
        parsed.entities,
        { dismissed, accepted: acceptedEntityIds, manual, literal },
        { zone, capabilities, monthDayOnly },
    );
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

export function useNlpParse(options: UseNlpParseOptions): NlpParseOutput & { finalize: () => Promise<NlpParseOutput> } {
    const { enabled = true, input } = options;
    const parse = useParseModule(enabled && Boolean(input.trim()));
    const zone = getUserZone();
    const key = JSON.stringify([
        input,
        options.projects,
        options.tags,
        options.ignoredTokenIds,
        options.dismissedEntityIds,
        options.acceptedEntityIds,
        options.manual,
        options.literal,
        options.monthDayOnly,
        options.sourceSurface,
        options.dateStyle,
        enabled,
        zone,
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
