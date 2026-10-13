import { ToolLoopAgent, asSchema, hasToolCall, isStepCount, type SystemModelMessage, type ToolSet } from "ai";
import { createOpenRouter, type OpenRouterChatSettings } from "@openrouter/ai-sdk-provider";
import { eq } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { users, userMetrics } from "../../db/schema";
import { withRls } from "../../platform/rls";
import { logger, hashIdentifier, issuesFromError } from "../../platform/log";
import { SETTINGS_DEFAULTS, type UserSettings } from "@cadence/contracts/settings";
import { buildToolRegistry, type AgentContext } from "./tools/index";
import { PROMPT_BLOCKS } from "./prompt/prompt-blocks";
import { composePrompt, isWorkloadHigh } from "./prompt/prompt-composer";
import type { AssistantPersona, PromptRuntimeContext, PromptPackaging } from "./prompt/prompt-blocks.schema";
import { HELP_TOPICS } from "./tools/help";
import { approvalFor } from "./safety/approval";
import type { ApprovalMode } from "@cadence/contracts/ai";
import { MAX_OUTPUT_TOKENS, MAX_TOOL_STEPS } from "./safety/input-guard";
import { getModelId } from "./model-router";
import { embedText, getEmbeddingModelId } from "./memory/embedding";
import { isLearning } from "./memory/memory-mode";
import { isMemoryTool } from "@cadence/contracts/ai-tools";
import { loadProfileCoverage, recallFacts, type ProfileLine } from "./memory/memory-store";
import type { Env } from "../../types/env";
import { loadAgentSnapshot, userClock } from "./turn";
import { projectEvents } from "./tools/events";
import { normalizeSettings } from "../settings/settings.route";
import type { RunDiagnostics } from "./run-diagnostics";

/** Served by OpenRouter when the chat model is unavailable or rate-limited. */
const FALLBACK_CHAT_MODEL = "google/gemini-3.7-flash";

/**
 * Thinking budget. Turns are short planning chores (read a few rows, draft one
 * proposal). Fixed for every turn: a change invalidates the provider's cached history.
 */
const REASONING_EFFORT = "medium";

/** A provider prompt-cache breakpoint (5-minute TTL, refreshed by every hit). */
const STATIC_CACHE_BREAKPOINT = { type: "ephemeral" } as const;
const TURN_CACHE_BREAKPOINT = { type: "ephemeral" } as const;
const HOUR_CACHE_BREAKPOINT = { type: "ephemeral", ttl: "1h" } as const;

/** Offline/eval candidates; chat routes stay 5m/5m until the gap/cost experiment passes. */
export type CacheVariant = "5m-5m" | "1h-5m" | "1h-1h";

/**
 * A Claude model. Anthropic caches only behind explicit breakpoints (the other chat models cache
 * prefixes implicitly), and Claude leaves unused tool fields out, so its schemas skip the nulls.
 */
function isClaude(modelId: string): boolean {
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
export function chatModelSettings(env: Env, modelId: string, userHash: string, cacheVariant: CacheVariant = "5m-5m"): OpenRouterChatSettings {
    const breakpoints = isClaude(modelId);
    return {
        models: [...new Set([modelId, getModelId(env), FALLBACK_CHAT_MODEL])],
        reasoning: { effort: REASONING_EFFORT },
        provider: { order: [breakpoints ? "Anthropic" : "DeepInfra"], allow_fallbacks: true },
        user: userHash,
        ...(breakpoints && { cache_control: cacheVariant === "1h-1h" ? HOUR_CACHE_BREAKPOINT : TURN_CACHE_BREAKPOINT }),
    };
}

/**
 * The system prompt as the agent sends it. For Claude it carries an explicit cache
 * breakpoint: tools render before the system prompt, so this caches both (~15k
 * tokens, identical for every user and turn) whatever happens later in the messages.
 */
export function chatInstructions(instructions: string, modelId: string, cacheVariant: CacheVariant = "5m-5m"): string | SystemModelMessage {
    if (!isClaude(modelId)) return instructions;
    return { role: "system", content: instructions, providerOptions: { openrouter: { cacheControl: cacheVariant === "5m-5m" ? STATIC_CACHE_BREAKPOINT : HOUR_CACHE_BREAKPOINT } } };
}

/** Language model via OpenRouter's native provider (Chat Completions, reasoning round-trip). */
function getModel(env: Env, modelId: string, userHash: string, cacheVariant: CacheVariant) {
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY || "dummy" });
    return openrouter(modelId, chatModelSettings(env, modelId, userHash, cacheVariant));
}

