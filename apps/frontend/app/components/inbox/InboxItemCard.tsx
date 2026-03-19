import type { InboxItem } from "../../types/inbox";
import { useUpdateInboxItem } from "../../hooks/inbox/use-update-inbox-item";
import { useProcessInboxToTask, todayISO, tomorrowISO } from "../../hooks/inbox/use-process-inbox-to-task";
import { Sun, Sunrise, Clock, StickyNote, Trash2 } from "lucide-react";

interface InboxItemCardProps {
    item: InboxItem;
    isSelected?: boolean;
    onSelect?: (itemId: string) => void;
}

/**
 * Individual capture card in the Holding feed.
 *
 * C6 — outcome-based actions: Today / Tomorrow / Later / Keep note / Discard
 * M2 — actions always visible (no hover-gating)
 * M3 — relative timestamps
 * Phase 5 — tappable to open ClarifySheet
 */
export function InboxItemCard({ item, isSelected, onSelect }: InboxItemCardProps) {
    const updateItem = useUpdateInboxItem();
    const processToTask = useProcessInboxToTask();
    const isPending = processToTask.isPending || updateItem.isPending;

    const place = (scheduledDate?: string) => {
        processToTask.mutate({
            inboxItemId: item.id,
            rawText: item.rawText,
            scheduledDate,
        });
    };

    const keepNote = () => {
        processToTask.mutate({
            inboxItemId: item.id,
            rawText: item.rawText,
            keepNote: true,
        });
    };

    const discard = () => {
        updateItem.mutate({
            id: item.id,
            captureStatus: "discarded",
        });
    };

    return (
        <div
            data-focus-kind="inbox"
            data-focus-id={item.id}
            className={`group relative flex flex-col gap-3 py-3.5 px-4 -mx-4 rounded-xl transition-colors border cursor-pointer
                ${isSelected
                    ? "border-lantern/20 bg-lantern/[0.04]"
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

            {/* ── Outcome actions — always visible (M2) ── */}
            <div className="flex flex-wrap gap-2">
                <ActionPill
                    label="Today"
                    icon={<Sun size={13} aria-hidden="true" />}
                    onClick={() => place(todayISO())}
                    disabled={isPending}
                    className="bg-lantern/10 text-lantern ring-lantern/20 hover:bg-lantern/20"
                />
                <ActionPill
                    label="Tomorrow"
                    icon={<Sunrise size={13} aria-hidden="true" />}
                    onClick={() => place(tomorrowISO())}
                    disabled={isPending}
                    className="bg-moonlit/10 text-moonlit ring-moonlit/20 hover:bg-moonlit/20"
                />
                <ActionPill
                    label="Later"
                    icon={<Clock size={13} aria-hidden="true" />}
                    onClick={() => place()}
                    disabled={isPending}
                    className="bg-white/[0.04] text-twilight-text-soft ring-twilight-border/30 hover:bg-white/[0.07]"
                />
                <ActionPill
                    label="Keep note"
                    icon={<StickyNote size={13} aria-hidden="true" />}
                    onClick={keepNote}
                    disabled={isPending}
                    className="bg-white/[0.04] text-twilight-text-soft ring-twilight-border/30 hover:bg-white/[0.07]"
                />

                {/* Spacer pushes discard right */}
                <span className="flex-1" />

                <button
                    type="button"
                    onClick={discard}
                    disabled={isPending}
                    aria-label={`Discard capture: ${item.rawText.slice(0, 40)}`}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-lg text-twilight-text-muted/60 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
                >
                    <Trash2 size={12} aria-hidden="true" />
                    <span className="hidden sm:inline">Discard</span>
                </button>
            </div>
        </div>
    );
}

/* ── Action pill — small, tappable, always visible ── */
function ActionPill({
    label,
    icon,
    onClick,
    disabled,
    className,
}: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    disabled: boolean;
    className: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg ring-1 transition-colors cursor-pointer disabled:opacity-50 ${className}`}
        >
            {icon}
            {label}
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
