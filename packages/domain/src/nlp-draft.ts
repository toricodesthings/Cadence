// The one place a parse becomes a draft: which fields apply, what the user decided, what the title keeps.
// Pure: the parse, the user's decisions and the zone come in; fields, title and open suggestions go out.
import type { ParsedEntity, DateValue } from "@cadence/nlp/core";
import { cleanTitle } from "@cadence/nlp/title";
import { addDays, atLocal, type Instant, type WallTime, type Zone } from "./time";

export type DraftField =
    | "dueDate"
    | "scheduledStart"
    | "scheduledEnd"
    /** A clock time with no day ("at 7am"): what a routine stores. */
    | "timeOfDay"
    | "recurrenceRule"
    | "priority"
    | "projectId"
    | "tagIds"
    | "waitingOn"
    | "durationMinutes"
    /** Hide the task until this day. */
    | "notBefore"
    /** A nudge at an exact moment: never a work block. */
    | "reminderAt";

export interface DraftFields {
    dueDate: string | null;
    scheduledStart: Instant | null;
    scheduledEnd: Instant | null;
    timeOfDay: WallTime | null;
    recurrenceRule: string | null;
    /** 0 = none, 1–4 as the task contract. */
    priority: number;
    projectId: string | null;
    tagIds: string[];
    waitingOn: string | null;
    durationMinutes: number | null;
    notBefore: string | null;
    reminderAt: Instant | null;
}

export const EMPTY_DRAFT_FIELDS: DraftFields = {
    dueDate: null,
    scheduledStart: null,
    scheduledEnd: null,
    timeOfDay: null,
    recurrenceRule: null,
    priority: 0,
    projectId: null,
    tagIds: [],
    waitingOn: null,
    durationMinutes: null,
    notBefore: null,
    reminderAt: null,
};

export interface DraftDecisions {
    /** Entity ids the user rejected; an id carries its phrase, so it follows the words, not an offset. */
    dismissed?: readonly string[];
    /** Suggested entity ids the user chose to use. */
    accepted?: readonly string[];
    /** Fields set by hand. A key that is present wins, including none (`null`, `[]`, `0`). */
    manual?: Partial<DraftFields>;
    /** "Keep as written": the raw title and only the manual fields. */
    literal?: boolean;
}

export interface DraftContext {
    zone: Zone;
    /** Fields this surface can store; anything else stays in the title untouched. */
    capabilities: ReadonlySet<DraftField>;
    /** Lowest confidence that applies without a choice (default medium). */
    threshold?: "high" | "medium" | "low";
    /** The surface stores a month and day only (a yearly event): a time or a year is reported in `unfit`, never applied or dropped. */
    monthDayOnly?: boolean;
}

export interface Draft {
    fields: DraftFields;
    /** The title with applied phrases removed. */
    title: string;
    /** Entity ids applied to the draft. */
    applied: string[];
    /** Recognized but not applied: the user may choose them. */
    suggestions: ParsedEntity[];
    /** Language this surface cannot store (a time or a year on a yearly event): its words stay in the title. */
    unfit: ParsedEntity[];
}

const RANK = { low: 0, medium: 1, high: 2 } as const;

const isNone = (v: unknown) => v === null || v === undefined || (Array.isArray(v) && v.length === 0);

