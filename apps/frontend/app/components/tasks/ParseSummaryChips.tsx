/**
 * ParseSummaryChips — inline "Cadence recognized" display for NLP parse results.
 *
 * Shows dismissible chips for each recognized entity, plus a summary line.
 * Follows the Twilight Sanctuary design language: soft lantern accents,
 * smooth transitions, gentle backgrounds.
 *
 * Section 15 a11y rules:
 * - Max 3 visible chips at once
 * - No color-only explanation (icon + text label always present)
 * - Low-stimulation mode: collapse to one summary row, hide medium-confidence
 */
import { useState } from "react";
import { X, Calendar, Repeat, Flag, FolderOpen, Hash, Clock, UserCheck, ChevronDown } from "lucide-react";
import type { ParsedEntity } from "@cadence/nlp/core";
import { motion, AnimatePresence } from "framer-motion";
import { trackUsageEvent } from "../../lib/api/track-event";

interface ParseSummaryChipsBaseProps {
    summary: string;
    /** If true, show compact single-line variant */
    compact?: boolean;
    /** Low-stimulation mode: one summary row, fewer chips */
    lowStimulation?: boolean;
    /** Maximum number of chips to show before collapsing into a review affordance */
    maxVisibleChips?: number;
    /** §11.5: Entity types to suppress for this surface (surface-level suppression) */
    suppressedEntityTypes?: string[];
}

interface ParseSummaryChipsEntitiesProps extends ParseSummaryChipsBaseProps {
    entities: ParsedEntity[];
    ignoredTokenIds: string[];
    onDismissToken: (tokenId: string) => void;
    parseResult?: never;
    onDismiss?: never;
}

interface ParseSummaryChipsParseResultProps extends ParseSummaryChipsBaseProps {
    parseResult: { entities: ParsedEntity[] } | null;
    onDismiss: (entityId: string) => void;
    entities?: never;
    ignoredTokenIds?: never;
    onDismissToken?: never;
}

type ParseSummaryChipsProps = ParseSummaryChipsEntitiesProps | ParseSummaryChipsParseResultProps;

const ENTITY_ICON_MAP: Record<string, React.ReactNode> = {
    scheduled_start: <Calendar size={11} aria-hidden="true" />,
    due_date: <Calendar size={11} aria-hidden="true" />,
    recurrence: <Repeat size={11} aria-hidden="true" />,
    priority: <Flag size={11} aria-hidden="true" />,
    project: <FolderOpen size={11} aria-hidden="true" />,
    tag: <Hash size={11} aria-hidden="true" />,
    duration: <Clock size={11} aria-hidden="true" />,
    waiting_on: <UserCheck size={11} aria-hidden="true" />,
};

/** Max visible chips per Section 15.1 */
const MAX_VISIBLE_CHIPS = 3;

function getTokenId(entity: ParsedEntity): string {
    return entity.id;
}

function getChipLabel(entity: ParsedEntity): string {
    if (entity.explanation) return entity.explanation;
    const val = entity.normalizedValue as Record<string, unknown> | undefined;
    switch (entity.type) {
        case "scheduled_start":
        case "due_date":
            return (val?.humanLabel as string) ?? entity.sourceText;
        case "recurrence":
            return entity.sourceText;
        case "priority":
            return entity.sourceText.toUpperCase();
        case "project":
            return `/${entity.sourceText}`;
        case "tag":
            return `#${entity.sourceText}`;
        case "duration":
            return `${val?.minutes ?? "?"}m`;
        case "waiting_on":
            return `Waiting on ${(val?.person as string) ?? entity.sourceText}`;
        default:
            return entity.sourceText;
    }
}

/** Confidence badge text so we don't rely on color only (Section 15.1) */
function getConfidenceLabel(confidence: "high" | "medium" | "low"): string | null {
    switch (confidence) {
        case "low":
            return "uncertain";
        case "medium":
            return null; // icon + color is sufficient at medium
        case "high":
            return null;
    }
}

function getConfidenceColor(confidence: "high" | "medium" | "low"): string {
    switch (confidence) {
        case "high":
            return "border-accent-primary/20 bg-accent-primary/10 text-accent-primary";
        case "medium":
            return "border-amber-500/15 bg-amber-500/8 text-amber-400";
        case "low":
            return "border-twilight-text-muted/15 bg-white/[0.04] text-twilight-text-muted";
    }
}

