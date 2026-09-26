import { useEffect, useRef, useState } from "react";
import { CalendarHeart } from "lucide-react";
import { Composer, ComposerSubmit, ComposerTitle, type ComposerDraft } from "../shared/Composer";
import { EmojiMarkButton } from "../shared/EmojiMarkButton";
import { ColourDot } from "../shared/ColourDot";
import { PersonalEventDetailsFields } from "./PersonalEventDetailsFields";
import type { PersonalEvent } from "../../types/settings";
import { toISODate } from "../../lib/utils/date-format";
import { EVENT_SWATCHES, eventToneStyle } from "../../lib/utils/personal-events";

interface PersonalEventEditorDialogProps {
    open: boolean;
    title?: string;
    description?: string;
    submitLabel?: string;
    onClose: () => void;
    onSubmit: (value: Omit<PersonalEvent, "id">) => void;
}

/** A new personal event, alone in the composer. */
export function PersonalEventEditorDialog({ open, title, description, submitLabel, onClose, onSubmit }: PersonalEventEditorDialogProps) {
    const { reset, ...draft } = usePersonalEventComposer({ open, submitLabel, onSubmit });
    return (
        <Composer
            open={open}
            onClose={() => { reset(); onClose(); }}
            {...draft}
            title={title ?? draft.title}
            subtitle={description ?? draft.subtitle}
        />
    );
}

/** The personal event composer: name, mark and colour, date, milestone, reminder. */
export function usePersonalEventComposer({
    open,
    initialDate,
    autoFocus = true,
    submitLabel = "Add event",
    onSubmit,
}: {
    open: boolean;
    /** "YYYY-MM-DD"; today when unset. */
    initialDate?: string;
    /** Off when the host moves focus itself (a tab switch). */
    autoFocus?: boolean;
    submitLabel?: string;
    onSubmit: (value: Omit<PersonalEvent, "id">) => void;
}): ComposerDraft & { titleRef: React.RefObject<HTMLInputElement | null> } {
    const startDate = initialDate ?? toISODate(new Date());
    const titleRef = useRef<HTMLInputElement>(null);
    const [label, setLabel] = useState("");
    const [emoji, setEmoji] = useState("");
    const [color, setColor] = useState("");
    const [eventDate, setEventDate] = useState(startDate);
    const [trackMilestone, setTrackMilestone] = useState(false);
    const [startedOn, setStartedOn] = useState(startDate);
    const [notify, setNotify] = useState(true);

    useEffect(() => {
        if (!open || !autoFocus) return;
        const id = requestAnimationFrame(() => titleRef.current?.focus());
        return () => cancelAnimationFrame(id);
    }, [open, autoFocus]);

    const reset = () => {
        setLabel("");
        setEmoji("");
        setColor("");
        setEventDate(startDate);
        setTrackMilestone(false);
        setStartedOn(startDate);
        setNotify(true);
    };

    const handleSubmit = () => {
        const trimmedLabel = label.trim();
        if (!trimmedLabel || !eventDate) return;
        onSubmit({
            label: trimmedLabel,
            emoji: emoji.trim() || null,
            monthDay: eventDate.slice(5),
            notify,
            startedOn: trackMilestone ? startedOn : null,
            color: color || null,
        });
        reset();
    };

    return {
        title: "Add event",
        icon: CalendarHeart,
        tone: "schedule",
        subtitle: "Yearly personal event",
        isDirty: Boolean(label.trim() || emoji.trim() || color || eventDate !== startDate || trackMilestone || startedOn !== startDate || !notify),
        discardTitle: "Discard this event?",
        footer: <ComposerSubmit onSubmit={handleSubmit} submitLabel={submitLabel} icon={CalendarHeart} tone="schedule" disabled={!label.trim()} />,
        reset,
        titleRef,
        children: (
            <>
                <ComposerTitle
                    inputRef={titleRef}
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") handleSubmit(); }}
                    placeholder="Mom's birthday, retreat, launch day…"
                    maxLength={80}
                    aria-label="Event name"
                    enterKeyHint="done"
                    leading={(
                        <span className="flex items-center" style={eventToneStyle(color)}>
                            <EmojiMarkButton emoji={emoji || null} onChange={(next) => setEmoji(next ?? "")} fallback={<CalendarHeart size={18} className="text-[var(--event-ink)] transition-colors duration-300" aria-hidden="true" />} />
                            <ColourDot options={EVENT_SWATCHES} value={color} onChange={setColor} label="Event colour" />
                        </span>
                    )}
                />

                <PersonalEventDetailsFields
                    eventDate={eventDate} setEventDate={setEventDate}
                    trackMilestone={trackMilestone} setTrackMilestone={setTrackMilestone}
                    startedOn={startedOn} setStartedOn={setStartedOn}
                    notify={notify} setNotify={setNotify}
                />
            </>
        ),
    };
}
