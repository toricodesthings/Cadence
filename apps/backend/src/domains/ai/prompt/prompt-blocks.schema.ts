/**
 * Prompt types shared by the block set (prompt-blocks.ts), the composer and
 * agent.ts. Keep names stable.
 */
import type { ApprovalMode } from "@cadence/contracts/ai";
import type { UserSettings } from "@cadence/contracts/settings";
import type { ProfileLine } from "../memory/memory-store";

type AssistantSettings = NonNullable<UserSettings["assistant"]>;
/** Internal comparison variants; production uses compact packaging. */
export type PromptPackaging = "baseline" | "static-memory";
export const DEFAULT_PROMPT_PACKAGING: PromptPackaging = "static-memory";

export type Voice = NonNullable<AssistantSettings["persona"]>;

/** The block set: static base sections in order, then the per-user/per-turn templates. */
export interface PromptBlocks {
    base: string[];
    /** Deduplicated workflow; legacy base stays available for comparison and rollback. */
    compactBase: string[];
    memoryPolicy: string;
    voices: Record<Voice, string>;
    /** Appended to the voice when the workload is high (adaptive tone). */
    workloadHigh: string;
    /** Templates with {{placeholders}} resolved by the composer. */
    customInstructions: string;
    environment: string;
    compactEnvironment: string;
    snapshot: string;
    memory: string;
    /** Data-only templates for the static-policy evaluation variant. */
    memoryFacts: string;
    memoryFact: string;
    /** Said instead of the memory block while the person has memory off. */
    memoryOff: string;
}

/**
 * User-chosen assistant settings (users.settings.assistant). `persona` is the one
 * voice setting; `tone` and `verbosity` stay in the settings contract for
 * back-compat but no longer reach the prompt. Names and `customInstructions` are
 * free text and UNTRUSTED: the composer sanitizes and fences them.
 */
export type AssistantPersona = Required<AssistantSettings>;

/**
 * Everything the composer needs at request time. All async (settings, metrics,
 * RAG) happens before this is built, so the composer stays pure.
 */
export interface PromptRuntimeContext {
    timezone: string;
    /** The user's local clock, minute precision: "2026-09-23 14:05 -04:00 (Wednesday)". */
    now: string;
    locale: string;
    weekStart: "Sunday" | "Monday" | "Saturday";
    approvalMode: ApprovalMode;
    /** Adaptive tone is on and the user's burnout index is above the threshold. */
    workloadHigh: boolean;
    persona: AssistantPersona;
    /** Today at a glance: the turn's opening reads as JSON (turn.ts `loadSnapshot`). User data, fenced. */
    snapshot?: string;
    /** The always-present memory profile (Basic or Full on). User text, fenced. */
    memories?: ProfileLine[];
    /** Memory exists but the person hasn't turned it on (off, or not chosen yet). */
    memoryOff?: boolean;
}
