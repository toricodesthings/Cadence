import { ToolLoopAgent, asSchema, isStepCount, type StopCondition, type SystemModelMessage, type ToolSet } from "ai";
import { createOpenRouter, type OpenRouterChatSettings } from "@openrouter/ai-sdk-provider";
import { eq } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { users, userMetrics } from "../../db/schema";
import { withRls } from "../../platform/rls";
import { SIGNALS_MAX_AGE_MS, computeWorkloadSignals, signalsStale } from "../../platform/metrics";
import { logger, hashIdentifier, issuesFromError } from "../../platform/log";
import { SETTINGS_DEFAULTS, type UserSettings } from "@cadence/contracts/settings";
import { buildToolRegistry, type AgentContext } from "./tools/index";
import { PROMPT_BLOCKS } from "./prompt/prompt-blocks";
import { composePrompt, isWorkloadHigh } from "./prompt/prompt-composer";
import type { AssistantPersona, PromptRuntimeContext } from "./prompt/prompt-blocks.schema";
import { HELP_TOPICS } from "./tools/help";
import { approvalFor } from "./safety/approval";
import type { ApprovalMode, ChatSurface } from "@cadence/contracts/ai";
import { MAX_OUTPUT_TOKENS, MAX_TOOL_STEPS } from "./safety/input-guard";
import { getModelId } from "./model-router";
import { embedText, getEmbeddingModelId } from "./memory/embedding";
import { isLearning } from "./memory/memory-mode";
import { isMemoryTool } from "@cadence/contracts/ai-tools";
import { loadProfileCoverage, recallFacts, type ProfileLine } from "./memory/memory-store";
import { getDeploymentStage, type Env } from "../../types/env";
import { AppError } from "../../platform/errors";
import { loadAgentSnapshot, loadWeekAhead, userClock } from "./turn";
import type { RunDiagnostics } from "./run-diagnostics";

const FALLBACK_CHAT_MODEL = "google/gemini-3.7-flash";

const REASONING_EFFORT = "medium";

const STATIC_CACHE_BREAKPOINT = { type: "ephemeral" } as const;
const TURN_CACHE_BREAKPOINT = { type: "ephemeral" } as const;
const HOUR_CACHE_BREAKPOINT = { type: "ephemeral", ttl: "1h" } as const;

export const CACHE_VARIANTS = ["5m-5m", "1h-5m", "1h-1h"] as const;
export type CacheVariant = (typeof CACHE_VARIANTS)[number];
export const DEFAULT_CACHE_VARIANT: CacheVariant = "5m-5m";

function isClaude(modelId: string): boolean {
    return modelId.startsWith("anthropic/");
}

export function chatModelSettings(
    env: Env,
    modelId: string,
    userHash: string,
    cacheVariant: CacheVariant = DEFAULT_CACHE_VARIANT,
): OpenRouterChatSettings {
    const breakpoints = isClaude(modelId);
    return {
        models: [...new Set([modelId, getModelId(env), FALLBACK_CHAT_MODEL])],
        reasoning: { effort: REASONING_EFFORT },
        plugins: [{ id: "file-parser", pdf: { engine: "pdf-text" } }],
        provider: { order: [breakpoints ? "Anthropic" : "DeepInfra"], allow_fallbacks: true },
        user: userHash,
        ...(breakpoints && { cache_control: cacheVariant === "1h-1h" ? HOUR_CACHE_BREAKPOINT : TURN_CACHE_BREAKPOINT }),
    };
}

export function chatInstructions(
    instructions: string,
    modelId: string,
    cacheVariant: CacheVariant = DEFAULT_CACHE_VARIANT,
): string | SystemModelMessage {
    if (!isClaude(modelId)) return instructions;
    return {
        role: "system",
        content: instructions,
        providerOptions: {
            openrouter: { cacheControl: cacheVariant === "5m-5m" ? STATIC_CACHE_BREAKPOINT : HOUR_CACHE_BREAKPOINT },
        },
    };
}

function getModel(env: Env, modelId: string, userHash: string, cacheVariant: CacheVariant) {
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY || "dummy" });
    return openrouter(modelId, chatModelSettings(env, modelId, userHash, cacheVariant));
}

export interface AgentBuildOptions {
    timezone: string;
    currentDate: string;
    locale?: string;
    approvalMode: ApprovalMode;
    hasAttachments?: () => boolean;
    surface?: ChatSurface;
    modelId?: string;
    nonce: string;
    queryText?: string;
    userTexts?: string[];
    answeredField?: "priority" | "effort";
    requestId?: string;
    diagnostics?: RunDiagnostics;
    reusedTurnContext?: Promise<string | undefined>;
    settings?: UserSettings;
    cacheVariant?: CacheVariant;
    waitUntil?: (promise: Promise<unknown>) => void;
}