/** Options resolved by the route before assembling the agent for one turn. */
export interface AgentBuildOptions {
    timezone: string;        // users.time_zone, already synced for this turn (ai.route)
    currentDate: string;     // the client's current instant, ISO-8601 (usually UTC "Z")
    locale?: string;
    approvalMode: ApprovalMode;
    modelId?: string;        // the router's pick for this turn (model-router.ts); default the standard model
    nonce: string;           // per-request data-fence nonce (safety/injection-policy)
    queryText?: string;      // the person's last two messages: what recall looks up
    requestId?: string;      // tags the turn's side-call log lines (embedding)
    diagnostics?: RunDiagnostics;
    reusedTurnContext?: Promise<string | undefined>; // server-validated continuation only
    settings?: UserSettings; // authoritative row already loaded during zone synchronization
    promptPackaging?: PromptPackaging; // offline/eval candidate; routes keep the baseline until behavior/cost gates pass
    cacheVariant?: CacheVariant; // fixed per isolated evaluation conversation, never chosen by a chat request
    waitUntil?: (promise: Promise<unknown>) => void; // keeps post-commit metrics alive
}

/** Resolve the persona and week convention from one authoritative settings row. */
function assistantContext(settings: UserSettings): { persona: AssistantPersona; weekStart: PromptRuntimeContext["weekStart"]; settings: UserSettings } {
    return { settings, persona: { ...SETTINGS_DEFAULTS.assistant, ...settings.assistant } as AssistantPersona,
        weekStart: settings.dateTime?.weekStart ?? "Sunday" };
}

async function loadUserContext(
    env: Env,
    userId: string,
    settings?: UserSettings,
): Promise<{ burnoutIndex: number | null; persona: AssistantPersona; weekStart: PromptRuntimeContext["weekStart"]; settings: UserSettings }> {
    const db = getDbClient(env);
    return withRls(db, userId, async (tx) => {
        const [metricsRow] = await tx
            .select({ currentBurnoutIndex: userMetrics.currentBurnoutIndex })
            .from(userMetrics)
            .where(eq(userMetrics.userId, userId))
            .limit(1);

        const [userRow] = settings !== undefined ? [{ settings }] : await tx
            .select({ settings: users.settings })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        // No metrics row (or a null index) means no evidence yet — unknown, not a low score.
        return { burnoutIndex: metricsRow?.currentBurnoutIndex ?? null, ...assistantContext(userRow?.settings ?? {}) };
    });
}

/** Skip the recall tier for a bare command with no conversation behind it ("ok", "done"): nothing to look up. */
const MIN_RECALL_CHARS = 12;

/**
 * What the model is told about the person this turn, in two tiers (no model call):
 *  1. the always-present profile: pinned facts, preferences, quirks, constraints, life facts coming up;
 *  2. hybrid recall for this turn: full-text + cosine over the facts, from the last two user messages.
 * Gated by the person's own mode; RLS-scoped. The query's embedding is an HTTP
 * call outside any transaction. A failure degrades to what could be read, never blocks the chat.
 */
async function loadMemoryContext(
    env: Env,
    userId: string,
    userHash: string,
    persona: AssistantPersona,
    today: string,
    queryText: string | undefined,
    requestId: string | undefined,
    diagnostics?: RunDiagnostics,
    exactCoverage = false,
): Promise<ProfileLine[]> {
    if (!isLearning(persona.memoryMode)) return [];
    const db = getDbClient(env);
    let profile: ProfileLine[] = [];
    try {
        const canRecall = !!queryText && queryText.length >= MIN_RECALL_CHARS;
        const embed = () => measurePhase(diagnostics, "embedding", () => embedText(env, queryText!, { requestId, userHash })).catch(() => null);
        // Default-to-baseline rollout: preserve the profile/HTTP overlap until the
        // candidate-present latency gate has been measured for the exact variant.
        const parallelEmbedding = !exactCoverage && canRecall ? embed() : null;
        const coverage = await measurePhase(diagnostics, "profile", () => withRls(db, userId, (tx) => loadProfileCoverage(tx, userId, today)));
        profile = coverage.lines;
        diagnostics?.memoryCoverage({ variant: exactCoverage ? "exact" : "parallel", hasRecallCandidates: coverage.hasRecallCandidates, profileFacts: profile.length });
        if (!canRecall || (exactCoverage && !coverage.hasRecallCandidates)) return profile;
        // No DB transaction stays open during this HTTP call. Candidate-present memories keep
        // hybrid recall and lexical fallback; the profile gate is an explicit measured dependency.
        const embedded = await (parallelEmbedding ?? embed());
        const recalled = await measurePhase(diagnostics, "recall", () => withRls(db, userId, (tx) =>
            recallFacts(tx, userId, {
                text: queryText!,
                embedding: embedded?.embedding ?? null,
                model: embedded?.spend.model ?? getEmbeddingModelId(env),
                today,
                exclude: new Set(profile.map((p) => p.id)),
            }),
        ));
        return [...profile, ...recalled];
    } catch (error) {
        logger.warn("ai", "memory_context_failed", { userHash, issues: issuesFromError(error) });
        return profile;
    }
}

type ChatTools = Omit<ReturnType<typeof buildToolRegistry>, "get_habit_status_today">;

