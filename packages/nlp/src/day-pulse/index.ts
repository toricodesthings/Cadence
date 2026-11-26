export interface TaskCueAnalysis {
    heavy: boolean;
    light: boolean;
    effort: 1 | 3 | null;
}

const HEAVY_CUE =
    /\b(deep|hard|demanding|exam|midterm|final|interview|presentation|defen[cs]e|thesis|essay|paper|report|tax|taxes|audit|deploy|migration|release|workshop|lab)\b/i;
const LIGHT_CUE =
    /\b(quick|easy|light|check|reply|email|text|ping|call|water|tidy|order|buy|pick up|drop off|errand)\b/i;

export function analyzeTaskCues(title: string): TaskCueAnalysis {
    const heavy = HEAVY_CUE.test(title);
    const light = !heavy && LIGHT_CUE.test(title);
    return { heavy, light, effort: heavy ? 3 : light ? 1 : null };
}

export const cueEffortOf = (title: string) => analyzeTaskCues(title).effort;

export interface DayPulseItem {
    kind: "fixed" | "task";
    title: string;
    startMin: number | null;
    endMin: number | null;
    knownMinutes: number | null;
    effort: 1 | 2 | 3 | null;
    effortGuess: 1 | 2 | 3 | null;
    priority?: number;
    isHabit?: boolean;
}

export interface DayPulseInput {
    items: readonly DayPulseItem[];
    eventCount: number;
    dayStartMin: number;
    dayEndMin: number;
    nowMin: number | null;
    nlpCuesEnabled?: boolean;
}

export type DayPulseKind =
    | "wide_open"
    | "event_only"
    | "packed"
    | "free_after"
    | "open_morning"
    | "open_afternoon"
    | "focused"
    | "light"
    | "balanced";

export type DayPulseTone = "open" | "light" | "steady" | "full";

export interface DayPulse {
    kind: DayPulseKind;
    tone: DayPulseTone;
    anchorMinutes: number | null;
    bookedMinutes: number;
    unsizedCount: number;
    fixedCount: number;
    taskCount: number;
    eventCount: number;
    effectiveEffort: number;
}

const NOON = 720;
const SIX_PM = 1080;
const UNSIZED_SPAN = 60;
const UNKNOWN_EFFORT = 2;

const TONE: Record<DayPulseKind, DayPulseTone> = {
    wide_open: "open",
    event_only: "open",
    packed: "full",
    free_after: "light",
    open_morning: "light",
    open_afternoon: "light",
    focused: "steady",
    light: "light",
    balanced: "steady",
};

type Span = [number, number];

function merge(spans: Span[]): Span[] {
    const out: Span[] = [];
    for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) {
        const last = out[out.length - 1];
        if (last && a <= last[1]) last[1] = Math.max(last[1], b);
        else out.push([a, b]);
    }
    return out;
}

function openIn(busy: Span[], from: number, to: number) {
    if (to <= from) return 0;
    let covered = 0;
    for (const [a, b] of busy) covered += Math.max(0, Math.min(b, to) - Math.max(a, from));
    return to - from - covered;
}

const roundUpTo15 = (min: number) => Math.ceil(min / 15) * 15;

export function analyzeDayPulse(input: DayPulseInput): DayPulse {
    const cues = input.nlpCuesEnabled !== false;
    const items = input.items.filter((item) => !item.isHabit);
    const effectiveStart = Math.max(input.dayStartMin, input.nowMin ?? 0);
    const dayEnd = input.dayEndMin;

    const spans: Span[] = [];
    let untimedMinutes = 0;
    let unsizedCount = 0;
    let effectiveEffort = 0;
    let heavyAny = false;
    let heavyUntimed = false;
    let untimedTasks = 0;
    let fixedCount = 0;
    let taskCount = 0;

    for (const item of items) {
        const timed = item.startMin !== null;
        const span = timed ? (item.endMin ?? item.startMin! + (item.knownMinutes ?? UNSIZED_SPAN)) - item.startMin! : 0;
        if (timed) {
            const from = Math.max(item.startMin!, effectiveStart);
            const to = Math.min(item.startMin! + span, dayEnd);
            if (to > from) spans.push([from, to]);
        }
        if (item.kind === "fixed") {
            fixedCount++;
            effectiveEffort += Math.max(1, Math.min(3, Math.ceil(span / 60)));
            if (span >= 120) heavyAny = true;
            continue;
        }
        taskCount++;
        const cue = cues ? analyzeTaskCues(item.title) : null;
        const guess = cues ? item.effortGuess : null;
        const focus = (item.priority ?? 0) >= 3;
        effectiveEffort += (item.effort ?? guess ?? cue?.effort ?? UNKNOWN_EFFORT) + (focus ? 0.5 : 0);
        const heavy = item.effort === 3 || guess === 3 || focus || Boolean(cue?.heavy) || span >= 120;
        if (heavy) heavyAny = true;
        if (!timed) {
            untimedTasks++;
            if (heavy) heavyUntimed = true;
            if (item.knownMinutes === null) unsizedCount++;
            else untimedMinutes += item.knownMinutes;
        }
    }

    const busy = merge(spans);
    const bookedMinutes = busy.reduce((sum, [a, b]) => sum + b - a, 0) + untimedMinutes;
    const firstStart = busy[0]?.[0] ?? null;
    const lastEnd = busy[busy.length - 1]?.[1] ?? null;
    const morningOpen = openIn(busy, effectiveStart, NOON);
    const afternoonOpen = openIn(busy, Math.max(effectiveStart, NOON), Math.min(dayEnd, SIX_PM));
    const light = untimedTasks <= 1 && !heavyUntimed;

    const pulse = (kind: DayPulseKind, anchorMinutes: number | null = null): DayPulse => ({
        kind,
        tone: TONE[kind],
        anchorMinutes,
        bookedMinutes,
        unsizedCount,
        fixedCount,
        taskCount,
        eventCount: input.eventCount,
        effectiveEffort,
    });

    if (items.length === 0) return pulse(input.eventCount > 0 ? "event_only" : "wide_open");
    if (bookedMinutes >= 300 || taskCount >= 5 || effectiveEffort >= 10) return pulse("packed");
    if (
        lastEnd !== null &&
        taskCount <= 2 &&
        light &&
        lastEnd <= dayEnd - 180 &&
        lastEnd >= Math.max(effectiveStart, 600)
    )
        return pulse("free_after", roundUpTo15(lastEnd));
    if (firstStart !== null && morningOpen >= 150 && firstStart >= NOON && taskCount <= 2 && bookedMinutes < 240)
        return pulse("open_morning");
    if (lastEnd !== null && afternoonOpen >= 150 && lastEnd <= 750 && taskCount <= 2 && bookedMinutes < 240)
        return pulse("open_afternoon");
    if (heavyAny) return pulse("focused");
    if (bookedMinutes <= 120 && taskCount <= 2 && effectiveEffort <= 4) return pulse("light");
    return pulse("balanced");
}
