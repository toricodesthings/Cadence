import { Button } from "../primitives/Button";
import { useState } from "react";
import { CalendarHeart, Palette, SlidersHorizontal, Trash2 } from "lucide-react";
import type { PersonalEvent } from "../../types/settings";
import { EVENT_SWATCHES, eventToneColor, eventToneStyle, getNextPersonalEventDate, toPersonalEventViewModel } from "../../lib/utils/personal-events";
import { DetailTitle } from "../shared/DetailTitle";
import { DetailPanelLayout } from "../shared/DetailPanelLayout";
import { CARD, FieldBlock, PANEL_TRIGGER, PanelHeader, PanelTrigger } from "../shared/DetailPanelSections";
import { Swatches } from "../shared/Swatches";
import { EmojiMarkButton } from "../shared/EmojiMarkButton";
import { PersonalEventDetailsFields } from "./PersonalEventDetailsFields";

export function PersonalEventEditor({ event, onChange, onClose, onDelete, detailMode = "peek", onDetailModeChange }: {
    event: PersonalEvent;
    onChange: (patch: Partial<Omit<PersonalEvent, "id">>) => void;
    onClose: () => void;
    onDelete: () => void;
    detailMode?: "peek" | "focus";
    onDetailModeChange?: (mode: "peek" | "focus") => void;
}) {
    const [detailsOpen, setDetailsOpen] = useState(false);
    const nextDate = getNextPersonalEventDate(event);
    const summary = toPersonalEventViewModel(event, new Date());

    return (
        <div className="h-full min-w-0 overflow-hidden" role="complementary" aria-label="Event details" style={eventToneStyle(event.color)}>
            <DetailPanelLayout title="Event" mode={detailMode} onModeChange={onDetailModeChange} onClose={onClose} closeLabel="Close event details" leading={<CalendarHeart size={20} className="text-[var(--event-ink)] transition-colors duration-300" aria-hidden="true" />}>
                <DetailTitle value={event.label} label="Event title" maxLength={80} onSave={(label) => onChange({ label })} />
                <div className={`${CARD} flex items-center gap-3 px-4 py-3`}>
                    <EmojiMarkButton emoji={event.emoji ?? null} onChange={(emoji) => onChange({ emoji })} fallback={<CalendarHeart size={20} className="text-[var(--event-ink)] transition-colors duration-300" aria-hidden="true" />} />
                    <div className="min-w-0">
                        <p className="text-sm text-twilight-text">{summary.countdownLabel}</p>
                        <p className="text-xs text-twilight-text-muted">{summary.milestoneLabel ?? "Repeats every year"}</p>
                    </div>
                </div>
                {detailsOpen ? (
                    <section className={`${CARD} space-y-4 px-4 py-3`}>
                        <PanelHeader title="Details" onDone={() => setDetailsOpen(false)} />
                        <PersonalEventDetailsFields
                            eventDate={nextDate} setEventDate={(date) => onChange({ monthDay: date.slice(5) })}
                            trackMilestone={Boolean(event.startedOn)} setTrackMilestone={(enabled) => onChange({ startedOn: enabled ? nextDate : null })}
                            startedOn={event.startedOn ?? nextDate} setStartedOn={(date) => onChange({ startedOn: date })}
                            notify={event.notify} setNotify={(notify) => onChange({ notify })}
                        />
                    </section>
                ) : <PanelTrigger icon={SlidersHorizontal} title="Details" summary={`${summary.monthDayLabel} · Reminder ${event.notify ? "on" : "off"}`} onOpen={() => setDetailsOpen(true)} />}
                <section className={`${CARD} px-4 py-3`}>
                    <FieldBlock icon={Palette} label="Colour">
                        <Swatches options={EVENT_SWATCHES} value={eventToneColor(event.color) ? event.color! : ""} onChange={(color) => onChange({ color: color || null })} />
                    </FieldBlock>
                </section>
                <Button variant="ghost" size="none" type="button" onClick={onDelete} className={`${PANEL_TRIGGER} shrink-0 font-normal text-feedback-error`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-feedback-error/10"><Trash2 size={16} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">Delete event</span>
                        <span className="block text-xs text-twilight-text-muted">Remove this event from every year.</span>
                    </span>
                </Button>
            </DetailPanelLayout>
        </div>
    );
}