/** Evals and MCP keep their existing uninstrumented path. */
function measurePhase<T>(diagnostics: RunDiagnostics | undefined, name: Parameters<RunDiagnostics["measure"]>[0], work: () => Promise<T>): Promise<T> {
    return diagnostics ? diagnostics.measure(name, work) : work();
}

/**
 * The chat model's tools: the registry less what Today at a glance already answers each turn
 * (today's routine statuses come with the snapshot; `get_habit_history` reads them after a change),
 * and the memory tools unless the person has memory on.
 */
export function chatTools(tools: ReturnType<typeof buildToolRegistry>, memoryOn = false): ChatTools {
    const { get_habit_status_today: _snapshotOnly, ...rest } = tools;
    if (memoryOn) return rest;
    // typed as present so tool calls stay typed; absent at runtime until memory is on
    return Object.fromEntries(Object.entries(rest).filter(([name]) => !isMemoryTool(name))) as ChatTools;
}

/** Per schema variant (Claude's tools skip the nulls) and tool set, computed once per isolate. */
const promptHashes = new Map<string, Promise<string>>();

/**
 * Fingerprint of everything the model sees besides the conversation: the prompt
 * blocks, the Cadence guide, and each tool's name, description and input schema. Stamped on every
 * assistant message so a behavior change can be traced to a prompt or tool edit.
 * Static per deploy and schema variant.
 */
function getPromptHash(tools: ToolSet, variant: boolean, memoryOn: boolean, packaging: PromptPackaging): Promise<string> {
    const key = `${variant}:${memoryOn}:${packaging}`;
    let hash = promptHashes.get(key);
    if (!hash) {
        hash = (async () => {
            const toolDefs = await Promise.all(Object.entries(tools).map(async ([name, t]) =>
                [name, t.description, await asSchema(t.inputSchema).jsonSchema]));
            return hashIdentifier(JSON.stringify([PROMPT_BLOCKS, HELP_TOPICS, toolDefs, packaging]));
        })();
        promptHashes.set(key, hash);
    }
    return hash;
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
): Promise<{ agent: ToolLoopAgent<never, ChatTools>; modelId: string; promptHash: string; turnContext: string }> {
    const locale = opts.locale ?? "en";
    const modelId = opts.modelId ?? getModelId(env);
    const userHash = await hashIdentifier(userId);
    const clock = userClock(opts.timezone, opts.currentDate);
    const userContext = measurePhase(opts.diagnostics, "settings", () => loadUserContext(env, userId, opts.settings));
    userContext.catch(() => {}); // construction can fail before Promise.all attaches below
    // With authoritative settings already available, metrics need only finish before
    // prompt composition. Independent profile/snapshot work can start immediately.
    const { persona, weekStart, settings } = opts.settings !== undefined ? assistantContext(opts.settings) : await userContext;
    const agentCtx: AgentContext = {
        timezone: clock.timezone,
        currentDate: clock.now.toISOString(),
        today: clock.today,
        weekStart,
        locale,
        nonce: opts.nonce,
        waitUntil: opts.waitUntil,
        approvalMode: opts.approvalMode,
        nullableOptionals: !isClaude(modelId),
    };
    const tools = buildToolRegistry(env, userId, agentCtx);
    const memoryOn = isLearning(persona.memoryMode);
    const reused = await opts.reusedTurnContext;
    const [{ burnoutIndex }, memories, snapshot] = await Promise.all([
        userContext,
        reused ? [] : loadMemoryContext(env, userId, userHash, persona, clock.today, opts.queryText, opts.requestId, opts.diagnostics, env.AI_MEMORY_COVERAGE_GATE === "true"),
        reused ? undefined : measurePhase(opts.diagnostics, "snapshot", () => loadAgentSnapshot(env, userId, agentCtx, tools, projectEvents(normalizeSettings(settings), clock.today))),
    ]);

    const endPrompt = opts.diagnostics?.beginPhase("prompt");
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
            memoryOff: !memoryOn,
        },
        opts.nonce,
        opts.promptPackaging,
    );
    endPrompt?.();

    const agent = new ToolLoopAgent({
        model: getModel(env, modelId, userHash, opts.cacheVariant ?? "5m-5m"),
        instructions: chatInstructions(instructions, modelId, opts.cacheVariant),
        tools: chatTools(tools, memoryOn),
        // A question to the user ends the turn: their reply is the next message.
        stopWhen: [isStepCount(MAX_TOOL_STEPS), hasToolCall("ask_user")],
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // Writes run here on the server; this decides which wait for the user's tap.
        // Approvals are HMAC-signed at issue, so an edited or forged one fails closed.
        toolApproval: approvalFor(opts.approvalMode),
        experimental_toolApprovalSecret: env.TOOL_APPROVAL_SECRET,
        ...opts.diagnostics?.hooks,
    });

    return { agent, modelId, promptHash: await measurePhase(opts.diagnostics, "promptHash", () => getPromptHash(chatTools(tools, memoryOn), isClaude(modelId), memoryOn, opts.promptPackaging ?? "baseline")), turnContext: reused ?? turnContext };
}
