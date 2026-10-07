import { useState } from "react";
import type { DraftFields } from "@cadence/domain/nlp-draft";
import { addMinutesToTime, blockEnd, dayOfInstant, fromTimeValue, minutesBetweenTimes, toTimeValue } from "../lib/utils/date-format";
import type { NlpParseOutput } from "./use-nlp-parse";

export interface WhenFields {
    /** A LocalDate, or "" for none. */
    date: string;
    allDay: boolean;
    /** "HH:mm". */
    start: string;
    end: string;
}

type TypedNlp = Pick<NlpParseOutput, "scheduledStart" | "scheduledEnd" | "dueDate" | "durationMinutes">;

/** The when a hand-edited field set means, as draft fields (a present key wins, even "none"). */
export function whenToManual(when: WhenFields): Pick<DraftFields, "dueDate" | "scheduledStart" | "scheduledEnd"> {
    if (!when.date) return { dueDate: null, scheduledStart: null, scheduledEnd: null };
    if (when.allDay) return { dueDate: when.date, scheduledStart: null, scheduledEnd: null };
    const start = fromTimeValue(when.date, when.start);
    return { dueDate: null, scheduledStart: start, scheduledEnd: blockEnd(when.date, start, when.end) };
}

/**
 * The date and time fields of a composer whose title is parsed: a typed day or time ("Lunch Fri 1pm")
 * fills them until the user edits one, then they're theirs. Call it first, pass `manual` to the parse,
 * then `bind` the parse result: the edit state never depends on the parse, so the two don't loop.
 */
export function useTypedWhen(initial: WhenFields, follow = true) {
    const [fields, setFields] = useState(initial);
    const [touched, setTouched] = useState(false);

    return {
        touched,
        /** Hand-set when, for the parse's `manual` (undefined until an edit). */
        manual: touched ? whenToManual(fields) : undefined,
        bind(nlp: TypedNlp) {
            const live = follow && !touched;
            const parsedStart = live && nlp.scheduledStart ? nlp.scheduledStart : null;
            const parsedDate = live && nlp.dueDate ? nlp.dueDate : null;

            let when = fields;
            if (parsedStart) {
                const start = toTimeValue(parsedStart);
                when = {
                    date: dayOfInstant(parsedStart),
                    allDay: false,
                    start,
                    // A typed end ("2pm to 3pm") beats the estimate, which beats the block's usual length.
                    end: nlp.scheduledEnd
                        ? toTimeValue(nlp.scheduledEnd)
                        : addMinutesToTime(start, nlp.durationMinutes ?? minutesBetweenTimes(fields.start, fields.end)),
                };
            } else if (parsedDate) {
                when = { ...fields, date: parsedDate };
            }

            return {
                when,
                /** A typed day or time is currently driving the fields. */
                parsed: Boolean(parsedStart || parsedDate),
                touched,
                /** Takes over the shown values, then applies the edit. */
                edit: (patch: Partial<WhenFields>) => {
                    const next = { ...when, ...patch };
                    // A zero-length block would save as 24h (end ≤ start rolls over), so push the end an hour out.
                    if (next.start && next.start === next.end) next.end = addMinutesToTime(next.start, 60);
                    setFields(next);
                    setTouched(true);
                },
                reset: () => {
                    setFields(initial);
                    setTouched(false);
                },
            };
        },
    };
}
