import type { ParsedEntity, DateValue } from "@cadence/nlp/core";
import { cleanTitle } from "@cadence/nlp/title";
import { addDays, atLocal, type Instant, type WallTime, type Zone } from "./time";

export type DraftField =
    | "dueDate"
    | "scheduledStart"
    | "scheduledEnd"
    | "timeOfDay"
    | "recurrenceRule"
    | "priority"
    | "projectId"
    | "tagIds"
    | "waitingOn"
    | "durationMinutes"
    | "notBefore"
    | "reminderAt";

export interface DraftFields {
    dueDate: string | null;
    scheduledStart: Instant | null;
    scheduledEnd: Instant | null;
    timeOfDay: WallTime | null;
    recurrenceRule: string | null;
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
    dismissed?: readonly string[];
    accepted?: readonly string[];
    manual?: Partial<DraftFields>;
    literal?: boolean;
}

export interface DraftContext {
    zone: Zone;
    capabilities: ReadonlySet<DraftField>;
    monthDayOnly?: boolean;
}

export interface Draft {
    fields: DraftFields;
    title: string;
    applied: string[];
    suggestions: ParsedEntity[];
    unfit: ParsedEntity[];
}

export function appliesWithoutChoice(e: { type: string; confidence?: "high" | "medium" | "low" }): boolean {
    if ((e.type === "project" || e.type === "tag") && e.confidence !== "high") return false;
    return e.confidence === "high" || e.confidence === "medium";
}

const isNone = (v: unknown) => v === null || v === undefined || (Array.isArray(v) && v.length === 0);

const TIME_ONLY = /^\s*(?:at\s+)?\d{1,2}(?::\d{2})?(?:\s*(?:am|pm))?\s*$/i;

const FIELD_OF: Record<Exclude<ParsedEntity["type"], "scheduled_start">, DraftField> = {
    due_date: "dueDate",
    recurrence: "recurrenceRule",
    priority: "priority",
    project: "projectId",
    tag: "tagIds",
    waiting_on: "waitingOn",
    duration: "durationMinutes",
    not_before: "notBefore",
    reminder: "reminderAt",
};

function startFieldOf(e: ParsedEntity, ctx: DraftContext): DraftField | null {
    const v = e.normalizedValue as DateValue;
    if (!v.hasTime || !v.time) return "dueDate";
    if (!ctx.capabilities.has("timeOfDay") || ctx.capabilities.has("scheduledStart")) return "scheduledStart";
    return TIME_ONLY.test(e.sourceText) ? "timeOfDay" : null;
}

function fieldOf(e: ParsedEntity, ctx: DraftContext): DraftField | null {
    return e.type === "scheduled_start" ? startFieldOf(e, ctx) : FIELD_OF[e.type];
}

export function resolveDraft(
    rawInput: string,
    entities: readonly ParsedEntity[],
    decisions: DraftDecisions,
    ctx: DraftContext,
): Draft {
    const fields: DraftFields = {
        ...EMPTY_DRAFT_FIELDS,
        ...decisions.manual,
        tagIds: [...(decisions.manual?.tagIds ?? [])],
    };
    const manual = decisions.manual ?? {};
    const out: Draft = { fields, title: rawInput.trim(), applied: [], suggestions: [], unfit: [] };
    if (decisions.literal) return out;

    const dismissed = new Set(decisions.dismissed ?? []);
    const accepted = new Set(decisions.accepted ?? []);
    const filled = new Set<DraftField>();
    const removed: Array<{ start: number; end: number }> = [];
    const take = (e: ParsedEntity) => removed.push(e.consumed ?? e);
    const relative: ParsedEntity[] = [];

    for (const e of entities) {
        if (
            ctx.monthDayOnly &&
            (e.type === "due_date" || e.type === "scheduled_start") &&
            !dismissed.has(e.id) &&
            !("dueDate" in manual)
        ) {
            const v = e.normalizedValue as DateValue;
            if (v.hasTime || /\b(?:19|20)\d{2}\b/.test(e.sourceText)) {
                if (!out.unfit.some((u) => u.start === e.start)) out.unfit.push(e);
                continue;
            }
        }
        const field = fieldOf(e, ctx);
        if (!field || dismissed.has(e.id) || !ctx.capabilities.has(field)) continue;

        if (field in manual) {
            if (!isNone(manual[field]) && manual[field] !== 0 && !filled.has(field)) take(e);
            filled.add(field);
            continue;
        }
        if (field !== "tagIds" && filled.has(field)) continue;

        if (!accepted.has(e.id) && !appliesWithoutChoice(e)) {
            out.suggestions.push(e);
            continue;
        }

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

    for (const e of relative) {
        if (!fields.scheduledStart || filled.has("reminderAt")) continue;
        filled.add("reminderAt");
        fields.reminderAt = new Date(
            Date.parse(fields.scheduledStart) - (e.normalizedValue as { beforeMinutes: number }).beforeMinutes * 60_000,
        ).toISOString();
        out.applied.push(e.id);
        take(e);
    }

    out.title = cleanTitle(rawInput, removed) || rawInput.trim();
    return out;
}

const isRelativeReminder = (e: ParsedEntity) =>
    e.type === "reminder" && typeof (e.normalizedValue as { beforeMinutes?: unknown }).beforeMinutes === "number";

function applyDate(
    fields: DraftFields,
    type: "due_date" | "scheduled_start",
    v: DateValue,
    ctx: DraftContext,
    manual: Partial<DraftFields>,
) {
    if (ctx.capabilities.has("timeOfDay") && !ctx.capabilities.has("scheduledStart")) {
        fields.timeOfDay = v.time;
        return;
    }
    if (type !== "scheduled_start" || !v.hasTime || !v.time) {
        fields.dueDate = v.date;
        return;
    }
    fields.scheduledStart = atLocal(v.date, v.time, ctx.zone);
    if (!v.endTime || "scheduledEnd" in manual || !ctx.capabilities.has("scheduledEnd")) return;
    const endDay = v.endDate ?? v.date;
    const end = atLocal(endDay, v.endTime, ctx.zone);
    fields.scheduledEnd = end <= fields.scheduledStart ? atLocal(addDays(endDay, 1), v.endTime, ctx.zone) : end;
}

function applyEntity(fields: DraftFields, e: ParsedEntity, ctx: DraftContext, manual: Partial<DraftFields>) {
    switch (e.type) {
        case "due_date":
        case "scheduled_start":
            applyDate(fields, e.type, e.normalizedValue as DateValue, ctx, manual);
            break;
        case "not_before":
            fields.notBefore = (e.normalizedValue as DateValue).date;
            break;
        case "reminder": {
            const v = e.normalizedValue as DateValue;
            if (v.time) fields.reminderAt = atLocal(v.date, v.time, ctx.zone);
            break;
        }
        case "recurrence":
            fields.recurrenceRule = (e.normalizedValue as { rrule: string }).rrule;
            break;
        case "priority":
            fields.priority = e.normalizedValue as number;
            break;
        case "project":
            fields.projectId = (e.normalizedValue as { id: string }).id;
            break;
        case "waiting_on":
            fields.waitingOn = (e.normalizedValue as { person: string }).person;
            break;
        case "duration":
            fields.durationMinutes = (e.normalizedValue as { minutes: number }).minutes;
            break;
    }
}
