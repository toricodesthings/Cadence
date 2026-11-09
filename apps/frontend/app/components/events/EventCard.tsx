import { Bell, BellOff, Trash2, Calendar, Pencil } from "lucide-react";
import { Tip } from "../primitives/Tooltip";
import * as ContextMenu from "../primitives/ContextMenu";
import { EventMenuItems } from "./EventMenuItems";
import { Button } from "../primitives/Button";
import { trackUsageEvent } from "../../lib/api/track-event";
import type { PersonalEvent } from "../../types/settings";
import { eventToneColor, eventToneStyle, type PersonalEventViewModel } from "../../lib/utils/personal-events";

/** What can be done to an event from a list row or card. `onOpen` opens it, or closes it when already open. */
export interface EventActions {
    onOpen: (event: PersonalEvent) => void;
    onEdit: (event: PersonalEvent) => void;
    onDelete: (event: PersonalEvent) => void;
    onToggleReminder: (event: PersonalEvent) => void;
    onOpenInSchedule: (event: PersonalEvent) => void;
}

export function EventCard({
    item,
    onOpen,
    onEdit,
    onDelete,
    onToggleReminder,
    onOpenInSchedule,
}: EventActions & { item: PersonalEventViewModel }) {
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
            data-lift
            className={`surface-card group cursor-pointer rounded-[1.7rem] p-4 transition-[border-color,background-color,box-shadow] duration-300 hover:border-[color-mix(in_srgb,var(--event-tone)_28%,transparent)]! hover:shadow-[0_18px_44px_color-mix(in_srgb,var(--event-tone)_12%,transparent)] ${tinted ? "border-[color-mix(in_srgb,var(--event-tone)_18%,transparent)]! [background-image:linear-gradient(color-mix(in_srgb,var(--event-tone)_7%,transparent),color-mix(in_srgb,var(--event-tone)_7%,transparent))]" : ""}`}>
            <div className="flex items-start justify-between gap-3">
                <button
                    type="button"
                    onClick={() => onOpen(item.event)}
                    className="flex min-w-0 cursor-pointer items-center gap-3 rounded-[18px] -m-2 p-2 text-left transition-colors hover:bg-white/[0.03]"
                >
                    <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border border-[color-mix(in_srgb,var(--event-tone)_20%,transparent)] bg-[color-mix(in_srgb,var(--event-tone)_12%,transparent)] text-xl text-[var(--event-ink)] transition-colors duration-300">
                        {item.event.emoji ?? "🎉"}
                    </span>
                    <span className="min-w-0">
                        <span className="block line-clamp-2 text-[17px] font-bold tracking-[-0.01em] text-twilight-text">
                            {item.event.label}
                        </span>
                    </span>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                    <Tip label={item.event.notify ? "Reminder on" : "Reminder off"} side="top">
                    <button
                        type="button"
                        onClick={() => onToggleReminder(item.event)}
                        aria-label={`${item.event.notify ? "Turn off" : "Turn on"} reminder for ${item.event.label}`}
                        className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-transparent bg-transparent transition-colors ${item.event.notify ? "text-[var(--event-ink)]" : "text-twilight-text-muted"} hover:border-[color-mix(in_srgb,var(--event-tone)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--event-tone)_10%,transparent)] hover:text-[var(--event-ink)]`}
                    >
                        {item.event.notify ? <Bell size={16} aria-hidden="true" /> : <BellOff size={16} aria-hidden="true" />}
                    </button>
                    </Tip>
                    <Tip label="Delete" side="top">
                    <button
                        type="button"
                        onClick={() => onDelete(item.event)}
                        aria-label={`Delete ${item.event.label}`}
                        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-transparent bg-transparent text-twilight-text-muted transition-colors hover:border-red-400/20 hover:bg-red-500/10 hover:text-red-400"
                    >
                        <Trash2 size={16} aria-hidden="true" />
                    </button>
                    </Tip>
                </div>
            </div>

            {/* One block: the countdown, then its day. Concentric with the card: 27px − 17px inset = 10px. */}
            <div className="mt-4 rounded-[10px] border border-[color-mix(in_srgb,var(--event-tone)_16%,transparent)] bg-[color-mix(in_srgb,var(--event-tone)_10%,transparent)] px-3 py-3 transition-colors duration-300">
                <p className="text-base font-semibold text-[var(--event-ink)] transition-colors duration-300">{item.countdownLabel}</p>
                <p className="mt-1 text-xs font-medium text-[var(--event-ink-soft)]">
                    {item.milestoneLabel ? `${item.monthDayLabel} · ${item.milestoneLabel}` : item.monthDayLabel}
                </p>
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
                    <Pencil size={16} aria-hidden="true" />
                    Edit
                </Button>
            </div>
        </div>
            </ContextMenu.Trigger>
            <ContextMenu.Content>
                <EventMenuItems Menu={ContextMenu} event={item.event} onEdit={onEdit} onOpenInSchedule={onOpenInSchedule} onToggleReminder={onToggleReminder} onDelete={onDelete} />
            </ContextMenu.Content>
        </ContextMenu.Root>
    );
}

