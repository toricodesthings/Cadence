export const STREAM_NS = "cadence:ai:stream";

export const CHUNKS_TTL_S = 5 * 60;
export const CLOSE_GRACE_S = 60;
export const ABORT_TTL_S = 60 * 10;
export const STREAM_MAXLEN = 5000;

export const FRAME_FIELD = "f";

export type StreamKeys = {
    chunks: string;
    state: string;
    abort: string;
    meta: string;
};

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
