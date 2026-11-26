import type { TaskPriority } from "@cadence/contracts/task";
import type { Draft } from "./nlp-draft";
import { atLocal, type Instant, type LocalDate, type Zone } from "./time";

export type TaskState = "ACTIVE" | "WAITING";

export interface InstructionPatch {
    state?: TaskState;
    dueDate?: LocalDate | null;
    scheduledStart?: Instant | null;
    scheduledEnd?: Instant | null;
    durationEstimate?: number | null;
    projectId?: string | null;
    sectionId?: string | null;
    waitingOn?: string | null;
    notBefore?: LocalDate | null;
    waitingReminder?: Instant | null;
    priority?: TaskPriority;
    addTagIds?: string[];
}

export interface Instruction {
    patch: InstructionPatch;
    unread: string;
}

const VERBS = {
    keepUnscheduled: /\bkeep\s+(?:it\s+|them\s+|these\s+)?unscheduled\b/i,
    keepWaiting: /\bkeep\s+(?:it\s+|them\s+|these\s+)?waiting(?:\s+until\b)?/i,
    activate: /\bactivate\b/i,
    followUp: /\bfollow\s*up\b/i,
    until: /\b(?:until|till|not\s+before|hide\s+until)\b/i,
} as const;

const FILLER =
    /\b(?:move|put|set|send|schedule|these|this|them|it|to|in|into|on|at|the|a|and|then|please|tasks?)\b|[/,;.]/gi;

const FOLLOW_UP_HOUR = "09:00";

export interface NamedSection {
    id: string;
    name: string;
    projectId: string | null;
}

export interface SectionMention {
    start: number;
    end: number;
    candidates: NamedSection[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function findSectionMention(
    text: string,
    sections: readonly NamedSection[],
    namesADay: (name: string) => boolean = () => false,
): SectionMention | null {
    const names = [...new Set(sections.map((s) => s.name.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
    for (const name of names) {
        const suffix = namesADay(name) ? "\\s+section" : "(?:\\s+section)?";
        const m = new RegExp(
            `\\b(?:in|into|to|under)\\s+(?:the\\s+)?${escape(name)}${suffix}(?![\\p{L}\\p{N}])`,
            "iu",
        ).exec(text);
        if (m)
            return {
                start: m.index,
                end: m.index + m[0].length,
                candidates: sections.filter((s) => s.name.trim().toLowerCase() === name.toLowerCase()),
            };
    }
    return null;
}

export function resolveSection(mention: SectionMention | null, projectId: string | null): NamedSection | null {
    if (!mention) return null;
    const fits = projectId ? mention.candidates.filter((c) => c.projectId === projectId) : mention.candidates;
    return fits.length === 1 ? fits[0] : null;
}

function datePatch(
    f: Draft["fields"],
    verbs: { keepUnscheduled: boolean; keepWaiting: boolean; followUp: boolean; until: boolean },
    zone: Zone,
): InstructionPatch {
    if (verbs.keepUnscheduled) return { dueDate: null, scheduledStart: null, scheduledEnd: null };
    if (verbs.followUp) {
        if (f.scheduledStart) return { waitingReminder: f.scheduledStart };
        return f.dueDate ? { waitingReminder: atLocal(f.dueDate, FOLLOW_UP_HOUR, zone) } : {};
    }
    if (verbs.keepWaiting || (verbs.until && f.dueDate && !f.scheduledStart)) {
        return f.dueDate ? { notBefore: f.dueDate } : {};
    }
    if (f.scheduledStart) return { scheduledStart: f.scheduledStart, scheduledEnd: f.scheduledEnd, dueDate: null };
    return f.dueDate ? { dueDate: f.dueDate, scheduledStart: null, scheduledEnd: null } : {};
}

export function instructionPatch(
    text: string,
    draft: Draft,
    zone: Zone,
    section: NamedSection | null = null,
): Instruction {
    const patch: InstructionPatch = {};
    const f = draft.fields;
    let rest = draft.title;

    const keepUnscheduled = VERBS.keepUnscheduled.test(text);
    const keepWaiting = VERBS.keepWaiting.test(text);
    const activate = VERBS.activate.test(text);
    const followUp = VERBS.followUp.test(text);
    const until = VERBS.until.test(text);

    for (const verb of [VERBS.keepUnscheduled, VERBS.keepWaiting, VERBS.activate, VERBS.followUp, VERBS.until])
        rest = rest.replace(verb, " ");

    Object.assign(patch, datePatch(f, { keepUnscheduled, keepWaiting, followUp, until }, zone));

    if (keepWaiting) patch.state = "WAITING";
    if (activate) patch.state = "ACTIVE";
    if (f.durationMinutes) patch.durationEstimate = f.durationMinutes;
    if (f.projectId) patch.projectId = f.projectId;
    if (section) {
        patch.projectId = section.projectId;
        patch.sectionId = section.id;
    }
    if (f.waitingOn) patch.waitingOn = f.waitingOn;
    if (f.priority > 0) patch.priority = f.priority as TaskPriority;
    if (f.tagIds.length) patch.addTagIds = f.tagIds;

    return { patch, unread: rest.replace(FILLER, " ").replace(/\s+/g, " ").trim() };
}

export const isEmptyPatch = (p: InstructionPatch) => Object.keys(p).length === 0;

export function undoPatch(
    patch: InstructionPatch,
    before: Partial<Record<keyof InstructionPatch, unknown>>,
    now: Partial<Record<keyof InstructionPatch, unknown>>,
): InstructionPatch {
    const restore: Record<string, unknown> = {};
    for (const key of Object.keys(patch) as Array<keyof InstructionPatch>) {
        if (key === "addTagIds") continue;
        if (now[key] === (patch[key] ?? null)) restore[key] = before[key] ?? null;
    }
    return restore as InstructionPatch;
}
