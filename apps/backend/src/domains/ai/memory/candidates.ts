/**
 * Extraction candidates: the model's proposals, and the code that decides which may be saved.
 * The model proposes; this file disposes. Pure, so it is unit-testable.
 */
import { z } from "zod";
import { MEMORY_CONTENT_MAX, memoryKindSchema, type MemoryKind } from "@cadence/contracts/memory";
import { localDateSchema } from "@cadence/contracts/common";
import { PLANNING_OFFERS, timeOfDaySchema, type PlanningOffer, type StatedWhenInput } from "@cadence/contracts/planning";

/** Kinds the chat can teach. Patterns and durations come from activity (Full), never from a model's reading. */
const EXTRACTED_KINDS = ["preference", "quirk", "life", "constraint", "assist"] as const satisfies readonly MemoryKind[];

export const MAX_CANDIDATES = 8;

const FLAGS = ["hypothetical", "quoted", "about_other", "sensitive", "instruction"] as const;

const rawFactSchema = z.object({
    from: z.string(),
    kind: memoryKindSchema,
    text: z.string(),
    validThrough: localDateSchema.nullable().optional(),
    /** A duration report: how long the thing named in `text` took them. */
    minutes: z.number().int().min(1).max(24 * 60).nullable().optional(),
    flags: z.array(z.string()).optional(),
    /** A preference about the time of day ("I study after dinner"): the parts of the day, and what it is about. */
    when: z.object({ buckets: z.array(z.string()), about: z.string().nullable() }).nullable().optional(),
    /** "Step lists stress me out": the offer that doesn't help them. */
    avoid: z.string().nullable().optional(),
});
const rawSchema = z.object({ facts: z.array(z.unknown()) });

/**
 * The shape the model must produce (structured output). Every field is required and nullable, with no
 * min/max/format: strict modes reject optional fields and most constraint keywords. The real limits stay in
 * `rawFactSchema`, checked per candidate.
 */
export const extractReplySchema = z.object({
    facts: z.array(z.object({
        from: z.string(),
        kind: memoryKindSchema,
        text: z.string(),
        validThrough: z.string().nullable(),
        minutes: z.number().int().nullable(),
        flags: z.array(z.string()),
        when: z.object({ buckets: z.array(z.string()), about: z.string().nullable() }).nullable(),
        avoid: z.string().nullable(),
    })),
});

export interface Candidate {
    /** The person's message it came from. */
    messageId: string;
    kind: MemoryKind;
    content: string;
    validThrough: string | null;
    /** `{ when }` on a time-of-day preference, `{ avoid }` on what-doesn't-help: the only facts code computes with from a chat. */
    value: { when: StatedWhenInput } | { avoid: PlanningOffer } | null;
}

/** A stated time-of-day preference, checked: known parts of the day only, a short topic, preferences only. */
function cleanWhen(raw: { buckets: string[]; about: string | null } | null | undefined): StatedWhenInput | null {
    const buckets = [...new Set(raw?.buckets ?? [])].flatMap((b) => { const ok = timeOfDaySchema.safeParse(b); return ok.success ? [ok.data] : []; });
    if (!buckets.length) return null;
    const about = raw?.about ? cleanText(raw.about).slice(0, 60) : "";
    return { buckets, about: about.length >= 2 ? about : null };
}

/**
 * Text shaped like an instruction to the assistant, not a fact about the person's life
 * (OWASP ASI06 memory poisoning). Deliberately blunt: a false positive only costs one fact.
 */
const INSTRUCTION_SHAPED = [
    /\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|above|earlier|all|your)\b.{0,30}\b(instructions?|rules?|prompts?|messages?)\b/i,
    /\b(system|developer) (prompt|message|instructions?)\b/i,
    /\b(you|assistant)\s+(must|should|shall|will|need to|have to)\b/i,
    /\b(always|never)\s+(call|use|run|invoke|execute|delete|create|send|reply|respond|answer)\b/i,
    /\b(tool|function|api)\s*(call|key|token)s?\b/i,
    /\b(approve|approval|auto-?approve|without asking|without confirmation)\b/i,
    /\bcadence\b.{0,20}\b(must|should|always|never)\b/i,
];

export function isInstructionShaped(text: string): boolean {
    return INSTRUCTION_SHAPED.some((pattern) => pattern.test(text));
}

/** One line of plain text: no markup or control characters a fence could be confused by. */
export function cleanText(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/[<>`]/g, "").replace(/\s+/g, " ").trim();
}

/** Whether a cleaned candidate may be saved at all. */
function isSavable(kind: string, content: string, flags: readonly string[]): boolean {
    if (!(EXTRACTED_KINDS as readonly string[]).includes(kind)) return false;
    if (content.length < 3 || content.length > MEMORY_CONTENT_MAX) return false;
    // Anything the model marked as not-a-plain-fact-about-the-person is dropped: sensitive details are saved
    // only when the person says "remember" (the remember tool), never from passive reading.
    if (flags.some((flag) => (FLAGS as readonly string[]).includes(flag))) return false;
    return !isInstructionShaped(content);
}

/** A preference's stated time of day, or an assist's help that doesn't work. */
function candidateValue(fact: z.infer<typeof rawFactSchema>): Candidate["value"] {
    const when = fact.kind === "preference" ? cleanWhen(fact.when) : null;
    if (when) return { when };
    const avoid = fact.kind === "assist" && (PLANNING_OFFERS as readonly string[]).includes(fact.avoid ?? "") ? (fact.avoid as PlanningOffer) : null;
    return avoid ? { avoid } : null;
}

/**
 * The model's reply → candidates that may be saved. `messages` maps the opaque labels (m1, m2…)
 * the model saw to the person's real message ids; a candidate citing anything else is dropped,
 * so nothing from assistant text, tools or invented sources gets in. Fails closed on any shape error.
 */
export function acceptCandidates(reply: unknown, messages: ReadonlyMap<string, string>): Candidate[] {
    const parsed = rawSchema.safeParse(reply);
    if (!parsed.success) return [];

    const out: Candidate[] = [];
    const seen = new Set<string>();
    for (const entry of parsed.data.facts.slice(0, MAX_CANDIDATES)) {
        const fact = rawFactSchema.safeParse(entry);
        if (!fact.success) continue;
        const { from, kind, validThrough, flags = [] } = fact.data;
        const messageId = messages.get(from);
        const content = cleanText(fact.data.text);
        if (!messageId || !isSavable(kind, content, flags)) continue;
        const key = content.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ messageId, kind, content, validThrough: validThrough ?? null, value: candidateValue(fact.data) });
    }
    return out;
}
