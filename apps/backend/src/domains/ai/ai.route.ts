import { Hono, type Context } from "hono";
import {
    createAgentUIStream,
    createUIMessageStream,
    createUIMessageStreamResponse,
    generateId,
    UI_MESSAGE_STREAM_HEADERS,
    type LanguageModelUsage,
    type UIMessage,
} from "ai";
import { CONVERSATION_TITLE_DATA_TYPE } from "@cadence/contracts/ai";
import { TOOL_CATALOG } from "@cadence/contracts/ai-tools";
import { apiValidator } from "../../platform/validation";
import { getDbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { withCallerRls } from "../../platform/caller-rls";
import { syncUserZoneWithSettings } from "../../platform/user-zone";
import { getRequestId } from "../../platform/request-log";
import { logger, hashIdentifier, issuesFromError } from "../../platform/log";
import { getIdempotencyKey } from "../../platform/idempotency";
import { getRedis, getRateLimitRedis } from "../../platform/redis";
import { uuidParamSchema } from "@cadence/contracts/common";
import {
    chatRequestSchema,
    listConversationsQuerySchema,
    conversationMessagesQuerySchema,
    conversationPatchSchema,
    stopStreamSchema,
} from "@cadence/contracts/ai";
import { getAgentInstance } from "./agent";
import { usableFactIds, loadContextFacts } from "./memory/memory-store";
import { validateStoredContexts } from "./memory/context-reuse";
import { isLearning, memoryStateOf } from "./memory/memory-mode";
import { citedFactIds, redactMemoryReads } from "./memory/replay";
import { userClock } from "./turn";
import { formatInZone } from "@cadence/domain/time";
import type { Tx } from "../../types/db";
import { createRunDiagnostics } from "./run-diagnostics";
import { storedTurnContext, turnContexts, withTurnContext } from "./prompt/prompt-composer";
import { getModelId, pickChatModel } from "./model-router";
import {
    resolveOrCreateConversation,
    lockActiveStream,
    loadConversationMessages,
    appendUserMessage,
    truncateMessagesAfter,
    deleteAllMessages,
    saveAssistantMessage,
    lastUserTexts,
    touchConversation,
    listConversations,
    getConversation,
    renameOrArchiveConversation,
    deleteConversation,
    listConversationImageIds,
    listArchivedImageIds,
    deleteArchivedConversations,
    setActiveStream,
    finalizeActiveStream,
    setTitleIfEmpty,
    setTurnContext,
} from "./persistence/conversation-repo";
import { generateConversationTitle } from "./title/generate-title";
import { readStepsInput, stepsPromptFor, suggestSteps } from "./steps";
import { suggestStepsSchema } from "@cadence/contracts/planning";
import { openStream, closeStream, requestAbort, readMeta } from "./streaming/resume-store";
import { startAbortWatcher } from "./streaming/abort-watcher";
import { mirrorChunks } from "./streaming/mirror";
import { buildResumeStream } from "./streaming/replay";
import {
    applyApprovals,
    keepFinishedWrites,
    compactOldReads,
    dropForeignReasoning,
    dropUnsignedReasoning,
    recentStart,
    rowToUIMessage,
    settleUnanswered,
    toClientMessage,
} from "./persistence/message-mapper";
import { makeFenceNonce, stripNonce } from "./safety/injection-policy";
import { assertMessageWithinCaps, startAtUser } from "./safety/input-guard";
import { buildStreamError, streamErrorCause, streamErrorToText } from "./safety/stream-error";
import { admitChatTurn } from "./safety/admission";
import { addDailySpend } from "../../platform/daily-budget";
import {
    resolveLimits,
    estimateReserve,
    settle,
    readUsage,
    readMeteredTokens,
    meterUsage,
    addStepSpend,
    emptyUsage,
    type TurnSpend,
} from "./safety/rate-limit";
import {
    aiImageKey,
    deleteImageObjects,
    hydrateImages,
    imageIdsIn,
    imageTypesIn,
    markSent,
    resolveTurnImages,
} from "./images/chat-images";
import { AppError, throwIfNotFound } from "../../platform/errors";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { replanReminders } from "../push/reminder-clock";
import { scheduleLearn } from "./memory/queue";
import { settleFieldQuestion } from "./tools/ask";

const SNAPSHOT_PART_TYPES = new Set(["text", "reasoning", "step-start"]);

const STREAM_TIMEOUT_MS = 45_000;
const FIRST_CHUNK_TIMEOUT_MS = 15_000;

type ChatMessage = {
    id: string;
    role: "user" | "assistant" | "system";
    parts: unknown[];
    metadata?: Record<string, unknown>;
};

function extractText(parts: unknown[]): string {
    return (
        parts
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
            .map((p) => (p && typeof p === "object" && (p as any).type === "text" ? String((p as any).text ?? "") : ""))
            .filter(Boolean)
            .join("\n")
            .trim()
    );
}

function stripNonceFromMessage(message: { parts?: unknown[]; [k: string]: unknown }, nonce: string): ChatMessage {
    const parts = (message.parts ?? []).map((p) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
        if (p && typeof p === "object" && (p as any).type === "text" && typeof (p as any).text === "string") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
            return { ...(p as any), text: stripNonce((p as any).text, nonce) };
        }
        return p;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
    return { ...(message as any), parts };
}

type StoredTurn = {
    conversationId: string;
    history: ChatMessage[];
    continues: boolean;
    needsTitle: boolean;
    continuation: ReturnType<typeof continuationOf> | "approval";
};
type TurnTiming = { setupMs?: number; ttftMs?: number; firstTextMs?: number };
type AiContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

function readIncoming(message: unknown, imagesPerMessage: number) {
    const incoming = message as ChatMessage | undefined;
    if (!incoming)
        return { incoming, incomingText: "", imageIds: [] as string[], imageTypes: new Map<string, string>() };
    assertMessageWithinCaps(incoming, imagesPerMessage);
    return {
        incoming,
        incomingText: extractText(incoming.parts),
        imageIds: imageIdsIn(incoming.parts),
        imageTypes: imageTypesIn(incoming.parts),
    };
}

async function turnSettings(
    tx: Tx,
    userId: string,
    body: { timezone?: string; conversationId?: string },
    incomingText: string,
) {
    const { timezone, settings } = await syncUserZoneWithSettings(tx, userId, body.timezone);
    let stored: string[] = [];
    try {
        if (body.conversationId) stored = (await lastUserTexts(tx, userId, body.conversationId, 3)) ?? [];
    } catch {}
    const answeredField = await settleFieldQuestion(tx, userId, settings, incomingText);
    const previous = stored.filter((text) => text !== incomingText).slice(-1)[0];
    const userTexts = [...new Set([...stored, incomingText].filter(Boolean))];
    return {
        timezone,
        settings,
        userTexts,
        answeredField,
        queryText: [previous, incomingText].filter(Boolean).join("\n") || undefined,
    };
}

async function newImageCount(
    c: AiContext,
    conversationId: string | undefined,
    imageIds: string[],
    imageTypes: Map<string, string>,
) {
    if (!imageIds.length) return 0;
    const { newCount } = await withCallerRls(c, (tx) =>
        resolveTurnImages(tx, c.get("userId"), conversationId, imageIds, imageTypes),
    );
    return newCount;
}

async function pickTurnModel(
    c: AiContext,
    conversationId: string | undefined,
    routed: { text: string; attachmentCount: number },
) {
    const modelId = pickChatModel(c.env, routed);
    if (!conversationId || modelId === getModelId(c.env)) return modelId;
    const previous = await withCallerRls(c, (tx) => getConversation(tx, c.get("userId"), conversationId)).catch(
        () => null,
    );
    return pickChatModel(c.env, routed, previous?.model);
}

async function startTitle(
    c: AiContext,
    turn: { conversationId: string; text: string; hasImages: boolean; requestId: string; userHash: string },
) {
    const { title, spend } = await generateConversationTitle(c.env, turn.text, turn.hasImages, {
        requestId: turn.requestId,
        userHash: turn.userHash,
    });
    c.executionCtx.waitUntil(
        withCallerRls(c, (tx) => setTitleIfEmpty(tx, c.get("userId"), turn.conversationId, title)).catch(() => {}),
    );
    return { title, spend };
}

function resetTitle(timezone: string, currentDate: string) {
    const { now, timezone: zone } = userClock(timezone, currentDate);
    return `Weekly Reset · ${formatInZone(now.toISOString(), zone, { weekday: "short", month: "short", day: "numeric" }, "en-US")}`;
}

async function fixedTitle(c: AiContext, conversationId: string, title: string) {
    c.executionCtx.waitUntil(
        withCallerRls(c, (tx) => setTitleIfEmpty(tx, c.get("userId"), conversationId, title)).catch(() => {}),
    );
    return { title, spend: undefined };
}

async function replayableReads(
    c: AiContext,
    messages: ChatMessage[],
    memoryMode: ReturnType<typeof memoryStateOf>["mode"],
) {
    const cited = citedFactIds(messages);
    const usableIds =
        cited.length && memoryMode !== "off"
            ? new Set(await withCallerRls(c, (tx) => usableFactIds(tx, c.get("userId"), memoryMode, cited)))
            : new Set<string>();
    return redactMemoryReads(messages, memoryMode, usableIds);
}

function providerErrorKind(body: unknown): { upstreamCode?: string; upstreamType?: string } {
    if (typeof body !== "string") return {};
    try {
        const error = (JSON.parse(body) as { error?: { code?: unknown; type?: unknown } }).error;
        const text = (v: unknown) =>
            typeof v === "string" || typeof v === "number" ? String(v).slice(0, 64) : undefined;
        return { upstreamCode: text(error?.code), upstreamType: text(error?.type) };
    } catch {
        return {};
    }
}

function reportStreamError(
    error: unknown,
    meta: { requestId: string; userHash: string; modelId: string; imageCount: number },
): string {
    const streamError = buildStreamError(error, meta.requestId);
    const upstream = streamErrorCause(error) as { statusCode?: unknown; responseBody?: unknown };
    const level = ["AI_TIMEOUT", "AI_UPSTREAM_UNAVAILABLE", "INTERNAL_ERROR"].includes(streamError.code)
        ? "error"
        : "warn";
    logger[level]("ai", "ai_stream_error", {
        requestId: meta.requestId,
        userHash: meta.userHash,
        model: meta.modelId,
        code: streamError.code,
        images: meta.imageCount || undefined,
        upstreamStatus: upstream?.statusCode,
        ...providerErrorKind(upstream?.responseBody),
        issues: issuesFromError(error),
    });
    return streamErrorToText(streamError);
}

function withTitlePart(
    agentStream: Awaited<ReturnType<typeof createAgentUIStream>>,
    titlePromise: Promise<{ title: string }>,
    conversationId: string,
) {
    return createUIMessageStream({
        execute: async ({ writer }) => {
            writer.merge(agentStream);
            const { title } = await titlePromise;
            if (title) {
                writer.write({
                    type: CONVERSATION_TITLE_DATA_TYPE,
                    data: { conversationId, title },
                    transient: true,
                });
            }
        },
    });
}

function continuationOf(kept: boolean, edited: boolean, isRerun: boolean) {
    if (kept) return "kept_write";
    if (edited) return "edit";
    return isRerun ? "rerun" : "message";
}

async function deleteStoredImages(
    env: Env,
    userId: string,
    images: { id: string; mediaType: "image/webp" | "application/pdf" }[],
) {
    if (images.length === 0 || !env.USER_ASSETS) return;
    const userKey = await hashIdentifier(userId);
    await deleteImageObjects(
        env.USER_ASSETS,
        images.map((image) => aiImageKey(userKey, image.id, image.mediaType)),
    );
}

export const aiRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/chat", apiValidator("json", chatRequestSchema), async (c) => {
        const userId = c.get("userId");
        const requestId = getRequestId(c);
        const userHash = await hashIdentifier(userId);
        const body = c.req.valid("json");
        const limits = resolveLimits(c.env);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
        const requestStartedAt: number = (c as Context<any>).get("requestStartedAt");
        const since = () => Date.now() - requestStartedAt;
        const diagnosticClockStart = performance.now();
        const diagnosticArrivalOffset = since();
        const diagnostics = createRunDiagnostics(
            () => diagnosticArrivalOffset + performance.now() - diagnosticClockStart,
        );
        const turnTiming: TurnTiming = {};
        const { incoming, incomingText, imageIds, imageTypes } = readIncoming(body.message, limits.imagesPerMessage);

        const nonce = makeFenceNonce();
        const modelId = await pickTurnModel(c, body.conversationId, {
            text: incomingText,
            attachmentCount: imageIds.length,
        });
        const clientMessageId = body.clientMessageId ?? getIdempotencyKey(c);

        let redis = getRedis(c.env);
        const userKey = userHash;
        const streamId = generateId();

        const endAdmission = diagnostics.beginPhase("admission");
        const newImages = await newImageCount(c, body.conversationId, imageIds, imageTypes);
        const rlRedis = getRateLimitRedis(c.env);
        const reserved = estimateReserve(incomingText.length, limits, imageIds.length);
        const {
            rejected,
            admitted,
            headers: rlHeaders,
        } = await admitChatTurn(c, rlRedis, { userKey, userHash, reserved, limits, newImages });
        if (rejected) return rejected;

        endAdmission();
        const abortController = new AbortController();
        let publishedConversationId: string | undefined;
        try {
            const settingsReady = diagnostics.measure("zoneRecallQuery", () =>
                withCallerRls(c, (tx) => turnSettings(tx, userId, body, incomingText)),
            );
            settingsReady.catch(() => {});
            const storedHistoryReady = Promise.withResolvers<{ history: ChatMessage[]; continues: boolean }>();
            storedHistoryReady.promise.catch(() => {});
            async function prepareHistory(tx: Tx, result: StoredTurn) {
                const { conversationId, history, continues } = result;
                storedHistoryReady.resolve(result);
                const assistantMessageId = continues ? history.at(-1)!.id : generateId();
                const turn = continues
                    ? [...settleUnanswered(history.slice(0, -1)), history.at(-1)!]
                    : [...settleUnanswered(history.filter((m) => m.id !== incoming!.id)), incoming!];
                const replayed = startAtUser(turn.filter((m) => m.role !== "system"));
                const recentFrom = recentStart(replayed);
                const uiMessages = compactOldReads(
                    dropForeignReasoning(dropUnsignedReasoning(replayed), modelId),
                    recentFrom,
                ) as ChatMessage[];
                const imagesReady = diagnostics.measure("images", () =>
                    hydrateImages(uiMessages, c.env.USER_ASSETS, userKey, recentFrom),
                );
                imagesReady.catch(() => {});
                if (redis) {
                    const endResume = diagnostics.beginPhase("resumeInit");
                    try {
                        await openStream(redis, userKey, streamId, {
                            conversationId,
                            userId,
                            messageId: assistantMessageId,
                            model: modelId,
                        });
                    } catch {
                        logger.warn("ai", "ai_redis_unavailable", { op: "openStream" });
                        redis = null;
                    } finally {
                        endResume();
                    }
                    if (redis) await setActiveStream(tx, userId, conversationId, streamId);
                }
                return { ...result, assistantMessageId, uiMessages, recentFrom, imagesReady };
            }

            async function assertNoLiveTurn(activeStreamId?: string | null) {
                if (activeStreamId && redis && (await readMeta(redis, userKey, activeStreamId).catch(() => null))) {
                    throw new AppError(409, "CONFLICT", "A reply is already on its way.");
                }
            }
            async function continueApproval(tx: Tx) {
                await assertNoLiveTurn(await lockActiveStream(tx, userId, body.conversationId!));
                const conversation = await getConversation(tx, userId, body.conversationId!);
                throwIfNotFound(conversation, "Conversation");
                const rows = await loadConversationMessages(tx, userId, conversation!.id, { historyWindow: true });
                const last = rows.at(-1);
                const answered =
                    last?.role === "assistant" ? applyApprovals(rowToUIMessage(last), body.approvals!) : null;
                if (!answered) throw new AppError(409, "CONFLICT", "Nothing here is waiting for approval.");
                return prepareHistory(tx, {
                    conversationId: conversation!.id,
                    history: [...rows.slice(0, -1).map(rowToUIMessage), answered],
                    continues: true,
                    needsTitle: false,
                    continuation: "approval",
                });
            }
            async function persistMessage(tx: Tx, message: ChatMessage) {
                const { id, title, activeStreamId } = await resolveOrCreateConversation(tx, userId, {
                    conversationId: body.conversationId,
                    model: modelId,
                });
                await assertNoLiveTurn(activeStreamId);
                if (body.editAnchorId !== undefined) {
                    if (body.editAnchorId === null) await deleteAllMessages(tx, userId, id);
                    else await truncateMessagesAfter(tx, userId, id, body.editAnchorId);
                }
                const firstRows =
                    body.editAnchorId === undefined
                        ? await loadConversationMessages(tx, userId, id, { historyWindow: true })
                        : undefined;
                const kept = firstRows ? keepFinishedWrites(firstRows, message.id) : null;
                const isRerun = await truncateMessagesAfter(tx, userId, id, kept?.id ?? message.id);
                const priorRows =
                    !isRerun && !kept && firstRows
                        ? firstRows
                        : await loadConversationMessages(tx, userId, id, { historyWindow: true });
                await appendUserMessage(tx, userId, id, message, { clientMessageId });
                await markSent(tx, userId, imageIds);
                const isFirstTurn = isRerun ? priorRows.length <= (kept ? 2 : 1) : priorRows.length === 0;
                const history = priorRows.map((row) => (row.id === kept?.id ? kept : rowToUIMessage(row)));
                return prepareHistory(tx, {
                    conversationId: id,
                    history,
                    continues: !!kept,
                    needsTitle: isFirstTurn && !title,
                    continuation: continuationOf(!!kept, body.editAnchorId !== undefined, isRerun),
                });
            }

            const historyReady = diagnostics.measure("historyPersist", () =>
                withCallerRls(c, (tx) => (incoming ? persistMessage(tx, incoming) : continueApproval(tx))),
            );

            historyReady.catch(storedHistoryReady.reject);
            const validatedHistory = Promise.all([storedHistoryReady.promise, settingsReady]).then(
                async ([result, settings]) => {
                    const clock = userClock(settings.timezone, body.currentDate);
                    return diagnostics.measure("contextValidation", () =>
                        validateStoredContexts(result.history, memoryStateOf(settings.settings).mode, (ids) =>
                            withCallerRls(c, (tx) =>
                                loadContextFacts(tx, userId, ids, clock.today, memoryStateOf(settings.settings).mode),
                            ),
                        ),
                    );
                },
            );
            validatedHistory.catch(() => {});
            const reusedContext = storedHistoryReady.promise.then(async (result) => {
                if (!result.continues) return undefined;
                const history = await validatedHistory;
                return storedTurnContext(
                    [...history].reverse().find((m) => m.role === "user") ?? { role: "assistant" },
                );
            });
            reusedContext.catch(() => {});
            let imageCount = 0;
            const agentReady = settingsReady.then(({ timezone, settings, queryText, userTexts, answeredField }) =>
                getAgentInstance(c.env, userId, {
                    timezone,
                    settings,
                    queryText,
                    userTexts,
                    answeredField,
                    reusedTurnContext: reusedContext,
                    requestId,
                    diagnostics,
                    currentDate: body.currentDate,
                    locale: body.locale,
                    approvalMode: body.approvalMode,
                    hasAttachments: () => imageCount > 0,
                    surface: body.surface,
                    modelId,
                    nonce,
                    waitUntil: (promise) => c.executionCtx.waitUntil(promise),
                }),
            );
            agentReady.catch(() => {});
            const {
                conversationId,
                continues,
                needsTitle,
                continuation,
                assistantMessageId,
                uiMessages,
                recentFrom,
                imagesReady,
            } = await historyReady;
            publishedConversationId = conversationId;
            const history = await validatedHistory;

            const titlePromise = needsTitle
                ? body.surface === "weekly_reset"
                    ? settingsReady
                          .then(({ timezone }) => fixedTitle(c, conversationId, resetTitle(timezone, body.currentDate)))
                          .catch(() => ({ title: "", spend: undefined }))
                    : startTitle(c, {
                          conversationId,
                          text: incomingText,
                          hasImages: imageIds.length > 0,
                          requestId,
                          userHash,
                      })
                : null;

            const { messages: hydratedMessages, hydrated } = await imagesReady;
            imageCount = hydrated;
            const modelMessages = await replayableReads(
                c,
                hydratedMessages,
                memoryStateOf((await settingsReady).settings).mode,
            );

            const { agent, promptHash, turnContext } = await agentReady;
            const lastUser = [...uiMessages].reverse().find((m) => m.role === "user");
            const {
                contexts,
                current: lastUserContext,
                stored: storedLastContext,
            } = turnContexts(history, lastUser?.id, turnContext, continues);
            turnTiming.setupMs = since();

            let spend: TurnSpend = {};
            let stepTokens = 0;

            if (redis) {
                startAbortWatcher({
                    redis,
                    userKey,
                    streamId,
                    controller: abortController,
                    signal: abortController.signal,
                });
            }

            let reportedStreamError: string | undefined;
            const agentStream = await createAgentUIStream({
                agent,
                uiMessages: withTurnContext(
                    modelMessages as { id: string; role: string; parts: unknown[] }[],
                    contexts,
                    recentFrom,
                ),
                abortSignal: abortController.signal,
                timeout: { totalMs: STREAM_TIMEOUT_MS, firstChunkMs: FIRST_CHUNK_TIMEOUT_MS },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
                originalMessages: uiMessages as any,
                generateMessageId: () => assistantMessageId,
                messageMetadata: ({ part }) => {
                    if (part.type === "finish-step") {
                        spend = addStepSpend(spend, part);
                        stepTokens += meterUsage(part.usage);
                    }
                    return part.type === "finish"
                        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
                          ({ totalUsage: (part as any).totalUsage, model: modelId, promptHash } as any)
                        : undefined;
                },
                onError: (error) => {
                    reportedStreamError ??= reportStreamError(error, { requestId, userHash, modelId, imageCount });
                    return reportedStreamError;
                },
                onEnd: async ({ responseMessage, isAborted, finishReason, outcome }) => {
                    const totalMs = since();
                    abortController.abort();
                    const status = isAborted
                        ? "aborted"
                        : outcome.status === "failed" || finishReason === "error"
                          ? "failed"
                          : "complete";
                    const titleSpend = (await titlePromise)?.spend;
                    c.executionCtx.waitUntil(addDailySpend(c.env, (spend.costUsd ?? 0) + (titleSpend?.costUsd ?? 0)));
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
                        const cleaned = stripNonceFromMessage(responseMessage as any, nonce);
                        await withCallerRls(c, async (tx) => {
                            await saveAssistantMessage(tx, userId, conversationId, cleaned, {
                                status,
                                metadata: { ...cleaned.metadata, ...spend, titleSpend },
                            });
                            await touchConversation(tx, userId, conversationId, { model: modelId });
                            if (lastUser && storedLastContext !== lastUserContext) {
                                await setTurnContext(tx, userId, conversationId, lastUser.id, lastUserContext);
                            }
                        });
                    } catch {
                        logger.warn("ai", "ai_persist_failed", { requestId, userHash, conversationId });
                    }
                    const learns = isLearning(memoryStateOf((await settingsReady).settings).mode);
                    const wrote = ((responseMessage as { parts?: Array<{ type: string }> }).parts ?? []).some(
                        ({ type }) => {
                            if (!type.startsWith("tool-")) return false;
                            const kind = (TOOL_CATALOG as Record<string, { kind: string } | undefined>)[type.slice(5)]
                                ?.kind;
                            return kind !== "read" && kind !== "ask";
                        },
                    );
                    c.executionCtx.waitUntil(
                        Promise.all([wrote && replanReminders(c.env, userId), learns && scheduleLearn(c.env, userId)]),
                    );
                    if (redis) {
                        const streamState = status === "complete" ? "done" : status === "failed" ? "error" : "aborted";
                        await closeStream(redis, userKey, streamId, streamState).catch(() => {});
                        await withCallerRls(c, (tx) =>
                            finalizeActiveStream(tx, userId, conversationId, streamId, status),
                        ).catch(() => {});
                    }
                    if (rlRedis && admitted) {
                        const started = turnTiming.ttftMs !== undefined;
                        const actualTokens =
                            status === "complete"
                                ? readMeteredTokens(responseMessage) || stepTokens
                                : stepTokens + (started ? reserved : 0);
                        await settle(rlRedis, userKey, reserved, actualTokens).catch(() =>
                            logger.warn("ai", "ai_ratelimit_settle_failed", { requestId, userHash }),
                        );
                    }
                    logTurn(responseMessage, status, totalMs);
                },
            });

            const responseStream = titlePromise
                ? withTitlePart(agentStream, titlePromise, conversationId)
                : agentStream;

            const timedStream = responseStream.pipeThrough(
                new TransformStream({
                    transform(chunk, controller) {
                        if (chunk.type === "reasoning-delta" || chunk.type === "text-delta")
                            turnTiming.ttftMs ??= since();
                        if (chunk.type === "text-delta") turnTiming.firstTextMs ??= since();
                        controller.enqueue(chunk);
                    },
                }),
            );
            function logTurn(message: UIMessage, outcome: string, totalMs: number) {
                const usage = (message.metadata as { totalUsage?: LanguageModelUsage } | undefined)?.totalUsage;
                const outputTokens = usage?.outputTokens;
                const streamS = turnTiming.ttftMs === undefined ? 0 : (totalMs - turnTiming.ttftMs) / 1000;
                logger.info("ai", "ai_turn", {
                    requestId,
                    userHash,
                    conversationId,
                    replyId: assistantMessageId,
                    runId: diagnostics.runId,
                    continuation,
                    surface: body.surface,
                    promptHash,
                    diagnostics: diagnostics.snapshot(),
                    model: modelId,
                    outcome,
                    steps: message.parts.filter((p) => p.type === "step-start").length,
                    toolCalls: message.parts.filter((p) => p.type.startsWith("tool-") || p.type === "dynamic-tool")
                        .length,
                    images: imageCount || undefined,
                    ...turnTiming,
                    totalMs,
                    inputTokens: usage?.inputTokens,
                    cachedInputTokens: usage?.inputTokenDetails?.cacheReadTokens,
                    cacheWriteTokens: usage?.inputTokenDetails?.cacheWriteTokens,
                    outputTokens,
                    reasoningTokens: usage?.outputTokenDetails?.reasoningTokens,
                    tokensPerSec: outputTokens && streamS > 0 ? Math.round(outputTokens / streamS) : undefined,
                    ...spend,
                });
            }

            return createUIMessageStreamResponse({
                stream: timedStream,
                headers: rlHeaders,
                consumeSseStream: ({ stream }) => {
                    c.executionCtx.waitUntil(
                        (async () => {
                            if (!redis) {
                                await stream.pipeTo(new WritableStream()).catch(() => {});
                                return;
                            }

                            await mirrorChunks({ stream, redis, userKey, streamId, controller: abortController });
                        })(),
                    );
                },
            });
        } catch (error) {
            abortController.abort();
            if (rlRedis && admitted) c.executionCtx.waitUntil(settle(rlRedis, userKey, reserved, 0).catch(() => {}));
            if (redis && publishedConversationId) {
                const conversationId = publishedConversationId;
                c.executionCtx.waitUntil(
                    (async () => {
                        await closeStream(redis!, userKey, streamId, "error").catch(() => {});
                        await withCallerRls(c, (tx) =>
                            finalizeActiveStream(tx, userId, conversationId, streamId, "failed"),
                        ).catch(() => {});
                    })(),
                );
            }
            throw error;
        }
    })
    .post("/steps", apiValidator("json", suggestStepsSchema), async (c) => {
        const userId = c.get("userId");
        const { taskId, smaller } = c.req.valid("json");
        const input = await withCallerRls(c, (tx) => readStepsInput(tx, userId, taskId));
        const userHash = await hashIdentifier(userId);
        const limits = resolveLimits(c.env);
        const rlRedis = getRateLimitRedis(c.env);
        const reserved = estimateReserve(stepsPromptFor(input, smaller).length, limits);
        const { rejected, admitted } = await admitChatTurn(c, rlRedis, {
            userKey: userHash,
            userHash,
            reserved,
            limits,
            newImages: 0,
        });
        if (rejected) return rejected;
        let tokens = 0;
        try {
            const drafted = await suggestSteps(c.env, userHash, input, smaller);
            tokens = drafted.tokens;
            return c.json({ data: { steps: drafted.steps } });
        } finally {
            if (rlRedis && admitted) {
                c.executionCtx.waitUntil(
                    settle(rlRedis, userHash, reserved, tokens).catch(() =>
                        logger.warn("ai", "ai_ratelimit_settle_failed", { userHash }),
                    ),
                );
            }
        }
    })
    .get("/chat/:id/stream", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const redis = getRedis(c.env);
        if (!redis) return new Response(null, { status: 204 });

        const conversation = await withRls(getDbClient(c.env), userId, (tx) => getConversation(tx, userId, id));
        throwIfNotFound(conversation, "Conversation");
        const sid = conversation!.activeStreamId ?? conversation!.lastStreamId;
        if (!sid) return new Response(null, { status: 204 });

        const userKey = await hashIdentifier(userId);
        const meta = await readMeta(redis, userKey, sid).catch(() => null);
        if (!meta || meta.userId !== userId) return new Response(null, { status: 204 });

        return new Response(buildResumeStream(redis, userKey, sid), { headers: UI_MESSAGE_STREAM_HEADERS });
    })
    .post(
        "/chat/:id/stop",
        apiValidator("param", uuidParamSchema),
        apiValidator("json", stopStreamSchema),
        async (c) => {
            const userId = c.get("userId");
            const { id } = c.req.valid("param");
            const body = c.req.valid("json");
            const redis = getRedis(c.env);

            const conversation = await withRls(getDbClient(c.env), userId, (tx) => getConversation(tx, userId, id));
            throwIfNotFound(conversation, "Conversation");
            const sid = conversation!.activeStreamId;
            if (!redis || !sid) return c.json({ data: { success: true } });

            if (body.activeStreamId && body.activeStreamId !== sid) {
                return c.json({ data: { success: true } });
            }

            const userKey = await hashIdentifier(userId);
            await requestAbort(redis, userKey, sid).catch(() => {});

            if (body.assistantMessage) {
                try {
                    const meta = await readMeta(redis, userKey, sid);
                    if (meta && meta.userId === userId && meta.messageId === body.assistantMessage.id) {
                        assertMessageWithinCaps(body.assistantMessage);
                        const parts = body.assistantMessage.parts.filter((part) => SNAPSHOT_PART_TYPES.has(part.type));
                        if (parts.length > 0) {
                            await withRls(getDbClient(c.env), userId, (tx) =>
                                saveAssistantMessage(
                                    tx,
                                    userId,
                                    id,
                                    { ...body.assistantMessage!, parts },
                                    {
                                        status: "aborted",
                                        metadata: {},
                                        onlyIfAbsent: true,
                                    },
                                ),
                            );
                        }
                    }
                } catch {}
            }
            return c.json({ data: { success: true } });
        },
    )
    .patch(
        "/conversations/:id",
        apiValidator("param", uuidParamSchema),
        apiValidator("json", conversationPatchSchema),
        async (c) => {
            const { id } = c.req.valid("param");
            const patch = c.req.valid("json");

            const conversation = await withCallerRls(c, async (tx, userId) => {
                await renameOrArchiveConversation(tx, userId, id, patch);
                return getConversation(tx, userId, id);
            });

            return c.json({ data: conversation });
        },
    )
    .get("/usage", async (c) => {
        const userId = c.get("userId");
        const limits = resolveLimits(c.env);
        const rlRedis = getRateLimitRedis(c.env);
        if (!rlRedis) return c.json({ data: emptyUsage(limits) });
        const userKey = await hashIdentifier(userId);
        const usage = await readUsage(rlRedis, userKey, limits).catch(() => emptyUsage(limits));
        c.header("Cache-Control", "private, max-age=5");
        return c.json({ data: usage });
    })
    .get("/conversations", apiValidator("query", listConversationsQuerySchema), async (c) => {
        const { limit, cursor } = c.req.valid("query");

        const conversations = await withCallerRls(c, (tx, userId) => listConversations(tx, userId, { limit, cursor }));

        c.header("Cache-Control", "private, max-age=0, stale-while-revalidate=5");
        return c.json({ data: { conversations } });
    })
    .get(
        "/conversations/:id",
        apiValidator("param", uuidParamSchema),
        apiValidator("query", conversationMessagesQuerySchema),
        async (c) => {
            const { id } = c.req.valid("param");
            const { limit, before } = c.req.valid("query");

            const result = await withCallerRls(c, async (tx, userId) => {
                const conversation = await getConversation(tx, userId, id);
                throwIfNotFound(conversation, "Conversation");
                const rows = await loadConversationMessages(tx, userId, id, { limit, beforeOrderIndex: before });
                return { conversation, messages: rows.map(toClientMessage) };
            });

            c.header("Cache-Control", "private, max-age=0, stale-while-revalidate=5");
            return c.json({ data: result });
        },
    )
    .delete("/conversations/archived", async (c) => {
        const userId = c.get("userId");

        const stored = await withCallerRls(c, (tx) => listArchivedImageIds(tx, userId));
        await deleteStoredImages(c.env, userId, stored);
        const deleted = await withCallerRls(c, (tx) => deleteArchivedConversations(tx, userId));

        return c.json({ data: { deleted } });
    })
    .delete("/conversations/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");

        const stored = await withCallerRls(c, (tx) => listConversationImageIds(tx, userId, id));
        await deleteStoredImages(c.env, userId, stored);
        await withCallerRls(c, (tx) => deleteConversation(tx, userId, id));

        return c.json({ data: { id, deleted: true } });
    });
