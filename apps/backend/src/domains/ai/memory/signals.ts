/**
 * Full: what the person did themselves, and the patterns and durations that follow from it.
 *
 * Signals are written only for changes made in the app by the person (the route says so: the assistant,
 * MCP and imports never count), and only while the mode is Full. Patterns are computed from them, and
 * durations from the person's answers (`duration_reports`), deterministically in the nightly pass, with no
 * model call. Pure functions here, so the rules are testable without a database.
 */
import { addDays, dayOf, formatInZone, type LocalDate, type Zone } from "@cadence/domain/time";
import { timeOfDay, type TimeOfDay } from "@cadence/domain/find-time";
import { estimateDuration, type DurationEvidence } from "@cadence/nlp/duration";
import { STOP } from "@cadence/nlp/effort";

/** The window patterns are read over, and how long signals are kept. */
export const PATTERN_WINDOW_DAYS = 28;
export const SIGNAL_RETENTION_DAYS = 90;
/** At least this many events, on at least this many days, with this share in one bucket, or nothing is claimed. */
const MIN_EVENTS = 5;
const MIN_DAYS = 3;
const MIN_SHARE = 0.7;

export { timeOfDay, type TimeOfDay };

const weekdayOf = (day: LocalDate) => formatInZone(day, "UTC", { weekday: "long" }, "en-US").toLowerCase();
const hourIn = (instant: string, zone: Zone) => Number(formatInZone(instant, zone, { hour: "numeric", hourCycle: "h23" }, "en-US"));

/** "tuesday|early": the slot something was planned in (an all-day task has no time: "tuesday|day"). */
export function slotBucket(slot: { scheduledStart: string | null; dueDate: string | null }, zone: Zone): string | null {
    if (slot.scheduledStart) {
        return `${weekdayOf(dayOf(slot.scheduledStart, zone))}|${timeOfDay(hourIn(slot.scheduledStart, zone))}`;
    }
    return slot.dueDate ? `${weekdayOf(slot.dueDate)}|day` : null;
}

/** "evening" for a completion instant. */
export const completionBucket = (instant: string, zone: Zone): string => timeOfDay(hourIn(instant, zone));

export interface SignalRow {
    kind: "reschedule" | "complete" | "routine";
    on: LocalDate;
    bucket: string;
    subject: string | null;
}

export interface DerivedFact {
    kind: "pattern" | "duration";
    /** What the fact is about, without its counts: the same pattern keeps one row as its numbers move, and a forgotten one stays forgotten. */
    key: string;
    content: string;
    value: Record<string, unknown>;
}

const PHRASE: Record<string, string> = {
    early: "early in the morning",
    morning: "in the morning",
    afternoon: "in the afternoon",
    evening: "in the evening",
    late: "late at night",
    day: "",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Patterns over the last 28 days. A pattern needs real repetition; below the rule nothing is claimed. */
export function derivePatterns(rows: SignalRow[], today: LocalDate): DerivedFact[] {
    const from = addDays(today, -(PATTERN_WINDOW_DAYS - 1));
    const inWindow = rows.filter((r) => r.on >= from && r.on <= today);
    const groups = new Map<string, SignalRow[]>();
    for (const row of inWindow) {
        // A routine's pattern is per routine; the others are one pattern each over all the person's changes.
        const key = row.kind === "routine" ? `routine|${row.subject}` : row.kind;
        groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    const out: DerivedFact[] = [];
    for (const [groupKey, group] of groups) {
        if (group.length < MIN_EVENTS || new Set(group.map((r) => r.on)).size < MIN_DAYS) continue;
        const counts = new Map<string, number>();
        for (const row of group) counts.set(row.bucket, (counts.get(row.bucket) ?? 0) + 1);
        const [bucket, n] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
        if (n / group.length < MIN_SHARE) continue;

        const kind = group[0].kind;
        const [weekday, slot] = bucket.split("|");
        const tally = `${n} of ${group.length}`;
        const subject = (group[0].subject ?? "").slice(0, 40);
        const content =
            kind === "reschedule"
                ? `Plans set for ${cap(weekday)}${slot === "day" ? "" : ` ${PHRASE[slot]}`} often get moved (${tally} recent changes)`
                : kind === "complete"
                  ? `Tends to finish things ${PHRASE[weekday]} (${tally} in the last 4 weeks)`
                  : `Usually does ${subject} on ${cap(weekday)}s (${tally} times in the last 4 weeks)`;
        out.push({
            kind: "pattern",
            key: `pattern|${groupKey}|${bucket}`,
            content,
            value: { signal: kind, bucket, numerator: n, denominator: group.length, from, to: today },
        });
    }
    return out;
}

/** One answer to "how long did it take?" with the group it belongs to (`duration_reports`). */
export interface ReportRow extends DurationEvidence {
    group: string;
}

/** "Lab report usually takes about 45 minutes (based on 6 of your answers)": one fact per group the estimator is sure of. */
export function deriveDurations(rows: readonly ReportRow[], today: LocalDate): DerivedFact[] {
    const byGroup = new Map<string, ReportRow[]>();
    for (const row of rows) byGroup.set(row.group, [...(byGroup.get(row.group) ?? []), row]);
    const out: DerivedFact[] = [];
    for (const [group, answers] of byGroup) {
        const newest = [...answers].sort((a, b) => b.day.localeCompare(a.day))[0];
        const guess = estimateDuration({ taskId: newest.series ? newest.taskId : null, title: newest.title, projectId: null }, answers, today);
        if (guess?.state !== "supported") continue;
        out.push({
            kind: "duration",
            key: `duration|${group}`,
            content: `${cap(newest.series ? newest.title : group)} usually takes about ${guess.minutes} minutes (based on ${guess.reports} of your answers)`,
            value: { group, medianMinutes: guess.minutes, n: guess.reports },
        });
    }
    return out;
}

/** Where a title stops being the thing and starts being its context: "Email Sam re: invoice", "Read - ch. 3", "Gym (legs)". */
const CONTEXT_CUT = /\bre:|\s-\s|:|\(/;

/**
 * The normalized "group" a one-off task belongs to for durations: its first 3 meaningful words, lower case,
 * with filler words and 1-2 digit numbers dropped ("Lab 3" is "Lab 4") but course-like numbers kept
 * ("STAT 3503" is not "STAT 2509").
 */
export function durationGroup(title: string): string {
    const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
    const meaningful = words(title.split(CONTEXT_CUT)[0]).filter((w) => !STOP.has(w) && !/^\d{1,2}$/.test(w));
    // A title that is all context or filler ("Re: invoice", "The 3") still gets a group: its plain words.
    return meaningful.length ? meaningful.slice(0, 3).join(" ") : words(title).slice(0, 4).join(" ");
}

/** A repeating task is one row that returns, so its reports group by the row; anything else by its title. */
export const groupOfTask = (task: { id: string; title: string; recurrenceRule: string | null }): string =>
    task.recurrenceRule ? `series:${task.id}` : durationGroup(task.title);

/** The 90-day cut for pruning. */
export const retentionCutoff = (today: LocalDate): LocalDate => addDays(today, -SIGNAL_RETENTION_DAYS);
