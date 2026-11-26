import { createContext, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useIsRestoring, useQueryClient, type Query } from "@tanstack/react-query";
import { startupMark, startupRoute } from "../../lib/startup-timing";

const SLOW_START_MS = 4_000;
export const StartupRenderContext = createContext<(change: number) => void>(() => undefined);
export const StartupReadyContext = createContext(true);

type QueryKey = readonly unknown[];
type StartupRoute = ReturnType<typeof startupRoute>;

const NEVER_GATES = new Set([
    "weather",
    "location",
    "holidays",
    "holiday-subdivisions",
    "holiday-country-options",
    "ai",
    "admin-capabilities",
]);
const OPTIONAL_DOMAINS = new Set(["appearance"]);

const filtersOf = (key: QueryKey) =>
    typeof key[1] === "object" && key[1] !== null ? (key[1] as Record<string, unknown>) : {};
const isSettingsRow = (key: QueryKey) => key[0] === "settings" && key.length === 2;
const isDomain = (key: QueryKey, ...domains: string[]) => domains.includes(String(key[0]));

const FIRST_SCREEN: Partial<Record<StartupRoute, (key: QueryKey) => boolean>> = {
    capture: (key) =>
        isSettingsRow(key) ||
        isDomain(key, "inbox", "projects", "tags", "subtasks") ||
        (key[0] === "tasks" && filtersOf(key).hasNoDate === true && filtersOf(key).hasNoProject === true),
    list: (key) =>
        isSettingsRow(key) ||
        isDomain(key, "projects", "tags", "sections", "subtasks") ||
        (key[0] === "tasks" && typeof filtersOf(key).projectId === "string") ||
        (key[0] === "habits" && key[1] === "weekly"),
};

function gatesStartup(route: StartupRoute, key: QueryKey) {
    if (NEVER_GATES.has(String(key[0])) || (key[0] === "settings" && !isSettingsRow(key))) return false;
    if (OPTIONAL_DOMAINS.has(String(key[0]))) return true;
    return FIRST_SCREEN[route]?.(key) ?? true;
}

function needsInitialData(query: Query) {
    return query.isActive() && query.state.data === undefined;
}

export function useWorkspaceStartup(enabled: boolean, pathname: string) {
    const client = useQueryClient();
    const cache = client.getQueryCache();
    const restoring = useIsRestoring();
    const [complete, setComplete] = useState(false);
    const [slow, setSlow] = useState(false);
    const [pendingChunks, setPendingChunks] = useState(0);
    const trackRender = useCallback((change: number) => setPendingChunks((count) => count + change), []);

    const route = startupRoute(pathname);
    const blockers = useCallback(() => {
        const queries = cache.getAll();
        const hasSavedWorkspace = queries.some(
            (query) =>
                query.state.data !== undefined &&
                gatesStartup(route, query.queryKey) &&
                !OPTIONAL_DOMAINS.has(String(query.queryKey[0])),
        );
        return queries.filter(
            (query) =>
                needsInitialData(query) &&
                gatesStartup(route, query.queryKey) &&
                !(hasSavedWorkspace && query.state.fetchStatus === "paused") &&
                !(OPTIONAL_DOMAINS.has(String(query.queryKey[0])) && (slow || query.state.status === "error")),
        );
    }, [cache, route, slow]);
    const subscribe = useCallback((onChange: () => void) => cache.subscribe(onChange), [cache]);
    const snapshot = useCallback(() => {
        if (!enabled || complete) return "ready";
        const queries = blockers();
        if (queries.some((query) => query.state.fetchStatus === "paused")) return "offline";
        if (queries.some((query) => query.state.status === "error" && query.state.fetchStatus === "idle"))
            return "error";
        return queries.length ? "pending" : "ready";
    }, [blockers, complete, enabled]);
    const state = useSyncExternalStore(subscribe, snapshot, () => "pending");
    const progressOf = useCallback(() => {
        const unknown = pendingChunks + (restoring ? 1 : 0);
        const total =
            cache.getAll().filter((query) => query.isActive() && gatesStartup(route, query.queryKey)).length + unknown;
        return total ? 1 - (blockers().length + unknown) / total : 0;
    }, [blockers, cache, pendingChunks, restoring, route]);
    const progress = useSyncExternalStore(subscribe, progressOf, () => 0);

    useEffect(() => {
        if (!enabled || complete) return;
        const timer = window.setTimeout(() => setSlow(true), SLOW_START_MS);
        return () => window.clearTimeout(timer);
    }, [complete, enabled]);

    useEffect(() => {
        if (!enabled || complete || restoring || pendingChunks > 0 || state !== "ready") return;
        let frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => {
                if (blockers().length === 0) {
                    startupMark("required_data.ready");
                    setComplete(true);
                }
            });
        });
        return () => cancelAnimationFrame(frame);
    }, [blockers, complete, enabled, pendingChunks, restoring, state]);

    const retry = useCallback(() => {
        void client.refetchQueries({ predicate: needsInitialData, type: "active" });
    }, [client]);

    return { pending: enabled && !complete, state, progress, slow, retry, trackRender };
}
