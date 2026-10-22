// The answers offered under "How long did it take?". Pure: the toast only renders what this returns.
import type { DurationValue } from "@cadence/contracts/memory";
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

/** One length of time that is the whole text ("90", "1h20", "45 min", "an hour and a half"), or null. */
function parseOne(text: string): number | null {
    const input = text.trim().toLowerCase();
    if (/^\d+$/.test(input)) return clamp(Number(input));
    if (/^(?:about |around )?(?:an? |one )?hour and a half$/.test(input)) return 90;
    // "1 hour 30 minutes", "1h 30", "2 hrs and 15 min".
    const hm = /^(\d+)\s*(?:h|hrs?|hours?)\s*(?:and\s*)?(\d+)\s*(?:m|mins?|minutes?)?$/.exec(input);
    if (hm) return clamp(Number(hm[1]) * 60 + Number(hm[2]));
    return parsedWhole(input);
}

/** The parser's length when it is the whole text: "at least an hour" is not "an hour". */
function parsedWhole(input: string): number | null {
    const { entities, consumedRanges } = parseDuration(input, { maxMinutes: MAX_MINUTES });
    const minutes = (entities[0]?.normalizedValue as { minutes?: number } | undefined)?.minutes;
    const range = consumedRanges[0];
    return minutes && range && range.start === 0 && range.end === input.length ? clamp(minutes) : null;
}

/** "30-60", "30–60 min", "1-2h", "30 to 60": the unit at the end of the range goes to a bare first number. */
function parseRange(text: string): DurationValue | null {
    const m = /^(.+?)\s*(?:-|–|—|\bto\b)\s*(.+)$/.exec(text.trim().toLowerCase());
    if (!m) return null;
    const unit = /\d\s*(h|hrs?|hours?)$/.test(m[2]) ? "h" : /\d\s*(m|mins?|minutes?)$/.test(m[2]) ? "m" : "";
    const lowText = /^\d+(?:\.\d+)?$/.test(m[1]) && unit ? `${m[1]}${unit}` : m[1];
    const lowMinutes = parseOne(lowText);
    const highMinutes = parseOne(m[2]);
    return lowMinutes && highMinutes && lowMinutes < highMinutes ? { kind: "range", lowMinutes, highMinutes } : null;
}

/** The "Other" field: a length or a finite range, 1 minute to 24 hours. Null when it isn't ("at least an hour", "25h", "60-30"). */
export function parseAnswer(text: string): DurationValue | null {
    const range = parseRange(text);
    if (range) return range;
    const minutes = parseOne(text);
    return minutes ? { kind: "point", minutes } : null;
}

/** What the Other field says when it can't read the text. */
export const ANSWER_HINT = "Try 90 or 1h30";

/** "45 min" or "30–60 min". */
export const formatValue = (v: DurationValue | { lowMinutes: number; highMinutes: number }): string => {
    const [low, high] = "kind" in v ? (v.kind === "point" ? [v.minutes, v.minutes] : [v.lowMinutes, v.highMinutes]) : [v.lowMinutes, v.highMinutes];
    return low === high ? formatMinutes(low) : `${low}–${high} min`;
};

const clamp = (minutes: number): number | null => (minutes >= 1 && minutes <= MAX_MINUTES ? minutes : null);
