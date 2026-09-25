/**
 * Prompt types shared by the block set (prompt-blocks.ts), the composer and
 * agent.ts. Keep names stable.
 */
import type { ApprovalMode } from "@cadence/contracts/ai";
import type { UserSettings } from "@cadence/contracts/settings";
import type { RetrievedMemory } from "../memory/memory-retrieval";

type AssistantSettings = NonNullable<UserSettings["assistant"]>;

export type Voice = NonNullable<AssistantSettings["persona"]>;

/** The block set: static base sections in order, then the per-user/per-turn templates. */
export interface PromptBlocks {
    base: string[];
    voices: Record<Voice, string>;
    /** Appended to the voice when the workload is high (adaptive tone). */
    workloadHigh: string;
    /** Templates with {{placeholders}} resolved by the composer. */
    customInstructions: string;
    environment: string;
    memory: string;
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
    memories?: RetrievedMemory[];
}
