/**
 * Prompt-block types + Zod row validation for the prompt-composition platform.
 *
 * See docs/ai_upgrade/03_system_prompt_composition.md (shape & semantics) and
 * docs/ai_upgrade/04_prompt_storage_caching.md (where the bytes come from).
 *
 * These are the contract types other AI sub-modules (agent.ts, prompt-cache,
 * prompt-composer, persona-directives) depend on. Keep names stable.
 */
import { z } from "zod";
import { aiPromptBlockKindEnum } from "../../../db/schema";

/** The 12 canonical block kinds — the `ai_prompt_block_kind` pgEnum is the one list. */
export type PromptBlockKind = (typeof aiPromptBlockKindEnum.enumValues)[number];

/** Composition layer. Base is highest authority and always precedes Auxiliary. */
export type PromptLayer = "base" | "auxiliary";

/** A single modular prompt fragment (a DB row or a compiled-in default). */
export interface PromptBlock {
    kind: PromptBlockKind;
    layer: PromptLayer;
    locale: string;
    orderIndex: number;
    /** May contain {{placeholders}} resolved by the composer. */
    template: string;
    version: number;
}

/**
 * The parsed, partitioned, ordered block set cached per revision. The composer
 * consumes this directly — both arrays are pre-sorted by `orderIndex`.
 */
export interface CompiledPromptBlocks {
    base: PromptBlock[];
    auxiliary: PromptBlock[];
    revision: number;
}

/** Live psychological-load metrics that drive tone morphing (from user_metrics). */
export interface HumanMetrics {
    burnoutIndex: number;
    rescheduleVelocity: number;
    overdueCarryLoad: number;
}

/**
 * User-chosen assistant personality (from users.settings.assistant — doc 07).
 * `customInstructions` is free text and UNTRUSTED; the composer sanitizes + fences
 * it separately, the persona mapper never inlines it.
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

/** Token-bounded counts-only workspace summary to reduce first-turn tool calls. */
export interface WorkspaceSnapshot {
    activeTasks: number;
    overdue: number;
    projects: number;
}

/**
 * Everything the composer needs at request time. All async (DB block load,
 * metrics fetch, RAG) happens before this is built, so the composer stays pure.
 */
export interface PromptRuntimeContext {
    timezone: string;
    currentDateISO: string;
    locale: string;
    weekStart: "Sunday" | "Monday" | "Saturday";
    metrics: HumanMetrics;
    persona?: AssistantPersona;
    memories?: RetrievedMemory[];
    snapshot?: WorkspaceSnapshot;
}

/**
 * Validates a row loaded from `ai_prompt_blocks` into a `PromptBlock`. Drops the
 * DB-only columns (id, isActive, notes, timestamps) — the composer only needs the
 * compositional fields. Fails closed on a malformed/unknown kind or layer.
 */
export const promptBlockRowSchema = z.object({
    kind: z.enum(aiPromptBlockKindEnum.enumValues),
    layer: z.enum(["base", "auxiliary"]),
    locale: z.string(),
    orderIndex: z.number().int(),
    template: z.string(),
    version: z.number().int(),
}) satisfies z.ZodType<PromptBlock>;
