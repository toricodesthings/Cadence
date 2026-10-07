// A typed instruction for work that already exists ("Friday 3pm for 30 min", "keep waiting until Monday",
// "put in Work"): the bounded change it means, as a patch the user sees before it is applied.
// Pure: the draft comes from `resolveDraft`; nothing here reads a clock, the network or a task.
import type { TaskPriority } from "@cadence/contracts/task";
import type { Draft } from "./nlp-draft";
import { atLocal, type Instant, type LocalDate, type Zone } from "./time";

export type TaskState = "ACTIVE" | "WAITING";

/** Only these fields, so a patch can never touch notes, title, priority history or anything unnamed. */
export interface InstructionPatch {
    state?: TaskState;
    dueDate?: LocalDate | null;
    scheduledStart?: Instant | null;
    scheduledEnd?: Instant | null;
    durationEstimate?: number | null;
    projectId?: string | null;
    /** A section of `projectId` (set together, so the two never disagree). */
    sectionId?: string | null;
    waitingOn?: string | null;
    /** Hide until this day. */
    notBefore?: LocalDate | null;
    /** A follow-up nudge for work that is waiting. */
    waitingReminder?: Instant | null;
    priority?: TaskPriority;
    /** Tags to add; existing tags stay. */
    addTagIds?: string[];
}

export interface Instruction {
    patch: InstructionPatch;
    /** Words that carried no change: shown, never guessed at. */
    unread: string;
}

const VERBS = {
    keepUnscheduled: /\bkeep\s+(?:it\s+|them\s+|these\s+)?unscheduled\b/i,
    keepWaiting: /\bkeep\s+(?:it\s+|them\s+|these\s+)?waiting(?:\s+until\b)?/i,
    activate: /\bactivate\b/i,
    followUp: /\bfollow\s*up\b/i,
    until: /\b(?:until|till|not\s+before|hide\s+until)\b/i,
} as const;

/** Connective words that carry no change on their own. */
const FILLER = /\b(?:move|put|set|send|schedule|these|this|them|it|to|in|into|on|at|the|a|and|then|please|tasks?)\b|[/,;.]/gi;

const FOLLOW_UP_HOUR = "09:00";

export interface NamedSection { id: string; name: string; projectId: string | null }

export interface SectionMention {
    start: number;
    end: number;
    /** Every section with the named name; more than one is resolved by the list the words name. */
    candidates: NamedSection[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * "put in Later This Week", "move to the Errands section": a section named after a placement cue. Longest name wins.
 * A name that is also a day ("Today") needs the word "section", so "move these to today" stays a date.
 */
export function findSectionMention(text: string, sections: readonly NamedSection[], namesADay: (name: string) => boolean = () => false): SectionMention | null {
    const names = [...new Set(sections.map((s) => s.name.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
    for (const name of names) {
        const suffix = namesADay(name) ? "\\s+section" : "(?:\\s+section)?";
        const m = new RegExp(`\\b(?:in|into|to|under)\\s+(?:the\\s+)?${escape(name)}${suffix}(?![\\p{L}\\p{N}])`, "iu").exec(text);
        if (m) return { start: m.index, end: m.index + m[0].length, candidates: sections.filter((s) => s.name.trim().toLowerCase() === name.toLowerCase()) };
    }
    return null;
}

/** The one section a mention means, given the list the words named (if any); nothing when it stays ambiguous or contradicts that list. */
export function resolveSection(mention: SectionMention | null, projectId: string | null): NamedSection | null {
    if (!mention) return null;
    const fits = projectId ? mention.candidates.filter((c) => c.projectId === projectId) : mention.candidates;
    return fits.length === 1 ? fits[0] : null;
}

/**
 * What `text` means for existing work, given the draft read from it (dates, list, tags, priority, waiting, estimate)
 * and the section it named, already resolved (`resolveSection`).
 */
export function instructionPatch(text: string, draft: Draft, zone: Zone, section: NamedSection | null = null): Instruction {
    const patch: InstructionPatch = {};
    const f = draft.fields;
    let rest = draft.title;

    const keepUnscheduled = VERBS.keepUnscheduled.test(text);
    const keepWaiting = VERBS.keepWaiting.test(text);
    const activate = VERBS.activate.test(text);
    const followUp = VERBS.followUp.test(text);
    const until = VERBS.until.test(text);

    for (const verb of [VERBS.keepUnscheduled, VERBS.keepWaiting, VERBS.activate, VERBS.followUp, VERBS.until]) rest = rest.replace(verb, " ");

    if (keepUnscheduled) {
        patch.dueDate = null;
        patch.scheduledStart = null;
        patch.scheduledEnd = null;
    } else if (followUp) {
        // A follow-up is a nudge on waiting work: it never changes the state or the day it is planned for.
        if (f.scheduledStart) patch.waitingReminder = f.scheduledStart;
        else if (f.dueDate) patch.waitingReminder = atLocal(f.dueDate, FOLLOW_UP_HOUR, zone);
    } else if (keepWaiting || (until && f.dueDate && !f.scheduledStart)) {
        // "until Monday" hides the work until then; it is not a deadline.
        if (f.dueDate) patch.notBefore = f.dueDate;
    } else {
        if (f.scheduledStart) {
            patch.scheduledStart = f.scheduledStart;
            patch.scheduledEnd = f.scheduledEnd;
            patch.dueDate = null;
        } else if (f.dueDate) {
            patch.dueDate = f.dueDate;
            patch.scheduledStart = null;
            patch.scheduledEnd = null;
        }
    }

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

/** True when the instruction changed nothing: the caller offers no Apply. */
export const isEmptyPatch = (p: InstructionPatch) => Object.keys(p).length === 0;

/**
 * Undo that respects later edits: of the fields this patch set, the ones whose current value is still
 * what the patch wrote go back to what they were. A field someone changed since stays as it is.
 */
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
