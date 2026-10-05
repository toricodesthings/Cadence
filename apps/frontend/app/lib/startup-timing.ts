import { CADENCE_BUILD_ID, CADENCE_VERSION } from "./constants/app-info";
import { STARTUP_ROUTES, type PerformanceSample } from "@cadence/contracts/events";

type Phase = PerformanceSample["phase"];
const marks = new Map<string, number>();
export type ReadDetails = Pick<PerformanceSample, "endpoint" | "status" | "error_code">;
const reads: Array<ReadDetails & { phase: "api" | "api_body"; elapsed_ms: number; duration_ms: number; category: PerformanceSample["category"]; outcome: PerformanceSample["outcome"] }> = [];
const cohort = { measurement_revision: 2 as const, build_id: CADENCE_BUILD_ID, version: CADENCE_VERSION, endpoint: "workspace" as const };
let finished = false;

/** Local fixed-name marks only. Delivery is gated separately by account settings. */
export function startupMark(name: `${Exclude<Phase, "api" | "api_body">}.${"start" | "ready"}`) {
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

/** True until reveal (or a disabled/finished collection): after that, reads aren't measured. */
export const startupCollecting = () => !finished && !marks.has("reveal.ready");

// A delivery batch holds 50 samples: nine phases, 30 headers reads (the legacy cap) and 11 bodies.
const READ_CAPS = { api: 30, api_body: 11 };

export function recordStartupRead(category: PerformanceSample["category"], start: number, outcome: PerformanceSample["outcome"], details: ReadDetails = {}, phase: "api" | "api_body" = "api") {
    const end = performance.now();
    if (startupCollecting() && reads.filter((r) => r.phase === phase).length < READ_CAPS[phase]) {
        reads.push({ ...details, phase, category, duration_ms: end - start, elapsed_ms: end, outcome });
        performance.measure?.(`cadence.startup.${phase}.${details.endpoint ?? category}`, { start, end });
    }
}

const EXACT_ENDPOINTS: Record<string, PerformanceSample["endpoint"]> = {
    "/debug/capabilities": "debug_capabilities", "/tasks/batch": "tasks_batch", "/settings": "settings",
    "/settings/notification-state": "notification_state", "/settings/background": "appearance",
    "/habits": "habits", "/habits/weekly": "habits_range", "/projects": "projects", "/tags": "tags",
};

/** Never retain URLs, task IDs or arbitrary query predicates in diagnostic dimensions. */
export function startupEndpoint(url: URL): PerformanceSample["endpoint"] {
    const path = url.pathname.replace(/^\/api\/v1/, "").replace(/(.)\/$/, "$1");
    if (path === "/tasks") {
        if (["COMPLETE", "ARCHIVED"].includes(url.searchParams.get("state") ?? "")) return "tasks_history";
        if (url.searchParams.has("scheduledDate") || url.searchParams.has("scheduledRangeStart")) return "tasks_schedule";
        if (url.searchParams.get("hasNoDate") === "true" && url.searchParams.get("hasNoProject") === "true") return "tasks_capture";
        return "tasks_open";
    }
    if (path === "/inbox") return url.searchParams.get("status") === "kept" ? "inbox_kept" : "inbox_clarifying";
    if (EXACT_ENDPOINTS[path]) return EXACT_ENDPOINTS[path];
    if (/^\/tasks\/[^/]+$/.test(path)) return "task_detail";
    if (path.startsWith("/settings/focus-views")) return "focus_views";
    if (path.startsWith("/proxy/")) return "proxy";
    return path.includes("/subtasks") ? "subtasks" : "other";
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
    return { ...context, ...cohort, phase: "required_data", outcome, category: "workspace", count: 0, encoded_bytes: 0, decoded_bytes: 0,
        duration_ms: Math.round(Math.min(600_000, now - (marks.get("required_data.start") ?? 0))), elapsed_ms: Math.round(Math.min(600_000, now)) };
}

export function collectStartupSamples(context: Pick<PerformanceSample, "route" | "platform" | "viewport" | "cache">): PerformanceSample[] {
    if (finished) return [];
    // This metric is navigation startup, not an account switch hours into a tab.
    if ((marks.get("reveal.ready") ?? performance.now()) > 600_000) { finished = true; return []; }
    const samples: PerformanceSample[] = [];
    const add = (phase: Phase, start: number, end: number, count = 0, encoded_bytes = 0, decoded_bytes = 0) => {
        if (end < start || end > 600_000) return;
        samples.push({ ...context, ...cohort, phase, duration_ms: Math.round(end - start), elapsed_ms: Math.round(end), outcome: "ready", category: "workspace", count, encoded_bytes, decoded_bytes });
        performance.measure?.(`cadence.startup.${phase}`, { start, end });
    };
    for (const phase of ["session", "restore", "jwt", "required_data", "chunks", "visible_assets", "hydrate", "reveal_frame"] as const) {
        const end = marks.get(`${phase}.ready`);
        if (end !== undefined) add(phase, marks.get(`${phase}.start`) ?? 0, end);
    }
    const reveal = marks.get("reveal.ready");
    if (reveal !== undefined) {
        const resources = (performance.getEntriesByType?.("resource") ?? []) as PerformanceResourceTiming[];
        const js = resources.filter((r) => r.startTime <= reveal && (r.initiatorType === "script" || /\/assets\/[^?]+\.js(?:\?|$)/.test(r.name)));
        add("reveal", 0, reveal, js.length, Math.round(js.reduce((n, r) => n + r.encodedBodySize, 0)), Math.round(js.reduce((n, r) => n + r.decodedBodySize, 0)));
    }
    for (const read of reads.filter((r) => r.duration_ms >= 0 && r.duration_ms <= 600_000)) samples.push({ ...context, ...cohort, ...read, elapsed_ms: Math.round(read.phase === "api" ? reveal ?? performance.now() : read.elapsed_ms), duration_ms: Math.round(read.duration_ms), count: 1, encoded_bytes: 0, decoded_bytes: 0 });
    finished = true;
    return samples;
}
