/**
 * The SSE chunk-log: read/write of the buffered stream, its terminal state, and
 * the cross-isolate abort flag (doc Update 4 §7.3).
 *
 * Every mutating op is a SINGLE pipelined round-trip (§15.3). The producer does
 * NOT write per token delta — `flushChunks` is called by the route's batcher,
 * which coalesces complete SSE frames into one blob per ~100ms / 16KB window. The
 * abort-flag read is folded into the flush pipeline so detecting an abort during
 * active output costs zero extra requests (§15.6).
 *
 * Frames are the raw AI-SDK SSE text (`data: {...}\n\n`); replay enqueues them
 * verbatim so `useChat` parses an identical stream.
 */
import type { Redis } from "@upstash/redis/cloudflare";
import {
    keys,
    CHUNKS_TTL_S,
    CLOSE_GRACE_S,
    ABORT_TTL_S,
    STREAM_MAXLEN,
    FRAME_FIELD,
    type StreamState,
} from "./stream-keys";

export type StreamMeta = {
    conversationId: string;
    userId: string;
    messageId: string;
    model: string;
};

// With `automaticDeserialization: false`, Upstash REST returns hash/stream
// FIELDS as a FLAT array `[field, value, field, value, …]` (NOT a keyed object,
// and NOT JSON-coerced). These helpers normalise that — and tolerate the object
// form too (autoDeser=true / in-memory fakes) — so parsing is shape-agnostic.

/** Read one field's value from Upstash field data in either shape. */
function fieldValue(fields: unknown, key: string): string | undefined {
    if (Array.isArray(fields)) {
        for (let i = 0; i + 1 < fields.length; i += 2) {
            if (fields[i] === key) return typeof fields[i + 1] === "string" ? (fields[i + 1] as string) : undefined;
        }
        return undefined;
    }
    if (fields && typeof fields === "object") {
        const v = (fields as Record<string, unknown>)[key];
        return typeof v === "string" ? v : undefined;
    }
    return undefined;
}

/** Normalise a flat `[f, v, …]` array (or object) of hash fields into an object. */
function fieldsToObject(raw: unknown): Record<string, string> | null {
    if (!raw) return null;
    if (Array.isArray(raw)) {
        const out: Record<string, string> = {};
        for (let i = 0; i + 1 < raw.length; i += 2) {
            if (typeof raw[i] === "string" && typeof raw[i + 1] === "string") out[raw[i] as string] = raw[i + 1] as string;
        }
        return Object.keys(out).length ? out : null;
    }
    if (typeof raw === "object") return raw as Record<string, string>;
    return null;
}

/** Normalise an XRANGE result (flat-array entries or keyed object) into [id, fields] pairs. */
function toStreamEntries(range: unknown): Array<[string, unknown]> {
    if (Array.isArray(range)) {
        // [[id, [field, value, …]], …]
        return range
            .filter((e): e is [string, unknown] => Array.isArray(e) && typeof e[0] === "string")
            .map((e) => [e[0], e[1]] as [string, unknown]);
    }
    if (range && typeof range === "object") {
        return Object.entries(range as Record<string, unknown>);
    }
    return [];
}

// ── Producer side ─────────────────────────────────────────────────────

/** Open the log: seed meta + state=active and arm the active-window TTLs. ONE pipeline. */
export async function openStream(
    redis: Redis,
    userKey: string,
    sid: string,
    meta: StreamMeta,
): Promise<void> {
    const k = keys(userKey, sid);
    await redis
        .pipeline()
        .hset(k.meta, {
            conversationId: meta.conversationId,
            userId: meta.userId,
            messageId: meta.messageId,
            model: meta.model,
        })
        .set(k.state, "active")
        .expire(k.meta, CHUNKS_TTL_S)
        .expire(k.state, CHUNKS_TTL_S)
        .exec();
}

/**
 * Append a coalesced SSE blob, refresh the active-window TTLs, and read the abort
 * flag — all in ONE pipeline. Returns `abortRequested` so the producer reacts on
 * its own flush cadence with zero extra round-trips (§15.6). `MAXLEN ~` only
 * guards a pathological runaway; a normal turn never trims, so replay stays whole.
 */
