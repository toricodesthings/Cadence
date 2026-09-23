import { useState } from "react";
import { addMinutesToTime, minutesBetweenTimes, toISODate, toTimeValue } from "../lib/utils/date-format";
import type { NlpParseOutput } from "./use-nlp-parse";

export interface WhenFields {
    /** "YYYY-MM-DD", or "" for none. */
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
    const parsedDate = live && nlp.dueDate ? nlp.dueDate.slice(0, 10) : null;

    let when = fields;
    if (parsedStart) {
        const start = toTimeValue(parsedStart);
        when = {
            date: toISODate(new Date(parsedStart)),
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
            setFields({ ...when, ...patch });
            setTouched(true);
        },
        reset: () => {
            setFields(initial);
            setTouched(false);
        },
    };
}