export function ParseSummaryChips(props: ParseSummaryChipsProps) {
    const {
        summary,
        compact = false,
        lowStimulation = false,
        maxVisibleChips = MAX_VISIBLE_CHIPS,
        suppressedEntityTypes = [],
    } = props;

    // Normalize both prop patterns to a common shape
    const allEntities = props.parseResult?.entities ?? props.entities ?? [];
    const ignoredSet = new Set(props.ignoredTokenIds ?? []);
    const suppressedSet = new Set(suppressedEntityTypes);
    const handleDismiss = props.onDismissToken ?? props.onDismiss ?? (() => {});

    const [expanded, setExpanded] = useState(false);

    let visibleEntities = allEntities.filter(
        (e) => !ignoredSet.has(getTokenId(e)) && !suppressedSet.has(e.type),
    );

    // Low-stimulation: hide medium-confidence unless expanded
    if (lowStimulation && !expanded) {
        visibleEntities = visibleEntities.filter((e) => e.confidence === "high");
    }

    if (visibleEntities.length === 0 && !summary) return null;

    // Low-stimulation mode: one collapsed summary row
    if (lowStimulation && !expanded) {
        const count = visibleEntities.length;
        if (count === 0 && summary) {
            return (
                <p className="text-[11px] text-twilight-text-muted/60 leading-tight" role="status" aria-live="polite">
                    {summary}
                </p>
            );
        }
        return (
            <button
                type="button"
                onClick={() => setExpanded(true)}
                className="inline-flex items-center gap-1.5 text-[11px] text-twilight-text-muted/70 hover:text-twilight-text-muted transition-colors cursor-pointer"
                role="status"
                aria-live="polite"
                aria-expanded={false}
            >
                <span>{count} recognition{count !== 1 ? "s" : ""}</span>
                <ChevronDown size={10} aria-hidden="true" />
            </button>
        );
    }

    // Apply max chip limit (Section 15.1)
    const cappedEntities = expanded ? visibleEntities : visibleEntities.slice(0, maxVisibleChips);
    const overflowCount = visibleEntities.length - cappedEntities.length;

    return (
        <div
            className={`flex flex-col ${compact ? "gap-1" : "gap-2"}`}
            role="status"
            aria-label="Parse summary"
            aria-live="polite"
        >
            {/* Summary line */}
            {summary && !compact && (
                <p className="text-[11px] text-twilight-text-muted/60 leading-tight">
                    {summary}
                </p>
            )}

            {/* Entity chips */}
            <div className="flex flex-wrap gap-1.5">
                <AnimatePresence mode="popLayout">
                    {cappedEntities.map((entity) => {
                        const tokenId = getTokenId(entity);
                        const confidenceLabel = getConfidenceLabel(entity.confidence);
                        return (
                            <motion.button
                                key={tokenId}
                                type="button"
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ duration: 0.15 }}
                                onClick={() => {
                                    trackUsageEvent("nlp.entity_dismissed", { surface: "parse_chips" });
                                    handleDismiss(tokenId);
                                }}
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors hover:opacity-80 cursor-pointer ${getConfidenceColor(entity.confidence)}`}
                                aria-label={`Dismiss: ${getChipLabel(entity)}${confidenceLabel ? ` (${confidenceLabel})` : ""}`}
                            >
                                {ENTITY_ICON_MAP[entity.type]}
                                <span>{getChipLabel(entity)}</span>
                                {confidenceLabel && (
                                    <span className="text-[9px] opacity-60">({confidenceLabel})</span>
                                )}
                                <X size={10} className="ml-0.5 opacity-60" aria-hidden="true" />
                            </motion.button>
                        );
                    })}
                </AnimatePresence>

                {/* Overflow indicator */}
                {overflowCount > 0 && (
                    <button
                        type="button"
                        onClick={() => setExpanded(true)}
                        className="inline-flex items-center gap-1 rounded-full border border-twilight-border/30 bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium text-twilight-text-muted/70 transition-colors hover:bg-white/[0.05] hover:text-twilight-text cursor-pointer"
                        aria-label={`Review ${overflowCount} more recognition${overflowCount === 1 ? "" : "s"}`}
                    >
                        <span>Review +{overflowCount}</span>
                    </button>
                )}
            </div>

            {/* Low-stimulation collapse toggle */}
            {(lowStimulation || overflowCount > 0) && expanded && (
                <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className="self-start text-[10px] text-twilight-text-muted/50 hover:text-twilight-text-muted transition-colors cursor-pointer"
                >
                    Show less
                </button>
            )}
        </div>
    );
}
