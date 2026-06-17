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
import { useState, useEffect, useRef, useCallback } from "react";
import type { ParseResult, ParsedEntity } from "@cadence/nlp/core";
import type { SourceSurface } from "@cadence/nlp/core";
import type { TaskPriority } from "@cadence/contracts/task";
import type { QuickAddParsedToken, QuickAddParseResult } from "../lib/utils/quick-add-parser";
import { trackUsageEvent } from "../lib/api/track-event";

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

interface UseNlpParseOptions {
    input: string;
    projects: Array<{ id: string; name: string }>;
    tags: Array<{ id: string; name: string }>;
    ignoredTokenIds?: string[];
    dismissedEntityIds?: string[];
    sourceSurface?: SourceSurface;
    dateStyle?: "mdy" | "dmy" | "ymd";
    confidenceThreshold?: "high" | "medium" | "low";
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
    /** Timed start detected from NLP when a date entity carries a datetime */
    scheduledStart: string | null;
}

/**
 * Maps NLP ParsedEntity types to the existing QuickAddParsedToken kinds.
 */
function entityToToken(entity: ParsedEntity): QuickAddParsedToken | null {
    switch (entity.type) {
        case "scheduled_start":
        case "due_date":
            return {
                id: entity.id,
                kind: "date",
                label: (entity.normalizedValue as { humanLabel?: string })?.humanLabel ?? entity.sourceText,
                raw: entity.sourceText,
            };
        case "recurrence":
            return {
                id: entity.id,
                kind: "recurrence",
                label: entity.explanation ?? entity.sourceText,
                raw: entity.sourceText,
            };
        case "priority":
            return {
                id: entity.id,
                kind: "priority",
                label: entity.sourceText.toUpperCase(),
                raw: entity.sourceText,
            };
        case "project":
            return {
                id: entity.id,
                kind: "project",
                label: `/${entity.sourceText}`,
                raw: entity.sourceText,
            };
        case "tag":
            return {
                id: entity.id,
                kind: "tag",
                label: `#${entity.sourceText}`,
                raw: entity.sourceText,
            };
        default:
            return null;
    }
}

const EMPTY_OUTPUT: NlpParseOutput = {
    cleanedTitle: "",
    dueDate: null,
    recurrenceRule: null,
    priority: null,
    projectId: null,
    tagIds: [],
    tokens: [],
    parseResult: {
        rawInput: "",
        cleanedTitle: "",
        parserVersion: "2.0.0",
        sourceSurface: "inline_add",
        entities: [],
        warnings: [],
        summary: "",
        overallConfidence: null,
    },
    summary: "",
    waitingOn: null,
    durationMinutes: null,
    dueHumanLabel: null,
    scheduledStart: null,
};

/** Section 16.2: debounce parse to token boundaries, not every keystroke */
const PARSE_DEBOUNCE_MS = 180;
/** Low-stimulation mode: longer debounce to reduce visual churn */
const PARSE_DEBOUNCE_LOW_STIM_MS = 400;
const CONFIDENCE_ORDER: Record<"low" | "medium" | "high", number> = {
    low: 0,
    medium: 1,
    high: 2,
};

function confidenceMeetsThreshold(confidence: "high" | "medium" | "low", threshold: "high" | "medium" | "low"): boolean {
    return CONFIDENCE_ORDER[confidence] >= CONFIDENCE_ORDER[threshold];
}

