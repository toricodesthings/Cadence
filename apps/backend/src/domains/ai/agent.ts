import { ToolLoopAgent, asSchema, isStepCount, type ToolSet } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { eq } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { users, userMetrics } from "../../db/schema";
import { withRls } from "../../platform/rls";
import { logger, hashIdentifier, issuesFromError } from "../../platform/log";
import { SETTINGS_DEFAULTS } from "@cadence/contracts/settings";
import { buildToolRegistry, type AgentContext } from "./tools/index";
import { PROMPT_BLOCKS } from "./prompt/prompt-blocks";
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
import { resolveTimeZone, toLocalDateStr, toZonedIso } from "../../platform/date-utils";

/** Default chat model: cost-effective, low-latency. Overridable via AI_CHAT_MODEL. */
const DEFAULT_CHAT_MODEL = "google/gemini-3.8-flash";

/** The model id used for the current request (config, never hard-coded in prose). */
export function getModelId(env: Env): string {
    return env.AI_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL;
}

/** Served by OpenRouter when the chat model is unavailable or rate-limited. */
const FALLBACK_CHAT_MODEL = "google/gemini-3.7-flash";

/** Language model via OpenRouter's native provider (Chat Completions, reasoning round-trip). */
function getModel(env: Env) {
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY || "dummy" });
    return openrouter(getModelId(env), { models: [getModelId(env), FALLBACK_CHAT_MODEL] });
}

/** Options resolved by the route before assembling the agent for one turn. */
export interface AgentBuildOptions {
    timezone: string;
    currentDate: string;     // the client's current instant, ISO-8601 (usually UTC "Z")
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

let promptHash: Promise<string> | undefined;

/**
 * Fingerprint of everything the model sees besides the conversation: the prompt
 * blocks plus each tool's name, description and input schema. Stamped on every
 * assistant message so a behavior change can be traced to a prompt or tool edit.
 * Static per deploy, so computed once per isolate.
 */
function getPromptHash(tools: ToolSet): Promise<string> {
    promptHash ??= (async () => {
        const toolDefs = await Promise.all(Object.entries(tools).map(async ([name, t]) =>
            [name, t.description, await asSchema(t.inputSchema).jsonSchema]));
        return hashIdentifier(JSON.stringify([PROMPT_BLOCKS, toolDefs]));
    })();
    return promptHash;
}

/**
 * The user's clock for this turn. The model is shown local wall-clock time with
 * its offset and weekday ("2026-09-21T22:30:00-04:00 (Monday)"), never a UTC "Z"
 * instant it would misread as local; tools get the same zone and local date.
 */
export function userClock(timezone: string | undefined, currentDate: string) {
    const tz = resolveTimeZone(timezone);
    const parsed = new Date(currentDate);
    const now = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);
    return { timezone: tz, now, today: toLocalDateStr(now, tz), localTime: `${toZonedIso(now, tz)} (${weekday})` };
}

/**
 * Assemble the per-request agent: composed system prompt (Base + Auxiliary) +
 * the full RLS-scoped tool surface. Returns the agent, the resolved model id and
 * the prompt hash (for message metadata / conversation.model).
 */
export async function getAgentInstance(
    env: Env,
    userId: string,
    opts: AgentBuildOptions,
): Promise<{ agent: ToolLoopAgent<never, ReturnType<typeof buildToolRegistry>>; modelId: string; promptHash: string }> {
    const locale = opts.locale ?? "en";
    const clock = userClock(opts.timezone, opts.currentDate);
    const { metrics, persona, weekStart } = await loadUserContext(env, userId);
    const memories = await maybeRetrieveMemories(env, userId, persona, opts.queryText);

    const ctx: PromptRuntimeContext = {
        timezone: clock.timezone,
        currentDateISO: clock.localTime,
        locale,
        weekStart,
        metrics,
        persona,
        memories,
    };

    const tone = selectToneBlock(metrics, persona.adaptiveTone);
    const instructions = composePrompt(
        { base: PROMPT_BLOCKS.base, auxiliary: selectAuxiliary(PROMPT_BLOCKS, tone, memories.length > 0) },
        ctx,
        opts.nonce,
    );

    const agentCtx: AgentContext = {
        timezone: clock.timezone,
        currentDate: clock.now.toISOString(),
        today: clock.today,
        weekStart,
        locale,
    };
    const tools = buildToolRegistry(env, userId, agentCtx);

    const agent = new ToolLoopAgent({
        model: getModel(env),
        instructions,
        tools,
        stopWhen: isStepCount(MAX_TOOL_STEPS),
        temperature: 0.4,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
    });

    return { agent, modelId: getModelId(env), promptHash: await getPromptHash(tools) };
}