const TIME_ONLY = /^\s*(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*$/i;

/** What an entity fills, in fields. */
function fieldOf(e: ParsedEntity, ctx: DraftContext): DraftField | null {
    switch (e.type) {
        case "due_date": return "dueDate";
        case "scheduled_start": {
            const v = e.normalizedValue as DateValue;
            if (!v.hasTime || !v.time) return "dueDate";
            // A routine keeps a time with no day; a phrase that also names a day stays in its title.
            return ctx.capabilities.has("timeOfDay") && !ctx.capabilities.has("scheduledStart")
                ? TIME_ONLY.test(e.sourceText) ? "timeOfDay" : null
                : "scheduledStart";
        }
        case "recurrence": return "recurrenceRule";
        case "priority": return "priority";
        case "project": return "projectId";
        case "tag": return "tagIds";
        case "waiting_on": return "waitingOn";
        case "duration": return "durationMinutes";
        case "not_before": return "notBefore";
        case "reminder": return "reminderAt";
    }
}

export function resolveDraft(
    rawInput: string,
    entities: readonly ParsedEntity[],
    decisions: DraftDecisions,
    ctx: DraftContext,
): Draft {
    const fields: DraftFields = { ...EMPTY_DRAFT_FIELDS, ...decisions.manual, tagIds: [...(decisions.manual?.tagIds ?? [])] };
    const manual = decisions.manual ?? {};
    const out: Draft = { fields, title: rawInput.trim(), applied: [], suggestions: [], unfit: [] };
    if (decisions.literal) return out;

    const dismissed = new Set(decisions.dismissed ?? []);
    const accepted = new Set(decisions.accepted ?? []);
    const threshold = RANK[ctx.threshold ?? "medium"];
    const filled = new Set<DraftField>();
    const removed: Array<{ start: number; end: number }> = [];
    const take = (e: ParsedEntity) => removed.push(e.consumed ?? e);
    const relative: ParsedEntity[] = [];

    for (const e of entities) {
        if (ctx.monthDayOnly && (e.type === "due_date" || e.type === "scheduled_start") && !dismissed.has(e.id) && !("dueDate" in manual)) {
            const v = e.normalizedValue as DateValue;
            if (v.hasTime || /\b(?:19|20)\d{2}\b/.test(e.sourceText)) {
                if (!out.unfit.some((u) => u.start === e.start)) out.unfit.push(e);
                continue;
            }
        }
        const field = fieldOf(e, ctx);
        if (!field || dismissed.has(e.id) || !ctx.capabilities.has(field)) continue;

        // A hand-set value replaces the phrase (and cleans it); a hand-set "none" leaves the words alone.
        if (field in manual) {
            if (!isNone(manual[field]) && manual[field] !== 0 && !filled.has(field)) take(e);
            filled.add(field);
            continue;
        }
        if (field !== "tagIds" && filled.has(field)) continue;

        // Fuzzy names are a suggestion until chosen; so is anything under the threshold.
        const fuzzy = (e.type === "project" || e.type === "tag") && e.confidence !== "high";
        if (!accepted.has(e.id) && (fuzzy || RANK[e.confidence] < threshold)) {
            out.suggestions.push(e);
            continue;
        }

        // "30 minutes before" counts back from the start, which may come later in the sentence.
        if (isRelativeReminder(e)) {
            relative.push(e);
            continue;
        }

        if (field === "tagIds") {
            const id = (e.normalizedValue as { id: string }).id;
            if (!fields.tagIds.includes(id)) fields.tagIds.push(id);
        } else {
            filled.add(field);
            applyEntity(fields, e, ctx, manual);
        }
        out.applied.push(e.id);
        take(e);
    }

    // No timed start, no moment to count back from: the words stay in the title.
    for (const e of relative) {
        if (!fields.scheduledStart || filled.has("reminderAt")) continue;
        filled.add("reminderAt");
        fields.reminderAt = new Date(Date.parse(fields.scheduledStart) - (e.normalizedValue as { beforeMinutes: number }).beforeMinutes * 60_000).toISOString();
        out.applied.push(e.id);
        take(e);
    }

    out.title = cleanTitle(rawInput, removed) || rawInput.trim();
    return out;
}

const isRelativeReminder = (e: ParsedEntity) => e.type === "reminder" && typeof (e.normalizedValue as { beforeMinutes?: unknown }).beforeMinutes === "number";

function applyEntity(fields: DraftFields, e: ParsedEntity, ctx: DraftContext, manual: Partial<DraftFields>) {
    switch (e.type) {
        case "due_date":
        case "scheduled_start": {
            const v = e.normalizedValue as DateValue;
            if (ctx.capabilities.has("timeOfDay") && !ctx.capabilities.has("scheduledStart")) {
                fields.timeOfDay = v.time;
            } else if (e.type === "scheduled_start" && v.hasTime && v.time) {
                fields.scheduledStart = atLocal(v.date, v.time, ctx.zone);
                if (v.endTime && !("scheduledEnd" in manual) && ctx.capabilities.has("scheduledEnd")) {
                    let end = atLocal(v.endDate ?? v.date, v.endTime, ctx.zone);
                    // "10pm to 1am" ends the next day
                    if (end <= fields.scheduledStart) end = atLocal(addDays(v.endDate ?? v.date, 1), v.endTime, ctx.zone);
                    fields.scheduledEnd = end;
                }
            } else {
                fields.dueDate = v.date;
            }
            break;
        }
        case "not_before": fields.notBefore = (e.normalizedValue as DateValue).date; break;
        case "reminder": {
            const v = e.normalizedValue as DateValue;
            if (v.time) fields.reminderAt = atLocal(v.date, v.time, ctx.zone);
            break;
        }
        case "recurrence": fields.recurrenceRule = (e.normalizedValue as { rrule: string }).rrule; break;
        case "priority": fields.priority = e.normalizedValue as number; break;
        case "project": fields.projectId = (e.normalizedValue as { id: string }).id; break;
        case "waiting_on": fields.waitingOn = (e.normalizedValue as { person: string }).person; break;
        case "duration": fields.durationMinutes = (e.normalizedValue as { minutes: number }).minutes; break;
    }
}