export function useNlpParse({
    input,
    projects,
    tags,
    ignoredTokenIds = [],
    dismissedEntityIds = [],
    sourceSurface = "inline_add",
    dateStyle = "mdy",
    confidenceThreshold = "medium",
    lowStimulationMode = false,
    enabled = true,
}: UseNlpParseOptions): NlpParseOutput {
    // §11.5: Low-stimulation mode enforces stricter confidence threshold
    // Only high-confidence entities auto-apply; medium/low are suppressed
    const effectiveThreshold = lowStimulationMode && confidenceThreshold !== "high"
        ? "high" as const
        : confidenceThreshold;
    const [output, setOutput] = useState<NlpParseOutput>({ ...EMPTY_OUTPUT, cleanedTitle: input.trim() });
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latestInputRef = useRef(input);
    const latestDismissedEntityIdsRef = useRef(dismissedEntityIds);
    const latestProjectsRef = useRef(projects);
    const latestTagsRef = useRef(tags);
    const latestIgnoredTokenIdsRef = useRef(ignoredTokenIds);
    latestInputRef.current = input;
    latestDismissedEntityIdsRef.current = dismissedEntityIds;
    latestProjectsRef.current = projects;
    latestTagsRef.current = tags;
    latestIgnoredTokenIdsRef.current = ignoredTokenIds;

    const runParse = useCallback(() => {
        const currentInput = latestInputRef.current;
        if (!enabled || !currentInput.trim()) {
            setOutput({
                ...EMPTY_OUTPUT,
                cleanedTitle: currentInput.trim(),
                parseResult: {
                    ...EMPTY_OUTPUT.parseResult,
                    rawInput: currentInput,
                    cleanedTitle: currentInput.trim(),
                    sourceSurface,
                },
            });
            return;
        }

        const mod = parseModuleCache;
        if (!mod) return; // Module not loaded yet

        const resolutionContext = {
            projects: latestProjectsRef.current.map((p) => ({ id: p.id, name: p.name })),
            tags: latestTagsRef.current.map((t) => ({ id: t.id, name: t.name })),
        };

        const result = mod.parse({
            input: currentInput,
            sourceSurface,
            dateStyle,
            context: resolutionContext,
            dismissedEntityIds: [...latestIgnoredTokenIdsRef.current, ...latestDismissedEntityIdsRef.current],
        });

        const ignored = new Set([...latestIgnoredTokenIdsRef.current, ...latestDismissedEntityIdsRef.current]);
        let dueDate: string | null = null;
        let dueHumanLabel: string | null = null;
        let scheduledStart: string | null = null;
        let recurrenceRule: string | null = null;
        let priority: TaskPriority | null = null;
        let projectId: string | null = null;
        const tagIds: string[] = [];
        let waitingOn: string | null = null;
        let durationMinutes: number | null = null;
        const tokens: QuickAddParsedToken[] = [];

        for (const entity of result.entities) {
            const token = entityToToken(entity);
            if (token && ignored.has(token.id)) continue;

            switch (entity.type) {
                case "scheduled_start":
                case "due_date": {
                    const val = entity.normalizedValue as {
                        date?: string;
                        datetime?: string | null;
                        humanLabel?: string;
                    };
                    if (confidenceMeetsThreshold(entity.confidence, effectiveThreshold)) {
                        if (!dueDate && val?.date) {
                            dueDate = val.date;
                        }
                        if (!scheduledStart && val?.datetime) {
                            scheduledStart = val.datetime;
                        }
                        if (!dueHumanLabel && val?.humanLabel) {
                            dueHumanLabel = val.humanLabel;
                        }
                    }
                    break;
                }
                case "recurrence": {
                    const val = entity.normalizedValue as { rrule?: string };
                    if (!recurrenceRule && val?.rrule && confidenceMeetsThreshold(entity.confidence, effectiveThreshold)) recurrenceRule = val.rrule;
                    break;
                }
                case "priority": {
                    const val = entity.normalizedValue as { priority?: number };
                    if (!priority && val?.priority && confidenceMeetsThreshold(entity.confidence, effectiveThreshold)) priority = val.priority as TaskPriority;
                    break;
                }
                case "project": {
                    const val = entity.normalizedValue as { id?: string; resolvedId?: string };
                    if (!projectId && confidenceMeetsThreshold(entity.confidence, effectiveThreshold)) projectId = val.id ?? val.resolvedId ?? null;
                    break;
                }
                case "tag": {
                    const val = entity.normalizedValue as { id?: string; resolvedId?: string };
                    const tagId = val.id ?? val.resolvedId;
                    if (tagId && confidenceMeetsThreshold(entity.confidence, effectiveThreshold) && !tagIds.includes(tagId)) tagIds.push(tagId);
                    break;
                }
                case "waiting_on": {
                    const val = entity.normalizedValue as { person?: string };
                    if (!waitingOn && val?.person && confidenceMeetsThreshold(entity.confidence, effectiveThreshold)) waitingOn = val.person;
                    break;
                }
                case "duration": {
                    const val = entity.normalizedValue as { minutes?: number };
                    if (!durationMinutes && val?.minutes && confidenceMeetsThreshold(entity.confidence, effectiveThreshold)) durationMinutes = val.minutes;
                    break;
                }
            }
            if (token) tokens.push(token);
        }

        setOutput({
            cleanedTitle: result.cleanedTitle,
            dueDate,
            recurrenceRule,
            priority,
            projectId,
            tagIds,
            tokens,
            parseResult: result,
            // §11.5: Low-stimulation mode suppresses verbose summary text
            summary: lowStimulationMode ? "" : (result.summary ?? ""),
            waitingOn,
            durationMinutes,
            dueHumanLabel,
            scheduledStart,
        });

        // §11.8 NLP telemetry
        trackUsageEvent("nlp.parse_completed", {
            surface: sourceSurface,
            confidence_tier: result.overallConfidence ?? undefined,
        });
        if (result.overallConfidence === "low") {
            trackUsageEvent("nlp.low_confidence_seen", { surface: sourceSurface });
        }
    }, [sourceSurface, dateStyle, enabled, effectiveThreshold, lowStimulationMode]);

    // Load module on mount (when enabled) and trigger initial parse
    useEffect(() => {
        if (!enabled) return;
        ensureParseModule().then(() => {
            runParse();
        });
    }, [enabled, runParse]);

    // Debounced parse on input change (Section 16.2)
    // §11.5: Low-stimulation mode uses longer debounce to reduce visual churn
    const debounceMs = lowStimulationMode ? PARSE_DEBOUNCE_LOW_STIM_MS : PARSE_DEBOUNCE_MS;
    useEffect(() => {
        if (!enabled) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            if (parseModuleCache) runParse();
        }, debounceMs);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [input, enabled, runParse]);

    return output;
}
