import { Bell, BellOff, Calendar, EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { Tip } from "../primitives/Tooltip";
import type { PersonalEvent } from "../../types/settings";
import { eventToneStyle, groupPersonalEventsByMonth, type PersonalEventSortMode, type PersonalEventViewModel } from "../../lib/utils/personal-events";

/** Desktop: event · date · countdown · reminder · ⋮. */
const COLUMNS = "grid grid-cols-[minmax(0,1fr)_7.5rem_8.5rem_2.75rem_2.75rem] items-center gap-2";
const ICON_BUTTON = "flex size-11 cursor-pointer items-center justify-center rounded-xl text-twilight-text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--event-tone)_10%,transparent)] hover:text-[var(--event-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--event-tone)]/60 lg:size-9";

interface EventListProps {
    events: PersonalEventViewModel[];
    sort: PersonalEventSortMode;
    today: string;
    stacked: boolean;
    selectedEventId: string | null;
    onOpen: (event: PersonalEvent) => void;
    onEdit: (event: PersonalEvent) => void;
    onDelete: (event: PersonalEvent) => void;
    onToggleReminder: (event: PersonalEvent) => void;
    onOpenInSchedule: (event: PersonalEvent) => void;
}

/**
 * Events as one list: a calendar you scan down, grouped under the month each one next comes round.
 * Each row wears its event's colour; the countdown is the one thing that stands out, brightest on the day.
 */
export function EventList({ events, sort, today, stacked, selectedEventId, ...actions }: EventListProps) {
    const groups = groupPersonalEventsByMonth(events, sort, today);
    return (
        <div role="list" aria-label="Personal events" className="surface-card rounded-[24px] p-2">
            {stacked ? null : (
                <div aria-hidden="true" className={`photo-shell-surface layer-shell-base sticky top-0 ${COLUMNS} rounded-2xl bg-twilight-deep/75 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted backdrop-blur-xl`}>
                    <span>Event</span>
                    <span>Date</span>
                    <span>Countdown</span>
                    <span className="text-center">Remind</span>
                    <span />
                </div>
            )}
            {groups.map((group) => (
                <div key={group.key} role="group" aria-label={group.label ?? undefined}>
                    {group.label ? (
                        <p className="px-3 pb-1 pt-3 text-xs font-semibold text-twilight-text-soft">{group.label}</p>
                    ) : null}
                    {group.items.map((item) => (
                        <EventRow key={item.event.id} item={item} stacked={stacked} selected={item.event.id === selectedEventId} {...actions} />
                    ))}
                </div>
            ))}
        </div>
    );
}

function EventRow({ item, stacked, selected, onOpen, onEdit, onDelete, onToggleReminder, onOpenInSchedule }: Omit<EventListProps, "events" | "sort" | "today" | "selectedEventId"> & {
    item: PersonalEventViewModel;
    selected: boolean;
}) {
    const { event } = item;
    const isToday = item.daysUntil <= 0;
    const soon = item.daysUntil <= 7;
    const countdown = (
        <span className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold tabular-nums ${isToday
            ? "bg-[color-mix(in_srgb,var(--event-tone)_28%,transparent)] text-[var(--event-ink)] ring-1 ring-[var(--event-tone)]/50"
            : soon
                ? "bg-[color-mix(in_srgb,var(--event-tone)_16%,transparent)] text-[var(--event-ink)]"
                : "text-twilight-text-soft"}`}>
            {item.countdownLabel}
        </span>
    );
    const reminderLabel = event.notify ? `Turn off the reminder for ${event.label}` : `Remind me about ${event.label}`;
    const menu = (
        <DropdownMenu.Root>
            <Tip label="Event options">
                <DropdownMenu.Trigger asChild>
                    <button type="button" aria-label={`Options for ${event.label}`} className={ICON_BUTTON}>
                        <EllipsisVertical size={16} aria-hidden="true" />
                    </button>
                </DropdownMenu.Trigger>
            </Tip>
            <DropdownMenu.Content align="end">
                <DropdownMenu.Item className="gap-2" onSelect={() => onEdit(event)}><Pencil size={14} aria-hidden="true" />Edit event</DropdownMenu.Item>
                <DropdownMenu.Item className="gap-2" onSelect={() => onOpenInSchedule(event)}><Calendar size={14} aria-hidden="true" />Open in schedule</DropdownMenu.Item>
                <DropdownMenu.Item className="gap-2" onSelect={() => onToggleReminder(event)}>
                    {event.notify ? <BellOff size={14} aria-hidden="true" /> : <Bell size={14} aria-hidden="true" />}
                    {event.notify ? "Turn off reminder" : "Remind me"}
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item variant="danger" className="gap-2" onSelect={() => onDelete(event)}><Trash2 size={14} aria-hidden="true" />Delete event</DropdownMenu.Item>
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
    const identity = (
        <button
            type="button"
            onClick={() => onOpen(event)}
            aria-current={selected || undefined}
            className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--event-tone)]/60"
        >
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--event-tone)_20%,transparent)] bg-[color-mix(in_srgb,var(--event-tone)_12%,transparent)] text-lg">
                {event.emoji ?? "🎉"}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium leading-snug text-twilight-text">{event.label}</span>
                {stacked || item.milestoneLabel ? (
                    <span className="block truncate text-xs text-twilight-text-muted">
                        {[stacked ? item.monthDayLabel : null, item.milestoneLabel].filter(Boolean).join(" · ")}
                    </span>
                ) : null}
            </span>
        </button>
    );
    const rowClass = `group rounded-2xl px-3 py-1.5 transition-colors ${selected
        ? "bg-[color-mix(in_srgb,var(--event-tone)_9%,transparent)]"
        : isToday ? "bg-[color-mix(in_srgb,var(--event-tone)_5%,transparent)] hover:bg-[color-mix(in_srgb,var(--event-tone)_8%,transparent)]" : "hover:bg-white/[0.025]"}`;

    if (stacked) {
        return (
            <div role="listitem" data-event-row={event.id} style={eventToneStyle(event.color)} className={`flex items-center gap-2 ${rowClass}`}>
                {identity}
                {event.notify ? <Bell size={13} className="shrink-0 text-[var(--event-ink-soft)]" aria-label="Reminder on" /> : null}
                {countdown}
                {menu}
            </div>
        );
    }
    return (
        <div role="listitem" data-event-row={event.id} style={eventToneStyle(event.color)} className={`${COLUMNS} ${rowClass}`}>
            {identity}
            <span className="text-sm text-twilight-text-soft">{item.monthDayLabel}</span>
            <span>{countdown}</span>
            <Tip label={reminderLabel}>
                <button type="button" role="switch" aria-checked={event.notify} aria-label={reminderLabel} onClick={() => onToggleReminder(event)}
                    className={`${ICON_BUTTON} mx-auto ${event.notify ? "text-[var(--event-ink)]" : ""}`}>
                    {event.notify ? <Bell size={16} aria-hidden="true" /> : <BellOff size={16} aria-hidden="true" />}
                </button>
            </Tip>
            {menu}
        </div>
    );
}
