import { useState, useEffect, useRef } from "react";
import { Inbox, Sun, Sunrise, CalendarDays, Trash2, ChevronRight, Sparkles } from "lucide-react";
import { useProcessInboxToTask, todayISO, tomorrowISO } from "../../hooks/inbox/use-process-inbox-to-task";
import { useUpdateInboxItem } from "../../hooks/inbox/use-update-inbox-item";
import { relativeTime } from "../../lib/utils/date-format";
import { DetailPanelLayout } from "../shared/DetailPanelLayout";
import { DetailTitle } from "../shared/DetailTitle";
import { CARD, PANEL_TRIGGER, PanelHeader, PanelTrigger } from "../shared/DetailPanelSections";
import { Button } from "../primitives/Button";
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
    detailMode?: "peek" | "focus";
    onDetailModeChange?: (mode: "peek" | "focus") => void;
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
export function ClarifySheet({ item, onClose, onOpenFullEditor, detailMode = "peek", onDetailModeChange }: ClarifySheetProps) {
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
    const [timingOpen, setTimingOpen] = useState(true);
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
        <div className="h-full min-w-0 overflow-hidden" role="complementary" aria-label="Clarify capture">
            <DetailPanelLayout title="Capture" leading={<Inbox size={20} className="text-accent-primary" aria-hidden="true" />}
                onClose={onClose} closeLabel="Close clarify sheet" mode={detailMode} onModeChange={onDetailModeChange}>
                <DetailTitle value={editedTitle} label="Edit task title" onSave={setEditedTitle}
                    onDraftChange={(title) => { titleDirtyRef.current = true; setEditedTitle(title); }}>
                        <div className="mt-3 flex min-w-0 items-center gap-2 text-xs text-twilight-text-muted">
                            <Sparkles size={14} className="shrink-0 text-accent-primary" aria-hidden="true" />
                            <span>{item.aiSuggestion && !nlp.summary ? "Cadence suggests" : "Captured"}</span>
                            <time dateTime={item.createdAt} className="ml-auto shrink-0 tabular-nums">{relativeTime(item.createdAt, { suffix: " ago" })}</time>
                        </div>
                        {item.aiSuggestion && !nlp.summary && (
                            <p className="text-[13px] text-twilight-text-soft mb-3 italic leading-relaxed">
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
                        {editedTitle.trim() !== item.rawText.trim() ? (
                            <p className="mt-2 text-[12px] leading-relaxed text-twilight-text-muted">
                                From: <span className="text-twilight-text-soft">{item.rawText}</span>
                            </p>
                        ) : null}
                </DetailTitle>

                {timingOpen ? (
                    <section className={`${CARD} shrink-0 space-y-3 px-4 py-3`}>
                        <PanelHeader title="When" onDone={() => setTimingOpen(false)} />

                        {timingMode === "main" ? (
                            <>
                                {/* If NLP detected a date, show it as a prominent suggestion */}
                                {nlp.dueDate && (
                                    <Button variant="ghost" size="none"
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
                                    </Button>
                                )}

                                <Button variant="ghost" size="none"
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
                                </Button>

                                <div className="mt-3 flex flex-wrap gap-2.5">
                                    <Button variant="secondary" size="md" onClick={() => place({ scheduledDate: tomorrowISO() })} disabled={isPending} className="min-w-0 flex-1 basis-24 px-2">
                                        <Sunrise size={15} className="shrink-0" aria-hidden="true" />Tomorrow
                                    </Button>
                                    <Button variant="secondary" size="md" onClick={openCustomSchedule} disabled={isPending} className="min-w-0 flex-1 basis-24 px-2">
                                        <CalendarDays size={15} className="shrink-0" aria-hidden="true" />Custom
                                    </Button>
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
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
                                    <Button variant="ghost" size="none"
                                        type="button"
                                        onClick={() => setTimingMode("main")}
                                        className="rounded-xl px-3 py-2 text-[12px] font-medium text-twilight-text-muted transition-colors hover:bg-white/[0.04] hover:text-twilight-text"
                                    >
                                        Back
                                    </Button>
                                    <Button variant="ghost" size="none"
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
                                    </Button>
                                </div>
                            </>
                        )}
                    </section>
                ) : <PanelTrigger icon={CalendarDays} title="When" summary={nlp.dueHumanLabel ?? "Choose when to place this capture"} onOpen={() => setTimingOpen(true)} />}
                {onOpenFullEditor ? (
                    <Button variant="ghost" size="none" onClick={() => place(undefined, { openEditor: true })} disabled={isPending} className={PANEL_TRIGGER}>
                        <span className="min-w-0 flex-1 text-left"><span className="block text-sm font-medium text-twilight-text">Open full task editor</span><span className="block text-xs font-normal text-twilight-text-muted">Place it first, then refine timing, notes, and details.</span></span>
                        <ChevronRight size={16} className="shrink-0" aria-hidden="true" />
                    </Button>
                ) : null}
                <Button variant="ghost" size="none" onClick={discard} disabled={isPending} className={`${PANEL_TRIGGER} shrink-0 text-feedback-error`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-feedback-error/10"><Trash2 size={16} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1 text-left"><span className="block text-sm font-medium">Discard capture</span><span className="block text-xs font-normal text-twilight-text-muted">Remove this capture from your inbox.</span></span>
                </Button>
            </DetailPanelLayout>
        </div>
    );
}
