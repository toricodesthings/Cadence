/**
 * In-memory fake of the @upstash/redis client surface used by the AI stream
 * resumption modules. Map-backed; supports the exact command subset the
 * resume-store / replay / abort paths exercise, plus an explicit `pipeline()`
 * whose `.exec()` returns results in command order (one "request" per exec).
 *
 * Instrumentation: `requests` counts round-trips (each direct call + each
 * `pipeline().exec()`), and `commandLog` records command names — both let the
 * perf tests assert write minimization.
 */
export type StreamEntry = { id: string; fields: Record<string, string> };

type SetOpts = { ex?: number };
type ExpireOpt = "NX";

export class FakeRedis {
    strings = new Map<string, string>();
    hashes = new Map<string, Record<string, string>>();
    streams = new Map<string, StreamEntry[]>();
    /** Key → expiry epoch (ms). Lets `pttl` return a real countdown so the rate-limit
     *  budget's anchor-on-first-write / reset-epoch logic is exercisable (§5). */
    ttls = new Map<string, number>();
    /** Round-trips: incremented per direct call and per pipeline exec. */
    requests = 0;
    /** Flat list of every command issued (direct or pipelined), in order. */
    commandLog: string[] = [];

    private seq = 0;

    private nextId(): string {
        this.seq += 1;
        // Monotonic; ordering is tracked by array position so format is irrelevant.
        return `${Date.now()}-${this.seq}`;
    }

    private _exists(key: string): boolean {
        return this.strings.has(key) || this.hashes.has(key) || this.streams.has(key);
    }

    // ── internal command implementations (no request accounting) ──
    private _set(key: string, val: unknown, opts?: SetOpts): "OK" {
        this.strings.set(key, String(val));
        if (typeof opts?.ex === "number") this.ttls.set(key, Date.now() + opts.ex * 1000);
        return "OK";
    }
    private _get(key: string): string | null {
        return this.strings.has(key) ? this.strings.get(key)! : null;
    }
    private _del(key: string): number {
        const had = this.strings.delete(key) || this.hashes.delete(key) || this.streams.delete(key);
        this.ttls.delete(key);
        return had ? 1 : 0;
    }
    /** INCRBY — counters default to 0, mirroring Redis. */
    private _incrby(key: string, by: number): number {
        const cur = Number(this.strings.get(key) ?? "0");
        const next = (Number.isFinite(cur) ? cur : 0) + by;
        this.strings.set(key, String(next));
        return next;
    }
    /** EXPIRE with optional NX flag; anchors the window on first write (§5). */
    private _expire(key: string, ttl: number, opt?: ExpireOpt): 0 | 1 {
        if (!this._exists(key)) return 0;
        if (opt === "NX" && this.ttls.has(key)) return 0;
        this.ttls.set(key, Date.now() + ttl * 1000);
        return 1;
    }
    /** PTTL in ms: -2 no key, -1 no TTL, else remaining ms. */
    private _pttl(key: string): number {
        if (!this._exists(key)) return -2;
        const exp = this.ttls.get(key);
        if (exp === undefined) return -1;
        return Math.max(0, exp - Date.now());
    }

