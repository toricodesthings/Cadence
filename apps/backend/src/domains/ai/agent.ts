import { ToolLoopAgent, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { eq } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { users, userMetrics } from "../../db/schema";
import { withRls } from "../../platform/rls";
import { logger, hashIdentifier, issuesFromError } from "../../platform/log";
import { SETTINGS_DEFAULTS } from "@cadence/contracts/settings";
import { buildToolRegistry, type AgentContext } from "./tools/index";
import { getCompiledBlocks, DEFAULT_PROMPT_BLOCKS } from "./prompt/prompt-cache";
import { composePrompt, selectToneBlock } from "./prompt/prompt-composer";
import type {
    AssistantPersona,
    CompiledPromptBlocks,
    HumanMetrics,
    PromptRuntimeContext,
} from "./prompt/prompt-blocks.schema";
import { MAX_OUTPUT_TOKENS, MAX_TOOL_STEPS } from "./safety/input-guard";
import { isMemoryEnabled, embedText } from "./memory/embedding";
import { retrieveMemories, type RetrievedMemory } from "./memory/memory-retrieval";
import type { Env } from "../../types/env";

/** Default chat model: cost-effective, low-latency. Overridable via AI_CHAT_MODEL. */
const DEFAULT_CHAT_MODEL = "google/gemini-2.5-flash";

/** The model id used for the current request (config, never hard-coded in prose). */
export function getModelId(env: Env): string {
    return env.AI_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL;
}

/** OpenAI-compatible language model via OpenRouter (existing routing). */
export function getModel(env: Env) {
    const apiKey = env.OPENROUTER_API_KEY || "dummy";
    const openrouter = createOpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey });
    return openrouter(getModelId(env));
}

/** Options resolved by the route before assembling the agent for one turn. */
export interface AgentBuildOptions {
    timezone: string;
    currentDate: string;     // ISO local clock
    locale?: string;
    nonce: string;           // per-request data-fence nonce (safety/injection-policy)
    queryText?: string;      // latest user message text — used for memory retrieval
}

/**
 * Load the user's live metrics + assistant settings inside RLS. These drive tone
 * morphing and persona customization — replacing the old hard-coded prompt branch.
 */
async function loadUserContext(
    env: Env,
    userId: string,
): Promise<{ metrics: HumanMetrics; persona: AssistantPersona; weekStart: PromptRuntimeContext["weekStart"] }> {
    const db = getDbClient(env);
    return withRls(db, userId, async (tx) => {
        const [metricsRow] = await tx
            .select({
                rescheduleVelocity: userMetrics.rescheduleVelocity,
                currentBurnoutIndex: userMetrics.currentBurnoutIndex,
                overdueCarryLoad: userMetrics.overdueCarryLoad,
            })
            .from(userMetrics)
            .where(eq(userMetrics.userId, userId))
            .limit(1);

        const [userRow] = await tx
            .select({ settings: users.settings })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        const metrics: HumanMetrics = {
            burnoutIndex: metricsRow?.currentBurnoutIndex ?? 10,
            rescheduleVelocity: metricsRow?.rescheduleVelocity ?? 0,
            overdueCarryLoad: metricsRow?.overdueCarryLoad ?? 0,
        };

        // Merge stored assistant settings over defaults → a complete persona.
        const stored = (userRow?.settings as Record<string, any> | undefined)?.assistant ?? {};
        const persona = { ...SETTINGS_DEFAULTS.assistant, ...stored } as AssistantPersona;
        const weekStart = ((userRow?.settings as any)?.dateTime?.weekStart ?? "Sunday") as PromptRuntimeContext["weekStart"];

        return { metrics, persona, weekStart };
    });
}

/**
 * Retrieve top-k memories for the turn — feature-flagged (server AND per-user).
 * Embedding (an HTTP call) runs OUTSIDE any transaction; the similarity query is
 * RLS-scoped. Failures degrade to no memories (never block the chat path).
 */
