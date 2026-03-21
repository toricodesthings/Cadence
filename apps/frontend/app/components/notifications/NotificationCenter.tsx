import { useNavigate } from "react-router";
import {
    Bell, BellRing, Clock, CalendarClock, Flame, X, CheckCheck,
} from "lucide-react";
import { buildFocusSearchParams } from "../../hooks/search/use-route-focus";
import type { AppNotification, NotificationGroup } from "../../lib/notifications/notification-model";
import type { GroupedNotifications } from "../../hooks/notifications/use-notification-center";

// ── Icon + accent mapping ──
const NOTIFICATION_STYLES: Record<
    AppNotification["kind"],
    { icon: typeof Bell; accent: string }
> = {
    "task-reminder": { icon: Clock, accent: "text-lantern" },
    "task-due": { icon: CalendarClock, accent: "text-lantern" },
    "habit-reminder": { icon: Flame, accent: "text-lantern" },
    system: { icon: BellRing, accent: "text-moonlit" },
};

function RelativeTime({ iso }: { iso: string }) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return <span>Just now</span>;
    if (mins < 60) return <span>{mins}m ago</span>;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return <span>{hrs}h ago</span>;
    const days = Math.floor(hrs / 24);
    return <span>{days}d ago</span>;
}

export function NotificationCenter({
    grouped,
    hasUnread,
    markRead,
    markAllRead,
    dismiss,
    onClose,
}: {
    grouped: GroupedNotifications[];
    hasUnread: boolean;
    markRead: (id: string) => void;
    markAllRead: () => void;
    dismiss: (id: string) => void;
    onClose: () => void;
}) {
    const navigate = useNavigate();
    const isEmpty = grouped.length === 0;

    const handleOpen = (n: AppNotification) => {
        markRead(n.id);
        if (n.route && n.entityId) {
            const params = buildFocusSearchParams({
                focusKind: n.kind === "habit-reminder" ? "habit" : "task",
                focusId: n.entityId,
                focusSource: "notification",
            });
            navigate(`${n.route}?${params.toString()}`);
            onClose();
        }
    };

    return (
        <div className="flex flex-col w-full max-h-[28rem]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-twilight-border px-5 py-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-twilight-text-soft">
                        Notifications
                    </p>
                    <h2 className="mt-1 font-display text-lg font-semibold text-twilight-text">
                        Recent activity
                    </h2>
                </div>
                {hasUnread && (
                    <button
                        onClick={markAllRead}
                            className="flex items-center gap-1.5 text-sm text-twilight-text-muted hover:text-twilight-text transition-colors"
                        aria-label="Mark all as read"
                    >
                        <CheckCheck size={14} aria-hidden="true" />
                        Read all
                    </button>
                )}
            </div>

            {/* Body */}
            {isEmpty ? (
                <EmptyState />
            ) : (
                <div className="overflow-y-auto flex-1 py-1">
                    {grouped.map(({ group, label, items }) => (
                        <div key={group}>
                            <p className="px-5 pt-4 pb-2 text-xs font-semibold uppercase tracking-[0.15em] text-twilight-text-soft">
                                {label}
                            </p>
                            {items.map((n) => (
                                <NotificationRow
                                    key={n.id}
                                    notification={n}
                                    onOpen={() => handleOpen(n)}
                                    onDismiss={() => dismiss(n.id)}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function NotificationRow({
    notification: n,
    onOpen,
    onDismiss,
}: {
    notification: AppNotification;
    onOpen: () => void;
    onDismiss: () => void;
}) {
    const { icon: Icon, accent } = NOTIFICATION_STYLES[n.kind];

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
            className={`
                group relative flex items-start gap-3 px-5 py-3 cursor-pointer transition-colors
                hover:bg-white/[0.03]
                ${n.read ? "opacity-60" : ""}
            `}
        >
            {/* Icon */}
            <div className={`mt-0.5 shrink-0 ${accent}`}>
                <Icon size={16} aria-hidden="true" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-twilight-text truncate">
                    {n.title}
                </p>
                <p className="text-sm text-twilight-text-muted mt-0.5 truncate">
                    {n.body}
                </p>
            </div>

            {/* Right side: timestamp + dismiss */}
            <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-twilight-text-muted tabular-nums">
                    <RelativeTime iso={n.triggerAt} />
                </span>
                <button
                    onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                    className="opacity-100 pointer-coarse:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 p-1 -m-0.5 rounded hover:bg-white/10 text-twilight-text-muted hover:text-twilight-text transition-all"
                    aria-label={`Dismiss notification: ${n.title}`}
                >
                    <X size={14} aria-hidden="true" />
                </button>
            </div>

            {/* Unread dot */}
            {!n.read && (
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-lantern" />
            )}
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-8 text-center text-twilight-text-soft">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-twilight-surface">
                <BellRing size={20} className="text-moonlit" aria-hidden="true" />
            </div>
            <div>
                <p className="text-sm font-medium text-twilight-text">
                    Nothing new yet
                </p>
                <p className="mt-1.5 text-sm leading-relaxed">
                    Task reminders and workspace updates will appear here without interrupting your flow.
                </p>
            </div>
        </div>
    );
}