    // ── Lua-script twins (mirror the real EVAL scripts in rate-limit.ts) ──
    // The fake runs a JS twin of each script against the SAME backing store, so unit
    // tests exercise the real admit/settle code paths without a live Redis. Kept in
    // lock-step with the Lua by the matching @cadence:ai:rl markers.
    private _evalAdmit(keys: string[], argv: Array<string | number>): unknown[] {
        const [kr5, kr7, kt5, kt7, kinf, kimg] = keys;
        const n = (v: string | number) => Number(v);
        const reserve = n(argv[0]);
        const lr5 = n(argv[1]), lt5 = n(argv[2]), lr7 = n(argv[3]), lt7 = n(argv[4]), lc = n(argv[5]);
        const w5 = n(argv[6]), w7 = n(argv[7]), infttl = n(argv[8]);
        const imgs = n(argv[9]), li = n(argv[10]), w24 = n(argv[11]);
        const cur = (k: string) => Number(this.strings.get(k) ?? "0");
        const r5 = cur(kr5), r7 = cur(kr7), t5 = cur(kt5), t7 = cur(kt7), inf = cur(kinf);
        let i = cur(kimg);
        let p5 = this._pttl(kr5), p7 = this._pttl(kr7), pi = this._pttl(kimg);
        const used = [r5, t5, r7, t7, p5, p7, i, pi];
        if (inf + 1 > lc) return [0, "concurrency", "5h", ...used];
        if (r5 + 1 > lr5) return [0, "req", "5h", ...used];
        if (t5 + reserve > lt5) return [0, "tok", "5h", ...used];
        if (r7 + 1 > lr7) return [0, "req", "7d", ...used];
        if (t7 + reserve > lt7) return [0, "tok", "7d", ...used];
        if (imgs > 0 && i + imgs > li) return [0, "img", "24h", ...used];
        this._incrby(kr5, 1); this._expire(kr5, w5, "NX");
        this._incrby(kr7, 1); this._expire(kr7, w7, "NX");
        this._incrby(kt5, reserve); this._expire(kt5, w5, "NX");
        this._incrby(kt7, reserve); this._expire(kt7, w7, "NX");
        this._incrby(kinf, 1); this._expire(kinf, infttl);
        if (imgs > 0) {
            this._incrby(kimg, imgs); this._expire(kimg, w24, "NX");
            i += imgs;
            pi = this._pttl(kimg);
        }
        p5 = this._pttl(kr5); p7 = this._pttl(kr7);
        return [1, "", "", r5 + 1, t5 + reserve, r7 + 1, t7 + reserve, p5, p7, i, pi];
    }
    private _evalSettle(keys: string[], argv: Array<string | number>): number {
        const [kt5, kt7, kinf] = keys;
        const delta = Number(argv[0]);
        this._incrby(kt5, delta);
        this._incrby(kt7, delta);
        const inf = this._incrby(kinf, -1);
        if (inf < 0) this.strings.set(kinf, "0");
        return 1;
    }
    private _hset(key: string, kv: Record<string, unknown>): number {
        const cur = this.hashes.get(key) ?? {};
        for (const [k, v] of Object.entries(kv)) cur[k] = String(v);
        this.hashes.set(key, cur);
        return Object.keys(kv).length;
    }
    private _hgetall(key: string): string[] | null {
        // Mirror real Upstash with automaticDeserialization=false: HGETALL returns
        // a FLAT [field, value, field, value, …] array, not a keyed object.
        const obj = this.hashes.get(key);
        if (!obj) return null;
        const flat: string[] = [];
        for (const [k, v] of Object.entries(obj)) flat.push(k, v);
        return flat;
    }
    private _xadd(key: string, _id: string, entries: Record<string, unknown>): string {
        const id = this.nextId();
        const fields: Record<string, string> = {};
        for (const [k, v] of Object.entries(entries)) fields[k] = String(v);
        const arr = this.streams.get(key) ?? [];
        arr.push({ id, fields });
        this.streams.set(key, arr);
        return id;
    }
    private _xrange(key: string, start: string, _end: string, count?: number): Array<[string, string[]]> {
        const entries = this.streams.get(key) ?? [];
        let startIdx = 0;
        if (start !== "-") {
            const exclusiveId = start.startsWith("(") ? start.slice(1) : start;
            const idx = entries.findIndex((e) => e.id === exclusiveId);
            startIdx = idx >= 0 ? idx + 1 : entries.length;
        }
        let slice = entries.slice(startIdx);
        if (count !== undefined) slice = slice.slice(0, count);
        // Mirror real Upstash with automaticDeserialization=false: XRANGE returns
        // [[id, [field, value, …]], …], not a keyed object.
        return slice.map((e) => {
            const flat: string[] = [];
            for (const [k, v] of Object.entries(e.fields)) flat.push(k, v);
            return [e.id, flat] as [string, string[]];
        });
    }

    // ── direct (single round-trip) methods ──
    async set(key: string, val: unknown, opts?: SetOpts): Promise<"OK"> {
        this.requests += 1;
        this.commandLog.push("set");
        return this._set(key, val, opts);
    }
    async get<T = string | null>(key: string): Promise<T> {
        this.requests += 1;
        this.commandLog.push("get");
        return this._get(key) as unknown as T;
    }
    async pttl(key: string): Promise<number> {
        this.requests += 1;
        this.commandLog.push("pttl");
        return this._pttl(key);
    }
    /** EVAL — one billed command/round-trip; dispatches to the script twin by marker. */
    async eval(script: string, keys: string[], argv: Array<string | number>): Promise<unknown> {
        this.requests += 1;
        this.commandLog.push("eval");
        if (script.includes("@cadence:ai:rl:admit")) return this._evalAdmit(keys, argv);
        if (script.includes("@cadence:ai:rl:settle")) return this._evalSettle(keys, argv);
        throw new Error("FakeRedis.eval: unrecognized script");
    }
    async hgetall<T = Record<string, string>>(key: string): Promise<T | null> {
        this.requests += 1;
        this.commandLog.push("hgetall");
        return this._hgetall(key) as unknown as T | null;
    }
    async ping(): Promise<string> {
        this.requests += 1;
        this.commandLog.push("ping");
        return "PONG";
    }

    // ── pipeline ──
    pipeline() {
        const ops: Array<() => unknown> = [];
        const self = this;
        const p = {
            hset(key: string, kv: Record<string, unknown>) {
                self.commandLog.push("hset");
                ops.push(() => self._hset(key, kv));
                return p;
            },
            set(key: string, val: unknown, opts?: SetOpts) {
                self.commandLog.push("set");
                ops.push(() => self._set(key, val, opts));
                return p;
            },
            get(key: string) {
                self.commandLog.push("get");
                ops.push(() => self._get(key));
                return p;
            },
            del(key: string) {
                self.commandLog.push("del");
                ops.push(() => self._del(key));
                return p;
            },
            expire(key: string, ttl: number, opt?: ExpireOpt) {
                self.commandLog.push("expire");
                ops.push(() => self._expire(key, ttl, opt));
                return p;
            },
            pttl(key: string) {
                self.commandLog.push("pttl");
                ops.push(() => self._pttl(key));
                return p;
            },
            xadd(key: string, id: string, entries: Record<string, unknown>, _opts?: unknown) {
                self.commandLog.push("xadd");
                ops.push(() => self._xadd(key, id, entries));
                return p;
            },
            xrange(key: string, start: string, end: string, count?: number) {
                self.commandLog.push("xrange");
                ops.push(() => self._xrange(key, start, end, count));
                return p;
            },
            async exec() {
                self.requests += 1;
                return ops.map((op) => op());
            },
        };
        return p;
    }
}
