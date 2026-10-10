import { ToolLoopAgent, asSchema, hasToolCall, isStepCount, type SystemModelMessage, type ToolSet } from "ai";
import { createOpenRouter, type OpenRouterChatSettings } from "@openrouter/ai-sdk-provider";
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
import { approvalFor } from "./safety/approval";
import type { ApprovalMode } from "@cadence/contracts/ai";
import { MAX_OUTPUT_TOKENS, MAX_TOOL_STEPS } from "./safety/input-guard";
import { getModelId } from "./model-router";
import { isMemoryEnabled, embedText, type EmbeddingSpend } from "./memory/embedding";
import { retrieveMemories, type RetrievedMemory } from "./memory/memory-retrieval";
import type { Env } from "../../types/env";
import { isZone, todayIn, toZonedIso } from "@cadence/domain/time";

/** Served by OpenRouter when the chat model is unavailable or rate-limited. */
const FALLBACK_CHAT_MODEL = "google/gemini-3.7-flash";

/**
 * Thinking budget. Turns are short planning chores (read a few rows, draft one
 * proposal). Fixed for every turn: a change invalidates the provider's cached history.
 */
const REASONING_EFFORT = "medium";

/** A provider prompt-cache breakpoint (5-minute TTL, refreshed by every hit). */
const CACHE_BREAKPOINT = { type: "ephemeral" } as const;

/** Anthropic caches only behind explicit breakpoints; the other chat models cache prefixes implicitly. */
function needsCacheBreakpoints(modelId: string): boolean {
    return modelId.startsWith("anthropic/");
}

/**
 * OpenRouter settings for one chat model. A basic model that fails over lands on the
 * standard model before the last-resort fallback. Each provider keeps its own prompt
 * cache, so the route is pinned (Anthropic's own endpoint for Claude, DeepInfra, the
 * cheapest, for the rest) and the ids carry no `:nitro`, whose throughput sort hops
 * providers. Fallbacks stay on: an outage costs the cache, not the turn. Claude also
 * gets the top-level automatic breakpoint, which follows the end of the conversation
 * so each tool-loop step reads the step before it from cache.
 */
export function chatModelSettings(env: Env, modelId: string, userHash: string): OpenRouterChatSettings {
    const breakpoints = needsCacheBreakpoints(modelId);
    return {
        models: [...new Set([modelId, getModelId(env), FALLBACK_CHAT_MODEL])],
        reasoning: { effort: REASONING_EFFORT },
        provider: { order: [breakpoints ? "Anthropic" : "DeepInfra"], allow_fallbacks: true },
        user: userHash,
        ...(breakpoints && { cache_control: CACHE_BREAKPOINT }),
    };
}

/**
 * The system prompt as the agent sends it. For Claude it carries an explicit cache
 * breakpoint: tools render before the system prompt, so this caches both (~15k
 * tokens, identical for every user and turn) whatever happens later in the messages.
 */
export function chatInstructions(instructions: string, modelId: string): string | SystemModelMessage {
    if (!needsCacheBreakpoints(modelId)) return instructions;
    return { role: "system", content: instructions, providerOptions: { openrouter: { cacheControl: CACHE_BREAKPOINT } } };
}

/** Language model via OpenRouter's native provider (Chat Completions, reasoning round-trip). */
function getModel(env: Env, modelId: string, userHash: string) {
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY || "dummy" });
    return openrouter(modelId, chatModelSettings(env, modelId, userHash));
}

/** Options resolved by the route before assembling the agent for one turn. */
export interface AgentBuildOptions {
    timezone: string;        // users.time_zone, already synced for this turn (ai.route)
    currentDate: string;     // the client's current instant, ISO-8601 (usually UTC "Z")
    locale?: string;
    approvalMode: ApprovalMode;
    modelId?: string;        // the router's pick for this turn (model-router.ts); default the standard model
    nonce: string;           // per-request data-fence nonce (safety/injection-policy)
    queryText?: string;      // latest user message text — used for memory retrieval
    requestId?: string;      // tags the turn's side-call log lines (embedding)
    waitUntil?: (promise: Promise<unknown>) => void; // keeps post-commit metrics alive
}

/**
 * Load the user's burnout index + assistant settings inside RLS. They pick the
 * voice, the workload modifier and the Environment values.
 */
async function loadUserContext(
    env: Env,
    userId: string,
): Promise<{ burnoutIndex: number | null; persona: AssistantPersona; weekStart: PromptRuntimeContext["weekStart"] }> {
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

        // No metrics row (or a null index) means no evidence yet — unknown, not a low score.
        return { burnoutIndex: metricsRow?.currentBurnoutIndex ?? null, persona, weekStart };
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
    userHash: string,
    persona: AssistantPersona,
    queryText: string | undefined,
    requestId: string | undefined,
): Promise<{ memories: RetrievedMemory[]; spend?: EmbeddingSpend }> {
    if (!queryText || !isMemoryEnabled(env, persona.memoryEnabled)) return { memories: [] };
    let spend: EmbeddingSpend | undefined; // kept if the similarity query fails after the paid embed
    try {
        const embedded = await embedText(env, queryText, { requestId, userHash });
        spend = embedded.spend;
        const db = getDbClient(env);
        // Only rows embedded by the same model as the query are comparable.
        const memories = await withRls(db, userId, (tx) => retrieveMemories(tx, userId, embedded.embedding, embedded.spend.model));
        return { memories, spend };
    } catch (error) {
        logger.warn("ai", "memory_retrieval_failed", {
            userHash,
            issues: issuesFromError(error),
        });
        return { memories: [], spend };
    }
}

