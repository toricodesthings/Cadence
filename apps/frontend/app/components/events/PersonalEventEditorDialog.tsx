import { newRowId } from "../../lib/api/optimistic-id";
import { useEffect, useRef, useState } from "react";
import { CalendarHeart } from "lucide-react";
import { Composer, ComposerTitle, type ComposerDraft } from "../shared/Composer";
import { EmojiMarkButton } from "../shared/EmojiMarkButton";
import { ColourDot } from "../shared/ColourDot";
import { PersonalEventDetailsFields } from "./PersonalEventDetailsFields";
import type { PersonalEvent } from "@cadence/contracts/personal-event";
import { today } from "../../lib/utils/user-zone";
import { useNlpParse } from "../../hooks/use-nlp-parse";
import { useSettings } from "../../hooks/core/use-settings";
import { useCreateInboxItem } from "../../hooks/inbox/use-create-inbox-item";
import type { DraftField } from "@cadence/domain/nlp-draft";
import { DraftRow, useDraftChoices } from "../tasks/DraftRow";
import { EVENT_SWATCHES, eventToneStyle } from "../../lib/utils/personal-events";

const EVENT_FIELDS: ReadonlySet<DraftField> = new Set<DraftField>(["dueDate"]);

interface PersonalEventEditorDialogProps {
    open: boolean;
    title?: string;
    description?: string;
    submitLabel?: string;
    onClose: () => void;
    onSubmit: (value: Omit<PersonalEvent, "id">) => void;
}

export function PersonalEventEditorDialog({
    open,
    title,
    description,
    submitLabel,
    onClose,
    onSubmit,
}: PersonalEventEditorDialogProps) {
    const draft = usePersonalEventComposer({ open, submitLabel, onSubmit });
    const close = () => {
        draft.reset();
        onClose();
    };
    return (
        <Composer
            open={open}
            onClose={close}
            title={title ?? draft.title}
            icon={draft.icon}
            tone={draft.tone}
            subtitle={description ?? draft.subtitle}
            isDirty={draft.isDirty}
            discardTitle={draft.discardTitle}
            submit={draft.submit}
        >
            {draft.children}
        </Composer>
    );
}

function useEventWords(label: string, open: boolean, pickedDay: string | null) {
    const choices = useDraftChoices();
    const { dismissed, accepted, literal } = choices;
    const { data: settings } = useSettings();
    const intelligence = settings?.tasks?.intelligence;
    const nlp = useNlpParse({
        input: label,
        projects: [],
        tags: [],
        dismissedEntityIds: dismissed,
        acceptedEntityIds: accepted,
        literal,
        manual: pickedDay ? { dueDate: pickedDay } : undefined,
        capabilities: EVENT_FIELDS,
        monthDayOnly: true,
        sourceSurface: "quick_add",
        dateStyle: settings?.dateTime?.dateStyle ?? "mdy",
        enabled: open && intelligence?.nlpEnabled !== false,
    });
    return { nlp, choices };
}

type EventTiming = { eventDate: string; trackMilestone: boolean; startedOn: string; notify: boolean };

function isMovedFrom(startDate: string, draft: EventTiming) {
    return draft.eventDate !== startDate || draft.trackMilestone || draft.startedOn !== startDate || !draft.notify;
}

type UnfitNoticeProps = { words: string; onKeep: () => void };

function UnfitNotice({ words, onKeep }: UnfitNoticeProps) {
    return (
        <div
            role="status"
            className="space-y-2 rounded-xl border border-twilight-border/45 px-3 py-2 text-sm text-twilight-text-soft"
        >
            <p>
                Yearly events repeat on a day, so "{words}" can't be saved here. Pick the day below, or keep your words
                as a thought.
            </p>
            <button
                type="button"
                className="min-h-9 cursor-pointer rounded-lg px-2 font-medium text-accent-primary"
                onClick={onKeep}
            >
                Save as thought
            </button>
        </div>
    );
}

type EventTitleRowProps = {
    titleRef: React.RefObject<HTMLInputElement | null>;
    label: string;
    setLabel: (label: string) => void;
    onEnter: () => void;
    emoji: string;
    setEmoji: (emoji: string) => void;
    color: string;
    setColor: (color: string) => void;
};

function EventTitleRow({ titleRef, label, setLabel, onEnter, emoji, setEmoji, color, setColor }: EventTitleRowProps) {
    return (
        <ComposerTitle
            inputRef={titleRef}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) onEnter();
            }}
            placeholder="Mom's birthday, retreat, launch day…"
            maxLength={80}
            aria-label="Event name"
            enterKeyHint="done"
            leading={
                <span className="flex items-center" style={eventToneStyle(color)}>
                    <EmojiMarkButton
                        emoji={emoji || null}
                        onChange={(next) => setEmoji(next ?? "")}
                        fallback={
                            <CalendarHeart
                                size={18}
                                className="text-[var(--event-ink)] transition-colors duration-300"
                                aria-hidden="true"
                            />
                        }
                    />
                    <ColourDot options={EVENT_SWATCHES} value={color} onChange={setColor} label="Event colour" />
                </span>
            }
        />
    );
}

type PersonalEventComposerOptions = {
    open: boolean;
    initialDate?: string;
    autoFocus?: boolean;
    submitLabel?: string;
    onSubmit: (value: Omit<PersonalEvent, "id">) => void;
};

type PersonalEventComposer = ComposerDraft & { titleRef: React.RefObject<HTMLInputElement | null> };

export function usePersonalEventComposer({
    open,
    initialDate,
    autoFocus = true,
    submitLabel = "Add event",
    onSubmit,
}: PersonalEventComposerOptions): PersonalEventComposer {
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
    const { nlp, choices } = useEventWords(label, open, dateTouched ? eventDate : null);
    const { literal } = choices;
    const saveThought = useCreateInboxItem();
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
        choices.reset();
    };

    const handleSubmit = async () => {
        if (!label.trim() || unfit) return;
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
        isDirty:
            Boolean(label.trim() || emoji.trim() || color || dateTouched) ||
            isMovedFrom(startDate, { eventDate, trackMilestone, startedOn, notify }),
        discardTitle: "Discard this event?",
        submit: {
            onSubmit: () => void handleSubmit(),
            submitLabel,
            icon: CalendarHeart,
            tone: "schedule",
            disabled: !label.trim() || Boolean(unfit),
        },
        reset,
        titleRef,
        children: (
            <>
                <EventTitleRow
                    titleRef={titleRef}
                    label={label}
                    setLabel={setLabel}
                    onEnter={() => void handleSubmit()}
                    emoji={emoji}
                    setEmoji={setEmoji}
                    color={color}
                    setColor={setColor}
                />

                {unfit ? (
                    <UnfitNotice
                        words={unfit.sourceText}
                        onKeep={() => {
                            saveThought.mutate({ id: newRowId(), rawText: label.trim() });
                            reset();
                        }}
                    />
                ) : null}
                <DraftRow
                    applied={nlp.applied}
                    suggestions={nlp.suggestions}
                    shownElsewhere={["due_date", "scheduled_start"]}
                    {...choices.row}
                />

                <PersonalEventDetailsFields
                    eventDate={shownDate}
                    setEventDate={(day) => {
                        setEventDate(day);
                        setDateTouched(true);
                    }}
                    trackMilestone={trackMilestone}
                    setTrackMilestone={setTrackMilestone}
                    startedOn={startedOn}
                    setStartedOn={setStartedOn}
                    notify={notify}
                    setNotify={setNotify}
                />
            </>
        ),
    };
}
