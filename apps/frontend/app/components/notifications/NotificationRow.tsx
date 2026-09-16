import { useRef } from "react";
import { Bell, BellRing, Clock, CalendarClock, Flame, X, Check, Circle, Timer } from "lucide-react";
import type { AppNotification } from "../../lib/notifications/notification-model";
import { DEFER_LABELS, type DeferChoice } from "../../lib/notifications/reminder-engine";
import { Tip } from "../primitives/Tooltip";
import * as DropdownMenu from "../primitives/DropdownMenu";

export const NOTIFICATION_STYLES: Record<AppNotification["kind"], { icon: typeof Bell; label: string }> = {
    "task-reminder": { icon: Clock, label: "Reminder" },
    "task-due": { icon: CalendarClock, label: "Task" },
    "habit-reminder": { icon: Flame, label: "Habit" },
    system: { icon: BellRing, label: "Update" },
};
export const actionClass = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm text-twilight-text-soft transition-colors hover:bg-twilight-surface-muted hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary disabled:cursor-default disabled:opacity-50 cursor-pointer";

function RelativeTime({ iso }: { iso: string }) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(Math.abs(diff) / 60_000);
    const amount = mins < 60 ? `${Math.max(1, mins)}m` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`;
    return <time dateTime={iso}>{diff < 0 ? `In ${amount}` : mins < 1 ? "Just now" : `${amount} ago`}</time>;
}

export function NotificationRow({ notification: n, onOpen, onToggleRead, onDismiss, onDefer, compact = false }: {
    notification: AppNotification;
    onOpen: () => void;
    onToggleRead?: () => void;
    onDismiss: () => void;
    onDefer?: (choice: DeferChoice) => void;
    compact?: boolean;
}) {
    const { icon: Icon } = NOTIFICATION_STYLES[n.kind];
    const pendingDefer = useRef<DeferChoice | null>(null);
    const readAction = n.read ? "Mark as unread" : "Mark as read";
    return <li className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 ${compact ? "rounded-xl p-1" : "rounded-2xl border border-twilight-border/60 px-4 pt-4 pb-2"} ${n.read ? "bg-twilight-surface/40" : "bg-accent-primary-dim"}`}>
        <button type="button" data-notification-open onClick={onOpen} aria-label={`${n.title}. ${n.body}${n.read ? "" : ". Unread"}`}
            className={`flex min-h-11 min-w-0 items-start rounded-lg text-left transition-colors hover:bg-twilight-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary cursor-pointer ${compact ? "gap-2 p-1" : "gap-3"}`}>
            <Icon size={compact ? 16 : 20} className="mt-0.5 shrink-0 text-accent-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1">
                <span className={`${compact ? "line-clamp-2" : "block"} break-words text-sm leading-relaxed ${n.read ? "font-medium text-twilight-text-soft" : "font-semibold text-twilight-text"}`}>{n.title}</span>
                <span className={`mt-1 ${compact ? "line-clamp-1" : "block"} break-words text-sm leading-relaxed text-twilight-text-muted`}>{n.body}</span>
                {compact && <span className="mt-1 flex items-center gap-2 text-xs text-twilight-text-muted"><RelativeTime iso={n.triggerAt} />{n.read ? <Check size={13} aria-label="Read" /> : <span className="size-1.5 rounded-full bg-accent-primary" aria-label="Unread" />}</span>}
            </span>
        </button>
        <Tip label="Dismiss notification"><button type="button" onClick={onDismiss} className="mobile-icon-button self-start" aria-label={`Dismiss notification: ${n.title}`}><X size={17} aria-hidden="true" /></button></Tip>
        {!compact && <div className="col-span-full mt-2 flex flex-wrap items-center justify-between gap-x-2">
            <span className="flex flex-wrap items-center gap-2 text-xs text-twilight-text-muted tabular-nums">
                <RelativeTime iso={n.triggerAt} />
                {n.priority === "high" && <span className="text-accent-primary">· Priority</span>}
            </span>
            <div className="ml-auto flex items-center gap-1">
                {onToggleRead && <Tip label={`${n.read ? "Read · " : ""}${readAction}`}>
                    <button type="button" className={`mobile-icon-button ${n.read ? "text-twilight-text-soft" : "text-accent-primary"}`} aria-label={`${readAction}: ${n.title}`} aria-pressed={n.read} onClick={onToggleRead}>
                        {n.read ? <Check size={18} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
                    </button>
                </Tip>}
                {onDefer && <DropdownMenu.Root>
                    <Tip label="Remind me later"><DropdownMenu.Trigger asChild>
                        <button type="button" className="mobile-icon-button" aria-label={`Defer notification: ${n.title}`}><Timer size={18} aria-hidden="true" /></button>
                    </DropdownMenu.Trigger></Tip>
                    <DropdownMenu.Content align="end" aria-label="Remind me later" onCloseAutoFocus={(event) => {
                        if (!pendingDefer.current) return;
                        event.preventDefault();
                        const choice = pendingDefer.current;
                        pendingDefer.current = null;
                        onDefer(choice);
                    }}>
                        {(Object.keys(DEFER_LABELS) as DeferChoice[]).map((choice) => <DropdownMenu.Item key={choice} className="min-h-11" onSelect={() => { pendingDefer.current = choice; }}>{DEFER_LABELS[choice]}</DropdownMenu.Item>)}
                    </DropdownMenu.Content>
                </DropdownMenu.Root>}
            </div>
        </div>}
    </li>;
}