function assistantContext(settings: UserSettings): {
    persona: AssistantPersona;
    weekStart: PromptRuntimeContext["weekStart"];
    settings: UserSettings;
} {
    return {
        settings,
        persona: { ...SETTINGS_DEFAULTS.assistant, ...settings.assistant } as AssistantPersona,
        weekStart: settings.dateTime?.weekStart ?? "Sunday",
    };
}

async function loadUserContext(
    env: Env,
    userId: string,
    settings?: UserSettings,
    waitUntil?: (promise: Promise<unknown>) => void,
): Promise<{
    burnoutIndex: number | null;
    persona: AssistantPersona;
    weekStart: PromptRuntimeContext["weekStart"];
    settings: UserSettings;
}> {
    const db = getDbClient(env);
    const context = await withRls(db, userId, async (tx) => {
        const [metricsRow] = await tx
            .select({
                currentBurnoutIndex: userMetrics.currentBurnoutIndex,
                lastCalculatedAt: userMetrics.lastCalculatedAt,
            })
            .from(userMetrics)
            .where(eq(userMetrics.userId, userId))
            .limit(1);

        const [userRow] =
            settings !== undefined
                ? [{ settings }]
                : await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1);

        const old = signalsStale(metricsRow?.lastCalculatedAt, Date.now() - 6 * SIGNALS_MAX_AGE_MS);
        return {
            burnoutIndex: old ? null : (metricsRow?.currentBurnoutIndex ?? null),
            stale: signalsStale(metricsRow?.lastCalculatedAt),
            ...assistantContext(userRow?.settings ?? {}),
        };
    });
    const { stale, ...rest } = context;
    if (stale && waitUntil) {
        waitUntil(
            computeWorkloadSignals(db, userId).catch(async (err) => {
                logger.error("ai", "workload_recompute_failed", {
                    userHash: await hashIdentifier(userId),
                    issues: issuesFromError(err),
                });
            }),
        );
    }
    return rest;
}

const MIN_RECALL_CHARS = 12;

async function loadMemoryContext(
    env: Env,
    userId: string,
    userHash: string,
    persona: AssistantPersona,
    today: string,
    queryText: string | undefined,
    requestId: string | undefined,
    diagnostics?: RunDiagnostics,
): Promise<ProfileLine[]> {
    if (!isLearning(persona.memoryMode)) return [];
    const db = getDbClient(env);
    let profile: ProfileLine[] = [];
    try {
        const canRecall = !!queryText && queryText.length >= MIN_RECALL_CHARS;
        const embed = () =>
            measurePhase(diagnostics, "embedding", () => embedText(env, queryText!, { requestId, userHash })).catch(
                () => null,
            );
        const coverage = await measurePhase(diagnostics, "profile", () =>
            withRls(db, userId, (tx) => loadProfileCoverage(tx, userId, today, persona.memoryMode)),
        );
        profile = coverage.lines;
        diagnostics?.memoryCoverage({
            hasRecallCandidates: coverage.hasRecallCandidates,
            profileFacts: profile.length,
        });
        if (!canRecall || !coverage.hasRecallCandidates) return profile;
        const embedded = await embed();
        const recalled = await measurePhase(diagnostics, "recall", () =>
            withRls(db, userId, (tx) =>
                recallFacts(tx, userId, {
                    text: queryText!,
                    embedding: embedded?.embedding ?? null,
                    model: embedded?.spend.model ?? getEmbeddingModelId(env),
                    today,
                    exclude: new Set(profile.map((p) => p.id)),
                    mode: persona.memoryMode,
                }),
            ),
        );
        return [...profile, ...recalled];
    } catch (error) {
        logger.warn("ai", "memory_context_failed", { userHash, issues: issuesFromError(error) });
        return profile;
    }
}

type ChatTools = Omit<ReturnType<typeof buildToolRegistry>, "get_habit_status_today">;

function measurePhase<T>(
    diagnostics: RunDiagnostics | undefined,
    name: Parameters<RunDiagnostics["measure"]>[0],
    work: () => Promise<T>,
): Promise<T> {
    return diagnostics ? diagnostics.measure(name, work) : work();
}

