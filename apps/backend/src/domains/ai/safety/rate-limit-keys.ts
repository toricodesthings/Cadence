/**
 * Redis key builders + window/TTL constants for the AI usage budget
 * (docs/Update 4/06-16-2026_ai-rate-limiting-and-abuse-protection-plan.md §5).
 *
 * Keys are TENANT-SCOPED, identical convention to the resumption chunk-log
 * (`stream-keys.ts`): `cadence:ai:rl:{userKey}:…`, where `userKey = sha256(userId)`
 * (via `hashIdentifier`). A request can only ever build keys under its own
 * `userKey`, so one user can neither read nor spend another's budget (§15.1).
 *
 * The budget is two rolling windows (5h + 1week) × two dimensions (requests +
 * tokens), plus an in-flight concurrency counter. Admission and settlement each run
 * as ONE atomic `EVAL` (1 billed command), so there is no separate settle marker:
 * `onFinish` is the sole settler and fires exactly once per stream (§9.1).
 */
export const RL_NS = "cadence:ai:rl";

/** Fixed-window lengths, anchored at first write via `EXPIRE … NX` (§5). */
export const WINDOW_5H_S = 5 * 60 * 60;
export const WINDOW_7D_S = 7 * 24 * 60 * 60;

/** Safety TTL on the concurrency counter — self-heals a crashed isolate that never
 *  settled. Sized just above `STREAM_TIMEOUT_MS` (45s) so a real in-flight turn
 *  never lets its slot expire underneath it. */
export const INFLIGHT_TTL_S = 90;

export type Window = "5h" | "7d";
export type Dimension = "req" | "tok";

export type RlKeys = {
    req5h: string;
    tok5h: string;
    req7d: string;
    tok7d: string;
    inflight: string;
};

/**
 * Build the tenant-scoped budget keys for one user. Mirrors `stream-keys.ts`:
 * the owner is baked into the key, so keys can't cross tenants (§15.1). These are
 * the only keys the Lua scripts touch (passed as `KEYS[]`), so a script can never
 * address another tenant's budget.
 */
export const rlKeys = (userKey: string): RlKeys => {
    const base = `${RL_NS}:${userKey}`;
    return {
        req5h: `${base}:5h:req`,
        tok5h: `${base}:5h:tok`,
        req7d: `${base}:7d:req`,
        tok7d: `${base}:7d:tok`,
        inflight: `${base}:inflight`,
    };
};
