/**
 * Full: what the person did themselves, and the patterns and durations that follow from it.
 *
 * Signals are written only for changes made in the app by the person (the route says so: the assistant,
 * MCP and imports never count), and only while the mode is Full. Patterns and durations are computed
 * from them deterministically in the nightly pass, with no model call. Pure functions here, so the
 * rules are testable without a database.
 */
import { addDays, dayOf, formatInZone, type LocalDate, type Zone } from "@cadence/domain/time";

/** The window patterns are read over, and how long signals are kept. */
export const PATTERN_WINDOW_DAYS = 28;
export const SIGNAL_RETENTION_DAYS = 90;
/** At least this many events, on at least this many days, with this share in one bucket, or nothing is claimed. */
const MIN_EVENTS = 5;
const MIN_DAYS = 3;
const MIN_SHARE = 0.7;
/** A typical duration needs this many reports. */
const MIN_REPORTS = 3;

export type TimeOfDay = "early" | "morning" | "afternoon" | "evening" | "late";

export function timeOfDay(hour: number): TimeOfDay {
    if (hour < 9) return "early";
    if (hour < 12) return "morning";
    if (hour < 17) return "afternoon";
    if (hour < 21) return "evening";
    return "late";
}

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
    kind: "reschedule" | "complete" | "routine" | "duration";
    on: LocalDate;
    bucket: string;
    subject: string | null;
    minutes: number | null;
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
    const inWindow = rows.filter((r) => r.kind !== "duration" && r.on >= from && r.on <= today);
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

/** The median of 3 or more reports per group: "usually about 50 minutes (6 times)". */
export function deriveDurations(rows: SignalRow[]): DerivedFact[] {
    const byGroup = new Map<string, number[]>();
    for (const row of rows) {
        if (row.kind !== "duration" || !row.subject || !row.minutes) continue;
        byGroup.set(row.subject, [...(byGroup.get(row.subject) ?? []), row.minutes]);
    }
    const out: DerivedFact[] = [];
    for (const [group, minutes] of byGroup) {
        if (minutes.length < MIN_REPORTS) continue;
        const sorted = [...minutes].sort((a, b) => a - b);
        const mid = sorted.length >> 1;
        const median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
        out.push({
            kind: "duration",
            key: `duration|${group}`,
            content: `${cap(group)} usually takes about ${median} minutes (${minutes.length} times)`,
            value: { group, medianMinutes: median, n: minutes.length },
        });
    }
    return out;
}

/** The normalized "group" a task belongs to for durations: lowercase words of its title, trimmed to a short key. */
export function durationGroup(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .split(" ")
        .slice(0, 4)
        .join(" ");
}

/** The 90-day cut for pruning. */
export const retentionCutoff = (today: LocalDate): LocalDate => addDays(today, -SIGNAL_RETENTION_DAYS);