export async function flushChunks(
    redis: Redis,
    userKey: string,
    sid: string,
    blob: string,
): Promise<{ abortRequested: boolean }> {
    const k = keys(userKey, sid);
    const res = await redis
        .pipeline()
        .xadd(k.chunks, "*", { [FRAME_FIELD]: blob }, {
            trim: { type: "MAXLEN", threshold: STREAM_MAXLEN, comparison: "~" },
        })
        .expire(k.chunks, CHUNKS_TTL_S)
        .expire(k.state, CHUNKS_TTL_S)
        .get<string | null>(k.abort)
        .exec();

    // The GET abort is the last command in the pipeline.
    const abort = res[res.length - 1] as string | null;
    return { abortRequested: abort === "1" };
}

/**
 * Flip the terminal state and shrink every key's TTL to a short grace, so Redis
 * self-evicts the turn ~60s after completion (§15.2) — just enough for a client
 * mid-resume to drain the final frames. Drops the abort flag. ONE pipeline.
 */
export async function closeStream(
    redis: Redis,
    userKey: string,
    sid: string,
    state: StreamState,
): Promise<void> {
    const k = keys(userKey, sid);
    await redis
        .pipeline()
        .set(k.state, state)
        .expire(k.chunks, CLOSE_GRACE_S)
        .expire(k.state, CLOSE_GRACE_S)
        .expire(k.meta, CLOSE_GRACE_S)
        .del(k.abort)
        .exec();
}

// ── Resume side ───────────────────────────────────────────────────────

export type ReadResult = { frames: { id: string; frame: string }[]; state: StreamState | null };

/**
 * Tail the log from `lastId` (exclusive) AND read the terminal state in ONE
 * pipeline (§15.3). `lastId === "-"` reads from the start (full replay); the
 * exclusive `(lastId` form thereafter never re-emits a seen frame.
 */
export async function readSince(
    redis: Redis,
    userKey: string,
    sid: string,
    lastId: string,
): Promise<ReadResult> {
    const k = keys(userKey, sid);
    const start = lastId === "-" ? "-" : `(${lastId}`;
    const res = await redis
        .pipeline()
        .xrange(k.chunks, start, "+", 500)
        .get<string | null>(k.state)
        .exec();

    const state = (res[1] as StreamState | null) ?? null;

    // XRANGE returns ascending id order; with autoDeser=false the entries arrive as
    // `[[id, [f, value, …]], …]` (real Upstash), which toStreamEntries/fieldValue
    // normalise (also tolerating the keyed-object form).
    const frames: { id: string; frame: string }[] = [];
    for (const [id, fields] of toStreamEntries(res[0])) {
        const frame = fieldValue(fields, FRAME_FIELD);
        if (typeof frame === "string") frames.push({ id, frame });
    }
    return { frames, state };
}

// ── Abort side ────────────────────────────────────────────────────────

/** Set the cross-isolate cancel signal on the owner's key (self-expires, §5). */
export async function requestAbort(redis: Redis, userKey: string, sid: string): Promise<void> {
    const k = keys(userKey, sid);
    await redis.set(k.abort, "1", { ex: ABORT_TTL_S });
}

/** Standalone abort check — watcher fallback only; the flush path folds this in (§15.6). */
export async function isAbortRequested(redis: Redis, userKey: string, sid: string): Promise<boolean> {
    const k = keys(userKey, sid);
    const v = await redis.get<string | null>(k.abort);
    return v === "1";
}

/** Read the stream's owner/meta for the resume/stop ownership re-check (§15.1). */
export async function readMeta(redis: Redis, userKey: string, sid: string): Promise<StreamMeta | null> {
    const k = keys(userKey, sid);
    // autoDeser=false → HGETALL returns a flat `[f, v, …]` array; normalise it.
    const obj = fieldsToObject(await redis.hgetall(k.meta));
    if (!obj || !obj.userId) return null;
    return {
        conversationId: obj.conversationId,
        userId: obj.userId,
        messageId: obj.messageId,
        model: obj.model,
    };
}
