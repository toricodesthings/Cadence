/**
 * Prompt types shared by the block set (prompt-blocks.ts), the composer and
 * agent.ts. Keep names stable.
 */
import type { ApprovalMode } from "@cadence/contracts/ai";

export type Voice = "secretary" | "coach" | "minimalist" | "companion";

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
export interface AssistantPersona {
    persona: string;
    tone: string;
    verbosity: string;
    emoji: boolean;
    nickname?: string | null;
    assistantName?: string;
    customInstructions?: string | null;
    proactiveSuggestions: boolean;
    memoryEnabled: boolean;
    adaptiveTone: boolean;
}

/** A single retrieved memory (RAG, doc 06). Content is untrusted → fenced. */
export interface RetrievedMemory {
    id: string;
    content: string;
    type: "CORE" | "EPHEMERAL";
    salience: number;
}

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
