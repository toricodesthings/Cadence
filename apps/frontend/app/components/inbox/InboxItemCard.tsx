import type { InboxItem } from "../../types/inbox";
import { useUpdateInboxItem } from "../../hooks/inbox/use-update-inbox-item";
import { useProcessInboxToTask, todayISO, tomorrowISO } from "../../hooks/inbox/use-process-inbox-to-task";
import { useSettings } from "../../hooks/core/use-settings";
import { buildCanonicalNlpEnvelope } from "../../lib/nlp/build-canonical-envelope";
import { trackUsageEvent } from "../../lib/api/track-event";
import { Sun, Sparkles, Search, MoreHorizontal, Sunrise, Clock, StickyNote, Trash2 } from "lucide-react";
import * as ContextMenu from "../primitives/ContextMenu";
import { useState, useCallback, useRef, useEffect } from "react";

interface InboxItemCardProps {
    item: InboxItem;
    isSelected?: boolean;
    isFocused?: boolean;
    onSelect?: (itemId: string) => void;
    onClarify?: (itemId: string) => void;
}

/**
 * Individual capture card in the Holding feed.
 *
 * §9.1 — Two-layer action system:
 *   Visible: Today + Clarify + overflow trigger
 *   Overflow: Tomorrow, Later, Keep note, Discard
 * M2 — visible actions never hover-gated
 * M3 — relative timestamps
 * §10.3 — keyboard on focused card: Enter=clarify, 1=today, 2=tomorrow, 3=later, k=keep note, Backspace=discard
 */
