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

function fieldsToObject(raw: unknown): Record<string, string> | null {
    if (!raw) return null;
    if (Array.isArray(raw)) {
        const out: Record<string, string> = {};
        for (let i = 0; i + 1 < raw.length; i += 2) {
            if (typeof raw[i] === "string" && typeof raw[i + 1] === "string")
                out[raw[i] as string] = raw[i + 1] as string;
        }
        return Object.keys(out).length ? out : null;
    }
    if (typeof raw === "object") return raw as Record<string, string>;
    return null;
}

function toStreamEntries(range: unknown): Array<[string, unknown]> {
    if (Array.isArray(range)) {
        return range
            .filter((e): e is [string, unknown] => Array.isArray(e) && typeof e[0] === "string")
            .map((e) => [e[0], e[1]] as [string, unknown]);
    }
    if (range && typeof range === "object") {
        return Object.entries(range as Record<string, unknown>);
    }
    return [];
}

export async function openStream(redis: Redis, userKey: string, sid: string, meta: StreamMeta): Promise<void> {
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

export async function flushChunks(
    redis: Redis,
    userKey: string,
    sid: string,
    blob: string,
): Promise<{ abortRequested: boolean }> {
    const k = keys(userKey, sid);
    const res = await redis
        .pipeline()
        .xadd(
            k.chunks,
            "*",
            { [FRAME_FIELD]: blob },
            {
                trim: { type: "MAXLEN", threshold: STREAM_MAXLEN, comparison: "~" },
            },
        )
        .expire(k.chunks, CHUNKS_TTL_S)
        .expire(k.state, CHUNKS_TTL_S)
        .get<string | null>(k.abort)
        .exec();

    const abort = res[res.length - 1] as string | null;
    return { abortRequested: abort === "1" };
}

export async function closeStream(redis: Redis, userKey: string, sid: string, state: StreamState): Promise<void> {
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

export type ReadResult = { frames: { id: string; frame: string }[]; state: StreamState | null };

export async function readSince(redis: Redis, userKey: string, sid: string, lastId: string): Promise<ReadResult> {
    const k = keys(userKey, sid);
    const start = lastId === "-" ? "-" : `(${lastId}`;
    const res = await redis.pipeline().xrange(k.chunks, start, "+", 500).get<string | null>(k.state).exec();

    const state = (res[1] as StreamState | null) ?? null;

    const frames: { id: string; frame: string }[] = [];
    for (const [id, fields] of toStreamEntries(res[0])) {
        const frame = fieldValue(fields, FRAME_FIELD);
        if (typeof frame === "string") frames.push({ id, frame });
    }
    return { frames, state };
}

export async function requestAbort(redis: Redis, userKey: string, sid: string): Promise<void> {
    const k = keys(userKey, sid);
    await redis.set(k.abort, "1", { ex: ABORT_TTL_S });
}

export async function isAbortRequested(redis: Redis, userKey: string, sid: string): Promise<boolean> {
    const k = keys(userKey, sid);
    const v = await redis.get<string | null>(k.abort);
    return v === "1";
}

export async function readMeta(redis: Redis, userKey: string, sid: string): Promise<StreamMeta | null> {
    const k = keys(userKey, sid);
    const obj = fieldsToObject(await redis.hgetall(k.meta));
    if (!obj || !obj.userId) return null;
    return {
        conversationId: obj.conversationId,
        userId: obj.userId,
        messageId: obj.messageId,
        model: obj.model,
    };
}
