import { addDays, daysBetween, dayOf, formatInZone, type LocalDate, type Zone } from "@cadence/domain/time";
import { timeOfDay, type TimeOfDay } from "@cadence/domain/find-time";
import { estimateDuration, type DurationEvidence } from "@cadence/nlp/duration";
import { STOP } from "@cadence/nlp/effort";

export const PATTERN_WINDOW_DAYS = 28;
export const SIGNAL_RETENTION_DAYS = 90;
const MIN_EVENTS = 5;
const MIN_DAYS = 3;
const MIN_WEEKS = 2;
const MIN_SHARE = 0.7;

export { timeOfDay, type TimeOfDay };

const weekOf = (day: LocalDate) => Math.floor(daysBetween("1970-01-05", day) / 7);
const weekdayOf = (day: LocalDate) => formatInZone(day, "UTC", { weekday: "long" }, "en-US").toLowerCase();
const hourIn = (instant: string, zone: Zone) =>
    Number(formatInZone(instant, zone, { hour: "numeric", hourCycle: "h23" }, "en-US"));

export function slotBucket(slot: { scheduledStart: string | null; dueDate: string | null }, zone: Zone): string | null {
    if (slot.scheduledStart) {
        return `${weekdayOf(dayOf(slot.scheduledStart, zone))}|${timeOfDay(hourIn(slot.scheduledStart, zone))}`;
    }
    return slot.dueDate ? `${weekdayOf(slot.dueDate)}|day` : null;
}

export const completionBucket = (instant: string, zone: Zone): string => timeOfDay(hourIn(instant, zone));

export interface SignalRow {
    kind: "reschedule" | "complete" | "routine";
    on: LocalDate;
    bucket: string;
    subject: string | null;
}

export interface DerivedFact {
    kind: "pattern" | "duration";
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

export function derivePatterns(rows: SignalRow[], today: LocalDate): DerivedFact[] {
    const from = addDays(today, -(PATTERN_WINDOW_DAYS - 1));
    const inWindow = rows.filter((r) => r.on >= from && r.on <= today);
    const groups = new Map<string, SignalRow[]>();
    for (const row of inWindow) {
        const key = row.kind === "routine" ? `routine|${row.subject}` : row.kind;
        groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    const out: DerivedFact[] = [];
    for (const [groupKey, group] of groups) {
        if (group.length < MIN_EVENTS || new Set(group.map((r) => r.on)).size < MIN_DAYS) continue;
        if (new Set(group.map((r) => weekOf(r.on))).size < MIN_WEEKS) continue;
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

export interface ReportRow extends DurationEvidence {
    group: string;
}

export function deriveDurations(rows: readonly ReportRow[], today: LocalDate): DerivedFact[] {
    const byGroup = new Map<string, ReportRow[]>();
    for (const row of rows) byGroup.set(row.group, [...(byGroup.get(row.group) ?? []), row]);
    const out: DerivedFact[] = [];
    for (const [group, answers] of byGroup) {
        const newest = [...answers].sort((a, b) => b.day.localeCompare(a.day))[0];
        const guess = estimateDuration(
            { taskId: newest.series ? newest.taskId : null, title: newest.title, projectId: null },
            answers,
            today,
        );
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

const CONTEXT_CUT = /\bre:|\s-\s|:|\(/;

export function durationGroup(title: string): string {
    const words = (text: string) =>
        text
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .split(/\s+/)
            .filter(Boolean);
    const meaningful = words(title.split(CONTEXT_CUT)[0]).filter((w) => !STOP.has(w) && !/^\d{1,2}$/.test(w));
    return meaningful.length ? meaningful.slice(0, 3).join(" ") : words(title).slice(0, 4).join(" ");
}

export const groupOfTask = (task: { id: string; title: string; recurrenceRule: string | null }): string =>
    task.recurrenceRule ? `series:${task.id}` : durationGroup(task.title);

export const retentionCutoff = (today: LocalDate): LocalDate => addDays(today, -SIGNAL_RETENTION_DAYS);