export function InboxItemCard({ item, isSelected, isFocused, onSelect, onClarify }: InboxItemCardProps) {
    const updateItem = useUpdateInboxItem();
    const processToTask = useProcessInboxToTask();
    const { data: userSettings } = useSettings();
    const intelligenceEnabled = userSettings?.tasks?.intelligence?.nlpEnabled !== false;
    const showExplanations = userSettings?.tasks?.intelligence?.showExplanations !== false;
    const isPending = processToTask.isPending || updateItem.isPending;
    const [overflowOpen, setOverflowOpen] = useState(false);
    const overflowRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const analysis = item.analysis as {
        rawInput?: string;
        sourceSurface?: "inbox" | "inbox_card" | "clarify_sheet" | "holding_capture" | "holding_clarify";
        dateStyle?: "mdy" | "dmy" | "ymd";
        dismissedEntityIds?: string[];
        userOverrides?: Record<string, unknown>;
        projectId?: string | null;
        tagIds?: string[] | null;
        priority?: number | null;
        durationEstimate?: number | null;
        recurrenceRule?: string | null;
        waitingOn?: string | null;
    } | null;
    const quietSummary = showExplanations && intelligenceEnabled
        ? item.analysisSummary ?? (item.analysis as { summary?: string } | null | undefined)?.summary ?? null
        : null;
    const dateStyle = userSettings?.dateTime?.dateStyle ?? "mdy";

    const buildInboxEnvelope = (scheduledDate?: string) =>
        buildCanonicalNlpEnvelope({
            rawInput: analysis?.rawInput ?? item.rawText,
            sourceSurface: analysis?.sourceSurface ?? "inbox",
            dateStyle: analysis?.dateStyle ?? dateStyle,
            dismissedEntityIds: analysis?.dismissedEntityIds ?? [],
            userOverrides: {
                ...(analysis?.userOverrides ?? {}),
                scheduledDate: scheduledDate ?? null,
                projectId: analysis?.projectId ?? null,
                tagIds: analysis?.tagIds ?? [],
                priority: analysis?.priority ?? null,
                durationEstimate: analysis?.durationEstimate ?? null,
                recurrenceRule: analysis?.recurrenceRule ?? null,
                waitingOn: analysis?.waitingOn ?? null,
            },
        });

    const place = useCallback((scheduledDate?: string) => {
        processToTask.mutate({
            inboxItemId: item.id,
            rawText: item.rawText,
            scheduledDate,
            projectId: analysis?.projectId ?? null,
            tagIds: analysis?.tagIds ?? undefined,
            priority: analysis?.priority ?? null,
            durationEstimate: analysis?.durationEstimate ?? null,
            recurrenceRule: analysis?.recurrenceRule ?? null,
            waitingOn: analysis?.waitingOn ?? null,
            nlp: buildInboxEnvelope(scheduledDate),
        });
    }, [item.id, item.rawText, analysis, processToTask, buildInboxEnvelope]);

    const keepNote = useCallback(() => {
        processToTask.mutate({
            inboxItemId: item.id,
            rawText: item.rawText,
            keepNote: true,
            projectId: analysis?.projectId ?? null,
            tagIds: analysis?.tagIds ?? undefined,
            priority: analysis?.priority ?? null,
            durationEstimate: analysis?.durationEstimate ?? null,
            recurrenceRule: analysis?.recurrenceRule ?? null,
            waitingOn: analysis?.waitingOn ?? null,
            nlp: buildInboxEnvelope(),
        });
    }, [item.id, item.rawText, analysis, processToTask, buildInboxEnvelope]);

    const discard = useCallback(() => {
        updateItem.mutate({
            id: item.id,
            captureStatus: "discarded",
        });
    }, [item.id, updateItem]);

    // Close overflow on outside click
    useEffect(() => {
        if (!overflowOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
                setOverflowOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [overflowOpen]);

    // §10.3 keyboard actions on focused card
    useEffect(() => {
        if (!isFocused) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;

            switch (e.key) {
                case "Enter":
                    e.preventDefault();
                    onClarify?.(item.id);
                    break;
                case "1":
                    e.preventDefault();
                    place(todayISO());
                    break;
                case "2":
                    e.preventDefault();
                    place(tomorrowISO());
                    break;
                case "3":
                    e.preventDefault();
                    place();
                    break;
                case "k":
                    e.preventDefault();
                    keepNote();
                    break;
                case "Backspace":
                case "Delete":
                    e.preventDefault();
                    discard();
                    break;
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isFocused, item.id, onClarify, place, keepNote, discard]);

    return (
        <ContextMenu.Root onOpenChange={(isOpen) => {
            if (isOpen) trackUsageEvent("capture.context_menu_opened", { object_type: "capture", input_method: "context_menu" });
        }}>
        <ContextMenu.Trigger asChild>
        <div
            ref={cardRef}
            data-focus-kind="inbox"
            data-focus-id={item.id}
            className={`group relative flex flex-col gap-3 py-3.5 px-4 -mx-4 rounded-xl transition-colors border cursor-pointer
                ${isFocused
                    ? "border-accent-primary/30 bg-accent-primary/[0.06]"
                    : isSelected
                        ? "border-accent-primary/20 bg-accent-primary/[0.04]"
                        : "border-transparent hover:bg-white/[0.03] hover:border-twilight-border-light"
                }`}
        >
            {/* ── Tappable capture text + timestamp ── */}
            <button
                type="button"
                onClick={() => onSelect?.(item.id)}
                className="flex w-full items-start gap-3 text-left cursor-pointer"
            >
                <p className="flex-1 min-w-0 text-[15px] text-twilight-text leading-relaxed whitespace-pre-wrap break-words">
                    {item.rawText}
                </p>
                <time
                    dateTime={item.createdAt}
                    className="shrink-0 text-[11px] font-medium text-twilight-text-muted/70 tabular-nums mt-0.5"
                >
                    {relativeTime(item.createdAt)}
                </time>
            </button>

            {/* ── Quiet NLP summary ── */}
            {quietSummary && (
                <div className="flex items-center gap-1.5 px-0.5 -mt-1">
                    <Sparkles size={11} className="text-accent-primary/50 shrink-0" aria-hidden="true" />
                    <p className="text-[11px] text-twilight-text-muted/70 truncate">{quietSummary}</p>
                </div>
            )}

            {/* ── Two-layer actions (§9.1): Today + Clarify visible, rest in overflow ── */}
            <div className="flex items-center gap-2">
                <ActionPill
                    label="Today"
                    icon={<Sun size={13} aria-hidden="true" />}
                    onClick={() => place(todayISO())}
                    disabled={isPending}
                    hint="1"
                    className="bg-accent-primary/10 text-accent-primary ring-accent-primary/20 hover:bg-accent-primary/20 min-h-10"
                />
                <ActionPill
                    label="Clarify"
                    icon={<Search size={13} aria-hidden="true" />}
                    onClick={() => onClarify?.(item.id)}
                    disabled={isPending}
                    hint="↵"
                    className="bg-moonlit/10 text-moonlit ring-moonlit/20 hover:bg-moonlit/20 min-h-10"
                />

                <span className="flex-1" />

                {/* Overflow trigger */}
                <div className="relative" ref={overflowRef}>
                    <button
                        type="button"
                        onClick={() => setOverflowOpen((prev) => !prev)}
                        aria-label="More actions"
                        aria-expanded={overflowOpen}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-twilight-text-muted/60 hover:text-twilight-text-soft hover:bg-white/[0.06] transition-colors cursor-pointer"
                    >
                        <MoreHorizontal size={15} aria-hidden="true" />
                    </button>

                    {overflowOpen && (
                        <div
                            role="menu"
                            className="absolute right-0 top-full mt-1 z-50 min-w-[180px] py-1.5 rounded-xl border border-twilight-border bg-twilight-surface-2 shadow-lg"
                        >
                            <OverflowItem
                                icon={<Sunrise size={14} />}
                                label="Tomorrow"
                                hint="2"
                                onClick={() => { place(tomorrowISO()); setOverflowOpen(false); }}
                                disabled={isPending}
                            />
                            <OverflowItem
                                icon={<Clock size={14} />}
                                label="Later"
                                hint="3"
                                onClick={() => { place(); setOverflowOpen(false); }}
                                disabled={isPending}
                            />
                            <OverflowItem
                                icon={<StickyNote size={14} />}
                                label="Keep note"
                                hint="K"
                                onClick={() => { keepNote(); setOverflowOpen(false); }}
                                disabled={isPending}
                            />
                            <div className="my-1 border-t border-twilight-border/40" />
                            <OverflowItem
                                icon={<Trash2 size={14} />}
                                label="Discard"
                                hint="⌫"
                                onClick={() => { discard(); setOverflowOpen(false); }}
                                disabled={isPending}
                                destructive
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
        </ContextMenu.Trigger>
        <ContextMenu.Content>
            <ContextMenu.Item onSelect={() => place(todayISO())}>
                <div className="flex items-center gap-2">
                    <Sun size={16} />
                    <span>Today</span>
                    <kbd className="ml-auto text-[10px] opacity-40 font-mono">1</kbd>
                </div>
            </ContextMenu.Item>
            <ContextMenu.Item onSelect={() => onClarify?.(item.id)}>
                <div className="flex items-center gap-2">
                    <Search size={16} />
                    <span>Clarify</span>
                    <kbd className="ml-auto text-[10px] opacity-40 font-mono">↵</kbd>
                </div>
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item onSelect={() => place(tomorrowISO())}>
                <div className="flex items-center gap-2">
                    <Sunrise size={16} />
                    <span>Tomorrow</span>
                    <kbd className="ml-auto text-[10px] opacity-40 font-mono">2</kbd>
                </div>
            </ContextMenu.Item>
            <ContextMenu.Item onSelect={() => place()}>
                <div className="flex items-center gap-2">
                    <Clock size={16} />
                    <span>Later</span>
                    <kbd className="ml-auto text-[10px] opacity-40 font-mono">3</kbd>
                </div>
            </ContextMenu.Item>
            <ContextMenu.Item onSelect={() => keepNote()}>
                <div className="flex items-center gap-2">
                    <StickyNote size={16} />
                    <span>Keep as note</span>
                    <kbd className="ml-auto text-[10px] opacity-40 font-mono">K</kbd>
                </div>
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item variant="danger" onSelect={() => discard()}>
                <div className="flex items-center gap-2">
                    <Trash2 size={16} />
                    <span>Discard</span>
                    <kbd className="ml-auto text-[10px] opacity-40 font-mono">⌫</kbd>
                </div>
            </ContextMenu.Item>
        </ContextMenu.Content>
        </ContextMenu.Root>
    );
}

/* ── Action pill — small, tappable, always visible ── */
function ActionPill({
    label,
    icon,
    onClick,
    disabled,
    className,
    hint,
}: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    disabled: boolean;
    className: string;
    hint?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-2 rounded-xl ring-1 transition-colors cursor-pointer disabled:opacity-50 ${className}`}
        >
            {icon}
            {label}
            {hint && (
                <kbd className="ml-1 text-[9px] opacity-50 font-mono">{hint}</kbd>
            )}
        </button>
    );
}

/* ── Overflow menu item ── */
function OverflowItem({
    icon,
    label,
    hint,
    onClick,
    disabled,
    destructive,
}: {
    icon: React.ReactNode;
    label: string;
    hint?: string;
    onClick: () => void;
    disabled?: boolean;
    destructive?: boolean;
}) {
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onClick}
            disabled={disabled}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors cursor-pointer disabled:opacity-50
                ${destructive
                    ? "text-twilight-text-muted/60 hover:text-red-400 hover:bg-red-500/10"
                    : "text-twilight-text-soft hover:bg-white/[0.06]"
                }`}
        >
            <span className="shrink-0 opacity-70">{icon}</span>
            <span className="flex-1 text-left">{label}</span>
            {hint && <kbd className="text-[10px] opacity-40 font-mono">{hint}</kbd>}
        </button>
    );
}

/* ── Relative timestamp — "just now", "3 m", "2 h", "5 d" (M3 fix) ── */
function relativeTime(iso: string): string {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffSec = Math.max(0, Math.floor((now - then) / 1000));

    if (diffSec < 60) return "just now";
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins} m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} h`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days} d`;
    const months = Math.floor(days / 30);
    return `${months} mo`;
}
