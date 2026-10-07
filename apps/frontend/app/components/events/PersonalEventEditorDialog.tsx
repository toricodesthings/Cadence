import { useEffect, useRef, useState } from "react";
import { CalendarHeart } from "lucide-react";
import { Composer, ComposerSubmit, ComposerTitle, type ComposerDraft } from "../shared/Composer";
import { EmojiMarkButton } from "../shared/EmojiMarkButton";
import { ColourDot } from "../shared/ColourDot";
import { PersonalEventDetailsFields } from "./PersonalEventDetailsFields";
import type { PersonalEvent } from "../../types/settings";
import { today } from "../../lib/utils/user-zone";
import { useNlpParse } from "../../hooks/use-nlp-parse";
import { useSettings } from "../../hooks/core/use-settings";
import { useCreateInboxItem } from "../../hooks/inbox/use-create-inbox-item";
import type { DraftField } from "@cadence/domain/nlp-draft";
import { DraftRow } from "../tasks/DraftRow";
import { EVENT_SWATCHES, eventToneStyle } from "../../lib/utils/personal-events";

/** A yearly event stores a month and day: nothing else a title can say. */
const EVENT_FIELDS: ReadonlySet<DraftField> = new Set<DraftField>(["dueDate"]);

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
    const startDate = initialDate ?? today();
    const titleRef = useRef<HTMLInputElement>(null);
    const [label, setLabel] = useState("");
    const [emoji, setEmoji] = useState("");
    const [color, setColor] = useState("");
    const [eventDate, setEventDate] = useState(startDate);
    const [trackMilestone, setTrackMilestone] = useState(false);
    const [startedOn, setStartedOn] = useState(startDate);
    const [notify, setNotify] = useState(true);
    const [dateTouched, setDateTouched] = useState(false);
    const [dismissed, setDismissed] = useState<string[]>([]);
    const [accepted, setAccepted] = useState<string[]>([]);
    const [literal, setLiteral] = useState(false);
    const { data: settings } = useSettings();
    const saveThought = useCreateInboxItem();
    const intelligence = settings?.tasks?.intelligence;
    const nlp = useNlpParse({
        input: label,
        projects: [],
        tags: [],
        dismissedEntityIds: dismissed,
        acceptedEntityIds: accepted,
        literal,
        manual: dateTouched ? { dueDate: eventDate } : undefined,
        capabilities: EVENT_FIELDS,
        monthDayOnly: true,
        sourceSurface: "quick_add",
        dateStyle: settings?.dateTime?.dateStyle ?? "mdy",
        confidenceThreshold: intelligence?.confidenceThreshold ?? "medium",
        enabled: open && intelligence?.nlpEnabled !== false,
    });
    // A time or a year can't live on a yearly event: the words stay, we say so, and nothing falls back to today.
    const unfit = literal ? undefined : nlp.unfit[0];
    const shownDate = dateTouched ? eventDate : (nlp.fields.dueDate ?? eventDate);

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
        setDateTouched(false);
        setDismissed([]);
        setAccepted([]);
        setLiteral(false);
    };

    const handleSubmit = async () => {
        if (!label.trim() || unfit) return;
        // Enter saves what is on screen; only a still-loading parser makes it wait, then re-reads the same text.
        const draft = nlp.ready ? nlp : await nlp.finalize();
        const trimmedLabel = (draft.cleanedTitle || label).trim().slice(0, 80);
        const day = dateTouched ? eventDate : (draft.fields.dueDate ?? eventDate);
        if (!trimmedLabel || !day) return;
        onSubmit({
            label: trimmedLabel,
            emoji: emoji.trim() || null,
            monthDay: day.slice(5),
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
        isDirty: Boolean(label.trim() || emoji.trim() || color || dateTouched || eventDate !== startDate || trackMilestone || startedOn !== startDate || !notify),
        discardTitle: "Discard this event?",
        footer: <ComposerSubmit onSubmit={() => void handleSubmit()} submitLabel={submitLabel} icon={CalendarHeart} tone="schedule" disabled={!label.trim() || Boolean(unfit)} />,
        reset,
        titleRef,
        children: (
            <>
                <ComposerTitle
                    inputRef={titleRef}
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) void handleSubmit(); }}
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

                {unfit ? (
                    <div role="status" className="space-y-2 rounded-xl border border-twilight-border/45 px-3 py-2 text-sm text-twilight-text-soft">
                        <p>Yearly events repeat on a day, so "{unfit.sourceText}" can't be saved here. Pick the day below, or keep your words as a thought.</p>
                        <button
                            type="button"
                            className="min-h-9 cursor-pointer rounded-lg px-2 font-medium text-accent-primary"
                            onClick={() => { saveThought.mutate({ id: crypto.randomUUID(), rawText: label.trim() }); reset(); }}
                        >
                            Save as thought
                        </button>
                    </div>
                ) : null}
                <DraftRow
                    applied={nlp.applied}
                    suggestions={nlp.suggestions}
                    shownElsewhere={["due_date", "scheduled_start"]}
                    literal={literal}
                    onDismiss={(id) => setDismissed((current) => [...current, id])}
                    onAccept={(id) => setAccepted((current) => [...current, id])}
                    onLiteral={setLiteral}
                />

                <PersonalEventDetailsFields
                    eventDate={shownDate} setEventDate={(day) => { setEventDate(day); setDateTouched(true); }}
                    trackMilestone={trackMilestone} setTrackMilestone={setTrackMilestone}
                    startedOn={startedOn} setStartedOn={setStartedOn}
                    notify={notify} setNotify={setNotify}
                />
            </>
        ),
    };
}
