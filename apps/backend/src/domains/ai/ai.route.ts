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
import { apiValidator } from "../../platform/validation";
import { getDbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { withCallerRls } from "../../platform/caller-rls";
import { syncUserZoneWithSettings } from "../../platform/user-zone";
import { getRequestId } from "../../platform/request-log";
import { logger, hashIdentifier, issuesFromError, shorten } from "../../platform/log";
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
import type { Tx } from "../../types/db";
import { createRunDiagnostics } from "./run-diagnostics";
import { storedTurnContext, turnContexts, withTurnContext } from "./prompt/prompt-composer";
import { getModelId, pickChatModel } from "./model-router";
import {
    resolveOrCreateConversation,
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
import { applyApprovals, keepFinishedWrites, compactOldReads, dropForeignReasoning, dropUnsignedReasoning, recentStart, rowToUIMessage, settleUnanswered, toClientMessage } from "./persistence/message-mapper";
import { makeFenceNonce, stripNonce } from "./safety/injection-policy";
import { assertMessageWithinCaps, startAtUser } from "./safety/input-guard";
import { buildStreamError, streamErrorCause, streamErrorToText } from "./safety/stream-error";
import { admitChatTurn, aiRateLimitResponse } from "./safety/admission";
import {
    resolveLimits,
    estimateReserve,
    admit,
    settle,
    readUsage,
    readMeteredTokens,
    addStepSpend,
    emptyUsage,
    type TurnSpend,
} from "./safety/rate-limit";
import { aiImageKey, deleteImageObjects, hydrateImages, imageIdsIn, markSent, resolveTurnImages } from "./images/chat-images";
import { AppError, throwIfNotFound } from "../../platform/errors";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { replanReminders } from "../push/reminder-clock";
import { scheduleLearn } from "./memory/queue";
import { settleFieldQuestion } from "./tools/ask";

// Router defined below as a single CHAIN (after its helpers) so the route schema
// flows into AppType for the Hono RPC client.

/** Hard wall-clock ceiling for a single streamed turn (improves on the old blunt 12s). */
const STREAM_TIMEOUT_MS = 45_000;
/** Max wait for a model call's first chunk — each step restarts it. */
const FIRST_CHUNK_TIMEOUT_MS = 15_000;

// ── Utility ───────────────────────────────────────────────────────────

type ChatMessage = { id: string; role: "user" | "assistant" | "system"; parts: unknown[]; metadata?: Record<string, unknown> };

/** Join text parts of a UIMessage into one string. */
function extractText(parts: unknown[]): string {
    return parts
        .map((p) => (p && typeof p === "object" && (p as any).type === "text" ? String((p as any).text ?? "") : ""))
        .filter(Boolean)
        .join("\n")
        .trim();
}

/** Strip the per-request fence nonce from a model message's text parts before persistence. */
function stripNonceFromMessage(message: { parts?: unknown[]; [k: string]: unknown }, nonce: string): ChatMessage {
    const parts = (message.parts ?? []).map((p) => {
        if (p && typeof p === "object" && (p as any).type === "text" && typeof (p as any).text === "string") {
            return { ...(p as any), text: stripNonce((p as any).text, nonce) };
        }
        return p;
    });
    return { ...(message as any), parts };
}

/** The persisted turn: its thread, history, whether a reply continues, and how (logged on `ai_turn`). */
type StoredTurn = {
    conversationId: string;
    history: ChatMessage[];
    continues: boolean;
    needsTitle: boolean;
    continuation: ReturnType<typeof continuationOf> | "approval";
};
type TurnTiming = { setupMs?: number; ttftMs?: number; firstTextMs?: number };
type AiContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

/**
 * Latest user message (load-by-id). Role is pinned to "user" at the schema
 * level — a crafted request can never persist an assistant/system row here.
 * Absent when the request only answers approvals (the turn continues).
 * Images are `cadence-image:` references (bytes were uploaded first, POST /ai/images).
 */
function readIncoming(message: unknown, imagesPerMessage: number) {
    const incoming = message as ChatMessage | undefined;
    if (!incoming) return { incoming, incomingText: "", imageIds: [] as string[] };
    assertMessageWithinCaps(incoming, imagesPerMessage); // AI-specific caps → 400 INVALID_REQUEST
    return { incoming, incomingText: extractText(incoming.parts), imageIds: imageIdsIn(incoming.parts) };
}

/** The user's zone and settings for this turn, and what recall looks up: this message plus the one before it, so "yes, do that" keeps its subject. */
async function turnSettings(tx: Tx, userId: string, body: { timezone?: string; conversationId?: string }, incomingText: string) {
    const { timezone, settings } = await syncUserZoneWithSettings(tx, userId, body.timezone);
    let stored: string[] = [];
    try {
        if (body.conversationId) stored = (await lastUserTexts(tx, userId, body.conversationId, 3)) ?? [];
    } catch {
        // recall falls back to this message alone
    }
    const answeredField = await settleFieldQuestion(tx, userId, settings, incomingText);
    const previous = stored.filter((text) => text !== incomingText).slice(-1)[0];
    // Their own words only (this message and the last two), what a draft's `said` quote is checked against.
    const userTexts = [...new Set([...stored, incomingText].filter(Boolean))];
    return { timezone, settings, userTexts, answeredField, queryText: [previous, incomingText].filter(Boolean).join("\n") || undefined };
}

/**
 * Images: ownership check (400 IMAGE_NOT_FOUND) + how many are new sends; a
 * regenerate/retry/edit re-sends images already sent, which count zero.
 */
async function newImageCount(c: AiContext, conversationId: string | undefined, imageIds: string[]) {
    if (!imageIds.length) return 0;
    const { newCount } = await withCallerRls(c, (tx) => resolveTurnImages(tx, c.get("userId"), conversationId, imageIds));
    return newCount;
}

/** A thread already on the standard model stays there (model-router), so only a basic pick reads the thread's last model. */
async function pickTurnModel(c: AiContext, conversationId: string | undefined, routed: { text: string; imageCount: number }) {
    const modelId = pickChatModel(c.env, routed);
    if (!conversationId || modelId === getModelId(c.env)) return modelId;
    const previous = await withCallerRls(c, (tx) => getConversation(tx, c.get("userId"), conversationId)).catch(() => null);
    return pickChatModel(c.env, routed, previous?.model);
}

/**
 * Auto-title (first turn only): generate a short title in PARALLEL with the reply
 * and persist it via waitUntil — so it lands BEFORE the assistant finishes, never
 * blocking the stream. Always resolves (fast, capped, with a derived fallback), so
 * the stream can await it without risk of hanging the response.
 */
async function startTitle(c: AiContext, turn: { conversationId: string; text: string; hasImages: boolean; requestId: string; userHash: string }) {
    const { title, spend } = await generateConversationTitle(c.env, turn.text, turn.hasImages, { requestId: turn.requestId, userHash: turn.userHash });
    c.executionCtx.waitUntil(
        withCallerRls(c, (tx) => setTitleIfEmpty(tx, c.get("userId"), turn.conversationId, title)).catch(() => {}),
    );
    return { title, spend };
}

/** Earlier memory reads replay only while the person's mode still allows what they show (Full → Basic, Forget). */
async function replayableReads(c: AiContext, messages: ChatMessage[], memoryMode: ReturnType<typeof memoryStateOf>["mode"]) {
    const cited = citedFactIds(messages);
    const usableIds = cited.length && memoryMode !== "off"
        ? new Set(await withCallerRls(c, (tx) => usableFactIds(tx, c.get("userId"), memoryMode, cited)))
        : new Set<string>();
    return redactMemoryReads(messages, memoryMode, usableIds);
}

/** Classifies a stream failure, logs it once (server-side only: the provider's status + reason), and returns the client's text. */
function reportStreamError(error: unknown, meta: { requestId: string; userHash: string; modelId: string; imageCount: number }): string {
    const streamError = buildStreamError(error, meta.requestId);
    const upstream = streamErrorCause(error) as { statusCode?: unknown; responseBody?: unknown };
    // Provider outages, timeouts and our own bugs are errors; the rest (rate limits, stops) warn.
    const level = ["AI_TIMEOUT", "AI_UPSTREAM_UNAVAILABLE", "INTERNAL_ERROR"].includes(streamError.code) ? "error" : "warn";
    logger[level]("ai", "ai_stream_error", {
        requestId: meta.requestId,
        userHash: meta.userHash,
        model: meta.modelId,
        code: streamError.code,
        images: meta.imageCount || undefined,
        upstreamStatus: upstream?.statusCode,
        upstreamBody: typeof upstream?.responseBody === "string" ? shorten(upstream.responseBody) : undefined,
        issues: issuesFromError(error),
    });
    return streamErrorToText(streamError);
}

/**
 * Inject the conversation auto-title as a TRANSIENT data part on the first turn:
 * merged alongside the agent stream (neither blocks the other) and delivered to
 * `useChat({ onData })`. The title is persisted separately (setTitleIfEmpty), so the
 * transient part is intentionally NOT added to the assistant message's parts. It still
 * rides the SSE pipe → it is mirrored to Redis + replayed on resume/refresh for free.
 */
function withTitlePart(agentStream: Awaited<ReturnType<typeof createAgentUIStream>>, titlePromise: Promise<{ title: string }>, conversationId: string) {
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

/** How a new message's turn continues the thread (logged on `ai_turn`). */
function continuationOf(kept: boolean, edited: boolean, isRerun: boolean) {
    if (kept) return "kept_write";
    if (edited) return "edit";
    return isRerun ? "rerun" : "message";
}

// ── Create: the streaming chat turn ──────────────────────────────────

/** Removes these chat images from storage (a no-op without storage). Callers do this before deleting rows, so a failure leaves them to retry. */
async function deleteStoredImages(env: Env, userId: string, imageIds: string[]) {
    if (imageIds.length === 0 || !env.USER_ASSETS) return;
    const userKey = await hashIdentifier(userId);
    await deleteImageObjects(env.USER_ASSETS, imageIds.map((imageId) => aiImageKey(userKey, imageId)));
}

export const aiRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/chat", apiValidator("json", chatRequestSchema), async (c) => {
    const userId = c.get("userId");
    const requestId = getRequestId(c);
    const userHash = await hashIdentifier(userId);
    const body = c.req.valid("json");
    const limits = resolveLimits(c.env);
    // One `ai_turn` line per turn (written in onEnd), every time in ms since the request arrived.
    const requestStartedAt: number = (c as Context<any>).get("requestStartedAt");
    const since = () => Date.now() - requestStartedAt;
    const diagnosticClockStart = performance.now();
    const diagnosticArrivalOffset = since();
    const diagnostics = createRunDiagnostics(() => diagnosticArrivalOffset + performance.now() - diagnosticClockStart);
    const turnTiming: TurnTiming = {};
    const { incoming, incomingText, imageIds } = readIncoming(body.message, limits.imagesPerMessage);

    const nonce = makeFenceNonce();
    const modelId = await pickTurnModel(c, body.conversationId, { text: incomingText, imageCount: imageIds.length });
    const clientMessageId = body.clientMessageId ?? getIdempotencyKey(c);

    // Resumption + hard abort (doc Update 4). Null when unconfigured/disabled →
    // every Redis path below no-ops and streaming behaves exactly as before.
    let redis = getRedis(c.env);
    const userKey = userHash; // = sha256(userId); the tenant key for Redis (§15.1)
    const streamId = generateId();

    // ── AI usage budget (5h + 1week × requests + tokens) ──────────────────
    // Always-on guardrail (no enable flag): admit BEFORE persisting the user turn,
    // so an over-budget user produces no orphan turn. Reserve a conservative token
    // hold now; reconcile to actual in onFinish. Layered on top of the per-turn caps
    // + CF short-window limiters — a Redis blip degrades, never bricks chat (§9.5).
    const endAdmission = diagnostics.beginPhase("admission");
    const newImages = await newImageCount(c, body.conversationId, imageIds);
    const rlRedis = getRateLimitRedis(c.env);
    const reserved = estimateReserve(incomingText.length, limits, imageIds.length);
    // Budget headers echoed on the SUCCESS response so the client holds its own
    // "remaining budget" view (display source of truth) without polling GET /ai/usage.
    const { rejected, admitted, headers: rlHeaders } = rlRedis
        ? await admitChatTurn(c, rlRedis, { userKey, userHash, reserved, limits, newImages })
        : { admitted: false };
    if (rejected) return rejected;

    endAdmission();
    // Zone/settings preparation overlaps history; continuation context is chosen from stored rows.
    const settingsReady = diagnostics.measure("zoneRecallQuery", () => withCallerRls(c, (tx) => turnSettings(tx, userId, body, incomingText)));
    settingsReady.catch(() => {});
    const storedHistoryReady = Promise.withResolvers<{ history: ChatMessage[]; continues: boolean }>();
    storedHistoryReady.promise.catch(() => {});
    async function prepareHistory(tx: Tx, result: StoredTurn) {
        const { conversationId, history, continues } = result;
        storedHistoryReady.resolve(result);
        const assistantMessageId = continues ? history.at(-1)!.id : generateId();
        // Tool-specialized UIMessage typing is internal to the SDK; the runtime shapes
        // are genuine UIMessages reconstructed from the DB + the validated incoming turn.
        // The incoming id is filtered from history (a rerun's anchor row is already
        // there) and system-role rows are dropped defensively — no persisted row may
        // ever re-enter model context with system authority. Older turns' read rows
        // shrink to ids (compactOldReads).
        // Open calls in earlier turns replay as declined; an approval answer keeps the
        // message it answers as is, so the SDK runs what was approved.
        const turn = continues
            ? [...settleUnanswered(history.slice(0, -1)), history.at(-1)!]
            : [...settleUnanswered(history.filter((m) => m.id !== incoming!.id)), incoming!];
        // A turn that switched models (model-router) must not replay the previous
        // model's thought signatures — they belong to a family this one never used.
        // Older turns compact together once every few turns (`recentStart`), so the
        // replayed history only grows between those steps and stays prompt-cached.
        const replayed = startAtUser(turn.filter((m) => m.role !== "system"));
        const recentFrom = recentStart(replayed);
        const uiMessages = compactOldReads(
            dropForeignReasoning(dropUnsignedReasoning(replayed), modelId),
            recentFrom,
        ) as ChatMessage[];
        // Recent `cadence-image:` references become data URLs for the model; older or
        // expired ones a text stub. Memory extraction and the stored reply keep the
        // references (never base64).
        const imagesReady = diagnostics.measure("images", () => hydrateImages(uiMessages, c.env.USER_ASSETS, userKey, recentFrom));
        imagesReady.catch(() => {}); // transaction failure must not leave a detached rejection
        if (redis) {
            const endResume = diagnostics.beginPhase("resumeInit");
            try {
                await openStream(redis, userKey, streamId, { conversationId, userId, messageId: assistantMessageId, model: modelId });
            } catch {
                logger.warn("ai", "ai_redis_unavailable", { op: "openStream" });
                redis = null; // no pointer to an uninitialized log; ordinary streaming still works
            } finally {
                endResume();
            }
            if (redis) await setActiveStream(tx, userId, conversationId, streamId);
        }
        return { ...result, assistantMessageId, uiMessages, recentFrom, imagesReady };
    }

    // Approval answers land on the stored assistant message, never on one the
    // client sends: only its waiting parts change, signatures stay the server's.
    async function continueApproval(tx: Tx) {
        const conversation = await getConversation(tx, userId, body.conversationId!);
        throwIfNotFound(conversation, "Conversation");
        const rows = await loadConversationMessages(tx, userId, conversation!.id, { historyWindow: true });
        const last = rows.at(-1);
        const answered = last?.role === "assistant" ? applyApprovals(rowToUIMessage(last), body.approvals!) : null;
        if (!answered) throw new AppError(409, "CONFLICT", "Nothing here is waiting for approval.");
        return prepareHistory(tx, { conversationId: conversation!.id, history: [...rows.slice(0, -1).map(rowToUIMessage), answered], continues: true, needsTitle: false, continuation: "approval" });
    }
    async function persistMessage(tx: Tx, message: ChatMessage) {
        const { id, title } = await resolveOrCreateConversation(tx, userId, { conversationId: body.conversationId, model: modelId });
        // Explicit message EDIT: the client kept rows up to the anchor and
        // rewrote everything after it — mirror that server-side or the edited-
        // away tail resurrects on reload. Anchor null = first message edited →
        // the thread restarts. An unknown anchor id is a safe no-op.
        if (body.editAnchorId !== undefined) {
            if (body.editAnchorId === null) await deleteAllMessages(tx, userId, id);
            else await truncateMessagesAfter(tx, userId, id, body.editAnchorId);
        }
        // Regenerate/retry re-runs an EXISTING user message id: drop every row
        // after it BEFORE loading history, or the superseded assistant reply
        // leaks back into model context and resurrects on reload.
        // A retry of a reply that failed after changing something continues that reply instead.
        const firstRows = body.editAnchorId === undefined
            ? await loadConversationMessages(tx, userId, id, { historyWindow: true }) : undefined;
        const kept = firstRows ? keepFinishedWrites(firstRows, message.id) : null;
        const isRerun = await truncateMessagesAfter(tx, userId, id, kept?.id ?? message.id);
        const priorRows = !isRerun && !kept && firstRows
            ? firstRows : await loadConversationMessages(tx, userId, id, { historyWindow: true });
        await appendUserMessage(tx, userId, id, message, { clientMessageId });
        await markSent(tx, userId, imageIds);
        // First user turn on a still-untitled thread → auto-title it. On a rerun
        // the anchor row (and a kept reply) are the only prior rows.
        const isFirstTurn = isRerun ? priorRows.length <= (kept ? 2 : 1) : priorRows.length === 0;
        const history = priorRows.map((row) => (row.id === kept?.id ? kept : rowToUIMessage(row)));
        return prepareHistory(tx, { conversationId: id, history, continues: !!kept, needsTitle: isFirstTurn && !title,
            continuation: continuationOf(!!kept, body.editAnchorId !== undefined, isRerun) });
    }

    // Persist the user turn + reconstruct history (RLS). The DB is the source of truth.
    // active_stream_id is set in the SAME transaction as the user turn, so the moment
    // a refreshing client can read the user message it can also resume — closing the
    // window that made a *fast* refresh (right after send) miss the live stream.
    const historyReady = diagnostics.measure("historyPersist", () => withCallerRls(c, (tx) => (incoming ? persistMessage(tx, incoming) : continueApproval(tx))));

    historyReady.catch(storedHistoryReady.reject);
    const validatedHistory = Promise.all([storedHistoryReady.promise, settingsReady]).then(async ([result, settings]) => {
        const clock = userClock(settings.timezone, body.currentDate);
        return diagnostics.measure("contextValidation", () => validateStoredContexts(result.history, memoryStateOf(settings.settings).mode,
            (ids) => withCallerRls(c, (tx) => loadContextFacts(tx, userId, ids, clock.today, memoryStateOf(settings.settings).mode))));
    });
    validatedHistory.catch(() => {});
    const reusedContext = storedHistoryReady.promise.then(async (result) => {
        if (!result.continues) return undefined; // new turns can build while history commits and old contexts validate
        const history = await validatedHistory;
        return storedTurnContext([...history].reverse().find((m) => m.role === "user") ?? { role: "assistant" });
    });
    reusedContext.catch(() => {});
    const agentReady = settingsReady.then(({ timezone, settings, queryText, userTexts, answeredField }) => getAgentInstance(c.env, userId, {
        timezone, settings, queryText, userTexts, answeredField, reusedTurnContext: reusedContext,
        requestId, diagnostics, currentDate: body.currentDate, locale: body.locale,
        approvalMode: body.approvalMode, modelId, nonce,
        waitUntil: (promise) => c.executionCtx.waitUntil(promise),
    }));
    agentReady.catch(() => {});
    const { conversationId, continues, needsTitle, continuation, assistantMessageId, uiMessages, recentFrom, imagesReady } = await historyReady;
    const history = await validatedHistory;

    // Auto-title (first turn only), in parallel with the reply.
    const titlePromise = needsTitle
        ? startTitle(c, { conversationId, text: incomingText, hasImages: imageIds.length > 0, requestId, userHash })
        : null;

    const { messages: hydratedMessages, hydrated: imageCount } = await imagesReady;
    const modelMessages = await replayableReads(c, hydratedMessages, memoryStateOf((await settingsReady).settings).mode);

    const { agent, promptHash, turnContext } = await agentReady;
    // Each recent user message replays the context it was sent with (stored, from the DB rows
    // only — never a client copy). The new message gets this turn's; a continued turn
    // (approval, kept retry) keeps its original so the reply resumes on the same prefix.
    const lastUser = [...uiMessages].reverse().find((m) => m.role === "user");
    const { contexts, current: lastUserContext, stored: storedLastContext } = turnContexts(history, lastUser?.id, turnContext, continues);
    turnTiming.setupMs = since(); // auth, budget, DB, prompt build: everything before the model call

    // Cross-isolate stop (Redis) aborts through this; the SDK `timeout` below owns the ceilings.
    const abortController = new AbortController();
    // Summed per step; saved with the reply and logged, never streamed to the client.
    let spend: TurnSpend = {};

    // Fallback watcher covers SILENT stretches (long tool calls, no flushes); the
    // flush path (consumeSseStream below) is the PRIMARY abort signal (§7.4/§15.6).
    if (redis) {
        startAbortWatcher({ redis, userKey, streamId, controller: abortController, signal: abortController.signal });
    }

    // The SDK calls onError again while consuming its own serialized error part.
    // Keep the first terminal error: one classification and one log per turn.
    let reportedStreamError: string | undefined;
    const agentStream = await createAgentUIStream({
        agent,
        uiMessages: withTurnContext(modelMessages as { id: string; role: string; parts: unknown[] }[], contexts, recentFrom),
        abortSignal: abortController.signal,
        // Hard ceilings cancel the upstream model call (no zombie spend, doc 09 §3.1);
        // firstChunkMs fails a hung provider fast instead of waiting out the whole turn.
        timeout: { totalMs: STREAM_TIMEOUT_MS, firstChunkMs: FIRST_CHUNK_TIMEOUT_MS },
        originalMessages: uiMessages as any,
        generateMessageId: () => assistantMessageId,
        messageMetadata: ({ part }) => {
            if (part.type === "finish-step") spend = addStepSpend(spend, part);
            return part.type === "finish"
                ? ({ totalUsage: (part as any).totalUsage, model: modelId, promptHash } as any)
                : undefined;
        },
        onError: (error) => {
            reportedStreamError ??= reportStreamError(error, { requestId, userHash, modelId, imageCount });
            return reportedStreamError;
        },
        onEnd: async ({ responseMessage, isAborted, finishReason, outcome }) => {
            const totalMs = since();
            abortController.abort(); // stop the fallback watcher loop
            // Terminal status drives the client's Retry affordance after reload (doc 09 §3.3).
            // A model call that throws ends with outcome "failed" and no finishReason.
            const status = isAborted ? "aborted" : outcome.status === "failed" || finishReason === "error" ? "failed" : "complete";
            try {
                const titleSpend = (await titlePromise)?.spend; // always resolves, ≤4s
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
            // The response returned before the stream ended, so the write hook missed this turn's tool writes;
            // and the sitting's reading is queued for when the chat goes quiet.
            const learns = isLearning(memoryStateOf((await settingsReady).settings).mode);
            c.executionCtx.waitUntil(Promise.all([replanReminders(c.env, userId), learns && scheduleLearn(c.env, userId)]));
            // Close the Redis log (TTLs shrink to a ~60s grace so a late re-attach can
            // still replay it) + authoritatively compare-and-finalize the pointer: clear
            // active_stream_id AND record this as last_stream_id/status, but only if it
            // still points at THIS stream — never clobbers a newer turn (§7.9).
            if (redis) {
                const streamState =
                    status === "complete" ? "done" : status === "failed" ? "error" : "aborted";
                await closeStream(redis, userKey, streamId, streamState).catch(() => {});
                await withCallerRls(c, (tx) =>
                    finalizeActiveStream(tx, userId, conversationId, streamId, status),
                ).catch(() => {});
            }
            // Settle the usage budget: reconcile the admission reserve to the ACTUAL
            // tokens the model reported (refund/top-up) and release the concurrency
            // slot. Idempotent per streamId (settle-once guard) so an onFinish/stop
            // race counts a turn exactly once (§9.2/§15.6). Only when we admitted.
            if (rlRedis && admitted) {
                const actualTokens = readMeteredTokens(responseMessage);
                await settle(rlRedis, userKey, reserved, actualTokens).catch(() =>
                    logger.warn("ai", "ai_ratelimit_settle_failed", { requestId, userHash }),
                );
            }
            logTurn(responseMessage, status, totalMs);
        },
    });

    const responseStream = titlePromise ? withTitlePart(agentStream, titlePromise, conversationId) : agentStream;

    // Backend delivery milestones; these do not measure client receipt or paint.
    const timedStream = responseStream.pipeThrough(
        new TransformStream({
            transform(chunk, controller) {
                if (chunk.type === "reasoning-delta" || chunk.type === "text-delta") turnTiming.ttftMs ??= since();
                if (chunk.type === "text-delta") turnTiming.firstTextMs ??= since();
                controller.enqueue(chunk);
            },
        }),
    );
    function logTurn(message: UIMessage, outcome: string, totalMs: number) {
        const usage = (message.metadata as { totalUsage?: LanguageModelUsage } | undefined)?.totalUsage;
        const outputTokens = usage?.outputTokens;
        // Tool turns include tool run time here, so their speed reads low; compare like with like.
        const streamS = turnTiming.ttftMs === undefined ? 0 : (totalMs - turnTiming.ttftMs) / 1000;
        logger.info("ai", "ai_turn", {
            requestId,
            userHash,
            conversationId,
            replyId: assistantMessageId,
            runId: diagnostics.runId,
            continuation,
            promptHash,
            diagnostics: diagnostics.snapshot(),
            model: modelId,
            outcome,
            steps: message.parts.filter((p) => p.type === "step-start").length,
            toolCalls: message.parts.filter((p) => p.type.startsWith("tool-") || p.type === "dynamic-tool").length,
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
        // Echo the post-admission budget so the client tracks "remaining" locally (§9.4).
        headers: rlHeaders,
        consumeSseStream: ({ stream }) => {
            c.executionCtx.waitUntil(
                (async () => {
                    // Current behavior when resumption is off: drain a tee'd copy so the
                    // pipeline (and onFinish persistence) completes even on client
                    // disconnect (doc 08 §3 / doc 09 §3.2).
                    if (!redis) {
                        await stream.pipeTo(new WritableStream()).catch(() => {});
                        return;
                    }

                    await mirrorChunks({ stream, redis, userKey, streamId, controller: abortController });
                })(),
            );
        },
    });
    })
    // ── Resume: re-attach to an in-flight stream (`useChat({ resume: true })`) ──
    // ── Create: Suggest steps (a draft only; Keep writes subtasks) ─────────
    .post("/steps", apiValidator("json", suggestStepsSchema), async (c) => {
        const userId = c.get("userId");
        const { taskId, smaller } = c.req.valid("json");
        const input = await withCallerRls(c, (tx) => readStepsInput(tx, userId, taskId));
        const userHash = await hashIdentifier(userId);
        const limits = resolveLimits(c.env);
        const rlRedis = getRateLimitRedis(c.env);
        // Counts toward AI usage like a chat turn: admitted first, then settled to what it cost.
        const reserved = estimateReserve(stepsPromptFor(input, smaller).length, limits);
        let admitted = false;
        if (rlRedis) {
            try {
                const admission = await admit(rlRedis, userHash, reserved, limits);
                if (!admission.ok) return aiRateLimitResponse(c, { code: admission.code, retryAfterS: admission.retryAfterS, limits, remaining: admission.remaining });
                admitted = true;
            } catch {
                logger.warn("ai", "ai_ratelimit_unavailable", { requestId: getRequestId(c), userHash, op: "admit" });
                if (limits.failClosed) return aiRateLimitResponse(c, { retryAfterS: 30, limits });
            }
        }
        let tokens = 0;
        try {
            const drafted = await suggestSteps(c.env, userHash, input, smaller);
            tokens = drafted.tokens;
            return c.json({ data: { steps: drafted.steps } });
        } finally {
            if (rlRedis && admitted) {
                c.executionCtx.waitUntil(settle(rlRedis, userHash, reserved, tokens).catch(() => logger.warn("ai", "ai_ratelimit_settle_failed", { userHash })));
            }
        }
    })
    .get("/chat/:id/stream", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const redis = getRedis(c.env);
        if (!redis) return new Response(null, { status: 204 }); // resumption disabled

        // Gate #1: RLS + ownership on the conversation row (§15.1).
        const conversation = await withRls(getDbClient(c.env), userId, (tx) => getConversation(tx, userId, id));
        throwIfNotFound(conversation, "Conversation");
        // Prefer a LIVE stream; otherwise fall back to the most recently finished one so a
        // slightly-late re-attach (refresh, or an idle tab signalled by the other tab) can
        // grace-replay its just-finished chunk-log while it's still alive (~60s). When the
        // grace window has passed, readMeta returns null below → 204 and the client falls
        // back to the persisted DB message it already loaded via history.
        const sid = conversation!.activeStreamId ?? conversation!.lastStreamId;
        if (!sid) return new Response(null, { status: 204 }); // nothing live or recent → useChat no-op

        const userKey = await hashIdentifier(userId);
        // Gate #2 (defense-in-depth, §15.1): the stream meta must name THIS user. A null
        // meta means the log is gone — never opened, or the grace window expired — so a
        // finished stream past its window resolves to 204 here (the key is already
        // userKey-scoped, so a present meta naming another user only happens on corruption).
        const meta = await readMeta(redis, userKey, sid).catch(() => null);
        if (!meta || meta.userId !== userId) return new Response(null, { status: 204 });

        return new Response(buildResumeStream(redis, userKey, sid), { headers: UI_MESSAGE_STREAM_HEADERS });
    })
    // ── Stop: hard-abort the in-flight turn (real cross-isolate cancel) ──
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
            throwIfNotFound(conversation, "Conversation"); // RLS + ownership
            const sid = conversation!.activeStreamId;
            if (!redis || !sid) return c.json({ data: { success: true } }); // nothing to stop

            // Guard against stopping a newer turn the client doesn't know about.
            if (body.activeStreamId && body.activeStreamId !== sid) {
                return c.json({ data: { success: true } });
            }

            const userKey = await hashIdentifier(userId);
            // Cross-isolate signal on the OWNER's key; producer reacts on next flush
            // (≤100ms) / fallback watcher (≤1s). Does NOT clear active_stream_id — the
            // producer's onFinish does the authoritative compare-and-clear (§7.9).
            await requestAbort(redis, userKey, sid).catch(() => {});

            // Optionally persist the partial snapshot the client already rendered, so a
            // refresh before the producer's own onFinish lands shows the partial text.
            // PK-upsert converges with the producer's later onFinish("aborted").
            //
            // SECURITY: the snapshot is accepted ONLY when it names the exact assistant
            // message id of the live stream (owner-scoped Redis meta) — this path can
            // never overwrite arbitrary history rows or inject content under another
            // id. Role is schema-pinned to "assistant", client metadata is discarded,
            // and the standard message caps apply. Any failed check silently skips the
            // snapshot (the abort itself already succeeded; the producer's onFinish
            // will persist the authoritative partial).
            if (body.assistantMessage) {
                try {
                    const meta = await readMeta(redis, userKey, sid);
                    if (meta && meta.userId === userId && meta.messageId === body.assistantMessage.id) {
                        assertMessageWithinCaps(body.assistantMessage);
                        await withRls(getDbClient(c.env), userId, (tx) =>
                            saveAssistantMessage(tx, userId, id, body.assistantMessage!, {
                                status: "aborted",
                                metadata: {},
                            }),
                        );
                    }
                } catch {
                    // Best-effort snapshot — never fails the stop.
                }
            }
            return c.json({ data: { success: true } });
        },
    )
    // ── Update: rename / archive a thread ────────────────────────────────
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
    // ── Read: AI usage budget (transparency — "messages left · resets in…") ──
    .get("/usage", async (c) => {
        const userId = c.get("userId");
        const limits = resolveLimits(c.env);
        const rlRedis = getRateLimitRedis(c.env);
        // Read-only and scoped to the caller's own userKey (§15.1) — never another
        // tenant's numbers. Degrades to a zero-usage placeholder when unconfigured.
        if (!rlRedis) return c.json({ data: emptyUsage(limits) });
        const userKey = await hashIdentifier(userId);
        const usage = await readUsage(rlRedis, userKey, limits).catch(() => emptyUsage(limits));
        c.header("Cache-Control", "private, max-age=5");
        return c.json({ data: usage });
    })
    // ── Read: list threads / load one thread's messages ──────────────────
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
    // ── Delete: clear the archive — every archived thread, messages and images ──
    // Registered before `/conversations/:id` so "archived" never reaches the id route.
    .delete("/conversations/archived", async (c) => {
        const userId = c.get("userId");

        // Storage first, as for one thread: if it fails, the rows stay and the clear can be retried.
        const imageIds = await withCallerRls(c, (tx) => listArchivedImageIds(tx, userId));
        await deleteStoredImages(c.env, userId, imageIds);
        const deleted = await withCallerRls(c, (tx) => deleteArchivedConversations(tx, userId));

        return c.json({ data: { deleted } });
    })
    // ── Delete: remove a thread (messages cascade) ───────────────────────
    .delete("/conversations/:id", apiValidator("param", uuidParamSchema), async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.valid("param");

    // Its images go with it. Storage first: if that fails, the rows stay and the delete can be retried.
    const imageIds = await withCallerRls(c, (tx) => listConversationImageIds(tx, userId, id));
    await deleteStoredImages(c.env, userId, imageIds);
    await withCallerRls(c, (tx) => deleteConversation(tx, userId, id));

    return c.json({ data: { id, deleted: true } });
});
