import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Sun, Sunrise, Clock, StickyNote, Trash2, ChevronRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useProcessInboxToTask, todayISO, tomorrowISO } from "../../hooks/inbox/use-process-inbox-to-task";
import { useUpdateInboxItem } from "../../hooks/inbox/use-update-inbox-item";
import { ScrollAreaWrapper } from "../shared/ScrollAreaWrapper";
import { ParseSummaryChips } from "../tasks/ParseSummaryChips";
import { useNlpParse } from "../../hooks/use-nlp-parse";
import { useSettings } from "../../hooks/core/use-settings";
import { useProjects } from "../../hooks/projects";
import { useTags } from "../../hooks/tags";
import { buildCanonicalNlpEnvelope } from "../../lib/nlp/build-canonical-envelope";
import type { InboxItem } from "../../types/inbox";
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

    const place = (scheduledDate?: string) => {
        const resolvedSchedule = scheduledDate ?? (nlp.dueDate || undefined);
        trackUsageEvent("capture.placed", { surface: "clarify_sheet", outcome: "placed" });
        processToTask.mutate(
            {
                inboxItemId: item.id,
                rawText: item.rawText,
                title: editedTitle,
                scheduledDate: resolvedSchedule,
                projectId: nlp.projectId,
                tagIds: nlp.tagIds,
                priority: nlp.priority,
                durationEstimate: nlp.durationMinutes,
                recurrenceRule: nlp.recurrenceRule,
                waitingOn: nlp.waitingOn,
                nlp: buildNlpEnvelope(resolvedSchedule),
            },
            {
                onSuccess: (task) => {
                    if (task && onOpenFullEditor) {
                        onOpenFullEditor(task.id);
                    } else {
                        onClose();
                    }
                },
            },
        );
    };

    const keepNote = () => {
        trackUsageEvent("capture.kept_note", { surface: "clarify_sheet", object_type: "capture" });
        processToTask.mutate(
            {
                inboxItemId: item.id,
                rawText: item.rawText,
                title: editedTitle,
                keepNote: true,
                projectId: nlp.projectId,
                tagIds: nlp.tagIds,
                priority: nlp.priority,
                durationEstimate: nlp.durationMinutes,
                recurrenceRule: nlp.recurrenceRule,
                waitingOn: nlp.waitingOn,
                nlp: buildNlpEnvelope(),
            },
            { onSuccess: () => onClose() },
        );
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

                    {/* ─── Slice 1: Source capture (immutable) ─── */}
                    <div className="rounded-[1.25rem] border border-twilight-border/35 bg-twilight-surface/16 px-5 py-4 backdrop-blur-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted mb-2">
                            You captured
                        </p>
                        <p className="text-[15px] leading-relaxed text-twilight-text whitespace-pre-wrap break-words">
                            {item.rawText}
                        </p>
                        <time
                            dateTime={item.createdAt}
                            className="mt-2 block text-[11px] text-twilight-text-muted/70 tabular-nums"
                        >
                            {relativeTime(item.createdAt)}
                        </time>
                    </div>

                    {/* ─── Slice 2: Structured understanding + editable title ─── */}
                    <div className="rounded-[1.25rem] border border-twilight-border/35 bg-white/[0.025] px-5 py-4 backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <Sparkles size={14} className="text-accent-primary/70" aria-hidden="true" />
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted">
                                {nlp.summary ? "Cadence understood" : item.aiSuggestion ? "Cadence suggests" : "Task title"}
                            </p>
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
                    </div>

                    {/* ─── Slice 3: Timing — when should this happen? ─── */}
                    <div className="rounded-[1.25rem] border border-twilight-border/35 bg-white/[0.025] px-5 py-4 backdrop-blur-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted mb-3">
                            When?
                        </p>

                        {/* If NLP detected a date, show it as a prominent suggestion */}
                        {nlp.dueDate && (
                            <button
                                type="button"
                                onClick={() => place(nlp.dueDate!)}
                                disabled={isPending}
                                className="flex w-full items-center gap-3 rounded-2xl border border-accent-primary/25 bg-accent-primary/[0.10] px-4 py-3.5 text-left transition-colors hover:bg-accent-primary/[0.16] disabled:opacity-50 cursor-pointer mb-3"
                            >
                                <Sparkles size={16} className="text-accent-primary shrink-0" aria-hidden="true" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[14px] font-medium text-accent-primary">Use detected date</p>
                                    <p className="text-[12px] text-accent-primary/60">
                                        {/* §11.5: Show human-readable date, not raw ISO value */}
                                        {nlp.dueHumanLabel ?? nlp.dueDate}
                                    </p>
                                </div>
                            </button>
                        )}

                        {/* Primary: Today — largest, most obvious */}
                        <button
                            type="button"
                            onClick={() => place(todayISO())}
                            disabled={isPending}
                            className="flex w-full items-center gap-3 rounded-2xl border border-accent-primary/20 bg-accent-primary/[0.08] px-4 py-3.5 text-left transition-colors hover:bg-accent-primary/[0.14] disabled:opacity-50 cursor-pointer"
                        >
                            <Sun size={18} className="text-accent-primary shrink-0" aria-hidden="true" />
                            <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-medium text-accent-primary">Today</p>
                                <p className="text-[12px] text-accent-primary/60">Schedule for today</p>
                            </div>
                        </button>

                        {/* Secondary row */}
                        <div className="mt-3 grid grid-cols-2 gap-2.5">
                            <PlacementButton
                                icon={<Sunrise size={15} aria-hidden="true" />}
                                label="Tomorrow"
                                onClick={() => place(tomorrowISO())}
                                disabled={isPending}
                                className="text-moonlit border-moonlit/20 bg-moonlit/[0.06] hover:bg-moonlit/[0.12]"
                            />
                            <PlacementButton
                                icon={<Clock size={15} aria-hidden="true" />}
                                label="Place without date"
                                onClick={() => place()}
                                disabled={isPending}
                                className="text-twilight-text-soft border-twilight-border/30 bg-white/[0.03] hover:bg-white/[0.06]"
                            />
                        </div>
                    </div>

                    {/* ─── Slice 4: Note vs task decision ─── */}
                    <div className="rounded-[1.25rem] border border-twilight-border/35 bg-white/[0.025] px-5 py-4 backdrop-blur-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted mb-3">
                            Or instead…
                        </p>
                        <div className="flex flex-col gap-2">
                            <PlacementButton
                                icon={<StickyNote size={15} aria-hidden="true" />}
                                label="Keep as note"
                                onClick={keepNote}
                                disabled={isPending}
                                className="w-full text-twilight-text-soft border-twilight-border/30 bg-white/[0.03] hover:bg-white/[0.06]"
                            />
                        </div>
                    </div>

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

                    {/* ─── Open full task editor — place first, then customize (§9.1) ─── */}
                    {onOpenFullEditor && (
                        <button
                            type="button"
                            onClick={() => {
                                // Place as unscheduled task and open full editor
                                processToTask.mutate(
                                    {
                                        inboxItemId: item.id,
                                        rawText: item.rawText,
                                        title: editedTitle,
                                        projectId: nlp.projectId,
                                        tagIds: nlp.tagIds,
                                        priority: nlp.priority,
                                        durationEstimate: nlp.durationMinutes,
                                        recurrenceRule: nlp.recurrenceRule,
                                        waitingOn: nlp.waitingOn,
                                        nlp: buildNlpEnvelope(),
                                    },
                                    {
                                        onSuccess: (task) => {
                                            if (task) onOpenFullEditor(task.id);
                                        },
                                    },
                                );
                            }}
                            disabled={isPending}
                            className="flex w-full items-center justify-between rounded-[1.25rem] border border-twilight-border/35 bg-white/[0.025] px-5 py-4 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-50 cursor-pointer backdrop-blur-sm"
                        >
                            <div>
                                <p className="text-[13px] font-medium text-twilight-text">Open full task editor</p>
                                <p className="text-[12px] text-twilight-text-muted">
                                    Place as task, then add notes, subtasks, and more
                                </p>
                            </div>
                            <ChevronRight size={16} className="text-twilight-text-muted shrink-0" aria-hidden="true" />
                        </button>
                    )}
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
