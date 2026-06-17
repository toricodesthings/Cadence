/**
 * Redis key builders + TTL constants for the AI stream resumption chunk-log.
 *
 * Keys are TENANT-SCOPED: `cadence:ai:stream:{userKey}:{streamId}`, where
 * `userKey = sha256(userId)` (via `hashIdentifier`) and `streamId` is a fresh,
 * unguessable `generateId()` minted per turn. Binding the owner into the key is
 * defense-in-depth tenant isolation (doc Update 4 §15.1): even a guessed/colliding
 * `streamId` cannot address another user's keys, on top of the RLS ownership
 * check that gates every endpoint.
 */
export const STREAM_NS = "cadence:ai:stream";

/** TTL while a stream is `active` — refreshed on each flush so long turns never expire mid-flight. */
export const CHUNKS_TTL_S = 60 * 60; // 1h
/** TTL the keys are shrunk to on terminal close, so Redis self-evicts the turn ~1min later (§15.2). */
export const CLOSE_GRACE_S = 60;
/** TTL on the abort flag, so a never-consumed flag self-clears (§5). */
export const ABORT_TTL_S = 60 * 10; // 10m
/** Runaway guard for the chunk stream — sized above the worst-case full turn (§15.3). */
export const STREAM_MAXLEN = 5000;

/** Field name carrying the coalesced SSE blob inside each stream entry. */
export const FRAME_FIELD = "f";

export type StreamKeys = {
    chunks: string;
    state: string;
    abort: string;
    meta: string;
};

/**
 * Build the four tenant-scoped keys for a stream. A request can only ever build
 * keys under its own `userKey`, so keys can't cross tenants (§15.1).
 */
export const keys = (userKey: string, sid: string): StreamKeys => {
    const base = `${STREAM_NS}:${userKey}:${sid}`;
    return {
        chunks: `${base}:chunks`,
        state: `${base}:state`,
        abort: `${base}:abort`,
        meta: `${base}:meta`,
    };
};

export type StreamState = "active" | "done" | "aborted" | "error";
