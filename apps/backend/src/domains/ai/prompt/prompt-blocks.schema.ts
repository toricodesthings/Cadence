/**
 * Prompt-block types shared by the block set (prompt-blocks.ts), the composer,
 * persona directives and agent.ts. Keep names stable.
 */

/** The 12 canonical block kinds. */
export type PromptBlockKind =
    | "identity" | "safety" | "operating_principles" | "output_contract" | "tool_policy"
    | "runtime_context" | "human_metrics" | "persona_customization"
    | "retrieved_memory" | "workspace_snapshot" | "tone_neutral" | "tone_protective";

/** Composition layer. Base is highest authority and always precedes Auxiliary. */
export type PromptLayer = "base" | "auxiliary";

/** A single modular prompt fragment (one markdown file in ./blocks). */
export interface PromptBlock {
    kind: PromptBlockKind;
    layer: PromptLayer;
    /** May contain {{placeholders}} resolved by the composer. */
    template: string;
}

/** The block set, partitioned by layer; each array is in composition order. */
export interface CompiledPromptBlocks {
    base: PromptBlock[];
    auxiliary: PromptBlock[];
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
