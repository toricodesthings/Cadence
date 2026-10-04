import { STARTUP_ROUTES, type PerformanceSample } from "@cadence/contracts/events";

type Phase = PerformanceSample["phase"];
const marks = new Map<string, number>();
const reads: Array<{ duration_ms: number; category: PerformanceSample["category"]; outcome: PerformanceSample["outcome"] }> = [];
let finished = false;

/** Local fixed-name marks only. Delivery is gated separately by account settings. */
export function startupMark(name: `${Exclude<Phase, "api">}.${"start" | "ready"}`) {
    if (typeof window === "undefined" || marks.has(name) || finished) return;
    const time = performance.now();
    marks.set(name, time);
    performance.mark?.(`cadence.startup.${name}`);
}

export function resetStartupTiming(collect = true) {
    for (const name of marks.keys()) performance.clearMarks?.(`cadence.startup.${name}`);
    marks.clear();
    reads.length = 0;
    finished = !collect;
}

export function recordStartupRead(category: PerformanceSample["category"], start: number, outcome: PerformanceSample["outcome"]) {
    if (!finished && !marks.has("reveal.ready") && reads.length < 30) reads.push({ category, duration_ms: performance.now() - start, outcome });
}

export function startupRoute(path: string): PerformanceSample["route"] {
    if (path === "/") return "capture";
    const first = path.split("/")[1];
    if (first === "project") return "list";
    if (first === "weekly-review") return "weekly_reset";
    return (STARTUP_ROUTES as readonly string[]).includes(first)
        ? first as PerformanceSample["route"] : "other";
}

export function startupFailureSample(context: Pick<PerformanceSample, "route" | "platform" | "viewport" | "cache">, outcome: "error" | "network_unavailable"): PerformanceSample | null {
    const now = performance.now();
    if (finished || now > 600_000) return null;
    return { ...context, phase: "required_data", outcome, category: "workspace", count: 0, encoded_bytes: 0, decoded_bytes: 0,
        duration_ms: Math.round(Math.min(600_000, now - (marks.get("required_data.start") ?? 0))), elapsed_ms: Math.round(Math.min(600_000, now)) };
}

export function collectStartupSamples(context: Pick<PerformanceSample, "route" | "platform" | "viewport" | "cache">): PerformanceSample[] {
    if (finished) return [];
    // This metric is navigation startup, not an account switch hours into a tab.
    if ((marks.get("reveal.ready") ?? performance.now()) > 600_000) { finished = true; return []; }
    const samples: PerformanceSample[] = [];
    const add = (phase: Phase, start: number, end: number, count = 0, encoded_bytes = 0, decoded_bytes = 0) => {
        if (end < start || end > 600_000) return;
        samples.push({ ...context, phase, duration_ms: Math.round(end - start), elapsed_ms: Math.round(end), outcome: "ready", category: "workspace", count, encoded_bytes, decoded_bytes });
        performance.measure?.(`cadence.startup.${phase}`, { start, end });
    };
    for (const phase of ["session", "restore", "jwt", "required_data", "chunks", "visible_assets"] as const) {
        const end = marks.get(`${phase}.ready`);
        if (end !== undefined) add(phase, marks.get(`${phase}.start`) ?? 0, end);
    }
    const reveal = marks.get("reveal.ready");
    if (reveal !== undefined) {
        const resources = (performance.getEntriesByType?.("resource") ?? []) as PerformanceResourceTiming[];
        const js = resources.filter((r) => r.startTime <= reveal && (r.initiatorType === "script" || /\/assets\/[^?]+\.js(?:\?|$)/.test(r.name)));
        add("reveal", 0, reveal, js.length, Math.round(js.reduce((n, r) => n + r.encodedBodySize, 0)), Math.round(js.reduce((n, r) => n + r.decodedBodySize, 0)));
    }
    for (const read of reads.filter((r) => r.duration_ms >= 0 && r.duration_ms <= 600_000)) samples.push({ ...context, ...read, phase: "api", elapsed_ms: Math.round(reveal ?? performance.now()), duration_ms: Math.round(read.duration_ms), count: 1, encoded_bytes: 0, decoded_bytes: 0 });
    finished = true;
    return samples;
}
