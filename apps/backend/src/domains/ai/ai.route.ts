import { Hono, type Context } from "hono";
import {
    createAgentUIStream,
    createUIMessageStream,
    createUIMessageStreamResponse,
    generateId,
    UI_MESSAGE_STREAM_HEADERS,
} from "ai";
import { CONVERSATION_TITLE_DATA_TYPE } from "@cadence/contracts/ai";
import { apiValidator } from "../../platform/validation";
import { getDbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { getRequestId, setRequestErrorCode } from "../../platform/request-log";
import { logger, hashIdentifier } from "../../platform/log";
import { getIdempotencyKey } from "../../platform/idempotency";
import { getRedis, getRateLimitRedis } from "../../platform/redis";
import {
    chatRequestSchema,
    conversationIdParamSchema,
    listConversationsQuerySchema,
    conversationMessagesQuerySchema,
    conversationPatchSchema,
    stopStreamSchema,
    toolOutputParamSchema,
    toolOutputRequestSchema,
} from "./ai.schema";
import { getAgentInstance, getModelId } from "./agent";
import {
    resolveOrCreateConversation,
    loadConversationMessages,
    appendUserMessage,
    truncateMessagesAfter,
    deleteAllMessages,
    attachToolOutput,
    saveAssistantMessage,
    touchConversation,
    listConversations,
    getConversation,
    renameOrArchiveConversation,
    deleteConversation,
    setActiveStream,
    finalizeActiveStream,
    setTitleIfEmpty,
} from "./persistence/conversation-repo";
import { generateConversationTitle } from "./title/generate-title";
import { openStream, closeStream, flushChunks, requestAbort, readMeta } from "./streaming/resume-store";
import { startAbortWatcher } from "./streaming/abort-watcher";
import { buildResumeStream } from "./streaming/replay";
import { rowToUIMessage } from "./persistence/message-mapper";
import { makeFenceNonce, stripNonce } from "./safety/injection-policy";
import { assertMessageWithinCaps, clampHistory, MAX_HISTORY_TURNS, MAX_PART_BYTES } from "./safety/input-guard";
import { buildStreamError, streamErrorToText, AI_ERROR_CODES } from "./safety/stream-error";
import {
    resolveLimits,
    estimateReserve,
    admit,
    settle,
    readUsage,
    readTotalTokens,
    emptyUsage,
    rateLimitHeaders,
    type AiLimits,
    type RemainingByWindow,
} from "./safety/rate-limit";
import { extractAndStoreMemories } from "./memory/memory-write";
import { AppError, throwIfNotFound } from "../../platform/errors";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";

// Router defined below as a single CHAIN (after its helpers) so the route schema
// flows into AppType for the Hono RPC client.

/** Hard wall-clock ceiling for a single streamed turn (improves on the old blunt 12s). */
const STREAM_TIMEOUT_MS = 45_000;

// ── Utility ───────────────────────────────────────────────────────────

type ChatMessage = { id: string; role: "user" | "assistant" | "system"; parts: unknown[]; metadata?: Record<string, unknown> };

/** Join text parts of a UIMessage into a single query string (for memory retrieval). */
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

/**
 * Pre-stream 429 for the AI usage budget. The HTTP status is still unsent here, so
 * we use the normal JSON `AppError` envelope (reusing the `AI_RATE_LIMITED` spec the
 * frontend already renders with a Retry affordance) and attach `Retry-After` +
 * `X-RateLimit-*` headers — mirroring the global `rateLimitResponse` in index.ts.
 */
function aiRateLimitResponse(
    c: Context<{ Bindings: Env; Variables: AuthVariables }>,
    opts: { retryAfterS: number; limits: AiLimits; remaining?: RemainingByWindow },
) {
    setRequestErrorCode(c, "AI_RATE_LIMITED");
    const headers: Record<string, string> = { "Retry-After": String(Math.max(1, opts.retryAfterS)) };
    if (opts.remaining) Object.assign(headers, rateLimitHeaders(opts.remaining, opts.limits));
    return c.json(
        {
            error: {
                code: "AI_RATE_LIMITED",
                message: AI_ERROR_CODES.AI_RATE_LIMITED.message,
                status: 429,
                isRetryable: true,
                requestId: getRequestId(c),
            },
        },
        { status: 429, headers },
    );
}

// ── Create: the streaming chat turn ──────────────────────────────────

export const aiRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/chat", apiValidator("json", chatRequestSchema), async (c) => {
    const userId = c.get("userId");
    const requestId = getRequestId(c);
    const userHash = await hashIdentifier(userId);
    const body = c.req.valid("json");

    // Latest user message (load-by-id). Role is pinned to "user" at the schema
    // level — a crafted request can never persist an assistant/system row here.
    const incoming = body.message as ChatMessage;
    assertMessageWithinCaps(incoming); // AI-specific caps → 400 INVALID_REQUEST on oversize

    const db = getDbClient(c.env);
    const nonce = makeFenceNonce();
    const modelId = getModelId(c.env);
    const clientMessageId = body.clientMessageId ?? getIdempotencyKey(c);

    // Resumption + hard abort (doc Update 4). Null when unconfigured/disabled →
    // every Redis path below no-ops and streaming behaves exactly as before.
    const redis = getRedis(c.env);
    const userKey = userHash; // = sha256(userId); the tenant key for Redis (§15.1)
    const streamId = generateId();
    // Mint the assistant id up-front so the streamed `start` frame, the persisted
    // row PK, and any resume all reference ONE id (PK-upsert stays idempotent, §7.7).
    const assistantMessageId = generateId();

    // ── AI usage budget (5h + 1week × requests + tokens) ──────────────────
    // Always-on guardrail (no enable flag): admit BEFORE persisting the user turn,
    // so an over-budget user produces no orphan turn. Reserve a conservative token
    // hold now; reconcile to actual in onFinish. Layered on top of the per-turn caps
    // + CF short-window limiters — a Redis blip degrades, never bricks chat (§9.5).
    const rlRedis = getRateLimitRedis(c.env);
    const limits = resolveLimits(c.env);
    const reserved = estimateReserve(extractText(incoming.parts).length, limits);
    let admitted = false;
    // Budget headers echoed on the SUCCESS response so the client holds its own
    // "remaining budget" view (display source of truth) without polling GET /ai/usage.
    let rlHeaders: Record<string, string> | undefined;
    if (rlRedis) {
        try {
            const admission = await admit(rlRedis, userKey, reserved, limits);
            if (!admission.ok) {
                logger.warn("ai", "ai_ratelimit_rejected", {
                    requestId,
                    userHash,
                    window: admission.window,
                    dimension: admission.dimension,
                    retryAfterS: admission.retryAfterS,
                });
                return aiRateLimitResponse(c, {
                    retryAfterS: admission.retryAfterS,
                    limits,
                    remaining: admission.remaining,
                });
            }
            admitted = true; // only settle a turn we actually reserved against
            rlHeaders = rateLimitHeaders(admission.remaining, limits);
        } catch {
            // Redis unreachable → fail-open (default) or fail-closed per policy. Even
            // fail-open keeps per-turn caps + the 60s CF limiter as backstops (§9.5).
            logger.warn("ai", "ai_ratelimit_unavailable", { requestId, userHash, op: "admit" });
            if (limits.failClosed) return aiRateLimitResponse(c, { retryAfterS: 30, limits });
        }
    }

    // Persist the user turn + reconstruct history (RLS). The DB is the source of truth.
    // active_stream_id is set in the SAME transaction as the user turn, so the moment
    // a refreshing client can read the user message it can also resume — closing the
    // window that made a *fast* refresh (right after send) miss the live stream.
    const { conversationId, history, needsTitle } = await withRls(db, userId, async (tx) => {
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
        const isRerun = await truncateMessagesAfter(tx, userId, id, incoming.id);
        const priorRows = await loadConversationMessages(tx, userId, id, { limit: MAX_HISTORY_TURNS });
        await appendUserMessage(tx, userId, id, incoming, { clientMessageId });
        if (redis) await setActiveStream(tx, userId, id, streamId);
        // First user turn on a still-untitled thread → auto-title it. On a rerun
        // the anchor row itself is the only prior row.
        const isFirstTurn = isRerun ? priorRows.length <= 1 : priorRows.length === 0;
        return { conversationId: id, history: priorRows.map(rowToUIMessage), needsTitle: isFirstTurn && !title };
    });

    // Auto-title (first turn only): generate a short title in PARALLEL with the reply
    // and persist it via waitUntil — so it lands BEFORE the assistant finishes, never
    // blocking the stream. Always resolves (fast, capped, with a derived fallback), so
    // `execute` below can await it without risk of hanging the response.
    const titlePromise = needsTitle
        ? (async () => {
              const title = await generateConversationTitle(c.env, extractText(incoming.parts), body.locale);
              c.executionCtx.waitUntil(
                  withRls(db, userId, (tx) => setTitleIfEmpty(tx, userId, conversationId, title)).catch(() => {}),
              );
              return title;
          })()
        : null;

    if (redis) {
        // Open the chunk-log immediately (before the slower agent build) so a quick
        // resume finds a live log, not just the DB pointer. Best-effort: a Redis
        // failure degrades to non-resumable (onFinish still clears active_stream_id).
        try {
            await openStream(redis, userKey, streamId, {
                conversationId,
                userId,
                messageId: assistantMessageId,
                model: modelId,
            });
            logger.info("ai", "ai_stream_opened", { requestId, userHash, conversationId, streamId });
        } catch {
            logger.warn("ai", "ai_redis_unavailable", { op: "openStream" });
        }
    }

    // Tool-specialized UIMessage typing is internal to the SDK; the runtime shapes
    // are genuine UIMessages reconstructed from the DB + the validated incoming turn.
    // The incoming id is filtered from history (a rerun's anchor row is already
    // there) and system-role rows are dropped defensively — no persisted row may
    // ever re-enter model context with system authority.
    const uiMessages = clampHistory([
        ...history.filter((m) => m.id !== incoming.id && m.role !== "system"),
        incoming,
    ]) as unknown[];

    const { agent } = await getAgentInstance(c.env, userId, {
        timezone: body.timezone,
        currentDate: body.currentDate,
        locale: body.locale,
        nonce,
        queryText: extractText(incoming.parts),
    });

    // Hard ceiling: abort cancels the upstream model call (no zombie spend, doc 09 §3.1).
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(new Error("AI_TIMEOUT")), STREAM_TIMEOUT_MS);

    // Fallback watcher covers SILENT stretches (long tool calls, no flushes); the
    // flush path (consumeSseStream below) is the PRIMARY abort signal (§7.4/§15.6).
    if (redis) {
        startAbortWatcher({ redis, userKey, streamId, controller: abortController, signal: abortController.signal });
    }

    const agentStream = await createAgentUIStream({
        agent,
        uiMessages,
        abortSignal: abortController.signal,
        originalMessages: uiMessages as any,
        generateMessageId: () => assistantMessageId,
        messageMetadata: ({ part }) =>
            part.type === "finish"
                ? ({ totalUsage: (part as any).totalUsage, model: modelId } as any)
                : undefined,
        onError: (error) => {
            const streamError = buildStreamError(error, requestId);
            logger.warn("ai", "ai_stream_error", { requestId, userHash, code: streamError.code });
            return streamErrorToText(streamError);
        },
        onFinish: async ({ responseMessage, isAborted, finishReason }) => {
            clearTimeout(timer);
            abortController.abort(); // stop the fallback watcher loop
            // Terminal status drives the client's Retry affordance after reload (doc 09 §3.3).
            const status = isAborted ? "aborted" : finishReason === "error" ? "failed" : "complete";
            try {
                const cleaned = stripNonceFromMessage(responseMessage as any, nonce);
                await withRls(db, userId, async (tx) => {
                    await saveAssistantMessage(tx, userId, conversationId, cleaned, {
                        status,
                        metadata: cleaned.metadata,
                    });
                    await touchConversation(tx, conversationId, { model: modelId });
                });
            } catch {
                logger.warn("ai", "ai_persist_failed", { requestId, userHash, conversationId });
            }
            // Close the Redis log (TTLs shrink to a ~60s grace so a late re-attach can
            // still replay it) + authoritatively compare-and-finalize the pointer: clear
            // active_stream_id AND record this as last_stream_id/status, but only if it
            // still points at THIS stream — never clobbers a newer turn (§7.9).
            if (redis) {
                const streamState =
                    status === "complete" ? "done" : status === "failed" ? "error" : "aborted";
                await closeStream(redis, userKey, streamId, streamState).catch(() => {});
                await withRls(db, userId, (tx) =>
                    finalizeActiveStream(tx, userId, conversationId, streamId, status),
                ).catch(() => {});
                logger.info("ai", "ai_stream_closed", { streamId, state: streamState });
            }
            // Settle the usage budget: reconcile the admission reserve to the ACTUAL
            // tokens the model reported (refund/top-up) and release the concurrency
            // slot. Idempotent per streamId (settle-once guard) so an onFinish/stop
            // race counts a turn exactly once (§9.2/§15.6). Only when we admitted.
            if (rlRedis && admitted) {
                const actualTokens = readTotalTokens(responseMessage);
                await settle(rlRedis, userKey, reserved, actualTokens).catch(() =>
                    logger.warn("ai", "ai_ratelimit_settle_failed", { requestId, userHash }),
                );
            }
            // Post-turn memory extraction — flagged + non-blocking (never blocks the stream).
            c.executionCtx.waitUntil(
                extractAndStoreMemories(c.env, userId, { conversationId, messages: uiMessages }).catch(() => {}),
            );
        },
    });

    // Inject the conversation auto-title as a TRANSIENT data part on the first turn:
    // merged alongside the agent stream (neither blocks the other) and delivered to
    // `useChat({ onData })`. The title is persisted separately (setTitleIfEmpty), so the
    // transient part is intentionally NOT added to the assistant message's parts. It still
    // rides the SSE pipe → it is mirrored to Redis + replayed on resume/refresh for free.
    const responseStream = titlePromise
        ? createUIMessageStream({
              execute: async ({ writer }) => {
                  writer.merge(agentStream);
                  const title = await titlePromise;
                  if (title) {
                      writer.write({
                          type: CONVERSATION_TITLE_DATA_TYPE,
                          data: { conversationId, title },
                          transient: true,
                      });
                  }
              },
          })
        : agentStream;

    return createUIMessageStreamResponse({
        stream: responseStream,
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

                    // Batched mirror: coalesce complete SSE frames and flush as ONE
                    // pipelined XADD per window (§15.3). The abort-flag read is folded
                    // into each flush → primary abort signal, zero extra RTT (§15.6).
                    // `stream` is already ReadableStream<string> (SSE text frames).
                    const reader = stream.getReader();
                    const FLUSH_MS = 100;
                    const FLUSH_BYTES = 16 * 1024;
                    let buf = "";
                    let lastFlush = Date.now();
                    const flush = async () => {
                        if (!buf) return;
                        const blob = buf;
                        buf = "";
                        lastFlush = Date.now();
                        const { abortRequested } = await flushChunks(redis, userKey, streamId, blob).catch(() => ({
                            abortRequested: false,
                        }));
                        if (abortRequested) abortController.abort(new Error("AI_ABORTED"));
                    };
                    try {
                        for (;;) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            if (value) buf += value;
                            if (buf.length >= FLUSH_BYTES || Date.now() - lastFlush >= FLUSH_MS) await flush();
                        }
                        await flush(); // final partial window
                    } catch {
                        /* disconnect/abort — onFinish + closeStream still run */
                    }
                })(),
            );
        },
    });
    })
    // ── Resume: re-attach to an in-flight stream (`useChat({ resume: true })`) ──
    .get("/chat/:id/stream", apiValidator("param", conversationIdParamSchema), async (c) => {
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
        const live = conversation!.activeStreamId;
        const sid = live ?? conversation!.lastStreamId;
        if (!sid) return new Response(null, { status: 204 }); // nothing live or recent → useChat no-op

        const userKey = await hashIdentifier(userId);
        // Gate #2 (defense-in-depth, §15.1): the stream meta must name THIS user. A null
        // meta means the log is gone — never opened, or the grace window expired — so a
        // finished stream past its window resolves to 204 here (the key is already
        // userKey-scoped, so a present meta naming another user only happens on corruption).
        const meta = await readMeta(redis, userKey, sid).catch(() => null);
        if (!meta || meta.userId !== userId) return new Response(null, { status: 204 });

        logger.info("ai", "ai_stream_resumed", {
            userHash: userKey,
            conversationId: id,
            streamId: sid,
            mode: live ? "live" : "grace",
        });
        return new Response(buildResumeStream(redis, userKey, sid), { headers: UI_MESSAGE_STREAM_HEADERS });
    })
    // ── Stop: hard-abort the in-flight turn (real cross-isolate cancel) ──
    .post(
        "/chat/:id/stop",
        apiValidator("param", conversationIdParamSchema),
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
            logger.info("ai", "ai_stream_abort_requested", {
                userHash: userKey,
                conversationId: id,
                streamId: sid,
            });

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
    // ── Update: persist a client-resolved proposal decision (HITL tool output) ──
    // `addToolResult` is client-local; without this write a reload re-offers an
    // already-committed proposal (double-write risk) and the model never learns
    // the decision on later turns. The repo helper only fills `output` on an
    // EXISTING unresolved tool part of an owned assistant message — it can never
    // rewrite text, add parts, or flip a settled decision.
    .post(
        "/conversations/:id/messages/:messageId/tool-output",
        apiValidator("param", toolOutputParamSchema),
        apiValidator("json", toolOutputRequestSchema),
        async (c) => {
            const userId = c.get("userId");
            const { id, messageId } = c.req.valid("param");
            const body = c.req.valid("json");

            // Bound the payload like any message part.
            if (new TextEncoder().encode(JSON.stringify(body.output)).length > MAX_PART_BYTES) {
                throw new AppError(400, "INVALID_REQUEST", "Tool output too large.");
            }

            const db = getDbClient(c.env);
            const updated = await withRls(db, userId, async (tx) => {
                const conversation = await getConversation(tx, userId, id);
                throwIfNotFound(conversation, "Conversation");
                return attachToolOutput(tx, userId, id, messageId, body);
            });

            return c.json({ data: { updated } });
        },
    )
    // ── Update: rename / archive a thread ────────────────────────────────
    .patch(
    "/conversations/:id",
    apiValidator("param", conversationIdParamSchema),
    apiValidator("json", conversationPatchSchema),
    async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const patch = c.req.valid("json");
        const db = getDbClient(c.env);

        const conversation = await withRls(db, userId, async (tx) => {
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
    const userId = c.get("userId");
    const { limit, cursor } = c.req.valid("query");
    const db = getDbClient(c.env);

    const conversations = await withRls(db, userId, (tx) => listConversations(tx, userId, { limit, cursor }));

    c.header("Cache-Control", "private, max-age=0, stale-while-revalidate=5");
    return c.json({ data: { conversations } });
    })
    .get(
    "/conversations/:id",
    apiValidator("param", conversationIdParamSchema),
    apiValidator("query", conversationMessagesQuerySchema),
    async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { limit, before } = c.req.valid("query");
        const db = getDbClient(c.env);

        const result = await withRls(db, userId, async (tx) => {
            const conversation = await getConversation(tx, userId, id);
            throwIfNotFound(conversation, "Conversation");
            const rows = await loadConversationMessages(tx, userId, id, { limit, beforeOrderIndex: before });
            return { conversation, messages: rows.map(rowToUIMessage) };
        });

        c.header("Cache-Control", "private, max-age=0, stale-while-revalidate=5");
        return c.json({ data: result });
    },
    )
    // ── Delete: remove a thread (messages cascade) ───────────────────────
    .delete("/conversations/:id", apiValidator("param", conversationIdParamSchema), async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.valid("param");
    const db = getDbClient(c.env);

    await withRls(db, userId, (tx) => deleteConversation(tx, userId, id));

    return c.json({ data: { id, deleted: true } });
});
