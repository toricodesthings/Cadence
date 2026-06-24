import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Sun, Sunrise, CalendarDays, Trash2, ChevronRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useProcessInboxToTask, todayISO, tomorrowISO } from "../../hooks/inbox/use-process-inbox-to-task";
import { useUpdateInboxItem } from "../../hooks/inbox/use-update-inbox-item";
import { ScrollAreaWrapper } from "../shared/ScrollAreaWrapper";
import { ParseSummaryChips } from "../tasks/ParseSummaryChips";
import { QuickScheduleSurface } from "../tasks/QuickScheduleSurface";
import { useNlpParse } from "../../hooks/use-nlp-parse";
import { useSettings } from "../../hooks/core/use-settings";
import { useProjects } from "../../hooks/projects";
import { useTags } from "../../hooks/tags";
import { buildCanonicalNlpEnvelope } from "../../lib/nlp/build-canonical-envelope";
import type { InboxItem } from "@cadence/contracts/inbox";
import { trackUsageEvent } from "../../lib/api/track-event";

interface ClarifySheetProps {
    item: InboxItem;
    onClose: () => void;
    onOpenFullEditor?: (taskId: string) => void;
}

/**
 * ClarifySheet — the first-pass triage surface for inbox captures.
 *
 * Visual direction (from remediation plan):
 * - "Calm stacked pane, not a form"
 * - 2–4 broad, rounded layers: source → interpretation → actions → more details
 * - Each slice is glanceable, touch-friendly, and visually heavier than a dropdown
 *   but lighter than a boxed admin card
 * - The stack should feel like one crafted object with layered surfaces
 */
