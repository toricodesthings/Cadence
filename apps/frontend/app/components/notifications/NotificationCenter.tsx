import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { BellRing, CheckCheck, Search, Settings, ChevronDown } from "lucide-react";
import { useOpenNotification } from "../../hooks/notifications/use-open-notification";
import { NotificationRow, NOTIFICATION_STYLES, actionClass } from "./NotificationRow";
import type { GroupedNotifications } from "../../hooks/notifications/use-notification-center";
import { DEFER_LABELS, type DeferChoice } from "../../lib/notifications/reminder-engine";
import { Tip } from "../primitives/Tooltip";
import * as AlertDialog from "../primitives/AlertDialog";
import * as DropdownMenu from "../primitives/DropdownMenu";

const PAGE_SIZE = 30;

const SORT_LABELS = { newest: "Newest first", oldest: "Oldest first", priority: "Priority first" } as const;
type SortOrder = keyof typeof SORT_LABELS;

export function NotificationCenter({
    grouped, hasUnread, markRead, markUnread, markAllRead, dismiss, dismissMany, defer, onClose, onOpenSettings, fullPage = false,
}: {
    grouped: GroupedNotifications[];
    hasUnread: boolean;
    markRead: (id: string) => void;
    markUnread: (id: string) => void;
    markAllRead: () => void;
    dismiss: (id: string) => void;
    dismissMany?: (ids: string[]) => void;
    defer?: (id: string, choice: DeferChoice) => void;
    onClose: () => void;
    fullPage?: boolean;
    onOpenSettings?: () => void;
}) {
    const handleOpen = useOpenNotification(markRead, onClose);
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<SortOrder>("newest");
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [clearIds, setClearIds] = useState<string[] | null>(null);
    const [announcement, setAnnouncement] = useState("");
    const listRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const nextPageFocus = useRef<number | null>(null);
    const didClear = useRef(false);
    useLayoutEffect(() => {
        if (nextPageFocus.current === null) return;
        listRef.current?.querySelectorAll<HTMLButtonElement>("[data-notification-open]")[nextPageFocus.current]?.focus();
        nextPageFocus.current = null;
    }, [limit]);
    const all = useMemo(() => grouped.flatMap(({ items }) => items), [grouped]);
    const unreadCount = all.filter((n) => !n.read).length;
    const query = search.trim().toLocaleLowerCase();
    const visible = useMemo(() => all.filter((n) => (!unreadOnly || !n.read) &&
        (!query || `${n.title} ${n.body} ${NOTIFICATION_STYLES[n.kind].label}`.toLocaleLowerCase().includes(query)))
        .sort((a, b) => {
            if (sort === "priority" && a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
            const time = new Date(b.triggerAt).getTime() - new Date(a.triggerAt).getTime();
            return (sort === "oldest" ? -time : time) || a.id.localeCompare(b.id);
        }), [all, query, unreadOnly, sort]);
    const displayed = visible.slice(0, limit);

    function resetList() {
        setLimit(PAGE_SIZE);
        listRef.current?.scrollTo?.({ top: 0 });
    }

    // Keep keyboard focus in the list when its current row disappears.
    function actOnRow(id: string, action: () => void, removesRow = true) {
        const rows = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-notification-open]") ?? []);
        const index = displayed.findIndex((n) => n.id === id);
        (removesRow ? rows[index + 1] ?? rows[index - 1] ?? listRef.current : rows[index])?.focus({ preventScroll: true });
        action();
    }

    return <div className="notification-center flex min-h-0 w-full flex-1 flex-col">
        {!fullPage && <h2 className="px-5 pt-5 font-display text-xl font-semibold text-twilight-text">Notifications</h2>}
        <div className="shrink-0 space-y-3 border-b border-twilight-border px-1 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div role="group" aria-label="Filter notifications" className="inline-flex rounded-2xl bg-twilight-surface-muted p-1">
                    {([false, true] as const).map((unread) => <button key={String(unread)} type="button" aria-pressed={unreadOnly === unread}
                        onClick={() => { setUnreadOnly(unread); resetList(); }}
                        className={`${actionClass} !px-2 gap-2 ${unreadOnly === unread ? "bg-twilight-surface text-twilight-text shadow-sm" : ""}`}>
                        {unread ? "Unread" : "All"}<span className="text-xs tabular-nums text-twilight-text-muted">{unread ? unreadCount : all.length}</span>
                    </button>)}
                </div>
                <button type="button" disabled={!hasUnread} onClick={() => { markAllRead(); setAnnouncement("All notifications marked as read."); }}
                    className={actionClass} aria-label="Mark all as read"><CheckCheck size={16} aria-hidden="true" />Read all</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <label className="relative flex min-w-0 flex-[1_1_7rem] items-center">
                    <Search size={17} className="pointer-events-none absolute left-3 text-twilight-text-muted" aria-hidden="true" />
                    <span className="sr-only">Search notifications</span>
                    <input ref={searchRef} type="search" value={search} placeholder="Search"
                        onChange={(event) => { setSearch(event.target.value); resetList(); }}
                        className="min-h-11 w-full rounded-xl border border-twilight-border bg-twilight-surface py-2 pl-10 pr-3 text-sm text-twilight-text placeholder:text-twilight-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary" />
                </label>
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button type="button" aria-label={`Sort notifications: ${SORT_LABELS[sort]}`} className={`${actionClass} border border-twilight-border bg-twilight-surface`}>
                            {SORT_LABELS[sort]}<ChevronDown size={16} aria-hidden="true" />
                        </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end" aria-label="Sort notifications">
                        <DropdownMenu.RadioGroup value={sort} onValueChange={(value) => { setSort(value as SortOrder); resetList(); }}>
                            {(Object.keys(SORT_LABELS) as SortOrder[]).map((value) => <DropdownMenu.RadioItem key={value} value={value}>{SORT_LABELS[value]}</DropdownMenu.RadioItem>)}
                        </DropdownMenu.RadioGroup>
                    </DropdownMenu.Content>
                </DropdownMenu.Root>
            </div>
        </div>

        <div ref={listRef} tabIndex={-1} aria-label="Notification list" className="notification-center-list min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-primary">
            {visible.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center gap-4 px-5 py-10 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-accent-primary-dim text-accent-primary"><BellRing size={24} aria-hidden="true" /></div>
                <div><p className="font-display text-lg font-semibold text-twilight-text">{query ? "No matching notifications" : unreadOnly && all.length > 0 ? "You’re all caught up" : "Nothing to catch up on"}</p>
                    <p className="mt-2 max-w-xs text-sm leading-relaxed text-twilight-text-muted">{query ? "Try another word or clear your search." : unreadOnly && all.length > 0 ? "Your read notifications are still in All." : "Your task and habit reminders will appear here."}</p></div>
                {(query || unreadOnly && all.length > 0) && <button type="button" className={actionClass} onClick={() => { setSearch(""); setUnreadOnly(false); resetList(); searchRef.current?.focus(); }}>Show all notifications</button>}
            </div> : <>
                <ul className="space-y-3">
                    {displayed.map((n) => <NotificationRow key={n.id} notification={n}
                        onOpen={() => actOnRow(n.id, () => handleOpen(n), unreadOnly && !n.route)}
                        onToggleRead={() => actOnRow(n.id, () => {
                            if (n.read) markUnread(n.id); else markRead(n.id);
                            setAnnouncement(n.read ? "Notification marked as unread." : "Notification marked as read.");
                        }, unreadOnly && !n.read)}
                        onDismiss={() => actOnRow(n.id, () => { dismiss(n.id); setAnnouncement("Notification dismissed."); })}
                        onDefer={defer ? (choice) => actOnRow(n.id, () => { defer(n.id, choice); setAnnouncement(`Reminder deferred: ${DEFER_LABELS[choice]}.`); }) : undefined} />)}
                </ul>
                {visible.length > limit && <button type="button" className={`${actionClass} mt-3 w-full`} onClick={() => { nextPageFocus.current = limit; setLimit((value) => value + PAGE_SIZE); }}>Show more · {visible.length - limit} remaining</button>}
            </>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-twilight-border px-1 pt-2">
            <p className="mr-auto px-3 text-xs text-twilight-text-muted">{unreadCount ? `${unreadCount} unread` : "All caught up"}</p>
            {dismissMany && <button type="button" className={actionClass} disabled={all.length === 0} onClick={() => setClearIds(all.map((n) => n.id))}>Clear all…</button>}
            {onOpenSettings && <Tip label="Notification settings"><button type="button" onClick={onOpenSettings} className="mobile-icon-button" aria-label="Notification settings"><Settings size={18} aria-hidden="true" /></button></Tip>}
        </div>
        <span className="sr-only" role="status">{announcement}</span>
        <AlertDialog.Root open={clearIds !== null} onOpenChange={(open) => { if (!open) setClearIds(null); }}>
            <AlertDialog.Content className="w-[calc(100%-2rem)] border-twilight-border bg-twilight-deep" onCloseAutoFocus={(event) => {
                if (!didClear.current) return;
                event.preventDefault();
                searchRef.current?.focus();
                didClear.current = false;
            }}>
                <AlertDialog.Title className="font-display text-lg font-semibold text-twilight-text">Clear {clearIds?.length} notifications?</AlertDialog.Title>
                <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-twilight-text-muted">This clears all notifications, including ones hidden by your filters. Your tasks and habits won’t change.</AlertDialog.Description>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <AlertDialog.Cancel className={actionClass}>Keep notifications</AlertDialog.Cancel>
                    <AlertDialog.Action className={`${actionClass} bg-accent-primary-dim text-accent-primary`} onClick={() => {
                        didClear.current = true;
                        if (clearIds) dismissMany?.(clearIds);
                        setAnnouncement("All notifications cleared.");
                    }}>Clear notifications</AlertDialog.Action>
                </div>
            </AlertDialog.Content>
        </AlertDialog.Root>
    </div>;
}