async function maybeRetrieveMemories(
    env: Env,
    userId: string,
    persona: AssistantPersona,
    queryText: string | undefined,
): Promise<RetrievedMemory[]> {
    if (!queryText || !isMemoryEnabled(env, persona.memoryEnabled)) return [];
    try {
        const queryEmbedding = await embedText(env, queryText);
        const db = getDbClient(env);
        return await withRls(db, userId, (tx) => retrieveMemories(tx, userId, queryEmbedding));
    } catch (error) {
        logger.warn("ai", "memory_retrieval_failed", {
            userHash: await hashIdentifier(userId),
            issues: issuesFromError(error),
        });
        return [];
    }
}

/**
 * Filter the compiled auxiliary blocks for this turn: keep only the selected tone
 * block, and drop data blocks with nothing to say (no memories / no snapshot).
 */
function selectAuxiliary(
    compiled: CompiledPromptBlocks,
    tone: "tone_neutral" | "tone_protective",
    hasMemories: boolean,
): CompiledPromptBlocks["auxiliary"] {
    return compiled.auxiliary.filter((block) => {
        if (block.kind === "tone_neutral" || block.kind === "tone_protective") return block.kind === tone;
        if (block.kind === "retrieved_memory") return hasMemories;
        if (block.kind === "workspace_snapshot") return false; // snapshot pre-fetch not wired in v1
        return true;
    });
}

/** Compile the compiled-in default Base+Auxiliary floor (used on composition failure). */
function compileDefaults(): CompiledPromptBlocks {
    const byOrder = (a: { orderIndex: number }, b: { orderIndex: number }) => a.orderIndex - b.orderIndex;
    return {
        base: DEFAULT_PROMPT_BLOCKS.filter((b) => b.layer === "base").sort(byOrder),
        auxiliary: DEFAULT_PROMPT_BLOCKS.filter((b) => b.layer === "auxiliary").sort(byOrder),
        revision: 0,
    };
}

/**
 * Assemble the per-request agent: DB-composed system prompt (Base + Auxiliary) +
 * the full RLS-scoped tool surface. Returns the agent and the resolved model id
 * (for message metadata / conversation.model).
 */
export async function getAgentInstance(
    env: Env,
    userId: string,
    opts: AgentBuildOptions,
): Promise<{ agent: ToolLoopAgent<never, ReturnType<typeof buildToolRegistry>>; modelId: string }> {
    const locale = opts.locale ?? "en";
    const { metrics, persona, weekStart } = await loadUserContext(env, userId);
    const memories = await maybeRetrieveMemories(env, userId, persona, opts.queryText);

    const ctx: PromptRuntimeContext = {
        timezone: opts.timezone,
        currentDateISO: opts.currentDate,
        locale,
        weekStart,
        metrics,
        persona,
        memories,
    };

    const tone = selectToneBlock(metrics, persona.adaptiveTone);
    const compiled = await getCompiledBlocks(env, locale);
    const forTurn: CompiledPromptBlocks = {
        base: compiled.base,
        auxiliary: selectAuxiliary(compiled, tone, memories.length > 0),
        revision: compiled.revision,
    };

    // Compose; on a placeholder error (typo in a DB block) fail closed to the
    // compiled-in default Base rather than the request (doc 03 §6 / 04 §4).
    let instructions: string;
    try {
        instructions = composePrompt(forTurn, ctx, opts.nonce);
    } catch (error) {
        logger.warn("ai", "prompt_placeholder_unknown", {
            userHash: await hashIdentifier(userId),
            issues: issuesFromError(error),
        });
        const fallback = compileDefaults();
        instructions = composePrompt(
            { base: fallback.base, auxiliary: selectAuxiliary(fallback, tone, memories.length > 0), revision: fallback.revision },
            ctx,
            opts.nonce,
        );
    }

    const agentCtx: AgentContext = {
        timezone: opts.timezone,
        currentDate: opts.currentDate,
        weekStart,
        locale,
    };

    const agent = new ToolLoopAgent({
        model: getModel(env),
        instructions,
        tools: buildToolRegistry(env, userId, agentCtx),
        stopWhen: stepCountIs(MAX_TOOL_STEPS),
        temperature: 0.4,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
    });

    return { agent, modelId: getModelId(env) };
}
