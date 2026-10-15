// The answers offered under "How long did it take?". Pure: the toast only renders what this returns.
import { parseDuration } from "@cadence/nlp/parse";

export interface DurationChip {
    minutes: number;
    label: string;
}

export const MAX_MINUTES = 24 * 60;

/** "45 min", "1 hr", "1 hr 30 min". */
export function formatMinutes(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

const chip = (minutes: number): DurationChip => ({ minutes, label: formatMinutes(minutes) });

/** With no reference: steps that roughly double, as durations are perceived. */
export const ABSOLUTE_CHIPS: readonly DurationChip[] = [5, 15, 30, 60, 120].map(chip);
/** Behind "More…" (then "Other" opens a field). */
export const MORE_CHIPS: readonly DurationChip[] = [180, 240].map(chip);

const SHORTER = [0.25, 0.5, 0.75];
const LONGER = [1.5, 2, 3];

/**
 * "Shorter" or "Longer" than `reference`: scaled options rounded to 5 minutes, never the reference itself,
 * never out of order or repeated.
 */
export function relativeChips(reference: number, direction: "shorter" | "longer"): DurationChip[] {
    const seen = new Set<number>();
    const out: DurationChip[] = [];
    for (const factor of direction === "shorter" ? SHORTER : LONGER) {
        const minutes = Math.min(MAX_MINUTES, Math.max(5, Math.round((reference * factor) / 5) * 5));
        const wrongSide = direction === "shorter" ? minutes >= reference : minutes <= reference;
        if (wrongSide || seen.has(minutes)) continue;
        seen.add(minutes);
        out.push(chip(minutes));
    }
    return out;
}

/** The "Other" field: "90", "1h20", "45 min", "an hour and a half". Null when it isn't a length of time. */
export function parseAnswer(text: string): number | null {
    const input = text.trim().toLowerCase();
    if (/^\d+$/.test(input)) return clamp(Number(input));
    if (/\bhour and a half\b/.test(input)) return 90;
    const found = parseDuration(input).entities[0]?.normalizedValue as { minutes?: number } | undefined;
    return found?.minutes ? clamp(found.minutes) : null;
}

const clamp = (minutes: number): number | null => (minutes >= 1 && minutes <= MAX_MINUTES ? minutes : null);
