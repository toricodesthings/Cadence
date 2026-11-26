import { useState } from "react";
import type { DraftFields } from "@cadence/domain/nlp-draft";
import {
    addMinutesToTime,
    blockEnd,
    dayOfInstant,
    fromTimeValue,
    minutesBetweenTimes,
    toTimeValue,
} from "../lib/utils/date-format";
import type { NlpParseOutput } from "./use-nlp-parse";

export interface WhenFields {
    date: string;
    allDay: boolean;
    start: string;
    end: string;
}

type TypedNlp = Pick<NlpParseOutput, "scheduledStart" | "scheduledEnd" | "dueDate" | "durationMinutes">;

export function whenToManual(when: WhenFields): Pick<DraftFields, "dueDate" | "scheduledStart" | "scheduledEnd"> {
    if (!when.date) return { dueDate: null, scheduledStart: null, scheduledEnd: null };
    if (when.allDay) return { dueDate: when.date, scheduledStart: null, scheduledEnd: null };
    const start = fromTimeValue(when.date, when.start);
    return { dueDate: null, scheduledStart: start, scheduledEnd: blockEnd(when.date, start, when.end) };
}

export function useTypedWhen(initial: WhenFields, follow = true) {
    const [fields, setFields] = useState(initial);
    const [touched, setTouched] = useState(false);

    return {
        touched,
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
                    end: nlp.scheduledEnd
                        ? toTimeValue(nlp.scheduledEnd)
                        : addMinutesToTime(start, nlp.durationMinutes ?? minutesBetweenTimes(fields.start, fields.end)),
                };
            } else if (parsedDate) {
                when = { ...fields, date: parsedDate };
            }

            return {
                when,
                parsed: Boolean(parsedStart || parsedDate),
                touched,
                edit: (patch: Partial<WhenFields>) => {
                    const next = { ...when, ...patch };
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
