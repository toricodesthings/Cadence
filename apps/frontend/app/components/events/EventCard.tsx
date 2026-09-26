import { Bell, BellOff, Trash2, PencilLine, Calendar } from "lucide-react";
import * as ContextMenu from "../primitives/ContextMenu";
import { Button } from "../primitives/Button";
import { trackUsageEvent } from "../../lib/api/track-event";
import type { PersonalEvent } from "../../types/settings";
import { eventToneColor, eventToneStyle, type PersonalEventViewModel } from "../../lib/utils/personal-events";

export function EventCard({
    item,
    onOpen,
    onEdit,
    onDelete,
    onToggleReminder,
    onOpenInSchedule,
}: {
    item: PersonalEventViewModel;
    /** Card body and title: opens the event, or closes it when already open. */
    onOpen: (event: PersonalEvent) => void;
    onEdit: (event: PersonalEvent) => void;
    onDelete: (event: PersonalEvent) => void;
    onToggleReminder: (event: PersonalEvent) => void;
    onOpenInSchedule: (event: PersonalEvent) => void;
}) {
    // A picked colour washes the whole card softly; no colour keeps the plain glass card.
    const tinted = Boolean(eventToneColor(item.event.color));
    return (
        <ContextMenu.Root onOpenChange={(isOpen) => {
            if (isOpen) trackUsageEvent("event.context_menu_opened", { object_type: "event", input_method: "context_menu" });
        }}>
            <ContextMenu.Trigger asChild>
        <div
            data-event-card={item.event.id}
            style={eventToneStyle(item.event.color)}
            onClick={(e) => {
                if (!(e.target instanceof Element) || e.target.closest("button, a, input, select, textarea, [role='menuitem'], [role='switch'], [contenteditable='true']")) return;
                onOpen(item.event);
            }}
            className={`group cursor-pointer rounded-[1.7rem] border p-4 transition-[border-color,background-color,box-shadow] duration-300 hover:border-[color-mix(in_srgb,var(--event-tone)_28%,transparent)] hover:shadow-[0_18px_44px_color-mix(in_srgb,var(--event-tone)_12%,transparent)] ${tinted ? "border-[color-mix(in_srgb,var(--event-tone)_18%,transparent)] bg-[color-mix(in_srgb,var(--event-tone)_6%,transparent)] hover:bg-[color-mix(in_srgb,var(--event-tone)_9%,transparent)]" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.045]"}`}>
            <div className="flex items-start justify-between gap-3">
                <button
                    type="button"
                    onClick={() => onOpen(item.event)}
                    className="flex min-w-0 cursor-pointer items-center gap-3 rounded-2xl -m-2 p-2 text-left transition-colors hover:bg-white/[0.03]"
                >
                    <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--event-tone)_20%,transparent)] bg-[color-mix(in_srgb,var(--event-tone)_12%,transparent)] text-xl text-[var(--event-ink)] transition-colors duration-300">
                        {item.event.emoji ?? "🎉"}
                    </span>
                    <span className="min-w-0">
                        <span className="block line-clamp-2 text-[17px] font-bold tracking-[-0.01em] text-twilight-text">
                            {item.event.label}
                        </span>
                    </span>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                    <button
                        type="button"
                        onClick={() => onToggleReminder(item.event)}
                        aria-label={item.event.notify ? `Disable reminder for ${item.event.label}` : `Enable reminder for ${item.event.label}`}
                        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-transparent bg-transparent text-twilight-text-muted transition-colors hover:border-[color-mix(in_srgb,var(--event-tone)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--event-tone)_10%,transparent)] hover:text-[var(--event-ink)]"
                    >
                        {item.event.notify ? <Bell size={16} aria-hidden="true" /> : <BellOff size={16} aria-hidden="true" />}
                    </button>
                    <button
                        type="button"
                        onClick={() => onDelete(item.event)}
                        aria-label={`Delete ${item.event.label}`}
                        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-transparent bg-transparent text-twilight-text-muted transition-colors hover:border-red-400/20 hover:bg-red-500/10 hover:text-red-400"
                    >
                        <Trash2 size={16} aria-hidden="true" />
                    </button>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted">Date</p>
                    <p className="mt-1 text-sm font-medium text-twilight-text">{item.monthDayLabel}</p>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted">Reminder</p>
                    <p className="mt-1 flex items-center gap-2 text-sm font-medium text-twilight-text">
                        {item.event.notify ? <Bell size={14} className="text-[var(--event-ink)]" aria-hidden="true" /> : <BellOff size={14} className="text-twilight-text-muted" aria-hidden="true" />}
                        <span>{item.event.notify ? "On" : "Off"}</span>
                    </p>
                </div>
            </div>

            <div className="mt-3 rounded-[1.35rem] border border-[color-mix(in_srgb,var(--event-tone)_16%,transparent)] bg-[color-mix(in_srgb,var(--event-tone)_10%,transparent)] px-3 py-3 transition-colors duration-300">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--event-ink-soft)]">Countdown</p>
                <p className="mt-1 text-base font-semibold text-[var(--event-ink)] transition-colors duration-300">{item.countdownLabel}</p>
                {item.milestoneLabel ? (
                    <p className="mt-1 text-xs font-medium text-[var(--event-ink-soft)]">{item.milestoneLabel}</p>
                ) : null}
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={() => onOpenInSchedule(item.event)}
                    className="px-4 text-sm font-semibold"
                >
                    <Calendar size={16} aria-hidden="true" />
                    Schedule
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={() => onEdit(item.event)}
                    className="px-4 text-sm font-semibold"
                >
                    <PencilLine size={16} aria-hidden="true" />
                    Edit
                </Button>
            </div>
        </div>
            </ContextMenu.Trigger>
            <ContextMenu.Content>
                <ContextMenu.Item onSelect={() => onEdit(item.event)}>
                    <PencilLine size={14} aria-hidden="true" />
                    Edit event
                </ContextMenu.Item>
                <ContextMenu.Item onSelect={() => onOpenInSchedule(item.event)}>
                    <Calendar size={14} aria-hidden="true" />
                    Open in schedule
                </ContextMenu.Item>
                <ContextMenu.Item onSelect={() => onToggleReminder(item.event)}>
                    {item.event.notify ? <BellOff size={14} aria-hidden="true" /> : <Bell size={14} aria-hidden="true" />}
                    {item.event.notify ? "Disable reminder" : "Enable reminder"}
                </ContextMenu.Item>
                <ContextMenu.Separator />
                <ContextMenu.Item
                    className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
                    onSelect={() => onDelete(item.event)}
                >
                    <Trash2 size={14} aria-hidden="true" />
                    Delete event
                </ContextMenu.Item>
            </ContextMenu.Content>
        </ContextMenu.Root>
    );
}