export function ClarifySheet({ item, onClose, onOpenFullEditor }: ClarifySheetProps) {
    const processToTask = useProcessInboxToTask();
    const updateItem = useUpdateInboxItem();
    const { data: userSettings } = useSettings();
    const { data: projects = [] } = useProjects();
    const { data: tags = [] } = useTags();
    const taskDefaults = userSettings?.tasks;
    const intelligenceEnabled = taskDefaults?.intelligence?.nlpEnabled !== false;
    const showExplanations = taskDefaults?.intelligence?.showExplanations !== false;
    const confidenceThreshold = taskDefaults?.intelligence?.confidenceThreshold ?? "medium";
    const lowStimulationMode = taskDefaults?.intelligence?.lowStimulationMode ?? false;
    const dateStyle = userSettings?.dateTime?.dateStyle ?? "mdy";
    const [dismissedEntityIds, setDismissedEntityIds] = useState<string[]>([]);
    const [timingMode, setTimingMode] = useState<"main" | "custom">("main");
    const [customSchedule, setCustomSchedule] = useState<{
        dueDate: string | null;
        scheduledStart: string | null;
        scheduledEnd: string | null;
        isAllDay: boolean;
        recurrenceRule: string | null;
    }>({
        dueDate: null,
        scheduledStart: null,
        scheduledEnd: null,
        isAllDay: true,
        recurrenceRule: null,
    });

    const nlp = useNlpParse({
        input: item.rawText,
        projects: projects.map((p) => ({ id: p.id, name: p.name })),
        tags: tags.map((t) => ({ id: t.id, name: t.name })),
        enabled: intelligenceEnabled,
        sourceSurface: "clarify_sheet",
        dateStyle,
        dismissedEntityIds,
        confidenceThreshold,
        lowStimulationMode,
    });

    const [editedTitle, setEditedTitle] = useState(item.rawText);
    const titleDirtyRef = useRef(false);
    const isPending = processToTask.isPending || updateItem.isPending;

    useEffect(() => {
        titleDirtyRef.current = false;
        setEditedTitle(nlp.cleanedTitle || item.rawText);
        setTimingMode("main");
        setCustomSchedule({
            dueDate: null,
            scheduledStart: null,
            scheduledEnd: null,
            isAllDay: true,
            recurrenceRule: nlp.recurrenceRule ?? null,
        });
        trackUsageEvent("capture.clarify_opened", { surface: "clarify_sheet", object_type: "capture" });
    }, [item.id]);

    useEffect(() => {
        if (titleDirtyRef.current) return;
        if (nlp.cleanedTitle) setEditedTitle(nlp.cleanedTitle);
    }, [nlp.cleanedTitle]);

    const buildNlpEnvelope = (scheduledDate?: string) =>
        buildCanonicalNlpEnvelope({
            rawInput: item.rawText,
            sourceSurface: "clarify_sheet",
            dateStyle,
            dismissedEntityIds,
            userOverrides: {
                title: editedTitle,
                scheduledDate: scheduledDate ?? null,
                projectId: nlp.projectId,
                tagIds: nlp.tagIds,
                priority: nlp.priority,
                durationEstimate: nlp.durationMinutes,
                recurrenceRule: nlp.recurrenceRule,
                waitingOn: nlp.waitingOn,
            },
        });

    const place = (
        schedule?: {
            scheduledDate?: string;
            dueDate?: string | null;
            scheduledStart?: string | null;
            scheduledEnd?: string | null;
            isAllDay?: boolean | null;
            recurrenceRule?: string | null;
        },
        options?: { openEditor?: boolean },
    ) => {
        const resolvedScheduledDate = schedule?.scheduledDate ?? (schedule?.dueDate === undefined && schedule?.scheduledStart === undefined ? (nlp.dueDate || undefined) : undefined);
        trackUsageEvent("capture.placed", { surface: "clarify_sheet", outcome: "placed" });
        processToTask.mutate(
            {
                inboxItemId: item.id,
                rawText: item.rawText,
                title: editedTitle,
                scheduledDate: resolvedScheduledDate,
                dueDate: schedule?.dueDate,
                scheduledStart: schedule?.scheduledStart,
                scheduledEnd: schedule?.scheduledEnd,
                isAllDay: schedule?.isAllDay,
                projectId: nlp.projectId,
                tagIds: nlp.tagIds,
                priority: nlp.priority,
                durationEstimate: nlp.durationMinutes,
                recurrenceRule: schedule?.recurrenceRule ?? nlp.recurrenceRule,
                waitingOn: nlp.waitingOn,
                nlp: buildNlpEnvelope(resolvedScheduledDate),
                // The "open full editor" path needs this sheet to stay mounted so
                // its per-call onSuccess can receive the new task id. Plain
                // placements close instantly via optimistic removal instead.
                skipOptimisticRemoval: options?.openEditor === true,
            },
            {
                onSuccess: (task) => {
                    if (options?.openEditor && task && onOpenFullEditor) {
                        onOpenFullEditor(task.id);
                    } else {
                        onClose();
                    }
                },
            },
        );
    };

    const openCustomSchedule = () => {
        const inferredDate = nlp.dueDate ?? null;
        const isTimed = Boolean(inferredDate && inferredDate.includes("T"));
        setCustomSchedule({
            dueDate: isTimed ? null : inferredDate,
            scheduledStart: isTimed ? inferredDate : null,
            scheduledEnd: null,
            isAllDay: !isTimed,
            recurrenceRule: nlp.recurrenceRule ?? null,
        });
        setTimingMode("custom");
    };

    const discard = () => {
        trackUsageEvent("capture.discarded", { surface: "clarify_sheet", object_type: "capture" });
        updateItem.mutate(
            {
                id: item.id,
                captureStatus: "discarded",
            },
            { onSuccess: () => onClose() },
        );
    };

    return (
        <motion.div
            className="flex h-full flex-col overflow-hidden"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            style={{ willChange: "transform, opacity" }}
            role="complementary"
            aria-label="Clarify capture"
        >
            {/* ── Header ── */}
            <div className="flex items-center gap-3 border-b border-twilight-border px-5 h-14 shrink-0">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close clarify sheet"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors shrink-0 cursor-pointer"
                >
                    <ArrowLeft size={15} aria-hidden="true" />
                </button>
                <h2 className="font-display text-sm font-medium text-twilight-text truncate">
                    Clarify capture
                </h2>
            </div>

            {/* ── Stacked pane body ── */}
            <ScrollAreaWrapper>
                <div className="flex flex-col gap-4 px-5 py-5">

                    {/* ─── Slice 1: Title + structured understanding ─── */}
                    <div className="rounded-[1.25rem] border border-twilight-border/35 bg-white/[0.025] px-5 py-4 backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <Sparkles size={14} className="text-accent-primary/70" aria-hidden="true" />
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted">
                                {nlp.summary ? "Cadence understood" : item.aiSuggestion ? "Cadence suggests" : "Title"}
                            </p>
                            <time
                                dateTime={item.createdAt}
                                className="ml-auto text-[11px] text-twilight-text-muted/70 tabular-nums"
                            >
                                {relativeTime(item.createdAt)}
                            </time>
                        </div>
                        {item.aiSuggestion && !nlp.summary && (
                            <p className="text-[13px] text-twilight-text-soft/80 mb-3 italic leading-relaxed">
                                {item.aiSuggestion}
                            </p>
                        )}
                        {showExplanations && (
                            <ParseSummaryChips
                                parseResult={nlp.parseResult}
                                summary={nlp.summary}
                                onDismiss={(entityId) => setDismissedEntityIds((prev) => [...prev, entityId])}
                                lowStimulation={lowStimulationMode || userSettings?.appearance?.motion === "reduced"}
                                maxVisibleChips={lowStimulationMode ? 1 : 3}
                            />
                        )}
                        <input
                            type="text"
                            value={editedTitle}
                            onChange={(e) => {
                                titleDirtyRef.current = true;
                                setEditedTitle(e.target.value);
                            }}
                            aria-label="Edit task title"
                            className="w-full rounded-xl border border-twilight-border/30 bg-white/[0.03] px-3.5 py-2.5 text-[14px] text-twilight-text outline-none transition-colors focus:border-accent-primary/25 focus:bg-white/[0.04] placeholder:text-twilight-text-muted/60 mt-3"
                            placeholder="Edit the title before placing..."
                        />
                        {editedTitle.trim() !== item.rawText.trim() ? (
                            <p className="mt-2 text-[12px] leading-relaxed text-twilight-text-muted/80">
                                From: <span className="text-twilight-text-soft">{item.rawText}</span>
                            </p>
                        ) : null}
                    </div>

                    {/* ─── Slice 2: Timing — when should this happen? ─── */}
                    <div className="rounded-[1.25rem] border border-twilight-border/35 bg-white/[0.025] px-5 py-4 backdrop-blur-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted mb-3">
                            When?
                        </p>

                        {timingMode === "main" ? (
                            <>
                                {/* If NLP detected a date, show it as a prominent suggestion */}
                                {nlp.dueDate && (
                                    <button
                                        type="button"
                                        onClick={() => place({ scheduledDate: nlp.dueDate! })}
                                        disabled={isPending}
                                        className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-accent-primary/25 bg-accent-primary/[0.10] px-4 py-3.5 text-left transition-colors hover:bg-accent-primary/[0.16] disabled:opacity-50 cursor-pointer"
                                    >
                                        <Sparkles size={16} className="text-accent-primary shrink-0" aria-hidden="true" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[14px] font-medium text-accent-primary">Use detected date</p>
                                            <p className="text-[12px] text-accent-primary/60">
                                                {nlp.dueHumanLabel ?? nlp.dueDate}
                                            </p>
                                        </div>
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => place({ scheduledDate: todayISO() })}
                                    disabled={isPending}
                                    className="flex w-full items-center gap-3 rounded-2xl border border-accent-primary/20 bg-accent-primary/[0.08] px-4 py-3.5 text-left transition-colors hover:bg-accent-primary/[0.14] disabled:opacity-50 cursor-pointer"
                                >
                                    <Sun size={18} className="text-accent-primary shrink-0" aria-hidden="true" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[14px] font-medium text-accent-primary">Today</p>
                                        <p className="text-[12px] text-accent-primary/60">Schedule for today</p>
                                    </div>
                                </button>

                                <div className="mt-3 grid grid-cols-2 gap-2.5">
                                    <PlacementButton
                                        icon={<Sunrise size={15} aria-hidden="true" />}
                                        label="Tomorrow"
                                        onClick={() => place({ scheduledDate: tomorrowISO() })}
                                        disabled={isPending}
                                        className="text-moonlit border-moonlit/20 bg-moonlit/[0.06] hover:bg-moonlit/[0.12]"
                                    />
                                    <PlacementButton
                                        icon={<CalendarDays size={15} aria-hidden="true" />}
                                        label="Custom"
                                        onClick={openCustomSchedule}
                                        disabled={isPending}
                                        className="text-twilight-text-soft border-twilight-border/30 bg-white/[0.03] hover:bg-white/[0.06]"
                                    />
                                </div>
                            </>
                        ) : (
                            <>
                                <QuickScheduleSurface
                                    dueDate={customSchedule.dueDate}
                                    scheduledStart={customSchedule.scheduledStart}
                                    scheduledEnd={customSchedule.scheduledEnd}
                                    recurrenceRule={customSchedule.recurrenceRule}
                                    onChange={(updates) => {
                                        setCustomSchedule((current) => ({
                                            ...current,
                                            ...updates,
                                        }));
                                    }}
                                    onRequestClose={() => setTimingMode("main")}
                                />
                                <div className="mt-3 flex items-center justify-between gap-2 px-1">
                                    <button
                                        type="button"
                                        onClick={() => setTimingMode("main")}
                                        className="rounded-xl px-3 py-2 text-[12px] font-medium text-twilight-text-muted transition-colors hover:bg-white/[0.04] hover:text-twilight-text"
                                    >
                                        Back
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => place({
                                            dueDate: customSchedule.dueDate,
                                            scheduledStart: customSchedule.scheduledStart,
                                            scheduledEnd: customSchedule.scheduledEnd,
                                            isAllDay: customSchedule.isAllDay,
                                            recurrenceRule: customSchedule.recurrenceRule,
                                        })}
                                        disabled={isPending || (!customSchedule.dueDate && !customSchedule.scheduledStart)}
                                        className="rounded-xl border border-accent-primary/25 bg-accent-primary/[0.10] px-3.5 py-2 text-[12px] font-medium text-accent-primary transition-colors hover:bg-accent-primary/[0.16] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Place with this schedule
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* ─── Slice 3: Alternative path ─── */}
                    {onOpenFullEditor && (
                        <div className="rounded-[1.25rem] border border-twilight-border/35 bg-white/[0.025] px-5 py-4 backdrop-blur-sm">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted mb-3">
                                Or instead…
                            </p>
                            <button
                                type="button"
                                onClick={() => place(undefined, { openEditor: true })}
                                disabled={isPending}
                                className="flex w-full items-center justify-between rounded-[1.1rem] border border-twilight-border/35 bg-white/[0.025] px-4 py-3.5 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-50 cursor-pointer"
                            >
                                <div>
                                    <p className="text-[13px] font-medium text-twilight-text">Open full task editor</p>
                                    <p className="text-[12px] text-twilight-text-muted">
                                        Place it first, then refine timing, notes, and details
                                    </p>
                                </div>
                                <ChevronRight size={16} className="text-twilight-text-muted shrink-0" aria-hidden="true" />
                            </button>
                        </div>
                    )}

                    {/* ─── Discard — visually calmer, farther from primary (§9.1) ─── */}
                    <div className="px-1 pt-2">
                        <button
                            type="button"
                            onClick={discard}
                            disabled={isPending}
                            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-medium text-twilight-text-muted/50 transition-colors hover:text-red-400 hover:bg-red-500/[0.06] disabled:opacity-50 cursor-pointer"
                        >
                            <Trash2 size={13} aria-hidden="true" />
                            Discard capture
                        </button>
                    </div>

                </div>
            </ScrollAreaWrapper>
        </motion.div>
    );
}

/** Secondary placement button — consistent grid item */
function PlacementButton({
    icon,
    label,
    onClick,
    disabled,
    className,
}: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    disabled: boolean;
    className: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`flex items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-left transition-colors disabled:opacity-50 cursor-pointer ${className}`}
        >
            {icon}
            <span className="text-[13px] font-medium">{label}</span>
        </button>
    );
}

function relativeTime(iso: string): string {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffSec = Math.max(0, Math.floor((now - then) / 1000));

    if (diffSec < 60) return "just now";
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins} m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days} d ago`;
    const months = Math.floor(days / 30);
    return `${months} mo ago`;
}