export function chatTools(tools: ReturnType<typeof buildToolRegistry>, memoryOn = false): ChatTools {
    const { get_habit_status_today: _snapshotOnly, ...rest } = tools;
    if (memoryOn) return rest;
    return Object.fromEntries(Object.entries(rest).filter(([name]) => !isMemoryTool(name))) as ChatTools;
}

const promptHashes = new Map<string, Promise<string>>();

function getPromptHash(tools: ToolSet, variant: boolean, memoryOn: boolean): Promise<string> {
    const key = `${variant}:${memoryOn}`;
    let hash = promptHashes.get(key);
    if (!hash) {
        hash = (async () => {
            const toolDefs = await Promise.all(
                Object.entries(tools).map(async ([name, t]) => [
                    name,
                    t.description,
                    await asSchema(t.inputSchema).jsonSchema,
                ]),
            );
            return hashIdentifier(JSON.stringify([PROMPT_BLOCKS, HELP_TOPICS, toolDefs]));
        })();
        promptHashes.set(key, hash);
    }
    return hash;
}

const askedUser: StopCondition<ToolSet> = ({ steps }) =>
    steps
        .at(-1)
        ?.toolResults?.some(
            (result) =>
                result.toolName === "ask_user" && (result.output as { asked?: boolean } | undefined)?.asked !== false,
        ) ?? false;

export async function getAgentInstance(
    env: Env,
    userId: string,
    opts: AgentBuildOptions,
): Promise<{ agent: ToolLoopAgent<never, ChatTools>; modelId: string; promptHash: string; turnContext: string }> {
    if (!env.TOOL_APPROVAL_SECRET && getDeploymentStage(env) === "production") {
        throw new AppError(500, "AUTH_MISCONFIGURED", "TOOL_APPROVAL_SECRET must be configured in production");
    }
    const locale = opts.locale ?? "en";
    const modelId = opts.modelId ?? getModelId(env);
    const userHash = await hashIdentifier(userId);
    const clock = userClock(opts.timezone, opts.currentDate);
    const userContext = measurePhase(opts.diagnostics, "settings", () =>
        loadUserContext(env, userId, opts.settings, opts.waitUntil),
    );
    userContext.catch(() => {});
    const { persona, weekStart, settings } =
        opts.settings !== undefined ? assistantContext(opts.settings) : await userContext;
    const agentCtx: AgentContext = {
        timezone: clock.timezone,
        currentDate: clock.now.toISOString(),
        today: clock.today,
        weekStart,
        locale,
        nonce: opts.nonce,
        waitUntil: opts.waitUntil,
        approvalMode: opts.approvalMode,
        userTexts: opts.userTexts,
        answeredField: opts.answeredField,
        nullableOptionals: !isClaude(modelId),
    };
    const tools = buildToolRegistry(env, userId, agentCtx);
    const memoryOn = isLearning(persona.memoryMode);
    const reused = await opts.reusedTurnContext;
    const resetSurface = opts.surface === "weekly_reset";
    const [{ burnoutIndex }, memories, snapshot] = await Promise.all([
        userContext,
        reused
            ? []
            : loadMemoryContext(
                  env,
                  userId,
                  userHash,
                  persona,
                  clock.today,
                  opts.queryText,
                  opts.requestId,
                  opts.diagnostics,
              ),
        reused
            ? undefined
            : measurePhase(opts.diagnostics, "snapshot", () =>
                  resetSurface
                      ? loadWeekAhead(env, userId, agentCtx).catch(() => undefined)
                      : loadAgentSnapshot(env, userId, agentCtx, tools),
              ),
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
            surface: opts.surface,
            ...(resetSurface ? { weekAhead: snapshot } : { snapshot }),
            memories,
            memoryOff: !memoryOn,
        },
        opts.nonce,
    );
    endPrompt?.();

    const agent = new ToolLoopAgent({
        model: getModel(env, modelId, userHash, opts.cacheVariant ?? DEFAULT_CACHE_VARIANT),
        instructions: chatInstructions(instructions, modelId, opts.cacheVariant),
        tools: chatTools(tools, memoryOn),
        stopWhen: [isStepCount(MAX_TOOL_STEPS), askedUser],
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        toolApproval: approvalFor(opts.approvalMode, { hasAttachments: opts.hasAttachments }),
        experimental_toolApprovalSecret: env.TOOL_APPROVAL_SECRET,
        ...opts.diagnostics?.hooks,
    });

    return {
        agent,
        modelId,
        promptHash: await measurePhase(opts.diagnostics, "promptHash", () =>
            getPromptHash(chatTools(tools, memoryOn), isClaude(modelId), memoryOn),
        ),
        turnContext: reused ?? turnContext,
    };
}