type SnapshotTools = Pick<ReturnType<typeof buildToolRegistry>,
    "get_schedule_window" | "get_tasks" | "get_habit_status_today" | "get_inbox_items" | "get_events">;

/**
 * Today at a glance: the reads most turns open with, run before the model starts
 * so "plan my afternoon" needs no read step. Same tools and shapes the model
 * already knows; a failed read is left out. Small caps keep it ~1k tokens.
 */
export async function loadSnapshot(tools: SnapshotTools, today: string): Promise<string> {
    const read = async (t: { execute?: unknown }, input: object): Promise<any> => {
        const result = await (t.execute as (input: object, options: object) => Promise<unknown>)(input, { toolCallId: "snapshot", messages: [] });
        return (result as { ok?: boolean })?.ok === false ? undefined : result;
    };
    const [schedule, overdue, routines, capture, events] = await Promise.all([
        read(tools.get_schedule_window, { start: today, end: today, includeDone: false, limit: 12 }),
        read(tools.get_tasks, { dueWindow: "overdue", limit: 5 }),
        read(tools.get_habit_status_today, {}),
        read(tools.get_inbox_items, { includeProcessed: false, limit: 5 }),
        read(tools.get_events, {}),
    ]);
    const targetTime = new Map<string, string | null>(schedule?.routines.map((r: any) => [r.id, r.targetTime]));
    return JSON.stringify({
        schedule: schedule && { tasks: schedule.tasks, more: schedule.more },
        overdue,
        routines: routines?.statuses.map((s: any) => ({ ...s, targetTime: targetTime.get(s.habitId) ?? undefined })),
        capture,
        events: events?.events.filter((e: { daysUntil: number }) => e.daysUntil <= 7),
    });
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
 * The user's clock for this turn, from `users.time_zone` (synced by ai.route). The model is shown local wall-clock time to the
 * minute with its offset and weekday ("2026-09-21 22:30 -04:00 (Monday)"), never a
 * UTC "Z" instant it would misread as local. Tools get the zone + local date.
 */
export function userClock(timezone: string | undefined, currentDate: string) {
    const tz = isZone(timezone) ? timezone : "UTC";
    const parsed = new Date(currentDate);
    const now = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);
    const iso = toZonedIso(now, tz); // 2026-09-21T22:30:00-04:00
    const localTime = `${iso.slice(0, 10)} ${iso.slice(11, 16)} ${iso.slice(19)} (${weekday})`; // time-ok: slicing the zoned ISO string for the prompt, not deriving a day
    return { timezone: tz, now, today: todayIn(tz, now), localTime };
}

/**
 * Assemble the per-request agent: the static system prompt + the full RLS-scoped
 * tool surface. Returns the agent, the resolved model id, the prompt hash (for
 * message metadata / conversation.model) and the per-turn context, which the
 * caller appends to the last user message (`withTurnContext`).
 */
export async function getAgentInstance(
    env: Env,
    userId: string,
    opts: AgentBuildOptions,
): Promise<{ agent: ToolLoopAgent<never, ReturnType<typeof buildToolRegistry>>; modelId: string; promptHash: string; turnContext: string; embeddingSpend?: EmbeddingSpend }> {
    const locale = opts.locale ?? "en";
    const modelId = opts.modelId ?? getModelId(env);
    const userHash = await hashIdentifier(userId);
    const clock = userClock(opts.timezone, opts.currentDate);
    const { burnoutIndex, persona, weekStart } = await loadUserContext(env, userId);
    const agentCtx: AgentContext = {
        timezone: clock.timezone,
        currentDate: clock.now.toISOString(),
        today: clock.today,
        weekStart,
        locale,
        nonce: opts.nonce,
        waitUntil: opts.waitUntil,
        approvalMode: opts.approvalMode,
    };
    const tools = buildToolRegistry(env, userId, agentCtx);
    const [{ memories, spend: embeddingSpend }, snapshot] = await Promise.all([
        maybeRetrieveMemories(env, userId, userHash, persona, opts.queryText, opts.requestId),
        loadSnapshot(tools, clock.today),
    ]);

    const { instructions, turnContext } = composePrompt(
        PROMPT_BLOCKS,
        {
            timezone: clock.timezone,
            now: clock.localTime,
            locale,
            weekStart,
            approvalMode: opts.approvalMode,
            workloadHigh: isWorkloadHigh(burnoutIndex, persona.adaptiveTone),
            persona,
            snapshot,
            memories,
        },
        opts.nonce,
    );

    const agent = new ToolLoopAgent({
        model: getModel(env, modelId, userHash),
        instructions: chatInstructions(instructions, modelId),
        tools,
        // A question to the user ends the turn: their reply is the next message.
        stopWhen: [isStepCount(MAX_TOOL_STEPS), hasToolCall("ask_user")],
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // Writes run here on the server; this decides which wait for the user's tap.
        // Approvals are HMAC-signed at issue, so an edited or forged one fails closed.
        toolApproval: approvalFor(opts.approvalMode),
        experimental_toolApprovalSecret: env.TOOL_APPROVAL_SECRET,
    });

    return { agent, modelId, promptHash: await getPromptHash(tools), turnContext, embeddingSpend };
}
