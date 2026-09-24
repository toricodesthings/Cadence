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
import { composePrompt, isWorkloadHigh } from "./prompt/prompt-composer";
import type { AssistantPersona, PromptRuntimeContext } from "./prompt/prompt-blocks.schema";
import { HELP_TOPICS } from "./tools/help";
import type { ApprovalMode } from "@cadence/contracts/ai";
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

/**
 * Thinking budget. Turns are short planning chores (read a few rows, draft one
 * proposal), so "low" keeps latency and cost down; raise it if tool choice slips.
 */
const REASONING_EFFORT = "low";

/** Language model via OpenRouter's native provider (Chat Completions, reasoning round-trip). */
function getModel(env: Env) {
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY || "dummy" });
    return openrouter(getModelId(env), {
        models: [getModelId(env), FALLBACK_CHAT_MODEL],
        reasoning: { effort: REASONING_EFFORT },
    });
}

/** Options resolved by the route before assembling the agent for one turn. */
export interface AgentBuildOptions {
    timezone: string;
    currentDate: string;     // the client's current instant, ISO-8601 (usually UTC "Z")
    locale?: string;
    approvalMode: ApprovalMode;
    nonce: string;           // per-request data-fence nonce (safety/injection-policy)
    queryText?: string;      // latest user message text — used for memory retrieval
}

/**
 * Load the user's burnout index + assistant settings inside RLS. They pick the
 * voice, the workload modifier and the Environment values.
 */
async function loadUserContext(
    env: Env,
    userId: string,
): Promise<{ burnoutIndex: number; persona: AssistantPersona; weekStart: PromptRuntimeContext["weekStart"] }> {
    const db = getDbClient(env);
    return withRls(db, userId, async (tx) => {
        const [metricsRow] = await tx
            .select({ currentBurnoutIndex: userMetrics.currentBurnoutIndex })
            .from(userMetrics)
            .where(eq(userMetrics.userId, userId))
            .limit(1);

        const [userRow] = await tx
            .select({ settings: users.settings })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        // Merge stored assistant settings over defaults → a complete persona.
        const stored = (userRow?.settings as Record<string, any> | undefined)?.assistant ?? {};
        const persona = { ...SETTINGS_DEFAULTS.assistant, ...stored } as AssistantPersona;
        const weekStart = ((userRow?.settings as any)?.dateTime?.weekStart ?? "Sunday") as PromptRuntimeContext["weekStart"];

        return { burnoutIndex: metricsRow?.currentBurnoutIndex ?? 10, persona, weekStart };
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

let promptHash: Promise<string> | undefined;

/**
 * Fingerprint of everything the model sees besides the conversation: the prompt
 * blocks, the Cadence guide, and each tool's name, description and input schema. Stamped on every
 * assistant message so a behavior change can be traced to a prompt or tool edit.
 * Static per deploy, so computed once per isolate.
 */
function getPromptHash(tools: ToolSet): Promise<string> {
    promptHash ??= (async () => {
        const toolDefs = await Promise.all(Object.entries(tools).map(async ([name, t]) =>
            [name, t.description, await asSchema(t.inputSchema).jsonSchema]));
        return hashIdentifier(JSON.stringify([PROMPT_BLOCKS, HELP_TOPICS, toolDefs]));
    })();
    return promptHash;
}

/**
 * The user's clock for this turn. The model is shown local wall-clock time to the
 * minute with its offset and weekday ("2026-09-21 22:30 -04:00 (Monday)"), never a
 * UTC "Z" instant it would misread as local. Minute precision keeps the prompt
 * byte-identical within a minute (provider caching). Tools get the zone + local date.
 */
export function userClock(timezone: string | undefined, currentDate: string) {
    const tz = resolveTimeZone(timezone);
    const parsed = new Date(currentDate);
    const now = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);
    const iso = toZonedIso(now, tz); // 2026-09-21T22:30:00-04:00
    const localTime = `${iso.slice(0, 10)} ${iso.slice(11, 16)} ${iso.slice(19)} (${weekday})`;
    return { timezone: tz, now, today: toLocalDateStr(now, tz), localTime };
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
    const { burnoutIndex, persona, weekStart } = await loadUserContext(env, userId);
    const memories = await maybeRetrieveMemories(env, userId, persona, opts.queryText);

    const instructions = composePrompt(
        PROMPT_BLOCKS,
        {
            timezone: clock.timezone,
            now: clock.localTime,
            locale,
            weekStart,
            approvalMode: opts.approvalMode,
            workloadHigh: isWorkloadHigh(burnoutIndex, persona.adaptiveTone),
            persona,
            memories,
        },
        opts.nonce,
    );

    const agentCtx: AgentContext = {
        timezone: clock.timezone,
        currentDate: clock.now.toISOString(),
        today: clock.today,
        weekStart,
        locale,
        nonce: opts.nonce,
    };
    const tools = buildToolRegistry(env, userId, agentCtx);

    const agent = new ToolLoopAgent({
        model: getModel(env),
        instructions,
        tools,
        stopWhen: isStepCount(MAX_TOOL_STEPS),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
    });

    return { agent, modelId: getModelId(env), promptHash: await getPromptHash(tools) };
}
