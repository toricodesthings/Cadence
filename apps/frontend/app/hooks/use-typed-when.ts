import { useState } from "react";
import { addMinutesToTime, minutesBetweenTimes, dayOfInstant, toTimeValue } from "../lib/utils/date-format";
import type { NlpParseOutput } from "./use-nlp-parse";

export interface WhenFields {
    /** A LocalDate, or "" for none. */
    date: string;
    allDay: boolean;
    /** "HH:mm". */
    start: string;
    end: string;
}

/**
 * The date and time fields of a composer whose title is parsed: a typed day or
 * time ("Lunch Fri 1pm") fills them until the user edits one, then they're theirs.
 */
export function useTypedWhen(nlp: Pick<NlpParseOutput, "scheduledStart" | "dueDate" | "durationMinutes">, initial: WhenFields, follow = true) {
    const [fields, setFields] = useState(initial);
    const [touched, setTouched] = useState(false);
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
            end: addMinutesToTime(start, nlp.durationMinutes ?? minutesBetweenTimes(fields.start, fields.end)),
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
}
