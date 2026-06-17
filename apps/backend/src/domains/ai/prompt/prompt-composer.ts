/**
 * Pure, synchronous prompt composer (doc 03 §3). No I/O — all async (DB block
 * load, metrics, RAG) happens upstream in the cache loader / agent.ts. Given the
 * same (compiled blocks, runtime ctx, nonce) it produces byte-identical output,
 * which is required for provider prompt caching and reproducible debugging.
 *
 * Layout: Base ⧺ Auxiliary, joined by `\n\n---\n\n`. The stable Base prefix comes
 * first (provider-cache friendly, doc 04 §6).
 */
import { fenceData, sanitizeUntrusted } from "../safety/injection-policy";
import { personaToDirectives } from "./persona-directives";
import type {
    CompiledPromptBlocks,
    HumanMetrics,
    PromptBlock,
    PromptBlockKind,
    PromptRuntimeContext,
} from "./prompt-blocks.schema";

/** Stable separator between every block in the final string (doc 03 §3 step 4). */
const BLOCK_SEPARATOR = "\n\n---\n\n";

/**
 * Tone-morph policy (doc 03 §5). Thresholds live HERE (the single reviewable
 * place); the wording lives in the tone_* blocks (DB-tunable, no deploy).
 *
 * burnoutIndex > 70 AND adaptiveTone → protective; otherwise neutral. When the
 * user disables adaptiveTone (doc 07 §3) we always pick neutral.
 */
export function selectToneBlock(
    metrics: HumanMetrics,
    adaptiveTone: boolean,
): "tone_neutral" | "tone_protective" {
    if (adaptiveTone && metrics.burnoutIndex > 70) return "tone_protective";
    return "tone_neutral";
}

/**
 * Auxiliary kinds whose content is user/DB-derived and therefore wrapped in a
 * labeled data fence (doc 03 §2.2 / §3 step 3). tone_* blocks are
 * system-authored copy and are NOT fenced.
 */
const FENCED_AUX_KINDS: ReadonlySet<PromptBlockKind> = new Set([
    "runtime_context",
    "human_metrics",
    "persona_customization",
    "retrieved_memory",
    "workspace_snapshot",
]);

/**
 * Strict whitelist placeholder resolver. Each token maps to a value derived from
 * the runtime context. An UNKNOWN `{{...}}` token throws (fail closed, doc 03 §2)
 * so a typo can never ship an empty safety rule; the caller logs
 * `prompt_placeholder_unknown`.
 *
 * Whitelisted tokens and their mapping:
 *   {{timezone}}          → ctx.timezone
 *   {{currentDate}}       → ctx.currentDateISO (local ISO clock)
 *   {{weekStart}}         → ctx.weekStart
 *   {{locale}}            → ctx.locale
 *   {{burnoutIndex}}      → ctx.metrics.burnoutIndex
 *   {{rescheduleVelocity}}→ ctx.metrics.rescheduleVelocity
 *   {{overdueCarryLoad}}  → ctx.metrics.overdueCarryLoad
 *   {{personaDirectives}} → personaToDirectives(ctx.persona) (sanitized below)
 *   {{retrievedMemory}}   → rendered memory list (sanitized below)
 *   {{workspaceSnapshot}} → counts summary
 *   {{nickname}}          → ctx.persona?.nickname (sanitized below)
 *   {{assistantName}}     → ctx.persona?.assistantName (sanitized below)
 *
 * Untrusted values (persona directives, names, memory) are sanitized with the
 * per-request nonce HERE so they are inert before fencing happens around the
 * whole block.
 */
function buildResolver(
    ctx: PromptRuntimeContext,
    nonce: string,
): Map<string, string> {
    const persona = ctx.persona;

    const personaDirectives = persona
        ? sanitizeUntrusted(personaToDirectives(persona), nonce)
        : "";

    const nickname = persona?.nickname
        ? sanitizeUntrusted(persona.nickname, nonce)
        : "";
    const assistantName = persona?.assistantName
        ? sanitizeUntrusted(persona.assistantName, nonce)
        : "";

    const retrievedMemory = renderMemories(ctx, nonce);
    const workspaceSnapshot = renderSnapshot(ctx);

    return new Map<string, string>([
        ["timezone", ctx.timezone],
        ["currentDate", ctx.currentDateISO],
        ["weekStart", ctx.weekStart],
        ["locale", ctx.locale],
        ["burnoutIndex", String(ctx.metrics.burnoutIndex)],
        ["rescheduleVelocity", String(ctx.metrics.rescheduleVelocity)],
        ["overdueCarryLoad", String(ctx.metrics.overdueCarryLoad)],
        ["personaDirectives", personaDirectives],
        ["retrievedMemory", retrievedMemory],
        ["workspaceSnapshot", workspaceSnapshot],
        ["nickname", nickname],
        ["assistantName", assistantName],
    ]);
}

/** Render retrieved memories as a compact, sanitized, untrusted text block. */
function renderMemories(ctx: PromptRuntimeContext, nonce: string): string {
    const memories = ctx.memories ?? [];
    if (memories.length === 0) return "";
    return memories
        .map((m) => `- (${m.type}) ${sanitizeUntrusted(m.content, nonce)}`)
        .join("\n");
}

/** Render the counts-only workspace snapshot (doc 03 §2.2). Trusted, computed. */
function renderSnapshot(ctx: PromptRuntimeContext): string {
    const s = ctx.snapshot;
    if (!s) return "";
    return `active tasks: ${s.activeTasks}, overdue: ${s.overdue}, projects: ${s.projects}`;
}

/** {{token}} matcher — token is a bare identifier (letters only here). */
const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/**
 * Interpolate `{{placeholders}}` against the whitelist. Unknown token → throw an
 * Error naming the token (fail closed).
 */
function interpolate(template: string, resolver: Map<string, string>): string {
    return template.replace(PLACEHOLDER, (_match, token: string) => {
        if (!resolver.has(token)) {
            throw new Error(`prompt_placeholder_unknown: {{${token}}}`);
        }
        return resolver.get(token) as string;
    });
}

/**
 * Compose the final system-prompt string from compiled blocks + runtime context.
 *
 * Steps (doc 03 §3): blocks arrive already partitioned + sorted by orderIndex;
 * interpolate placeholders via the strict whitelist (unknown → throw); fence
 * every user/DB-derived auxiliary block with the per-request nonce; concatenate
 * Base ⧺ Auxiliary with `\n\n---\n\n`; return one string.
 */
export function composePrompt(
    compiled: CompiledPromptBlocks,
    ctx: PromptRuntimeContext,
    nonce: string,
): string {
    const resolver = buildResolver(ctx, nonce);

    const baseParts = compiled.base.map((block) =>
        interpolate(block.template, resolver),
    );

    const auxParts = compiled.auxiliary.map((block) =>
        renderAuxBlock(block, resolver, nonce),
    );

    return [...baseParts, ...auxParts].join(BLOCK_SEPARATOR);
}

/**
 * Render one auxiliary block: interpolate first, then fence if it is a
 * user/DB-derived kind so its content reads as DATA per the safety authority rule.
 */
function renderAuxBlock(
    block: PromptBlock,
    resolver: Map<string, string>,
    nonce: string,
): string {
    const rendered = interpolate(block.template, resolver);
    if (!FENCED_AUX_KINDS.has(block.kind)) return rendered;
    return fenceData({
        nonce,
        kind: block.kind,
        trust: "untrusted",
        content: rendered,
    });
}
